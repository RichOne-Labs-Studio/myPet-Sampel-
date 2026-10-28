import React, { useState, useMemo } from 'react';
import { useClinic } from '../../context/ClinicContext';
import {
  TrendingUp,
  Calendar,
  Filter,
  BarChart3,
  Activity,
  CheckCircle2,
  Users,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
} from 'lucide-react';
import { normalizePetType, getPetTypeIndonesian, getPetEmoji } from '../../utils/petUtils';

interface VisitTrendAnalyticsProps {
  initialYear?: number | 'all';
  initialMonth?: number | 'all';
  showTitle?: boolean;
  compact?: boolean;
  serverDemographics?: {
    total: number;
    cats: number;
    dogs: number;
    rabbits: number;
    exotics: number;
    farmAnimals: number;
  };
}

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ags',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export const VisitTrendAnalytics: React.FC<VisitTrendAnalyticsProps> = ({
  initialYear,
  initialMonth = 'all',
  showTitle = true,
  compact = false,
  serverDemographics,
}) => {
  const { queues, soapRecords, bookings, pets } = useClinic();

  const currentRealYear = new Date().getFullYear();
  const currentRealMonth = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState<number | 'all'>(initialYear || currentRealYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(initialMonth);
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedPetType, setSelectedPetType] = useState<string>('all');

  // Helper untuk parsing tanggal dari format ISO atau format lokal (cth: "2025-05-12", "12/05/2025 14:00 WIB", dll)
  const parseRecordDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    const str = String(dateStr).trim();

    // 1. Format ISO: "2025-05-12" atau "2025-05-12T10:00:00"
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
    }

    // 2. Format lokal: "12/05/2025" atau "12/05/2025 14:00 WIB"
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      return new Date(parseInt(slashMatch[3], 10), parseInt(slashMatch[2], 10) - 1, parseInt(slashMatch[1], 10));
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    return null;
  };

  // Ekstrak daftar tahun yang ada di database secara otomatis
  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    yearSet.add(currentRealYear);

    // Scan dari antrean (termasuk yang sudah selesai)
    queues.forEach((q) => {
      const d = parseRecordDate(q.createdAt || q.completedAt);
      if (d) yearSet.add(d.getFullYear());
    });

    // Scan dari rekam medis
    soapRecords.forEach((s) => {
      const d = parseRecordDate(s.date);
      if (d) yearSet.add(d.getFullYear());
    });

    // Scan dari booking
    bookings.forEach((b) => {
      const d = parseRecordDate(b.date);
      if (d) yearSet.add(d.getFullYear());
    });

    // Scan dari pet registration
    pets.forEach((p) => {
      const d = parseRecordDate(p.registeredAt);
      if (d) yearSet.add(d.getFullYear());
    });

    return Array.from(yearSet).sort((a, b) => b - a);
  }, [queues, soapRecords, bookings, pets, currentRealYear]);

  // Urutan tahun kronologis (ascending) untuk grafik multi-tahun
  const availableYearsAsc = useMemo(() => {
    return [...availableYears].sort((a, b) => a - b);
  }, [availableYears]);

  // Konsolidasikan semua record kunjungan dari database
  const consolidatedVisits = useMemo(() => {
    interface UnifiedVisit {
      id: string;
      source: 'queue' | 'soap' | 'booking';
      date: Date;
      year: number;
      month: number;
      day: number;
      serviceType: string;
      petType: string;
      status: string;
      isCompleted: boolean;
      ticketNumber?: string;
      ownerName?: string;
      petName?: string;
    }

    const list: UnifiedVisit[] = [];
    const seenQueueIds = new Set<string>();

    const petMapById = new Map<string, any>();
    const petMapByName = new Map<string, any>();
    (pets || []).forEach((p) => {
      if (p.id) petMapById.set(p.id, p);
      if (p.name) petMapByName.set(String(p.name).toLowerCase().trim(), p);
    });

    // 1. Ambil dari seluruh data antrean di database (baik Selesai, Menunggu, dll)
    queues.forEach((q) => {
      const d = parseRecordDate(q.createdAt || q.completedAt) || new Date();
      seenQueueIds.add(q.id);

      const resolvedPetType = normalizePetType(
        q.petType,
        `${q.petName || ''} ${q.chiefComplaint || ''}`
      );

      list.push({
        id: q.id,
        source: 'queue',
        date: d,
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        serviceType: q.serviceType || 'Consultation',
        petType: resolvedPetType,
        status: q.status || 'Selesai',
        isCompleted: q.status === 'Selesai',
        ticketNumber: q.ticketNumber,
        ownerName: q.ownerName,
        petName: q.petName,
      });
    });

    // 2. Ambil dari SOAP yang belum terikat ke queue (misal rekam medis direct)
    soapRecords.forEach((s) => {
      if (s.queueId && seenQueueIds.has(s.queueId)) return;
      const d = parseRecordDate(s.date) || new Date();

      const linkedPet = s.petId
        ? petMapById.get(String(s.petId))
        : s.petName
        ? petMapByName.get(String(s.petName).toLowerCase().trim())
        : null;

      const resolvedPetType = linkedPet
        ? normalizePetType(
            linkedPet.type,
            `${linkedPet.name || s.petName || ''} ${linkedPet.breed || ''} ${linkedPet.notes || ''}`
          )
        : normalizePetType('', `${s.petName || ''} ${s.soap?.subjective || ''} ${s.notes || ''}`);

      list.push({
        id: s.id,
        source: 'soap',
        date: d,
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        serviceType: 'Consultation',
        petType: resolvedPetType,
        status: 'Selesai',
        isCompleted: true,
        petName: s.petName,
        ownerName: s.ownerName,
      });
    });

    return list;
  }, [queues, soapRecords, pets]);

  // Filter kunjungan berdasarkan Tahun, Bulan, Layanan, dan Jenis Hewan
  const filteredVisits = useMemo(() => {
    return consolidatedVisits.filter((v) => {
      if (selectedYear !== 'all' && v.year !== selectedYear) return false;
      if (selectedMonth !== 'all' && v.month !== selectedMonth) return false;
      if (selectedService !== 'all' && v.serviceType !== selectedService) return false;
      if (selectedPetType !== 'all' && v.petType !== selectedPetType) return false;
      return true;
    });
  }, [consolidatedVisits, selectedYear, selectedMonth, selectedService, selectedPetType]);

  // Hitung data tren: Mode Semua Tahun (Year-over-Year) ATAU Mode 12 Bulan (Jan - Des) ATAU Mode Harian (1 - 31)
  const chartData = useMemo(() => {
    if (selectedYear === 'all') {
      // Mode Semua Tahun (Perbandingan perkembangan tiap tahun)
      const yearlyBuckets = availableYearsAsc.map((yr) => {
        const visitsInYear = consolidatedVisits.filter(
          (v) =>
            v.year === yr &&
            (selectedMonth === 'all' || v.month === selectedMonth) &&
            (selectedService === 'all' || v.serviceType === selectedService) &&
            (selectedPetType === 'all' || v.petType === selectedPetType)
        );

        const consultation = visitsInYear.filter((v) => v.serviceType === 'Consultation').length;
        const vaccine = visitsInYear.filter((v) => v.serviceType === 'Vaccine').length;
        const grooming = visitsInYear.filter((v) => v.serviceType === 'Grooming').length;
        const hotel = visitsInYear.filter((v) => v.serviceType === 'Hotel').length;
        const daftar = visitsInYear.filter((v) => v.serviceType === 'Daftar').length;
        const completed = visitsInYear.filter((v) => v.isCompleted).length;

        return {
          label: `${yr}`,
          fullLabel: selectedMonth === 'all' ? `Tahun ${yr}` : `${MONTH_NAMES[selectedMonth]} ${yr}`,
          year: yr,
          total: visitsInYear.length,
          completed,
          consultation,
          vaccine,
          grooming,
          hotel,
          daftar,
          isCurrent: yr === currentRealYear,
        };
      });

      const maxVal = Math.max(1, ...yearlyBuckets.map((b) => b.total));
      return { mode: 'all-years' as const, items: yearlyBuckets, maxVal };
    } else if (selectedMonth === 'all') {
      // Mode 12 Bulan pada satu tahun terpilih
      const monthlyBuckets = Array.from({ length: 12 }, (_, mIdx) => {
        const visitsInMonth = consolidatedVisits.filter(
          (v) =>
            v.year === selectedYear &&
            v.month === mIdx &&
            (selectedService === 'all' || v.serviceType === selectedService) &&
            (selectedPetType === 'all' || v.petType === selectedPetType)
        );

        const consultation = visitsInMonth.filter((v) => v.serviceType === 'Consultation').length;
        const vaccine = visitsInMonth.filter((v) => v.serviceType === 'Vaccine').length;
        const grooming = visitsInMonth.filter((v) => v.serviceType === 'Grooming').length;
        const hotel = visitsInMonth.filter((v) => v.serviceType === 'Hotel').length;
        const daftar = visitsInMonth.filter((v) => v.serviceType === 'Daftar').length;
        const completed = visitsInMonth.filter((v) => v.isCompleted).length;

        return {
          label: MONTH_SHORT[mIdx],
          fullLabel: `${MONTH_NAMES[mIdx]} ${selectedYear}`,
          monthIndex: mIdx,
          total: visitsInMonth.length,
          completed,
          consultation,
          vaccine,
          grooming,
          hotel,
          daftar,
          isCurrent: selectedYear === currentRealYear && mIdx === currentRealMonth,
        };
      });

      const maxVal = Math.max(1, ...monthlyBuckets.map((b) => b.total));
      return { mode: 'yearly' as const, items: monthlyBuckets, maxVal };
    } else {
      // Mode Harian dalam bulan terpilih
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const dailyBuckets = Array.from({ length: daysInMonth }, (_, dIdx) => {
        const dayNum = dIdx + 1;
        const visitsInDay = consolidatedVisits.filter(
          (v) =>
            v.year === selectedYear &&
            v.month === selectedMonth &&
            v.day === dayNum &&
            (selectedService === 'all' || v.serviceType === selectedService) &&
            (selectedPetType === 'all' || v.petType === selectedPetType)
        );

        const consultation = visitsInDay.filter((v) => v.serviceType === 'Consultation').length;
        const vaccine = visitsInDay.filter((v) => v.serviceType === 'Vaccine').length;
        const grooming = visitsInDay.filter((v) => v.serviceType === 'Grooming').length;
        const hotel = visitsInDay.filter((v) => v.serviceType === 'Hotel').length;
        const completed = visitsInDay.filter((v) => v.isCompleted).length;

        return {
          label: `${dayNum}`,
          fullLabel: `Tgl ${dayNum} ${MONTH_NAMES[selectedMonth]} ${selectedYear}`,
          dayNum,
          total: visitsInDay.length,
          completed,
          consultation,
          vaccine,
          grooming,
          hotel,
          isCurrent:
            selectedYear === currentRealYear &&
            selectedMonth === currentRealMonth &&
            dayNum === new Date().getDate(),
        };
      });

      const maxVal = Math.max(1, ...dailyBuckets.map((b) => b.total));
      return { mode: 'monthly' as const, items: dailyBuckets, maxVal };
    }
  }, [
    consolidatedVisits,
    selectedYear,
    selectedMonth,
    selectedService,
    selectedPetType,
    currentRealYear,
    currentRealMonth,
    availableYearsAsc,
  ]);

  // Demografi Seluruh Pasien Terdaftar Klinik (Basis Data Pasien)
  const registeredDemographics = useMemo(() => {
    if (serverDemographics && serverDemographics.total > 0) {
      return serverDemographics;
    }
    const list = pets || [];
    let cats = 0;
    let dogs = 0;
    let rabbits = 0;
    let exotics = 0;
    let farmAnimals = 0;

    list.forEach((p) => {
      const norm = normalizePetType(p.type, `${p.name || ''} ${p.breed || ''} ${p.notes || ''}`);
      if (norm === 'Cat') cats++;
      else if (norm === 'Dog') dogs++;
      else if (norm === 'Rabbit') rabbits++;
      else if (norm === 'Exotic') exotics++;
      else if (norm === 'Farm Animal') farmAnimals++;
      else cats++;
    });

    const total = list.length;
    return {
      total,
      cats,
      dogs,
      rabbits,
      exotics,
      farmAnimals,
    };
  }, [pets, serverDemographics]);

  // Statistik Ringkasan
  const stats = useMemo(() => {
    const total = filteredVisits.length;
    const completed = filteredVisits.filter((v) => v.isCompleted).length;
    const consultation = filteredVisits.filter((v) => v.serviceType === 'Consultation').length;
    const vaccine = filteredVisits.filter((v) => v.serviceType === 'Vaccine').length;
    const grooming = filteredVisits.filter((v) => v.serviceType === 'Grooming').length;
    const hotel = filteredVisits.filter((v) => v.serviceType === 'Hotel').length;

    const cats = filteredVisits.filter((v) => v.petType === 'Cat').length;
    const dogs = filteredVisits.filter((v) => v.petType === 'Dog').length;
    const rabbits = filteredVisits.filter((v) => v.petType === 'Rabbit').length;
    const exotics = filteredVisits.filter((v) => v.petType === 'Exotic').length;
    const farmAnimals = filteredVisits.filter((v) => v.petType === 'Farm Animal').length;
    const others = total - cats - dogs - rabbits - exotics - farmAnimals;

    // Perbandingan dengan periode sebelumnya
    let prevTotal = 0;
    if (selectedYear === 'all') {
      const lastYr = availableYearsAsc[availableYearsAsc.length - 1] || currentRealYear;
      const prevYr = availableYearsAsc[availableYearsAsc.length - 2] || (lastYr - 1);
      const currentYearTotal = consolidatedVisits.filter((v) => v.year === lastYr).length;
      prevTotal = consolidatedVisits.filter((v) => v.year === prevYr).length;
      const growthPct =
        prevTotal > 0 ? Math.round(((currentYearTotal - prevTotal) / prevTotal) * 100) : currentYearTotal > 0 ? 100 : 0;
      return {
        total,
        completed,
        consultation,
        vaccine,
        grooming,
        hotel,
        cats,
        dogs,
        rabbits,
        exotics,
        farmAnimals,
        others,
        prevTotal,
        growthPct,
      };
    } else if (selectedMonth === 'all') {
      prevTotal = consolidatedVisits.filter((v) => v.year === (selectedYear as number) - 1).length;
    } else {
      const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYearVal = selectedMonth === 0 ? (selectedYear as number) - 1 : selectedYear;
      prevTotal = consolidatedVisits.filter(
        (v) => v.year === prevYearVal && v.month === prevMonthIdx
      ).length;
    }

    const growthPct =
      prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : total > 0 ? 100 : 0;

    return {
      total,
      completed,
      consultation,
      vaccine,
      grooming,
      hotel,
      cats,
      dogs,
      rabbits,
      exotics,
      farmAnimals,
      others,
      prevTotal,
      growthPct,
    };
  }, [filteredVisits, consolidatedVisits, selectedYear, selectedMonth, availableYearsAsc, currentRealYear]);

  const activePeriodText =
    selectedYear === 'all'
      ? selectedMonth === 'all'
        ? 'Semua Tahun (Tren Perkembangan Tahunan)'
        : `Semua Tahun - Bulan ${MONTH_NAMES[selectedMonth]}`
      : selectedMonth === 'all'
      ? `Sepanjang Tahun ${selectedYear}`
      : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {showTitle && (
            <div>
              <h3 className="text-base sm:text-lg font-bold text-neutral-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-fuchsia-700" />
                <span>Grafik & Analisis Tren Kunjungan Pasien</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Ditarik otomatis dari database riwayat antrean, rekam medis, dan pelayanan klinik.
              </p>
            </div>
          )}

          {/* Interactive Filters Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Tahun */}
            <div className="flex items-center gap-1.5 bg-neutral-50 p-1.5 rounded-xl border border-neutral-200">
              <Calendar className="w-3.5 h-3.5 text-neutral-500 ml-1" />
              <span className="text-[11px] font-bold text-neutral-600">Tahun:</span>
              <select
                id="filter-trend-year"
                value={selectedYear}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedYear(val === 'all' ? 'all' : parseInt(val, 10));
                }}
                className="text-xs font-bold text-neutral-900 bg-white px-2.5 py-1 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
              >
                <option value="all">Semua Tahun</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Bulan */}
            <div className="flex items-center gap-1.5 bg-neutral-50 p-1.5 rounded-xl border border-neutral-200">
              <Filter className="w-3.5 h-3.5 text-neutral-500 ml-1" />
              <span className="text-[11px] font-bold text-neutral-600">Bulan:</span>
              <select
                id="filter-trend-month"
                value={selectedMonth}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMonth(val === 'all' ? 'all' : parseInt(val, 10));
                }}
                className="text-xs font-bold text-neutral-900 bg-white px-2.5 py-1 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
              >
                <option value="all">Semua Bulan (Jan - Des)</option>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Layanan */}
            <div className="flex items-center gap-1.5 bg-neutral-50 p-1.5 rounded-xl border border-neutral-200">
              <span className="text-[11px] font-bold text-neutral-600 ml-1">Layanan:</span>
              <select
                id="filter-trend-service"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="text-xs font-semibold text-neutral-800 bg-white px-2.5 py-1 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
              >
                <option value="all">Semua Layanan</option>
                <option value="Consultation">🩺 Konsultasi / Poli</option>
                <option value="Vaccine">💉 Vaksinasi</option>
                <option value="Grooming">✂️ Grooming & Spa</option>
                <option value="Hotel">🏨 Rawat Inap / Hotel</option>
                <option value="Daftar">📝 Registrasi Saja</option>
              </select>
            </div>

            {/* Filter Hewan */}
            <div className="flex items-center gap-1.5 bg-neutral-50 p-1.5 rounded-xl border border-neutral-200">
              <span className="text-[11px] font-bold text-neutral-600 ml-1">Hewan:</span>
              <select
                id="filter-trend-pet-type"
                value={selectedPetType}
                onChange={(e) => setSelectedPetType(e.target.value)}
                className="text-xs font-semibold text-neutral-800 bg-white px-2.5 py-1 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
              >
                <option value="all">Semua Jenis</option>
                <option value="Cat">🐱 Kucing</option>
                <option value="Dog">🐶 Anjing</option>
                <option value="Rabbit">🐰 Kelinci</option>
                <option value="Exotic">🦜 Eksotik</option>
                <option value="Farm Animal">🐄 Hewan Ternak</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick Month Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 mt-4 border-t border-neutral-100 no-scrollbar">
          <span className="text-[11px] font-bold text-neutral-400 shrink-0 mr-1">Pilih Cepat:</span>
          <button
            onClick={() => setSelectedMonth('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
              selectedMonth === 'all'
                ? 'bg-fuchsia-700 text-white shadow-xs'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Semua Bulan
          </button>
          {MONTH_NAMES.map((name, idx) => {
            const isSelected = selectedMonth === idx;
            const isCurrent = selectedYear === currentRealYear && idx === currentRealMonth;
            return (
              <button
                key={idx}
                onClick={() => setSelectedMonth(idx)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer flex items-center gap-1 ${
                  isSelected
                    ? 'bg-fuchsia-700 text-white font-bold shadow-xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <span>{MONTH_SHORT[idx]}</span>
                {isCurrent && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-fuchsia-600'}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Total Kunjungan</span>
            <div className="p-2 rounded-xl bg-fuchsia-50 text-fuchsia-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900 font-mono mt-2">{stats.total}</p>
          <div className="flex items-center gap-1 text-[11px] mt-1">
            {stats.growthPct >= 0 ? (
              <span className="text-emerald-700 font-bold flex items-center">
                <ArrowUpRight className="w-3 h-3" />+{stats.growthPct}%
              </span>
            ) : (
              <span className="text-rose-600 font-bold flex items-center">
                <ArrowDownRight className="w-3 h-3" />
                {stats.growthPct}%
              </span>
            )}
            <span className="text-neutral-400">vs periode lalu</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Selesai Dilayani</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-2">{stats.completed}</p>
          <p className="text-[11px] text-neutral-500 mt-1">
            {stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}% tingkat selesai` : '0%'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Poli / Konsultasi</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-700">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-sky-800 font-mono mt-2">{stats.consultation}</p>
          <p className="text-[11px] text-neutral-500 mt-1">
            {stats.vaccine} vaksin • {stats.grooming} grooming
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-neutral-500">Demografi Pasien Terdaftar</span>
              <span className="text-[10px] text-neutral-400 block">Total: {registeredDemographics.total.toLocaleString('id-ID')} Pasien</span>
            </div>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <PieChart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center flex-wrap gap-1.5 text-xs font-mono font-bold text-neutral-800">
              <span className="inline-flex items-center gap-1 bg-fuchsia-50 text-fuchsia-800 px-2 py-0.5 rounded-lg border border-fuchsia-200" title="Kucing">
                🐱 {registeredDemographics.cats}
              </span>
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-lg border border-amber-200" title="Anjing">
                🐶 {registeredDemographics.dogs}
              </span>
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-200" title="Kelinci">
                🐰 {registeredDemographics.rabbits}
              </span>
              <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 px-2 py-0.5 rounded-lg border border-sky-200" title="Eksotik">
                🦜 {registeredDemographics.exotics}
              </span>
              {registeredDemographics.farmAnimals > 0 && (
                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 px-2 py-0.5 rounded-lg border border-rose-200" title="Ternak">
                  🐄 {registeredDemographics.farmAnimals}
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1.5 truncate">
              {stats.total > 0
                ? `Kunjungan Periode Ini: ${stats.cats} 🐱 • ${stats.dogs} 🐶${
                    stats.rabbits + stats.exotics + stats.farmAnimals > 0
                      ? ` • ${stats.rabbits + stats.exotics + stats.farmAnimals} Lainnya`
                      : ''
                  }`
                : `${Math.round((registeredDemographics.cats / (registeredDemographics.total || 1)) * 100)}% Kucing • ${registeredDemographics.dogs} Anjing • ${registeredDemographics.rabbits} Kelinci`}
            </p>
          </div>
        </div>
      </div>

      {/* Main Trend Bar Chart Visualization */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-neutral-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold text-neutral-900">
                Visualisasi Tren Volume Kunjungan
              </h4>
              <span className="text-xs font-mono font-bold bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200 px-2.5 py-0.5 rounded-full">
                {activePeriodText}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              {chartData.mode === 'all-years'
                ? `Perbandingan tren perkembangan volume kunjungan dari tahun ke tahun (${availableYearsAsc.join(' - ')})`
                : chartData.mode === 'yearly'
                ? 'Perkembangan kunjungan setiap bulan (Januari s/d Desember)'
                : `Perkembangan kunjungan harian tanggal 1 s/d ${chartData.items.length}`}
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-fuchsia-700" />
              <span className="text-neutral-600 font-medium">Konsultasi / Poli</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-sky-500" />
              <span className="text-neutral-600 font-medium">Vaksin</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-amber-500" />
              <span className="text-neutral-600 font-medium">Grooming</span>
            </div>
          </div>
        </div>

        {/* Visual Chart Bars */}
        <div className="min-h-[220px] w-full pt-4 pb-2">
          {stats.total === 0 ? (
            <div className="py-14 text-center text-neutral-400">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
              <p className="text-sm font-semibold text-neutral-700">
                Belum ada data kunjungan pada periode {activePeriodText}
              </p>
              <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">
                Data antrean yang diisi di spreadsheet atau didaftarkan lewat sistem akan muncul
                secara otomatis pada grafik ini.
              </p>
            </div>
          ) : (
            <div
              className={`flex items-end ${
                chartData.mode === 'all-years'
                  ? 'gap-4 sm:gap-8 justify-center'
                  : chartData.mode === 'yearly'
                  ? 'gap-2 sm:gap-4'
                  : 'gap-1 sm:gap-2 overflow-x-auto'
              } h-52 px-2 border-b border-neutral-200`}
            >
              {chartData.items.map((item, idx) => {
                const heightPct =
                  chartData.maxVal > 0 ? Math.round((item.total / chartData.maxVal) * 100) : 0;
                const minHeight = item.total > 0 ? Math.max(heightPct, 8) : 2;

                return (
                  <div
                    key={idx}
                    className={`flex flex-col items-center gap-1.5 h-full justify-end group relative ${
                      chartData.mode === 'all-years' ? 'min-w-[60px] max-w-[90px] flex-1' : 'min-w-[18px] flex-1'
                    }`}
                  >
                    {/* Tooltip on Hover */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-[10px] py-1 px-2 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-20 shadow-lg">
                      <p className="font-bold">{item.fullLabel}</p>
                      <p className="font-mono text-fuchsia-300">{item.total} Kunjungan ({item.completed} Selesai)</p>
                    </div>

                    {/* Numeric Count Label */}
                    <span
                      className={`text-[10px] font-mono transition ${
                        item.total > 0
                          ? 'text-neutral-700 font-bold opacity-80 group-hover:opacity-100'
                          : 'text-neutral-300 opacity-40'
                      }`}
                    >
                      {item.total > 0 ? item.total : '-'}
                    </span>

                    {/* Multi-layered Bar */}
                    <div
                      className={`w-full ${
                        chartData.mode === 'all-years' ? 'max-w-[56px]' : 'max-w-[42px]'
                      } rounded-t-lg transition-all duration-300 relative overflow-hidden flex flex-col justify-end ${
                        item.total === 0
                          ? 'bg-neutral-100'
                          : item.isCurrent
                          ? 'ring-2 ring-fuchsia-700/40 bg-fuchsia-50'
                          : 'bg-neutral-100 group-hover:bg-neutral-200'
                      }`}
                      style={{ height: `${minHeight}%` }}
                    >
                      {item.total > 0 && (
                        <div className="w-full h-full flex flex-col justify-end">
                          {/* Segment Grooming */}
                          {item.grooming > 0 && (
                            <div
                              style={{ height: `${(item.grooming / item.total) * 100}%` }}
                              className="w-full bg-amber-500"
                              title={`Grooming: ${item.grooming}`}
                            />
                          )}
                          {/* Segment Vaccine */}
                          {item.vaccine > 0 && (
                            <div
                              style={{ height: `${(item.vaccine / item.total) * 100}%` }}
                              className="w-full bg-sky-500"
                              title={`Vaksin: ${item.vaccine}`}
                            />
                          )}
                          {/* Segment Consultation */}
                          {item.consultation > 0 && (
                            <div
                              style={{ height: `${(item.consultation / item.total) * 100}%` }}
                              className="w-full bg-fuchsia-700"
                              title={`Konsultasi: ${item.consultation}`}
                            />
                          )}
                          {/* Fallback color if other service */}
                          {item.consultation === 0 && item.vaccine === 0 && item.grooming === 0 && (
                            <div className="w-full h-full bg-fuchsia-600" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* X-Axis Label */}
                    <span
                      className={`text-[10px] mt-1 font-semibold truncate ${
                        item.isCurrent
                          ? 'text-fuchsia-700 font-black'
                          : item.total > 0
                          ? 'text-neutral-700'
                          : 'text-neutral-400'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Trend Insight Footer */}
        <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              Total <strong>{stats.total}</strong> riwayat kunjungan tersinkron dengan database
              spreadsheet.
            </span>
          </div>

          {selectedYear === 'all' ? (
            <span className="text-[11px] text-fuchsia-800 font-semibold bg-fuchsia-50 px-2.5 py-1 rounded-md">
              Rata-rata: {(stats.total / Math.max(1, availableYearsAsc.length)).toFixed(1)} kunjungan / tahun
            </span>
          ) : selectedMonth === 'all' ? (
            <span className="text-[11px] text-fuchsia-800 font-semibold bg-fuchsia-50 px-2.5 py-1 rounded-md">
              Rata-rata: {(stats.total / 12).toFixed(1)} kunjungan / bulan
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
