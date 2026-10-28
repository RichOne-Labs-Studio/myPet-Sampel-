import express from 'express';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { syncManager } from './src/server/syncService.ts';
import { analyzeVeterinarySoap } from './src/server/veterinaryAiService.ts';
import { generateSessionToken, verifyPassword, verifySessionToken } from './src/server/authTokens.ts';
import { normalizePhoneWithZero } from './src/utils/phoneUtils.ts';
import { normalizePetType } from './src/utils/petUtils.ts';
import { isToday, getRegistrationTimestamp } from './src/utils/dateUtils.ts';
import { CLINIC_APP_HANDSHAKE_TOKEN } from './src/utils/cryptoUtils.ts';

// Pastikan proses server selalu berjalan dalam zona waktu Waktu Indonesia Barat (WIB, Asia/Jakarta, UTC+7)
process.env.TZ = 'Asia/Jakarta';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// 1. SECURITY & CORS HEADERS MIDDLEWARE
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-clinic-app-token, x-requested-with');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// 2. SLIDING-WINDOW IN-MEMORY RATE LIMITER WITH TRUST PROXY SUPPORT
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

function createRateLimiter(options: { windowMs: number; max: number; message: string; allowTrustedApp?: boolean }) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Trusted app token bypasses general rate limits to prevent multi-device sync throttling
    if (options.allowTrustedApp) {
      const appToken = req.headers['x-clinic-app-token'] || req.query['clinicSecretToken'];
      if (appToken && appToken === CLINIC_APP_HANDSHAKE_TOKEN) {
        return next();
      }
    }

    const rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const ip = Array.isArray(rawIp) ? rawIp[0] : String(rawIp).split(',')[0].trim();
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + options.windowMs });
      return next();
    }

    if (record.count >= options.max) {
      return res.status(429).json({
        success: false,
        message: options.message,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    record.count += 1;
    next();
  };
}

// Clean up stale rate limiter entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetTime) rateLimitMap.delete(k);
  }
}, 5 * 60 * 1000);

const loginRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15, // Maksimal 15 percobaan login per menit
  message: 'Terlalu banyak percobaan login. Untuk alasan keamanan, harap tunggu 1 menit sebelum mencoba lagi.',
});

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Batas permintaan AI tercapai. Harap tunggu 1 menit sebelum mencoba lagi.',
});

const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 1200, // Mendukung banyak device/tab membuka aplikasi bersamaan
  message: 'Terlalu banyak permintaan API. Harap perlambat laju interaksi.',
  allowTrustedApp: true,
});

app.use(compression() as any);

// Standar body parser aman global 2MB (mencegah DoS memory exhaust)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/api/', generalApiLimiter);

// Parser khusus ukuran besar HANYA untuk sinkronisasi rekaman dengan lampiran foto medis
const largePayloadParser = express.json({ limit: '60mb' });

// 3. STRICT AUTHENTICATION & ROLE AUTHORIZATION MIDDLEWARE
function requireAuthSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const session = verifySessionToken(token);
    if (session.valid) {
      (req as any).user = session;
      return next();
    }
  }

  // Trusted App Handshake Token (memungkinkan sinkronisasi real-time antar perangkat dan database)
  const appToken = req.headers['x-clinic-app-token'] || req.query['clinicSecretToken'];
  if (appToken && appToken === CLINIC_APP_HANDSHAKE_TOKEN) {
    (req as any).user = {
      valid: true,
      username: 'app_client',
      role: 'Super Admin / Owner', // Trusted internal channel berhak mengelola & sinkronisasi data klinik
      name: 'Aplikasi Klinik',
    };
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Akses ditolak. Sesi otentikasi klinik tidak valid atau telah kedaluwarsa. Silakan login kembali.',
  });
}

function requireFinancialRole(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== 'Super Admin / Owner') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Hanya Super Admin / Owner yang diizinkan mengakses data keuangan dan omset.',
    });
  }
  next();
}

// 4. ALLOWED TABLES WHITELIST
const ALLOWED_TABLES = new Set([
  'owners',
  'pets',
  'queues',
  'soapRecords',
  'cages',
  'inventory',
  'bookings',
  'staff',
  'feedbacks',
  'surgeries',
]);

function isValidTable(table: any): boolean {
  return typeof table === 'string' && ALLOWED_TABLES.has(table);
}

// ==========================================
// AUTHENTICATION API ROUTE
// ==========================================
app.post('/api/auth/login', loginRateLimiter, (req, res) => {
  try {
    const { username = '', password = '' } = req.body;
    const cleanUser = String(username).trim().toLowerCase();
    const cleanPass = String(password).trim();

    if (!cleanUser || !cleanPass) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
    }

    const staffList = syncManager.getInternalDatabase().staff || [];
    const staff = staffList.find((s) => String(s.username || '').toLowerCase() === cleanUser);

    if (!staff) {
      return res.status(401).json({ success: false, message: 'Username atau kata sandi tidak sesuai.' });
    }

    if (!staff.password || !String(staff.password).trim()) {
      return res.status(401).json({
        success: false,
        message: 'Akun belum memiliki kata sandi terdaftar. Harap minta Administrator menetapkan password.',
      });
    }

    const isMatch = verifyPassword(cleanPass, String(staff.password).trim());
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Username atau kata sandi tidak sesuai.' });
    }

    const token = generateSessionToken(staff.id, staff.username, staff.role);

    console.log(`[Audit Log] User '${staff.username}' (${staff.role}) berhasil login pada ${new Date().toISOString()}`);

    res.json({
      success: true,
      token,
      user: {
        id: staff.id,
        username: staff.username,
        name: staff.name,
        role: staff.role,
        avatar: staff.avatar,
        isPracticingDoctor: staff.isPracticingDoctor,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PUBLIC PATIENT REGISTRATION API ROUTE
// (Memungkinkan pendaftaran mandiri pasien/kiosk tanpa login staf,
// langsung tersimpan ke data pemilik, data pasien, dan antrean)
// ==========================================
app.post('/api/public/register', largePayloadParser, async (req, res) => {
  try {
    const { owner, pet, visit, informedConsent } = req.body;
    if (!owner || !pet) {
      return res.status(400).json({ success: false, message: 'Data pemilik dan pasien hewan wajib diisi.' });
    }

    const cleanPhone = normalizePhoneWithZero(owner.whatsapp) || '081234567890';
    const regTimestamp = getRegistrationTimestamp();
    const consentStatement = informedConsent || 'Disetujui: Bebas tuntutan resiko medis sesuai kaidah kedokteran hewan';

    // 1. Link / Create Owner
    const internalDb = syncManager.getInternalDatabase();
    let existingOwner = internalDb.owners.find((o) => normalizePhoneWithZero(o.whatsapp) === cleanPhone);
    if (!existingOwner && owner.name) {
      existingOwner = internalDb.owners.find((o) => String(o.name).trim().toLowerCase() === String(owner.name).trim().toLowerCase());
    }

    let ownerRecord: any = existingOwner;
    if (!ownerRecord) {
      ownerRecord = {
        id: `own-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        name: String(owner.name || 'Klien Pendaftar').trim(),
        whatsapp: cleanPhone,
        address: String(owner.address || '').trim() || 'Alamat Klien Pendaftaran',
        registeredAt: regTimestamp,
        notes: consentStatement,
        informedConsent: consentStatement,
      };
      await syncManager.upsertRecord('owners', ownerRecord);
    } else {
      ownerRecord = {
        ...ownerRecord,
        notes: consentStatement,
        informedConsent: consentStatement,
      };
      await syncManager.upsertRecord('owners', ownerRecord);
    }

    // 2. Link / Create Pet
    const cleanPetName = String(pet.name || '').trim().toLowerCase();
    let existingPet = internalDb.pets.find(
      (p) =>
        (p.ownerId === ownerRecord.id || normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone) &&
        String(p.name || '').trim().toLowerCase() === cleanPetName
    );

    let petRecord: any = existingPet;
    if (!petRecord) {
      petRecord = {
        id: `pet-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        ownerId: ownerRecord.id,
        ownerName: ownerRecord.name,
        ownerWhatsapp: cleanPhone,
        name: String(pet.name || 'Pasien Pendaftar').trim(),
        type: normalizePetType(pet.type || 'Cat'),
        breed: String(pet.breed || 'Mix / Domestik').trim(),
        ageOrDob: String(pet.ageOrDob || '1 Tahun').trim(),
        sex: pet.sex === 'Betina' ? 'Betina' : 'Jantan',
        photoUrl: pet.photoUrl,
        status: visit?.serviceType === 'Daftar' ? 'Sehat' : 'Perawatan',
        registeredAt: regTimestamp,
        informedConsent: consentStatement,
      };
      await syncManager.upsertRecord('pets', petRecord);
    } else {
      petRecord = {
        ...petRecord,
        ownerId: ownerRecord.id,
        ownerName: ownerRecord.name,
        ownerWhatsapp: cleanPhone,
        informedConsent: consentStatement,
        ...(pet.photoUrl ? { photoUrl: pet.photoUrl } : {}),
      };
      await syncManager.upsertRecord('pets', petRecord);
    }

    // 3. Queue Generation (jika meminta pemeriksaan klinik)
    let ticketNumber = '';
    if (visit && visit.serviceType !== 'Daftar') {
      const prefix = 'A';
      const todayQueues = (internalDb.queues || []).filter((q) => isToday(q.createdAt));
      const existingTickets = todayQueues.map((q) => q.ticketNumber).filter(Boolean);
      let maxNum = 0;
      for (const t of existingTickets) {
        if (t.startsWith(prefix + '-')) {
          const num = parseInt(t.replace(prefix + '-', ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
      ticketNumber = `${prefix}-${String(maxNum + 1).padStart(2, '0')}`;

      const newQueue = {
        id: `q-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        ticketNumber,
        ownerWhatsapp: cleanPhone,
        ownerName: ownerRecord.name,
        petId: petRecord.id,
        petName: petRecord.name,
        petType: petRecord.type,
        photoUrl: petRecord.photoUrl,
        serviceType: visit.serviceType || 'Consultation',
        chiefComplaint: String(visit.chiefComplaint || 'Pemeriksaan rutin / konsultasi dokter').trim(),
        status: 'Menunggu',
        createdAt: regTimestamp,
        informedConsent: consentStatement,
      };

      await syncManager.upsertRecord('queues', newQueue);
    } else {
      ticketNumber = `REG-${Date.now().toString().slice(-4)}`;
    }

    res.json({
      success: true,
      ticketNumber,
      owner: ownerRecord,
      pet: petRecord,
      message: 'Pendaftaran berhasil dan data tersimpan di data pemilik dan pasien.',
    });
  } catch (err: any) {
    console.error('[API /api/public/register] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PUBLIC LIVE QUEUE REAL-TIME API
// (Dipakai oleh pasien, live queue tracker, dan layar antrean klinik)
// ==========================================
app.get('/api/public/queues/live', (req, res) => {
  try {
    const internalDb = syncManager.getInternalDatabase();
    const todayQueues = (internalDb.queues || []).filter((q) => isToday(q.createdAt));
    const activeWaiting = todayQueues.filter((q) => q.status === 'Menunggu');
    const inPoli = todayQueues.filter((q) => q.status === 'Di Ruang Poli');
    const completedToday = todayQueues.filter((q) => q.status === 'Selesai');
    const currentServingTicket = inPoli[0]?.ticketNumber || '-';

    res.json({
      success: true,
      currentServingTicket,
      counts: {
        totalToday: todayQueues.length,
        waiting: activeWaiting.length,
        inPoli: inPoli.length,
        completed: completedToday.length,
      },
      todayQueues: todayQueues.map((q) => ({
        id: q.id,
        ticketNumber: q.ticketNumber,
        status: q.status,
        petId: q.petId,
        petName: q.petName,
        petType: q.petType,
        serviceType: q.serviceType,
        chiefComplaint: q.chiefComplaint,
        calledAt: q.calledAt,
        completedAt: q.completedAt,
        createdAt: q.createdAt,
        assignedDoctor: q.assignedDoctor,
        ownerName: q.ownerName,
        ownerWhatsapp: q.ownerWhatsapp,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/public/queues/ticket/:ticketNumber', (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const internalDb = syncManager.getInternalDatabase();
    const cleanTicket = String(ticketNumber || '').trim().toUpperCase();
    const todayQueues = (internalDb.queues || []).filter((q) => isToday(q.createdAt));
    const inPoli = todayQueues.filter((q) => q.status === 'Di Ruang Poli');
    const currentServingTicket = inPoli[0]?.ticketNumber || '-';

    const queue = (internalDb.queues || []).find(
      (q) => String(q.ticketNumber || '').trim().toUpperCase() === cleanTicket
    );

    if (!queue) {
      return res.status(404).json({ success: false, message: 'Tiket antrean tidak ditemukan' });
    }

    const waitingQueues = todayQueues.filter((q) => q.status === 'Menunggu' || q.status === 'Di Ruang Poli');
    const myIndex = waitingQueues.findIndex((q) => q.ticketNumber === queue.ticketNumber);
    const peopleAhead = myIndex > 0 ? myIndex : 0;

    res.json({
      success: true,
      ticket: queue,
      currentServingTicket,
      peopleAhead,
      isCompleted: queue.status === 'Selesai',
      isNowServing: queue.status === 'Di Ruang Poli',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// VETERINARY AI CDSS / CO-PILOT API ROUTE
// ==========================================
app.post('/api/ai/veterinary-cdss', aiRateLimiter, requireAuthSession, async (req, res) => {
  try {
    const { subjective = '', objective = '', patientInfo = {} } = req.body;
    const analysis = await analyzeVeterinarySoap({ subjective, objective, patientInfo });
    res.json({
      success: true,
      data: analysis,
    });
  } catch (err: any) {
    console.error('[API /api/ai/veterinary-cdss] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Gagal memproses analisis klinis AI.',
    });
  }
});

// ==========================================
// BACKEND SYNC API ROUTES (Protected)
// ==========================================

// 1. Ambil data lengkap klinik dari memori/disk backend
app.get('/api/sync/data', requireAuthSession, (req, res) => {
  try {
    const user = (req as any).user;
    const data = syncManager.getDatabase(user?.role);
    const status = syncManager.getStatus();
    res.json({
      success: true,
      data,
      status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1B. SERVER-SIDE PAGINATED PASIEN
app.get('/api/patients', requireAuthSession, (req, res) => {
  try {
    const { page = '1', limit = '10', q = '', species = 'all', status = 'all' } = req.query;
    const result = syncManager.getPaginatedPatients({
      page: String(page),
      limit: String(limit),
      q: String(q),
      species: String(species),
      status: String(status),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1C. SERVER-SIDE PAGINATED PEMILIK
app.get('/api/owners', requireAuthSession, (req, res) => {
  try {
    const { page = '1', limit = '10', q = '' } = req.query;
    const result = syncManager.getPaginatedOwners({
      page: String(page),
      limit: String(limit),
      q: String(q),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1D. SERVER-SIDE PAGINATED REKAM MEDIK (SOAP)
app.get('/api/soap-records', requireAuthSession, (req, res) => {
  try {
    const {
      page = '1',
      limit = '10',
      q = '',
      petId = '',
      vet = 'all',
      hasPrescription = 'false',
      hasDiagnostics = 'false',
    } = req.query;

    const result = syncManager.getPaginatedSoapRecords({
      page: String(page),
      limit: String(limit),
      q: String(q),
      petId: String(petId),
      vet: String(vet),
      hasPrescription: String(hasPrescription),
      hasDiagnostics: String(hasDiagnostics),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1E. FAST AUTOCOMPLETE PATIENT SEARCH
app.get('/api/patients/search', requireAuthSession, (req, res) => {
  try {
    const { q = '', limit = '30' } = req.query;
    const result = syncManager.searchPatientsAutocomplete(String(q), parseInt(String(limit), 10) || 30);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1F. RIWAYAT SOAP SPESIFIK PASIEN (STRICT FOREIGN KEY)
app.get('/api/patients/:petId/soap-history', requireAuthSession, (req, res) => {
  try {
    const { petId } = req.params;
    const result = syncManager.getPatientSoapHistory(petId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1G. DATA KANDANG AKTIF & HISTORY ARSIP
app.get('/api/inpatient/cages', requireAuthSession, (req, res) => {
  try {
    const result = syncManager.getInpatientData();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/inpatient/history', requireAuthSession, (req, res) => {
  try {
    const { page = '1', limit = '10', q = '' } = req.query;
    const result = syncManager.getPaginatedInpatientHistory({
      page: String(page),
      limit: String(limit),
      q: String(q),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1H. DASHBOARD STATS & KPI AGGREGATION
app.get('/api/dashboard/stats', requireAuthSession, (req, res) => {
  try {
    const { month, year, date } = req.query;
    const user = (req as any).user;
    const result = syncManager.getDashboardSummary({
      month: month ? String(month) : undefined,
      year: year ? String(year) : undefined,
      date: date ? String(date) : undefined,
    });

    // Mask financial revenue if user is not Super Admin / Owner
    if (user && user.role !== 'Super Admin / Owner') {
      return res.json({
        ...result,
        totalRevenueMonth: 0,
        monthlyRevenueGraph: [],
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1I. DASHBOARD SERVER-SIDE PAGINATED QUEUES
app.get('/api/dashboard/queues', requireAuthSession, (req, res) => {
  try {
    const { page = '1', limit = '10', scope = 'today', status = 'all', q = '' } = req.query;
    const result = syncManager.getPaginatedQueues({
      page: String(page),
      limit: String(limit),
      scope: scope === 'all' ? 'all' : 'today',
      status: String(status),
      q: String(q),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Status sinkronisasi & versi database saat ini
app.get('/api/sync/status', requireAuthSession, (req, res) => {
  try {
    const status = syncManager.getStatus();
    res.json({
      success: true,
      status,
      ...status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Picu sinkronisasi latar belakang
app.post('/api/sync/trigger', requireAuthSession, (req, res) => {
  try {
    const user = (req as any).user;
    console.log(`[Audit Log] User '${user.username}' triggering manual Google Sheets sync`);
    syncManager.syncFromGoogleSheets().catch((e) => {
      console.error('[API] Trigger error:', e);
    });
    res.json({
      success: true,
      message: 'Sinkronisasi otomatis backend dimulai di latar belakang.',
      status: syncManager.getStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Upsert satu record
app.post('/api/sync/record', largePayloadParser, requireAuthSession, async (req, res) => {
  try {
    const { table, record } = req.body;
    const user = (req as any).user;
    if (!table || !record) {
      return res.status(400).json({ success: false, message: 'Parameter table dan record wajib diisi.' });
    }
    if (!isValidTable(table)) {
      return res.status(400).json({ success: false, message: `Tabel '${table}' tidak diizinkan.` });
    }

    // ROLE GUARD: Pengelolaan akun staf dan hak akses HANYA boleh dilakukan oleh Super Admin / Owner!
    if (table === 'staff') {
      if (user.role !== 'Super Admin / Owner') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak. Hanya Super Admin / Owner yang berwenang menambah atau memperbarui akun staf.',
        });
      }
    }

    const recordId = record.id || record.petId || record.whatsapp || 'new';
    console.log(`[Audit Log] User '${user.username}' (${user.role}) UPSERT on '${table}' ID '${recordId}'`);

    const version = await syncManager.upsertRecord(table, record);
    res.json({
      success: true,
      version,
      message: `Record ${table} berhasil disimpan di backend.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4b. Verifikasi status simpan (Exists check di backend & spreadsheet)
app.get('/api/sync/verify-write', requireAuthSession, async (req, res) => {
  try {
    const { table, id } = req.query as { table: string; id: string };
    if (!table || !id) {
      return res.status(400).json({ success: false, message: 'Parameter table dan id wajib disertakan.' });
    }
    if (!isValidTable(table)) {
      return res.status(400).json({ success: false, message: `Tabel '${table}' tidak valid.` });
    }

    const result = await syncManager.verifyRecordExists(table as any, id);
    res.json({
      success: true,
      table,
      id,
      inBackend: result.inBackend,
      inSpreadsheet: result.inSpreadsheet,
      isFullyVerified: result.inBackend && result.inSpreadsheet,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Hapus satu record
app.post('/api/sync/delete', requireAuthSession, async (req, res) => {
  try {
    const { table, id } = req.body;
    const user = (req as any).user;
    if (!table || !id) {
      return res.status(400).json({ success: false, message: 'Parameter table dan id wajib diisi.' });
    }
    if (!isValidTable(table)) {
      return res.status(400).json({ success: false, message: `Tabel '${table}' tidak diizinkan.` });
    }

    // ROLE GUARD: Penghapusan akun staf HANYA boleh dilakukan oleh Super Admin / Owner
    if (table === 'staff') {
      if (user.role !== 'Super Admin / Owner') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak. Hanya Super Admin / Owner yang berwenang menghapus akun staf.',
        });
      }
      if (user.userId === String(id)) {
        return res.status(400).json({
          success: false,
          message: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif login.',
        });
      }
    }

    console.log(`[Audit Log] User '${user.username}' (${user.role}) DELETE on '${table}' ID '${id}'`);

    const version = await syncManager.deleteRecord(table, String(id));
    res.json({
      success: true,
      version,
      message: `Record ${table} (${id}) berhasil dihapus.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5b. Hapus multiple records
app.post('/api/sync/delete-multiple', requireAuthSession, async (req, res) => {
  try {
    const { table, ids } = req.body;
    const user = (req as any).user;
    if (!table || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Parameter table dan ids array wajib diisi.' });
    }
    if (!isValidTable(table)) {
      return res.status(400).json({ success: false, message: `Tabel '${table}' tidak diizinkan.` });
    }

    if (table === 'staff') {
      if (user.role !== 'Super Admin / Owner') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak. Hanya Super Admin / Owner yang berwenang menghapus akun staf.',
        });
      }
    }

    console.log(`[Audit Log] User '${user.username}' (${user.role}) DELETE MULTIPLE on '${table}' (${ids.length} records)`);

    for (const id of ids) {
      await syncManager.deleteRecord(table, String(id));
    }
    const version = syncManager.getVersion();
    res.json({
      success: true,
      version,
      message: `${ids.length} record ${table} berhasil dihapus.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Update satu tabel penuh
app.post('/api/sync/table', largePayloadParser, requireAuthSession, async (req, res) => {
  try {
    const { table, records } = req.body;
    const user = (req as any).user;
    if (!table || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Parameter table dan records array wajib diisi.' });
    }
    if (!isValidTable(table)) {
      return res.status(400).json({ success: false, message: `Tabel '${table}' tidak diizinkan.` });
    }

    // ROLE GUARD: Penimpaan seluruh tabel staf HANYA boleh oleh Super Admin / Owner
    if (table === 'staff') {
      if (user.role !== 'Super Admin / Owner') {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak. Hanya Super Admin / Owner yang diizinkan memperbarui data staf secara massal.',
        });
      }
    }

    console.log(`[Audit Log] User '${user.username}' (${user.role}) UPDATE TABLE '${table}' count ${records.length}`);

    const version = await syncManager.updateTable(table, records);
    res.json({
      success: true,
      version,
      message: `Tabel ${table} berhasil diperbarui.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Update konfigurasi sinkronisasi
app.post('/api/sync/config', requireAuthSession, requireFinancialRole, (req, res) => {
  try {
    const { webAppUrl, autoSync } = req.body;
    syncManager.setConfig(webAppUrl, autoSync);
    res.json({
      success: true,
      status: syncManager.getStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Mulai worker sinkronisasi Google Sheets otomatis di backend
  syncManager.startBackgroundWorker();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Vier Pet Care berjalan di http://0.0.0.0:${PORT}`);
    console.log(`[Server] Sinkronisasi Google Sheets otomatis aktif di backend`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal error saat menjalankan server:', err);
  process.exit(1);
});
