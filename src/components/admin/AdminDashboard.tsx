import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users,
  Clock,
  Hotel,
  Volume2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Activity,
  ArrowRight,
  Filter,
  PieChart,
  Sparkles,
  Calendar,
  Lock,
  Shield,
  Crown,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Phone,
  Trash2,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { formatPhoneDisplay, toWhatsappNumber } from '../../utils/phoneUtils';
import { AppRoute } from '../../navigation';
import { VisitQueue } from '../../types';
import { formatTimeOnly, isToday } from '../../utils/dateUtils';
import { canViewRevenue } from '../../utils/authUtils';
import { sanitizeCagesList } from '../../utils/cageUtils';
import { VisitTrendAnalytics } from '../analytics/VisitTrendAnalytics';
import { hasBackendServer, getAuthHeaders } from '../../database/backendSyncClient';

interface Props {
  navigate: (to: AppRoute) => void;
  onSelectPatientForSoap?: (queue: VisitQueue) => void;
}

interface ServerDashboardStats {
  demographics?: {
    total: number;
    cats: number;
    dogs: number;
    rabbits: number;
    exotics: number;
    farmAnimals: number;
  };
  kpi: {
    todayVisitsCount: number;
    totalQueuesCount: number;
    activeWaitingCount: number;
    inPoliCount: number;
    completedTodayCount: number;
    occupiedCages: number;
    totalCages: number;
    currentServingTicket: string;
    currentServingPetName: string;
  };
  serviceBreakdown: {
    countConsultation: number;
    countVaccine: number;
    countGrooming: number;
    countInpatient: number;
    countRegistrationOnly: number;
    totalServiceActivities: number;
    pctConsultation: number;
    pctVaccine: number;
    pctGrooming: number;
    pctInpatient: number;
    pctRegistrationOnly: number;
  };
  revenue: {
    totalRevenueSum: number;
    totalRevenueSellsCount: number;
    averageRevenuePerSell: number;
  };
}

export const AdminDashboard: React.FC<Props> = ({ navigate, onSelectPatientForSoap }) => {
  const {
    queues: contextQueues,
    currentServingTicket: contextCurrentServingTicket,
    callQueue,
    completeQueue,
    deleteQueue,
    cages: contextCages,
    soapRecords: contextSoapRecords,
    bookings: contextBookings,
    currentUser,
    dataVersion,
  } = useClinic();

  const handleDeleteQueue = (queueId: string) => {
    deleteQueue(queueId);
    setServerQueues((prev) => prev.filter((q) => q.id !== queueId));
  };

  // Filters for Queue Table (Murni data real-time hari ini)
  const [queueFilter, setQueueFilter] = useState<'all' | 'Menunggu' | 'Di Ruang Poli' | 'Selesai'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [queuePage, setQueuePage] = useState<number>(1);
  const queueLimit = 10;

  // Server state for paginated queues
  const [serverQueues, setServerQueues] = useState<VisitQueue[]>([]);
  const [queueTotal, setQueueTotal] = useState<number>(0);
  const [queueTotalPages, setQueueTotalPages] = useState<number>(1);
  const [queueCounts, setQueueCounts] = useState<{
    todayTotal: number;
    allTotal: number;
    activeWaiting: number;
    inPoli: number;
    completedToday: number;
  } | null>(null);
  const [isLoadingQueues, setIsLoadingQueues] = useState<boolean>(false);

  // Filters for Revenue Estimation
  const [revenueMonthFilter, setRevenueMonthFilter] = useState<string>(String(new Date().getMonth()));
  const [revenueYearFilter, setRevenueYearFilter] = useState<string>(String(new Date().getFullYear()));
  const [revenueSpecificDate, setRevenueSpecificDate] = useState<string>('');

  // Server pre-computed stats
  const [serverStats, setServerStats] = useState<ServerDashboardStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(false);

  // Debounce search input (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setQueuePage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when switching filter
  useEffect(() => {
    setQueuePage(1);
  }, [queueFilter]);

  // Fetch pre-computed stats from Backend
  const fetchDashboardStats = async () => {
    if (!hasBackendServer()) {
      setIsStatsLoading(false);
      return;
    }
    try {
      setIsStatsLoading(true);
      const params = new URLSearchParams();
      if (revenueMonthFilter !== 'all') params.append('month', revenueMonthFilter);
      if (revenueYearFilter) params.append('year', revenueYearFilter);
      if (revenueSpecificDate) params.append('date', revenueSpecificDate);

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch dashboard stats');
      const json = await res.json();
      if (json.success) {
        setServerStats(json);
      }
    } catch (err) {
      // Fallback seamlessly to local context calculation
    } finally {
      setIsStatsLoading(false);
    }
  };

  // Fetch server-paginated queues (Murni data real-time hari ini)
  const fetchServerQueues = async () => {
    if (!hasBackendServer()) {
      // Direct local computation on static hosting - strictly today only
      const todayList = contextQueues.filter((q) => isToday(q.createdAt));
      const filtered = todayList.filter((q) => {
        if (queueFilter !== 'all' && q.status !== queueFilter) return false;
        if (debouncedSearch) {
          const match =
            (q.ticketNumber && q.ticketNumber.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
            (q.petName && q.petName.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
            (q.ownerName && q.ownerName.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
            (q.ownerWhatsapp && q.ownerWhatsapp.includes(debouncedSearch)) ||
            (q.chiefComplaint && q.chiefComplaint.toLowerCase().includes(debouncedSearch.toLowerCase()));
          if (!match) return false;
        }
        return true;
      });
      const offset = (queuePage - 1) * queueLimit;
      setServerQueues(filtered.slice(offset, offset + queueLimit));
      setQueueTotal(filtered.length);
      setQueueTotalPages(Math.ceil(filtered.length / queueLimit) || 1);
      setIsLoadingQueues(false);
      return;
    }

    try {
      setIsLoadingQueues(true);
      const params = new URLSearchParams({
        page: String(queuePage),
        limit: String(queueLimit),
        scope: 'today',
        status: queueFilter,
        q: debouncedSearch,
      });

      const res = await fetch(`/api/dashboard/queues?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch queues');
      const json = await res.json();
      if (json.success) {
        setServerQueues(json.data || []);
        setQueueTotal(json.total || 0);
        setQueueTotalPages(json.totalPages || 1);
        if (json.counts) {
          setQueueCounts(json.counts);
        }
      }
    } catch (err) {
      // Fallback seamlessly to local context computation - strictly today only
      const todayList = contextQueues.filter((q) => isToday(q.createdAt));
      const filtered = todayList.filter((q) => {
        if (queueFilter !== 'all' && q.status !== queueFilter) return false;
        if (debouncedSearch) {
          const match =
            (q.ticketNumber && q.ticketNumber.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
            (q.petName && q.petName.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
            (q.ownerName && q.ownerName.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
            (q.ownerWhatsapp && q.ownerWhatsapp.includes(debouncedSearch)) ||
            (q.chiefComplaint && q.chiefComplaint.toLowerCase().includes(debouncedSearch.toLowerCase()));
          if (!match) return false;
        }
        return true;
      });
      const offset = (queuePage - 1) * queueLimit;
      setServerQueues(filtered.slice(offset, offset + queueLimit));
      setQueueTotal(filtered.length);
      setQueueTotalPages(Math.ceil(filtered.length / queueLimit) || 1);
    } finally {
      setIsLoadingQueues(false);
    }
  };

  // Trigger stats fetch when filter changes or on mount or dataVersion update
  useEffect(() => {
    fetchDashboardStats();
  }, [revenueMonthFilter, revenueYearFilter, revenueSpecificDate, dataVersion]);

  // Trigger queue fetch when dependencies or dataVersion change
  useEffect(() => {
    fetchServerQueues();
  }, [queuePage, queueFilter, debouncedSearch, contextQueues, dataVersion]);

  // Kandang fisik aktif (A1-A6 & B1-B6) tersanitasi persis seperti di panel Rawat Inap
  const activeLayoutCages = useMemo(() => {
    return sanitizeCagesList(contextCages);
  }, [contextCages]);

  const activeOccupiedCagesCount = useMemo(() => {
    return activeLayoutCages.filter((c) => c.status === 'Occupied').length;
  }, [activeLayoutCages]);

  // Fallback Local Calculations for instant zero-latency UI
  const localStats = useMemo(() => {
    const todayList = contextQueues.filter((q) => isToday(q.createdAt));
    const active = todayList.filter((q) => q.status === 'Menunggu');
    const inPoli = todayList.filter((q) => q.status === 'Di Ruang Poli');
    const completed = todayList.filter((q) => q.status === 'Selesai');
    const occCages = activeOccupiedCagesCount;

    let revenueList = contextSoapRecords;
    if (revenueMonthFilter !== 'all') {
      const targetMonth = parseInt(revenueMonthFilter, 10);
      const targetYear = parseInt(revenueYearFilter, 10);
      revenueList = revenueList.filter((r) => {
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d.getMonth() === targetMonth && d.getFullYear() === targetYear;
      });
    } else {
      const targetYear = parseInt(revenueYearFilter, 10);
      revenueList = revenueList.filter((r) => {
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d.getFullYear() === targetYear;
      });
    }

    if (revenueSpecificDate) {
      revenueList = revenueList.filter((r) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return false;
        return d.toISOString().split('T')[0] === revenueSpecificDate;
      });
    }

    const totalRev = revenueList.reduce((acc, curr) => acc + (curr.serviceFee || 0), 0);
    const revCount = revenueList.length;

    return {
      todayCount: todayList.length,
      allQueuesCount: contextQueues.length,
      activeCount: active.length,
      inPoliCount: inPoli.length,
      completedCount: completed.length,
      occupiedCages: occCages,
      totalCages: 12,
      currentServingTicket: inPoli[0]?.ticketNumber || contextCurrentServingTicket || '',
      revenueSum: totalRev,
      revenueCount: revCount,
    };
  }, [contextQueues, activeOccupiedCagesCount, contextSoapRecords, revenueMonthFilter, revenueYearFilter, revenueSpecificDate, contextCurrentServingTicket]);

  // Active KPI numbers (prefer serverStats when available, fallback to localStats)
  const todayVisitsCount = serverStats?.kpi.todayVisitsCount ?? localStats.todayCount;
  const activeQueuesCount = queueCounts?.activeWaiting ?? serverStats?.kpi.activeWaitingCount ?? localStats.activeCount;
  const inPoliQueuesCount = queueCounts?.inPoli ?? serverStats?.kpi.inPoliCount ?? localStats.inPoliCount;
  const completedQueuesCount = queueCounts?.completedToday ?? serverStats?.kpi.completedTodayCount ?? localStats.completedCount;
  const totalAllQueuesCount = queueCounts?.allTotal ?? serverStats?.kpi.totalQueuesCount ?? localStats.allQueuesCount;
  const todayTotalQueuesCount = queueCounts?.todayTotal ?? serverStats?.kpi.todayVisitsCount ?? localStats.todayCount;
  // Rawat inap selalu sinkron 100% secara real-time dengan 12 kandang fisik aktif
  const occupiedCages = activeOccupiedCagesCount;
  const totalCages = 12;
  const servingTicket = serverStats?.kpi.currentServingTicket || localStats.currentServingTicket;
  const totalRevenueSum = serverStats?.revenue.totalRevenueSum ?? localStats.revenueSum;
  const totalRevenueCount = serverStats?.revenue.totalRevenueSellsCount ?? localStats.revenueCount;

  const handleCallPoli = (queue: VisitQueue) => {
    const callerName = currentUser?.name ? `Poli 1 (${currentUser.name})` : 'Poli 1';
    callQueue(queue.id, callerName);
    // Optimistic fast update
    setTimeout(() => {
      fetchServerQueues();
      fetchDashboardStats();
    }, 150);
  };

  const handleCompleteQueue = (queueId: string) => {
    completeQueue(queueId);
    // Optimistic fast update
    setTimeout(() => {
      fetchServerQueues();
      fetchDashboardStats();
    }, 150);
  };

  const handleOpenSoap = (queue: VisitQueue) => {
    if (onSelectPatientForSoap) {
      onSelectPatientForSoap(queue);
    }
    navigate('/admin/rekam-medis');
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome / Header info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <span>Ringkasan Operasional Hari Ini</span>
            <span className="text-xs font-mono font-semibold bg-fuchsia-100 text-fuchsia-800 px-2.5 py-0.5 rounded-full border border-fuchsia-200">
              Live Real-Time
            </span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pusat pemantauan antrean, rawat inap, dan aktivitas medis klinik hewan
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 font-medium">Poli Sedang Melayani:</span>
          <span className="text-sm font-mono font-black text-fuchsia-800 bg-white px-3 py-1.5 rounded-xl border border-neutral-200 shadow-xs">
            {servingTicket || 'Belum Ada'}
          </span>
        </div>
      </div>

      {/* 3 KPI METRIC CARDS */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {/* Total Visits Today */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-neutral-500 truncate">Total Kunjungan</span>
            <div className="w-7 h-7 sm:w-9 h-9 rounded-lg sm:rounded-xl bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <p className="text-lg sm:text-2xl font-black text-neutral-900 font-mono">{todayVisitsCount}</p>
            <p className="text-[10px] sm:text-[11px] text-fuchsia-700 flex items-center gap-0.5 sm:gap-1 mt-0.5 font-medium truncate">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="truncate">Hari ini (Total {totalAllQueuesCount})</span>
            </p>
          </div>
        </div>

        {/* Current Active Queues */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-neutral-500 truncate">Antrean Poli</span>
            <div className="w-7 h-7 sm:w-9 h-9 rounded-lg sm:rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
              <p className="text-lg sm:text-2xl font-black text-amber-600 font-mono">{activeQueuesCount}</p>
              <span className="text-[10px] sm:text-xs text-neutral-500 truncate">antre</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-0.5 truncate">
              Est. ~{activeQueuesCount * 12}m
            </p>
          </div>
        </div>

        {/* Inpatient Occupancy */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-neutral-500 truncate">Rawat Inap</span>
            <div className="w-7 h-7 sm:w-9 h-9 rounded-lg sm:rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
              <Hotel className="w-3.5 h-3.5 sm:w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="flex items-baseline gap-1 sm:gap-2">
              <p className="text-lg sm:text-2xl font-black text-sky-600 font-mono">{occupiedCages}/{totalCages}</p>
              <span className="text-[10px] sm:text-xs text-neutral-500 truncate">kdng</span>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 sm:h-2 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(occupiedCages / totalCages) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* LIVE UPDATING QUEUE TABLE (SERVER-SIDE PAGINATED & FAST SEARCH - HARI INI REAL-TIME) */}
      <div id="admin-live-queue-table" className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Tabel Antrean Pasien Live (Hari Ini)</span>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
                Real-Time Hari Ini
              </span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Murni menggambarkan tabel antrean eksisting hari ini secara real-time. Pasien yang mendaftar via portal langsung tampil di sini.
            </p>
          </div>

          {/* Search bar & Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Search */}
            <div className="relative min-w-[160px] sm:min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari tiket / pasien..."
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-600"
              />
            </div>

            {/* Status filters */}
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200/80">
              {(
                [
                  { id: 'all', label: `Semua (${todayTotalQueuesCount})` },
                  { id: 'Menunggu', label: `Antre (${activeQueuesCount})` },
                  { id: 'Di Ruang Poli', label: `Di Poli (${inPoliQueuesCount})` },
                  { id: 'Selesai', label: `Selesai (${completedQueuesCount})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setQueueFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    queueFilter === f.id
                      ? 'bg-white text-fuchsia-900 font-bold shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dense Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-700">
            <thead className="bg-neutral-50/80 text-neutral-500 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-200/80">
              <tr>
                <th className="px-4 py-3">Tiket</th>
                <th className="px-4 py-3">Pasien / Pemilik</th>
                <th className="px-4 py-3">Spesies & Ras</th>
                <th className="px-4 py-3">Layanan & Keluhan</th>
                <th className="px-4 py-3">Waktu Masuk</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoadingQueues ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-neutral-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-fuchsia-700" />
                      <span>Memuat antrean...</span>
                    </div>
                  </td>
                </tr>
              ) : serverQueues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                    Tidak ada antrean dalam kategori ini.
                  </td>
                </tr>
              ) : (
                serverQueues.map((q) => {
                  const isCurrent = q.status === 'Di Ruang Poli';

                  return (
                    <tr
                      key={q.id}
                      className={`hover:bg-neutral-50/80 transition ${
                        isCurrent ? 'bg-fuchsia-50/50 border-l-2 border-l-fuchsia-600' : ''
                      }`}
                    >
                      {/* Ticket */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-sm text-fuchsia-900 bg-fuchsia-50 px-2.5 py-1 rounded-lg border border-fuchsia-200 shadow-2xs">
                          {q.ticketNumber}
                        </span>
                      </td>

                      {/* Pet & Owner */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>{q.petName}</span>
                          {isCurrent && <span className="text-[10px] bg-fuchsia-100 text-fuchsia-800 font-semibold px-1.5 rounded-sm">SEDANG DIPERIKSA</span>}
                        </div>
                        <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-x-1.5">
                          <span>{q.ownerName}</span>
                          {q.ownerWhatsapp ? (
                            <a
                              href={`https://wa.me/${toWhatsappNumber(q.ownerWhatsapp)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 hover:underline font-mono font-bold text-[10px]"
                              title="Hubungi lewat WhatsApp"
                            >
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span>{formatPhoneDisplay(q.ownerWhatsapp)}</span>
                            </a>
                          ) : (
                            <span className="text-neutral-400 font-mono">-</span>
                          )}
                        </div>
                      </td>

                      {/* Species */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">
                            {q.petType === 'Cat' ? '🐱' : q.petType === 'Dog' ? '🐶' : q.petType === 'Rabbit' ? '🐰' : '🦜'}
                          </span>
                          <span className="font-medium text-neutral-800">{q.petType}</span>
                        </div>
                      </td>

                      {/* Service & Complaint */}
                      <td className="px-4 py-3 max-w-xs">
                        <span className="inline-block text-[10px] font-semibold bg-neutral-100 border border-neutral-200 text-neutral-700 px-2 py-0.5 rounded-md mb-1">
                          {q.serviceType}
                        </span>
                        <p className="text-[11px] text-neutral-600 truncate" title={q.chiefComplaint}>
                          {q.chiefComplaint}
                        </p>
                      </td>

                      {/* Time */}
                      <td className="px-4 py-3 font-mono text-[11px] text-neutral-600 whitespace-nowrap">
                        <div>{formatTimeOnly(q.createdAt)}</div>
                        {!isToday(q.createdAt) && (
                          <span className="inline-block text-[9px] bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded font-sans font-medium mt-0.5">
                            Tanggal Lalu
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            q.status === 'Di Ruang Poli'
                              ? 'bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300 animate-pulse'
                              : q.status === 'Selesai'
                              ? 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              q.status === 'Di Ruang Poli'
                                ? 'bg-fuchsia-600'
                                : q.status === 'Selesai'
                                ? 'bg-neutral-400'
                                : 'bg-amber-500'
                            }`}
                          />
                          {q.status}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* [ Panggil ke Poli ] */}
                          {q.status === 'Menunggu' && (
                            <button
                              id={`btn-call-queue-${q.ticketNumber}`}
                              onClick={() => handleCallPoli(q)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition"
                              title="Panggil pasien masuk ke poli"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Panggil Poli</span>
                            </button>
                          )}

                          {/* [ Rekam Medis ] */}
                          <button
                            onClick={() => handleOpenSoap(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold border border-neutral-200 transition"
                            title="Tulis SOAP & Resep untuk pasien ini"
                          >
                            <FileText className="w-3.5 h-3.5 text-fuchsia-700" />
                            <span className="hidden sm:inline">SOAP</span>
                          </button>

                          {/* [ Selesai ] */}
                          {q.status === 'Di Ruang Poli' && (
                            <button
                              onClick={() => handleCompleteQueue(q.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-900 text-xs font-semibold border border-fuchsia-200 transition"
                              title="Tandai antrean selesai"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-fuchsia-700" />
                              <span>Selesai</span>
                            </button>
                          )}

                          {/* [ Batalkan / Hapus Antrean ] */}
                          <button
                            id={`btn-cancel-queue-${q.ticketNumber}`}
                            onClick={() => {
                              if (confirm(`Apakah Anda yakin ingin membatalkan & menghapus antrean tiket ${q.ticketNumber} (${q.petName})?`)) {
                                handleDeleteQueue(q.id);
                              }
                            }}
                            className="inline-flex items-center justify-center p-1.5 rounded-xl text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition border border-transparent hover:border-rose-200"
                            title="Batalkan & hapus pendaftaran antrean"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        {queueTotal > 0 && (
          <div className="p-3 sm:p-4 bg-neutral-50/70 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-xs text-neutral-500">
              Menampilkan <span className="font-semibold text-neutral-800">{serverQueues.length}</span> dari{' '}
              <span className="font-semibold text-neutral-800">{queueTotal}</span> antrean
            </div>

            {queueTotalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={queuePage <= 1}
                  onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="px-2 text-xs font-mono font-bold text-neutral-700">
                  {queuePage} / {queueTotalPages}
                </span>
                <button
                  disabled={queuePage >= queueTotalPages}
                  onClick={() => setQueuePage((p) => Math.min(queueTotalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DYNAMIC CHARTS & VISIT TREND ANALYTICS */}
      <VisitTrendAnalytics serverDemographics={serverStats?.demographics} />

      {/* PANEL ESTIMASI PENDAPATAN LAYANAN (DENGAN FILTER TANGGAL & BULAN) */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
          <div>
            <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Estimasi Pendapatan Layanan (SOAP)</span>
              {canViewRevenue(currentUser) ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  <Crown className="w-3 h-3 text-amber-600" />
                  Super Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                  <Lock className="w-3 h-3 text-neutral-500" />
                  Akses Terbatas
                </span>
              )}
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {canViewRevenue(currentUser)
                ? 'Analisis pendapatan berdasarkan tarif service fee pemeriksaan rekam medis.'
                : 'Ringkasan jumlah tindakan medis klinik. Rekapitulasi omset dan nilai rupiah hanya dapat dilihat oleh Super Admin / Owner.'}
            </p>
          </div>

          {/* FILTER BULAN DAN TANGGAL (Hanya untuk Super Admin) */}
          {canViewRevenue(currentUser) && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Bulan */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Bulan:</span>
                <select
                  value={revenueMonthFilter}
                  onChange={(e) => setRevenueMonthFilter(e.target.value)}
                  className="bg-neutral-50 border border-neutral-300 text-neutral-800 text-xs font-bold rounded-lg px-2 py-1 focus:ring-1 focus:ring-fuchsia-500 cursor-pointer"
                >
                  <option value="all">Semua Bulan</option>
                  <option value="0">Januari</option>
                  <option value="1">Februari</option>
                  <option value="2">Maret</option>
                  <option value="3">April</option>
                  <option value="4">Mei</option>
                  <option value="5">Juni</option>
                  <option value="6">Juli</option>
                  <option value="7">Agustus</option>
                  <option value="8">September</option>
                  <option value="9">Oktober</option>
                  <option value="10">November</option>
                  <option value="11">Desember</option>
                </select>
              </div>

              {/* Filter Tanggal Spesifik */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Tanggal:</span>
                <input
                  type="date"
                  value={revenueSpecificDate}
                  onChange={(e) => setRevenueSpecificDate(e.target.value)}
                  className="bg-neutral-50 border border-neutral-300 text-neutral-800 text-xs font-bold rounded-lg px-2 py-0.5 focus:ring-1 focus:ring-fuchsia-500 cursor-pointer font-mono"
                />
                {revenueSpecificDate && (
                  <button
                    type="button"
                    onClick={() => setRevenueSpecificDate('')}
                    className="text-[10px] text-rose-600 hover:underline font-bold"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* REVENUE SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="bg-neutral-50/60 rounded-xl p-4 border border-neutral-200/50 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">Total Pemeriksaan SOAP</span>
              <span className="text-xl font-black text-neutral-800 font-mono mt-1 block">
                {totalRevenueCount} <span className="text-xs font-sans text-neutral-500 font-normal">Sesi</span>
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200 flex items-center justify-center text-fuchsia-700">
              <FileText className="w-4 h-4" />
            </div>
          </div>

          {canViewRevenue(currentUser) ? (
            <div className="bg-emerald-50/40 rounded-xl p-4 border border-emerald-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold block">Estimasi Pendapatan Layanan</span>
                <span className="text-xl font-black text-emerald-700 font-mono mt-1 block">
                  Rp {totalRevenueSum.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-700">
                <span className="text-xs font-bold">Rp</span>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200 flex items-center justify-between">
              <div className="pr-2">
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">Estimasi Pendapatan Layanan</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs font-bold text-neutral-500">
                    Akses Khusus Superadmin / Owner
                  </span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400">
                <Lock className="w-4 h-4" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
