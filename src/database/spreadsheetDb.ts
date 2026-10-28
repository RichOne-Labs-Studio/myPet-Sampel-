import type {
  Owner,
  Pet,
  VisitQueue,
  SoapRecord,
  InpatientCage,
  InventoryItem,
  BookingAppointment,
  StaffUser,
  CustomerFeedback,
  SpreadsheetConfig,
  InpatientHistoryRecord,
  SurgeryRecord,
} from '../types.ts';
import { normalizePhoneWithZero } from '../utils/phoneUtils.ts';
import {
  sortOwnersNewestFirst,
  sortPetsNewestFirst,
  sortSoapNewestFirst,
} from '../utils/dateUtils.ts';
import {
  encryptPhotoUrl,
  decryptPhotoUrl,
  encryptDiagnosticAttachments,
  decryptDiagnosticAttachments,
  CLINIC_APP_HANDSHAKE_TOKEN,
} from '../utils/cryptoUtils.ts';
import { normalizeCageId, sanitizeCagesList } from '../utils/cageUtils.ts';

export interface SpreadsheetDatabaseSchema {
  owners: Owner[];
  pets: Pet[];
  queues: VisitQueue[];
  soapRecords: SoapRecord[];
  cages: InpatientCage[];
  inventory: InventoryItem[];
  bookings: BookingAppointment[];
  staff: StaffUser[];
  feedbacks: CustomerFeedback[];
  surgeries?: SurgeryRecord[];
  inpatientHistory?: InpatientHistoryRecord[];
}

export const FINAL_SPREADSHEET_URL =
  'https://script.google.com/macros/s/AKfycbzFrZZxwmkW92bZw_5Ugg0UyVUYLonxP7jWVc77QU_SeBnjjmCqxkveeLhChIsDdt9V/exec';

export const DEFAULT_SPREADSHEET_CONFIG: SpreadsheetConfig = {
  webAppUrl:
    'https://script.google.com/macros/s/AKfycbzFrZZxwmkW92bZw_5Ugg0UyVUYLonxP7jWVc77QU_SeBnjjmCqxkveeLhChIsDdt9V/exec',
  spreadsheetName: 'Vier Pet Care - Database Klinik',
  autoSync: true,
  isConnected: true,
};

// ==========================================
// CSV UTILITIES (EXPORT & IMPORT)
// ==========================================

export function objectsToCSV<T extends Record<string, any>>(data: T[]): string {
  if (!data || data.length === 0) return '';
  const keys = Object.keys(data[0]);
  const header = keys.join(',');
  const rows = data.map((item) =>
    keys
      .map((key) => {
        let val = item[key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          val = `"${val}"`;
        }
        return val;
      })
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export function csvToObjects<T = Record<string, any>>(csvString: string): T[] {
  if (!csvString || !csvString.trim()) return [];
  const lines = csvString.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header line
  const headers = parseCSVLine(lines[0]);
  const results: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i].trim();
    if (!currentLine) continue;
    const values = parseCSVLine(currentLine);
    const obj: Record<string, any> = {};

    headers.forEach((header, index) => {
      let val: any = values[index] ?? '';
      // Try to parse JSON objects or arrays
      if (typeof val === 'string' && ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']')))) {
        try {
          val = JSON.parse(val);
        } catch {
          // Keep as string
        }
      }
      obj[header] = val;
    });

    results.push(obj as T);
  }

  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function downloadCSV(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDatabaseAsSpreadsheets(db: SpreadsheetDatabaseSchema) {
  downloadCSV(objectsToCSV(db.owners), 'VierPetCare_Sheet_1_Pemilik.csv');
  setTimeout(() => downloadCSV(objectsToCSV(db.pets), 'VierPetCare_Sheet_2_Pasien.csv'), 200);
  setTimeout(() => downloadCSV(objectsToCSV(db.queues), 'VierPetCare_Sheet_3_Antrean.csv'), 400);
  setTimeout(() => downloadCSV(objectsToCSV(db.soapRecords), 'VierPetCare_Sheet_4_RekamMedis.csv'), 600);
  setTimeout(() => downloadCSV(objectsToCSV(db.cages), 'VierPetCare_Sheet_5_RawatInap.csv'), 800);
  setTimeout(() => downloadCSV(objectsToCSV(db.inventory), 'VierPetCare_Sheet_6_StokObat.csv'), 1000);
  setTimeout(() => downloadCSV(objectsToCSV(db.bookings), 'VierPetCare_Sheet_7_Booking.csv'), 1200);
  setTimeout(() => downloadCSV(objectsToCSV(db.staff), 'VierPetCare_Sheet_8_Staf.csv'), 1400);
  setTimeout(() => downloadCSV(objectsToCSV(db.feedbacks || []), 'VierPetCare_Sheet_9_KepuasanSaran.csv'), 1600);
  setTimeout(() => downloadCSV(objectsToCSV(db.surgeries || []), 'VierPetCare_Sheet_10_TindakanOperasi.csv'), 1800);
}

// ==========================================
// GOOGLE SHEETS / APPS SCRIPT WEB APP INTEGRATION
// ==========================================

export async function testSpreadsheetConnection(webAppUrl: string): Promise<{
  success: boolean;
  message: string;
  tables?: string[];
  counts?: Record<string, number>;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script Web App belum diisi.' };
  }

  const cleanUrl = webAppUrl.trim();
  const testUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=ping&_t=${Date.now()}`
    : `${cleanUrl}?action=ping&_t=${Date.now()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(testUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP Error: ${res.status} (${res.statusText}). Pastikan deployment disetel ke "Anyone".`,
      };
    }

    const data = await res.json();
    if (data.status === 'success' || data.connected || data.tables) {
      return {
        success: true,
        message: 'Koneksi ke Google Spreadsheet berhasil terhubung!',
        tables: data.tables || ['Pemilik', 'Pasien', 'Antrean', 'RekamMedis', 'RawatInap', 'StokObat', 'Booking', 'Staf', 'KepuasanSaran'],
        counts: data.counts,
      };
    }

    return {
      success: true,
      message: 'Koneksi terhubung (respon diterima).',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout (lebih dari 12 detik). Periksa URL Web App Anda.' };
    }
    return {
      success: false,
      message: `Gagal menghubungi Spreadsheet: ${err.message || 'Periksa URL Web App dan izin akses (Anyone).'}`
    };
  }
}

export function normalizeSurgeryRecord(raw: any): SurgeryRecord {
  if (!raw || typeof raw !== 'object') return raw;
  const findVal = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
    }
    const rawKeys = Object.keys(raw);
    for (const k of keys) {
      const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = rawKeys.find((rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey);
      if (match && raw[match] !== undefined && raw[match] !== null && raw[match] !== '') {
        return raw[match];
      }
    }
    return '';
  };

  return {
    id: String(findVal('id', 'ID', 'Id', 'No') || `op-${Date.now()}`),
    petId: String(findVal('petId', 'pet_id', 'ID Pasien', 'Id Pasien', 'Pasien ID') || ''),
    petName: String(findVal('petName', 'pet_name', 'Nama Pasien', 'Nama Hewan', 'Pasien') || ''),
    petType: (findVal('petType', 'pet_type', 'Jenis Hewan', 'Spesies', 'Hewan') || 'Cat') as any,
    ownerName: String(findVal('ownerName', 'owner_name', 'Nama Pemilik', 'Pemilik', 'Klien') || ''),
    ownerWhatsapp: String(findVal('ownerWhatsapp', 'owner_whatsapp', 'WhatsApp', 'No WA', 'Nomor WA', 'Telepon') || ''),
    operationType: String(findVal('operationType', 'operation Type', 'Operation Type', 'operation_type', 'Jenis Tindakan', 'Tindakan', 'Operasi', 'Nama Tindakan') || ''),
    atropineDose: String(findVal('atropineDose', 'atropine_dose', 'Dosis Atropin', 'Atropin') || ''),
    xylazineDose: String(findVal('xylazineDose', 'xylazine_dose', 'Dosis Xylazine', 'Xylazine') || ''),
    ketamineDose: String(findVal('ketamineDose', 'ketamine_dose', 'Dosis Ketamin', 'Ketamin') || ''),
    acpDose: String(findVal('acpDose', 'acp_dose', 'Dosis ACP', 'ACP', 'Acepromazine') || ''),
    yohimbineDose: String(findVal('yohimbineDose', 'yohimbine_dose', 'Dosis Yohimbine', 'Yohimbine') || ''),
    antibioticDoseAndType: String(findVal('antibioticDoseAndType', 'antibiotic_dose_and_type', 'Dosis Antibiotik', 'Antibiotik', 'Jenis Antibiotik') || ''),
    analgesicDoseAndType: String(findVal('analgesicDoseAndType', 'analgesic_dose_and_type', 'Dosis Analgesik', 'Analgesik', 'Jenis Analgesik') || ''),
    operator: String(findVal('operator', 'Dokter Bedah', 'Dokter Operator', 'Dokter PJ', 'Dokter') || ''),
    operationNotes: String(findVal('operationNotes', 'operation_notes', 'Catatan Operasi', 'Catatan', 'Keterangan') || ''),
    status: (findVal('status', 'Status', 'Status Tindakan') || 'Dijadwalkan') as any,
    date: String(findVal('date', 'Tanggal', 'Tgl') || ''),
    time: String(findVal('time', 'Waktu', 'Jam') || ''),
    createdAt: String(findVal('createdAt', 'created_at', 'Waktu Dibuat') || ''),
  };
}

export function decryptDatabaseFromSpreadsheet(db: Partial<SpreadsheetDatabaseSchema>): SpreadsheetDatabaseSchema {
  return {
    ...db,
    pets: db.pets?.map((p) => ({
      ...p,
      photoUrl: decryptPhotoUrl(p.photoUrl),
    })),
    queues: db.queues?.map((q) => ({
      ...q,
      photoUrl: decryptPhotoUrl(q.photoUrl),
    })),
    soapRecords: db.soapRecords?.map((s) => ({
      ...s,
      diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments),
    })),
    surgeries: db.surgeries?.map((s) => normalizeSurgeryRecord(s)),
  } as SpreadsheetDatabaseSchema;
}

export async function pullFullDatabaseFromSpreadsheet(webAppUrl: string): Promise<{
  success: boolean;
  message: string;
  data?: SpreadsheetDatabaseSchema;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();
  const fetchUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=fetchAll&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`
    : `${cleanUrl}?action=fetchAll&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`;

  const attemptFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout to allow large 100k+ row transfers
    try {
      return await fetch(fetchUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let res: Response;
    try {
      res = await attemptFetch();
    } catch (err: any) {
      // Retry once — Apps Script "cold start" bisa melebihi timeout pertama
      if (err.name === 'AbortError') {
        res = await attemptFetch();
      } else {
        throw err;
      }
    }

    if (!res.ok) {
      return { success: false, message: `Gagal mengambil data (HTTP ${res.status}).` };
    }

    const json = await res.json();
    if (json && json.status === 'success' && json.data) {
      const decryptedData = decryptDatabaseFromSpreadsheet(json.data);
      return {
        success: true,
        message: 'Data seluruh sheet berhasil ditarik dari Google Spreadsheet.',
        data: decryptedData,
      };
    } else if (json && json.owners !== undefined) {
      const decryptedData = decryptDatabaseFromSpreadsheet(json);
      return {
        success: true,
        message: 'Data berhasil ditarik dari Spreadsheet.',
        data: decryptedData,
      };
    }

    return {
      success: false,
      message: json.message || 'Format data dari Google Apps Script tidak sesuai.',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout setelah 2x percobaan (120 detik). Apps Script memerlukan waktu lebih lama karena volume data yang sangat besar.' };
    }
    return {
      success: false,
      message: `Error penarikan data: ${err.message || 'Koneksi terputus'}`,
    };
  }
}

/**
 * Tarik data spesifik satu tabel dengan paging / chunking opsional
 * Menghindari beban berlebih saat data per sheet mencapai puluhan ribu baris.
 */
export async function pullTableFromSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  offset: number = 0,
  limit?: number
): Promise<{ success: boolean; message: string; data?: any[] }> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();
  let fetchUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=fetchTable&table=${table}&offset=${offset}&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`
    : `${cleanUrl}?action=fetchTable&table=${table}&offset=${offset}&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}&_t=${Date.now()}`;

  if (limit) {
    fetchUrl += `&limit=${limit}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(fetchUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal menarik tabel ${table} (HTTP ${res.status})` };
    }

    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      let records = json.data;
      if (table === 'pets') {
        records = records.map((p: any) => ({ ...p, photoUrl: decryptPhotoUrl(p.photoUrl) }));
      } else if (table === 'queues') {
        records = records.map((q: any) => ({ ...q, photoUrl: decryptPhotoUrl(q.photoUrl) }));
      } else if (table === 'soapRecords') {
        records = records.map((s: any) => ({ ...s, diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments) }));
      } else if (table === 'surgeries') {
        records = records.map((s: any) => normalizeSurgeryRecord(s));
      }
      return { success: true, message: `Tabel ${table} berhasil ditarik`, data: records };
    }

    return { success: false, message: json.message || 'Format tidak sesuai' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal koneksi tabel' };
  }
}

export async function pushFullDatabaseToSpreadsheet(
  webAppUrl: string,
  db: SpreadsheetDatabaseSchema
): Promise<{
  success: boolean;
  message: string;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();

  try {
    // Ensure phone numbers start with '0' and photos/diagnostic attachments are stored encrypted
    const sanitizedDb = {
      ...db,
      owners: sortOwnersNewestFirst(db.owners || []).map((o) => ({ ...o, whatsapp: normalizePhoneWithZero(o.whatsapp) })),
      pets: sortPetsNewestFirst(db.pets || []).map((p) => ({
        ...p,
        ownerWhatsapp: normalizePhoneWithZero(p.ownerWhatsapp),
        photoUrl: encryptPhotoUrl(p.photoUrl),
      })),
      queues: db.queues?.map((q) => ({
        ...q,
        ownerWhatsapp: normalizePhoneWithZero(q.ownerWhatsapp),
        photoUrl: encryptPhotoUrl(q.photoUrl),
      })),
      soapRecords: sortSoapNewestFirst(db.soapRecords || []).map((s) => ({
        ...s,
        diagnosticAttachments: encryptDiagnosticAttachments(s.diagnosticAttachments) as any,
      })),
      feedbacks: db.feedbacks?.map((f) => ({
        ...f,
        ownerWhatsapp: f.ownerWhatsapp ? normalizePhoneWithZero(f.ownerWhatsapp) : f.ownerWhatsapp,
      })),
      cages: sanitizeCagesList(db.cages || []).map((c) => ({
        ...c,
        id: normalizeCageId(c.id, c.label) || c.id,
        ownerWhatsapp: c.ownerWhatsapp ? normalizePhoneWithZero(c.ownerWhatsapp) : c.ownerWhatsapp,
      })),
      surgeries: (db.surgeries || []).map((s) => ({
        ...s,
        ownerWhatsapp: s.ownerWhatsapp ? normalizePhoneWithZero(s.ownerWhatsapp) : s.ownerWhatsapp,
      })),
    };

    // We send payload as text/plain to avoid browser CORS preflight blocks with Google Apps Script
    const payload = JSON.stringify({
      action: 'syncAll',
      clinicSecretToken: CLINIC_APP_HANDSHAKE_TOKEN,
      timestamp: new Date().toISOString(),
      data: sanitizedDb,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal mengirim data (HTTP ${res.status}).` };
    }

    const result = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: true,
      message: result.message || 'Semua sheet di Google Spreadsheet berhasil diperbarui!',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout (lebih dari 40 detik). Data mungkin terlalu besar untuk sinkron penuh — coba lagi atau kurangi data lama.' };
    }
    return {
      success: false,
      message: `Gagal mengirim data ke Spreadsheet: ${err.message || 'Koneksi error'}`,
    };
  }
}

/**
 * Push HANYA satu tabel/sheet (bukan seluruh database). Dipakai oleh auto-sync
 * per-tabel supaya 1 perubahan kecil tidak memicu tulis-ulang semua 9 sheet.
 * Memakai action yang sama ('syncAll') tapi payload 'data' hanya berisi 1 key,
 * sehingga di sisi Apps Script hanya sheet tabel ini yang di-clear & ditulis ulang.
 */
export async function pushTableToSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  records: any[]
): Promise<{ success: boolean; message: string }> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();

  try {
    const targetRecords = table === 'cages' ? sanitizeCagesList(records) : records;
    const sanitizedRecords = targetRecords.map((rec) => {
      if (!rec || typeof rec !== 'object') return rec;
      const copy = { ...rec };
      if ('whatsapp' in copy && copy.whatsapp) {
        copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      }
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) {
        copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      }
      if (table === 'pets' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (table === 'queues' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (table === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (table === 'cages') {
        const isHistory = String(copy.id || '').toLowerCase().startsWith('cag-') ||
                          String(copy.id || '').toLowerCase().startsWith('hist-') ||
                          String(copy.status || '').toLowerCase() === 'selesai';
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
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal mengirim data tabel "${table}" (HTTP ${res.status}).` };
    }

    const result = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: true,
      message: result.message || `Tabel "${table}" berhasil disinkronkan.`,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: `Timeout saat sinkron tabel "${table}" (25 detik).` };
    }
    return {
      success: false,
      message: `Gagal mengirim tabel "${table}": ${err.message || 'Koneksi error'}`,
    };
  }
}

export async function pushSingleRecordToSpreadsheet(
  webAppUrl: string,
  sheetName: 'owners' | 'pets' | 'queues' | 'soapRecords' | 'cages' | 'inventory' | 'bookings' | 'feedbacks' | 'staff' | 'surgeries',
  record: any
): Promise<boolean> {
  if (!webAppUrl || !webAppUrl.trim()) return false;

  try {
    let recordToPush = record;
    if (record && typeof record === 'object') {
      const copy = { ...record };
      if ('whatsapp' in copy && copy.whatsapp) {
        copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      }
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) {
        copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      }
      if (sheetName === 'pets' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (sheetName === 'queues' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (sheetName === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (sheetName === 'cages') {
        const isHistory = String(copy.id || '').toLowerCase().startsWith('cag-') ||
                          String(copy.id || '').toLowerCase().startsWith('hist-') ||
                          String(copy.status || '').toLowerCase() === 'selesai';
        if (!isHistory) {
          copy.id = normalizeCageId(copy.id, copy.label) || copy.id;
        }
      }
      recordToPush = copy;
    }

    const payload = JSON.stringify({
      action: 'upsert',
      table: sheetName,
      record: recordToPush,
      clinicSecretToken: CLINIC_APP_HANDSHAKE_TOKEN,
      timestamp: new Date().toISOString(),
    });

    await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      mode: 'no-cors', // fire-and-forget for background real-time sync
    });

    return true;
  } catch (err) {
    console.warn('Gagal background sync record ke Spreadsheet', err);
    return false;
  }
}

export async function deleteRecordFromSpreadsheet(
  webAppUrl: string,
  sheetName: 'owners' | 'pets' | 'queues' | 'soapRecords' | 'cages' | 'inventory' | 'bookings' | 'feedbacks' | 'staff' | 'surgeries',
  id: string
): Promise<boolean> {
  if (!webAppUrl || !webAppUrl.trim() || !id) return false;

  try {
    const payload = JSON.stringify({
      action: 'delete',
      table: sheetName,
      id: String(id),
      clinicSecretToken: CLINIC_APP_HANDSHAKE_TOKEN,
      timestamp: new Date().toISOString(),
    });

    await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      mode: 'no-cors', // fire-and-forget for background real-time sync
    });

    return true;
  } catch (err) {
    console.warn('Gagal background sync delete record ke Spreadsheet', err);
    return false;
  }
}

export async function deleteMultipleRecordsFromSpreadsheet(
  webAppUrl: string,
  sheetName: 'owners' | 'pets' | 'queues' | 'soapRecords' | 'cages' | 'inventory' | 'bookings' | 'feedbacks' | 'staff' | 'surgeries',
  ids: string[]
): Promise<boolean> {
  if (!webAppUrl || !webAppUrl.trim() || !Array.isArray(ids) || ids.length === 0) return false;

  try {
    const payload = JSON.stringify({
      action: 'deleteMultiple',
      table: sheetName,
      ids: ids.map((id) => String(id)),
      clinicSecretToken: CLINIC_APP_HANDSHAKE_TOKEN,
      timestamp: new Date().toISOString(),
    });

    await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      mode: 'no-cors',
    });

    return true;
  } catch (err) {
    console.warn('Gagal background sync bulk delete records ke Spreadsheet', err);
    return false;
  }
}

// ==========================================
// GOOGLE APPS SCRIPT TEMPLATE CODE
// ==========================================

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================
 * VIER PET CARE - GOOGLE SPREADSHEET DATABASE BACKEND (REVISI KEAMANAN)
 * ============================================================
 * CARA MEMASANG:
 * 1. Di Google Sheets, buka menu: Ekstensi (Extensions) > Apps Script
 * 2. Hapus semua kode lama, tempelkan seluruh kode ini.
 * 3. Nilai REQUIRED_SECRET_TOKEN di bawah sudah diselaraskan dengan token aplikasi.
 * 4. Simpan (Ctrl+S), lalu Deploy > Manage deployments > edit (ikon pensil)
 *    > pilih "New version" > Deploy.
 *    (Gunakan "New version", BUKAN "New deployment", supaya URL .../exec tetap sama).
 */

const REQUIRED_SECRET_TOKEN = '${CLINIC_APP_HANDSHAKE_TOKEN}';

const SHEET_NAMES = {
  owners: '1_Pemilik',
  pets: '2_Pasien',
  queues: '3_Antrean',
  soapRecords: '4_RekamMedis',
  cages: '5_RawatInap',
  inventory: '6_StokObat',
  bookings: '7_Booking',
  staff: '8_Staf',
  feedbacks: '9_KepuasanSaran',
  surgeries: '10_TindakanOperasi'
};

const TABLE_HEADERS = {
  owners: ['id', 'name', 'whatsapp', 'address', 'registeredAt', 'notes'],
  pets: ['id', 'ownerId', 'ownerName', 'ownerWhatsapp', 'name', 'type', 'breed', 'ageOrDob', 'sex', 'weight', 'photoUrl', 'status', 'registeredAt', 'notes', 'informedConsent'],
  queues: ['id', 'ticketNumber', 'ownerWhatsapp', 'ownerName', 'petName', 'petType', 'serviceType', 'chiefComplaint', 'status', 'createdAt', 'assignedDoctor', 'informedConsent'],
  soapRecords: ['id', 'queueId', 'petId', 'petName', 'ownerName', 'ownerWhatsapp', 'veterinarian', 'date', 'vitals', 'soap', 'prescriptions', 'diagnosticAttachments', 'diagnosticNotes', 'serviceFee', 'notes'],
  cages: ['id', 'label', 'status', 'petId', 'petName', 'petType', 'ownerName', 'ownerWhatsapp', 'diagnosis', 'admittedAt', 'dischargedAt', 'veterinarian', 'observations'],
  inventory: ['id', 'name', 'category', 'batchNo', 'expireDate', 'minThreshold', 'stockQuantity', 'unit', 'price', 'lastRestocked'],
  bookings: ['id', 'petName', 'petType', 'ownerName', 'ownerWhatsapp', 'serviceType', 'date', 'time', 'doctor', 'notes', 'status'],
  staff: ['id', 'username', 'name', 'role', 'password', 'avatar', 'isPracticingDoctor'],
  feedbacks: ['id', 'ticketNumber', 'ownerName', 'ownerWhatsapp', 'petName', 'serviceType', 'satisfactionRating', 'satisfactionLabel', 'category', 'feedbackText', 'submittedAt', 'isRead', 'readAt'],
  surgeries: ['id', 'petId', 'petName', 'petType', 'ownerName', 'ownerWhatsapp', 'operationType', 'atropineDose', 'xylazineDose', 'ketamineDose', 'acpDose', 'yohimbineDose', 'antibioticDoseAndType', 'analgesicDoseAndType', 'operator', 'operationNotes', 'status', 'date', 'time', 'createdAt']
};

const REDACTED_READ_FIELDS = {
};

function isValidToken(token) {
  return typeof token === 'string' && token === REQUIRED_SECRET_TOKEN;
}

function redactForRead(table, rows) {
  const redactCols = REDACTED_READ_FIELDS[table];
  if (!redactCols || !Array.isArray(rows)) return rows;
  return rows.map(row => {
    const copy = Object.assign({}, row);
    redactCols.forEach(col => { delete copy[col]; });
    return copy;
  });
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetsExist(ss);

  const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'ping';
  const token = e && e.parameter ? e.parameter.clinicSecretToken : undefined;

  // 'ping' dibiarkan terbuka: cuma jumlah baris per tabel, tidak ada data sensitif.
  if (action === 'ping') {
    const counts = {};
    Object.keys(SHEET_NAMES).forEach(table => {
      const sheet = ss.getSheetByName(SHEET_NAMES[table]);
      if (!sheet || sheet.getLastRow() < 2) {
        counts[table] = 0;
      } else {
        const lastRow = sheet.getLastRow();
        const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        let validRows = 0;
        for (let i = 0; i < ids.length; i++) {
          if (ids[i][0] !== '' && ids[i][0] !== null && ids[i][0] !== undefined) validRows++;
        }
        counts[table] = validRows;
      }
    });

    return createJsonResponse({
      status: 'success',
      message: 'Vier Pet Care Google Sheets Database Online & Terhubung',
      tables: Object.values(SHEET_NAMES),
      counts: counts,
      timestamp: new Date().toISOString()
    });
  }

  // Semua action lain WAJIB token yang valid.
  if (!isValidToken(token)) {
    return createJsonResponse({ status: 'error', message: 'Akses ditolak: token tidak valid atau tidak disertakan.' });
  }

  if (action === 'fetchAll') {
    const fullData = {};
    Object.keys(SHEET_NAMES).forEach(table => {
      fullData[table] = redactForRead(table, readTableData(ss, table));
    });

    return createJsonResponse({
      status: 'success',
      data: fullData,
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'fetchTable' && e && e.parameter && e.parameter.table) {
    const table = e.parameter.table;
    const offset = e.parameter.offset ? parseInt(e.parameter.offset, 10) : 0;
    const limit = e.parameter.limit ? parseInt(e.parameter.limit, 10) : undefined;
    const data = redactForRead(table, readTableData(ss, table, offset, limit));

    return createJsonResponse({
      status: 'success',
      table: table,
      data: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  }

  // Action ringan 'exists': Memverifikasi secara cepat apakah sebuah record tertentu sudah tersimpan di Spreadsheet
  if (action === 'exists' && e && e.parameter && e.parameter.table && e.parameter.id) {
    const table = e.parameter.table;
    const targetId = String(e.parameter.id).trim().toLowerCase();
    const exists = checkRecordExistsInSheet(ss, table, targetId);

    return createJsonResponse({
      status: 'success',
      table: table,
      id: e.parameter.id,
      exists: exists,
      timestamp: new Date().toISOString()
    });
  }

  return createJsonResponse({ status: 'error', message: 'Action tidak dikenal' });
}

function checkRecordExistsInSheet(ss, table, targetId) {
  if (!table || !targetId) return false;
  const sheetName = SHEET_NAMES[table];
  if (!sheetName) return false;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
  let idColIdx = headers.indexOf('id');
  if (idColIdx === -1) idColIdx = 0;

  const idValues = sheet.getRange(2, idColIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < idValues.length; i++) {
    const val = String(idValues[i][0] || '').trim().toLowerCase();
    if (val === targetId) {
      return true;
    }
  }
  return false;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(15000);

  if (!gotLock) {
    return createJsonResponse({
      status: 'error',
      message: 'Server sedang memproses permintaan lain, silakan coba lagi beberapa detik.'
    });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetsExist(ss);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    // FIX KEAMANAN: Token sekarang WAJIB ada dan cocok -- tidak bisa dilewati
    // dengan tidak mengirim field clinicSecretToken sama sekali.
    if (!isValidToken(payload.clinicSecretToken)) {
      return createJsonResponse({
        status: 'error',
        message: 'Akses ditolak: Secret Guard Token tidak valid.'
      });
    }

    const action = payload.action || 'syncAll';

    if (action === 'syncAll' && payload.data) {
      const db = payload.data;
      Object.keys(SHEET_NAMES).forEach(table => {
        if (db[table] !== undefined) {
          writeTableData(ss, table, db[table]);
        }
      });

      return createJsonResponse({
        status: 'success',
        message: 'Data berhasil disinkronkan ke Google Spreadsheet.',
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'upsert' && payload.table && payload.record) {
      upsertRecord(ss, payload.table, payload.record);
      return createJsonResponse({
        status: 'success',
        message: 'Record berhasil diperbarui di sheet: ' + payload.table,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'delete' && payload.table && payload.id) {
      deleteRecord(ss, payload.table, payload.id);
      return createJsonResponse({
        status: 'success',
        message: 'Record berhasil dihapus dari sheet: ' + payload.table,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'deleteMultiple' && payload.table && Array.isArray(payload.ids)) {
      deleteMultipleRecords(ss, payload.table, payload.ids);
      return createJsonResponse({
        status: 'success',
        message: payload.ids.length + ' record berhasil dihapus dari sheet: ' + payload.table,
        timestamp: new Date().toISOString()
      });
    }

    return createJsonResponse({ status: 'error', message: 'Action atau payload tidak valid' });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function ensureSheetsExist(ss) {
  Object.keys(SHEET_NAMES).forEach(table => {
    const name = SHEET_NAMES[table];
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      const headers = TABLE_HEADERS[table];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#701a75').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });
}

function readTableData(ss, table, offset, limit) {
  const sheetName = SHEET_NAMES[table];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const totalDataRows = sheet.getLastRow() - 1;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1 || totalDataRows < 1) return [];

  const startRow = 2 + (offset ? Math.max(0, offset) : 0);
  if (startRow > sheet.getLastRow()) return [];

  const numRows = limit ? Math.min(limit, sheet.getLastRow() - startRow + 1) : sheet.getLastRow() - startRow + 1;
  if (numRows <= 0) return [];

  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const dataRange = sheet.getRange(startRow, 1, numRows, lastCol);
  const dataRows = dataRange.getValues();

  const idColIdx = headerRow.findIndex(h => String(h).trim().toLowerCase() === 'id');
  const prefix = String(table).slice(0, 3).toLowerCase();

  const results = dataRows.map((row, rowIdx) => {
    let idVal = idColIdx !== -1 ? row[idColIdx] : '';
    if (idColIdx !== -1 && table !== 'cages') {
      const rowHasOtherData = row.some((v, idx) => idx !== idColIdx && v !== '' && v !== null && v !== undefined);
      if (rowHasOtherData && (idVal === '' || idVal === null || idVal === undefined)) {
        idVal = prefix + '-' + (offset ? offset + rowIdx : rowIdx) + '-' + Math.abs(String(row[0] || '').charCodeAt(0) || 1);
      }
    }

    const item = {};
    headerRow.forEach((headerName, idx) => {
      if (!headerName) return;
      let val = idx === idColIdx && idVal ? idVal : row[idx];
      if (val && (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]')) {
        try {
          val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
        } catch(e) {
          try { val = val.toISOString(); } catch(err) {}
        }
      }
      if (typeof val === 'string' && ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']')))) {
        try { val = JSON.parse(val); } catch(e) {}
      }
      item[String(headerName).trim()] = val;
    });
    return item;
  }).filter(item => Object.values(item).some(val => val !== '' && val !== null && val !== undefined));

  return results;
}

function getRecordValueByHeader(record, headerName) {
  if (!record || typeof record !== 'object') return '';
  if (record[headerName] !== undefined && record[headerName] !== null) return record[headerName];

  var clean = String(headerName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (var k in record) {
    var kClean = String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (kClean === clean && record[k] !== undefined && record[k] !== null) return record[k];
  }

  var synonymMap = {
    'id': ['no', 'nomor', 'id', 'idpasien', 'kodelayanan'],
    'petid': ['idpasien', 'pasienid', 'petid', 'nomorpasien'],
    'petname': ['namapasien', 'namahewan', 'pasien', 'hewan', 'petname'],
    'pettype': ['jenishewan', 'spesies', 'pettype', 'tipehewan'],
    'ownername': ['namapemilik', 'pemilik', 'klien', 'ownername', 'nama'],
    'ownerwhatsapp': ['whatsapp', 'wa', 'nowa', 'telepon', 'nohp', 'ownerwhatsapp', 'kontak'],
    'operationtype': ['jenistindakan', 'tindakan', 'operasi', 'tindakanoperasi', 'namatindakan', 'operationtype'],
    'atropinedose': ['dosisatropin', 'atropin', 'atropinedose', 'atropina'],
    'xylazinedose': ['dosisxylazine', 'xylazine', 'xylazinedose', 'silazin'],
    'ketaminedose': ['dosisketamin', 'ketamin', 'ketaminedose', 'ketamine'],
    'acpdose': ['dosisacp', 'acp', 'acpdose', 'acepromazine'],
    'yohimbinedose': ['dosisyohimbine', 'yohimbine', 'yohimbinedose', 'antidota', 'reversal'],
    'antibioticdoseandtype': ['dosisantibiotik', 'antibiotik', 'antibioticdoseandtype', 'jenisantibiotik', 'antibiotikdosis'],
    'analgesicdoseandtype': ['dosisanalgesik', 'analgesik', 'analgesicdoseandtype', 'analgetik', 'antinyeri', 'analgesikdosis'],
    'operator': ['operator', 'dokterbedah', 'dokter', 'dokterpj', 'paramedis'],
    'operationnotes': ['catatanoperasi', 'catatan', 'keterangan', 'operationnotes', 'observasi'],
    'status': ['status', 'statustindakan', 'kondisi'],
    'date': ['tanggal', 'tgl', 'date', 'waktuoperasi'],
    'time': ['waktu', 'jam', 'time', 'pukul'],
    'createdat': ['createdat', 'waktudibuat', 'timestamp']
  };

  for (var stdKey in synonymMap) {
    var synList = synonymMap[stdKey];
    if (clean === stdKey || synList.indexOf(clean) !== -1) {
      if (record[stdKey] !== undefined && record[stdKey] !== null) return record[stdKey];
      for (var s = 0; s < synList.length; s++) {
        var syn = synList[s];
        for (var actualKey in record) {
          if (String(actualKey || '').toLowerCase().replace(/[^a-z0-9]/g, '') === syn) {
            if (record[actualKey] !== undefined && record[actualKey] !== null) return record[actualKey];
          }
        }
      }
    }
  }

  return '';
}

function writeTableData(ss, table, rows) {
  const sheetName = SHEET_NAMES[table];
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const defaultHeaders = TABLE_HEADERS[table];
  let headers = defaultHeaders;

  // Jika sheet sudah ada dan baris 1 memiliki header buatan user, pertahankan header tersebut!
  if (sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1) {
    const existingHeaderRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const validHeaders = existingHeaderRow.filter(h => h !== '' && h !== null && h !== undefined);
    if (validHeaders.length > 0) {
      headers = existingHeaderRow.map(h => String(h).trim());
    }
  } else {
    sheet.getRange(1, 1, 1, defaultHeaders.length).setValues([defaultHeaders]);
    sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight('bold').setBackground('#701a75').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  const existingSheetRows = readTableData(ss, table);
  const incomingRows = Array.isArray(rows) ? rows : [];

  const existingMap = {};
  existingSheetRows.forEach(row => {
    if (row && row.id) {
      existingMap[String(row.id).trim()] = row;
    }
  });

  let finalRows = incomingRows.map(row => {
    if (!row) return row;
    const copy = Object.assign({}, row);
    if (table === 'staff') {
      const existing = existingMap[String(copy.id || '').trim()];
      if (existing && (!copy.password || copy.password === '')) {
        copy.password = existing.password || '';
      }
    }
    return copy;
  });

  if (table === 'cages') {
    const cageIds = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];
    const defaultLabels = [
      'Kandang A-1 (Kucing/Kecil)', 'Kandang A-2 (Kucing/Kecil)', 'Kandang A-3 (Kucing/Kecil)',
      'Kandang A-4 (Kucing/Kecil)', 'Kandang A-5 (Kucing/Kecil)', 'Kandang A-6 (Kucing/Kecil)',
      'Kandang B-1 (Anjing/Besar)', 'Kandang B-2 (Anjing/Besar)', 'Kandang B-3 (Anjing/Besar)',
      'Kandang B-4 (Anjing/Besar)', 'Kandang B-5 (Anjing/Besar)', 'Kandang B-6 (Anjing/Besar)'
    ];

    const active12Map = {};
    cageIds.forEach((cid, idx) => {
      active12Map[cid] = {
        id: cid,
        label: defaultLabels[idx],
        status: 'Available'
      };
    });

    const incomingHistoryRows = [];
    finalRows.forEach(r => {
      if (!r) return;
      const rid = String(r.id || '').trim().toUpperCase();
      const st = String(r.status || '').toLowerCase();
      if (cageIds.includes(rid) && st !== 'selesai' && st !== 'discharged') {
        active12Map[rid] = Object.assign({}, active12Map[rid], r, { id: rid });
      } else {
        incomingHistoryRows.push(r);
      }
    });

    // Jika payload sinkronisasi hanya mengirim 12 kandang aktif tanpa riwayat,
    // jangan hapus data riwayat yang sudah ada di baris 14 ke bawah!
    let existingHistoryRows = [];
    if (incomingHistoryRows.length === 0 && sheet.getLastRow() >= 14) {
      const dataRange = sheet.getRange(14, 1, sheet.getLastRow() - 13, headers.length).getValues();
      existingHistoryRows = dataRange.map(row => {
        const obj = {};
        headers.forEach((h, hIdx) => {
          obj[h] = row[hIdx];
        });
        return obj;
      }).filter(r => r.id || r.petName || r.petId);
    }

    const finalHistory = incomingHistoryRows.length > 0 ? incomingHistoryRows : existingHistoryRows;
    const active12List = cageIds.map(cid => active12Map[cid]);
    finalRows = active12List.concat(finalHistory);
  }

  const prevLastRow = sheet.getLastRow();
  if (prevLastRow > 1) {
    sheet.getRange(2, 1, prevLastRow - 1, sheet.getLastColumn()).clearContent();
    sheet.getRange(2, 1, prevLastRow - 1, sheet.getLastColumn()).clearFormat();
  }

  if (finalRows.length === 0) {
    if (prevLastRow > 1) {
      sheet.deleteRows(2, prevLastRow - 1);
    }
    return;
  }

  const matrix = finalRows.map(item => headers.map(h => {
    let val = getRecordValueByHeader(item, h);
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  }));

  sheet.getRange(2, 1, matrix.length, headers.length).setValues(matrix);

  const newLastRow = sheet.getLastRow();
  if (newLastRow > matrix.length + 1) {
    sheet.deleteRows(matrix.length + 2, newLastRow - (matrix.length + 1));
  }
}

function upsertRecord(ss, table, record) {
  if (!record) return;
  const sheetName = SHEET_NAMES[table];
  if (!sheetName) return;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  let headers = TABLE_HEADERS[table];
  if (sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1) {
    const existingHeaderRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const validHeaders = existingHeaderRow.filter(h => h !== '' && h !== null && h !== undefined);
    if (validHeaders.length > 0) {
      headers = existingHeaderRow.map(h => String(h).trim());
    }
  }

  const rowValues = headers.map(h => {
    let val = getRecordValueByHeader(record, h);
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  });

  if (table === 'cages') {
    const cageIds = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];
    const defaultLabels = [
      'Kandang A-1 (Kucing/Kecil)', 'Kandang A-2 (Kucing/Kecil)', 'Kandang A-3 (Kucing/Kecil)',
      'Kandang A-4 (Kucing/Kecil)', 'Kandang A-5 (Kucing/Kecil)', 'Kandang A-6 (Kucing/Kecil)',
      'Kandang B-1 (Anjing/Besar)', 'Kandang B-2 (Anjing/Besar)', 'Kandang B-3 (Anjing/Besar)',
      'Kandang B-4 (Anjing/Besar)', 'Kandang B-5 (Anjing/Besar)', 'Kandang B-6 (Anjing/Besar)'
    ];

    // Ensure rows 2-13 exist for physical cages A1..B6
    if (sheet.getLastRow() < 13) {
      for (let i = 0; i < 12; i++) {
        const rowIdx = i + 2;
        const currentId = sheet.getRange(rowIdx, 1).getValue();
        if (!currentId || String(currentId).trim() === '') {
          const rowVal = headers.map(h => {
            if (h === 'id') return cageIds[i];
            if (h === 'label') return defaultLabels[i];
            if (h === 'status') return 'Available';
            return '';
          });
          sheet.getRange(rowIdx, 1, 1, headers.length).setValues([rowVal]);
        }
      }
    }

    const recordId = String(record.id || '').trim().toUpperCase();
    const isPhysicalCage = cageIds.includes(recordId) && String(record.status || '').toLowerCase() !== 'selesai' && String(record.status || '').toLowerCase() !== 'discharged';

    if (isPhysicalCage) {
      // Physical cage A1..B6 is ALWAYS located in rows 2 to 13
      const cageIdx = cageIds.indexOf(recordId);
      const targetRow = cageIdx + 2;
      sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
      return;
    }

    // It is a completed/discharged history record! Always goes into row 14 and beyond
    const lastRow = sheet.getLastRow();
    let existingRowIdx = -1;
    if (lastRow >= 14) {
      const dataRange = sheet.getRange(14, 1, lastRow - 13, sheet.getLastColumn()).getValues();
      const targetId = String(record.id || '').trim().toLowerCase();
      for (let i = 0; i < dataRange.length; i++) {
        const rowId = String(dataRange[i][0] || '').trim().toLowerCase();
        if (rowId === targetId) {
          existingRowIdx = i + 14;
          break;
        }
      }
    }

    if (existingRowIdx !== -1) {
      sheet.getRange(existingRowIdx, 1, 1, headers.length).setValues([rowValues]);
    } else {
      // Insert new completed history record at row 14 (pushing previous history down)
      if (lastRow < 13) {
        sheet.getRange(14, 1, 1, headers.length).setValues([rowValues]);
      } else {
        sheet.insertRowBefore(14);
        sheet.getRange(14, 1, 1, headers.length).setValues([rowValues]);
      }
    }
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow(rowValues);
    return;
  }

  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let idColIdx = headerRow.findIndex(h => String(h).trim().toLowerCase() === 'id');
  if (idColIdx === -1) idColIdx = 0;

  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const targetId = String(record.id || '').trim().toLowerCase();

  let existingRowIdx = -1;
  if (targetId) {
    for (let i = 0; i < dataRange.length; i++) {
      const rowId = String(dataRange[i][idColIdx] || '').trim().toLowerCase();
      if (rowId === targetId) {
        existingRowIdx = i + 2;
        break;
      }
    }
  }

  if (existingRowIdx !== -1) {
    sheet.getRange(existingRowIdx, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.insertRowBefore(2);
    sheet.getRange(2, 1, 1, headers.length).setValues([rowValues]);
  }
}

function deleteRecord(ss, table, id) {
  if (!id) return;
  const targetId = String(id).trim().toLowerCase();
  const cleanDigits = targetId.replace(/\D/g, '');

  if (table === 'owners') {
    deleteOwnerCascadingFromSheet(ss, targetId, cleanDigits);
    return;
  }

  if (table === 'pets') {
    deletePetCascadingFromSheet(ss, targetId, cleanDigits);
    return;
  }

  if (table === 'soapRecords') {
    deleteSoapRecordFromSheet(ss, targetId);
    return;
  }

  if (table === 'cages') {
    deleteInpatientRecordFromSheet(ss, targetId);
    return;
  }

  deleteSingleRecordFromSheet(ss, table, targetId);
}

function deleteSoapRecordFromSheet(ss, targetId) {
  const soapSheet = ss.getSheetByName(SHEET_NAMES.soapRecords);
  let petIdToDelete = '';
  let isRawatInap = false;

  if (soapSheet && soapSheet.getLastRow() >= 2) {
    const data = soapSheet.getRange(2, 1, soapSheet.getLastRow() - 1, soapSheet.getLastColumn()).getValues();
    const headers = soapSheet.getRange(1, 1, 1, soapSheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().trim());
    const idIdx = headers.indexOf('id') !== -1 ? headers.indexOf('id') : 0;
    const petIdIdx = headers.indexOf('petid') !== -1 ? headers.indexOf('petid') : 2;
    const soapIdx = headers.indexOf('soap') !== -1 ? headers.indexOf('soap') : 9;

    for (let i = data.length - 1; i >= 0; i--) {
      const rowId = String(data[i][idIdx] || '').trim().toLowerCase();
      if (rowId === targetId) {
        petIdToDelete = String(data[i][petIdIdx] || '').trim().toLowerCase();
        const soapContent = String(data[i][soapIdx] || '').toLowerCase();
        if (soapContent.includes('rawat inap') || targetId.includes('hist') || targetId.includes('cag')) {
          isRawatInap = true;
        }
        soapSheet.deleteRow(i + 2);
      }
    }
  }

  // Jika rekam medis ini berkaitan dengan riwayat rawat inap selesai, hapus juga dari Sheet 5_RawatInap (row 14 ke bawah)
  if (isRawatInap && petIdToDelete) {
    const cageSheet = ss.getSheetByName(SHEET_NAMES.cages);
    if (cageSheet && cageSheet.getLastRow() >= 14) {
      const cageData = cageSheet.getRange(14, 1, cageSheet.getLastRow() - 13, cageSheet.getLastColumn()).getValues();
      const cageHeaders = cageSheet.getRange(1, 1, 1, cageSheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().trim());
      const petIdCol = cageHeaders.indexOf('petid') !== -1 ? cageHeaders.indexOf('petid') : 3;

      for (let j = cageData.length - 1; j >= 0; j--) {
        const rPetId = String(cageData[j][petIdCol] || '').trim().toLowerCase();
        if (rPetId === petIdToDelete) {
          cageSheet.deleteRow(j + 14);
        }
      }
    }
  }
}

function deleteInpatientRecordFromSheet(ss, targetId) {
  const cageSheet = ss.getSheetByName(SHEET_NAMES.cages);
  let petIdToDelete = '';

  if (cageSheet && cageSheet.getLastRow() >= 2) {
    const data = cageSheet.getRange(2, 1, cageSheet.getLastRow() - 1, cageSheet.getLastColumn()).getValues();
    const headers = cageSheet.getRange(1, 1, 1, cageSheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().trim());
    const idIdx = headers.indexOf('id') !== -1 ? headers.indexOf('id') : 0;
    const petIdIdx = headers.indexOf('petid') !== -1 ? headers.indexOf('petid') : 3;

    for (let i = data.length - 1; i >= 0; i--) {
      const rowId = String(data[i][idIdx] || '').trim().toLowerCase();
      if (rowId === targetId) {
        petIdToDelete = String(data[i][petIdIdx] || '').trim().toLowerCase();
        if (i < 12) {
          // Baris 2 s/d 13 (Kandang Fisik A1..B6) -> Reset ke kosong/Available
          const defaultLabels = [
            'Kandang A-1 (Kucing/Kecil)', 'Kandang A-2 (Kucing/Kecil)', 'Kandang A-3 (Kucing/Kecil)',
            'Kandang A-4 (Kucing/Kecil)', 'Kandang A-5 (Kucing/Kecil)', 'Kandang A-6 (Kucing/Kecil)',
            'Kandang B-1 (Anjing/Besar)', 'Kandang B-2 (Anjing/Besar)', 'Kandang B-3 (Anjing/Besar)',
            'Kandang B-4 (Anjing/Besar)', 'Kandang B-5 (Anjing/Besar)', 'Kandang B-6 (Anjing/Besar)'
          ];
          const cageIds = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];
          const emptyRow = headers.map(h => {
            if (h === 'id') return cageIds[i];
            if (h === 'label') return defaultLabels[i];
            if (h === 'status') return 'Available';
            return '';
          });
          cageSheet.getRange(i + 2, 1, 1, headers.length).setValues([emptyRow]);
        } else {
          // Baris 14 ke atas (Data riwayat selesai rawat inap) -> Hapus baris secara fisik
          cageSheet.deleteRow(i + 2);
        }
      }
    }
  }

  // Hapus juga rekam medis SOAP terkait di Sheet 4_RekamMedis
  if (petIdToDelete) {
    const soapSheet = ss.getSheetByName(SHEET_NAMES.soapRecords);
    if (soapSheet && soapSheet.getLastRow() >= 2) {
      const soapData = soapSheet.getRange(2, 1, soapSheet.getLastRow() - 1, soapSheet.getLastColumn()).getValues();
      const soapHeaders = soapSheet.getRange(1, 1, 1, soapSheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().trim());
      const petIdCol = soapHeaders.indexOf('petid') !== -1 ? soapHeaders.indexOf('petid') : 2;
      const soapCol = soapHeaders.indexOf('soap') !== -1 ? soapHeaders.indexOf('soap') : 9;

      for (let k = soapData.length - 1; k >= 0; k--) {
        const rPetId = String(soapData[k][petIdCol] || '').trim().toLowerCase();
        const soapTxt = String(soapData[k][soapCol] || '').toLowerCase();
        if (rPetId === petIdToDelete && soapTxt.includes('rawat inap')) {
          soapSheet.deleteRow(k + 2);
        }
      }
    }
  }
}

function normalizePhoneForSheet(input) {
  if (!input) return '';
  var raw = String(input).trim();
  if (!raw) return '';
  var digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.indexOf('62') === 0) {
    digits = '0' + digits.slice(2);
  } else if (digits.indexOf('8') === 0) {
    digits = '0' + digits;
  } else if (digits.indexOf('0') !== 0) {
    digits = '0' + digits;
  }
  if (digits.indexOf('00') === 0) {
    digits = '0' + digits.replace(/^0+/, '');
  }
  return digits;
}

function deleteOwnerCascadingFromSheet(ss, targetId, cleanDigits) {
  var targetOwnerId = targetId;
  var targetOwnerPhone = '';
  var targetOwnerName = '';
  var deletedPetIds = [];

  // 1. Cari dan hapus Pemilik di Sheet 2_Pemilik
  var ownerSheet = ss.getSheetByName(SHEET_NAMES.owners);
  if (ownerSheet && ownerSheet.getLastRow() >= 2) {
    var data = ownerSheet.getRange(2, 1, ownerSheet.getLastRow() - 1, ownerSheet.getLastColumn()).getValues();
    var headers = ownerSheet.getRange(1, 1, 1, ownerSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var idIdx = headers.indexOf('id') !== -1 ? headers.indexOf('id') : 0;
    var waIdx = headers.indexOf('whatsapp') !== -1 ? headers.indexOf('whatsapp') : 2;
    var nameIdx = headers.indexOf('name') !== -1 ? headers.indexOf('name') : 1;

    for (var i = data.length - 1; i >= 0; i--) {
      var rId = String(data[i][idIdx] || '').trim().toLowerCase();
      var rWa = normalizePhoneForSheet(data[i][waIdx]);
      var rName = String(data[i][nameIdx] || '').trim().toLowerCase();

      var isMatch = false;
      if (rId) {
        isMatch = (rId === targetId);
      } else if (cleanDigits && targetId) {
        // Fallback data legacy tanpa ID: wajib nomor WA DAN nama cocok bersamaan
        isMatch = (rWa === cleanDigits && rName === targetId);
      }

      if (isMatch) {
        targetOwnerId = rId || targetId;
        if (rWa) targetOwnerPhone = rWa;
        if (rName) targetOwnerName = rName;
        ownerSheet.deleteRow(i + 2);
      }
    }
  }

  // 2. Cari dan hapus Seluruh Pasien milik Pemilik ini di Sheet 1_Pasien
  var petSheet = ss.getSheetByName(SHEET_NAMES.pets);
  if (petSheet && petSheet.getLastRow() >= 2) {
    var petData = petSheet.getRange(2, 1, petSheet.getLastRow() - 1, petSheet.getLastColumn()).getValues();
    var petHeaders = petSheet.getRange(1, 1, 1, petSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var petIdIdx = petHeaders.indexOf('id') !== -1 ? petHeaders.indexOf('id') : 0;
    var ownerIdIdx = petHeaders.indexOf('ownerid') !== -1 ? petHeaders.indexOf('ownerid') : 1;
    var ownerWaIdx = petHeaders.indexOf('ownerwhatsapp') !== -1 ? petHeaders.indexOf('ownerwhatsapp') : 3;
    var ownerNameIdx = petHeaders.indexOf('ownername') !== -1 ? petHeaders.indexOf('ownername') : 2;

    for (var p = petData.length - 1; p >= 0; p--) {
      var pId = String(petData[p][petIdIdx] || '').trim().toLowerCase();
      var rOwnerId = String(petData[p][ownerIdIdx] || '').trim().toLowerCase();
      var rOwnerWa = normalizePhoneForSheet(petData[p][ownerWaIdx]);
      var rOwnerName = String(petData[p][ownerNameIdx] || '').trim().toLowerCase();

      var isPetMatch = false;
      if (rOwnerId) {
        isPetMatch = (rOwnerId === targetOwnerId);
      } else if (targetOwnerPhone && targetOwnerName) {
        // Fallback data legacy tanpa ownerId: wajib WA DAN nama pemilik cocok bersamaan
        isPetMatch = (rOwnerWa === targetOwnerPhone && rOwnerName === targetOwnerName);
      }

      if (isPetMatch) {
        if (pId) deletedPetIds.push(pId);
        petSheet.deleteRow(p + 2);
      }
    }
  }

  // 3. Hapus Rekam Medis (Sheet 4_RekamMedis)
  deleteRowsByOwnerOrPetId(ss, SHEET_NAMES.soapRecords, targetOwnerId, deletedPetIds, targetOwnerPhone, targetOwnerName);

  // 4. Hapus Antrean (Sheet 3_Antrean)
  deleteRowsByOwnerOrPetId(ss, SHEET_NAMES.queues, targetOwnerId, deletedPetIds, targetOwnerPhone, targetOwnerName);

  // 5. Hapus Booking (Sheet 7_Booking)
  deleteRowsByOwnerOrPetId(ss, SHEET_NAMES.bookings, targetOwnerId, deletedPetIds, targetOwnerPhone, targetOwnerName);

  // 6. Hapus Feedback (Sheet 9_KepuasanSaran)
  deleteRowsByOwnerOrPetId(ss, SHEET_NAMES.feedbacks, targetOwnerId, deletedPetIds, targetOwnerPhone, targetOwnerName);

  // 7. Hapus Tindakan Operasi (Sheet 10_TindakanOperasi)
  deleteRowsByOwnerOrPetId(ss, SHEET_NAMES.surgeries, targetOwnerId, deletedPetIds, targetOwnerPhone, targetOwnerName);

  // 8. Bersihkan Data Rawat Inap (Sheet 5_RawatInap)
  var cageSheet = ss.getSheetByName(SHEET_NAMES.cages);
  if (cageSheet && cageSheet.getLastRow() >= 2) {
    var totalRows = cageSheet.getLastRow();
    var cageHeaders = cageSheet.getRange(1, 1, 1, cageSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var cPetIdIdx = cageHeaders.indexOf('petid') !== -1 ? cageHeaders.indexOf('petid') : 3;
    var cWaIdx = cageHeaders.indexOf('ownerwhatsapp') !== -1 ? cageHeaders.indexOf('ownerwhatsapp') : 5;
    var cOwnerNameIdx = cageHeaders.indexOf('ownername') !== -1 ? cageHeaders.indexOf('ownername') : 4;

    // Hapus riwayat rawat inap selesai (baris 14 ke bawah)
    if (totalRows >= 14) {
      var histData = cageSheet.getRange(14, 1, totalRows - 13, cageSheet.getLastColumn()).getValues();
      for (var h = histData.length - 1; h >= 0; h--) {
        var rPetId = String(histData[h][cPetIdIdx] || '').trim().toLowerCase();
        var rWa = normalizePhoneForSheet(histData[h][cWaIdx]);
        var rOwnerName = String(histData[h][cOwnerNameIdx] || '').trim().toLowerCase();

        var isHistMatch = false;
        if (rPetId) {
          isHistMatch = (deletedPetIds.indexOf(rPetId) !== -1);
        } else if (targetOwnerPhone && targetOwnerName) {
          isHistMatch = (rWa === targetOwnerPhone && rOwnerName === targetOwnerName);
        }

        if (isHistMatch) {
          cageSheet.deleteRow(h + 14);
        }
      }
    }

    // Kosongkan kandang aktif fisik A1..B6 (baris 2-13)
    var activeLimit = Math.min(13, cageSheet.getLastRow());
    if (activeLimit >= 2) {
      var activeData = cageSheet.getRange(2, 1, activeLimit - 1, cageSheet.getLastColumn()).getValues();
      for (var a = 0; a < activeData.length; a++) {
        var aPetId = String(activeData[a][cPetIdIdx] || '').trim().toLowerCase();
        var aWa = normalizePhoneForSheet(activeData[a][cWaIdx]);
        var aOwnerName = String(activeData[a][cOwnerNameIdx] || '').trim().toLowerCase();

        var isActiveMatch = false;
        if (aPetId) {
          isActiveMatch = (deletedPetIds.indexOf(aPetId) !== -1);
        } else if (targetOwnerPhone && targetOwnerName) {
          isActiveMatch = (aWa === targetOwnerPhone && aOwnerName === targetOwnerName);
        }

        if (isActiveMatch) {
          for (var col = 3; col <= cageSheet.getLastColumn(); col++) {
            if (col === 3) {
              cageSheet.getRange(a + 2, col).setValue('Available');
            } else {
              cageSheet.getRange(a + 2, col).setValue('');
            }
          }
        }
      }
    }
  }
}

function deletePetCascadingFromSheet(ss, targetId, cleanDigits) {
  var targetPetId = targetId;
  var targetPetName = '';
  var targetOwnerWa = '';

  // 1. Cari dan hapus Pasien di Sheet 1_Pasien
  var petSheet = ss.getSheetByName(SHEET_NAMES.pets);
  if (petSheet && petSheet.getLastRow() >= 2) {
    var data = petSheet.getRange(2, 1, petSheet.getLastRow() - 1, petSheet.getLastColumn()).getValues();
    var headers = petSheet.getRange(1, 1, 1, petSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var idIdx = headers.indexOf('id') !== -1 ? headers.indexOf('id') : 0;
    var nameIdx = headers.indexOf('name') !== -1 ? headers.indexOf('name') : 4;
    var waIdx = headers.indexOf('ownerwhatsapp') !== -1 ? headers.indexOf('ownerwhatsapp') : 3;

    for (var i = data.length - 1; i >= 0; i--) {
      var rId = String(data[i][idIdx] || '').trim().toLowerCase();
      var rName = String(data[i][nameIdx] || '').trim().toLowerCase();
      var rWa = normalizePhoneForSheet(data[i][waIdx]);

      var isMatch = false;
      if (rId) {
        isMatch = (rId === targetId);
      } else if (cleanDigits && targetId) {
        isMatch = (rWa === cleanDigits && rName === targetId);
      }

      if (isMatch) {
        targetPetId = rId || targetId;
        targetPetName = rName;
        targetOwnerWa = rWa;
        petSheet.deleteRow(i + 2);
      }
    }
  }

  // 2. Hapus Rekam Medis Pasien Ini (Sheet 4_RekamMedis)
  var soapSheet = ss.getSheetByName(SHEET_NAMES.soapRecords);
  if (soapSheet && soapSheet.getLastRow() >= 2) {
    var soapData = soapSheet.getRange(2, 1, soapSheet.getLastRow() - 1, soapSheet.getLastColumn()).getValues();
    var soapHeaders = soapSheet.getRange(1, 1, 1, soapSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var petIdIdx = soapHeaders.indexOf('petid') !== -1 ? soapHeaders.indexOf('petid') : 1;
    var petNameIdx = soapHeaders.indexOf('petname') !== -1 ? soapHeaders.indexOf('petname') : 2;
    var soapWaIdx = soapHeaders.indexOf('ownerwhatsapp') !== -1 ? soapHeaders.indexOf('ownerwhatsapp') : 4;

    for (var s = soapData.length - 1; s >= 0; s--) {
      var rPetId = String(soapData[s][petIdIdx] || '').trim().toLowerCase();
      var rPetName = String(soapData[s][petNameIdx] || '').trim().toLowerCase();
      var rSoapWa = normalizePhoneForSheet(soapData[s][soapWaIdx]);

      var isSoapMatch = false;
      if (rPetId) {
        isSoapMatch = (rPetId === targetPetId);
      } else if (targetPetName && targetOwnerWa) {
        // Fallback data legacy tanpa petId: wajib nama hewan DAN nomor WA cocok bersamaan
        isSoapMatch = (rPetName === targetPetName && rSoapWa === targetOwnerWa);
      }

      if (isSoapMatch) {
        soapSheet.deleteRow(s + 2);
      }
    }
  }

  // 3. Hapus Antrean Pasien Ini (Sheet 3_Antrean)
  var queueSheet = ss.getSheetByName(SHEET_NAMES.queues);
  if (queueSheet && queueSheet.getLastRow() >= 2) {
    var queueData = queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, queueSheet.getLastColumn()).getValues();
    var queueHeaders = queueSheet.getRange(1, 1, 1, queueSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var qPetIdIdx = queueHeaders.indexOf('petid') !== -1 ? queueHeaders.indexOf('petid') : 3;
    var qPetNameIdx = queueHeaders.indexOf('petname') !== -1 ? queueHeaders.indexOf('petname') : 4;
    var qWaIdx = queueHeaders.indexOf('ownerwhatsapp') !== -1 ? queueHeaders.indexOf('ownerwhatsapp') : 6;

    for (var q = queueData.length - 1; q >= 0; q--) {
      var rQPetId = String(queueData[q][qPetIdIdx] || '').trim().toLowerCase();
      var rQPetName = String(queueData[q][qPetNameIdx] || '').trim().toLowerCase();
      var rQWa = normalizePhoneForSheet(queueData[q][qWaIdx]);

      var isQueueMatch = false;
      if (rQPetId) {
        isQueueMatch = (rQPetId === targetPetId);
      } else if (targetPetName && targetOwnerWa) {
        isQueueMatch = (rQPetName === targetPetName && rQWa === targetOwnerWa);
      }

      if (isQueueMatch) {
        queueSheet.deleteRow(q + 2);
      }
    }
  }

  // 4. Bersihkan Data Rawat Inap Pasien Ini (Sheet 5_RawatInap)
  var cageSheet = ss.getSheetByName(SHEET_NAMES.cages);
  if (cageSheet && cageSheet.getLastRow() >= 2) {
    var totalRows = cageSheet.getLastRow();
    var cageHeaders = cageSheet.getRange(1, 1, 1, cageSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var cPetIdIdx = cageHeaders.indexOf('petid') !== -1 ? cageHeaders.indexOf('petid') : 3;
    var cPetNameIdx = cageHeaders.indexOf('petname') !== -1 ? cageHeaders.indexOf('petname') : 4;
    var cIdIdx = cageHeaders.indexOf('id') !== -1 ? cageHeaders.indexOf('id') : 0;
    var cWaIdx = cageHeaders.indexOf('ownerwhatsapp') !== -1 ? cageHeaders.indexOf('ownerwhatsapp') : 5;

    // Hapus riwayat rawat inap selesai (baris 14 ke bawah)
    if (totalRows >= 14) {
      var histData = cageSheet.getRange(14, 1, totalRows - 13, cageSheet.getLastColumn()).getValues();
      for (var h = histData.length - 1; h >= 0; h--) {
        var rId = String(histData[h][cIdIdx] || '').trim().toLowerCase();
        var rPetId = String(histData[h][cPetIdIdx] || '').trim().toLowerCase();
        var rPetName = String(histData[h][cPetNameIdx] || '').trim().toLowerCase();
        var rWa = normalizePhoneForSheet(histData[h][cWaIdx]);

        var isHistMatch = false;
        if (rPetId) {
          isHistMatch = (rPetId === targetPetId || rId === targetPetId);
        } else if (targetPetName && targetOwnerWa) {
          isHistMatch = (rPetName === targetPetName && rWa === targetOwnerWa);
        }

        if (isHistMatch) {
          cageSheet.deleteRow(h + 14);
        }
      }
    }

    // Kosongkan kandang aktif fisik A1..B6 (baris 2-13)
    var activeLimit = Math.min(13, cageSheet.getLastRow());
    if (activeLimit >= 2) {
      var activeData = cageSheet.getRange(2, 1, activeLimit - 1, cageSheet.getLastColumn()).getValues();
      for (var a = 0; a < activeData.length; a++) {
        var rPetId = String(activeData[a][cPetIdIdx] || '').trim().toLowerCase();
        var rPetName = String(activeData[a][cPetNameIdx] || '').trim().toLowerCase();
        var rWa = normalizePhoneForSheet(activeData[a][cWaIdx]);

        var isActiveMatch = false;
        if (rPetId) {
          isActiveMatch = (rPetId === targetPetId);
        } else if (targetPetName && targetOwnerWa) {
          isActiveMatch = (rPetName === targetPetName && rWa === targetOwnerWa);
        }

        if (isActiveMatch) {
          for (var col = 3; col <= cageSheet.getLastColumn(); col++) {
            if (col === 3) {
              cageSheet.getRange(a + 2, col).setValue('Available');
            } else {
              cageSheet.getRange(a + 2, col).setValue('');
            }
          }
        }
      }
    }
  }

  // 5. Hapus Booking Pasien Ini (Sheet 7_Booking)
  var bookingSheet = ss.getSheetByName(SHEET_NAMES.bookings);
  if (bookingSheet && bookingSheet.getLastRow() >= 2) {
    var bData = bookingSheet.getRange(2, 1, bookingSheet.getLastRow() - 1, bookingSheet.getLastColumn()).getValues();
    var bHeaders = bookingSheet.getRange(1, 1, 1, bookingSheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var bPetIdIdx = bHeaders.indexOf('petid') !== -1 ? bHeaders.indexOf('petid') : 2;
    var bPetNameIdx = bHeaders.indexOf('petname') !== -1 ? bHeaders.indexOf('petname') : 3;
    var bWaIdx = bHeaders.indexOf('ownerwhatsapp') !== -1 ? bHeaders.indexOf('ownerwhatsapp') : 5;

    for (var b = bData.length - 1; b >= 0; b--) {
      var rBPetId = String(bData[b][bPetIdIdx] || '').trim().toLowerCase();
      var rBPetName = String(bData[b][bPetNameIdx] || '').trim().toLowerCase();
      var rBWa = normalizePhoneForSheet(bData[b][bWaIdx]);

      var isBookingMatch = false;
      if (rBPetId) {
        isBookingMatch = (rBPetId === targetPetId);
      } else if (targetPetName && targetOwnerWa) {
        isBookingMatch = (rBPetName === targetPetName && rBWa === targetOwnerWa);
      }

      if (isBookingMatch) {
        bookingSheet.deleteRow(b + 2);
      }
    }
  }
}

function deleteRowsByOwnerOrPetId(ss, sheetName, targetOwnerId, deletedPetIds, targetOwnerPhone, targetOwnerName) {
  if (!sheetName) return;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });

  var petIdIdx = headers.indexOf('petid');
  var ownerIdIdx = headers.indexOf('ownerid');
  var waIdx = headers.indexOf('ownerwhatsapp') !== -1 ? headers.indexOf('ownerwhatsapp') : headers.indexOf('whatsapp');
  var nameIdx = headers.indexOf('ownername') !== -1 ? headers.indexOf('ownername') : headers.indexOf('name');

  for (var i = data.length - 1; i >= 0; i--) {
    var rPetId = petIdIdx !== -1 ? String(data[i][petIdIdx] || '').trim().toLowerCase() : '';
    var rOwnerId = ownerIdIdx !== -1 ? String(data[i][ownerIdIdx] || '').trim().toLowerCase() : '';
    var rWa = waIdx !== -1 ? normalizePhoneForSheet(data[i][waIdx]) : '';
    var rName = nameIdx !== -1 ? String(data[i][nameIdx] || '').trim().toLowerCase() : '';

    var isMatch = false;
    if (rPetId && deletedPetIds && deletedPetIds.length > 0) {
      isMatch = (deletedPetIds.indexOf(rPetId) !== -1);
    } else if (rOwnerId && targetOwnerId) {
      isMatch = (rOwnerId === targetOwnerId);
    } else if (!rPetId && !rOwnerId && targetOwnerPhone && targetOwnerName) {
      // Fallback HANYA jika baris tidak punya petId maupun ownerId: wajib WA DAN nama pemilik cocok bersamaan
      isMatch = (rWa === targetOwnerPhone && rName === targetOwnerName);
    }

    if (isMatch) {
      sheet.deleteRow(i + 2);
    }
  }
}

function deleteSingleRecordFromSheet(ss, table, targetId) {
  const sheetName = SHEET_NAMES[table];
  if (!sheetName) return;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase().trim());
  let idColIdx = headers.indexOf('id');
  if (idColIdx === -1) idColIdx = 0;
  let usernameColIdx = headers.indexOf('username');

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  for (let i = data.length - 1; i >= 0; i--) {
    const rowId = String(data[i][idColIdx] !== null && data[i][idColIdx] !== undefined ? data[i][idColIdx] : '').trim().toLowerCase();
    const rowUsername = usernameColIdx !== -1 ? String(data[i][usernameColIdx] !== null && data[i][usernameColIdx] !== undefined ? data[i][usernameColIdx] : '').trim().toLowerCase() : '';
    if (rowId === targetId || (rowUsername && rowUsername === targetId)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function deleteMultipleRecords(ss, table, idsList) {
  if (!Array.isArray(idsList) || idsList.length === 0) return;
  idsList.forEach(id => {
    if (id) deleteRecord(ss, table, id);
  });
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
