import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decryptPhotoUrl, decryptDiagnosticAttachments, encryptPhotoUrl, encryptDiagnosticAttachments, CLINIC_APP_HANDSHAKE_TOKEN } from '../utils/cryptoUtils.ts';
import { normalizePhoneWithZero } from '../utils/phoneUtils.ts';
import { normalizeCageId, sanitizeCagesList } from '../utils/cageUtils.ts';
import { normalizePetType, getPetTypeIndonesian } from '../utils/petUtils.ts';
import { isToday, sortOwnersNewestFirst, sortPetsNewestFirst, sortSoapNewestFirst } from '../utils/dateUtils.ts';
import { migrateStaffPasswordsInPlace, hashPassword } from './authTokens.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'clinic_database.json');
const ARCHIVE_SOAP_FILE = path.join(DATA_DIR, 'clinic_archive_soap.json');
const CONFIG_FILE = path.join(DATA_DIR, 'sync_config.json');

export const DEFAULT_WEB_APP_URL =
  process.env.GOOGLE_SCRIPT_URL ||
  process.env.SPREADSHEET_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbzFrZZxwmkW92bZw_5Ugg0UyVUYLonxP7jWVc77QU_SeBnjjmCqxkveeLhChIsDdt9V/exec';

export interface ServerSyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  counts: Record<string, number>;
  version: number;
  lastError: string | null;
  webAppUrl: string;
}

export interface ClinicDatabase {
  owners: any[];
  pets: any[];
  queues: any[];
  soapRecords: any[];
  cages: any[];
  inventory: any[];
  bookings: any[];
  staff: any[];
  feedbacks: any[];
  surgeries: any[];
}

const EMPTY_DATABASE: ClinicDatabase = {
  owners: [],
  pets: [],
  queues: [],
  soapRecords: [],
  cages: [],
  inventory: [],
  bookings: [],
  staff: [],
  feedbacks: [],
  surgeries: [],
};

class ServerSyncManager {
  private db: ClinicDatabase = { ...EMPTY_DATABASE };
  private archiveSoapRecords: any[] = []; // Storage dingin untuk rekam medis >2 tahun
  private webAppUrl: string = DEFAULT_WEB_APP_URL;
  private autoSync: boolean = true;
  private isSyncing: boolean = false;
  private lastSyncedAt: string | null = null;
  private version: number = 1;
  private lastError: string | null = null;
  private isConnected: boolean = false;
  private pollIntervalId: NodeJS.Timeout | null = null;
  private lastCounts: Record<string, number> = {};

  // High-performance In-Memory HashMap Indexes (O(1) lookups)
  private ownerMapById = new Map<string, any>();
  private ownerMapByWa = new Map<string, any>();
  private petMapById = new Map<string, any>();
  private petsByOwnerIdMap = new Map<string, any[]>();
  private petsByOwnerWaMap = new Map<string, any[]>();
  private soapsByPetIdMap = new Map<string, any[]>();

  constructor() {
    this.ensureDataDirectory();
    this.loadConfig();
    this.loadArchiveFromDisk();
    this.loadDatabaseFromDisk();
  }

  private ensureDataDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err: any) {
      console.error('[ServerSync] Gagal membuat direktori data:', err.message);
    }
  }

  private rebuildIndexes() {
    this.ownerMapById.clear();
    this.ownerMapByWa.clear();
    this.petMapById.clear();
    this.petsByOwnerIdMap.clear();
    this.petsByOwnerWaMap.clear();
    this.soapsByPetIdMap.clear();

    // Index Owners
    for (const owner of this.db.owners) {
      if (!owner) continue;
      if (owner.id) this.ownerMapById.set(String(owner.id), owner);
      if (owner.whatsapp) {
        const cleanWa = String(owner.whatsapp).replace(/\D/g, '');
        if (cleanWa) this.ownerMapByWa.set(cleanWa, owner);
      }
    }

    // Index Pets & Group by Owner with normalized species
    for (const pet of this.db.pets) {
      if (!pet) continue;
      pet.type = normalizePetType(pet.type, `${pet.name || ''} ${pet.breed || ''} ${pet.notes || ''}`);
      if (pet.id) this.petMapById.set(String(pet.id), pet);

      if (pet.ownerId) {
        const list = this.petsByOwnerIdMap.get(String(pet.ownerId)) || [];
        list.push(pet);
        this.petsByOwnerIdMap.set(String(pet.ownerId), list);
      }
      if (pet.ownerWhatsapp) {
        const cleanWa = String(pet.ownerWhatsapp).replace(/\D/g, '');
        if (cleanWa) {
          const list = this.petsByOwnerWaMap.get(cleanWa) || [];
          list.push(pet);
          this.petsByOwnerWaMap.set(cleanWa, list);
        }
      }
    }

    // Normalize Queues Pet Types
    for (const q of this.db.queues) {
      if (!q) continue;
      q.petType = normalizePetType(q.petType, `${q.petName || ''} ${q.chiefComplaint || ''}`);
    }

    // Index SOAP Records by Pet ID
    for (const soap of this.db.soapRecords) {
      if (!soap || !soap.petId) continue;
      const petIdStr = String(soap.petId);
      const list = this.soapsByPetIdMap.get(petIdStr) || [];
      list.push(soap);
      this.soapsByPetIdMap.set(petIdStr, list);
    }
  }

  private loadArchiveFromDisk() {
    try {
      if (fs.existsSync(ARCHIVE_SOAP_FILE)) {
        const raw = fs.readFileSync(ARCHIVE_SOAP_FILE, 'utf-8');
        this.archiveSoapRecords = JSON.parse(raw);
        console.log(`[ServerSync] Memuat arsip rekam medis dingin: ${this.archiveSoapRecords.length} record.`);
      }
    } catch (err: any) {
      console.warn('[ServerSync] Arsip SOAP tidak ditemukan, buat baru.', err.message);
      this.archiveSoapRecords = [];
    }
  }

  private saveArchiveToDisk() {
    try {
      this.ensureDataDirectory();
      const tmpFile = `${ARCHIVE_SOAP_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.archiveSoapRecords, null, 2), 'utf-8');
      fs.renameSync(tmpFile, ARCHIVE_SOAP_FILE);
    } catch (err: any) {
      console.error('[ServerSync] Gagal simpan arsip SOAP:', err.message);
    }
  }

  /**
   * Otomatis memindahkan SOAP >2 tahun (730 hari) ke arsip data dingin saat startup/sync
   */
  private partitionColdData() {
    const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const activeSoaps: any[] = [];
    let archivedCount = 0;

    for (const soap of this.db.soapRecords) {
      if (!soap || !soap.date) {
        activeSoaps.push(soap);
        continue;
      }
      const recordTime = new Date(soap.date).getTime();
      if (!isNaN(recordTime) && now - recordTime > TWO_YEARS_MS) {
        // Pindahkan ke arsip dingin jika belum ada
        if (!this.archiveSoapRecords.some((a) => String(a.id) === String(soap.id))) {
          this.archiveSoapRecords.push(soap);
          archivedCount++;
        }
      } else {
        activeSoaps.push(soap);
      }
    }

    const hasReduced = this.db.soapRecords.length !== activeSoaps.length;
    this.db.soapRecords = activeSoaps;

    if (archivedCount > 0) {
      this.saveArchiveToDisk();
      console.log(`[ServerSync] Berhasil mengarsip ${archivedCount} rekam medis >2 tahun ke cold storage.`);
    }

    if (hasReduced || archivedCount > 0) {
      this.saveDatabaseToDisk();
      console.log(`[ServerSync] Rekam medis aktif di memori: ${activeSoaps.length} record (arsip dingin: ${this.archiveSoapRecords.length}).`);
    }
  }

  private loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.webAppUrl) this.webAppUrl = parsed.webAppUrl;
        if (parsed.autoSync !== undefined) this.autoSync = parsed.autoSync;
      }
    } catch (err: any) {
      console.warn('[ServerSync] Gagal membaca config:', err.message);
    }
  }

  private saveConfig() {
    try {
      this.ensureDataDirectory();
      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify({ webAppUrl: this.webAppUrl, autoSync: this.autoSync }, null, 2),
        'utf-8'
      );
    } catch (err: any) {
      console.warn('[ServerSync] Gagal menyimpan config:', err.message);
    }
  }

  private loadDatabaseFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Backward scanning loop to auto-repair trailing corrupted bytes from legacy non-atomic writes
          let pos = raw.length;
          while (pos > 0) {
            const idx = raw.lastIndexOf('}', pos - 1);
            if (idx <= 0) break;
            try {
              parsed = JSON.parse(raw.slice(0, idx + 1));
              console.log('[ServerSync] Berhasil memulihkan data dari JSON terpotong.');
              break;
            } catch {
              pos = idx;
            }
          }
        }

        if (!parsed || typeof parsed !== 'object') {
          console.warn('[ServerSync] Cache disk tidak valid atau kosong.');
          return;
        }

        this.db = {
          owners: Array.isArray(parsed.owners) ? parsed.owners : [],
          pets: Array.isArray(parsed.pets) ? parsed.pets : [],
          queues: Array.isArray(parsed.queues) ? parsed.queues : [],
          soapRecords: Array.isArray(parsed.soapRecords) ? parsed.soapRecords : [],
          cages: Array.isArray(parsed.cages) ? parsed.cages : [],
          inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
          bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
          staff: Array.isArray(parsed.staff) ? parsed.staff : [],
          feedbacks: Array.isArray(parsed.feedbacks) ? parsed.feedbacks : [],
          surgeries: Array.isArray(parsed.surgeries) ? parsed.surgeries : [],
        };
        this.lastSyncedAt = parsed._lastSyncedAt || null;
        this.version = parsed._version || 1;
        this.isConnected = true;
        this.partitionColdData();
        this.rebuildIndexes();
        this.reconcileMissingOwnersAndPets();
        this.deduplicatePets();
        this.purgeUnattendedPastQueues();
        this.updateCounts();

        // Kata sandi staf dipertahankan apa adanya agar dapat dilihat dan dikelola oleh Super Admin

        console.log(`[ServerSync] Memuat cache disk: ${this.getTotalRecords()} total records.`);
      }
    } catch (err: any) {
      console.warn('[ServerSync] Cache disk kosong atau gagal dibaca:', err.message);
    }
  }

  private saveDatabaseToDisk() {
    try {
      this.ensureDataDirectory();
      const payload = {
        ...this.db,
        _lastSyncedAt: this.lastSyncedAt,
        _version: this.version,
        _counts: this.getCounts(),
      };
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err: any) {
      console.error('[ServerSync] Gagal serialisasi db:', err.message);
    }
  }

  private getAllSoaps(): any[] {
    const map = new Map<string, any>();
    for (const s of this.archiveSoapRecords) {
      if (s && s.id) map.set(String(s.id), s);
    }
    for (const s of this.db.soapRecords) {
      if (s && s.id) map.set(String(s.id), s);
    }
    return Array.from(map.values());
  }

  private updateCounts() {
    const totalUniqueSoaps = this.getAllSoaps().length;
    this.lastCounts = {
      owners: this.db.owners.length,
      pets: this.db.pets.length,
      queues: this.db.queues.length,
      soapRecords: totalUniqueSoaps,
      cages: this.db.cages.length,
      inventory: this.db.inventory.length,
      bookings: this.db.bookings.length,
      staff: this.db.staff.length,
      feedbacks: this.db.feedbacks.length,
      surgeries: (this.db.surgeries || []).length,
    };
  }

  public getCounts(): Record<string, number> {
    const totalUniqueSoaps = this.getAllSoaps().length;
    return {
      owners: this.db.owners.length,
      pets: this.db.pets.length,
      queues: this.db.queues.length,
      soapRecords: totalUniqueSoaps,
      cages: this.db.cages.length,
      inventory: this.db.inventory.length,
      bookings: this.db.bookings.length,
      staff: this.db.staff.length,
      feedbacks: this.db.feedbacks.length,
      surgeries: (this.db.surgeries || []).length,
    };
  }

  public getTotalRecords(): number {
    const c = this.getCounts();
    return Object.values(c).reduce((acc, curr) => acc + curr, 0);
  }

  public getStatus(): ServerSyncStatus {
    return {
      isConnected: this.isConnected,
      isSyncing: this.isSyncing,
      lastSyncedAt: this.lastSyncedAt,
      counts: this.getCounts(),
      version: this.version,
      lastError: this.lastError,
      webAppUrl: this.webAppUrl,
    };
  }

  public getDatabase(requesterRole?: string): ClinicDatabase {
    const isSuperAdmin = requesterRole === 'Super Admin / Owner';
    return {
      ...this.db,
      pets: this.db.pets.map((p) => ({
        ...p,
        type: normalizePetType(p.type, `${p.name || ''} ${p.breed || ''} ${p.notes || ''}`),
      })),
      staff: this.db.staff.map((s) => {
        if (isSuperAdmin) {
          // Super Admin berhak melihat & mengelola kata sandi staf
          return { ...s };
        }
        // Staf biasa tidak boleh melihat kata sandi akun lain
        const { password, ...safeStaff } = s;
        return safeStaff;
      }),
    };
  }

  /**
   * Mengembalikan database mentah internal server (HANYA untuk keperluan otentikasi login di server).
   */
  public getInternalDatabase(): ClinicDatabase {
    return this.db;
  }

  /**
   * REKONSILIASI OTOMATIS:
   * Menjamin bahwa setiap pasien & pemilik yang mendaftar (baik melalui antrean klinis
   * maupun booking janji temu), meskipun pasien tidak hadir / melebihi waktu tunggu / dibatalkan,
   * tetap WAJIB tercatat secara resmi di tabel 'owners' dan 'pets'.
   */
  public reconcileMissingOwnersAndPets(): number {
    let addedCount = 0;
    const addedOwners: any[] = [];
    const addedPets: any[] = [];
    const existingOwnerWaMap = new Map<string, any>();
    const existingOwnerIdMap = new Map<string, any>();

    for (const o of this.db.owners) {
      if (!o) continue;
      if (o.id) existingOwnerIdMap.set(String(o.id).trim().toLowerCase(), o);
      const cleanWa = normalizePhoneWithZero(o.whatsapp);
      if (cleanWa) existingOwnerWaMap.set(cleanWa, o);
    }

    const existingPetMap = new Map<string, any>();
    for (const p of this.db.pets) {
      if (!p || !p.name) continue;
      const pName = String(p.name).toLowerCase().trim();
      const normWa = normalizePhoneWithZero(p.ownerWhatsapp);
      if (normWa) existingPetMap.set(`${pName}::${normWa}`, p);
      if (p.ownerId) existingPetMap.set(`${pName}::${String(p.ownerId).toLowerCase().trim()}`, p);
      if (p.id) existingPetMap.set(`id::${String(p.id).toLowerCase().trim()}`, p);
    }

    // 1. Rekonsiliasi dari tabel Queues (Antrean)
    for (const q of this.db.queues) {
      if (!q || (!q.petName && !q.ownerName)) continue;
      const cleanWa = normalizePhoneWithZero(q.ownerWhatsapp) || '081234567890';

      let owner = cleanWa ? existingOwnerWaMap.get(cleanWa) : null;
      if (!owner && q.ownerName) {
        owner = this.db.owners.find(
          (o) => String(o.name || '').trim().toLowerCase() === String(q.ownerName).trim().toLowerCase()
        );
      }

      if (!owner) {
        const nextOwnerId = `own-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        owner = {
          id: nextOwnerId,
          name: String(q.ownerName || 'Klien Pendaftar').trim(),
          whatsapp: cleanWa,
          address: 'Alamat Klien Pendaftaran',
          registeredAt: q.createdAt || new Date().toISOString(),
          notes: q.informedConsent || 'Pendaftaran antrean klinik',
          informedConsent: q.informedConsent || 'Disetujui: Bebas tuntutan resiko medis sesuai kaidah kedokteran hewan',
        };
        this.db.owners.unshift(owner);
        addedOwners.push(owner);
        if (cleanWa) existingOwnerWaMap.set(cleanWa, owner);
        existingOwnerIdMap.set(String(owner.id).toLowerCase().trim(), owner);
        addedCount++;
      }

      const petNameLower = String(q.petName).toLowerCase().trim();
      const ownerIdKey = owner?.id ? String(owner.id).toLowerCase().trim() : '';
      let pet = (q.petId ? existingPetMap.get(`id::${String(q.petId).toLowerCase().trim()}`) : null) ||
                (cleanWa ? existingPetMap.get(`${petNameLower}::${cleanWa}`) : null) ||
                (ownerIdKey ? existingPetMap.get(`${petNameLower}::${ownerIdKey}`) : null);

      if (!pet) {
        const nextPetId = `pet-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        pet = {
          id: nextPetId,
          ownerId: owner.id,
          ownerName: owner.name,
          ownerWhatsapp: owner.whatsapp,
          name: String(q.petName || 'Pasien Antrean').trim(),
          type: normalizePetType(q.petType || 'Cat'),
          breed: 'Mix / Domestik',
          ageOrDob: 'Dewasa',
          sex: 'Jantan',
          photoUrl: q.photoUrl,
          status: q.serviceType === 'Daftar' ? 'Sehat' : 'Perawatan',
          registeredAt: q.createdAt || new Date().toISOString(),
          informedConsent: q.informedConsent || owner.informedConsent,
        };
        this.db.pets.unshift(pet);
        addedPets.push(pet);
        if (cleanWa) existingPetMap.set(`${petNameLower}::${cleanWa}`, pet);
        if (ownerIdKey) existingPetMap.set(`${petNameLower}::${ownerIdKey}`, pet);
        existingPetMap.set(`id::${String(pet.id).toLowerCase().trim()}`, pet);
        addedCount++;
      }

      if (!q.petId || q.petId !== pet.id) {
        q.petId = pet.id;
      }
    }

    // 2. Rekonsiliasi dari tabel Bookings (Jadwal Janji Temu)
    for (const b of this.db.bookings) {
      if (!b || (!b.petName && !b.ownerName)) continue;
      const cleanWa = normalizePhoneWithZero(b.ownerWhatsapp) || '081234567890';

      let owner = cleanWa ? existingOwnerWaMap.get(cleanWa) : null;
      if (!owner && b.ownerName) {
        owner = this.db.owners.find(
          (o) => String(o.name || '').trim().toLowerCase() === String(b.ownerName).trim().toLowerCase()
        );
      }

      if (!owner) {
        const nextOwnerId = `own-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        owner = {
          id: nextOwnerId,
          name: String(b.ownerName || 'Klien Booking').trim(),
          whatsapp: cleanWa,
          address: 'Alamat Klien Booking',
          registeredAt: b.date ? `${b.date} ${b.time || '10:00'}` : new Date().toISOString(),
          notes: b.notes ? `Janji Temu Booking: ${b.notes}` : 'Janji Temu Booking',
          informedConsent: 'Disetujui: Pendaftaran Booking Janji Temu',
        };
        this.db.owners.unshift(owner);
        addedOwners.push(owner);
        if (cleanWa) existingOwnerWaMap.set(cleanWa, owner);
        existingOwnerIdMap.set(String(owner.id).toLowerCase().trim(), owner);
        addedCount++;
      }

      const petNameLower = String(b.petName).toLowerCase().trim();
      const ownerIdKey = owner?.id ? String(owner.id).toLowerCase().trim() : '';
      let pet = (cleanWa ? existingPetMap.get(`${petNameLower}::${cleanWa}`) : null) ||
                (ownerIdKey ? existingPetMap.get(`${petNameLower}::${ownerIdKey}`) : null);

      if (!pet) {
        const nextPetId = `pet-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        pet = {
          id: nextPetId,
          ownerId: owner.id,
          ownerName: owner.name,
          ownerWhatsapp: owner.whatsapp,
          name: String(b.petName || 'Pasien Booking').trim(),
          type: normalizePetType(b.petType || 'Cat'),
          breed: 'Mix / Domestik',
          ageOrDob: 'Dewasa',
          sex: 'Jantan',
          status: 'Sehat',
          registeredAt: b.date ? `${b.date} ${b.time || '10:00'}` : new Date().toISOString(),
          notes: b.notes ? `Janji Temu: ${b.serviceType} - ${b.notes}` : `Janji Temu: ${b.serviceType}`,
        };
        this.db.pets.unshift(pet);
        addedPets.push(pet);
        if (cleanWa) existingPetMap.set(`${petNameLower}::${cleanWa}`, pet);
        if (ownerIdKey) existingPetMap.set(`${petNameLower}::${ownerIdKey}`, pet);
        existingPetMap.set(`id::${String(pet.id).toLowerCase().trim()}`, pet);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      this.rebuildIndexes();
      this.updateCounts();
      this.saveDatabaseToDisk();
      console.log(`[ServerSync] Berhasil merekonsiliasi ${addedCount} data pasien & pemilik dari antrean/booking.`);
      
      // Push added records to Google Sheets
      addedOwners.forEach(o => this.pushSingleRecordToAppsScript('owners', o).catch(() => {}));
      addedPets.forEach(p => this.pushSingleRecordToAppsScript('pets', p).catch(() => {}));
    }

    return addedCount;
  }

  /**
   * PENYELARASAN & DEDUPLIKASI PASIEN (HEWAN)
   * Menyelaraskan hewan yang memiliki Nama Pasien sama DAN Pemilik identik sama (No. WA / ID Pemilik)
   * menjadi satu profil pasien kanonikal tunggal.
   * Semua rekam medis (SOAP), antrean, rawat inap, dan booking otomatis diarahkan ke ID kanonikal.
   */
  public deduplicatePets(): number {
    const canonicalMap = new Map<string, any>();
    const remappedIdMap = new Map<string, string>(); // duplicateId -> canonicalId
    const survivingPets: any[] = [];
    let mergedCount = 0;

    for (const pet of this.db.pets) {
      if (!pet || !pet.name) continue;
      const cleanName = String(pet.name).toLowerCase().trim();
      const cleanWa = normalizePhoneWithZero(pet.ownerWhatsapp);
      const ownerId = pet.ownerId ? String(pet.ownerId).trim().toLowerCase() : '';
      const ownerKey = cleanWa || ownerId || String(pet.ownerName || '').toLowerCase().trim();
      const comboKey = `${cleanName}::${ownerKey}`;

      if (!canonicalMap.has(comboKey)) {
        canonicalMap.set(comboKey, pet);
        survivingPets.push(pet);
      } else {
        const canonical = canonicalMap.get(comboKey);
        remappedIdMap.set(String(pet.id), String(canonical.id));
        mergedCount++;

        // Satukan kelengkapan data (foto, catatan, dsb) jika profil kanonikal belum memilikinya
        if (!canonical.photoUrl && pet.photoUrl) canonical.photoUrl = pet.photoUrl;
        if ((!canonical.notes || canonical.notes.trim() === '') && pet.notes) canonical.notes = pet.notes;
        if ((!canonical.breed || canonical.breed === 'Mix / Domestik') && pet.breed && pet.breed !== 'Mix / Domestik') canonical.breed = pet.breed;
        if ((!canonical.ageOrDob || canonical.ageOrDob === 'Dewasa') && pet.ageOrDob && pet.ageOrDob !== 'Dewasa') canonical.ageOrDob = pet.ageOrDob;
      }
    }

    if (mergedCount > 0) {
      this.db.pets = survivingPets;

      // Remap rekam medis (SOAP records)
      for (const soap of this.db.soapRecords) {
        if (soap && soap.petId && remappedIdMap.has(String(soap.petId))) {
          soap.petId = remappedIdMap.get(String(soap.petId));
        }
      }
      for (const archiveSoap of this.archiveSoapRecords) {
        if (archiveSoap && archiveSoap.petId && remappedIdMap.has(String(archiveSoap.petId))) {
          archiveSoap.petId = remappedIdMap.get(String(archiveSoap.petId));
        }
      }

      // Remap antrean (queues)
      for (const q of this.db.queues) {
        if (q && q.petId && remappedIdMap.has(String(q.petId))) {
          q.petId = remappedIdMap.get(String(q.petId));
        }
      }

      // Remap rawat inap (cages)
      for (const cage of this.db.cages) {
        if (cage && cage.petId && remappedIdMap.has(String(cage.petId))) {
          cage.petId = remappedIdMap.get(String(cage.petId));
        }
      }

      // Remap bookings
      for (const b of this.db.bookings) {
        if (b && b.petId && remappedIdMap.has(String(b.petId))) {
          b.petId = remappedIdMap.get(String(b.petId));
        }
      }

      this.rebuildIndexes();
      this.updateCounts();
      this.saveDatabaseToDisk();
      console.log(`[ServerSync] Berhasil menyelaraskan & menggabungkan ${mergedCount} data pasien duplikat menjadi satu profil.`);
    }

    return mergedCount;
  }

  /**
   * PEMBERSIHAN OTOMATIS SAAT GANTI TANGGAL:
   * Pendaftar antrean dari tanggal sebelumnya yang tidak hadir (status 'Menunggu')
   * otomatis dihapus dari daftar antrean pasien live.
   * Data pemilik dan pasiennya tetap aman karena telah direkonsiliasi ke tabel 'owners' & 'pets'.
   */
  public purgeUnattendedPastQueues(): number {
    const beforeCount = this.db.queues.length;
    this.db.queues = this.db.queues.filter((q) => {
      if (!isToday(q.createdAt) && q.status === 'Menunggu') {
        return false;
      }
      return true;
    });
    const purgedCount = beforeCount - this.db.queues.length;
    if (purgedCount > 0) {
      this.rebuildIndexes();
      this.updateCounts();
      this.saveDatabaseToDisk();
      console.log(`[ServerSync] Otomatis menghapus ${purgedCount} antrean tidak hadir dari tanggal sebelumnya.`);
    }
    return purgedCount;
  }

  /**
   * Helper internal untuk mencari owner berdasarkan id / nomor whatsapp
   */
  private findOwnerForPet(pet: any): any | null {
    if (!pet) return null;
    if (pet.ownerId && this.ownerMapById.has(String(pet.ownerId))) {
      return this.ownerMapById.get(String(pet.ownerId));
    }
    const cleanWp = String(pet.ownerWhatsapp || '').replace(/\D/g, '');
    if (cleanWp && this.ownerMapByWa.has(cleanWp)) {
      return this.ownerMapByWa.get(cleanWp);
    }
    const normWp = normalizePhoneWithZero(pet.ownerWhatsapp);
    if (normWp) {
      const normClean = normWp.replace(/\D/g, '');
      if (this.ownerMapByWa.has(normClean)) return this.ownerMapByWa.get(normClean);
    }
    return null;
  }

  /**
   * 1. SERVER-SIDE PAGINATION & SEARCH: PASIEN
   */
  public getPaginatedPatients(params: {
    page?: number | string;
    limit?: number | string;
    q?: string;
    species?: string;
    status?: string;
  }) {
    const page = Math.max(1, parseInt(String(params.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(params.limit || 10), 10)));
    const q = String(params.q || '').toLowerCase().trim();
    const cleanDigits = q.replace(/\D/g, '');
    const species = String(params.species || 'all').toLowerCase();
    const status = String(params.status || 'all');

    let filtered = this.db.pets.filter((pet) => {
      const petNormType = normalizePetType(pet.type, `${pet.name || ''} ${pet.breed || ''} ${pet.notes || ''}`);
      const petTypeLower = petNormType.toLowerCase();
      const rawTypeLower = String(pet.type || '').toLowerCase();

      // 1. Filter Species
      if (species !== 'all') {
        if ((species === 'cat' || species === 'kucing') && petTypeLower !== 'cat' && !rawTypeLower.includes('kucing') && !rawTypeLower.includes('cat')) return false;
        if ((species === 'dog' || species === 'anjing') && petTypeLower !== 'dog' && !rawTypeLower.includes('anjing') && !rawTypeLower.includes('dog')) return false;
        if ((species === 'rabbit' || species === 'kelinci') && petTypeLower !== 'rabbit' && !rawTypeLower.includes('kelinci') && !rawTypeLower.includes('rabbit')) return false;
        if ((species === 'bird' || species === 'exotic' || species === 'burung' || species === 'eksotik') && petTypeLower !== 'exotic' && !rawTypeLower.includes('burung') && !rawTypeLower.includes('bird') && !rawTypeLower.includes('eksotik') && !rawTypeLower.includes('exotic')) return false;
        if ((species === 'farm animal' || species === 'farm' || species === 'ternak') && petTypeLower !== 'farm animal' && !rawTypeLower.includes('ternak') && !rawTypeLower.includes('sapi') && !rawTypeLower.includes('kambing')) return false;
        if (species === 'other' && (petTypeLower === 'cat' || petTypeLower === 'dog')) return false;
      }

      // 2. Filter Status
      if (status !== 'all' && pet.status !== status) {
        return false;
      }

      // 3. Search Query
      if (q) {
        const petName = String(pet.name || '').toLowerCase();
        const petId = String(pet.id || '').toLowerCase();
        const petBreed = String(pet.breed || '').toLowerCase();
        const petNotes = String(pet.notes || '').toLowerCase();
        const petOwner = String(pet.ownerName || '').toLowerCase();
        const petWhatsapp = String(pet.ownerWhatsapp || '');
        const petIndo = getPetTypeIndonesian(pet.type, `${pet.name || ''} ${pet.breed || ''} ${pet.notes || ''}`).toLowerCase();
        const cleanWp = petWhatsapp.replace(/\D/g, '');

        const match =
          petName.includes(q) ||
          petId.includes(q) ||
          petBreed.includes(q) ||
          petNotes.includes(q) ||
          petOwner.includes(q) ||
          petTypeLower.includes(q) ||
          rawTypeLower.includes(q) ||
          petIndo.includes(q) ||
          petWhatsapp.includes(q) ||
          (cleanDigits.length >= 3 && cleanWp.includes(cleanDigits));

        if (!match) return false;
      }

      return true;
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit).map((pet) => {
      const owner = this.findOwnerForPet(pet);
      const normalizedType = normalizePetType(pet.type, `${pet.name || ''} ${pet.breed || ''} ${pet.notes || ''}`);
      return {
        ...pet,
        type: normalizedType,
        resolvedOwner: owner || {
          id: pet.ownerId || '',
          name: pet.ownerName || 'Pemilik',
          whatsapp: pet.ownerWhatsapp || '',
          address: '',
          informedConsent: pet.informedConsent,
        },
      };
    });

    return {
      success: true,
      data,
      total,
      page,
      totalPages,
      limit,
    };
  }

  /**
   * 2. SERVER-SIDE PAGINATION & SEARCH: PEMILIK
   */
  public getPaginatedOwners(params: {
    page?: number | string;
    limit?: number | string;
    q?: string;
  }) {
    const page = Math.max(1, parseInt(String(params.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(params.limit || 10), 10)));
    const q = String(params.q || '').toLowerCase().trim();
    const cleanDigits = q.replace(/\D/g, '');

    let filtered = sortOwnersNewestFirst(this.db.owners).filter((owner) => {
      if (!q) return true;

      const nameMatch = String(owner.name || '').toLowerCase().includes(q);
      const waMatch = String(owner.whatsapp || '').includes(q);
      const addrMatch = String(owner.address || '').toLowerCase().includes(q);
      const idMatch = String(owner.id || '').toLowerCase().includes(q);
      const cleanWaMatch = cleanDigits.length >= 3 && String(owner.whatsapp || '').replace(/\D/g, '').includes(cleanDigits);

      if (nameMatch || waMatch || addrMatch || idMatch || cleanWaMatch) return true;

      // Check owner pets via persistent index
      const clean = String(owner.whatsapp || '').replace(/\D/g, '');
      const ownerPets = [
        ...(owner.id ? this.petsByOwnerIdMap.get(String(owner.id)) || [] : []),
        ...(clean ? this.petsByOwnerWaMap.get(clean) || [] : []),
      ];

      return ownerPets.some((p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.id || '').toLowerCase().includes(q) ||
        String(p.breed || '').toLowerCase().includes(q)
      );
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit).map((owner) => {
      const clean = String(owner.whatsapp || '').replace(/\D/g, '');
      const userPets = [
        ...(owner.id ? this.petsByOwnerIdMap.get(String(owner.id)) || [] : []),
        ...(clean ? this.petsByOwnerWaMap.get(clean) || [] : []),
      ];
      // Deduplicate pets
      const uniquePets = Array.from(new Map(userPets.map((p) => [p.id, p])).values());
      return {
        ...owner,
        pets: uniquePets,
      };
    });

    return {
      success: true,
      data,
      total,
      page,
      totalPages,
      limit,
    };
  }

  /**
   * 3. SERVER-SIDE SEARCH & PAGINATION: REKAM MEDIK (SOAP)
   */
  public getPaginatedSoapRecords(params: {
    page?: number | string;
    limit?: number | string;
    q?: string;
    petId?: string;
    vet?: string;
    hasPrescription?: string | boolean;
    hasDiagnostics?: string | boolean;
  }) {
    const page = Math.max(1, parseInt(String(params.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(params.limit || 10), 10)));
    const q = String(params.q || '').toLowerCase().trim();
    const petId = String(params.petId || '').trim();
    const vet = String(params.vet || 'all');
    const hasPrescription = String(params.hasPrescription) === 'true';
    const hasDiagnostics = String(params.hasDiagnostics) === 'true';

    const allSoaps = sortSoapNewestFirst(this.getAllSoaps());
    let filtered = allSoaps.filter((record) => {
      // 1. Filter by Pet ID (jika sedang membuka rekam medis pasien tertentu)
      if (petId && record.petId !== petId) {
        return false;
      }

      // 2. Filter by Veterinarian
      if (vet !== 'all' && record.veterinarian !== vet) {
        return false;
      }

      // 3. Filter by Prescriptions
      if (hasPrescription && (!record.prescriptions || record.prescriptions.length === 0)) {
        return false;
      }

      // 4. Filter by Diagnostics
      if (hasDiagnostics) {
        const hasAttach = record.diagnosticAttachments && record.diagnosticAttachments.length > 0;
        const hasNotes = Boolean(record.diagnosticNotes);
        if (!hasAttach && !hasNotes) return false;
      }

      // 5. Text Search
      if (q) {
        const match =
          String(record.petName || '').toLowerCase().includes(q) ||
          String(record.ownerName || '').toLowerCase().includes(q) ||
          String(record.ownerWhatsapp || '').includes(q) ||
          String(record.veterinarian || '').toLowerCase().includes(q) ||
          String(record.soap?.assessment || '').toLowerCase().includes(q) ||
          String(record.soap?.subjective || '').toLowerCase().includes(q) ||
          String(record.soap?.plan || '').toLowerCase().includes(q) ||
          String(record.id || '').toLowerCase().includes(q);

        if (!match) return false;
      }

      return true;
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit);
    const totalRevenue = filtered.reduce((acc, curr) => acc + (Number(curr.serviceFee) || 0), 0);

    return {
      success: true,
      data,
      total,
      page,
      totalPages,
      limit,
      totalRevenue,
    };
  }

  /**
   * 4. SERVER-SIDE DASHBOARD STATS & KPI AGGREGATION
   */
  public getDashboardSummary(params: {
    month?: string; // "0" - "11" or "all"
    year?: string;  // e.g. "2026"
    date?: string;  // e.g. "2026-09-27"
  } = {}) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // 1. Antrean Hari Ini
    const todayQueues = this.db.queues.filter((q) => isToday(q.createdAt));
    const activeWaiting = todayQueues.filter((q) => q.status === 'Menunggu');
    const inPoli = todayQueues.filter((q) => q.status === 'Di Ruang Poli');
    const completedToday = todayQueues.filter((q) => q.status === 'Selesai');
    const currentServingQueue = inPoli[0] || null;

    // 2. Keterisian Kandang Rawat Inap (12 unit fisik standar A1-A6 & B1-B6)
    const sanitizedCages = sanitizeCagesList(this.db.cages);
    const occupiedCages = sanitizedCages.filter((c) => c.status === 'Occupied').length;
    const totalCages = 12;

    // 3. Breakdown Aktivitas Layanan Bulan Berjalan / Filter
    const targetMonth = params.month !== undefined && params.month !== 'all' ? parseInt(params.month, 10) : currentMonth;
    const targetYear = params.year ? parseInt(params.year, 10) : currentYear;

    const isMatchMonthYear = (dateStr?: string): boolean => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        if (params.month === 'all') return d.getFullYear() === targetYear;
        return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
      }
      const match = String(dateStr).match(/(\d{4})-(\d{2})/);
      if (match) {
        const y = parseInt(match[1], 10);
        const m = parseInt(match[2], 10) - 1;
        if (params.month === 'all') return y === targetYear;
        return y === targetYear && m === targetMonth;
      }
      return true;
    };

    const allSoaps = this.getAllSoaps();
    const mQueues = this.db.queues.filter((q) => isMatchMonthYear(q.createdAt));
    const mSoaps = allSoaps.filter((s) => isMatchMonthYear(s.date));
    const mBookings = this.db.bookings.filter((b) => isMatchMonthYear(b.date));

    const countConsultation =
      mQueues.filter((q) => q.serviceType === 'Consultation').length +
      mSoaps.filter((s) => !s.queueId).length +
      mBookings.filter((b) => b.serviceType === 'Consultation' && b.status === 'Selesai').length;

    const countVaccine =
      mQueues.filter((q) => q.serviceType === 'Vaccine').length +
      mBookings.filter((b) => b.serviceType === 'Vaccine' && b.status === 'Selesai').length;

    const countGrooming =
      mQueues.filter((q) => q.serviceType === 'Grooming').length +
      mBookings.filter((b) => b.serviceType === 'Grooming' && b.status === 'Selesai').length;

    const inpatientFromCages = sanitizedCages.filter((c) => c.status === 'Occupied' || (c.admittedAt && isMatchMonthYear(c.admittedAt))).length;
    const countInpatient =
      mQueues.filter((q) => q.serviceType === 'Hotel').length +
      inpatientFromCages +
      mBookings.filter((b) => b.serviceType === 'Hotel' && b.status === 'Selesai').length;

    const countRegistrationOnly = mQueues.filter((q) => q.serviceType === 'Daftar').length;
    const totalServiceActivities = countConsultation + countVaccine + countGrooming + countInpatient + countRegistrationOnly;

    // 4. Estimasi Pendapatan SOAP
    let revenueSoapList = allSoaps;
    if (params.month !== undefined && params.month !== 'all') {
      const m = parseInt(params.month, 10);
      const y = params.year ? parseInt(params.year, 10) : currentYear;
      revenueSoapList = revenueSoapList.filter((r) => {
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d.getMonth() === m && d.getFullYear() === y;
      });
    } else if (params.year) {
      const y = parseInt(params.year, 10);
      revenueSoapList = revenueSoapList.filter((r) => {
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d.getFullYear() === y;
      });
    }

    if (params.date) {
      revenueSoapList = revenueSoapList.filter((r) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return false;
        return d.toISOString().split('T')[0] === params.date;
      });
    }

    const totalRevenueSum = revenueSoapList.reduce((acc, curr) => acc + (Number(curr.serviceFee) || 0), 0);
    const totalRevenueSellsCount = revenueSoapList.length;
    const averageRevenuePerSell = totalRevenueSellsCount > 0 ? Math.round(totalRevenueSum / totalRevenueSellsCount) : 0;

    // 5. Demografi Hewan Terdaftar Pre-computed
    let countCat = 0;
    let countDog = 0;
    let countRabbit = 0;
    let countExotic = 0;
    let countFarm = 0;

    for (const pet of this.db.pets) {
      if (!pet) continue;
      const type = normalizePetType(pet.type, `${pet.name || ''} ${pet.breed || ''} ${pet.notes || ''}`);
      if (type === 'Cat') countCat++;
      else if (type === 'Dog') countDog++;
      else if (type === 'Rabbit') countRabbit++;
      else if (type === 'Exotic') countExotic++;
      else if (type === 'Farm Animal') countFarm++;
      else countCat++;
    }

    return {
      success: true,
      demographics: {
        total: this.db.pets.length,
        cats: countCat,
        dogs: countDog,
        rabbits: countRabbit,
        exotics: countExotic,
        farmAnimals: countFarm,
      },
      kpi: {
        todayVisitsCount: todayQueues.length,
        totalQueuesCount: this.db.queues.length,
        activeWaitingCount: activeWaiting.length,
        inPoliCount: inPoli.length,
        completedTodayCount: completedToday.length,
        occupiedCages,
        totalCages,
        currentServingTicket: currentServingQueue ? currentServingQueue.ticketNumber : '',
        currentServingPetName: currentServingQueue ? currentServingQueue.petName : '',
      },
      serviceBreakdown: {
        countConsultation,
        countVaccine,
        countGrooming,
        countInpatient,
        countRegistrationOnly,
        totalServiceActivities,
        pctConsultation: totalServiceActivities > 0 ? Math.round((countConsultation / totalServiceActivities) * 100) : 0,
        pctVaccine: totalServiceActivities > 0 ? Math.round((countVaccine / totalServiceActivities) * 100) : 0,
        pctGrooming: totalServiceActivities > 0 ? Math.round((countGrooming / totalServiceActivities) * 100) : 0,
        pctInpatient: totalServiceActivities > 0 ? Math.round((countInpatient / totalServiceActivities) * 100) : 0,
        pctRegistrationOnly: totalServiceActivities > 0 ? Math.round((countRegistrationOnly / totalServiceActivities) * 100) : 0,
      },
      revenue: {
        totalRevenueSum,
        totalRevenueSellsCount,
        averageRevenuePerSell,
      },
    };
  }

  /**
   * 5. SERVER-SIDE SEARCH & PAGINATION: QUEUES (LIVE & HISTORY)
   */
  public getPaginatedQueues(params: {
    page?: number | string;
    limit?: number | string;
    scope?: 'today' | 'all';
    status?: string;
    q?: string;
  }) {
    const page = Math.max(1, parseInt(String(params.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(params.limit || 10), 10)));
    const scope = params.scope === 'all' ? 'all' : 'today';
    const status = String(params.status || 'all');
    const q = String(params.q || '').toLowerCase().trim();

    // Pastikan pendaftar yang tidak hadir dari tanggal sebelumnya otomatis dibersihkan
    this.purgeUnattendedPastQueues();

    // Base filtering
    let baseList = this.db.queues;
    if (scope === 'today') {
      baseList = baseList.filter((item) => isToday(item.createdAt));
    }

    // Status filtering
    if (status !== 'all') {
      baseList = baseList.filter((item) => item.status === status);
    }

    // Text Search
    if (q) {
      baseList = baseList.filter((item) => {
        return (
          String(item.ticketNumber || '').toLowerCase().includes(q) ||
          String(item.petName || '').toLowerCase().includes(q) ||
          String(item.ownerName || '').toLowerCase().includes(q) ||
          String(item.ownerWhatsapp || '').includes(q) ||
          String(item.chiefComplaint || '').toLowerCase().includes(q) ||
          String(item.serviceType || '').toLowerCase().includes(q)
        );
      });
    }

    // Sorting: 'Di Ruang Poli' first, then 'Menunggu' (FIFO / createdAt asc), then others (LIFO / desc)
    const sorted = [...baseList].sort((a, b) => {
      const getPriority = (st: string) => {
        if (st === 'Di Ruang Poli') return 1;
        if (st === 'Menunggu') return 2;
        return 3;
      };
      const pA = getPriority(a.status);
      const pB = getPriority(b.status);
      if (pA !== pB) return pA - pB;
      if (a.status === 'Menunggu' && b.status === 'Menunggu') {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    const total = sorted.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const data = sorted.slice(offset, offset + limit);

    // Counts for tab badges
    const todayList = this.db.queues.filter((item) => isToday(item.createdAt));
    const activeWaiting = todayList.filter((item) => item.status === 'Menunggu').length;
    const inPoli = todayList.filter((item) => item.status === 'Di Ruang Poli').length;
    const completedToday = todayList.filter((item) => item.status === 'Selesai').length;

    return {
      success: true,
      data,
      total,
      page,
      totalPages,
      limit,
      counts: {
        todayTotal: todayList.length,
        allTotal: this.db.queues.length,
        activeWaiting,
        inPoli,
        completedToday,
      },
    };
  }

  /**
   * 3B. FAST PATIENT SEARCH FOR AUTOCOMPLETE (SOAP & RAWAT INAP)
   */
  public searchPatientsAutocomplete(q: string, limit: number = 30) {
    const cleanQ = String(q || '').toLowerCase().trim();
    const cleanDigits = cleanQ.replace(/\D/g, '');

    // Active queues map
    const activeQueuesMap = new Map<string, any>();
    for (const qItem of this.db.queues) {
      if (qItem.status !== 'Selesai' && qItem.petId) {
        activeQueuesMap.set(qItem.petId, qItem);
      }
    }

    if (!cleanQ) {
      // Return currently queued patients first, then top recent patients
      const inQueuePets: any[] = [];
      const otherPets: any[] = [];

      for (const pet of this.db.pets) {
        const queueInfo = activeQueuesMap.get(pet.id);
        const item = { ...pet, queueInfo };
        if (queueInfo) {
          inQueuePets.push(item);
        } else if (otherPets.length < limit) {
          otherPets.push(item);
        }
      }

      return {
        success: true,
        data: [...inQueuePets, ...otherPets].slice(0, limit),
      };
    }

    const results: any[] = [];
    for (const pet of this.db.pets) {
      const queueInfo = activeQueuesMap.get(pet.id);
      const petTypeNorm = normalizePetType(pet.type, `${pet.name || ''} ${pet.breed || ''}`);
      const petNameMatch = String(pet.name || '').toLowerCase().includes(cleanQ);
      const petIdMatch = String(pet.id || '').toLowerCase().includes(cleanQ);
      const ownerNameMatch = String(pet.ownerName || '').toLowerCase().includes(cleanQ);
      const phoneMatch = String(pet.ownerWhatsapp || '').includes(cleanQ) || (cleanDigits.length >= 3 && String(pet.ownerWhatsapp || '').replace(/\D/g, '').includes(cleanDigits));
      const breedMatch = String(pet.breed || '').toLowerCase().includes(cleanQ);
      const speciesMatch =
        petTypeNorm.toLowerCase().includes(cleanQ) ||
        getPetTypeIndonesian(pet.type, `${pet.name || ''} ${pet.breed || ''}`).toLowerCase().includes(cleanQ) ||
        String(pet.type || '').toLowerCase().includes(cleanQ);
      const ticketMatch = queueInfo?.ticketNumber?.toLowerCase().includes(cleanQ);

      if (petNameMatch || petIdMatch || ownerNameMatch || phoneMatch || breedMatch || speciesMatch || ticketMatch) {
        results.push({ ...pet, type: petTypeNorm, queueInfo });
        if (results.length >= limit) break;
      }
    }

    return {
      success: true,
      data: results,
    };
  }

  /**
   * 3C. FETCH SOAP RIWAYAT PASIEN SPESIFIK BERDASARKAN PET ID & IDENTITAS PEMILIK IDENTIK
   * Menjamin rekam medis hewan dari pemilik yang sama (nama hewan sama + pemilik identik) menyatu sempurna,
   * sekaligus mencegah kebocoran antar pasien bernama sama dari pemilik berbeda.
   */
  public getPatientSoapHistory(petId: string) {
    const cleanPetId = String(petId || '').trim();
    if (!cleanPetId) {
      return {
        success: true,
        data: [],
        total: 0,
      };
    }

    // Cari profil pasien target
    const targetPet = this.petMapById.get(cleanPetId) || this.db.pets.find((p) => String(p.id).trim() === cleanPetId);
    const targetName = targetPet ? String(targetPet.name || '').toLowerCase().trim() : '';
    const targetWa = targetPet ? normalizePhoneWithZero(targetPet.ownerWhatsapp) : '';
    const targetOwnerId = targetPet?.ownerId ? String(targetPet.ownerId).trim().toLowerCase() : '';

    const allSoaps = this.getAllSoaps();
    const records = allSoaps.filter((s) => {
      if (!s) return false;
      const soapPetId = String(s.petId || '').trim();

      // 1. Kecocokan langsung ID Pasien
      if (soapPetId && soapPetId === cleanPetId) return true;

      // 2. Kecocokan Pasien & Pemilik Identik:
      // Nama Hewan sama DAN Pemilik identik sama (No. WA sama ATAU ID Pemilik sama)
      if (targetName && s.petName && String(s.petName).toLowerCase().trim() === targetName) {
        const soapWa = normalizePhoneWithZero(s.ownerWhatsapp);
        const soapOwnerId = s.ownerId ? String(s.ownerId).trim().toLowerCase() : '';

        if (targetWa && soapWa && soapWa === targetWa) return true;
        if (targetOwnerId && soapOwnerId && soapOwnerId === targetOwnerId) return true;
      }

      return false;
    });

    // Hilangkan duplikasi dan urutkan rekam medis terbaru
    const uniqueMap = new Map<string, any>();
    for (const r of records) {
      if (r && r.id) uniqueMap.set(String(r.id), r);
    }
    const sortedRecords = sortSoapNewestFirst(Array.from(uniqueMap.values()));

    return {
      success: true,
      data: sortedRecords,
      total: sortedRecords.length,
    };
  }

  /**
   * 4. RAWAT INAP KANDANG AKTIF (12 KANDANG A1-B6) & HISTORY ARSIP
   */
  public getInpatientData() {
    const cages = sanitizeCagesList(this.db.cages);
    return {
      success: true,
      cages,
      counts: {
        occupied: cages.filter((c) => c.status === 'Occupied').length,
        cleaning: cages.filter((c) => c.status === 'Cleaning').length,
        available: cages.filter((c) => c.status === 'Available').length,
      },
    };
  }

  public getPaginatedInpatientHistory(params: {
    page?: number | string;
    limit?: number | string;
    q?: string;
  }) {
    const page = Math.max(1, parseInt(String(params.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(params.limit || 10), 10)));
    const q = String(params.q || '').toLowerCase().trim();

    // Inpatient history: entries in db.inpatientHistory plus any discharged cages in db.cages
    const fromInpatientHist = Array.isArray((this.db as any).inpatientHistory) ? (this.db as any).inpatientHistory : [];
    const fromCagesHist = (this.db.cages || []).filter((c: any) => {
      const id = String(c?.id || '');
      const st = String(c?.status || '').toLowerCase();
      return id.startsWith('cag-') || st === 'selesai' || st === 'discharged';
    });

    const combinedMap = new Map<string, any>();
    for (const h of fromInpatientHist) {
      if (h && h.id) combinedMap.set(String(h.id), h);
    }
    for (const h of fromCagesHist) {
      if (h && h.id && !combinedMap.has(String(h.id))) combinedMap.set(String(h.id), h);
    }
    const rawHistory = Array.from(combinedMap.values());

    let filtered = rawHistory.filter((h: any) => {
      if (!q) return true;
      return (
        String(h.petName || '').toLowerCase().includes(q) ||
        String(h.ownerName || '').toLowerCase().includes(q) ||
        String(h.diagnosis || '').toLowerCase().includes(q) ||
        String(h.cageId || '').toLowerCase().includes(q) ||
        String(h.cageLabel || '').toLowerCase().includes(q) ||
        String(h.veterinarian || '').toLowerCase().includes(q)
      );
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit);

    return {
      success: true,
      data,
      total,
      page,
      totalPages,
      limit,
    };
  }

  public setConfig(webAppUrl?: string, autoSync?: boolean) {
    if (webAppUrl && webAppUrl.trim()) {
      this.webAppUrl = webAppUrl.trim();
    }
    if (autoSync !== undefined) {
      this.autoSync = autoSync;
    }
    this.saveConfig();
  }

  /**
   * Tarik database lengkap dari Google Apps Script secara asynchronous di latar belakang (background)
   */
  public async syncFromGoogleSheets(): Promise<boolean> {
    if (this.isSyncing) {
      console.log('[ServerSync] Sinkronisasi sedang berlangsung di latar belakang, abaikan permintaan duplikat.');
      return false;
    }

    if (!this.webAppUrl || !this.webAppUrl.trim()) {
      this.lastError = 'Web App URL belum disetel';
      return false;
    }

    this.isSyncing = true;
    this.lastError = null;
    const startTime = Date.now();
    console.log('[ServerSync] Memulai penarikan data dari Google Sheets...');

    const cleanUrl = this.webAppUrl.trim();
    const fetchUrl = cleanUrl.includes('?')
      ? `${cleanUrl}&action=fetchAll&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`
      : `${cleanUrl}?action=fetchAll&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

      const res = await fetch(fetchUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (json.status !== 'success' || !json.data) {
        throw new Error(json.message || 'Respons Google Apps Script tidak valid');
      }

      const raw = json.data;

      // Sanitasi & dekripsi data
      const newOwners = Array.isArray(raw.owners) ? raw.owners : [];
      const newPets = (Array.isArray(raw.pets) ? raw.pets : []).map((p: any) => {
        const pName = String(p?.name || '').trim().toLowerCase();
        const pType = String(p?.type || '').trim().toLowerCase();
        const isCat = pName.includes('dalgona') || pType.includes('kucing') || pType === 'cat';
        const resolvedType = isCat ? 'Cat' : normalizePetType(p.type, `${p.name || ''} ${p.breed || ''} ${p.notes || ''}`);
        return {
          ...p,
          type: resolvedType,
          photoUrl: decryptPhotoUrl(p.photoUrl),
        };
      });
      const newQueues = (Array.isArray(raw.queues) ? raw.queues : []).map((q: any) => ({
        ...q,
        photoUrl: decryptPhotoUrl(q.photoUrl),
      }));
      const newSoap = (Array.isArray(raw.soapRecords) ? raw.soapRecords : []).map((s: any) => {
        let petId = s.petId ? String(s.petId).trim() : '';
        // Jika petId belum terisi di spreadsheet, cocokkan aman dengan (Nama Hewan + No WA Pemilik / Nama Pemilik)
        if (!petId && s.petName) {
          const cleanName = String(s.petName).toLowerCase().trim();
          const cleanWa = normalizePhoneWithZero(s.ownerWhatsapp);
          const matched = newPets.find((p: any) => {
            const sameName = String(p.name || '').toLowerCase().trim() === cleanName;
            if (!sameName) return false;
            if (cleanWa && normalizePhoneWithZero(p.ownerWhatsapp) === cleanWa) return true;
            if (s.ownerName && String(p.ownerName || '').toLowerCase().trim() === String(s.ownerName).toLowerCase().trim()) return true;
            return false;
          });
          if (matched && matched.id) {
            petId = matched.id;
          }
        }
        return {
          ...s,
          petId: petId || s.petId || '',
          diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments),
        };
      });
      const newCages = Array.isArray(raw.cages) ? raw.cages : [];
      const incomingInventory = Array.isArray(raw.inventory) ? raw.inventory : [];
      const newBookings = Array.isArray(raw.bookings) ? raw.bookings : [];
      const newStaff = Array.isArray(raw.staff) ? raw.staff : [];
      const rawFeedbacks = Array.isArray(raw.feedbacks) ? raw.feedbacks : [];
      const rawSurgeries = Array.isArray(raw.surgeries) ? raw.surgeries : [];

      // Proteksi Integritas Stok Obat & Farmasi:
      // Selaraskan data stok obat dari Google Sheets dengan sanitasi tipe numerik yang ketat
      const sanitizeInvNumbers = (item: any) => ({
        ...item,
        stockQuantity: Number(item.stockQuantity !== undefined ? item.stockQuantity : 0),
        minThreshold: Number(item.minThreshold !== undefined ? item.minThreshold : 10),
        price: Number(item.price !== undefined ? item.price : 0),
      });

      let finalInventory: any[] = [];
      if (incomingInventory.length > 0) {
        // Jika Google Sheets memiliki data inventaris, jadikan Google Sheets sebagai acuan utama
        const incomingMap = new Map<string, any>();
        incomingInventory.forEach((incoming: any) => {
          if (!incoming || !incoming.id || !incoming.name || !String(incoming.name).trim()) return;
          const key = String(incoming.id).trim().toLowerCase();
          incomingMap.set(key, sanitizeInvNumbers(incoming));
        });

        // Pertahankan item lokal hanya jika baru saja ditambahkan di server (belum tersinkronisasi)
        const currentInventory = Array.isArray(this.db.inventory) ? this.db.inventory : [];
        currentInventory.forEach((localItem) => {
          if (!localItem || !localItem.id || !localItem.name || !String(localItem.name).trim()) return;
          const key = String(localItem.id).trim().toLowerCase();
          if (!incomingMap.has(key)) {
            // Cek apakah item lokal baru saja dibuat (misal memiliki flag atau id timestamp sangat baru)
            const isVeryRecent = localItem._isNewPending || (String(localItem.id).startsWith('inv-') && Date.now() - (localItem._createdAt || 0) < 60000);
            if (isVeryRecent) {
              incomingMap.set(key, sanitizeInvNumbers(localItem));
            }
          }
        });

        finalInventory = Array.from(incomingMap.values());
      } else {
        finalInventory = Array.isArray(this.db.inventory)
          ? this.db.inventory.filter((i) => i && i.name && String(i.name).trim()).map(sanitizeInvNumbers)
          : [];
      }

      // Proteksi Status Baca Saran & Ulasan Klien (Badge Tab Kepuasan):
      // Pertahankan status 'isRead: true' lokal agar tidak kembali unread saat Google Sheets ditarik
      const currentFeedbacks = Array.isArray(this.db.feedbacks) ? [...this.db.feedbacks] : [];
      const readStatusMap = new Map<string, { isRead: boolean; readAt?: string }>();
      currentFeedbacks.forEach((f) => {
        if (f && f.id && (f.isRead === true || String(f.isRead).toLowerCase() === 'true')) {
          readStatusMap.set(String(f.id).trim().toLowerCase(), { isRead: true, readAt: f.readAt });
        }
      });
      const finalFeedbacks = rawFeedbacks.map((f: any) => {
        const idKey = String(f?.id || '').trim().toLowerCase();
        const localRead = currentFeedbacks.find(cf => String(cf.id || '').trim().toLowerCase() === idKey);
        const incomingRead = f?.isRead === true || String(f?.isRead).toLowerCase() === 'true';
        const isReadFinal = incomingRead || (localRead?.isRead === true);
        return {
          ...f,
          isRead: isReadFinal,
          readAt: isReadFinal ? (f.readAt || localRead?.readAt || new Date().toISOString()) : '',
        };
      });

      // Proteksi Integritas Akun & Hak Akses Staf:
      // Google Spreadsheet adalah sumber data resmi staf klinik
      const currentStaff = Array.isArray(this.db.staff) ? [...this.db.staff] : [];
      let mergedStaff: any[] = [];

      if (newStaff.length > 0) {
        mergedStaff = newStaff.map((incoming: any) => {
          if (!incoming || !incoming.username) return incoming;
          const u = String(incoming.username).trim().toLowerCase();
          const existing = currentStaff.find(
            (m) => m.id === incoming.id || String(m.username || '').trim().toLowerCase() === u
          );
          const newRole = incoming.role || existing?.role || 'Staff Admin / Frontdesk';
          const updatedIsDoctor =
            incoming.isPracticingDoctor !== undefined
              ? (String(incoming.isPracticingDoctor).toLowerCase() === 'true' || incoming.isPracticingDoctor === true)
              : (existing?.isPracticingDoctor !== undefined ? existing.isPracticingDoctor : newRole === 'Dokter Hewan');
          const updatedPassword =
            incoming.password !== undefined && incoming.password !== null && String(incoming.password).trim() !== ''
              ? String(incoming.password).trim()
              : (existing?.password || '12345');

          return {
            id: incoming.id || existing?.id || `staff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            username: u,
            name: incoming.name || existing?.name || u,
            role: newRole,
            avatar: incoming.avatar || existing?.avatar || (newRole === 'Super Admin / Owner' ? '👑' : newRole === 'Dokter Hewan' ? '👩‍⚕️' : '👨‍💼'),
            isPracticingDoctor: updatedIsDoctor,
            password: updatedPassword,
          };
        }).filter(Boolean);
      } else {
        mergedStaff = currentStaff;
      }

      const incomingActive12 = sanitizeCagesList(newCages);
      const incomingHistory = (newCages || []).filter((c: any) => {
        const id = String(c?.id || '').toLowerCase();
        const st = String(c?.status || '').toLowerCase();
        return id.startsWith('cag-') || id.startsWith('hist-') || id.startsWith('inpatient_hist') || st === 'selesai' || st === 'discharged';
      });
      const prevHistory = (this.db.cages || []).filter((c: any) => {
        const id = String(c?.id || '').toLowerCase();
        const st = String(c?.status || '').toLowerCase();
        return id.startsWith('cag-') || id.startsWith('hist-') || id.startsWith('inpatient_hist') || st === 'selesai' || st === 'discharged';
      });
      const mergedHistory = incomingHistory.length > 0 ? incomingHistory : prevHistory;
      const finalCages = [...incomingActive12, ...mergedHistory];

      this.db = {
        owners: sortOwnersNewestFirst(newOwners),
        pets: sortPetsNewestFirst(newPets),
        queues: newQueues,
        soapRecords: sortSoapNewestFirst(newSoap),
        cages: finalCages,
        inventory: finalInventory,
        bookings: newBookings,
        staff: mergedStaff,
        feedbacks: finalFeedbacks,
        surgeries: rawSurgeries.length > 0 ? rawSurgeries : (this.db.surgeries || []),
      };

      this.isConnected = true;
      this.lastSyncedAt = new Date().toISOString();
      this.version += 1;
      this.partitionColdData();
      this.rebuildIndexes();
      this.reconcileMissingOwnersAndPets();
      this.deduplicatePets();
      this.purgeUnattendedPastQueues();
      this.updateCounts();
      this.saveDatabaseToDisk();

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[ServerSync] Berhasil sinkron dari Google Sheets dalam ${duration} detik! Total: ${this.getTotalRecords()} baris.`
      );
      return true;
    } catch (err: any) {
      this.lastError = err.message || 'Gagal sinkron';
      console.error('[ServerSync] Kesalahan penarikan data Google Sheets:', this.lastError);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upsert single record ke memory & disk seketika, lalu kirim ke Google Sheets di background (O(1))
   */
  public async upsertRecord(table: keyof ClinicDatabase, record: any): Promise<number> {
    if (!record || typeof record !== 'object') return this.version;
    if (table === 'inventory' && (!record.name || !String(record.name).trim())) return this.version;

    const list = this.db[table] as any[];
    const id = record.id;
    let foundIndex = -1;

    if (id !== undefined && id !== null && id !== '') {
      foundIndex = list.findIndex((item) => String(item.id) === String(id));
    }

    if (table === 'staff') {
      if (record.password) {
        const pass = String(record.password).trim();
        record.password = pass;
      } else if (foundIndex >= 0 && list[foundIndex]?.password) {
        // Pertahankan kata sandi lama jika form edit tidak mengisi password baru
        record.password = list[foundIndex].password;
      }
    }

    if (foundIndex >= 0) {
      list[foundIndex] = { ...list[foundIndex], ...record };
    } else {
      list.unshift(record);
    }

    if (table === 'cages') {
      const isHistory = String(record.id || '').toLowerCase().startsWith('cag-') ||
                        String(record.id || '').toLowerCase().startsWith('hist-') ||
                        String(record.id || '').toLowerCase().startsWith('inpatient_hist') ||
                        String(record.status || '').toLowerCase() === 'selesai' ||
                        String(record.status || '').toLowerCase() === 'discharged';
      if (isHistory) {
        // Record rawat inap selesai ditempatkan tepat di baris 14 (indeks 12, setelah 12 kandang fisik aktif)
        const active12 = sanitizeCagesList(this.db.cages);
        const prevHistories = (this.db.cages || []).filter((c) => {
          const cid = String(c?.id || '').toLowerCase();
          const cst = String(c?.status || '').toLowerCase();
          const isOther = cid.startsWith('cag-') || cid.startsWith('hist-') || cid.startsWith('inpatient_hist') || cst === 'selesai' || cst === 'discharged';
          return isOther && String(c?.id) !== String(record.id);
        });
        this.db.cages = [...active12, record, ...prevHistories];
      }
    }

    if (table === 'owners') {
      this.db.owners = sortOwnersNewestFirst(this.db.owners);
    } else if (table === 'pets') {
      this.db.pets = sortPetsNewestFirst(this.db.pets);
    } else if (table === 'soapRecords') {
      this.db.soapRecords = sortSoapNewestFirst(this.db.soapRecords);
    }

    this.version += 1;
    this.rebuildIndexes();
    if (table === 'queues' || table === 'bookings') {
      this.reconcileMissingOwnersAndPets();
    }
    this.saveDatabaseToDisk();

    // Push ke Google Apps Script di background tanpa memblokir response
    this.pushSingleRecordToAppsScript(table, record).catch((err) => {
      console.warn(`[ServerSync] Gagal push record (${table}) ke Google Sheets:`, err.message);
    });

    return this.version;
  }

  /**
   * PENGHAPUSAN KASKADE: PEMILIK
   * Menghapus data pemilik beserta SELURUH data terkait (pasien, rekam medis, antrean, booking, feedback, kandang)
   */
  public async deleteOwnerCascading(ownerId: string): Promise<number> {
    const targetOwnerIdStr = String(ownerId || '').trim().toLowerCase();
    const targetOwner = this.db.owners.find((o) => String(o.id || '').trim().toLowerCase() === targetOwnerIdStr);
    const cleanPhone = targetOwner ? normalizePhoneWithZero(targetOwner.whatsapp) : '';
    const ownerName = targetOwner?.name ? String(targetOwner.name).toLowerCase().trim() : '';

    // 1. Cari semua pasien milik owner ini (utamakan ownerId, fallback WA + Nama jika tidak ada ownerId)
    const ownerPets = this.db.pets.filter((p) => {
      const pOwnerId = p.ownerId ? String(p.ownerId).trim().toLowerCase() : '';
      if (pOwnerId) return pOwnerId === targetOwnerIdStr;
      if (!pOwnerId && cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone &&
          String(p.ownerName || '').toLowerCase().trim() === ownerName
        );
      }
      return false;
    });
    const ownerPetIds = new Set(ownerPets.map((p) => String(p.id || '').trim().toLowerCase()));

    // 2. Hapus Pemilik
    this.db.owners = this.db.owners.filter((o) => String(o.id || '').trim().toLowerCase() !== targetOwnerIdStr);

    // 3. Hapus Seluruh Pasien Terkait & Kumpulkan ID-nya
    const deletedPetIds: string[] = [];
    this.db.pets = this.db.pets.filter((p) => {
      const pId = String(p.id || '').trim().toLowerCase();
      let shouldDelete = ownerPetIds.has(pId);
      const pOwnerId = p.ownerId ? String(p.ownerId).trim().toLowerCase() : '';
      if (!shouldDelete && !pOwnerId && cleanPhone && ownerName) {
        if (
          normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone &&
          String(p.ownerName || '').toLowerCase().trim() === ownerName
        ) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        if (p.id) deletedPetIds.push(String(p.id));
        return false;
      }
      return true;
    });

    // 4. Hapus Seluruh Rekam Medis (SOAP Records) Terkait & Kumpulkan ID-nya
    const deletedSoapIds: string[] = [];
    const isSoapBelongsToOwner = (s: any) => {
      const sPetId = s.petId ? String(s.petId).trim().toLowerCase() : '';
      if (sPetId && ownerPetIds.has(sPetId)) return true;
      if (!sPetId && cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(s.ownerWhatsapp) === cleanPhone &&
          String(s.ownerName || '').toLowerCase().trim() === ownerName
        );
      }
      return false;
    };
    this.db.soapRecords = this.db.soapRecords.filter((s) => {
      if (isSoapBelongsToOwner(s)) {
        if (s.id) deletedSoapIds.push(String(s.id));
        return false;
      }
      return true;
    });
    this.archiveSoapRecords = this.archiveSoapRecords.filter((s) => {
      if (isSoapBelongsToOwner(s)) {
        if (s.id) deletedSoapIds.push(String(s.id));
        return false;
      }
      return true;
    });
    this.saveArchiveToDisk();

    // 5. Hapus dari Antrean Live & Kumpulkan ID-nya
    const deletedQueueIds: string[] = [];
    this.db.queues = this.db.queues.filter((q) => {
      const qPetId = q.petId ? String(q.petId).trim().toLowerCase() : '';
      let shouldDelete = Boolean(qPetId && ownerPetIds.has(qPetId));
      const qOwnerId = q.ownerId ? String(q.ownerId).trim().toLowerCase() : '';
      if (qOwnerId && qOwnerId === targetOwnerIdStr) shouldDelete = true;
      if (!shouldDelete && !qPetId && !qOwnerId && cleanPhone && ownerName) {
        if (
          normalizePhoneWithZero(q.ownerWhatsapp) === cleanPhone &&
          String(q.ownerName || '').toLowerCase().trim() === ownerName
        ) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        if (q.id) deletedQueueIds.push(String(q.id));
        return false;
      }
      return true;
    });

    // 6. Bersihkan Kandang Rawat Inap & Hapus Riwayat Rawat Inap Terkait
    const cageIds = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];
    const updatedCages: any[] = [];
    const deletedCageHistIds: string[] = [];

    (this.db.cages || []).forEach((cage) => {
      const cid = String(cage.id || '').toUpperCase().trim();
      const isActiveCage = cageIds.includes(cid);
      const cagePetId = cage.petId ? String(cage.petId).trim().toLowerCase() : '';
      
      let isTargetOwner = false;
      if (cagePetId) {
        isTargetOwner = ownerPetIds.has(cagePetId);
      } else if (cleanPhone && ownerName) {
        isTargetOwner = (
          normalizePhoneWithZero(cage.ownerWhatsapp) === cleanPhone &&
          String(cage.ownerName || '').toLowerCase().trim() === ownerName
        );
      }

      if (isActiveCage) {
        if (isTargetOwner) {
          updatedCages.push({
            ...cage,
            status: 'Available',
            petId: undefined,
            petName: undefined,
            petType: undefined,
            ownerName: undefined,
            ownerWhatsapp: undefined,
            diagnosis: undefined,
            admittedAt: undefined,
            veterinarian: undefined,
            observations: [],
          });
        } else {
          updatedCages.push(cage);
        }
      } else {
        if (isTargetOwner) {
          deletedCageHistIds.push(cage.id);
        } else {
          updatedCages.push(cage);
        }
      }
    });
    this.db.cages = updatedCages;

    // 7. Hapus Booking Terkait & Kumpulkan ID-nya
    const deletedBookingIds: string[] = [];
    this.db.bookings = this.db.bookings.filter((b) => {
      const bPetId = b.petId ? String(b.petId).trim().toLowerCase() : '';
      let shouldDelete = Boolean(bPetId && ownerPetIds.has(bPetId));
      const bOwnerId = b.ownerId ? String(b.ownerId).trim().toLowerCase() : '';
      if (bOwnerId && bOwnerId === targetOwnerIdStr) shouldDelete = true;
      if (!shouldDelete && !bPetId && !bOwnerId && cleanPhone && ownerName) {
        if (
          normalizePhoneWithZero(b.ownerWhatsapp) === cleanPhone &&
          String(b.ownerName || '').toLowerCase().trim() === ownerName
        ) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        if (b.id) deletedBookingIds.push(String(b.id));
        return false;
      }
      return true;
    });

    // 8. Hapus Feedback Terkait & Kumpulkan ID-nya
    const deletedFeedbackIds: string[] = [];
    this.db.feedbacks = this.db.feedbacks.filter((f) => {
      const fOwnerId = f.ownerId ? String(f.ownerId).trim().toLowerCase() : '';
      let shouldDelete = Boolean(fOwnerId && fOwnerId === targetOwnerIdStr);
      if (!shouldDelete && !fOwnerId && cleanPhone && ownerName) {
        if (
          normalizePhoneWithZero(f.ownerWhatsapp) === cleanPhone &&
          String(f.ownerName || '').toLowerCase().trim() === ownerName
        ) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        if (f.id) deletedFeedbackIds.push(String(f.id));
        return false;
      }
      return true;
    });

    // 9. Hapus Tindakan Operasi Terkait & Kumpulkan ID-nya
    const deletedSurgeryIds: string[] = [];
    this.db.surgeries = (this.db.surgeries || []).filter((s) => {
      const sPetId = s.petId ? String(s.petId).trim().toLowerCase() : '';
      let shouldDelete = Boolean(sPetId && deletedPetIds.includes(sPetId));
      if (!shouldDelete && cleanPhone && s.ownerWhatsapp) {
        if (normalizePhoneWithZero(s.ownerWhatsapp) === cleanPhone) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        if (s.id) deletedSurgeryIds.push(String(s.id));
        return false;
      }
      return true;
    });

    this.version += 1;
    this.rebuildIndexes();
    this.updateCounts();
    this.saveDatabaseToDisk();

    console.log(
      `[ServerSync] Kaskade Hapus Pemilik ID '${ownerId}' selesai: ` +
      `${deletedPetIds.length} pasien, ${deletedSoapIds.length} soap, ${deletedQueueIds.length} antrean, ` +
      `${deletedCageHistIds.length} riwayat kandang, ${deletedSurgeryIds.length} operasi dibersihkan.`
    );

    // Push delete command ke Google Apps Script secara instan untuk SELURUH baris data yang terdampak
    try {
      await this.pushDeleteToAppsScript('owners', ownerId);
      await Promise.all([
        ...deletedPetIds.map((pId) => this.pushDeleteToAppsScript('pets', pId)),
        ...deletedSoapIds.map((sId) => this.pushDeleteToAppsScript('soapRecords', sId)),
        ...deletedQueueIds.map((qId) => this.pushDeleteToAppsScript('queues', qId)),
        ...deletedCageHistIds.map((histId) => this.pushDeleteToAppsScript('cages', histId)),
        ...deletedBookingIds.map((bId) => this.pushDeleteToAppsScript('bookings', bId)),
        ...deletedFeedbackIds.map((fId) => this.pushDeleteToAppsScript('feedbacks', fId)),
        ...deletedSurgeryIds.map((surgId) => this.pushDeleteToAppsScript('surgeries', surgId)),
      ]);
    } catch (err: any) {
      console.warn('[ServerSync] Gagal push cascading delete ke Google Sheets:', err.message);
    }

    return this.version;
  }

  /**
   * PENGHAPUSAN KASKADE: PASIEN
   * Jika pemilik memiliki > 1 pasien -> HANYA hapus pasien ini & rekam mediknya.
   * Jika pemilik HANYA memiliki 1 pasien -> Hapus SEMUANYA (pasien, pemilik, rekam medik, dsb).
   */
  public async deletePetCascading(petId: string): Promise<number> {
    const targetPetIdStr = String(petId || '').trim().toLowerCase();
    const targetPet = this.db.pets.find((p) => String(p.id || '').trim().toLowerCase() === targetPetIdStr);
    
    if (!targetPet) {
      this.db.pets = this.db.pets.filter((p) => String(p.id || '').trim().toLowerCase() !== targetPetIdStr);
      this.db.soapRecords = this.db.soapRecords.filter((s) => String(s.petId || '').trim().toLowerCase() !== targetPetIdStr);
      this.archiveSoapRecords = this.archiveSoapRecords.filter((s) => String(s.petId || '').trim().toLowerCase() !== targetPetIdStr);
      this.saveArchiveToDisk();
      this.db.queues = this.db.queues.filter((q) => String(q.petId || '').trim().toLowerCase() !== targetPetIdStr);
      this.version += 1;
      this.rebuildIndexes();
      this.updateCounts();
      this.saveDatabaseToDisk();
      return this.version;
    }

    const cleanPhone = normalizePhoneWithZero(targetPet.ownerWhatsapp);
    const petName = String(targetPet.name || '').toLowerCase().trim();
    const targetOwnerId = targetPet.ownerId ? String(targetPet.ownerId).trim().toLowerCase() : '';
    const targetOwnerName = targetPet.ownerName ? String(targetPet.ownerName).toLowerCase().trim() : '';

    // Cari data pemilik terkait
    const matchedOwner = this.db.owners.find((o) => {
      const oId = String(o.id || '').trim().toLowerCase();
      if (targetOwnerId && oId === targetOwnerId) return true;
      if (!targetOwnerId && cleanPhone && targetOwnerName) {
        return (
          normalizePhoneWithZero(o.whatsapp) === cleanPhone &&
          String(o.name || '').toLowerCase().trim() === targetOwnerName
        );
      }
      return false;
    });

    // Cari seluruh pasien yang dimiliki oleh pemilik ini
    const allOwnerPets = this.db.pets.filter((p) => {
      if (matchedOwner) {
        const pOwnerId = p.ownerId ? String(p.ownerId).trim().toLowerCase() : '';
        if (pOwnerId && pOwnerId === String(matchedOwner.id).trim().toLowerCase()) return true;
        if (!pOwnerId && cleanPhone && targetOwnerName) {
          return (
            normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone &&
            String(p.ownerName || '').toLowerCase().trim() === targetOwnerName
          );
        }
      }
      return false;
    });

    const isSinglePetOwner = allOwnerPets.length <= 1;

    if (isSinglePetOwner && matchedOwner) {
      // Pemilik hanya punya 1 pasien ini -> Hapus kaskade penuh pemilik & seluruh data terkait
      console.log(`[ServerSync] Pasien '${targetPet.name}' adalah satu-satunya hewan pemilik '${matchedOwner.name}'. Melakukan penghapusan kaskade penuh.`);
      return this.deleteOwnerCascading(String(matchedOwner.id));
    }

    // Pemilik memiliki hewan lain -> HANYA hapus pasien ini dan data terkaitnya
    console.log(`[ServerSync] Pemilik '${matchedOwner?.name || targetPet.ownerName}' memiliki ${allOwnerPets.length} hewan. Hanya menghapus pasien '${targetPet.name}' (ID: ${petId}) dan data terkaitnya.`);
    
    // 1. Hapus Pasien
    this.db.pets = this.db.pets.filter((p) => String(p.id || '').trim().toLowerCase() !== targetPetIdStr);

    // 2. Hapus Rekam Medis (SOAP Records) Pasien Ini & Kumpulkan ID-nya
    const deletedSoapIds: string[] = [];
    const isSoapBelongsToPet = (s: any) => {
      const sPetId = s.petId ? String(s.petId).trim().toLowerCase() : '';
      if (sPetId) return sPetId === targetPetIdStr;
      if (!sPetId && cleanPhone && petName) {
        return (
          String(s.petName || '').toLowerCase().trim() === petName &&
          normalizePhoneWithZero(s.ownerWhatsapp) === cleanPhone
        );
      }
      return false;
    };
    this.db.soapRecords = this.db.soapRecords.filter((s) => {
      if (isSoapBelongsToPet(s)) {
        if (s.id) deletedSoapIds.push(String(s.id));
        return false;
      }
      return true;
    });
    this.archiveSoapRecords = this.archiveSoapRecords.filter((s) => {
      if (isSoapBelongsToPet(s)) {
        if (s.id) deletedSoapIds.push(String(s.id));
        return false;
      }
      return true;
    });
    this.saveArchiveToDisk();

    // 3. Hapus Antrean Pasien Ini & Kumpulkan ID-nya
    const deletedQueueIds: string[] = [];
    this.db.queues = this.db.queues.filter((q) => {
      const qPetId = q.petId ? String(q.petId).trim().toLowerCase() : '';
      let shouldDelete = Boolean(qPetId && qPetId === targetPetIdStr);
      if (!shouldDelete && !qPetId && cleanPhone && petName) {
        if (
          String(q.petName || '').toLowerCase().trim() === petName &&
          normalizePhoneWithZero(q.ownerWhatsapp) === cleanPhone
        ) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        if (q.id) deletedQueueIds.push(String(q.id));
        return false;
      }
      return true;
    });

    // 4. Kosongkan kandang rawat inap jika pasien ini sedang dirawat & Hapus Riwayat Rawat Inap Pasien Ini
    const cageIds = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];
    const updatedCages: any[] = [];
    const deletedCageHistIds: string[] = [];

    (this.db.cages || []).forEach((cage) => {
      const cid = String(cage.id || '').toUpperCase().trim();
      const isActiveCage = cageIds.includes(cid);
      const cagePetId = cage.petId ? String(cage.petId).trim().toLowerCase() : '';
      
      let isTargetPet = false;
      if (cagePetId) {
        isTargetPet = cagePetId === targetPetIdStr;
      } else if (cleanPhone && petName) {
        isTargetPet = (
          String(cage.petName || '').toLowerCase().trim() === petName &&
          normalizePhoneWithZero(cage.ownerWhatsapp) === cleanPhone
        );
      }

      if (isActiveCage) {
        if (isTargetPet) {
          updatedCages.push({
            ...cage,
            status: 'Available',
            petId: undefined,
            petName: undefined,
            petType: undefined,
            ownerName: undefined,
            ownerWhatsapp: undefined,
            diagnosis: undefined,
            admittedAt: undefined,
            veterinarian: undefined,
            observations: [],
          });
        } else {
          updatedCages.push(cage);
        }
      } else {
        if (isTargetPet) {
          deletedCageHistIds.push(cage.id);
        } else {
          updatedCages.push(cage);
        }
      }
    });
    this.db.cages = updatedCages;

    // 5. Hapus Booking Terkait Pasien Ini & Kumpulkan ID-nya
    const deletedBookingIds: string[] = [];
    this.db.bookings = this.db.bookings.filter((b) => {
      const bPetId = b.petId ? String(b.petId).trim().toLowerCase() : '';
      let shouldDelete = Boolean(bPetId && bPetId === targetPetIdStr);
      if (!shouldDelete && !bPetId && cleanPhone && petName) {
        if (
          String(b.petName || '').toLowerCase().trim() === petName &&
          normalizePhoneWithZero(b.ownerWhatsapp) === cleanPhone
        ) {
          shouldDelete = true;
        }
      }
      if (shouldDelete) {
        if (b.id) deletedBookingIds.push(String(b.id));
        return false;
      }
      return true;
    });

    this.version += 1;
    this.rebuildIndexes();
    this.updateCounts();
    this.saveDatabaseToDisk();

    // Push delete command ke Google Apps Script secara instan untuk SELURUH baris data yang terdampak
    try {
      await this.pushDeleteToAppsScript('pets', petId);
      await Promise.all([
        ...deletedSoapIds.map((sId) => this.pushDeleteToAppsScript('soapRecords', sId)),
        ...deletedQueueIds.map((qId) => this.pushDeleteToAppsScript('queues', qId)),
        ...deletedCageHistIds.map((histId) => this.pushDeleteToAppsScript('cages', histId)),
        ...deletedBookingIds.map((bId) => this.pushDeleteToAppsScript('bookings', bId)),
      ]);
    } catch (err: any) {
      console.warn('[ServerSync] Gagal push pet delete ke Google Sheets:', err.message);
    }

    return this.version;
  }

  /**
   * Hapus single record dari memory & disk
   */
  public async deleteRecord(table: keyof ClinicDatabase, id: string): Promise<number> {
    if (table === 'owners') {
      return this.deleteOwnerCascading(id);
    }
    if (table === 'pets') {
      return this.deletePetCascading(id);
    }

    if (table === 'soapRecords') {
      const targetIdStr = String(id || '').trim().toLowerCase();
      const targetSoap = this.getAllSoaps().find((s) => String(s.id || '').trim().toLowerCase() === targetIdStr);
      this.db.soapRecords = this.db.soapRecords.filter((item) => String(item.id || '').trim().toLowerCase() !== targetIdStr);
      this.archiveSoapRecords = this.archiveSoapRecords.filter((item) => String(item.id || '').trim().toLowerCase() !== targetIdStr);
      this.saveArchiveToDisk();

      // Jika rekam medis ini berasal dari rawat inap selesai, sinkronkan hapus juga di tabel cages (baris 14+)
      if (targetSoap) {
        const isRawatInap =
          String(targetSoap.soap?.subjective || '').toLowerCase().includes('rawat inap') ||
          String(targetSoap.soap?.assessment || '').toLowerCase().includes('rawat inap') ||
          String(targetSoap.id || '').toLowerCase().includes('hist');

        if (isRawatInap && targetSoap.petId) {
          const matchedCageHist = this.db.cages.find((c) => {
            const cid = String(c.id || '').toLowerCase();
            const cst = String(c.status || '').toLowerCase();
            const isHist = cid.startsWith('inpatient_hist') || cid.startsWith('cag-') || cid.startsWith('hist-') || cst === 'selesai' || cst === 'discharged';
            return isHist && String(c.petId) === String(targetSoap.petId);
          });
          if (matchedCageHist) {
            this.db.cages = this.db.cages.filter((c) => String(c.id) !== String(matchedCageHist.id));
            await this.pushDeleteToAppsScript('cages', matchedCageHist.id).catch(() => {});
          }
        }
      }
    } else if (table === 'cages') {
      const targetIdStr = String(id || '').trim().toLowerCase();
      const targetCage = this.db.cages.find((c) => String(c.id || '').trim().toLowerCase() === targetIdStr);
      this.db.cages = this.db.cages.filter((item) => String(item.id || '').trim().toLowerCase() !== targetIdStr);

      if (targetCage && targetCage.petId) {
        const matchedSoap = this.getAllSoaps().find((s) => {
          return (
            String(s.petId) === String(targetCage.petId) &&
            (String(s.soap?.subjective || '').toLowerCase().includes('rawat inap') ||
             String(s.soap?.assessment || '').toLowerCase().includes('rawat inap') ||
             String(s.id || '').trim().toLowerCase() === targetIdStr)
          );
        });
        if (matchedSoap) {
          const mIdStr = String(matchedSoap.id || '').trim().toLowerCase();
          this.db.soapRecords = this.db.soapRecords.filter((s) => String(s.id || '').trim().toLowerCase() !== mIdStr);
          this.archiveSoapRecords = this.archiveSoapRecords.filter((s) => String(s.id || '').trim().toLowerCase() !== mIdStr);
          this.saveArchiveToDisk();
          await this.pushDeleteToAppsScript('soapRecords', matchedSoap.id).catch(() => {});
        }
      }
    } else {
      const targetIdStr = String(id || '').trim().toLowerCase();
      const list = this.db[table] as any[];
      this.db[table] = list.filter((item) => String(item.id || '').trim().toLowerCase() !== targetIdStr);
    }

    this.version += 1;
    this.rebuildIndexes();
    this.updateCounts();
    this.saveDatabaseToDisk();

    // Tunggu konfirmasi penghapusan dari Google Apps Script agar tidak ada jeda / delay sinkronisasi
    await this.pushDeleteToAppsScript(table, id).catch(() => {});
    return this.version;
  }

  /**
   * Push delete command langsung ke Google Apps Script (asynchronous)
   */
  private async pushDeleteToAppsScript(table: keyof ClinicDatabase, id: string): Promise<void> {
    if (!this.webAppUrl || !this.webAppUrl.trim()) return;

    try {
      const payload = JSON.stringify({
        action: 'delete',
        table,
        id: String(id),
        clinicSecretToken: CLINIC_APP_HANDSHAKE_TOKEN,
        timestamp: new Date().toISOString(),
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(this.webAppUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: payload,
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[ServerSync] Delete on GAS failed: HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.warn(`[ServerSync] Delete on GAS error:`, err.message);
    }
  }

  /**
   * Push single record langsung ke Google Apps Script (asynchronous)
   */
  private async pushSingleRecordToAppsScript(table: keyof ClinicDatabase, record: any): Promise<void> {
    if (!this.webAppUrl || !this.webAppUrl.trim()) return;

    let recordToPush = { ...record };
    if ('whatsapp' in recordToPush && recordToPush.whatsapp) {
      recordToPush.whatsapp = normalizePhoneWithZero(recordToPush.whatsapp);
    }
    if ('ownerWhatsapp' in recordToPush && recordToPush.ownerWhatsapp) {
      recordToPush.ownerWhatsapp = normalizePhoneWithZero(recordToPush.ownerWhatsapp);
    }
    if (table === 'pets' && 'photoUrl' in recordToPush) {
      recordToPush.photoUrl = encryptPhotoUrl(recordToPush.photoUrl);
    }
    if (table === 'queues' && 'photoUrl' in recordToPush) {
      recordToPush.photoUrl = encryptPhotoUrl(recordToPush.photoUrl);
    }
    if (table === 'soapRecords' && 'diagnosticAttachments' in recordToPush) {
      recordToPush.diagnosticAttachments = encryptDiagnosticAttachments(recordToPush.diagnosticAttachments);
    }
    if (table === 'cages') {
      const isHistory = String(recordToPush.id || '').toLowerCase().startsWith('cag-') ||
                        String(recordToPush.id || '').toLowerCase().startsWith('hist-') ||
                        String(recordToPush.id || '').toLowerCase().startsWith('inpatient_hist') ||
                        String(recordToPush.status || '').toLowerCase() === 'selesai' ||
                        String(recordToPush.status || '').toLowerCase() === 'discharged';
      if (!isHistory) {
        recordToPush.id = normalizeCageId(recordToPush.id, recordToPush.label) || recordToPush.id;
      }
    }

    const payload = JSON.stringify({
      action: 'upsert',
      table: table,
      record: recordToPush,
      clinicSecretToken: CLINIC_APP_HANDSHAKE_TOKEN,
      timestamp: new Date().toISOString(),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(this.webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[ServerSync] Apps script response error: HTTP ${res.status}`);
    }
  }

  public getVersion(): number {
    return this.version;
  }

  /**
   * Memverifikasi apakah record tertentu sudah tersimpan di Backend Memory/Disk dan Google Spreadsheet
   */
  public async verifyRecordExists(
    table: keyof ClinicDatabase,
    id: string
  ): Promise<{ inBackend: boolean; inSpreadsheet: boolean }> {
    const targetId = String(id || '').trim().toLowerCase();

    // 1. Cek di backend internal database
    let inBackend = false;
    if (table === 'soapRecords') {
      inBackend = this.getAllSoaps().some((s) => String(s.id || '').trim().toLowerCase() === targetId);
    } else {
      const records = this.db[table] || [];
      inBackend = records.some((r: any) => String(r.id || '').trim().toLowerCase() === targetId);
    }

    // 2. Cek di Google Apps Script Spreadsheet (jika URL terkonfigurasi)
    let inSpreadsheet = false;
    if (this.webAppUrl && this.webAppUrl.trim()) {
      try {
        const checkUrl = `${this.webAppUrl.trim()}?action=exists&table=${encodeURIComponent(
          table
        )}&id=${encodeURIComponent(id)}&clinicSecretToken=${encodeURIComponent(
          CLINIC_APP_HANDSHAKE_TOKEN
        )}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(checkUrl, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow',
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success') {
            inSpreadsheet = Boolean(json.exists);
          }
        }
      } catch {
        inSpreadsheet = false;
      }
    } else {
      inSpreadsheet = false;
    }

    return { inBackend, inSpreadsheet };
  }

  /**
   * Update seluruh tabel (misal urutan antrean atau status kandang)
   */
  public async updateTable(table: keyof ClinicDatabase, records: any[]): Promise<number> {
    if (table === 'cages') {
      const active12 = sanitizeCagesList(records);
      const incomingHistory = (records || []).filter((r) => {
        const id = String(r?.id || '').toLowerCase();
        const st = String(r?.status || '').toLowerCase();
        return id.startsWith('cag-') || id.startsWith('hist-') || id.startsWith('inpatient_hist') || st === 'selesai' || st === 'discharged';
      });
      const existingHistory = (this.db.cages || []).filter((r) => {
        const id = String(r?.id || '').toLowerCase();
        const st = String(r?.status || '').toLowerCase();
        return id.startsWith('cag-') || id.startsWith('hist-') || id.startsWith('inpatient_hist') || st === 'selesai' || st === 'discharged';
      });
      const finalHistory = incomingHistory.length > 0 ? incomingHistory : existingHistory;
      this.db.cages = [...active12, ...finalHistory];
      records = this.db.cages;
    } else {
      this.db[table] = records;
    }
    this.version += 1;
    this.rebuildIndexes();
    this.saveDatabaseToDisk();

    // Push tabel ke Google Sheets di background
    this.pushTableToAppsScript(table, records).catch((err) => {
      console.warn(`[ServerSync] Gagal push tabel (${table}) ke Google Sheets:`, err.message);
    });

    return this.version;
  }

  private async pushTableToAppsScript(table: keyof ClinicDatabase, records: any[]): Promise<void> {
    if (!this.webAppUrl || !this.webAppUrl.trim()) return;

    let targetRecords = records;
    if (table === 'cages') {
      const active12 = sanitizeCagesList(records);
      const historyRecords = (records || []).filter((r) => {
        const id = String(r?.id || '').toLowerCase();
        const st = String(r?.status || '').toLowerCase();
        return id.startsWith('cag-') || id.startsWith('hist-') || id.startsWith('inpatient_hist') || st === 'selesai' || st === 'discharged';
      });
      targetRecords = [...active12, ...historyRecords];
    }
    const sanitizedRecords = targetRecords.map((rec) => {
      if (!rec || typeof rec !== 'object') return rec;
      const copy = { ...rec };
      if ('whatsapp' in copy && copy.whatsapp) copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      if (table === 'pets' && 'photoUrl' in copy) copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      if (table === 'queues' && 'photoUrl' in copy) copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      if (table === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (table === 'cages') {
        const isHistory = String(copy.id || '').toLowerCase().startsWith('cag-') ||
                          String(copy.id || '').toLowerCase().startsWith('hist-') ||
                          String(copy.id || '').toLowerCase().startsWith('inpatient_hist') ||
                          String(copy.status || '').toLowerCase() === 'selesai' ||
                          String(copy.status || '').toLowerCase() === 'discharged';
        if (!isHistory) {
          copy.id = normalizeCageId(copy.id, copy.label) || copy.id;
        }
      }
      return copy;
    });

    const payload = JSON.stringify({
      action: 'syncAll',
      clinicSecretToken: CLINIC_APP_HANDSHAKE_TOKEN,
      timestamp: new Date().toISOString(),
      data: { [table]: sanitizedRecords },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    await fetch(this.webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);
  }

  /**
   * Jalankan worker polling otomatis di background
   */
  public startBackgroundWorker() {
    // 1. Jalankan initial pull seketika saat server boot
    this.syncFromGoogleSheets().catch(() => {});

    // 2. Loop polling ping setiap 30 detik
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);

    this.pollIntervalId = setInterval(async () => {
      if (!this.autoSync || this.isSyncing) return;

      // Debounce: jangan sync jika baru saja sync dalam 30 detik terakhir
      if (this.lastSyncedAt && (Date.now() - new Date(this.lastSyncedAt).getTime() < 30000)) return;

      try {
        const pingUrl = this.webAppUrl.includes('?')
          ? `${this.webAppUrl}&action=ping&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`
          : `${this.webAppUrl}?action=ping&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(pingUrl, { signal: controller.signal, redirect: 'follow' });
        clearTimeout(timeout);

        if (!res.ok) return;
        const json = await res.json();

        if (json.status === 'success' && json.counts) {
          const currentCounts = this.getCounts();
          let changed = false;

          for (const key of Object.keys(json.counts)) {
            if (json.counts[key] !== (currentCounts as any)[key]) {
              changed = true;
              break;
            }
          }

          if (changed) {
            console.log('[ServerSync] Deteksi perubahan baris di Google Sheets, memulai sinkronisasi otomatis...');
            await this.syncFromGoogleSheets();
          }
        }
      } catch (err: any) {
        // Abaikan kesalahan ping sesaat
      }
    }, 60000);
  }

  public stopBackgroundWorker() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }
}

export const syncManager = new ServerSyncManager();
