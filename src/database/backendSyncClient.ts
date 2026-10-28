/**
 * Client-side interface to connect to Backend Sync Engine.
 * 
 * Works seamlessly in both environments:
 * 1. Full-Stack Dev / Cloud Run (with local Express backend in <10ms)
 * 2. Static Hosting / GitHub Pages (with direct IndexedDB/Spreadsheet local computing fallback)
 */

import {
  SpreadsheetDatabaseSchema,
  pushSingleRecordToSpreadsheet,
  pushTableToSpreadsheet,
  deleteRecordFromSpreadsheet,
  deleteMultipleRecordsFromSpreadsheet,
  FINAL_SPREADSHEET_URL,
} from './spreadsheetDb.ts';
import type { Owner, Pet, SoapRecord, InpatientHistoryRecord } from '../types.ts';
import { CLINIC_APP_HANDSHAKE_TOKEN } from '../utils/cryptoUtils.ts';
import { normalizePetType } from '../utils/petUtils.ts';
import { normalizePhoneWithZero } from '../utils/phoneUtils.ts';

export function getAuthHeaders(): Record<string, string> {
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('vetcare_session_token') || sessionStorage.getItem('vetcare_session_token');
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-clinic-app-token': CLINIC_APP_HANDSHAKE_TOKEN,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface BackendSyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  counts: Record<string, number>;
  version: number;
  lastError: string | null;
  webAppUrl?: string;
}

export function isStaticHostingEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  return (
    host.includes('github.io') ||
    host.includes('gitlab.io') ||
    host.includes('vercel.app') ||
    host.includes('pages.dev') ||
    host.includes('netlify.app') ||
    window.location.protocol === 'file:'
  );
}

let backendAvailable = !isStaticHostingEnvironment();

export function hasBackendServer(): boolean {
  if (isStaticHostingEnvironment()) return false;
  return true;
}

export function setBackendAvailable(available: boolean) {
  if (isStaticHostingEnvironment()) {
    backendAvailable = available;
  }
}

export function updateBackendAvailability(res: Response | null, error?: any) {
  if (res) {
    if (res.status === 401 || res.status === 403 || res.ok) {
      backendAvailable = true;
      return;
    }
    if (res.status === 404 && isStaticHostingEnvironment()) {
      backendAvailable = false;
      return;
    }
  }
}

// In-memory fallback database for static hosts (GitHub Pages) and offline mode
let localFallbackDb: Partial<SpreadsheetDatabaseSchema> = {};

export function setLocalDatabaseFallback(db: Partial<SpreadsheetDatabaseSchema>) {
  localFallbackDb = { ...localFallbackDb, ...db };
}

export function getLocalDatabaseFallback(): Partial<SpreadsheetDatabaseSchema> {
  return localFallbackDb;
}

export async function fetchDatabaseFromBackend(): Promise<{
  success: boolean;
  data?: SpreadsheetDatabaseSchema;
  status?: BackendSyncStatus;
  message?: string;
}> {
  if (!hasBackendServer()) {
    return { success: false, message: 'Static host without backend server' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch('/api/sync/data', {
      method: 'GET',
      headers: getAuthHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      updateBackendAvailability(res);
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: 'Autentikasi sesi diperlukan' };
      }
      return { success: false, message: `Server error: ${res.status}` };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (isStaticHostingEnvironment()) {
        backendAvailable = false;
      }
      return { success: false, message: 'Static host without backend' };
    }

    const json = await res.json();
    if (json.success && json.data) {
      setLocalDatabaseFallback(json.data);
      return {
        success: true,
        data: json.data,
        status: json.status,
      };
    }

    return { success: false, message: json.message || 'Gagal memuat data' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Waktu koneksi memuat data database habis (timeout).' };
    }
    updateBackendAvailability(null, err);
    return { success: false, message: err.message || 'Koneksi ke backend gagal' };
  }
}

export interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  totalRevenue?: number;
}

export async function fetchPaginatedPatients(params: {
  page?: number;
  limit?: number;
  q?: string;
  species?: string;
  status?: string;
}): Promise<PaginatedResult<any>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, params.limit || 10);
  const q = (params.q || '').trim().toLowerCase();
  const species = params.species || 'all';
  const status = params.status || 'all';

  if (hasBackendServer()) {
    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (params.q) query.set('q', params.q);
    if (params.species) query.set('species', params.species);
    if (params.status) query.set('status', params.status);

    try {
      const res = await fetch(`/api/patients?${query.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return await res.json();
        }
      }
    } catch {
      // Abaikan error sementara
    }
  }

  // Fallback lokal (untuk GitHub Pages / Static Hosting)
  const pets: Pet[] = localFallbackDb.pets || [];
  const owners: Owner[] = localFallbackDb.owners || [];
  const soapRecords: SoapRecord[] = localFallbackDb.soapRecords || [];

  const ownerMap = new Map<string, Owner>();
  owners.forEach((o) => {
    if (o.id) ownerMap.set(o.id, o);
    if (o.whatsapp) ownerMap.set(o.whatsapp, o);
  });

  const lastSoapMap = new Map<string, string>();
  soapRecords.forEach((s) => {
    if (s.petId && s.date) {
      const existing = lastSoapMap.get(s.petId);
      if (!existing || s.date > existing) {
        lastSoapMap.set(s.petId, s.date);
      }
    }
  });

  let filtered = pets.filter((p) => {
    const petNormType = normalizePetType(p.type, `${p.name || ''} ${p.breed || ''} ${p.notes || ''}`);
    const petTypeLower = petNormType.toLowerCase();
    const rawTypeLower = String(p.type || '').toLowerCase();
    const targetSpecies = String(species || 'all').toLowerCase();

    if (targetSpecies !== 'all') {
      if ((targetSpecies === 'cat' || targetSpecies === 'kucing') && petTypeLower !== 'cat' && !rawTypeLower.includes('kucing') && !rawTypeLower.includes('cat')) return false;
      if ((targetSpecies === 'dog' || targetSpecies === 'anjing') && petTypeLower !== 'dog' && !rawTypeLower.includes('anjing') && !rawTypeLower.includes('dog')) return false;
      if ((targetSpecies === 'rabbit' || targetSpecies === 'kelinci') && petTypeLower !== 'rabbit' && !rawTypeLower.includes('kelinci') && !rawTypeLower.includes('rabbit')) return false;
      if ((targetSpecies === 'bird' || targetSpecies === 'exotic' || targetSpecies === 'burung' || targetSpecies === 'eksotik') && petTypeLower !== 'exotic' && !rawTypeLower.includes('burung') && !rawTypeLower.includes('bird') && !rawTypeLower.includes('eksotik') && !rawTypeLower.includes('exotic')) return false;
      if ((targetSpecies === 'farm animal' || targetSpecies === 'farm' || targetSpecies === 'ternak') && petTypeLower !== 'farm animal' && !rawTypeLower.includes('ternak') && !rawTypeLower.includes('sapi') && !rawTypeLower.includes('kambing')) return false;
      if (targetSpecies === 'other' && (petTypeLower === 'cat' || petTypeLower === 'dog')) return false;
    }

    if (status !== 'all' && p.status !== status) return false;
    if (!q) return true;

    const nameMatch = (p.name || '').toLowerCase().includes(q);
    const idMatch = (p.id || '').toLowerCase().includes(q);
    const breedMatch = (p.breed || '').toLowerCase().includes(q);
    const owner = p.ownerId ? ownerMap.get(p.ownerId) : (p.ownerWhatsapp ? ownerMap.get(p.ownerWhatsapp) : undefined);
    const ownerNameMatch = (owner?.name || p.ownerName || '').toLowerCase().includes(q);
    const ownerWaMatch = (owner?.whatsapp || p.ownerWhatsapp || '').toLowerCase().includes(q);

    return nameMatch || idMatch || breedMatch || ownerNameMatch || ownerWaMatch;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const sliced = filtered.slice(startIndex, startIndex + limit);

  const enriched = sliced.map((p) => {
    const owner = p.ownerId ? ownerMap.get(p.ownerId) : (p.ownerWhatsapp ? ownerMap.get(p.ownerWhatsapp) : undefined);
    const normalizedType = normalizePetType(p.type, `${p.name || ''} ${p.breed || ''} ${p.notes || ''}`);
    return {
      ...p,
      type: normalizedType,
      ownerName: owner?.name || p.ownerName || '-',
      ownerWhatsapp: owner?.whatsapp || p.ownerWhatsapp || '-',
      ownerAddress: owner?.address || '-',
      lastVisitDate: lastSoapMap.get(p.id) || p.registeredAt || '-',
    };
  });

  return {
    success: true,
    data: enriched,
    total,
    page,
    totalPages,
    limit,
  };
}

export async function fetchPaginatedOwners(params: {
  page?: number;
  limit?: number;
  q?: string;
}): Promise<PaginatedResult<any>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, params.limit || 10);
  const q = (params.q || '').trim().toLowerCase();

  if (hasBackendServer()) {
    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (params.q) query.set('q', params.q);

    try {
      const res = await fetch(`/api/owners?${query.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return await res.json();
        }
      } else {
        backendAvailable = false;
      }
    } catch {
      backendAvailable = false;
    }
  }

  // Fallback lokal (untuk GitHub Pages / Static Hosting)
  const owners: Owner[] = localFallbackDb.owners || [];
  const pets: Pet[] = localFallbackDb.pets || [];

  const petsByOwner = new Map<string, Pet[]>();
  pets.forEach((p) => {
    const key = p.ownerId || p.ownerWhatsapp;
    if (key) {
      const arr = petsByOwner.get(key) || [];
      arr.push(p);
      petsByOwner.set(key, arr);
    }
  });

  let filtered = owners.filter((o) => {
    if (!q) return true;
    const nameMatch = (o.name || '').toLowerCase().includes(q);
    const waMatch = (o.whatsapp || '').toLowerCase().includes(q);
    const idMatch = (o.id || '').toLowerCase().includes(q);
    const addrMatch = (o.address || '').toLowerCase().includes(q);

    const ownerPets = (o.id ? petsByOwner.get(o.id) : undefined) || (o.whatsapp ? petsByOwner.get(o.whatsapp) : []) || [];
    const petMatch = ownerPets.some((p) => (p.name || '').toLowerCase().includes(q));

    return nameMatch || waMatch || idMatch || addrMatch || petMatch;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const sliced = filtered.slice(startIndex, startIndex + limit);

  const enriched = sliced.map((o) => {
    const ownerPets = (o.id ? petsByOwner.get(o.id) : undefined) || (o.whatsapp ? petsByOwner.get(o.whatsapp) : []) || [];
    return {
      ...o,
      pets: ownerPets,
      petCount: ownerPets.length,
    };
  });

  return {
    success: true,
    data: enriched,
    total,
    page,
    totalPages,
    limit,
  };
}

export async function fetchPaginatedSoapRecords(params: {
  page?: number;
  limit?: number;
  q?: string;
  petId?: string;
  vet?: string;
  hasPrescription?: boolean;
  hasDiagnostics?: boolean;
}): Promise<PaginatedResult<any>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, params.limit || 10);
  const q = (params.q || '').trim().toLowerCase();
  const petId = params.petId || '';
  const vet = params.vet || 'all';

  if (hasBackendServer()) {
    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (params.q) query.set('q', params.q);
    if (params.petId) query.set('petId', params.petId);
    if (params.vet) query.set('vet', params.vet);
    if (params.hasPrescription !== undefined) query.set('hasPrescription', String(params.hasPrescription));
    if (params.hasDiagnostics !== undefined) query.set('hasDiagnostics', String(params.hasDiagnostics));

    try {
      const res = await fetch(`/api/soap-records?${query.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return await res.json();
        }
      } else {
        backendAvailable = false;
      }
    } catch {
      backendAvailable = false;
    }
  }

  // Fallback lokal (untuk GitHub Pages / Static Hosting)
  const soapRecords: SoapRecord[] = localFallbackDb.soapRecords || [];

  let filtered = soapRecords.filter((s) => {
    if (petId && s.petId !== petId) return false;
    if (vet !== 'all' && s.veterinarian !== vet) return false;
    if (params.hasPrescription && (!s.prescriptions || s.prescriptions.length === 0)) return false;
    if (params.hasDiagnostics && (!s.diagnosticAttachments || s.diagnosticAttachments.length === 0)) return false;

    if (!q) return true;
    const petMatch = (s.petName || '').toLowerCase().includes(q);
    const ownerMatch = (s.ownerName || '').toLowerCase().includes(q);
    const idMatch = (s.id || '').toLowerCase().includes(q);
    const vetMatch = (s.veterinarian || '').toLowerCase().includes(q);
    const diagMatch = (s.soap?.assessment || '').toLowerCase().includes(q);
    const subjMatch = (s.soap?.subjective || '').toLowerCase().includes(q);

    return petMatch || ownerMatch || idMatch || vetMatch || diagMatch || subjMatch;
  });

  const totalRevenue = filtered.reduce((acc, curr) => {
    const fee = typeof curr.serviceFee === 'number' ? curr.serviceFee : parseFloat(String(curr.serviceFee || 0)) || 0;
    const prescFee = (curr.prescriptions || []).reduce((pAcc, p) => pAcc + (p.price || 0) * (p.quantity || 1), 0);
    return acc + fee + prescFee;
  }, 0);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const sliced = filtered.slice(startIndex, startIndex + limit);

  return {
    success: true,
    data: sliced,
    total,
    page,
    totalPages,
    limit,
    totalRevenue,
  };
}

export async function searchPatientsAutocompleteApi(q: string, limit: number = 30): Promise<any[]> {
  const cleanQ = (q || '').trim().toLowerCase();
  if (hasBackendServer()) {
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(cleanQ)}&limit=${limit}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) return json.data;
        }
      } else {
        backendAvailable = false;
      }
    } catch {
      backendAvailable = false;
    }
  }

  // Fallback lokal
  const pets: Pet[] = localFallbackDb.pets || [];
  const owners: Owner[] = localFallbackDb.owners || [];
  const ownerMap = new Map<string, Owner>();
  owners.forEach((o) => {
    if (o.id) ownerMap.set(o.id, o);
    if (o.whatsapp) ownerMap.set(o.whatsapp, o);
  });

  const results: any[] = [];
  for (const p of pets) {
    if (results.length >= limit) break;
    const owner = p.ownerId ? ownerMap.get(p.ownerId) : (p.ownerWhatsapp ? ownerMap.get(p.ownerWhatsapp) : undefined);
    const ownerName = owner?.name || p.ownerName || '-';
    const ownerWhatsapp = owner?.whatsapp || p.ownerWhatsapp || '-';

    if (!cleanQ) {
      results.push({ ...p, ownerName, ownerWhatsapp });
      continue;
    }

    const nameMatch = (p.name || '').toLowerCase().includes(cleanQ);
    const idMatch = (p.id || '').toLowerCase().includes(cleanQ);
    const ownerMatch = ownerName.toLowerCase().includes(cleanQ) || ownerWhatsapp.includes(cleanQ);

    if (nameMatch || idMatch || ownerMatch) {
      results.push({ ...p, ownerName, ownerWhatsapp });
    }
  }

  return results;
}

export async function fetchPatientSoapHistoryApi(petId: string): Promise<any[]> {
  const cleanId = String(petId || '').trim();
  if (!cleanId) return [];

  if (hasBackendServer()) {
    try {
      const url = `/api/patients/${encodeURIComponent(cleanId)}/soap-history`;
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) return json.data;
        }
      } else {
        backendAvailable = false;
      }
    } catch {
      backendAvailable = false;
    }
  }

  // Fallback lokal: Selaraskan berdasarkan petId ATAU (Nama Pasien sama + Identitas Pemilik sama)
  const pets: Pet[] = localFallbackDb.pets || [];
  const targetPet = pets.find((p) => String(p.id).trim() === cleanId);
  const targetName = targetPet ? String(targetPet.name || '').toLowerCase().trim() : '';
  const targetWa = targetPet ? normalizePhoneWithZero(targetPet.ownerWhatsapp) : '';

  const soapRecords: SoapRecord[] = localFallbackDb.soapRecords || [];
  const records = soapRecords.filter((s) => {
    if (!s) return false;
    if (String(s.petId || '').trim() === cleanId) return true;
    if (targetName && targetWa && s.petName && String(s.petName).toLowerCase().trim() === targetName) {
      if (normalizePhoneWithZero(s.ownerWhatsapp) === targetWa) return true;
    }
    return false;
  });

  const uniqueMap = new Map<string, SoapRecord>();
  records.forEach((r) => {
    if (r && r.id) uniqueMap.set(String(r.id), r);
  });

  return Array.from(uniqueMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function fetchPaginatedInpatientHistory(params: {
  page?: number;
  limit?: number;
  q?: string;
}): Promise<PaginatedResult<any>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, params.limit || 10);
  const q = (params.q || '').trim().toLowerCase();

  if (hasBackendServer()) {
    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (params.q) query.set('q', params.q);

    try {
      const res = await fetch(`/api/inpatient/history?${query.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return await res.json();
        }
      } else {
        backendAvailable = false;
      }
    } catch {
      backendAvailable = false;
    }
  }

  const list: InpatientHistoryRecord[] = localFallbackDb.inpatientHistory || [];
  const filtered = list.filter((h) => {
    if (!q) return true;
    return (
      (h.petName || '').toLowerCase().includes(q) ||
      (h.ownerName || '').toLowerCase().includes(q) ||
      (h.diagnosis || '').toLowerCase().includes(q)
    );
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const sliced = filtered.slice(startIndex, startIndex + limit);

  return {
    success: true,
    data: sliced,
    total,
    page,
    totalPages,
    limit,
  };
}

export async function fetchStatusFromBackend(): Promise<BackendSyncStatus | null> {
  if (!hasBackendServer()) return null;
  try {
    const res = await fetch('/api/sync/status', {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      if (res.status === 404 && isStaticHostingEnvironment()) {
        backendAvailable = false;
      }
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    const json = await res.json();
    return json.success ? json : null;
  } catch {
    return null;
  }
}

export async function triggerBackendSync(): Promise<boolean> {
  if (!hasBackendServer()) return false;
  try {
    const res = await fetch('/api/sync/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushRecordToBackend(table: string, record: any, webAppUrl?: string): Promise<boolean> {
  if (hasBackendServer()) {
    try {
      const res = await fetch('/api/sync/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ table, record }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('vetcare_data_sync');
            bc.postMessage({ table, id: record?.id, timestamp: Date.now() });
            bc.close();
          } catch {}
        }
        return true;
      }
    } catch {
      // Abaikan kegagalan sementara
    }
  }

  // Fallback untuk static hosting seperti GitHub Pages tanpa backend server
  const targetUrl = webAppUrl || FINAL_SPREADSHEET_URL;
  if (targetUrl) {
    pushSingleRecordToSpreadsheet(targetUrl, table as any, record).catch(() => {});
    return true;
  }
  return false;
}

export interface WriteVerificationResult {
  inBackend: boolean;
  inSpreadsheet: boolean;
  isFullyVerified: boolean;
}

/**
 * Memverifikasi apakah penulisan data ke database backend & Google Spreadsheet sudah terkonfirmasi
 */
export async function verifyWriteStatusFromBackend(
  table: string,
  id: string,
  webAppUrl?: string
): Promise<WriteVerificationResult> {
  if (hasBackendServer()) {
    try {
      const res = await fetch(`/api/sync/verify-write?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {
          ...getAuthHeaders(),
        },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          inBackend: Boolean(data.inBackend),
          inSpreadsheet: Boolean(data.inSpreadsheet),
          isFullyVerified: Boolean(data.isFullyVerified || (data.inBackend && data.inSpreadsheet)),
        };
      }
    } catch {
      // Fallback
    }
  }

  // Fallback direct ke Google Apps Script (static mode)
  const targetUrl = webAppUrl || FINAL_SPREADSHEET_URL;
  if (targetUrl && targetUrl.trim()) {
    try {
      const checkUrl = `${targetUrl.trim()}?action=exists&table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}&clinicSecretToken=${encodeURIComponent(CLINIC_APP_HANDSHAKE_TOKEN)}`;
      const res = await fetch(checkUrl, { method: 'GET', redirect: 'follow' });
      if (res.ok) {
        const json = await res.json();
        const exists = Boolean(json && json.exists);
        return { inBackend: true, inSpreadsheet: exists, isFullyVerified: exists };
      }
    } catch {
      return { inBackend: true, inSpreadsheet: false, isFullyVerified: false };
    }
  }

  return { inBackend: true, inSpreadsheet: false, isFullyVerified: false };
}

export async function deleteRecordFromBackend(table: string, id: string, webAppUrl?: string): Promise<boolean> {
  if (hasBackendServer()) {
    try {
      const res = await fetch('/api/sync/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ table, id }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('vetcare_data_sync');
            bc.postMessage({ table, id, action: 'delete', timestamp: Date.now() });
            bc.close();
          } catch {}
        }
        return true;
      }
    } catch {
      // Do not set backendAvailable = false
    }
  }

  // Fallback untuk deployment langsung ke Google Apps Script (GAS-only / static hosting)
  const targetUrl = webAppUrl || FINAL_SPREADSHEET_URL;
  if (targetUrl && id) {
    deleteRecordFromSpreadsheet(targetUrl, table as any, id).catch(() => {});
    return true;
  }

  return false;
}

export async function deleteMultipleRecordsFromBackend(table: string, ids: string[], webAppUrl?: string): Promise<boolean> {
  if (hasBackendServer()) {
    try {
      const res = await fetch('/api/sync/delete-multiple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ table, ids }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('vetcare_data_sync');
            bc.postMessage({ table, ids, action: 'deleteMultiple', timestamp: Date.now() });
            bc.close();
          } catch {}
        }
        return true;
      }
    } catch {
      // Do not set backendAvailable = false
    }
  }

  // Fallback untuk deployment langsung ke Google Apps Script (GAS-only / static hosting)
  const targetUrl = webAppUrl || FINAL_SPREADSHEET_URL;
  if (targetUrl && Array.isArray(ids) && ids.length > 0) {
    deleteMultipleRecordsFromSpreadsheet(targetUrl, table as any, ids).catch(() => {});
    return true;
  }

  return false;
}

export async function pushTableToBackend(table: string, records: any[], webAppUrl?: string): Promise<boolean> {
  if (hasBackendServer()) {
    try {
      const res = await fetch('/api/sync/table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ table, records }),
      });
      if (res.ok) return true;
    } catch {
      backendAvailable = false;
    }
  }

  const targetUrl = webAppUrl || FINAL_SPREADSHEET_URL;
  if (targetUrl) {
    pushTableToSpreadsheet(targetUrl, table as any, records).catch(() => {});
    return true;
  }
  return false;
}

export async function updateBackendConfig(webAppUrl?: string, autoSync?: boolean): Promise<boolean> {
  if (hasBackendServer()) {
    try {
      const res = await fetch('/api/sync/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ webAppUrl, autoSync }),
      });
      if (res.ok) return true;
    } catch {
      backendAvailable = false;
    }
  }
  return false;
}

export async function fetchPublicLiveQueues(): Promise<{
  success: boolean;
  currentServingTicket?: string;
  counts?: { totalToday: number; waiting: number; inPoli: number; completed: number };
  todayQueues?: any[];
  timestamp?: string;
} | null> {
  if (!hasBackendServer()) return null;
  try {
    const res = await fetch('/api/public/queues/live');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPublicQueueTicket(ticketNumber: string): Promise<{
  success: boolean;
  ticket?: any;
  currentServingTicket?: string;
  peopleAhead?: number;
  isCompleted?: boolean;
  isNowServing?: boolean;
} | null> {
  if (!hasBackendServer()) return null;
  try {
    const res = await fetch(`/api/public/queues/ticket/${encodeURIComponent(ticketNumber)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}


