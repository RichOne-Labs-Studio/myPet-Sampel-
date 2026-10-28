import type { StaffUser } from '../types.ts';

/**
 * Mengambil daftar nama dokter pemeriksa aktif yang terdaftar di Pengaturan Admin.
 * Dokter pemeriksa mencakup:
 * 1. Semua staf dengan peran 'Dokter Hewan'
 * 2. Staf / Owner yang ditandai merangkap dokter (isPracticingDoctor === true)
 */
export function getPracticingDoctorNames(staffList: StaffUser[]): string[] {
  if (!Array.isArray(staffList) || staffList.length === 0) {
    return [];
  }

  const doctors = staffList
    .filter((s) => s.role === 'Dokter Hewan' || s.isPracticingDoctor)
    .map((s) => s.name.trim())
    .filter(Boolean);

  if (doctors.length === 0) {
    const fallback = staffList.filter((s) => s.role === 'Dokter Hewan').map((s) => s.name.trim());
    return fallback.length > 0 ? fallback : [];
  }

  return Array.from(new Set(doctors));
}
