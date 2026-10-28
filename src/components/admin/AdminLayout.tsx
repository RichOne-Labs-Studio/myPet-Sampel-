import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  PawPrint,
  FileText,
  Hotel,
  Package,
  Calendar,
  Clock,
  LogOut,
  Bell,
  Menu,
  X,
  ExternalLink,
  Shield,
  Stethoscope,
  RefreshCw,
  ClipboardList,
  Settings,
  AlertTriangle,
  CheckCircle2,
  CloudAlert,
  RotateCcw,
  Syringe,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { isToday } from '../../utils/dateUtils';
import { getRoleBadgeInfo, canViewRevenue } from '../../utils/authUtils';

interface Props {
  currentRoute: AppRoute;
  navigate: (to: AppRoute) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: string;
  route: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export const AdminLayout: React.FC<Props> = ({ currentRoute, navigate, children }) => {
  const {
    currentUser,
    logoutStaff,
    queues,
    inventory,
    cages,
    feedbacks,
    surgeries,
    callNotification,
    dismissCallNotification,
    resetToInitialData,
    syncStatus,
    syncFromSpreadsheet,
    triggerDataRefresh,
    lastSyncMessage,
    pendingVerifications = [],
    retryVerification,
    clearVerification,
  } = useClinic();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // Jam Real-Time 24 Jam Akurat (Zona Waktu Indonesia Barat / Asia/Jakarta)
  const [realTimeClock, setRealTimeClock] = useState(() => {
    return (
      new Date()
        .toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        .replace(/\./g, ':') + ' WIB'
    );
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setRealTimeClock(
        new Date()
          .toLocaleTimeString('id-ID', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })
          .replace(/\./g, ':') + ' WIB'
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const waitingCount = queues.filter((q) => q.status === 'Menunggu' && isToday(q.createdAt)).length;
  const criticalStockCount = inventory.filter((i) => i.stockQuantity <= i.minThreshold).length;
  const occupiedCagesCount = cages.filter((c) => c.status === 'Occupied').length;
  const activeSurgeryCount = (surgeries || []).filter((s) => s.status === 'Sedang Berlangsung' || s.status === 'Dijadwalkan').length;
  const unreadFeedbackCount = feedbacks.filter((f) => !f.isRead).length;
  const isSuperAdmin = canViewRevenue(currentUser);

  // Write verification counts
  const failedVerifications = pendingVerifications.filter((item) => item.status === 'failed');

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      route: '/admin/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: waitingCount > 0 ? `${waitingCount}` : undefined,
    },
    {
      id: 'booking',
      route: '/admin/booking',
      label: 'Jadwal Booking',
      icon: Calendar,
    },
    {
      id: 'pemilik',
      route: '/admin/pemilik',
      label: 'Data Pemilik',
      icon: Users,
    },
    {
      id: 'pasien',
      route: '/admin/pasien',
      label: 'Data Pasien',
      icon: PawPrint,
    },
    {
      id: 'rekam-medis',
      route: '/admin/rekam-medis',
      label: 'Rekam Medis (SOAP)',
      icon: FileText,
    },
    {
      id: 'rawat-inap',
      route: '/admin/rawat-inap',
      label: 'Rawat Inap (Kennel)',
      icon: Hotel,
      badge: `${occupiedCagesCount}/${cages.length}`,
    },
    {
      id: 'operasi',
      route: '/admin/operasi',
      label: 'Tindakan Operasi',
      icon: Syringe,
      badge: activeSurgeryCount > 0 ? `${activeSurgeryCount}` : undefined,
    },
    {
      id: 'stok',
      route: '/admin/stok',
      label: 'Stok Obat & BHP',
      icon: Package,
      badge: criticalStockCount > 0 ? `${criticalStockCount} Low` : undefined,
    },
    {
      id: 'laporan',
      route: '/admin/laporan',
      label: 'Laporan & Kepuasan',
      icon: ClipboardList,
      badge: unreadFeedbackCount > 0 ? `${unreadFeedbackCount}` : undefined,
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'pengaturan',
            route: '/admin/pengaturan' as AppRoute,
            label: 'Pengaturan Admin',
            icon: Settings,
          },
        ]
      : []),
  ];

  const handleLogout = () => {
    logoutStaff();
    navigate('/login');
  };

  return (
    <div id="admin-root" className="min-h-screen bg-neutral-50 text-neutral-800 flex font-sans antialiased overflow-x-hidden">
      {/* Fixed Full-Height Navigation Sidebar with independent scroll */}
      <aside
        id="admin-fixed-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-neutral-200/80 flex flex-col justify-between transition-transform duration-200 ease-in-out overflow-y-auto max-h-screen shadow-xs ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Clinic Brand & Role Badge */}
          <div className="h-16 px-5 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-fuchsia-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-fuchsia-700/25">
                <PawPrint className="w-6 h-6 fill-white/20 text-white stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="font-extrabold text-base text-neutral-900 tracking-tight flex items-center gap-1">
                  myPet
                </span>
                <p className="text-[10px] text-neutral-500 leading-tight">Sistem Manajemen Klinik Hewan Terpadu</p>
              </div>
            </div>

            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-neutral-400 hover:text-neutral-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Staff Profile Chip */}
          {(() => {
            const roleInfo = getRoleBadgeInfo(currentUser?.role);
            return (
              <div className="p-3 mx-3 mt-3 rounded-xl bg-neutral-50/90 border border-neutral-200/80 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white text-neutral-800 border border-neutral-200 flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs">
                  {currentUser?.avatar || roleInfo.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-neutral-900 truncate">{currentUser?.name || 'Administrator'}</p>
                  <div className="flex items-center gap-1 text-[10px] mt-0.5">
                    <span className={`px-1.5 py-0.2 rounded font-semibold border ${roleInfo.badgeClass}`}>
                      {roleInfo.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Main Navigation Menu */}
          <nav className="p-3 space-y-1 mt-2">
            <p className="px-3 pb-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Menu Utama
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentRoute === item.route || (item.route === '/admin/dashboard' && currentRoute === '/admin');

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    navigate(item.route);
                    setMobileOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition group ${
                    isActive
                      ? 'bg-fuchsia-50 text-fuchsia-900 font-bold border border-fuchsia-200/80 shadow-xs'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 transition ${
                        isActive ? 'text-fuchsia-700' : 'text-neutral-400 group-hover:text-neutral-600'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                        isActive
                          ? 'bg-fuchsia-200 text-fuchsia-900'
                          : item.badge.toString().includes('Low')
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-neutral-100 space-y-2">
          {/* Switch to Public Portal link */}
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition"
            title="Tampilan pendaftaran pasien"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
              <span>Portal Pasien</span>
            </span>
            <span className="text-[10px] bg-neutral-100 px-1.5 py-0.5 rounded-md text-neutral-600 font-mono">Public</span>
          </button>



          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Workspace */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header Bar */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-neutral-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-neutral-500 hover:text-neutral-900 p-1.5 rounded-lg hover:bg-neutral-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-neutral-900 tracking-tight">
                myPet
              </h1>
              <p className="text-[11px] text-neutral-500">
                Sistem Manajemen Klinik Hewan Terpadu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Write Verification Status Pill */}
            {failedVerifications.length > 0 ? (
              <button
                onClick={() => setShowVerificationModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs hover:bg-rose-100 transition animate-pulse cursor-pointer"
                title="Ada data yang belum terkonfirmasi tersimpan di Google Spreadsheet. Klik untuk cek."
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>{failedVerifications.length} Belum Terkonfirmasi</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => syncFromSpreadsheet()}
                  title="Sinkronisasi manual dengan Google Spreadsheet"
                  className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                </button>
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-neutral-50 text-neutral-600 border border-neutral-200/80 shadow-2xs select-none"
                  title={syncStatus === 'syncing' ? 'Sedang sinkronisasi data...' : 'Data tersinkronisasi'}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${syncStatus === 'syncing' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className="hidden sm:inline">{syncStatus === 'syncing' ? 'Sinkronisasi...' : 'Terhubung'}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Failed Verification Modal / Panel */}
        {showVerificationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-neutral-900">
                      Verifikasi Penyimpanan Data
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Data berikut tersimpan aman di database lokal/server, namun belum terkonfirmasi masuk ke Google Spreadsheet.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVerificationModal(false)}
                  className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-lg hover:bg-neutral-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="divide-y divide-neutral-100 max-h-72 overflow-y-auto space-y-2 pr-1">
                {failedVerifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    Semua data telah terkonfirmasi tersimpan di Google Spreadsheet.
                  </div>
                ) : (
                  failedVerifications.map((item) => (
                    <div key={item.id} className="pt-2 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-neutral-800 truncate">{item.title}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-100 text-neutral-600">
                            {item.table}
                          </span>
                        </div>
                        <p className="text-[11px] text-rose-600 mt-0.5">
                          {item.error || 'Belum terkonfirmasi di baris spreadsheet.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => retryVerification(item.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 border border-fuchsia-200 text-xs font-bold transition"
                          title="Kirim ulang ke Google Spreadsheet"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Kirim Ulang</span>
                        </button>
                        <button
                          onClick={() => clearVerification(item.id)}
                          className="px-2 py-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 text-xs"
                          title="Abaikan peringatan"
                        >
                          Abaikan
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-neutral-100 flex justify-end">
                <button
                  onClick={() => setShowVerificationModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-xs font-bold text-neutral-800 transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Call Banner if recently called */}
        {callNotification && (
          <div className="bg-fuchsia-700 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-xs animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2 font-medium">
              <Bell className="w-4 h-4 animate-bounce" />
              <span>
                Panggilan Terkirim: Tiket <strong>{callNotification.ticketNumber}</strong> ({callNotification.petName} - {callNotification.ownerName}) menuju <strong>{callNotification.room}</strong>.
              </span>
            </div>
            <button
              onClick={dismissCallNotification}
              className="text-fuchsia-100 hover:text-white text-xs font-bold px-2 py-0.5 hover:bg-fuchsia-800 rounded-md"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-neutral-50">
          {children}
        </main>

        {/* Footer */}
        <footer className="w-full border-t border-neutral-200 bg-white py-6 text-center text-xs text-neutral-400">
          <div className="max-w-4xl mx-auto px-4 flex items-center justify-center">
            <p>© 2026 myPet - Sistem Manajemen Klinik Hewan Terpadu by RichOne Labs Studio</p>
          </div>
        </footer>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-neutral-950/60 z-30 lg:hidden backdrop-blur-xs"
        />
      )}
    </div>
  );
};
