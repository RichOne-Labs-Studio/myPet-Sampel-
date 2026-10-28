import { useState, useEffect, useCallback } from 'react';

export type AppRoute =
  | '/'
  | '/pasien/daftar'
  | '/pasien/dashboard'
  | '/login'
  | '/admin'
  | '/admin/dashboard'
  | '/admin/booking'
  | '/admin/pemilik'
  | '/admin/pasien'
  | '/admin/rekam-medis'
  | '/admin/rawat-inap'
  | '/admin/operasi'
  | '/admin/stok'
  | '/admin/laporan'
  | '/admin/pengaturan'
  | '/admin/database';

function getRouteFromLocation(): AppRoute {
  // Support both hash routing (#/admin/dashboard) and path routing (/admin/dashboard)
  const hash = window.location.hash.replace(/^#/, '');
  const candidate = hash || window.location.pathname;

  if (candidate.startsWith('/pasien/daftar')) return '/pasien/daftar';
  if (candidate.startsWith('/pasien/dashboard')) return '/pasien/dashboard';
  if (candidate.startsWith('/login')) return '/login';
  if (candidate.startsWith('/admin/laporan')) return '/admin/laporan';
  if (candidate.startsWith('/admin/pengaturan')) return '/admin/pengaturan';
  if (candidate.startsWith('/admin/pemilik')) return '/admin/pemilik';
  if (candidate.startsWith('/admin/pasien')) return '/admin/pasien';
  if (candidate.startsWith('/admin/rekam-medis')) return '/admin/rekam-medis';
  if (candidate.startsWith('/admin/rawat-inap')) return '/admin/rawat-inap';
  if (candidate.startsWith('/admin/operasi')) return '/admin/operasi';
  if (candidate.startsWith('/admin/stok')) return '/admin/stok';
  if (candidate.startsWith('/admin/booking')) return '/admin/booking';
  if (candidate.startsWith('/admin/database')) return '/admin/database';
  if (candidate.startsWith('/admin')) return '/admin/dashboard';
  return '/';
}

export function useRouter() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(getRouteFromLocation);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getRouteFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigate = useCallback((to: AppRoute) => {
    // Update hash so it works reliably in iframe sandboxes
    window.location.hash = to;
    setCurrentRoute(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return { currentRoute, navigate };
}
