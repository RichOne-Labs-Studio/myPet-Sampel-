import type { StaffUser, StaffRole } from '../types.ts';

/**
 * Checks if a given role string is Super Admin / Owner level
 */
export function isSuperAdminRole(role?: StaffRole | string | null): boolean {
  if (!role) return false;
  const r = String(role).toLowerCase();
  return (
    r.includes('super admin') ||
    r.includes('superadmin') ||
    r.includes('owner') ||
    r.includes('direktur') ||
    r.includes('pemilik')
  );
}

/**
 * Checks if the current logged in staff user has permission to view revenue & financial summaries
 */
export function canViewRevenue(user?: StaffUser | null): boolean {
  if (!user) return false;
  if (isSuperAdminRole(user.role)) return true;
  const uname = String(user.username || '').toLowerCase();
  return uname === 'owner' || uname === 'superadmin';
}

/**
 * Returns formatted role display info with color badges and icons
 */
export function getRoleBadgeInfo(role?: StaffRole | string | null): {
  label: string;
  badgeClass: string;
  icon: string;
  isSuperAdmin: boolean;
} {
  if (isSuperAdminRole(role)) {
    return {
      label: 'Super Admin / Owner',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: '👑',
      isSuperAdmin: true,
    };
  }
  if (role === 'Dokter Hewan') {
    return {
      label: 'Dokter Hewan',
      badgeClass: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300',
      icon: '🩺',
      isSuperAdmin: false,
    };
  }
  return {
    label: 'Staff Admin / Frontdesk',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
    icon: '🛡️',
    isSuperAdmin: false,
  };
}
