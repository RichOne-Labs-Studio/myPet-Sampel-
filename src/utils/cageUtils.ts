import type { InpatientCage } from '../types.ts';
import { INITIAL_CAGES } from '../mockData.ts';

export const STANDARD_CAGE_IDS = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
] as const;

export type StandardCageId = (typeof STANDARD_CAGE_IDS)[number];

/**
 * Normalizes any cage ID or label into one of the 12 standard physical cages: A1-A6, B1-B6.
 * Returns null if the record is a historical cag-... ID or unrecognized.
 */
export function normalizeCageId(rawId?: any, rawLabel?: any): StandardCageId | null {
  const strId = String(rawId || '').trim();
  const upperId = strId.toUpperCase();

  // Primary guard: History records with IDs starting with CAG- or HIST- must never be normalized to A1-B6 physical slots
  if (upperId.startsWith('CAG-') || upperId.startsWith('HIST-')) {
    return null;
  }

  if (STANDARD_CAGE_IDS.includes(upperId as StandardCageId)) {
    return upperId as StandardCageId;
  }

  // Check if rawId itself is a formatted physical cage code like "A-1", "A_1", or "A 1"
  const matchId = upperId.match(/^([AB])\s*[-_]?\s*([1-6])$/);
  if (matchId) {
    return `${matchId[1]}${matchId[2]}` as StandardCageId;
  }

  // Only check combined label if rawId is empty or explicitly a cage label (e.g. "KANDANG A1")
  if (!rawId || upperId.includes('KANDANG') || upperId.includes('CAGE')) {
    const combined = `${upperId} ${String(rawLabel || '').toUpperCase()}`;
    const match = combined.match(/\b([AB])\s*[-_]?\s*([1-6])\b/);
    if (match) {
      const candidate = `${match[1]}${match[2]}` as StandardCageId;
      if (STANDARD_CAGE_IDS.includes(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Checks if an ID is one of the 12 standard physical cages.
 */
export function isStandardCageId(id?: any): boolean {
  return normalizeCageId(id) !== null;
}

/**
 * Sanitizes any cages array to ensure the layout strictly contains ONLY the 12 physical cages
 * (A1-A6, B1-B6) in order, with their ID matching their cage name.
 * Historical records (cag-..., status: 'selesai', etc.) are excluded from active cages.
 */
export function sanitizeCagesList(rawCages: any[]): InpatientCage[] {
  const cageMap = new Map<StandardCageId, InpatientCage>();
  INITIAL_CAGES.forEach((ic) => cageMap.set(ic.id as StandardCageId, { ...ic }));

  if (Array.isArray(rawCages)) {
    rawCages.forEach((c) => {
      if (!c) return;
      const normalizedId = normalizeCageId(c.id, c.label);
      if (!normalizedId) {
        // Exclude cag-... and non-standard IDs from physical cages layout
        return;
      }

      const statusLower = String(c.status || '').toLowerCase().trim();
      // If status is 'selesai', 'discharged', or empty, the cage is currently empty/Available
      if (statusLower === 'selesai' || statusLower === 'discharged' || !c.status) {
        return;
      }

      const defaultCage = cageMap.get(normalizedId)!;
      let obs: any = c.observations;
      if (typeof obs === 'string' && obs.trim()) {
        try {
          obs = JSON.parse(obs);
        } catch {
          obs = [];
        }
      }

      const hasActivePatient = Boolean(
        (c.petName && String(c.petName).trim().length > 0) ||
        (c.petId && String(c.petId).trim().length > 0)
      );

      let cleanStatus: 'Available' | 'Occupied' | 'Cleaning' = 'Available';
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

      cageMap.set(normalizedId, {
        ...defaultCage,
        id: normalizedId, // ID strictly follows cage name (A1..B6)
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
        observations: cleanStatus === 'Occupied' && Array.isArray(obs) ? obs : [],
      });
    });
  }

  return INITIAL_CAGES.map((ic) => cageMap.get(ic.id as StandardCageId) || ic);
}
