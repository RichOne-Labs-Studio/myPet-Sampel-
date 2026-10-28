import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Owner,
  Pet,
  VisitQueue,
  SoapRecord,
  InpatientCage,
  InpatientHistoryRecord,
  InventoryItem,
  BookingAppointment,
  StaffUser,
  StaffRole,
  CustomerFeedback,
  PrescriptionItem,
  DiagnosticAttachment,
  InpatientObservation,
  PetType,
  ServiceType,
  CageStatus,
  SpreadsheetConfig,
  SyncStatus,
  PendingWriteVerification,
  SurgeryRecord,
} from '../types';
import {
  INITIAL_STAFF,
  INITIAL_OWNERS,
  INITIAL_PETS,
  INITIAL_QUEUES,
  INITIAL_INVENTORY,
  INITIAL_SOAP_RECORDS,
  INITIAL_CAGES,
  INITIAL_BOOKINGS,
  INITIAL_FEEDBACKS,
  INITIAL_SURGERIES,
} from '../mockData';
import {
  DEFAULT_SPREADSHEET_CONFIG,
  SpreadsheetDatabaseSchema,
  testSpreadsheetConnection,
  pullFullDatabaseFromSpreadsheet,
  pushFullDatabaseToSpreadsheet,
  pushTableToSpreadsheet,
  pushSingleRecordToSpreadsheet,
  deleteRecordFromSpreadsheet,
} from '../database/spreadsheetDb';
import {
  fetchDatabaseFromBackend,
  fetchStatusFromBackend,
  triggerBackendSync,
  pushRecordToBackend,
  deleteRecordFromBackend,
  pushTableToBackend,
  updateBackendConfig,
  setLocalDatabaseFallback,
  hasBackendServer,
  setBackendAvailable,
  fetchPublicLiveQueues,
  verifyWriteStatusFromBackend,
} from '../database/backendSyncClient';
import { normalizePhoneWithZero } from '../utils/phoneUtils';
import { decryptPhotoUrl, decryptDiagnosticAttachments, verifyPassword, CLINIC_APP_HANDSHAKE_TOKEN } from '../utils/cryptoUtils';
import { normalizeCageId, sanitizeCagesList } from '../utils/cageUtils';
import { normalizePetType } from '../utils/petUtils';
import { getPracticingDoctorNames } from '../utils/staffUtils';
import {
  getRegistrationTimestamp,
  isToday,
  convertAmPmTo24h,
  sanitizeIsoToLocalString,
  sortOwnersNewestFirst,
  sortPetsNewestFirst,
  sortSoapNewestFirst,
} from '../utils/dateUtils';
import { generateSequentialId, generateNextTicketNumber } from '../utils/idGenerator';
import { getIdbItem, setIdbItem, clearAllIdb } from '../utils/idbStorage';

/**
 * Auto-sync SATU tabel ke Google Spreadsheet, dengan debounce sendiri per tabel.
 * Menghindari echo-loop saat data baru ditarik dari Google Sheets menggunakan isRemoteSyncRef.
 */
function useAutoSyncTable<T>(
  table: keyof SpreadsheetDatabaseSchema,
  value: T[],
  config: SpreadsheetConfig,
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>,
  setLastSyncMessage: React.Dispatch<React.SetStateAction<string | null>>,
  markSynced: (nowStr: string) => void,
  isRemoteSyncRef: React.MutableRefObject<boolean>,
  hasInitialSyncedRef: React.MutableRefObject<boolean>
) {
  const firstRun = useRef(true);
  const prevSerializedRef = useRef<string>(JSON.stringify(value));
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    const serialized = JSON.stringify(value);

    // Pada pendorongan pertama, simpan snapshot dan lewati
    if (firstRun.current) {
      firstRun.current = false;
      prevSerializedRef.current = serialized;
      return;
    }

    if (!config.isConnected || !config.autoSync || !config.webAppUrl) {
      prevSerializedRef.current = serialized;
      return;
    }

    // Jangan push ke spreadsheet jika proses penarikan data awal saat booting belum selesai
    if (!hasInitialSyncedRef.current) {
      prevSerializedRef.current = serialized;
      return;
    }

    // Jika data baru saja ditarik dari Google Spreadsheet, perbarui snapshot dan jangan push
    if (isRemoteSyncRef.current) {
      prevSerializedRef.current = serialized;
      return;
    }

    // Safeguard penting: Jangan auto-push array kosong untuk tabel vital klinik agar tidak menimpa sheet dengan kosong
    if (Array.isArray(value) && value.length === 0 && (table === 'owners' || table === 'pets' || table === 'cages' || table === 'staff' || table === 'soapRecords')) {
      prevSerializedRef.current = serialized;
      return;
    }

    // Jika isi data lokal tidak berubah sama sekali, jangan push ke Spreadsheet
    if (serialized === prevSerializedRef.current) {
      return;
    }

    prevSerializedRef.current = serialized;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      if (isRemoteSyncRef.current) return;
      try {
        setSyncStatus('syncing');
        const res = await pushTableToSpreadsheet(config.webAppUrl, table, value);
        if (res.success) {
          const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
          markSynced(nowStr);
          setSyncStatus('connected');
          setLastSyncMessage(`Tabel "${table}" tersimpan di Spreadsheet (${nowStr} WIB)`);
        } else {
          setSyncStatus('error');
          setLastSyncMessage(res.message);
        }
      } catch (err: any) {
        setSyncStatus('error');
        setLastSyncMessage(err.message || 'Auto-sync gagal');
      }
    }, 1500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, config.isConnected, config.autoSync, config.webAppUrl]);
}

interface RegisterData {
  owner: {
    name: string;
    whatsapp: string;
    address: string;
  };
  pet: {
    name: string;
    type: PetType;
    breed: string;
    ageOrDob: string;
    sex: 'Jantan' | 'Betina';
    photoUrl?: string;
  };
  visit: {
    chiefComplaint: string;
    serviceType: ServiceType;
  };
  informedConsent?: string;
}

interface CallNotification {
  ticketNumber: string;
  petName: string;
  ownerName: string;
  room: string;
  timestamp: string;
}

interface ClinicContextType {
  owners: Owner[];
  pets: Pet[];
  queues: VisitQueue[];
  inventory: InventoryItem[];
  cages: InpatientCage[];
  inpatientHistory: InpatientHistoryRecord[];
  soapRecords: SoapRecord[];
  bookings: BookingAppointment[];
  feedbacks: CustomerFeedback[];
  surgeries: SurgeryRecord[];
  staffList: StaffUser[];
  currentUser: StaffUser | null;
  currentServingTicket: string;
  activePatientTicket: string | null;
  callNotification: CallNotification | null;

  // Spreadsheet Database Connection & Sync
  spreadsheetConfig: SpreadsheetConfig;
  syncStatus: SyncStatus;
  lastSyncMessage: string | null;
  dataVersion: number;
  triggerDataRefresh: () => void;
  connectSpreadsheet: (url: string) => Promise<{ success: boolean; message: string }>;
  disconnectSpreadsheet: () => void;
  updateSpreadsheetConfig: (partial: Partial<SpreadsheetConfig>) => void;
  syncToSpreadsheet: (customDb?: SpreadsheetDatabaseSchema) => Promise<{ success: boolean; message: string }>;
  syncFromSpreadsheet: (silent?: boolean) => Promise<{ success: boolean; message: string }>;
  importDatabase: (data: Partial<SpreadsheetDatabaseSchema>) => void;
  clearAllData: () => void;

  // Patient & Clinical Actions
  registerPatient: (data: RegisterData) => string;
  callQueue: (queueId: string, room?: string) => void;
  completeQueue: (queueId: string) => void;
  deleteQueue: (queueId: string) => void;
  deleteOwner: (ownerId: string) => void;
  deletePet: (petId: string) => void;
  deleteSoapRecord: (recordId: string) => void;
  updateSoapRecord: (recordId: string, updatedFields: Partial<SoapRecord>) => void;
  saveSoapRecord: (
    record: Omit<SoapRecord, 'id' | 'date'>,
    prescriptionItems: PrescriptionItem[]
  ) => void;
  updateCageStatus: (cageId: string, status: CageStatus, petId?: string) => void;
  addCageObservation: (cageId: string, obs: Omit<InpatientObservation, 'id'>) => void;
  admitPetToCage: (cageId: string, pet: Pet, owner: Owner, diagnosis: string, vet: string) => void;
  dischargeCage: (cageId: string) => void;
  deleteInpatientHistoryRecord: (id: string) => void;
  updateInpatientHistoryRecord: (id: string, updatedFields: Partial<InpatientHistoryRecord>) => void;
  addSurgeryRecord: (surgery: Partial<SurgeryRecord>) => Promise<SurgeryRecord>;
  updateSurgeryRecord: (id: string, updatedFields: Partial<SurgeryRecord>) => Promise<boolean>;
  deleteSurgeryRecord: (id: string) => Promise<boolean>;
  restockItem: (itemId: string, addedQuantity: number) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'lastRestocked'>) => void;
  updateInventoryItem: (itemId: string, updatedData: Partial<InventoryItem>) => void;
  deleteInventoryItem: (itemId: string) => void;
  addBooking: (booking: Omit<BookingAppointment, 'id'>) => void;
  updateBookingStatus: (id: string, status: BookingAppointment['status']) => void;
  addFeedback: (feedback: Omit<CustomerFeedback, 'id' | 'submittedAt'>) => void;
  deleteFeedback: (id: string) => void;
  markFeedbackAsRead: (id: string) => void;
  markAllFeedbacksAsRead: () => void;
  addStaff: (staff: Omit<StaffUser, 'id'>) => { success: boolean; message: string };
  deleteStaff: (id: string) => { success: boolean; message: string };
  updateStaff: (id: string, updatedData: Partial<StaffUser>) => { success: boolean; message: string };
  updateStaffPassword: (id: string, newPassword: string) => { success: boolean; message: string };
  loginStaff: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logoutStaff: () => void;
  setTrackedTicket: (ticket: string) => boolean;
  trackByPhone: (phone: string) => boolean;
  clearPatientSession: () => void;
  dismissCallNotification: () => void;
  getPetById: (id: string) => Pet | undefined;
  getOwnerByPhone: (phone: string) => Owner | undefined;
  getPetsByOwnerPhone: (phone: string | number, ownerId?: string) => Pet[];
  resetToInitialData: () => void;
  updateOwner: (ownerId: string, updatedData: Partial<Owner>) => void;
  updatePet: (petId: string, updatedData: Partial<Pet>) => void;
  sanitizeAllExistingDates: () => SpreadsheetDatabaseSchema;

  // Write Confirmation / Verification
  pendingVerifications: PendingWriteVerification[];
  trackAndVerifyWrite: (table: 'pets' | 'owners' | 'soapRecords' | 'inventory' | 'queues' | 'cages' | 'bookings' | 'feedbacks' | 'staff' | 'surgeries', record: any) => void;
  retryVerification: (id: string) => void;
  clearVerification: (id: string) => void;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

const DB_VERSION_KEY = 'vetcare_clean_db_v2';

const STORAGE_KEYS = {
  OWNERS: 'vetcare_owners',
  PETS: 'vetcare_pets',
  QUEUES: 'vetcare_queues',
  INVENTORY: 'vetcare_inventory',
  CAGES: 'vetcare_cages',
  INPATIENT_HISTORY: 'vetcare_inpatient_history',
  SOAP: 'vetcare_soap',
  BOOKINGS: 'vetcare_bookings',
  FEEDBACKS: 'vetcare_feedbacks',
  SURGERIES: 'vetcare_surgeries',
  STAFF_LIST: 'vetcare_staff_list',
  STAFF_USER: 'vetcare_current_staff',
  SERVING_TICKET: 'vetcare_serving_ticket',
  ACTIVE_PATIENT: 'vetcare_active_patient_ticket',
  SPREADSHEET_CONFIG: 'vetcare_spreadsheet_config',
};

// Purge any legacy dummy data once on version bump
if (typeof window !== 'undefined') {
  try {
    const currentVer = localStorage.getItem(DB_VERSION_KEY);
    if (currentVer !== 'v2') {
      localStorage.removeItem(STORAGE_KEYS.OWNERS);
      localStorage.removeItem(STORAGE_KEYS.PETS);
      localStorage.removeItem(STORAGE_KEYS.QUEUES);
      localStorage.removeItem(STORAGE_KEYS.INVENTORY);
      localStorage.removeItem(STORAGE_KEYS.CAGES);
      localStorage.removeItem(STORAGE_KEYS.SOAP);
      localStorage.removeItem(STORAGE_KEYS.BOOKINGS);
      localStorage.removeItem(STORAGE_KEYS.FEEDBACKS);
      localStorage.removeItem(STORAGE_KEYS.SERVING_TICKET);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PATIENT);
      localStorage.setItem(DB_VERSION_KEY, 'v2');
    }
  } catch {
    // Ignore storage check failures
  }
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Menghasilkan ID deterministik (stabil) dari kombinasi field yang ada di baris data.
 * Dipakai sebagai fallback saat kolom 'id' kosong di Google Sheets (mis. data diketik manual),
 * supaya ID tidak berubah-ubah setiap kali data ditarik ulang (Date.now() akan selalu beda tiap fetch).
 */
function stableIdFrom(prefix: string, parts: Array<string | number | undefined | null>): string {
  const seed = parts.map((p) => String(p ?? '').trim().toLowerCase()).join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function sanitizeOwner(o: any): Owner | null {
  if (!o || typeof o !== 'object') return null;
  const id = String(o?.id || o?.ID || o?.Id || o?.['ID Pemilik'] || o?.['Kode Pemilik'] || '').trim();
  const name = String(
    o?.name ||
      o?.nama ||
      o?.Nama ||
      o?.['Nama Pemilik'] ||
      o?.['Nama Lengkap'] ||
      o?.['Nama Owner'] ||
      o?.pemilik ||
      o?.owner ||
      ''
  ).trim();
  const rawWa =
    o?.whatsapp ||
    o?.WhatsApp ||
    o?.['No WA'] ||
    o?.['No. WA'] ||
    o?.['No WhatsApp'] ||
    o?.['No. WhatsApp'] ||
    o?.['Nomor WA'] ||
    o?.['Nomor WhatsApp'] ||
    o?.wa ||
    o?.phone ||
    o?.hp ||
    o?.['No HP'] ||
    o?.['No. HP'] ||
    o?.telepon ||
    o?.kontak;
  const whatsapp = normalizePhoneWithZero(rawWa);
  const address = String(o?.address || o?.alamat || o?.Alamat || o?.['Alamat Lengkap'] || o?.domisili || '').trim();
  // Baris kosong tanpa ID, nama, dan no WhatsApp tidak dianggap sebagai pemilik valid
  if (!id && !name && !whatsapp) return null;

  const notesVal = String(
    o?.notes ||
      o?.Catatan ||
      o?.catatan ||
      o?.keterangan ||
      o?.informedConsent ||
      'Persetujuan Tindakan Medis & Pemeriksaan Klinik Terstandar disetujui oleh pemilik.'
  );
  return {
    ...o,
    id: id || stableIdFrom('own', [name, whatsapp, address]),
    name: name || 'Pemilik',
    whatsapp,
    address,
    registeredAt: convertAmPmTo24h(String(o?.registeredAt || o?.['Tanggal Daftar'] || o?.['Tgl Daftar'] || o?.['Tanggal Registrasi'] || '')),
    notes: notesVal,
    informedConsent: notesVal,
  };
}

function sanitizePet(p: any, ownerLookupMap?: Map<string, Owner>): Pet | null {
  if (!p || typeof p !== 'object') return null;

  const rawOwnerNameStr = String(p?.ownerName ?? '').trim();
  const rawOwnerWaStr = String(p?.ownerWhatsapp ?? '').trim();
  const rawNameStr = String(p?.name ?? '').trim();
  const rawPhotoStr = String(p?.photoUrl ?? '').trim();
  const rawAgeOrDobStr = String(p?.ageOrDob ?? '').trim();
  const rawSexVal = p?.sex;

  // Deteksi pergeseran kolom (column shift) di sheet Google Sheets '2_Pasien':
  // Pada pergeseran ini:
  // - p.ownerName berisi nomor HP (contoh: 89652700068 / 81802310800)
  // - p.ownerWhatsapp berisi nama hewan sebenarnya (contoh: 'Hima', 'Cika', 'XX', 'Abundut')
  // - p.name berisi jenis hewan (contoh: 'Kucing', 'Anjing')
  // - p.photoUrl berisi tanggal/ISO timestamp pendaftaran (contoh: '2026-08-03T...')
  // - p.sex berisi angka bobot (kg) atau p.ageOrDob berisi 'Jantan'/'Betina'
  const isOwnerNamePhone = /^[0-9+]+$/.test(rawOwnerNameStr) && rawOwnerNameStr.length >= 3;
  const isOwnerWaTextNotPhone = rawOwnerWaStr !== '' && !/^[0-9+\s()-]+$/.test(rawOwnerWaStr);
  const isNameSpecies = /^(kucing|anjing|cat|dog|kelinci|rabbit|hamster|burung|iguana|musang|sugar glider)$/i.test(rawNameStr);
  const isPhotoUrlDate = /^\d{4}-\d{2}-\d{2}/.test(rawPhotoStr);
  const isAgeSexMismatch =
    /^(jantan|betina|male|female)$/i.test(rawAgeOrDobStr) &&
    (typeof rawSexVal === 'number' || /^\d+(\.\d+)?$/.test(String(rawSexVal)));

  const isShifted =
    (isOwnerNamePhone && (isOwnerWaTextNotPhone || isNameSpecies)) ||
    (isNameSpecies && isPhotoUrlDate) ||
    (isOwnerNamePhone && isPhotoUrlDate) ||
    (isAgeSexMismatch && isNameSpecies);

  let id = String(p?.id || p?.ID || p?.Id || '').trim();
  let ownerId = p?.ownerId ? String(p.ownerId).trim() : undefined;
  let ownerName = p?.ownerName ? String(p.ownerName).trim() : undefined;
  const rawOwnerWa =
    p?.ownerWhatsapp ||
    p?.whatsapp ||
    p?.['No WA'] ||
    p?.['No. WA'] ||
    p?.['WhatsApp Pemilik'] ||
    p?.['No WhatsApp'];
  let ownerWhatsapp = normalizePhoneWithZero(rawOwnerWa);
  let name = String(
    p?.name || p?.nama || p?.['Nama Pasien'] || p?.['Nama Hewan'] || p?.['Nama'] || ''
  ).trim();
  let breed = String(p?.breed || p?.ras || p?.Ras || '');
  let rawType = p?.type || p?.jenis || p?.species || p?.['Jenis Hewan'] || p?.['Spesies'] || '';
  let notes = p?.notes ? String(p.notes) : undefined;
  let type = normalizePetType(rawType, `${name} ${breed} ${notes || ''}`);
  let ageOrDob = String(p?.ageOrDob || p?.umur || p?.Umur || '');
  let sex = p?.sex || p?.['Jenis Kelamin'] || 'Jantan';
  let weight = typeof p?.weight === 'number' ? p.weight : parseFloat(p?.weight || p?.berat) || 0;
  let photoUrl = p?.photoUrl ? decryptPhotoUrl(String(p.photoUrl)) : undefined;
  let status = p?.status || p?.Status || 'Sehat';
  let registeredAt = convertAmPmTo24h(String(p?.registeredAt || p?.['Tanggal Terdaftar'] || ''));
  let informedConsent = p?.informedConsent ? String(p.informedConsent) : undefined;

  if (isShifted) {
    // Kembalikan ke susunan atribut yang sebenarnya:
    ownerWhatsapp = normalizePhoneWithZero(rawOwnerNameStr);
    name = rawOwnerWaStr || 'Pasien';
    type = normalizePetType(rawNameStr || 'Cat', `${rawOwnerWaStr} ${p?.type || ''}`);
    breed = String(p?.type || '').trim();
    ageOrDob = String(p?.breed || '').trim();
    sex = /^(jantan|betina)$/i.test(rawAgeOrDobStr)
      ? ((rawAgeOrDobStr.charAt(0).toUpperCase() + rawAgeOrDobStr.slice(1).toLowerCase()) as any)
      : 'Jantan';
    weight = typeof rawSexVal === 'number' ? rawSexVal : parseFloat(rawSexVal) || 0;
    status = String(p?.weight || 'Sehat').trim();
    registeredAt = convertAmPmTo24h(rawPhotoStr || '');
    photoUrl = undefined;
    ownerName = undefined; // Di-lookup di bawah
  }

  // Cari nama pemilik dari ownerLookupMap jika ada
  if (ownerLookupMap) {
    let matchedOwner: Owner | undefined;
    if (ownerId && ownerLookupMap.has(ownerId)) {
      matchedOwner = ownerLookupMap.get(ownerId);
    }
    if (!matchedOwner && ownerWhatsapp) {
      const cleanDigits = ownerWhatsapp.replace(/\D/g, '');
      if (cleanDigits && ownerLookupMap.has(cleanDigits)) {
        matchedOwner = ownerLookupMap.get(cleanDigits);
      }
    }
    if (matchedOwner) {
      if (!ownerId) ownerId = matchedOwner.id;
      ownerName = matchedOwner.name;
      if (!ownerWhatsapp) ownerWhatsapp = normalizePhoneWithZero(matchedOwner.whatsapp);
    }
  }

  if (!id && !name && !ownerWhatsapp && !ownerId) return null;

  return {
    ...p,
    id: id || stableIdFrom('pet', [name, ownerWhatsapp, ownerName, registeredAt]),
    ownerId,
    ownerName,
    ownerWhatsapp,
    name: name || 'Pasien',
    type,
    breed,
    ageOrDob,
    sex,
    weight,
    photoUrl,
    status,
    registeredAt,
    notes,
    informedConsent,
  };
}

function sanitizeQueue(q: any): VisitQueue | null {
  if (!q || typeof q !== 'object') return null;
  const id = String(q?.id || q?.ID || '').trim();
  const ticketNumber = String(q?.ticketNumber || q?.['No Antrean'] || q?.['Nomor Tiket'] || q?.ticket || '').trim();
  const petName = String(q?.petName || q?.pasien || q?.['Nama Pasien'] || q?.['Nama Hewan'] || '').trim();
  const ownerName = String(q?.ownerName || q?.pemilik || q?.['Nama Pemilik'] || '').trim();
  if (!id && !ticketNumber && !petName && !ownerName) return null;

  const rawPhoto = q?.photoUrl || q?.foto || q?.['Foto'];
  const photoUrl = rawPhoto ? decryptPhotoUrl(String(rawPhoto)) : undefined;

  return {
    ...q,
    id: id || stableIdFrom('q', [ticketNumber, petName, ownerName, q?.createdAt]),
    ticketNumber: ticketNumber || 'A-00',
    ownerWhatsapp: normalizePhoneWithZero(q?.ownerWhatsapp || q?.whatsapp || q?.['No WA']),
    ownerName: ownerName || 'Pemilik',
    petId: String(q?.petId || ''),
    petName: petName || 'Pasien',
    petType: normalizePetType(q?.petType || q?.type || q?.['Jenis Hewan'], `${petName} ${q?.chiefComplaint || ''}`),
    photoUrl,
    serviceType: q?.serviceType || q?.layanan || q?.['Jenis Layanan'] || 'Consultation',
    chiefComplaint: String(q?.chiefComplaint || q?.keluhan || q?.['Keluhan Utama'] || ''),
    status: q?.status || q?.Status || 'Menunggu',
    createdAt: convertAmPmTo24h(String(q?.createdAt || q?.['Tanggal Dibuat'] || '')),
    completedAt: q?.completedAt ? convertAmPmTo24h(String(q.completedAt)) : undefined,
    assignedDoctor: q?.assignedDoctor ? String(q.assignedDoctor) : undefined,
    informedConsent: q?.informedConsent ? String(q.informedConsent) : undefined,
  };
}

function saveStored<T>(key: string, value: T) {
  // Always persist into IndexedDB (supports 100k+ records and 100MB+ without 5MB quota errors)
  setIdbItem(key, value).catch(() => {});

  // For lightweight session state, also sync with localStorage for immediate synchronous reads
  if (
    key === STORAGE_KEYS.STAFF_USER ||
    key === STORAGE_KEYS.STAFF_LIST ||
    key === STORAGE_KEYS.INVENTORY ||
    key === STORAGE_KEYS.SERVING_TICKET ||
    key === STORAGE_KEYS.ACTIVE_PATIENT ||
    key === STORAGE_KEYS.SPREADSHEET_CONFIG
  ) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota error for small keys
    }
  }
}

/**
 * Memastikan field bertipe array/objek (prescriptions, vitals, soap, diagnosticAttachments)
 * selalu berbentuk benar walau sel di Google Sheets kosong atau rusak formatnya
 * (biasanya tersimpan sebagai string mentah kalau bukan JSON valid). Mencegah error
 * "x.map is not a function" saat komponen merender data ini.
 */
function coerceArray<T>(val: any): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // bukan JSON valid, abaikan dan kembalikan array kosong
    }
  }
  return [];
}

function coerceObject<T extends Record<string, any>>(val: any, defaults: T): T {
  if (val && typeof val === 'object' && !Array.isArray(val)) return { ...defaults, ...val };
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...defaults, ...parsed };
    } catch {
      // bukan JSON valid, abaikan dan kembalikan default
    }
  }
  return { ...defaults };
}

function sanitizeSoapRecord(s: any): SoapRecord | null {
  if (!s || typeof s !== 'object') return null;
  if (!s.id && !s.petName && !s.petId) return null;

  const dateStr = convertAmPmTo24h(s.date || s['Tanggal'] || '');
  return {
    ...s,
    id: s.id ? String(s.id).trim() : stableIdFrom('soap', [s.petId, s.petName, dateStr, s.veterinarian]),
    date: dateStr,
    prescriptions: coerceArray<PrescriptionItem>(s.prescriptions),
    diagnosticAttachments: s.diagnosticAttachments !== undefined ? decryptDiagnosticAttachments(s.diagnosticAttachments) : undefined,
    vitals: coerceObject(s.vitals, { weight: 0, temperature: 0, heartRate: 0, respiratoryRate: 0 }),
    soap: coerceObject(s.soap, { subjective: '', objective: '', assessment: '', plan: '' }),
  };
}

export const ClinicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [owners, setOwners] = useState<Owner[]>(() => {
    const raw = loadStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS);
    return sortOwnersNewestFirst(Array.isArray(raw) ? (raw.map(sanitizeOwner).filter((x): x is Owner => x !== null)) : INITIAL_OWNERS);
  });
  const [pets, setPets] = useState<Pet[]>(() => {
    const raw = loadStored(STORAGE_KEYS.PETS, INITIAL_PETS);
    return sortPetsNewestFirst(Array.isArray(raw) ? raw.map((p) => sanitizePet(p)).filter((x): x is Pet => x !== null) : INITIAL_PETS);
  });
  const [queues, setQueues] = useState<VisitQueue[]>(() => {
    const raw = loadStored(STORAGE_KEYS.QUEUES, INITIAL_QUEUES);
    return Array.isArray(raw) ? (raw.map(sanitizeQueue).filter((x): x is VisitQueue => x !== null)) : INITIAL_QUEUES;
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(() => loadStored(STORAGE_KEYS.INVENTORY, INITIAL_INVENTORY));
  const [cages, setCages] = useState<InpatientCage[]>(() => sanitizeCagesList(loadStored(STORAGE_KEYS.CAGES, INITIAL_CAGES)));
  const [inpatientHistory, setInpatientHistory] = useState<InpatientHistoryRecord[]>(() => loadStored(STORAGE_KEYS.INPATIENT_HISTORY, []));
  const [soapRecords, setSoapRecords] = useState<SoapRecord[]>(() => {
    const raw = loadStored(STORAGE_KEYS.SOAP, INITIAL_SOAP_RECORDS);
    return sortSoapNewestFirst(Array.isArray(raw) ? (raw.map(sanitizeSoapRecord).filter((x): x is SoapRecord => x !== null)) : INITIAL_SOAP_RECORDS);
  });
  const [bookings, setBookings] = useState<BookingAppointment[]>(() => loadStored(STORAGE_KEYS.BOOKINGS, INITIAL_BOOKINGS));
  const [feedbacks, setFeedbacks] = useState<CustomerFeedback[]>(() => loadStored(STORAGE_KEYS.FEEDBACKS, INITIAL_FEEDBACKS));
  const [surgeries, setSurgeries] = useState<SurgeryRecord[]>(() => loadStored(STORAGE_KEYS.SURGERIES, INITIAL_SURGERIES));
  const [staffList, setStaffList] = useState<StaffUser[]>(() => {
    const list = loadStored<StaffUser[]>(STORAGE_KEYS.STAFF_LIST, INITIAL_STAFF);
    if (!Array.isArray(list) || list.length === 0) return INITIAL_STAFF;
    const hasOwner = list.some((s) => s.username.toLowerCase() === 'owner' || String(s.role || '').toLowerCase().includes('owner') || String(s.role || '').toLowerCase().includes('super'));
    if (!hasOwner) {
      const ownerAccount = INITIAL_STAFF.find((s) => s.username === 'owner') || INITIAL_STAFF[0];
      return [ownerAccount, ...list];
    }
    return list;
  });
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(() => loadStored(STORAGE_KEYS.STAFF_USER, null));
  const [currentServingTicket, setCurrentServingTicket] = useState<string>(() => loadStored(STORAGE_KEYS.SERVING_TICKET, '-'));
  const [activePatientTicket, setActivePatientTicket] = useState<string | null>(() => loadStored(STORAGE_KEYS.ACTIVE_PATIENT, null));
  const [callNotification, setCallNotification] = useState<CallNotification | null>(null);
  const [pendingVerifications, setPendingVerifications] = useState<PendingWriteVerification[]>([]);

  // Spreadsheet Database State
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<SpreadsheetConfig>(() => {
    const stored = loadStored<SpreadsheetConfig>(STORAGE_KEYS.SPREADSHEET_CONFIG, DEFAULT_SPREADSHEET_CONFIG);
    if (!stored || !stored.webAppUrl || stored.webAppUrl !== DEFAULT_SPREADSHEET_CONFIG.webAppUrl) {
      return DEFAULT_SPREADSHEET_CONFIG;
    }
    return stored;
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    spreadsheetConfig.isConnected ? 'connected' : 'idle'
  );
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  // Versi backend lokal untuk mendeteksi pembaruan data secara otomatis
  const localBackendVersionRef = useRef<number>(0);
  const [dataVersion, setDataVersion] = useState<number>(1);
  const triggerDataRefresh = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  // 1. Initial Load: IndexedDB (Instan <10ms) + Backend Data (~15ms)
  useEffect(() => {
    let isMounted = true;
    async function loadCachedDatabase() {
      try {
        const [
          cachedOwners,
          cachedPets,
          cachedQueues,
          cachedSoap,
          cachedCages,
          cachedInventory,
          cachedBookings,
          cachedStaff,
          cachedFeedbacks,
        ] = await Promise.all([
          getIdbItem<Owner[]>(STORAGE_KEYS.OWNERS),
          getIdbItem<Pet[]>(STORAGE_KEYS.PETS),
          getIdbItem<VisitQueue[]>(STORAGE_KEYS.QUEUES),
          getIdbItem<SoapRecord[]>(STORAGE_KEYS.SOAP),
          getIdbItem<InpatientCage[]>(STORAGE_KEYS.CAGES),
          getIdbItem<InventoryItem[]>(STORAGE_KEYS.INVENTORY),
          getIdbItem<BookingAppointment[]>(STORAGE_KEYS.BOOKINGS),
          getIdbItem<StaffUser[]>(STORAGE_KEYS.STAFF_LIST),
          getIdbItem<CustomerFeedback[]>(STORAGE_KEYS.FEEDBACKS),
        ]);

        if (!isMounted) return;

        if (cachedOwners && Array.isArray(cachedOwners) && cachedOwners.length > 0) setOwners(sortOwnersNewestFirst(cachedOwners));
        if (cachedPets && Array.isArray(cachedPets) && cachedPets.length > 0) setPets(sortPetsNewestFirst(cachedPets));
        if (cachedQueues && Array.isArray(cachedQueues) && cachedQueues.length > 0) setQueues(cachedQueues);
        if (cachedSoap && Array.isArray(cachedSoap) && cachedSoap.length > 0) setSoapRecords(sortSoapNewestFirst(cachedSoap));
        if (cachedCages && Array.isArray(cachedCages) && cachedCages.length > 0) setCages(cachedCages);
        if (cachedInventory && Array.isArray(cachedInventory) && cachedInventory.length > 0) setInventory(cachedInventory);
        if (cachedBookings && Array.isArray(cachedBookings) && cachedBookings.length > 0) setBookings(cachedBookings);
        if (cachedStaff && Array.isArray(cachedStaff) && cachedStaff.length > 0) {
          setStaffList(cachedStaff);
          setCurrentUser((prev) => {
            if (!prev) return null;
            const updated = cachedStaff.find(
              (s) => s.id === prev.id || s.username.toLowerCase() === prev.username.toLowerCase()
            );
            return updated ? { ...prev, ...updated } : prev;
          });
        }
        if (cachedFeedbacks && Array.isArray(cachedFeedbacks) && cachedFeedbacks.length > 0) setFeedbacks(cachedFeedbacks);
      } catch (err) {
        console.warn('Gagal membaca cache IndexedDB lokal:', err);
      }

      // Ambil data terbaru dari backend Express (atau fallback ke Google Sheets jika di static host seperti GitHub Pages)
      try {
        const backendRes = await fetchDatabaseFromBackend();
        if (isMounted && backendRes.success && backendRes.data) {
          hasInitialSyncedRef.current = true;
          importDatabase(backendRes.data);
          if (backendRes.status?.version) {
            localBackendVersionRef.current = backendRes.status.version;
          }
          setDataVersion((v) => v + 1);
          setSyncStatus('connected');
          const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
          setLastSyncMessage(`Sinkronisasi otomatis backend aktif (${time} WIB)`);
        } else {
          // Fallback untuk GitHub Pages / Static Hosting (tanpa backend server Express)
          if (spreadsheetConfig.webAppUrl && spreadsheetConfig.isConnected) {
            syncFromSpreadsheet(false);
          }
        }
      } catch (err) {
        console.warn('Initial fetch ke backend gagal, beralih ke direct Spreadsheet:', err);
        if (spreadsheetConfig.webAppUrl && spreadsheetConfig.isConnected) {
          syncFromSpreadsheet(false);
        }
      }
    }

    loadCachedDatabase();
    return () => {
      isMounted = false;
    };
  }, []);

  // ==========================================
  // AUTO-SYNC POLLING VIA BACKEND & FALLBACK
  // ==========================================
  const pollCountsRef = useRef<Record<string, number> | null>(null);
  const syncStatusRef = useRef(syncStatus);
  useEffect(() => { syncStatusRef.current = syncStatus; }, [syncStatus]);

  // Flag untuk mencegah loop balik saat data ditarik dari Google Spreadsheet
  const isRemoteSyncRef = useRef<boolean>(false);
  const hasInitialSyncedRef = useRef<boolean>(false);

  const stateRefs = useRef({
    owners,
    pets,
    queues,
    inventory,
    cages,
    inpatientHistory,
    soapRecords,
    bookings,
    feedbacks,
    surgeries,
    staffList,
  });
  stateRefs.current = {
    owners,
    pets,
    queues,
    inventory,
    cages,
    inpatientHistory,
    soapRecords,
    bookings,
    feedbacks,
    surgeries,
    staffList,
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const status = await fetchStatusFromBackend();
        if (status) {
          // Server backend aktif
          if (status.isSyncing) {
            setSyncStatus('syncing');
            setLastSyncMessage('Backend sedang melakukan sinkronisasi otomatis dengan Google Sheets...');
          } else if (status.isConnected) {
            setSyncStatus('connected');
          }

          if (status.version > localBackendVersionRef.current) {
            const backendData = await fetchDatabaseFromBackend();
            if (backendData.success && backendData.data) {
              localBackendVersionRef.current = status.version;
              importDatabase(backendData.data);
              setDataVersion((v) => v + 1);
              const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
              setLastSyncMessage(`Sinkronisasi otomatis aktif (${time} WIB)`);
            }
          }
          return;
        }
      } catch {
        // Abaikan
      }

      // Fallback polling untuk GitHub Pages (Direct Google Apps Script Ping)
      if (spreadsheetConfig.isConnected && spreadsheetConfig.autoSync && spreadsheetConfig.webAppUrl) {
        if (syncStatusRef.current === 'syncing') return;
        try {
          const ping = await testSpreadsheetConnection(spreadsheetConfig.webAppUrl);
          if (ping.success && ping.counts) {
            const prevCounts = pollCountsRef.current;
            const rowCountChanged =
              !prevCounts || Object.keys(ping.counts).some((k) => ping.counts![k] !== prevCounts[k]);
            pollCountsRef.current = ping.counts;

            if (rowCountChanged) {
              await syncFromSpreadsheet(true);
            }
          }
        } catch {
          // Abaikan
        }
      }
    };

    // Instant Cross-Tab Data Sync Listener
    let dataChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        dataChannel = new BroadcastChannel('vetcare_data_sync');
        dataChannel.onmessage = () => {
          poll();
        };
      } catch {}
    }

    // Trigger poll instantly when device screen turns on / user switches back to tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };
    const handleFocus = () => {
      poll();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    // Polling berkala (3s untuk responsivitas instan antar perangkat / tab)
    const intervalId = setInterval(poll, 3000);
    return () => {
      clearInterval(intervalId);
      if (dataChannel) dataChannel.close();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [spreadsheetConfig.isConnected, spreadsheetConfig.autoSync, spreadsheetConfig.webAppUrl]);

  // SINKRONISASI REAL-TIME CEPAT UNTUK LIVE ANTREAN PASIEN & ADMIN PANEL (2.5s & BroadcastChannel)
  useEffect(() => {
    let isMounted = true;

    // 1. Cross-tab instant BroadcastChannel listener (0ms latency di browser yang sama)
    let channel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('vetcare_live_queues');
        channel.onmessage = (event) => {
          if (!isMounted || !event.data) return;
          const { queueId, status, currentServingTicket: cst } = event.data;

          if (cst !== undefined) {
            setCurrentServingTicket(cst);
          }

          if (queueId && status) {
            setQueues((prev) =>
              prev.map((q) => (q.id === queueId ? { ...q, status } : q))
            );
          }
        };
      } catch {}
    }

    // 2. Fast background polling untuk antrean live (2.5 detik) agar HP pasien & admin selalu sinkron
    const fastQueuePoll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const live = await fetchPublicLiveQueues();
        if (live && live.success && isMounted) {
          if (live.currentServingTicket !== undefined) {
            setCurrentServingTicket(live.currentServingTicket);
          }
          if (Array.isArray(live.todayQueues)) {
            setQueues((prev) => {
              let hasChanges = false;
              const serverMap = new Map(live.todayQueues!.map((q: any) => [q.ticketNumber, q]));

              const next = prev.map((oldQ) => {
                const sQ = serverMap.get(oldQ.ticketNumber);
                if (sQ) {
                  if (
                    sQ.status !== oldQ.status ||
                    sQ.calledAt !== oldQ.calledAt ||
                    sQ.completedAt !== oldQ.completedAt ||
                    sQ.assignedDoctor !== oldQ.assignedDoctor
                  ) {
                    hasChanges = true;
                    return {
                      ...oldQ,
                      status: sQ.status,
                      calledAt: sQ.calledAt || oldQ.calledAt,
                      completedAt: sQ.completedAt || oldQ.completedAt,
                      assignedDoctor: sQ.assignedDoctor || oldQ.assignedDoctor,
                    };
                  }
                }
                return oldQ;
              });

              // Cek tiket baru hari ini di server yang belum ada di state lokal
              const localTickets = new Set(prev.map((q) => q.ticketNumber));
              const newTickets = live.todayQueues!.filter((q: any) => !localTickets.has(q.ticketNumber));
              if (newTickets.length > 0) {
                hasChanges = true;
                return [...next, ...newTickets];
              }

              return hasChanges ? next : prev;
            });
          }
        }
      } catch {
        // Abaikan error jaringan transient
      }
    };

    const intervalId = setInterval(fastQueuePoll, 2500);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fastQueuePoll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      if (channel) channel.close();
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Sync with IndexedDB & session storage & fallback cache
  useEffect(() => {
    setLocalDatabaseFallback({
      owners,
      pets,
      queues,
      inventory,
      cages,
      inpatientHistory,
      soapRecords,
      bookings,
      feedbacks,
      surgeries,
      staff: staffList,
    });
  }, [owners, pets, queues, inventory, cages, inpatientHistory, soapRecords, bookings, feedbacks, surgeries, staffList]);

  useEffect(() => { saveStored(STORAGE_KEYS.OWNERS, owners); }, [owners]);
  useEffect(() => { saveStored(STORAGE_KEYS.PETS, pets); }, [pets]);
  useEffect(() => { saveStored(STORAGE_KEYS.QUEUES, queues); }, [queues]);
  useEffect(() => { saveStored(STORAGE_KEYS.INVENTORY, inventory); }, [inventory]);
  useEffect(() => { saveStored(STORAGE_KEYS.CAGES, cages); }, [cages]);
  useEffect(() => { saveStored(STORAGE_KEYS.INPATIENT_HISTORY, inpatientHistory); }, [inpatientHistory]);
  useEffect(() => { saveStored(STORAGE_KEYS.SOAP, soapRecords); }, [soapRecords]);
  useEffect(() => { saveStored(STORAGE_KEYS.BOOKINGS, bookings); }, [bookings]);
  useEffect(() => { saveStored(STORAGE_KEYS.FEEDBACKS, feedbacks); }, [feedbacks]);
  useEffect(() => { saveStored(STORAGE_KEYS.SURGERIES, surgeries); }, [surgeries]);
  useEffect(() => { saveStored(STORAGE_KEYS.STAFF_LIST, staffList); }, [staffList]);
  useEffect(() => { saveStored(STORAGE_KEYS.STAFF_USER, currentUser); }, [currentUser]);

  // Selalu pastikan currentUser sinkron dengan data terbaru di staffList jika ada perubahan role/nama/avatar
  useEffect(() => {
    if (currentUser) {
      const match = staffList.find(
        (s) => s.id === currentUser.id || s.username.toLowerCase() === currentUser.username.toLowerCase()
      );
      if (match) {
        if (
          match.role !== currentUser.role ||
          match.name !== currentUser.name ||
          match.avatar !== currentUser.avatar ||
          Boolean(match.isPracticingDoctor) !== Boolean(currentUser.isPracticingDoctor)
        ) {
          setCurrentUser((prev) => (prev ? { ...prev, ...match } : match));
        }
      }
    }
  }, [staffList]);
  useEffect(() => { saveStored(STORAGE_KEYS.SERVING_TICKET, currentServingTicket); }, [currentServingTicket]);
  useEffect(() => { saveStored(STORAGE_KEYS.ACTIVE_PATIENT, activePatientTicket); }, [activePatientTicket]);
  useEffect(() => { saveStored(STORAGE_KEYS.SPREADSHEET_CONFIG, spreadsheetConfig); }, [spreadsheetConfig]);

  // Otomatis sinkronkan nomor tiket "Sedang Dilayani" berdasarkan status antrean yang aktif di Poli
  useEffect(() => {
    const activePoliQueue = queues.find((q) => q.status === 'Di Ruang Poli' && isToday(q.createdAt));
    setCurrentServingTicket(activePoliQueue ? activePoliQueue.ticketNumber : '-');
  }, [queues]);

  // Bersihkan activePatientTicket jika tiket tersebut sudah tidak ada di antrean
  useEffect(() => {
    if (activePatientTicket && !queues.some((q) => q.ticketNumber === activePatientTicket)) {
      setActivePatientTicket(null);
    }
  }, [queues, activePatientTicket]);

  // Background Auto-Sync ke Google Spreadsheet per-tabel untuk data operasional kecil
  const markSynced = (nowStr: string) =>
    setSpreadsheetConfig((prev) => ({ ...prev, lastSyncedAt: nowStr }));

  // Gabungkan 12 kandang fisik aktif (baris 2-13) beserta seluruh data riwayat selesai (baris 14 ke bawah)
  const fullCagesWithHistory = useMemo(() => {
    const sanitizedActive12 = sanitizeCagesList(cages);
    const histCages: InpatientCage[] = (inpatientHistory || []).map((h) => ({
      id: h.id,
      label: h.cageLabel || `Kandang ${h.cageId}`,
      status: 'selesai' as any,
      petId: h.petId,
      petName: h.petName,
      petType: h.petType,
      ownerName: h.ownerName,
      ownerWhatsapp: h.ownerWhatsapp,
      diagnosis: h.diagnosis,
      admittedAt: h.admittedAt,
      dischargedAt: h.dischargedAt,
      veterinarian: h.veterinarian,
      observations: h.observations || [],
    }));
    return [...sanitizedActive12, ...histCages];
  }, [cages, inpatientHistory]);

  useAutoSyncTable('queues', queues, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('inventory', inventory, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('cages', fullCagesWithHistory, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('bookings', bookings, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('feedbacks', feedbacks, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('surgeries', surgeries, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('staff', staffList, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);

  // ==========================================
  // SPREADSHEET ACTIONS
  // ==========================================

  const connectSpreadsheet = async (url: string): Promise<{ success: boolean; message: string }> => {
    setSyncStatus('syncing');
    setLastSyncMessage('Menguji koneksi ke Google Spreadsheet...');

    const testRes = await testSpreadsheetConnection(url);
    if (!testRes.success) {
      setSyncStatus('error');
      setLastSyncMessage(testRes.message);
      return testRes;
    }

    // Try pulling initial data if available
    const pullRes = await pullFullDatabaseFromSpreadsheet(url);
    if (pullRes.success && pullRes.data) {
      importDatabase(pullRes.data);
    } else {
      // If the spreadsheet is brand new, push current local data to initialize it
      const currentSchema: SpreadsheetDatabaseSchema = {
        owners,
        pets,
        queues,
        soapRecords,
        cages,
        inventory,
        bookings,
        staff: staffList,
        feedbacks,
      };
      await pushFullDatabaseToSpreadsheet(url, currentSchema);
    }

    const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const newConfig: SpreadsheetConfig = {
      ...spreadsheetConfig,
      webAppUrl: url.trim(),
      isConnected: true,
      lastSyncedAt: nowStr,
    };

    setSpreadsheetConfig(newConfig);
    setSyncStatus('connected');
    const msg = 'Berhasil terhubung ke Google Spreadsheet Database!';
    setLastSyncMessage(msg);
    return { success: true, message: msg };
  };

  const disconnectSpreadsheet = () => {
    setSpreadsheetConfig((prev) => ({
      ...prev,
      isConnected: false,
    }));
    setSyncStatus('idle');
    setLastSyncMessage('Spreadsheet diputuskan. Menggunakan penyimpanan lokal.');
  };

  const updateSpreadsheetConfig = (partial: Partial<SpreadsheetConfig>) => {
    setSpreadsheetConfig((prev) => ({ ...prev, ...partial }));
  };

  const syncToSpreadsheet = async (customDb?: SpreadsheetDatabaseSchema): Promise<{ success: boolean; message: string }> => {
    if (!spreadsheetConfig.webAppUrl) {
      return { success: false, message: 'URL Google Apps Script belum diatur.' };
    }

    const targetDb = customDb || {
      owners,
      pets,
      queues,
      soapRecords,
      cages,
      inventory,
      bookings,
      staff: staffList,
      feedbacks,
    };

    // Safeguard: Cegah sinkronisasi jika data lokal kosong agar tidak menimpa sheet dengan kosong
    if ((targetDb.owners || []).length === 0 && (targetDb.pets || []).length === 0) {
      setSyncStatus('connected');
      const errorMsg = 'Gagal sinkron: Database lokal kosong. Tarik data terlebih dahulu dari Spreadsheet untuk mencegah terhapusnya data!';
      setLastSyncMessage(errorMsg);
      return { success: false, message: errorMsg };
    }

    setSyncStatus('syncing');
    setLastSyncMessage('Mengirim seluruh data ke Google Spreadsheet...');

    const res = await pushFullDatabaseToSpreadsheet(spreadsheetConfig.webAppUrl, targetDb);
    if (res.success) {
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
      setSyncStatus('connected');
      setLastSyncMessage(`Sinkronisasi berhasil pada ${nowStr} WIB`);
    } else {
      setSyncStatus('error');
      setLastSyncMessage(res.message);
    }
    return res;
  };

  const syncFromSpreadsheet = async (silent: boolean = false): Promise<{ success: boolean; message: string }> => {
    if (!silent) {
      setSyncStatus('syncing');
      setLastSyncMessage('Menyinkronkan data otomatis dengan backend & Google Sheets...');
    }

    // 1. Picu proses sinkronisasi background di server
    triggerBackendSync().catch(() => {});

    // 2. Ambil data langsung dari server backend (super cepat, ~10ms)
    try {
      const res = await fetchDatabaseFromBackend();
      if (res.success && res.data) {
        hasInitialSyncedRef.current = true;
        importDatabase(res.data);
        if (res.status?.version) {
          localBackendVersionRef.current = res.status.version;
        }
        setDataVersion((v) => v + 1);
        const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
        setSyncStatus('connected');
        const msg = `Sinkronisasi otomatis aktif (${nowStr} WIB)`;
        if (!silent) setLastSyncMessage(msg);
        return { success: true, message: msg };
      }
    } catch {
      // Abaikan dan gunakan fallback direct jika backend tidak merespons
    }

    // Fallback: jika backend belum siap, tarik langsung via browser
    if (spreadsheetConfig.webAppUrl) {
      const directRes = await pullFullDatabaseFromSpreadsheet(spreadsheetConfig.webAppUrl);
      if (directRes.success && directRes.data) {
        hasInitialSyncedRef.current = true;
        importDatabase(directRes.data);
        setDataVersion((v) => v + 1);
        const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
        setSyncStatus('connected');
        const msg = `Data berhasil ditarik dari Spreadsheet pada ${nowStr} WIB`;
        if (!silent) setLastSyncMessage(msg);
        return { success: true, message: msg };
      }
    }

    if (!silent) {
      setSyncStatus('error');
      setLastSyncMessage('Gagal menyinkronkan data.');
    }
    return { success: false, message: 'Gagal menyinkronkan data.' };
  };

  const importDatabase = (data: Partial<SpreadsheetDatabaseSchema>) => {
    // Comprehensive comparison to detect ANY change across all entity fields
    const applyIfChanged = <T extends Record<string, any>>(incoming: T[] | undefined, current: T[], setter: (v: T[]) => void) => {
      if (incoming === undefined || !Array.isArray(incoming)) return;
      let hasChanged = incoming.length !== current.length;
      if (!hasChanged && incoming.length > 0 && current.length > 0) {
        hasChanged = JSON.stringify(incoming) !== JSON.stringify(current);
      }
      if (hasChanged || (incoming.length > 0 && current.length === 0)) {
        isRemoteSyncRef.current = true;
        setter(incoming);
        setTimeout(() => {
          isRemoteSyncRef.current = false;
        }, 1500);
      }
    };

    const completedHistoriesToAppend: InpatientHistoryRecord[] = [];

    // 1. Bersihkan & petakan data Pemilik
    let cleanOwners: Owner[] = [];
    if (data.owners !== undefined && Array.isArray(data.owners)) {
      cleanOwners = data.owners.map(sanitizeOwner).filter((x): x is Owner => x !== null);
    } else {
      cleanOwners = [...stateRefs.current.owners];
    }

    const ownerLookupMap = new Map<string, Owner>();
    cleanOwners.forEach((o) => {
      if (o.id) ownerLookupMap.set(o.id, o);
      if (o.whatsapp) {
        ownerLookupMap.set(normalizePhoneWithZero(o.whatsapp), o);
        const cleanDigits = String(o.whatsapp).replace(/\D/g, '');
        if (cleanDigits) ownerLookupMap.set(cleanDigits, o);
      }
    });

    // 2. Bersihkan & petakan data Pasien (dengan deteksi & pemulihan kolom yang bergeser)
    let cleanPets: Pet[] = [];
    if (data.pets !== undefined && Array.isArray(data.pets)) {
      cleanPets = data.pets
        .map((p) => sanitizePet(p, ownerLookupMap))
        .filter((x): x is Pet => x !== null);

      // Pastikan jika ada pemilik di pet yang belum ada di cleanOwners, otomatis ditambahkan
      cleanPets.forEach((p) => {
        if (p.ownerWhatsapp) {
          const normWa = normalizePhoneWithZero(p.ownerWhatsapp);
          const cleanDigits = normWa.replace(/\D/g, '');
          const existing =
            (p.ownerId && ownerLookupMap.get(p.ownerId)) ||
            ownerLookupMap.get(normWa) ||
            ownerLookupMap.get(cleanDigits);

          if (!existing && (p.ownerName || p.ownerWhatsapp)) {
            const newOwn: Owner = {
              id: p.ownerId || stableIdFrom('own', [p.ownerName, normWa]),
              name: p.ownerName || 'Pemilik',
              whatsapp: normWa,
              address: '',
              registeredAt: p.registeredAt || new Date().toISOString(),
              notes: 'Persetujuan Tindakan Medis & Pemeriksaan Klinik Terstandar disetujui oleh pemilik.',
              informedConsent: 'Persetujuan Tindakan Medis & Pemeriksaan Klinik Terstandar disetujui oleh pemilik.',
            };
            cleanOwners.push(newOwn);
            ownerLookupMap.set(newOwn.id, newOwn);
            ownerLookupMap.set(normWa, newOwn);
            if (cleanDigits) ownerLookupMap.set(cleanDigits, newOwn);
          }
        }
      });
    } else {
      cleanPets = [...stateRefs.current.pets];
    }

    // 3. REKONSILIASI DARI ANTREAN & BOOKING:
    // Menjamin bahwa jika ada pendaftaran antrean atau booking klinis (bahkan bila pasien tidak hadir atau melebihi waktu),
    // data pemilik dan data hewan otomatis masuk ke daftar pasien & pemilik!
    const incomingQueues = data.queues !== undefined && Array.isArray(data.queues) ? data.queues : [];
    incomingQueues.forEach((q) => {
      if (!q || (!q.petName && !q.ownerName)) return;
      const normWa = normalizePhoneWithZero(q.ownerWhatsapp);
      const cleanDigits = normWa.replace(/\D/g, '');
      let owner = (normWa && ownerLookupMap.get(normWa)) || (cleanDigits && ownerLookupMap.get(cleanDigits));
      if (!owner && q.ownerName) {
        owner = cleanOwners.find((o) => String(o.name).trim().toLowerCase() === String(q.ownerName).trim().toLowerCase());
      }
      if (!owner) {
        owner = {
          id: stableIdFrom('own', [q.ownerName || 'Pemilik', normWa || Date.now().toString()]),
          name: q.ownerName || 'Pemilik Antrean',
          whatsapp: normWa,
          address: 'Alamat Klien Pendaftaran',
          registeredAt: q.createdAt || new Date().toISOString(),
          notes: q.informedConsent || 'Pendaftaran antrean klinik',
          informedConsent: q.informedConsent || 'Disetujui: Bebas tuntutan resiko medis sesuai kaidah kedokteran hewan',
        };
        cleanOwners.push(owner);
        ownerLookupMap.set(owner.id, owner);
        if (normWa) ownerLookupMap.set(normWa, owner);
        if (cleanDigits) ownerLookupMap.set(cleanDigits, owner);
      }

      const cleanPetName = String(q.petName || '').trim().toLowerCase();
      let pet = cleanPets.find(
        (p) =>
          (p.ownerId === owner!.id || (normWa && normalizePhoneWithZero(p.ownerWhatsapp) === normWa)) &&
          String(p.name).trim().toLowerCase() === cleanPetName
      );
      if (!pet) {
        pet = {
          id: q.petId || stableIdFrom('pet', [cleanPetName, owner.id]),
          ownerId: owner.id,
          ownerName: owner.name,
          ownerWhatsapp: owner.whatsapp,
          name: q.petName || 'Pasien Antrean',
          type: normalizePetType(q.petType || 'Cat') as any,
          breed: 'Mix / Domestik',
          ageOrDob: 'Dewasa',
          sex: 'Jantan',
          photoUrl: q.photoUrl,
          status: q.serviceType === 'Daftar' ? 'Sehat' : 'Perawatan',
          registeredAt: q.createdAt || new Date().toISOString(),
          informedConsent: q.informedConsent || owner.informedConsent,
        };
        cleanPets.push(pet);
      }
      if (!q.petId) q.petId = pet.id;
    });

    const sortedPets = sortPetsNewestFirst(cleanPets);
    const sortedOwners = sortOwnersNewestFirst(cleanOwners);
    applyIfChanged(sortedPets, stateRefs.current.pets, setPets);
    applyIfChanged(sortedOwners, stateRefs.current.owners, setOwners);
    if (data.queues !== undefined && Array.isArray(data.queues)) {
      const cleanQueues = data.queues
        .map(sanitizeQueue)
        .filter((x): x is VisitQueue => x !== null)
        .filter((q) => {
          // Ketika ganti tanggal, pendaftar yang tidak hadir otomatis dihapus dari antrean live
          if (!isToday(q.createdAt) && q.status === 'Menunggu') {
            return false;
          }
          return true;
        });
      applyIfChanged(cleanQueues, stateRefs.current.queues, setQueues);
    }
    if (data.inventory !== undefined && Array.isArray(data.inventory)) {
      const cleanIncomingInv: InventoryItem[] = data.inventory
        .filter((i) => i && (i.id || i.name))
        .map((item: any) => ({
          ...item,
          id: String(item.id || ''),
          name: String(item.name || 'Obat Farmasi').trim(),
          category: item.category || 'Antibiotik',
          batchNo: String(item.batchNo || ''),
          expireDate: String(item.expireDate || ''),
          minThreshold: Number(item.minThreshold !== undefined ? item.minThreshold : 10),
          stockQuantity: Number(item.stockQuantity !== undefined ? item.stockQuantity : 0),
          unit: String(item.unit || 'Tablet').trim(),
          price: Number(item.price !== undefined ? item.price : 0),
          lastRestocked: item.lastRestocked || '',
        }));

      // Jika server mengembalikan data inventaris, server/spreadsheet adalah source of truth
      let finalInv: InventoryItem[] = [];
      if (cleanIncomingInv.length > 0) {
        finalInv = cleanIncomingInv;
      } else if (stateRefs.current.inventory.length > 0) {
        finalInv = stateRefs.current.inventory;
      }

      applyIfChanged(finalInv, stateRefs.current.inventory, (newInv) => {
        setInventory(newInv);
        saveStored(STORAGE_KEYS.INVENTORY, newInv);
      });
    }
    if (data.cages !== undefined && Array.isArray(data.cages)) {
      const activeCagesMap = new Map<string, InpatientCage>();
      // Inisialisasi strictly HANYA 12 kandang fisik standar klinik (A1 - B6)
      INITIAL_CAGES.forEach((ic) => activeCagesMap.set(ic.id, { ...ic }));

      data.cages.forEach((c) => {
        if (!c) return;

        let obs: any = c.observations;
        if (typeof obs === 'string' && obs.trim()) {
          try {
            obs = JSON.parse(obs);
          } catch {
            obs = [];
          }
        }
        const cleanObs = Array.isArray(obs) ? obs : [];

        const normalizedId = normalizeCageId(c.id, c.label);
        const statusLower = String(c.status || '').toLowerCase();
        // cag-..., status selesai, atau ID non-fisik adalah data riwayat rawat inap
        const isHistorical = !normalizedId || String(c.id || '').startsWith('cag-') || statusLower === 'selesai';

        if (isHistorical) {
          // Cari ID pasien berdasarkan c.petId atau nama pasien
          let targetPetId = c.petId;
          let targetPetName = c.petName || 'Pasien';
          let targetPetType = c.petType || 'Cat';
          let targetOwnerName = c.ownerName || 'Pemilik';
          let targetOwnerWhatsapp = c.ownerWhatsapp ? normalizePhoneWithZero(c.ownerWhatsapp) : '-';

          if (!targetPetId && c.petName) {
            const cleanPetName = String(c.petName).toLowerCase().trim();
            const matchedPet = (stateRefs.current.pets || []).find((p) => {
              const nameMatches = p.name.toLowerCase().trim() === cleanPetName;
              if (!nameMatches) return false;
              if (c.ownerWhatsapp && p.ownerWhatsapp) {
                return normalizePhoneWithZero(p.ownerWhatsapp) === normalizePhoneWithZero(c.ownerWhatsapp);
              }
              return true;
            });
            if (matchedPet) {
              targetPetId = matchedPet.id;
              targetPetName = matchedPet.name;
              targetPetType = matchedPet.type;
              targetOwnerName = matchedPet.ownerName || targetOwnerName;
              targetOwnerWhatsapp = matchedPet.ownerWhatsapp || targetOwnerWhatsapp;
            } else {
              targetPetId = stableIdFrom('pet', [targetPetName, targetOwnerName, targetOwnerWhatsapp]);
            }
          }

          if (targetPetId || c.petName) {
            const now = new Date();
            const defaultNowTime = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const admittedTime = c.admittedAt || (c as any).admitDate || defaultNowTime;
            const dischargeTime = c.dischargedAt || (c as any).dischargeDate || (c as any).completedAt || defaultNowTime;
            
            const existingHist = stateRefs.current.inpatientHistory || [];
            const isDup = existingHist.some(
              (eh) =>
                (eh.id && c.id && eh.id === c.id) ||
                (targetPetId && eh.petId === targetPetId && eh.admittedAt === admittedTime && eh.dischargedAt === dischargeTime) ||
                (eh.petName.toLowerCase().trim() === targetPetName.toLowerCase().trim() && eh.admittedAt === admittedTime && eh.dischargedAt === dischargeTime)
            );

            if (!isDup) {
              const histId = c.id || `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              completedHistoriesToAppend.push({
                id: histId,
                cageId: '',
                cageLabel: '',
                petId: targetPetId || '',
                petName: targetPetName,
                petType: targetPetType,
                ownerName: targetOwnerName,
                ownerWhatsapp: targetOwnerWhatsapp,
                diagnosis: c.diagnosis || 'Perawatan Rawat Inap',
                admittedAt: admittedTime,
                dischargedAt: dischargeTime,
                veterinarian: c.veterinarian && !c.veterinarian.toLowerCase().includes('sarah wijaya')
                  ? c.veterinarian
                  : (currentUser?.isPracticingDoctor ? currentUser.name : ''),
                observations: cleanObs,
              });
            }
          }

          // Jika record riwayat memiliki ID kandang fisik (A1-B6), pastikan unit fisik tersebut kosong (Available) di layout
          if (normalizedId && activeCagesMap.has(normalizedId)) {
            const defaultCage = activeCagesMap.get(normalizedId)!;
            activeCagesMap.set(normalizedId, {
              ...defaultCage,
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
          }
          // PENTING: Data cag-... TIDAK BOLEH dimasukkan ke layout activeCagesMap!
        } else if (normalizedId && activeCagesMap.has(normalizedId)) {
          // Unit kandang fisik A1 - B6 yang sedang terisi atau dibersihkan
          const defaultCage = activeCagesMap.get(normalizedId)!;
          const hasActivePatient = Boolean(
            (c.petName && String(c.petName).trim().length > 0) ||
            (c.petId && String(c.petId).trim().length > 0)
          );

          let cleanStatus: CageStatus = 'Available';
          if (c.status === 'Cleaning' || statusLower === 'cleaning' || statusLower === 'dibersihkan') {
            cleanStatus = 'Cleaning';
          } else if (
            (c.status === 'Occupied' || statusLower === 'occupied' || statusLower === 'terisi') &&
            hasActivePatient
          ) {
            cleanStatus = 'Occupied';
          } else {
            cleanStatus = 'Available';
          }

          activeCagesMap.set(normalizedId, {
            ...defaultCage,
            id: normalizedId, // ID kandang selalu mengikuti nama kandang fisik (A1..B6)
            label: defaultCage.label,
            status: cleanStatus,
            petId: cleanStatus === 'Occupied' ? (c.petId || undefined) : undefined,
            petName: cleanStatus === 'Occupied' ? (c.petName || undefined) : undefined,
            petType: cleanStatus === 'Occupied' ? (c.petType || undefined) : undefined,
            ownerName: cleanStatus === 'Occupied' ? (c.ownerName || undefined) : undefined,
            ownerWhatsapp: cleanStatus === 'Occupied' ? (c.ownerWhatsapp || undefined) : undefined,
            diagnosis: cleanStatus === 'Occupied' ? (c.diagnosis || undefined) : undefined,
            admittedAt: cleanStatus === 'Occupied' ? (c.admittedAt || undefined) : undefined,
            veterinarian: cleanStatus === 'Occupied' ? (c.veterinarian || undefined) : undefined,
            observations: cleanStatus === 'Occupied' && Array.isArray(cleanObs) ? cleanObs : [],
          });
        }
      });

      if (completedHistoriesToAppend.length > 0) {
        setInpatientHistory((prev) => {
          const merged = [...prev];
          completedHistoriesToAppend.forEach((newH) => {
            if (!merged.some((eh) => (newH.petId && eh.petId === newH.petId && eh.admittedAt === newH.admittedAt) || (eh.petName.toLowerCase() === newH.petName.toLowerCase() && eh.admittedAt === newH.admittedAt))) {
              merged.unshift(newH);
            }
          });
          return merged;
        });
      }

      // Pastikan urutan dan jumlah kandang selalu tepat 12 unit fisik (A1-A6 & B1-B6)
      const finalCages = INITIAL_CAGES.map((ic) => activeCagesMap.get(ic.id) || ic);
      applyIfChanged(finalCages, stateRefs.current.cages, setCages);
    }
    if (data.soapRecords !== undefined && Array.isArray(data.soapRecords)) {
      const cleanSoap = data.soapRecords.map(sanitizeSoapRecord).filter((x): x is SoapRecord => x !== null);

      // Pastikan rekam medis pelepasan rawat inap dari status Selesai otomatis ditambahkan ke rekam medis
      completedHistoriesToAppend.forEach((h) => {
        const alreadyHasSoap = cleanSoap.some(
          (s) =>
            (h.petId && s.petId === h.petId && s.soap?.subjective?.includes(h.admittedAt)) ||
            (s.petName?.toLowerCase().trim() === h.petName.toLowerCase().trim() && s.soap?.subjective?.includes(h.admittedAt))
        );
        if (!alreadyHasSoap) {
          const nextSoapId = `soap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          cleanSoap.unshift({
            id: nextSoapId,
            petId: h.petId,
            petName: h.petName,
            ownerName: h.ownerName,
            ownerWhatsapp: h.ownerWhatsapp,
            veterinarian: h.veterinarian,
            date: h.dischargedAt,
            vitals: {
              weight: 0,
              temperature: h.observations?.[0]?.temp || 38.5,
              heartRate: 0,
              respiratoryRate: 0,
            },
            soap: {
              subjective: `Rawat Inap Selesai.\nMasuk: ${h.admittedAt}\nKeluar: ${h.dischargedAt}`,
              objective: `Pasien dipulangkan dalam kondisi stabil. Log observasi rawat inap memiliki ${h.observations?.length || 0} entri.`,
              assessment: `Selesai Rawat Inap - Diagnosis: ${h.diagnosis}`,
              plan: `Edukasi owner mengenai pemeliharaan mandiri, pemulihan pasca tindakan medis, dan terapi rawat jalan di rumah.`,
            },
            prescriptions: [],
            serviceFee: 0,
          });
        }
      });

      const sortedSoap = sortSoapNewestFirst(cleanSoap);
      applyIfChanged(sortedSoap, stateRefs.current.soapRecords, setSoapRecords);
    } else if (completedHistoriesToAppend.length > 0) {
      // Jika soapRecords tidak disertakan dalam sync saat ini, perbarui soapRecords secara lokal
      setSoapRecords((prev) => {
        const merged = [...prev];
        completedHistoriesToAppend.forEach((h) => {
          const alreadyHasSoap = merged.some(
            (s) =>
              (h.petId && s.petId === h.petId && s.soap?.subjective?.includes(h.admittedAt)) ||
              (s.petName?.toLowerCase().trim() === h.petName.toLowerCase().trim() && s.soap?.subjective?.includes(h.admittedAt))
          );
          if (!alreadyHasSoap) {
            const nextSoapId = `soap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            merged.unshift({
              id: nextSoapId,
              petId: h.petId,
              petName: h.petName,
              ownerName: h.ownerName,
              ownerWhatsapp: h.ownerWhatsapp,
              veterinarian: h.veterinarian,
              date: h.dischargedAt,
              vitals: {
                weight: 0,
                temperature: h.observations?.[0]?.temp || 38.5,
                heartRate: 0,
                respiratoryRate: 0,
              },
              soap: {
                subjective: `Rawat Inap Selesai.\nMasuk: ${h.admittedAt}\nKeluar: ${h.dischargedAt}`,
                objective: `Pasien dipulangkan dalam kondisi stabil. Log observasi rawat inap memiliki ${h.observations?.length || 0} entri.`,
                assessment: `Selesai Rawat Inap - Diagnosis: ${h.diagnosis}`,
                plan: `Edukasi owner mengenai pemeliharaan mandiri, pemulihan pasca tindakan medis, dan terapi rawat jalan di rumah.`,
              },
              prescriptions: [],
              serviceFee: 0,
            });
          }
        });
        return merged;
      });
    }
    if (data.bookings !== undefined && Array.isArray(data.bookings)) {
      const cleanBookings = data.bookings.filter((b) => b && (b.id || b.petName || b.ownerName));
      applyIfChanged(cleanBookings, stateRefs.current.bookings, setBookings);
    }
    if (data.feedbacks !== undefined && Array.isArray(data.feedbacks)) {
      const cleanFeedbacks: CustomerFeedback[] = data.feedbacks
        .filter((f) => f && (f.id || f.ticketNumber || f.feedbackText))
        .map((f) => {
          const isReadVal = f.isRead === true || String(f.isRead).toLowerCase() === 'true';
          return {
            ...f,
            isRead: isReadVal,
            readAt: f.readAt || (isReadVal ? new Date().toISOString() : undefined),
          };
        });
      applyIfChanged(cleanFeedbacks, stateRefs.current.feedbacks, setFeedbacks);
    }
    if (data.surgeries !== undefined && Array.isArray(data.surgeries)) {
      const cleanSurgeries: SurgeryRecord[] = data.surgeries.filter((s) => s && (s.id || s.petName || s.operationType));
      applyIfChanged(cleanSurgeries, stateRefs.current.surgeries, setSurgeries);
    }
    if (data.inventory !== undefined && Array.isArray(data.inventory)) {
      const cleanInventory = data.inventory.filter((i) => i && i.name && String(i.name).trim().length > 0);
      applyIfChanged(cleanInventory, stateRefs.current.inventory, (incoming) => {
        setInventory(incoming);
        saveStored(STORAGE_KEYS.INVENTORY, incoming);
      });
    }
    if (data.staff !== undefined && Array.isArray(data.staff) && data.staff.length > 0) {
      const normalizedStaff: StaffUser[] = data.staff
        .map((s, idx) => {
          const username = String(s.username || '').trim().toLowerCase();
          const existingLocal = stateRefs.current.staffList.find(
            (l) => l.id === s.id || l.username.toLowerCase() === username
          );

          let role: StaffRole = 'Staff Admin / Frontdesk';
          const rLower = String(s.role || '').toLowerCase();
          if (
            rLower.includes('super') ||
            rLower.includes('owner') ||
            rLower.includes('direktur') ||
            username === 'owner' ||
            username === 'superadmin'
          ) {
            role = 'Super Admin / Owner';
          } else if (s.role === 'Dokter Hewan' || rLower.includes('dokter')) {
            role = 'Dokter Hewan';
          } else if (s.role) {
            role = s.role as StaffRole;
          } else if (existingLocal) {
            role = existingLocal.role;
          }

          const isPracticingDoctor =
            s.isPracticingDoctor !== undefined
              ? Boolean(s.isPracticingDoctor)
              : existingLocal?.isPracticingDoctor !== undefined
              ? Boolean(existingLocal.isPracticingDoctor)
              : (role === 'Dokter Hewan' || username === 'arsi.vet');

          const pass =
            s.password !== undefined && s.password !== null && String(s.password).trim() !== ''
              ? String(s.password).trim()
              : existingLocal?.password || 'admin';

          return {
            id: s.id && String(s.id).trim() ? String(s.id).trim() : (existingLocal?.id || `staff-${username || idx + 1}`),
            username,
            name: String(s.name || existingLocal?.name || s.username || 'Staf Admin').trim(),
            role,
            isPracticingDoctor,
            password: pass,
            avatar: s.avatar && String(s.avatar).trim() 
              ? String(s.avatar).trim() 
              : existingLocal?.avatar || (role === 'Super Admin / Owner' ? '👑' : role === 'Dokter Hewan' ? '👩‍⚕️' : '👨‍💼'),
          };
        })
        .filter((s) => s.username.length > 0);

      if (normalizedStaff.length > 0) {
        applyIfChanged(normalizedStaff, stateRefs.current.staffList, (incoming) => {
          setStaffList(incoming);
          saveStored(STORAGE_KEYS.STAFF_LIST, incoming);
          if (currentUser) {
            const updatedMe = incoming.find(
              (s) => s.id === currentUser.id || s.username.toLowerCase() === currentUser.username.toLowerCase()
            );
            if (updatedMe) {
              setCurrentUser((prev) => (prev ? { ...prev, ...updatedMe } : updatedMe));
              saveStored(STORAGE_KEYS.STAFF_USER, updatedMe);
            }
          }
        });
      }
    }
  };

  const clearAllData = () => {
    setOwners([]);
    setPets([]);
    setQueues([]);
    setInventory([]);
    setCages(INITIAL_CAGES);
    setSoapRecords([]);
    setBookings([]);
    setFeedbacks([]);
    setStaffList(INITIAL_STAFF);
    setCurrentServingTicket('-');
    setActivePatientTicket(null);
  };

  const resetToInitialData = () => {
    clearAllData();
  };

  const sanitizeAllExistingDates = (): SpreadsheetDatabaseSchema => {
    const cleanOwners = owners.map((o) => ({
      ...o,
      registeredAt: sanitizeIsoToLocalString(o.registeredAt),
    }));
    const cleanPets = pets.map((p) => ({
      ...p,
      registeredAt: sanitizeIsoToLocalString(p.registeredAt),
    }));
    const cleanQueues = queues.map((q) => ({
      ...q,
      createdAt: sanitizeIsoToLocalString(q.createdAt),
    }));
    const cleanSoap = soapRecords.map((s) => ({
      ...s,
      date: sanitizeIsoToLocalString(s.date),
    }));
    const cleanBookings = bookings.map((b) => ({
      ...b,
      date: sanitizeIsoToLocalString(b.date),
    }));
    const cleanFeedbacks = feedbacks.map((f) => ({
      ...f,
      submittedAt: sanitizeIsoToLocalString(f.submittedAt),
    }));

    setOwners(cleanOwners);
    setPets(cleanPets);
    setQueues(cleanQueues);
    setSoapRecords(cleanSoap);
    setBookings(cleanBookings);
    setFeedbacks(cleanFeedbacks);

    return {
      owners: cleanOwners,
      pets: cleanPets,
      queues: cleanQueues,
      soapRecords: cleanSoap,
      cages,
      inventory,
      bookings: cleanBookings,
      staff: staffList,
      feedbacks: cleanFeedbacks,
    };
  };

  // ==========================================
  // WRITE VERIFICATION TRACKER (Google Sheets & Backend)
  // ==========================================

  const trackAndVerifyWrite = useCallback(
    (table: 'pets' | 'owners' | 'soapRecords' | 'inventory' | 'queues' | 'cages' | 'bookings' | 'feedbacks' | 'staff' | 'surgeries', record: any) => {
      if (!record || !record.id) return;
      if (table === 'inventory' && (!record.name || !String(record.name).trim())) return;
      const id = String(record.id);
      let title = id;
      if (table === 'pets') title = `Pasien: ${record.name || id}`;
      else if (table === 'owners') title = `Pemilik: ${record.name || id}`;
      else if (table === 'soapRecords') title = `Rekam Medis: ${record.petName || id} (${record.date || ''})`;
      else if (table === 'inventory') title = `Obat/Stok: ${record.name || id}`;
      else if (table === 'queues') title = `Antrean: ${record.petName || id}`;
      else if (table === 'cages') title = `Kandang: ${record.label || id}`;
      else if (table === 'bookings') title = `Booking: ${record.petName || id}`;
      else if (table === 'feedbacks') title = `Feedback: ${record.ticketNumber || id}`;
      else if (table === 'staff') title = `Staf: ${record.name || id}`;
      else if (table === 'surgeries') title = `Operasi: ${record.operationType || record.petName || id}`;

      setPendingVerifications((prev) => {
        const filtered = prev.filter((item) => item.id !== id);
        return [
          ...filtered,
          {
            id,
            table,
            title,
            timestamp: Date.now(),
            retryCount: 0,
            status: 'pending',
            lastAttemptAt: Date.now(),
          },
        ];
      });

      const checkVerification = async (attempt: number) => {
        try {
          const result = await verifyWriteStatusFromBackend(table, id, spreadsheetConfig.webAppUrl);
          if (result.isFullyVerified || result.inSpreadsheet) {
            setPendingVerifications((prev) =>
              prev.map((item) => (item.id === id ? { ...item, status: 'verified', error: undefined } : item))
            );
            setTimeout(() => {
              setPendingVerifications((prev) => prev.filter((item) => item.id !== id));
            }, 3500);
            return;
          }

          if (attempt < 3) {
            setTimeout(() => checkVerification(attempt + 1), attempt === 1 ? 2500 : 4500);
          } else {
            // Re-push data ke backend & Google Sheets jika belum terverifikasi (hanya jika data valid)
            const isValid = !(table === 'inventory' && (!record?.name || !String(record?.name).trim()));
            if (isValid) {
              pushRecordToBackend(table, record, spreadsheetConfig.webAppUrl).catch(() => {});
            }
            setTimeout(async () => {
              const finalCheck = await verifyWriteStatusFromBackend(table, id, spreadsheetConfig.webAppUrl);
              if (finalCheck.isFullyVerified || finalCheck.inSpreadsheet) {
                setPendingVerifications((prev) =>
                  prev.map((item) => (item.id === id ? { ...item, status: 'verified', error: undefined } : item))
                );
                setTimeout(() => {
                  setPendingVerifications((prev) => prev.filter((item) => item.id !== id));
                }, 3500);
              } else {
                setPendingVerifications((prev) =>
                  prev.map((item) =>
                    item.id === id
                      ? {
                          ...item,
                          status: 'failed',
                          retryCount: attempt + 1,
                          error: 'Data belum terkonfirmasi di Google Spreadsheet.',
                        }
                      : item
                  )
                );
              }
            }, 4000);
          }
        } catch (err: any) {
          if (attempt < 3) {
            setTimeout(() => checkVerification(attempt + 1), 3000);
          } else {
            setPendingVerifications((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, status: 'failed', retryCount: attempt + 1, error: err.message || 'Verifikasi gagal' }
                  : item
              )
            );
          }
        }
      };

      setTimeout(() => checkVerification(1), 1800);
    },
    [spreadsheetConfig.webAppUrl]
  );

  const retryVerification = useCallback(
    (id: string) => {
      const target = pendingVerifications.find((p) => p.id === id);
      if (!target) return;

      let recordObj: any = null;
      if (target.table === 'owners') {
        recordObj = owners.find((o) => o.id === id);
      } else if (target.table === 'pets') {
        recordObj = pets.find((p) => p.id === id);
      } else if (target.table === 'soapRecords') {
        recordObj = soapRecords.find((s) => s.id === id);
      } else if (target.table === 'inventory') {
        recordObj = inventory.find((i) => i.id === id);
      }

      if (recordObj) {
        pushRecordToBackend(target.table, recordObj, spreadsheetConfig.webAppUrl).catch(() => {});
        trackAndVerifyWrite(target.table, recordObj);
      }
    },
    [pendingVerifications, owners, pets, soapRecords, inventory, spreadsheetConfig.webAppUrl, trackAndVerifyWrite]
  );

  const clearVerification = useCallback((id: string) => {
    setPendingVerifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // ==========================================
  // PATIENT REGISTRATION & QUEUE
  // ==========================================

  const registerPatient = (data: RegisterData): string => {
    const cleanPhone = normalizePhoneWithZero(data.owner.whatsapp);
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
    const regTimestamp = getRegistrationTimestamp(now);
    const consentStatement =
      data.informedConsent ||
      'Disetujui: Bebas tuntutan resiko medis sesuai kaidah kedokteran hewan';

    // 1. Owner Linkage
    let owner = owners.find((o) => normalizePhoneWithZero(o.whatsapp) === cleanPhone);
    if (!owner) {
      const nextOwnerId = generateSequentialId('own', owners.map((o) => o.id));
      owner = {
        id: nextOwnerId,
        name: data.owner.name.trim(),
        whatsapp: cleanPhone,
        address: data.owner.address.trim(),
        registeredAt: regTimestamp,
        notes: consentStatement,
        informedConsent: consentStatement,
      };
      setOwners((prev) => sortOwnersNewestFirst([owner!, ...prev]));
    } else {
      owner = {
        ...owner,
        whatsapp: cleanPhone,
        notes: consentStatement,
        informedConsent: consentStatement,
      };
      setOwners((prev) => sortOwnersNewestFirst(prev.map((o) => (o.id === owner!.id ? owner! : o))));
    }

    // 2. Pet Linkage
    let pet = pets.find(
      (p) =>
        (p.ownerId === owner!.id || normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone) &&
        (p.name || '').trim().toLowerCase() === data.pet.name.trim().toLowerCase()
    );

    if (!pet) {
      const nextPetId = generateSequentialId('pet', pets.map((p) => p.id));
      pet = {
        id: nextPetId,
        ownerId: owner.id,
        ownerName: owner.name,
        ownerWhatsapp: cleanPhone,
        name: data.pet.name.trim(),
        type: data.pet.type,
        breed: data.pet.breed.trim() || 'Mix / Domestik',
        ageOrDob: data.pet.ageOrDob.trim() || '1 Tahun',
        sex: data.pet.sex,
        photoUrl: data.pet.photoUrl,
        status: data.visit.serviceType === 'Daftar' ? 'Sehat' : 'Perawatan',
        registeredAt: regTimestamp,
        informedConsent: consentStatement,
      };
      setPets((prev) => sortPetsNewestFirst([pet!, ...prev]));
    } else {
      pet = {
        ...pet,
        ownerId: owner.id,
        ownerName: owner.name,
        ownerWhatsapp: cleanPhone,
        informedConsent: consentStatement,
        ...(data.pet.photoUrl ? { photoUrl: data.pet.photoUrl } : {}),
      };
      setPets((prev) =>
        sortPetsNewestFirst(
          prev.map((p) => (p.id === pet!.id ? pet! : p))
        )
      );
    }

    // 3. Generate Ticket / Queue (Hanya menghitung tiket antrean HARI INI agar reset kembali ke 01 setiap ganti tanggal)
    const prefix = data.visit.serviceType === 'Daftar' ? 'REG' : 'A';
    const todayQueues = queues.filter((q) => isToday(q.createdAt));
    const ticketNumber = generateNextTicketNumber(prefix, todayQueues.map((q) => q.ticketNumber));

    let newQueue: VisitQueue | null = null;
    if (data.visit.serviceType !== 'Daftar') {
      const nextQueueId = generateSequentialId('q', queues.map((q) => q.id));
      newQueue = {
        id: nextQueueId,
        ticketNumber,
        ownerWhatsapp: cleanPhone,
        ownerName: owner.name,
        petId: pet.id,
        petName: pet.name,
        petType: pet.type,
        photoUrl: pet.photoUrl,
        serviceType: data.visit.serviceType,
        chiefComplaint: data.visit.chiefComplaint || 'Pemeriksaan rutin / konsultasi dokter',
        status: 'Menunggu',
        createdAt: regTimestamp,
        informedConsent: consentStatement,
      };

      setQueues((prev) => [...prev, newQueue!]);
      setActivePatientTicket(ticketNumber);
    }

    // Pendaftaran langsung via public register endpoint jika tidak ada token admin
    if (typeof window !== 'undefined') {
      fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          pet,
          visit: data.visit,
          informedConsent: consentStatement,
        }),
      }).catch(() => {});
    }

    // Direct O(1) single-record sync ke backend (dan background push ke Google Sheets)
    pushRecordToBackend('owners', owner, spreadsheetConfig.webAppUrl).catch(() => {});
    pushRecordToBackend('pets', pet, spreadsheetConfig.webAppUrl).catch(() => {});
    trackAndVerifyWrite('owners', owner);
    trackAndVerifyWrite('pets', pet);
    if (newQueue) {
      pushRecordToBackend('queues', newQueue, spreadsheetConfig.webAppUrl).catch(() => {});
    }

    setDataVersion((v) => v + 1);
    return ticketNumber;
  };

  const broadcastLiveQueueUpdate = (data: any) => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const ch = new BroadcastChannel('vetcare_live_queues');
        ch.postMessage(data);
        ch.close();
      } catch {}
    }
  };

  const callQueue = (queueId: string, room: string = 'Poli 1') => {
    const queue = queues.find((q) => q.id === queueId);
    if (!queue) return;

    const timeString = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')} WIB`;

    let updatedQueue: VisitQueue | null = null;
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id === queueId) {
          updatedQueue = {
            ...q,
            status: 'Di Ruang Poli',
            calledAt: timeString,
            assignedDoctor: currentUser?.name || (getPracticingDoctorNames(staffList)[0] || ''),
          };
          return updatedQueue;
        }
        return q;
      })
    );

    if (updatedQueue) {
      pushRecordToBackend('queues', updatedQueue).catch(() => {});
    }

    setCurrentServingTicket(queue.ticketNumber);

    broadcastLiveQueueUpdate({
      type: 'QUEUE_CALLED',
      queueId,
      ticketNumber: queue.ticketNumber,
      status: 'Di Ruang Poli',
      currentServingTicket: queue.ticketNumber,
    });

    setCallNotification({
      ticketNumber: queue.ticketNumber,
      petName: queue.petName,
      ownerName: queue.ownerName,
      room,
      timestamp: timeString,
    });
  };

  const completeQueue = (queueId: string) => {
    const timeString = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')} WIB`;

    const target = queues.find((q) => q.id === queueId);
    if (target && currentServingTicket === target.ticketNumber) {
      setCurrentServingTicket('-');
    }
    if (target && callNotification?.ticketNumber === target.ticketNumber) {
      setCallNotification(null);
    }

    let updatedQueue: VisitQueue | null = null;
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id === queueId) {
          updatedQueue = {
            ...q,
            status: 'Selesai',
            completedAt: timeString,
          };
          return updatedQueue;
        }
        return q;
      })
    );

    broadcastLiveQueueUpdate({
      type: 'QUEUE_COMPLETED',
      queueId,
      ticketNumber: target?.ticketNumber,
      status: 'Selesai',
      currentServingTicket: '-',
    });

    if (updatedQueue) {
      pushRecordToBackend('queues', updatedQueue, spreadsheetConfig.webAppUrl).catch(() => {});
    }
  };

  const deleteQueue = async (queueId: string) => {
    const targetIdStr = String(queueId).trim().toLowerCase();
    const target = queues.find((q) => String(q.id).trim().toLowerCase() === targetIdStr);
    if (target && currentServingTicket === target.ticketNumber) {
      setCurrentServingTicket('-');
    }
    if (target && callNotification?.ticketNumber === target.ticketNumber) {
      setCallNotification(null);
    }

    broadcastLiveQueueUpdate({
      type: 'QUEUE_DELETED',
      queueId,
      ticketNumber: target?.ticketNumber,
    });
    if (target && activePatientTicket === target.ticketNumber) {
      setActivePatientTicket(null);
      try {
        localStorage.removeItem('vier_tracked_ticket');
        localStorage.removeItem('vier_active_patient_ticket');
      } catch {}
    }
    setQueues((prev) => {
      const next = prev.filter((q) => String(q.id).trim().toLowerCase() !== targetIdStr);
      saveStored(STORAGE_KEYS.QUEUES, next);
      return next;
    });
    await deleteRecordFromBackend('queues', queueId, spreadsheetConfig.webAppUrl).catch(() => {});
  };

  const deleteOwner = (ownerId: string) => {
    const targetOwner = stateRefs.current.owners.find((o) => o.id === ownerId);
    const cleanPhone = targetOwner ? normalizePhoneWithZero(targetOwner.whatsapp) : '';
    const ownerName = targetOwner?.name?.toLowerCase().trim() || '';

    // Cari semua pasien / hewan milik pemilik ini (utamakan ownerId, fallback WA + Nama jika tanpa ownerId)
    const ownerPets = stateRefs.current.pets.filter((p) => {
      if (p.ownerId) return p.ownerId === ownerId;
      if (!p.ownerId && cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone &&
          p.ownerName?.toLowerCase().trim() === ownerName
        );
      }
      return false;
    });
    const ownerPetIds = ownerPets.map((p) => p.id);

    // 1. Hapus Pemilik
    setOwners((prev) => prev.filter((o) => o.id !== ownerId));
    deleteRecordFromBackend('owners', ownerId, spreadsheetConfig.webAppUrl).catch(() => {});

    // 2. Hapus Semua Pasien Terkait
    setPets((prev) =>
      prev.filter((p) => {
        if (ownerPetIds.includes(p.id)) return false;
        if (!p.ownerId && cleanPhone && ownerName) {
          if (
            normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone &&
            p.ownerName?.toLowerCase().trim() === ownerName
          ) {
            return false;
          }
        }
        return true;
      })
    );
    ownerPetIds.forEach((pId) => {
      deleteRecordFromBackend('pets', pId, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 3. Hapus Semua Rekam Medis (SOAP Records) Terkait
    const isSoapBelongsToOwner = (s: SoapRecord) => {
      if (s.petId) return ownerPetIds.includes(s.petId);
      if (!s.petId && cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(s.ownerWhatsapp) === cleanPhone &&
          s.ownerName?.toLowerCase().trim() === ownerName
        );
      }
      return false;
    };
    setSoapRecords((prev) => prev.filter((s) => !isSoapBelongsToOwner(s)));
    const soapToDelete = stateRefs.current.soapRecords.filter((s) => isSoapBelongsToOwner(s));
    soapToDelete.forEach((s) => {
      deleteRecordFromBackend('soapRecords', s.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 4. Hapus dari Antrean Pasien Live
    const isQueueBelongsToOwner = (q: VisitQueue) => {
      if (q.petId && ownerPetIds.includes(q.petId)) return true;
      if (!q.petId && cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(q.ownerWhatsapp) === cleanPhone &&
          q.ownerName?.toLowerCase().trim() === ownerName
        );
      }
      return false;
    };
    setQueues((prev) => prev.filter((q) => !isQueueBelongsToOwner(q)));
    const queuesToDelete = stateRefs.current.queues.filter((q) => isQueueBelongsToOwner(q));
    queuesToDelete.forEach((q) => {
      deleteRecordFromBackend('queues', q.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 5. Kosongkan Kandang Rawat Inap Aktif yang Sedang Digunakan
    const activeCagesCleared = stateRefs.current.cages.map((cage) => {
      let isTarget = false;
      if (cage.petId) {
        isTarget = ownerPetIds.includes(cage.petId);
      } else if (cleanPhone && ownerName) {
        isTarget = (
          normalizePhoneWithZero(cage.ownerWhatsapp) === cleanPhone &&
          String(cage.ownerName || '').toLowerCase().trim() === ownerName
        );
      }

      if (isTarget) {
        const clearedCage: InpatientCage = {
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
        };
        pushRecordToBackend('cages', clearedCage, spreadsheetConfig.webAppUrl).catch(() => {});
        return clearedCage;
      }
      return cage;
    });
    setCages(activeCagesCleared);
    saveStored(STORAGE_KEYS.CAGES, activeCagesCleared);

    // 6. Hapus Riwayat Rawat Inap Terkait
    const isHistoryBelongsToOwner = (h: any) => {
      if (h.petId) return ownerPetIds.includes(h.petId);
      if (!h.petId && cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(h.ownerWhatsapp) === cleanPhone &&
          String(h.ownerName || '').toLowerCase().trim() === ownerName
        );
      }
      return false;
    };
    const historyToDelete = stateRefs.current.inpatientHistory.filter((h) => isHistoryBelongsToOwner(h));
    const remainingHistory = stateRefs.current.inpatientHistory.filter((h) => !isHistoryBelongsToOwner(h));
    setInpatientHistory(remainingHistory);
    saveStored(STORAGE_KEYS.INPATIENT_HISTORY, remainingHistory);

    historyToDelete.forEach((h) => {
      deleteRecordFromBackend('cages', h.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 7. Hapus Booking Terkait
    const isBookingBelongsToOwner = (b: BookingAppointment) => {
      if (cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(b.ownerWhatsapp) === cleanPhone &&
          b.ownerName?.toLowerCase().trim() === ownerName
        );
      }
      return false;
    };
    setBookings((prev) => prev.filter((b) => !isBookingBelongsToOwner(b)));
    const bookingsToDelete = stateRefs.current.bookings.filter((b) => isBookingBelongsToOwner(b));
    bookingsToDelete.forEach((b) => {
      deleteRecordFromBackend('bookings', b.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 8. Hapus Umpan Balik Terkait
    const isFeedbackBelongsToOwner = (f: CustomerFeedback) => {
      if (cleanPhone && ownerName) {
        return (
          normalizePhoneWithZero(f.ownerWhatsapp) === cleanPhone &&
          f.ownerName?.toLowerCase().trim() === ownerName
        );
      }
      return false;
    };
    setFeedbacks((prev) => prev.filter((f) => !isFeedbackBelongsToOwner(f)));
    const feedbacksToDelete = stateRefs.current.feedbacks.filter((f) => isFeedbackBelongsToOwner(f));
    feedbacksToDelete.forEach((f) => {
      deleteRecordFromBackend('feedbacks', f.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });
    setDataVersion((v) => v + 1);
  };

  const deletePet = (petId: string) => {
    const targetPet = stateRefs.current.pets.find((p) => p.id === petId);
    if (!targetPet) {
      setPets((prev) => prev.filter((p) => p.id !== petId));
      setSoapRecords((prev) => prev.filter((s) => s.petId !== petId));
      setQueues((prev) => prev.filter((q) => q.petId !== petId));
      deleteRecordFromBackend('pets', petId, spreadsheetConfig.webAppUrl).catch(() => {});
      setDataVersion((v) => v + 1);
      return;
    }

    const cleanPhone = normalizePhoneWithZero(targetPet.ownerWhatsapp);
    const petName = targetPet.name?.toLowerCase().trim() || '';
    const targetOwnerId = targetPet.ownerId;
    const targetOwnerName = targetPet.ownerName?.toLowerCase().trim() || '';

    // Cari pemilik yang terkait dengan pasien ini
    const matchedOwner = stateRefs.current.owners.find((o) => {
      if (targetOwnerId && o.id === targetOwnerId) return true;
      if (!targetOwnerId && cleanPhone && targetOwnerName) {
        return (
          normalizePhoneWithZero(o.whatsapp) === cleanPhone &&
          o.name?.toLowerCase().trim() === targetOwnerName
        );
      }
      return false;
    });

    // Cari seluruh pasien yang dimiliki oleh pemilik ini
    const allOwnerPets = stateRefs.current.pets.filter((p) => {
      if (matchedOwner) {
        if (p.ownerId && p.ownerId === matchedOwner.id) return true;
        if (!p.ownerId && cleanPhone && targetOwnerName) {
          return (
            normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone &&
            p.ownerName?.toLowerCase().trim() === targetOwnerName
          );
        }
      }
      return false;
    });

    const isSinglePetOwner = allOwnerPets.length <= 1;

    // 1. Hapus Pasien ini
    setPets((prev) => prev.filter((p) => p.id !== petId));
    deleteRecordFromBackend('pets', petId, spreadsheetConfig.webAppUrl).catch(() => {});

    // 2. Hapus Rekam Medis (SOAP Records) Pasien ini
    const isSoapBelongsToPet = (s: SoapRecord) => {
      if (s.petId) return s.petId === petId;
      if (!s.petId && cleanPhone && petName) {
        return (
          s.petName?.toLowerCase().trim() === petName &&
          normalizePhoneWithZero(s.ownerWhatsapp) === cleanPhone
        );
      }
      return false;
    };
    setSoapRecords((prev) => prev.filter((s) => !isSoapBelongsToPet(s)));
    const soapToDelete = stateRefs.current.soapRecords.filter((s) => isSoapBelongsToPet(s));
    soapToDelete.forEach((s) => {
      deleteRecordFromBackend('soapRecords', s.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 3. Hapus dari Antrean Pasien Live
    const isQueueBelongsToPet = (q: VisitQueue) => {
      if (q.petId) return q.petId === petId;
      if (!q.petId && cleanPhone && petName) {
        return (
          q.petName?.toLowerCase().trim() === petName &&
          normalizePhoneWithZero(q.ownerWhatsapp) === cleanPhone
        );
      }
      return false;
    };
    setQueues((prev) => prev.filter((q) => !isQueueBelongsToPet(q)));
    const queuesToDelete = stateRefs.current.queues.filter((q) => isQueueBelongsToPet(q));
    queuesToDelete.forEach((q) => {
      deleteRecordFromBackend('queues', q.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 4. Kosongkan Kandang Rawat Inap jika pasien ini sedang dirawat
    const isCageBelongsToPet = (cage: InpatientCage) => {
      if (cage.petId) return cage.petId === petId;
      if (!cage.petId && cleanPhone && petName) {
        return (
          String(cage.petName || '').toLowerCase().trim() === petName &&
          normalizePhoneWithZero(cage.ownerWhatsapp) === cleanPhone
        );
      }
      return false;
    };
    const activeCagesCleared = stateRefs.current.cages.map((cage) => {
      if (isCageBelongsToPet(cage)) {
        const clearedCage: InpatientCage = {
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
        };
        pushRecordToBackend('cages', clearedCage, spreadsheetConfig.webAppUrl).catch(() => {});
        return clearedCage;
      }
      return cage;
    });
    setCages(activeCagesCleared);
    saveStored(STORAGE_KEYS.CAGES, activeCagesCleared);

    // 5. Hapus Riwayat Rawat Inap Pasien ini
    const isHistoryBelongsToPet = (h: any) => {
      if (h.petId) return h.petId === petId;
      if (!h.petId && cleanPhone && petName) {
        return (
          String(h.petName || '').toLowerCase().trim() === petName &&
          normalizePhoneWithZero(h.ownerWhatsapp) === cleanPhone
        );
      }
      return false;
    };
    const historyToDelete = stateRefs.current.inpatientHistory.filter((h) => isHistoryBelongsToPet(h));
    const remainingHistory = stateRefs.current.inpatientHistory.filter((h) => !isHistoryBelongsToPet(h));
    setInpatientHistory(remainingHistory);
    saveStored(STORAGE_KEYS.INPATIENT_HISTORY, remainingHistory);

    historyToDelete.forEach((h) => {
      deleteRecordFromBackend('cages', h.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // 6. Hapus Booking Terkait Pasien ini
    const isBookingBelongsToPet = (b: BookingAppointment) => {
      if (cleanPhone && petName) {
        return (
          b.petName?.toLowerCase().trim() === petName &&
          normalizePhoneWithZero(b.ownerWhatsapp) === cleanPhone
        );
      }
      return false;
    };
    setBookings((prev) => prev.filter((b) => !isBookingBelongsToPet(b)));
    const bToDelete = stateRefs.current.bookings.filter((b) => isBookingBelongsToPet(b));
    bToDelete.forEach((b) => {
      deleteRecordFromBackend('bookings', b.id, spreadsheetConfig.webAppUrl).catch(() => {});
    });

    // JIKA PEMILIK HANYA MEMILIKI 1 PASIEN INI -> HAPUS JUGA DATA PEMILIK DAN DATA TERKAIT LAINNYA
    if (isSinglePetOwner && matchedOwner) {
      setOwners((prev) => prev.filter((o) => o.id !== matchedOwner.id));
      deleteRecordFromBackend('owners', matchedOwner.id, spreadsheetConfig.webAppUrl).catch(() => {});

      // Hapus umpan balik pemilik ini
      setFeedbacks((prev) =>
        prev.filter((f) => {
          if (cleanPhone && targetOwnerName) {
            return !(
              normalizePhoneWithZero(f.ownerWhatsapp) === cleanPhone &&
              f.ownerName?.toLowerCase().trim() === targetOwnerName
            );
          }
          return true;
        })
      );
      const fToDelete = stateRefs.current.feedbacks.filter((f) => {
        if (cleanPhone && targetOwnerName) {
          return (
            normalizePhoneWithZero(f.ownerWhatsapp) === cleanPhone &&
            f.ownerName?.toLowerCase().trim() === targetOwnerName
          );
        }
        return false;
      });
      fToDelete.forEach((f) => {
        deleteRecordFromBackend('feedbacks', f.id, spreadsheetConfig.webAppUrl).catch(() => {});
      });
    }
    setDataVersion((v) => v + 1);
  };

  const updateOwner = (ownerId: string, updatedData: Partial<Owner>) => {
    let updatedRecord: Owner | null = null;
    setOwners((prev) =>
      prev.map((o) => {
        if (o.id === ownerId) {
          const merged = { ...o, ...updatedData };
          updatedRecord = merged;
          if (updatedData.whatsapp && updatedData.whatsapp !== o.whatsapp) {
            const oldPhone = normalizePhoneWithZero(o.whatsapp);
            const newPhone = normalizePhoneWithZero(updatedData.whatsapp);
            setPets((prevPets) =>
              prevPets.map((p) => {
                if (p.ownerId === ownerId || normalizePhoneWithZero(p.ownerWhatsapp) === oldPhone) {
                  return { ...p, ownerWhatsapp: newPhone, ownerName: merged.name };
                }
                return p;
              })
            );
          } else if (updatedData.name && updatedData.name !== o.name) {
            setPets((prevPets) =>
              prevPets.map((p) => {
                if (p.ownerId === ownerId || normalizePhoneWithZero(p.ownerWhatsapp) === normalizePhoneWithZero(o.whatsapp)) {
                  return { ...p, ownerName: merged.name };
                }
                return p;
              })
            );
          }
          return merged;
        }
        return o;
      })
    );

    if (updatedRecord) {
      pushRecordToBackend('owners', updatedRecord).catch(() => {});
      trackAndVerifyWrite('owners', updatedRecord);
      setDataVersion((v) => v + 1);
    }
  };

  const updatePet = (petId: string, updatedData: Partial<Pet>) => {
    let updatedRecord: Pet | null = null;
    setPets((prev) =>
      prev.map((p) => {
        if (p.id === petId) {
          const merged = { ...p, ...updatedData };
          updatedRecord = merged;
          return merged;
        }
        return p;
      })
    );

    if (updatedRecord) {
      pushRecordToBackend('pets', updatedRecord).catch(() => {});
      trackAndVerifyWrite('pets', updatedRecord);
      setDataVersion((v) => v + 1);
    }
  };

  const deleteSoapRecord = async (recordId: string) => {
    const targetIdStr = String(recordId || '').trim().toLowerCase();
    const targetSoap = soapRecords.find((s) => String(s.id || '').trim().toLowerCase() === targetIdStr);
    setSoapRecords((prev) => {
      const next = prev.filter((s) => String(s.id || '').trim().toLowerCase() !== targetIdStr);
      saveStored(STORAGE_KEYS.SOAP, next);
      return next;
    });

    // Tunggu proses hapus di backend & spreadsheet selesai
    await deleteRecordFromBackend('soapRecords', recordId, spreadsheetConfig.webAppUrl).catch(() => {});

    // Jika rekam medis ini merupakan hasil pemulangan rawat inap, sinkronkan hapus juga di riwayat rawat inap
    if (targetSoap) {
      const isRawatInap =
        String(targetSoap.soap?.subjective || '').toLowerCase().includes('rawat inap') ||
        String(targetSoap.soap?.assessment || '').toLowerCase().includes('rawat inap') ||
        String(targetSoap.id || '').toLowerCase().includes('hist');

      if (isRawatInap && targetSoap.petId) {
        const matchedInpatient = inpatientHistory.find(
          (h) =>
            h.petId === targetSoap.petId &&
            (h.dischargedAt === targetSoap.date || h.admittedAt === targetSoap.date || String(h.id || '').trim().toLowerCase() === targetIdStr)
        );
        if (matchedInpatient) {
          setInpatientHistory((prev) => {
            const next = prev.filter((h) => h.id !== matchedInpatient.id);
            saveStored(STORAGE_KEYS.INPATIENT_HISTORY, next);
            return next;
          });
          deleteRecordFromBackend('cages', matchedInpatient.id, spreadsheetConfig.webAppUrl).catch(() => {});
        }
      }
    }
    setDataVersion((v) => v + 1);
  };

  const updateSoapRecord = (recordId: string, updatedFields: Partial<SoapRecord>) => {
    let updatedRecord: SoapRecord | null = null;
    let oldPrescriptions: PrescriptionItem[] = [];

    setSoapRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === recordId) {
          oldPrescriptions = rec.prescriptions || [];
          updatedRecord = {
            ...rec,
            ...updatedFields,
            soap: {
              ...rec.soap,
              ...(updatedFields.soap || {}),
            },
            vitals: {
              ...rec.vitals,
              ...(updatedFields.vitals || {}),
            },
            diagnosticNotes: updatedFields.diagnosticNotes !== undefined ? updatedFields.diagnosticNotes : rec.diagnosticNotes,
            diagnosticAttachments: updatedFields.diagnosticAttachments !== undefined ? updatedFields.diagnosticAttachments : rec.diagnosticAttachments,
            prescriptions: updatedFields.prescriptions !== undefined ? updatedFields.prescriptions : rec.prescriptions,
          };
          return updatedRecord;
        }
        return rec;
      })
    );

    if (updatedRecord) {
      pushRecordToBackend('soapRecords', updatedRecord, spreadsheetConfig.webAppUrl).catch(() => {});
      trackAndVerifyWrite('soapRecords', updatedRecord);

      // Sinkronkan stok obat jika ada perubahan e-resep
      if (updatedFields.prescriptions) {
        const newPrescriptions = updatedFields.prescriptions;

        setInventory((prevInventory) => {
          let updatedInv = [...prevInventory];
          const affectedItemIds = new Set<string>();

          // Kembalikan stok resep lama
          oldPrescriptions.forEach((oldP) => {
            if (oldP.inventoryItemId) {
              affectedItemIds.add(oldP.inventoryItemId);
              updatedInv = updatedInv.map((inv) =>
                inv.id === oldP.inventoryItemId
                  ? { ...inv, stockQuantity: inv.stockQuantity + (oldP.quantity || 1) }
                  : inv
              );
            }
          });

          // Potong stok resep baru
          newPrescriptions.forEach((newP) => {
            if (newP.inventoryItemId) {
              affectedItemIds.add(newP.inventoryItemId);
              updatedInv = updatedInv.map((inv) =>
                inv.id === newP.inventoryItemId
                  ? { ...inv, stockQuantity: Math.max(0, inv.stockQuantity - (newP.quantity || 1)) }
                  : inv
              );
            }
          });

          saveStored(STORAGE_KEYS.INVENTORY, updatedInv);

          // Push hanya record obat yang terdampak perubahan resep (bukan menimpa seluruh tabel)
          affectedItemIds.forEach((itemId) => {
            const affectedItem = updatedInv.find((inv) => inv.id === itemId);
            if (affectedItem) {
              pushRecordToBackend('inventory', affectedItem, spreadsheetConfig.webAppUrl).catch(() => {});
              trackAndVerifyWrite('inventory', affectedItem);
            }
          });

          return updatedInv;
        });
      }
    }
    setDataVersion((v) => v + 1);
  };

  // ==========================================
  // SOAP MEDICAL RECORD
  // ==========================================

  const saveSoapRecord = (
    record: Omit<SoapRecord, 'id' | 'date'>,
    prescriptionItems: PrescriptionItem[]
  ) => {
    const now = new Date();
    const dateFormatted = getRegistrationTimestamp(now);
    const nextSoapId = generateSequentialId('soap', soapRecords.map((s) => s.id));

    const newRecord: SoapRecord = {
      ...record,
      id: nextSoapId,
      date: dateFormatted,
      prescriptions: prescriptionItems,
    };

    setSoapRecords((prev) => sortSoapNewestFirst([newRecord, ...prev]));

    // Direct O(1) single-record sync ke backend & Google Sheets
    pushRecordToBackend('soapRecords', newRecord, spreadsheetConfig.webAppUrl).catch(() => {});
    trackAndVerifyWrite('soapRecords', newRecord);

    // Potong stok otomatis jika ada resep, simpan ke storage, dan sinkronkan ke backend
    if (prescriptionItems && prescriptionItems.length > 0) {
      setInventory((prev) => {
        let currentInv = [...prev];
        const affectedItems: InventoryItem[] = [];

        prescriptionItems.forEach((presc) => {
          if (!presc.inventoryItemId) return;
          const idx = currentInv.findIndex((item) => item.id === presc.inventoryItemId);
          if (idx !== -1) {
            const updated = {
              ...currentInv[idx],
              stockQuantity: Math.max(0, currentInv[idx].stockQuantity - (presc.quantity || 1)),
            };
            currentInv[idx] = updated;
            affectedItems.push(updated);
          }
        });

        saveStored(STORAGE_KEYS.INVENTORY, currentInv);

        // Kirim update tiap item obat yang terpotong ke server backend & Google Sheets
        affectedItems.forEach((updatedItem) => {
          pushRecordToBackend('inventory', updatedItem, spreadsheetConfig.webAppUrl).catch(() => {});
          trackAndVerifyWrite('inventory', updatedItem);
        });

        return currentInv;
      });
    }

    // Tandai queue selesai jika berasal dari antrean
    if (record.queueId) {
      completeQueue(record.queueId);
    }
    setDataVersion((v) => v + 1);
  };

  // ==========================================
  // INPATIENT CAGES
  // ==========================================

  const updateCageStatus = (cageId: string, status: CageStatus, petId?: string) => {
    const targetId = normalizeCageId(cageId) || cageId;
    setCages((prev) => {
      const updated = prev.map((c) => {
        const cNorm = normalizeCageId(c.id, c.label) || c.id;
        if (cNorm !== targetId && c.id !== targetId) return c;
        if (status === 'Available' || status === 'Cleaning') {
          return {
            ...c,
            id: targetId,
            status,
            petId: undefined,
            petName: undefined,
            petType: undefined,
            ownerName: undefined,
            ownerWhatsapp: undefined,
            diagnosis: undefined,
            admittedAt: undefined,
            veterinarian: undefined,
            observations: [],
          };
        }
        return { ...c, id: targetId, status, petId };
      });
      const sanitized = sanitizeCagesList(updated);
      pushTableToBackend('cages', sanitized).catch(() => {});
      return sanitized;
    });
  };

  const admitPetToCage = (
    cageId: string,
    pet: Pet,
    owner: Owner,
    diagnosis: string,
    vet: string
  ) => {
    const targetId = normalizeCageId(cageId) || cageId;
    const now = new Date();
    const timeFormatted = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setCages((prev) => {
      const updated = prev.map((c) => {
        const cNorm = normalizeCageId(c.id, c.label) || c.id;
        if (cNorm !== targetId && c.id !== targetId) return c;
        return {
          ...c,
          id: targetId, // ID kandang selalu mengikuti nama kandang fisik (A1..B6)
          status: 'Occupied' as CageStatus,
          petId: pet.id,
          petName: pet.name,
          petType: pet.type,
          ownerName: owner.name,
          ownerWhatsapp: owner.whatsapp,
          diagnosis,
          admittedAt: timeFormatted,
          veterinarian: vet,
          observations: [],
        };
      });
      const sanitized = sanitizeCagesList(updated);
      pushTableToBackend('cages', sanitized).catch(() => {});
      return sanitized;
    });

    // Update status pet jadi Rawat Inap
    setPets((prev) => {
      const updatedPets = prev.map((p) => (p.id === pet.id ? { ...p, status: 'Rawat Inap' as const } : p));
      const targetPet = updatedPets.find((p) => p.id === pet.id);
      if (targetPet) pushRecordToBackend('pets', targetPet).catch(() => {});
      return updatedPets;
    });
  };

  const addCageObservation = (cageId: string, obs: Omit<InpatientObservation, 'id'>) => {
    const targetId = normalizeCageId(cageId) || cageId;
    const currentCage = cages.find((c) => (normalizeCageId(c.id, c.label) || c.id) === targetId);
    const newObs: InpatientObservation = {
      ...obs,
      id: generateSequentialId(
        'obs',
        currentCage?.observations?.map((o) => o.id) || []
      ),
    };

    setCages((prev) => {
      const updated = prev.map((c) => {
        const cNorm = normalizeCageId(c.id, c.label) || c.id;
        return (cNorm === targetId || c.id === targetId)
          ? { ...c, observations: [newObs, ...(c.observations || [])] }
          : c;
      });
      const sanitized = sanitizeCagesList(updated);
      pushTableToBackend('cages', sanitized).catch(() => {});
      return sanitized;
    });
  };

  const dischargeCage = (cageId: string) => {
    const targetId = normalizeCageId(cageId) || cageId;
    const cage = cages.find((c) => (normalizeCageId(c.id, c.label) || c.id) === targetId);
    if (cage && cage.petId) {
      const now = new Date();
      const dischargeTimeFormatted = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const historyRecord: InpatientHistoryRecord = {
        id: generateSequentialId('inpatient_hist', inpatientHistory.map((h) => h.id)),
        cageId: cage.id,
        cageLabel: cage.label || `Kandang ${cage.id}`,
        petId: cage.petId,
        petName: cage.petName || 'Pasien',
        petType: cage.petType || 'Cat',
        ownerName: cage.ownerName || 'Pemilik',
        ownerWhatsapp: cage.ownerWhatsapp || '-',
        diagnosis: cage.diagnosis || 'Perawatan Rawat Inap',
        admittedAt: cage.admittedAt || dischargeTimeFormatted,
        dischargedAt: dischargeTimeFormatted,
        veterinarian: cage.veterinarian && !cage.veterinarian.toLowerCase().includes('sarah wijaya')
          ? cage.veterinarian
          : (currentUser?.isPracticingDoctor ? currentUser.name : ''),
        observations: cage.observations || [],
      };

      setInpatientHistory((prev) => {
        const nextHist = [historyRecord, ...prev];
        saveStored(STORAGE_KEYS.INPATIENT_HISTORY, nextHist);
        return nextHist;
      });

      // 1. Tambahkan data ke Rekam Medik (SOAP Records / Sheet 4_RekamMedis)
      const nextSoapId = generateSequentialId('soap', soapRecords.map((s) => s.id));
      const soapRec: SoapRecord = {
        id: nextSoapId,
        petId: cage.petId!,
        petName: cage.petName || 'Pasien',
        ownerName: cage.ownerName || 'Pemilik',
        ownerWhatsapp: cage.ownerWhatsapp || '-',
        veterinarian: cage.veterinarian && !cage.veterinarian.toLowerCase().includes('sarah wijaya')
          ? cage.veterinarian
          : (currentUser?.isPracticingDoctor ? currentUser.name : ''),
        date: dischargeTimeFormatted,
        vitals: {
          weight: 0,
          temperature: cage.observations?.[0]?.temp || 38.5,
          heartRate: 0,
          respiratoryRate: 0,
        },
        soap: {
          subjective: `Rawat Inap Selesai.\nMasuk: ${cage.admittedAt}\nKeluar: ${dischargeTimeFormatted}`,
          objective: `Pasien dipulangkan dalam kondisi stabil. Log observasi rawat inap memiliki ${cage.observations?.length || 0} entri.`,
          assessment: `Selesai Rawat Inap - Diagnosis: ${cage.diagnosis}`,
          plan: `Edukasi owner mengenai pemeliharaan mandiri, pemulihan pasca tindakan medis, dan terapi rawat jalan di rumah.`,
        },
        prescriptions: [],
        serviceFee: 0,
      };
      setSoapRecords((prev) => [soapRec, ...prev]);
      pushRecordToBackend('soapRecords', soapRec, spreadsheetConfig.webAppUrl).catch(() => {});
      trackAndVerifyWrite('soapRecords', soapRec);

      // 2. Data pasien selesai rawat inap pindah ke baris 14 di Sheet Rawat Inap (status: 'selesai')
      const dischargedCageRecord: InpatientCage = {
        id: historyRecord.id,
        label: cage.label || `Kandang ${cage.id}`,
        status: 'selesai' as any,
        petId: cage.petId,
        petName: cage.petName,
        petType: cage.petType,
        ownerName: cage.ownerName,
        ownerWhatsapp: cage.ownerWhatsapp,
        diagnosis: cage.diagnosis || 'Perawatan Rawat Inap',
        admittedAt: cage.admittedAt || dischargeTimeFormatted,
        dischargedAt: dischargeTimeFormatted,
        veterinarian: historyRecord.veterinarian,
        observations: cage.observations || [],
      };

      // 3. Kosongkan unit kandang fisik asal (A1..B6) dan set ke status 'Cleaning'
      const updatedActiveCages = cages.map((c) => {
        const cNorm = normalizeCageId(c.id, c.label) || c.id;
        if (cNorm !== targetId && c.id !== targetId) return c;
        return {
          ...c,
          id: targetId,
          status: 'Cleaning' as CageStatus,
          petId: undefined,
          petName: undefined,
          petType: undefined,
          ownerName: undefined,
          ownerWhatsapp: undefined,
          diagnosis: undefined,
          admittedAt: undefined,
          veterinarian: undefined,
          observations: [],
        };
      });

      const sanitizedActive12 = sanitizeCagesList(updatedActiveCages);
      setCages(sanitizedActive12);

      // Seluruh riwayat selesai: record baru berada paling atas (baris 14 Sheet 5_RawatInap)
      const allHistoryRecords: InpatientCage[] = [historyRecord, ...inpatientHistory].map((h) => ({
        id: h.id,
        label: h.cageLabel || `Kandang ${h.cageId}`,
        status: 'selesai' as any,
        petId: h.petId,
        petName: h.petName,
        petType: h.petType,
        ownerName: h.ownerName,
        ownerWhatsapp: h.ownerWhatsapp,
        diagnosis: h.diagnosis,
        admittedAt: h.admittedAt,
        dischargedAt: h.dischargedAt,
        veterinarian: h.veterinarian,
        observations: h.observations || [],
      }));

      // Kirim record baru untuk ditempatkan di baris 14, dan sinkronkan tabel lengkap
      pushRecordToBackend('cages', dischargedCageRecord, spreadsheetConfig.webAppUrl).catch(() => {});
      pushTableToBackend('cages', [...sanitizedActive12, ...allHistoryRecords]).catch(() => {});

      // 4. Update status pasien menjadi 'Sehat'
      setPets((prev) => {
        const updated = prev.map((p) => (p.id === cage.petId ? { ...p, status: 'Sehat' as const } : p));
        const dischargedPet = updated.find((p) => p.id === cage.petId);
        if (dischargedPet) pushRecordToBackend('pets', dischargedPet, spreadsheetConfig.webAppUrl).catch(() => {});
        return updated;
      });
      return;
    }
    updateCageStatus(cageId, 'Cleaning');
  };

  const deleteInpatientHistoryRecord = (id: string) => {
    const targetHist = inpatientHistory.find((h) => h.id === id);
    setInpatientHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveStored(STORAGE_KEYS.INPATIENT_HISTORY, next);
      return next;
    });
    deleteRecordFromBackend('cages', id, spreadsheetConfig.webAppUrl).catch(() => {});

    // Sinkronkan hapus rekam medis SOAP terkait di sheet 4_RekamMedis
    if (targetHist && targetHist.petId) {
      const matchedSoap = soapRecords.find(
        (s) =>
          s.petId === targetHist.petId &&
          (s.date === targetHist.dischargedAt || s.date === targetHist.admittedAt || String(s.id) === String(id)) &&
          (String(s.soap?.subjective || '').toLowerCase().includes('rawat inap') ||
           String(s.soap?.assessment || '').toLowerCase().includes('rawat inap'))
      );
      if (matchedSoap) {
        setSoapRecords((prev) => prev.filter((s) => s.id !== matchedSoap.id));
        deleteRecordFromBackend('soapRecords', matchedSoap.id, spreadsheetConfig.webAppUrl).catch(() => {});
      }
    }
  };

  const updateInpatientHistoryRecord = (id: string, updatedFields: Partial<InpatientHistoryRecord>) => {
    let updatedRecord: InpatientHistoryRecord | null = null;
    setInpatientHistory((prev) => {
      const next = prev.map((item) => {
        if (item.id === id) {
          updatedRecord = { ...item, ...updatedFields };
          return updatedRecord;
        }
        return item;
      });
      saveStored(STORAGE_KEYS.INPATIENT_HISTORY, next);
      return next;
    });

    if (updatedRecord) {
      const dischargedCageRecord: InpatientCage = {
        id: (updatedRecord as InpatientHistoryRecord).id,
        label: (updatedRecord as InpatientHistoryRecord).cageLabel || '',
        status: 'selesai' as any,
        petId: (updatedRecord as InpatientHistoryRecord).petId,
        petName: (updatedRecord as InpatientHistoryRecord).petName,
        petType: (updatedRecord as InpatientHistoryRecord).petType,
        ownerName: (updatedRecord as InpatientHistoryRecord).ownerName,
        ownerWhatsapp: (updatedRecord as InpatientHistoryRecord).ownerWhatsapp,
        diagnosis: (updatedRecord as InpatientHistoryRecord).diagnosis,
        admittedAt: (updatedRecord as InpatientHistoryRecord).admittedAt,
        dischargedAt: (updatedRecord as InpatientHistoryRecord).dischargedAt,
        veterinarian: (updatedRecord as InpatientHistoryRecord).veterinarian,
        observations: (updatedRecord as InpatientHistoryRecord).observations || [],
      };
      pushRecordToBackend('cages', dischargedCageRecord, spreadsheetConfig.webAppUrl).catch(() => {});
    }
  };

  // ==========================================
  // INVENTORY & STOCK
  // ==========================================

  const restockItem = (itemId: string, addedQuantity: number) => {
    const today = new Date().toISOString().split('T')[0];
    let updatedItem: InventoryItem | null = null;
    setInventory((prev) => {
      const next = prev.map((item) => {
        if (item.id === itemId) {
          updatedItem = {
            ...item,
            stockQuantity: item.stockQuantity + addedQuantity,
            lastRestocked: today,
          };
          return updatedItem;
        }
        return item;
      });
      saveStored(STORAGE_KEYS.INVENTORY, next);
      return next;
    });
    if (updatedItem) {
      pushRecordToBackend('inventory', updatedItem, spreadsheetConfig.webAppUrl).catch(() => {});
      trackAndVerifyWrite('inventory', updatedItem);
      setDataVersion((v) => v + 1);
    }
  };

  const addInventoryItem = (item: Omit<InventoryItem, 'id' | 'lastRestocked'>) => {
    if (!item.name || !item.name.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const nextInvId = generateSequentialId('inv', inventory.map((i) => i.id));
    const newItem: InventoryItem = {
      ...item,
      id: nextInvId,
      lastRestocked: today,
    };
    setInventory((prev) => {
      const next = [newItem, ...prev];
      saveStored(STORAGE_KEYS.INVENTORY, next);
      return next;
    });
    pushRecordToBackend('inventory', newItem, spreadsheetConfig.webAppUrl).catch(() => {});
    trackAndVerifyWrite('inventory', newItem);
    setDataVersion((v) => v + 1);
  };

  const updateInventoryItem = (itemId: string, updatedData: Partial<InventoryItem>) => {
    let updatedItem: InventoryItem | null = null;
    setInventory((prev) => {
      const next = prev.map((item) => {
        if (item.id === itemId) {
          updatedItem = { ...item, ...updatedData };
          return updatedItem;
        }
        return item;
      });
      saveStored(STORAGE_KEYS.INVENTORY, next);
      return next;
    });
    if (updatedItem) {
      pushRecordToBackend('inventory', updatedItem, spreadsheetConfig.webAppUrl).catch(() => {});
      trackAndVerifyWrite('inventory', updatedItem);
      setDataVersion((v) => v + 1);
    }
  };

  const deleteInventoryItem = async (itemId: string) => {
    const targetIdStr = String(itemId).trim().toLowerCase();
    setInventory((prev) => {
      const next = prev.filter((item) => String(item.id).trim().toLowerCase() !== targetIdStr);
      saveStored(STORAGE_KEYS.INVENTORY, next);
      return next;
    });
    deleteRecordFromBackend('inventory', itemId, spreadsheetConfig.webAppUrl).catch(() => {});
    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      deleteRecordFromSpreadsheet(spreadsheetConfig.webAppUrl, 'inventory', itemId).catch(() => {});
    }
    setPendingVerifications((prev) => prev.filter((item) => item.id !== itemId));
    setDataVersion((v) => v + 1);
  };

  // ==========================================
  // BOOKING APPOINTMENTS
  // ==========================================

  const addBooking = (booking: Omit<BookingAppointment, 'id'>) => {
    const cleanPhone = normalizePhoneWithZero(booking.ownerWhatsapp);
    const nextBkId = generateSequentialId('bk', bookings.map((b) => b.id));
    const newBooking: BookingAppointment = {
      ...booking,
      ownerWhatsapp: cleanPhone,
      id: nextBkId,
    };
    setBookings((prev) => [newBooking, ...prev]);

    // OTOMATIS: Daftarkan pemilik dan pasien hewan ke tabel resmi klinik
    // agar data pasien tidak hilang meskipun pasien tidak hadir atau melebihi waktu janji temu
    let owner = owners.find((o) => normalizePhoneWithZero(o.whatsapp) === cleanPhone);
    if (!owner) {
      const nextOwnerId = generateSequentialId('own', owners.map((o) => o.id));
      owner = {
        id: nextOwnerId,
        name: booking.ownerName.trim(),
        whatsapp: cleanPhone,
        address: 'Alamat Klien Booking',
        registeredAt: `${booking.date} ${booking.time || '10:00'}`,
        notes: `Pendaftaran Booking: ${booking.serviceType}${booking.notes ? ` - ${booking.notes}` : ''}`,
        informedConsent: 'Disetujui: Pendaftaran Booking Janji Temu',
      };
      setOwners((prev) => [owner!, ...prev]);
      pushRecordToBackend('owners', owner, spreadsheetConfig.webAppUrl).catch(() => {});
      trackAndVerifyWrite('owners', owner);
    }

    let pet = pets.find(
      (p) =>
        (p.ownerId === owner!.id || normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone) &&
        (p.name || '').trim().toLowerCase() === booking.petName.trim().toLowerCase()
    );
    if (!pet) {
      const nextPetId = generateSequentialId('pet', pets.map((p) => p.id));
      pet = {
        id: nextPetId,
        ownerId: owner!.id,
        ownerName: owner!.name,
        ownerWhatsapp: cleanPhone,
        name: booking.petName.trim(),
        type: booking.petType || 'Cat',
        breed: 'Mix / Domestik',
        ageOrDob: 'Dewasa',
        sex: 'Jantan',
        status: 'Sehat',
        registeredAt: `${booking.date} ${booking.time || '10:00'}`,
        notes: `Booking Janji Temu: ${booking.serviceType}`,
      };
      setPets((prev) => [pet!, ...prev]);
      pushRecordToBackend('pets', pet, spreadsheetConfig.webAppUrl).catch(() => {});
      trackAndVerifyWrite('pets', pet);
    }

    pushRecordToBackend('bookings', newBooking, spreadsheetConfig.webAppUrl).catch(() => {});
  };

  const updateBookingStatus = (id: string, status: BookingAppointment['status']) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b))
    );
  };

  // ==========================================
  // AUTH & SESSION & STAFF MANAGEMENT
  // ==========================================

  const addStaff = (newStaff: Omit<StaffUser, 'id'>): { success: boolean; message: string } => {
    const usernameClean = newStaff.username.trim().toLowerCase();
    if (!usernameClean) {
      return { success: false, message: 'Username tidak boleh kosong.' };
    }
    if (staffList.some((s) => s.username.toLowerCase() === usernameClean)) {
      return { success: false, message: `Username "${newStaff.username}" sudah terdaftar.` };
    }
    if (!newStaff.password || !newStaff.password.trim()) {
      return { success: false, message: 'Kata sandi wajib diisi untuk akun baru.' };
    }
    const nextStaffId = generateSequentialId('staff', staffList.map((s) => s.id));
    const staffMember: StaffUser = {
      ...newStaff,
      id: nextStaffId,
      username: usernameClean,
      password: newStaff.password.trim(),
    };
    const nextList = [...staffList, staffMember];
    setStaffList(nextList);
    saveStored(STORAGE_KEYS.STAFF_LIST, nextList);

    // Sync to backend if server available
    if (hasBackendServer()) {
      pushRecordToBackend('staff', staffMember).catch((err) => {
        console.warn('[Staff] Gagal menyimpan staf ke server:', err);
      });
    }

    // Push to Google Spreadsheet if connected
    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'staff', nextList);
    }
    return { success: true, message: `Admin / Staf ${newStaff.name} berhasil ditambahkan.` };
  };

  const deleteStaff = (id: string): { success: boolean; message: string } => {
    if (staffList.length <= 1) {
      return { success: false, message: 'Minimal harus ada 1 akun admin / staf terdaftar di sistem.' };
    }
    const target = staffList.find((s) => s.id === id);
    if (!target) {
      return { success: false, message: 'Data admin tidak ditemukan.' };
    }
    if (currentUser?.id === id) {
      return { success: false, message: 'Anda tidak dapat menghapus akun yang sedang aktif login.' };
    }
    const nextList = staffList.filter((s) => s.id !== id);
    setStaffList(nextList);
    saveStored(STORAGE_KEYS.STAFF_LIST, nextList);

    // Hapus staf dari backend dan Google Spreadsheet
    deleteRecordFromBackend('staff', id, spreadsheetConfig.webAppUrl).catch((err) => {
      console.warn('[Staff] Gagal menghapus staf di backend:', err);
    });

    return { success: true, message: `Akun ${target.name} berhasil dihapus.` };
  };

  const updateStaff = (
    id: string,
    updatedData: Partial<StaffUser>
  ): { success: boolean; message: string } => {
    const target = staffList.find((s) => s.id === id);
    if (!target) {
      return { success: false, message: 'Data akun staf tidak ditemukan.' };
    }

    const payload = { ...updatedData };

    if (payload.name !== undefined) {
      const cleanName = payload.name.trim();
      if (!cleanName) {
        return { success: false, message: 'Nama lengkap tidak boleh kosong.' };
      }
      payload.name = cleanName;
    }

    if (payload.username !== undefined) {
      const cleanUname = payload.username.trim().toLowerCase();
      if (!cleanUname) {
        return { success: false, message: 'Username tidak boleh kosong.' };
      }
      if (cleanUname.length < 3) {
        return { success: false, message: 'Username minimal harus 3 karakter.' };
      }
      const duplicate = staffList.find(
        (s) => s.id !== id && s.username.toLowerCase() === cleanUname
      );
      if (duplicate) {
        return { success: false, message: `Username "${cleanUname}" sudah digunakan akun lain.` };
      }
      payload.username = cleanUname;
    }

    if (payload.password !== undefined) {
      const trimmedPass = payload.password.trim();
      if (trimmedPass) {
        if (trimmedPass.length < 3) {
          return { success: false, message: 'Kata sandi minimal harus 3 karakter.' };
        }
        payload.password = trimmedPass;
      } else {
        delete payload.password; // Jangan ubah password jika dikosongkan
      }
    }

    const updatedStaff: StaffUser = {
      ...target,
      ...payload,
    };

    const nextList = staffList.map((s) => (s.id === id ? updatedStaff : s));
    setStaffList(nextList);
    saveStored(STORAGE_KEYS.STAFF_LIST, nextList);

    if (currentUser?.id === id) {
      setCurrentUser(updatedStaff);
      saveStored(STORAGE_KEYS.STAFF_USER, updatedStaff);
    }

    if (hasBackendServer()) {
      pushRecordToBackend('staff', updatedStaff).catch((err) => {
        console.warn('[Staff] Gagal memperbarui staf di server:', err);
      });
    }

    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'staff', nextList);
    }
    return { success: true, message: `Akun ${updatedStaff.name} berhasil diperbarui.` };
  };

  const updateStaffPassword = (id: string, newPassword: string): { success: boolean; message: string } => {
    const trimmed = newPassword.trim();
    if (!trimmed) {
      return { success: false, message: 'Password baru tidak boleh kosong.' };
    }
    if (trimmed.length < 3) {
      return { success: false, message: 'Password minimal harus 3 karakter.' };
    }
    const target = staffList.find((s) => s.id === id);
    if (!target) {
      return { success: false, message: 'Data admin tidak ditemukan.' };
    }
    const updatedStaff: StaffUser = {
      ...target,
      password: trimmed,
    };
    const nextList = staffList.map((s) => (s.id === id ? updatedStaff : s));
    setStaffList(nextList);
    saveStored(STORAGE_KEYS.STAFF_LIST, nextList);

    if (currentUser?.id === id) {
      setCurrentUser(updatedStaff);
      saveStored(STORAGE_KEYS.STAFF_USER, updatedStaff);
    }

    if (hasBackendServer()) {
      pushRecordToBackend('staff', updatedStaff).catch((err) => {
        console.warn('[Staff] Gagal memperbarui password di server:', err);
      });
    }

    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'staff', nextList);
    }
    return { success: true, message: `Password untuk ${target.name} berhasil diperbarui.` };
  };

  const loginStaff = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      return { success: false, message: 'Username wajib diisi.' };
    }
    if (!cleanPass) {
      return { success: false, message: 'Kata sandi wajib diisi.' };
    }

    // 1. Coba login melalui endpoint Server Backend terlebih dahulu menggunakan fetch
    if (hasBackendServer()) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-clinic-app-token': CLINIC_APP_HANDSHAKE_TOKEN,
          },
          body: JSON.stringify({ username: cleanUser, password: cleanPass }),
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data?.success && data.token) {
          sessionStorage.setItem('vetcare_session_token', data.token);
          localStorage.setItem('vetcare_session_token', data.token);
          const loggedInStaff: StaffUser = {
            id: data.user.id,
            username: data.user.username,
            name: data.user.name,
            role: data.user.role,
            avatar: data.user.avatar || '👨‍💼',
            isPracticingDoctor: data.user.isPracticingDoctor,
          };
          setCurrentUser(loggedInStaff);
          saveStored(STORAGE_KEYS.STAFF_USER, loggedInStaff);
          return { success: true, message: 'Login berhasil.' };
        } else if (res.status === 401 || res.status === 400 || res.status === 403 || res.status === 429) {
          return { success: false, message: data?.message || 'Username atau kata sandi tidak sesuai.' };
        }
      } catch {
        // Terjadi error jaringan, lanjutkan ke fallback lokal
      }
    }

    // 2. Fallback untuk Static Hosting (GitHub Pages / SPA mandiri tanpa Node.js server)
    let found = staffList.find((s) => s.username.toLowerCase() === cleanUser);
    if (!found) {
      found = INITIAL_STAFF.find((s) => s.username.toLowerCase() === cleanUser);
    }
    if (!found) {
      return { success: false, message: 'Username tidak terdaftar di sistem klinik.' };
    }

    const expectedPassword = String(found.password ?? '').trim();
    if (!expectedPassword) {
      return { success: false, message: 'Akun belum memiliki kata sandi. Minta Administrator menetapkan password.' };
    }

    const isMatch = verifyPassword(cleanPass, expectedPassword);
    if (!isMatch) {
      return { success: false, message: 'Kata sandi tidak sesuai. Silakan periksa kembali kata sandi Anda.' };
    }

    // Buat token sesi client untuk offline mode
    const offlineToken = `client.${found.id}.${Date.now()}`;
    sessionStorage.setItem('vetcare_session_token', offlineToken);
    localStorage.setItem('vetcare_session_token', offlineToken);
    setCurrentUser(found);
    saveStored(STORAGE_KEYS.STAFF_USER, found);
    return { success: true, message: 'Login berhasil.' };
  };

  const logoutStaff = () => {
    sessionStorage.removeItem('vetcare_session_token');
    localStorage.removeItem('vetcare_session_token');
    setCurrentUser(null);
  };

  const setTrackedTicket = (ticket: string): boolean => {
    const clean = ticket.trim().toUpperCase();
    const found = queues.find((q) => q.ticketNumber.toUpperCase() === clean);
    if (found) {
      setActivePatientTicket(found.ticketNumber);
      return true;
    }
    return false;
  };

  const trackByPhone = (phone: string | number): boolean => {
    const cleanPhone = normalizePhoneWithZero(phone);
    if (!cleanPhone) return false;
    // Hanya cari antrean yang AKTIF (Menunggu / Di Ruang Poli). Pasien yang sudah selesai tidak muncul lagi dalam antrean aktif.
    const activeQueues = queues.filter(
      (q) =>
        normalizePhoneWithZero(q.ownerWhatsapp) === cleanPhone &&
        q.status !== 'Selesai' &&
        q.status !== 'Dibatalkan'
    );
    if (activeQueues.length > 0) {
      const latest = activeQueues[activeQueues.length - 1];
      setActivePatientTicket(latest.ticketNumber);
      return true;
    }
    return false;
  };

  const clearPatientSession = () => {
    setActivePatientTicket(null);
  };

  const dismissCallNotification = () => {
    setCallNotification(null);
  };

  const getPetById = (id: string) => pets.find((p) => p.id === id);
  const getOwnerByPhone = (phone: string | number) => {
    const cleanTarget = normalizePhoneWithZero(phone);
    if (!cleanTarget) return undefined;
    return owners.find((o) => normalizePhoneWithZero(o.whatsapp) === cleanTarget);
  };
  const getPetsByOwnerPhone = (phone: string | number, ownerId?: string) => {
    const cleanTarget = normalizePhoneWithZero(phone);
    const targetDigits = String(phone ?? '').replace(/\D/g, '');
    return pets.filter((p) => {
      if (ownerId && p.ownerId && p.ownerId === ownerId) return true;
      if (cleanTarget && normalizePhoneWithZero(p.ownerWhatsapp) === cleanTarget) return true;
      if (targetDigits && String(p.ownerWhatsapp ?? '').replace(/\D/g, '') === targetDigits) return true;
      return false;
    });
  };

  const addFeedback = (item: Omit<CustomerFeedback, 'id' | 'submittedAt'>) => {
    const newId = generateSequentialId('fb', feedbacks.map((f) => f.id));
    const now = new Date();
    const datePart = now.toLocaleDateString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timePart = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const submittedAt = `${datePart} ${timePart} WIB`;

    const newRecord: CustomerFeedback = {
      ...item,
      ownerWhatsapp: item.ownerWhatsapp ? normalizePhoneWithZero(item.ownerWhatsapp) : undefined,
      id: newId,
      submittedAt,
      isRead: false,
    };

    setFeedbacks((prev) => {
      const next = [newRecord, ...prev];
      saveStored(STORAGE_KEYS.FEEDBACKS, next);
      return next;
    });

    // Push record ke backend server secara real-time
    pushRecordToBackend('feedbacks', newRecord, spreadsheetConfig.webAppUrl).catch(() => {});

    // Push record ke Google Spreadsheet secara real-time
    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushSingleRecordToSpreadsheet(spreadsheetConfig.webAppUrl, 'feedbacks', newRecord).catch(() => {});
    }
  };

  const deleteFeedback = async (id: string) => {
    const targetIdStr = String(id).trim().toLowerCase();
    setFeedbacks((prev) => {
      const next = prev.filter((f) => String(f.id).trim().toLowerCase() !== targetIdStr);
      saveStored(STORAGE_KEYS.FEEDBACKS, next);
      return next;
    });
    await deleteRecordFromBackend('feedbacks', id, spreadsheetConfig.webAppUrl).catch(() => {});
  };

  const markFeedbackAsRead = (id: string) => {
    let updatedFeedback: CustomerFeedback | null = null;
    setFeedbacks((prev) => {
      const next = prev.map((f) => {
        if (f.id === id) {
          updatedFeedback = { ...f, isRead: true, readAt: new Date().toISOString() };
          return updatedFeedback;
        }
        return f;
      });
      saveStored(STORAGE_KEYS.FEEDBACKS, next);
      return next;
    });
    if (updatedFeedback) {
      pushRecordToBackend('feedbacks', updatedFeedback, spreadsheetConfig.webAppUrl).catch(() => {});
      if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
        pushSingleRecordToSpreadsheet(spreadsheetConfig.webAppUrl, 'feedbacks', updatedFeedback).catch(() => {});
      }
      triggerDataRefresh();
    }
  };

  const markAllFeedbacksAsRead = () => {
    const nowIso = new Date().toISOString();
    setFeedbacks((prev) => {
      const next = prev.map((f) => (f.isRead ? f : { ...f, isRead: true, readAt: nowIso }));
      saveStored(STORAGE_KEYS.FEEDBACKS, next);
      pushTableToBackend('feedbacks', next, spreadsheetConfig.webAppUrl).catch(() => {});
      if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
        pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'feedbacks', next).catch(() => {});
      }
      triggerDataRefresh();
      return next;
    });
  };

  const addSurgeryRecord = async (item: Partial<SurgeryRecord>): Promise<SurgeryRecord> => {
    const newId = generateSequentialId('op', surgeries.map((s) => s.id));
    const now = new Date();
    const datePart = item.date || now.toISOString().split('T')[0];
    const timePart = item.time || now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const createdAt = now.toISOString();

    const newRecord: SurgeryRecord = {
      id: newId,
      petId: item.petId || '',
      petName: item.petName || 'Pasien Tindakan',
      petType: item.petType || 'Cat',
      ownerName: item.ownerName || '',
      ownerWhatsapp: item.ownerWhatsapp ? normalizePhoneWithZero(item.ownerWhatsapp) : '',
      operationType: item.operationType || 'Tindakan Operasi',
      atropineDose: item.atropineDose || '',
      xylazineDose: item.xylazineDose || '',
      ketamineDose: item.ketamineDose || '',
      acpDose: item.acpDose || '',
      yohimbineDose: item.yohimbineDose || '',
      antibioticDoseAndType: item.antibioticDoseAndType || '',
      analgesicDoseAndType: item.analgesicDoseAndType || '',
      operator: item.operator || (currentUser?.isPracticingDoctor ? currentUser.name : ''),
      operationNotes: item.operationNotes || '',
      status: item.status || 'Dijadwalkan',
      date: datePart,
      time: timePart,
      createdAt,
    };

    setSurgeries((prev) => {
      const next = [newRecord, ...prev];
      saveStored(STORAGE_KEYS.SURGERIES, next);
      return next;
    });

    trackAndVerifyWrite('surgeries', newRecord);
    pushRecordToBackend('surgeries', newRecord, spreadsheetConfig.webAppUrl).catch(() => {});
    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushSingleRecordToSpreadsheet(spreadsheetConfig.webAppUrl, 'surgeries', newRecord).catch(() => {});
    }

    return newRecord;
  };

  const updateSurgeryRecord = async (id: string, updatedFields: Partial<SurgeryRecord>): Promise<boolean> => {
    let updatedRecord: SurgeryRecord | null = null;
    setSurgeries((prev) => {
      const next = prev.map((s) => {
        if (s.id === id) {
          updatedRecord = {
            ...s,
            ...updatedFields,
            ownerWhatsapp: updatedFields.ownerWhatsapp ? normalizePhoneWithZero(updatedFields.ownerWhatsapp) : s.ownerWhatsapp,
          };
          return updatedRecord;
        }
        return s;
      });
      saveStored(STORAGE_KEYS.SURGERIES, next);
      return next;
    });

    if (updatedRecord) {
      trackAndVerifyWrite('surgeries', updatedRecord);
      pushRecordToBackend('surgeries', updatedRecord, spreadsheetConfig.webAppUrl).catch(() => {});
      if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
        pushSingleRecordToSpreadsheet(spreadsheetConfig.webAppUrl, 'surgeries', updatedRecord).catch(() => {});
      }
      triggerDataRefresh();
      return true;
    }
    return false;
  };

  const deleteSurgeryRecord = async (id: string): Promise<boolean> => {
    const targetIdStr = String(id).trim().toLowerCase();
    setSurgeries((prev) => {
      const next = prev.filter((s) => String(s.id).trim().toLowerCase() !== targetIdStr);
      saveStored(STORAGE_KEYS.SURGERIES, next);
      return next;
    });
    await deleteRecordFromBackend('surgeries', id, spreadsheetConfig.webAppUrl).catch(() => {});
    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      deleteRecordFromSpreadsheet(spreadsheetConfig.webAppUrl, 'surgeries', id).catch(() => {});
    }
    triggerDataRefresh();
    return true;
  };

  return (
    <ClinicContext.Provider
      value={{
        owners,
        pets,
        queues,
        inventory,
        cages,
        inpatientHistory,
        soapRecords,
        bookings,
        feedbacks,
        surgeries,
        staffList,
        currentUser,
        currentServingTicket,
        activePatientTicket,
        callNotification,
        spreadsheetConfig,
        syncStatus,
        lastSyncMessage,
        dataVersion,
        triggerDataRefresh,
        connectSpreadsheet,
        disconnectSpreadsheet,
        updateSpreadsheetConfig,
        syncToSpreadsheet,
        syncFromSpreadsheet,
        importDatabase,
        clearAllData,
        registerPatient,
        callQueue,
        completeQueue,
        deleteQueue,
        deleteOwner,
        deletePet,
        deleteSoapRecord,
        updateSoapRecord,
        saveSoapRecord,
        updateCageStatus,
        addCageObservation,
        admitPetToCage,
        dischargeCage,
        deleteInpatientHistoryRecord,
        updateInpatientHistoryRecord,
        addSurgeryRecord,
        updateSurgeryRecord,
        deleteSurgeryRecord,
        restockItem,
        addInventoryItem,
        updateInventoryItem,
        deleteInventoryItem,
        addBooking,
        updateBookingStatus,
        addFeedback,
        deleteFeedback,
        markFeedbackAsRead,
        markAllFeedbacksAsRead,
        addStaff,
        deleteStaff,
        updateStaff,
        updateStaffPassword,
        loginStaff,
        logoutStaff,
        setTrackedTicket,
        trackByPhone,
        clearPatientSession,
        dismissCallNotification,
        getPetById,
        getOwnerByPhone,
        getPetsByOwnerPhone,
        resetToInitialData,
        updateOwner,
        updatePet,
        sanitizeAllExistingDates,
        pendingVerifications,
        trackAndVerifyWrite,
        retryVerification,
        clearVerification,
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
};

export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
};
