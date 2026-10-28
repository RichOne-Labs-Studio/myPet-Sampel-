import React, { useState, useEffect } from 'react';
import {
  Heart,
  Activity,
  Clock,
  ShieldCheck,
  ArrowRight,
  Search,
  PhoneCall,
  Stethoscope,
  Sparkles,
  MessageSquare,
  Send,
  Star,
  CheckCircle2,
  User,
  Phone,
  FileText,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { VierLogo } from '../VierLogo';
import { Owner, Pet, VisitQueue } from '../../types';
import { formatPhoneInput, normalizePhoneWithZero, formatPhoneDisplay } from '../../utils/phoneUtils';
import { isToday } from '../../utils/dateUtils';

interface PatientLandingProps {
  navigate: (route: AppRoute) => void;
}

export const PatientLanding: React.FC<PatientLandingProps> = ({ navigate }) => {
  const {
    queues,
    currentServingTicket,
    setTrackedTicket,
    trackByPhone,
    addFeedback,
    owners,
    pets,
  } = useClinic();
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');

  // Hasil Pencarian Terpadu Antrean & Data Pasien
  const [searchResult, setSearchResult] = useState<{
    performed: boolean;
    matchedQueues: VisitQueue[];
    matchedOwners: Owner[];
    matchedPets: Pet[];
  }>({
    performed: false,
    matchedQueues: [],
    matchedOwners: [],
    matchedPets: [],
  });

  // Feedback State
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackPhone, setFeedbackPhone] = useState('');
  const [feedbackPetName, setFeedbackPetName] = useState('');
  const [feedbackTicket, setFeedbackTicket] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('Pelayanan Dokter & Medis');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  // Notifikasi jika baru saja menyelesaikan pendaftaran (tanpa periksa)
  const [registrationSuccessBanner, setRegistrationSuccessBanner] = useState<{
    petName: string;
    petType?: string;
    ownerName?: string;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('vier_reg_success_msg');
      if (stored) {
        setRegistrationSuccessBanner(JSON.parse(stored));
        sessionStorage.removeItem('vier_reg_success_msg');
      }
    } catch {
      // ignore
    }
  }, []);

  const waitingCount = queues.filter((q) => q.status === 'Menunggu' && isToday(q.createdAt)).length;
  const inPoliCount = queues.filter((q) => q.status === 'Di Ruang Poli' && isToday(q.createdAt)).length;

  const handleSearchTicket = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    const raw = searchQuery.trim();
    if (!raw) {
      setSearchError('Silakan masukkan nomor tiket, nama pemilik, atau nomor WhatsApp/telepon.');
      return;
    }

    const cleanDigits = String(raw ?? '').replace(/\D/g, '');
    const qLower = String(raw ?? '').toLowerCase();

    // 1. Direct Ticket Match
    const ticketMatches = queues.filter(
      (q) => String(q.ticketNumber ?? '').toLowerCase() === qLower
    );

    // 2. Owner Match (by phone or by name)
    const ownerMatches = owners.filter((o) => {
      const oPhone = String(o.whatsapp ?? '').replace(/\D/g, '');
      const matchPhone = cleanDigits.length >= 4 && oPhone.includes(cleanDigits);
      const matchName = String(o.name ?? '').toLowerCase().includes(qLower);
      return matchPhone || matchName;
    });

    const matchedOwnerPhones = new Set(
      ownerMatches.map((o) => String(o.whatsapp ?? '').replace(/\D/g, ''))
    );
    const matchedOwnerIds = new Set(ownerMatches.map((o) => o.id));

    // 3. Pet Match
    const petMatches = pets.filter((p) => {
      const pPhone = String(p.ownerWhatsapp ?? '').replace(/\D/g, '');
      const isOwnerPhoneMatch = cleanDigits.length >= 4 && pPhone.includes(cleanDigits);
      const isOwnerIdMatch = p.ownerId && matchedOwnerIds.has(p.ownerId);
      const isOwnerPhoneSetMatch = matchedOwnerPhones.has(pPhone);
      const isPetNameMatch = String(p.name ?? '').toLowerCase().includes(qLower);
      return isOwnerPhoneMatch || isOwnerIdMatch || isOwnerPhoneSetMatch || isPetNameMatch;
    });

    // Masukkan pemilik hewan jika ditemukan hewan yang cocok tapi belum ada di ownerMatches
    petMatches.forEach((p) => {
      const pPhone = String(p.ownerWhatsapp ?? '').replace(/\D/g, '');
      if (pPhone && !matchedOwnerPhones.has(pPhone)) {
        const found = owners.find((o) => String(o.whatsapp ?? '').replace(/\D/g, '') === pPhone);
        if (found) {
          ownerMatches.push(found);
          matchedOwnerPhones.add(pPhone);
        }
      }
    });

    // 4. Queues matching the query, owner, or pet
    const allMatchingQueues = [
      ...ticketMatches,
      ...queues.filter((q) => {
        if (ticketMatches.some((tm) => tm.id === q.id)) return false;
        const qPhone = String(q.ownerWhatsapp ?? '').replace(/\D/g, '');
        const matchPhone = cleanDigits.length >= 4 && qPhone.includes(cleanDigits);
        const matchOwnerName = String(q.ownerName ?? '').toLowerCase().includes(qLower);
        const matchPetName = String(q.petName ?? '').toLowerCase().includes(qLower);
        return matchPhone || matchOwnerName || matchPetName;
      }),
    ];

    if (
      ticketMatches.length === 0 &&
      ownerMatches.length === 0 &&
      petMatches.length === 0 &&
      allMatchingQueues.length === 0
    ) {
      setSearchError(`Data pasien atau nomor tiket dengan kata kunci "${raw}" tidak ditemukan.`);
      setSearchResult({
        performed: true,
        matchedQueues: [],
        matchedOwners: [],
        matchedPets: [],
      });
      return;
    }

    setSearchResult({
      performed: true,
      matchedQueues: allMatchingQueues,
      matchedOwners: ownerMatches,
      matchedPets: petMatches,
    });
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) {
      setFeedbackError('Kolom saran, kritik atau masukan wajib diisi.');
      return;
    }

    const satisfactionLabels: Record<number, 'Sangat Puas' | 'Puas' | 'Cukup' | 'Kurang' | 'Sangat Kurang'> = {
      5: 'Sangat Puas',
      4: 'Puas',
      3: 'Cukup',
      2: 'Kurang',
      1: 'Sangat Kurang',
    };

    addFeedback({
      ownerName: feedbackName.trim() || 'Pemilik Hewan',
      ownerWhatsapp: feedbackPhone.trim() ? normalizePhoneWithZero(feedbackPhone.trim()) : undefined,
      petName: feedbackPetName.trim() || undefined,
      ticketNumber: feedbackTicket.trim().toUpperCase() || undefined,
      category: feedbackCategory,
      satisfactionRating: feedbackRating,
      satisfactionLabel: satisfactionLabels[feedbackRating] || 'Puas',
      feedbackText: feedbackMessage.trim(),
    });

    setFeedbackSubmitted(true);
    setFeedbackError('');
  };

  const handleResetFeedback = () => {
    setFeedbackName('');
    setFeedbackPhone('');
    setFeedbackPetName('');
    setFeedbackTicket('');
    setFeedbackMessage('');
    setFeedbackRating(5);
    setFeedbackSubmitted(false);
    setFeedbackError('');
  };

  return (
    <div id="patient-landing-root" className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-800">
      {/* Top Navbar */}
      <header id="patient-nav" className="w-full bg-white/95 backdrop-blur-md border-b border-fuchsia-100 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VierLogo className="h-11 sm:h-12 w-auto" />
            <div className="hidden sm:block pl-3 border-l border-neutral-200">
              <span className="text-xs font-bold text-neutral-800 tracking-tight block">
                Vier Pet Care
              </span>
              <p className="text-[11px] text-neutral-500 font-medium">Jl. Kalitanjung No. 72 Kota Cirebon</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-staff-login-top"
              onClick={() => navigate('/login')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition border border-neutral-200 cursor-pointer"
            >
              <span>Login</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12 md:py-16 max-w-4xl mx-auto w-full text-center">
        {/* Banner Registrasi Berhasil */}
        {registrationSuccessBanner && (
          <div
            id="registration-success-alert"
            className="w-full max-w-2xl mb-6 bg-emerald-50 border border-emerald-300/80 text-emerald-950 rounded-2xl p-4 sm:p-5 flex items-start justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                    Pendaftaran Pasien Berhasil
                  </h4>
                  <span className="text-[10px] bg-emerald-200/80 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                    Tersimpan Resmi
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-emerald-800 mt-1 leading-relaxed">
                  Data hewan <strong>{registrationSuccessBanner.petName}</strong> ({registrationSuccessBanner.petType || 'Pasien'}) milik <strong>{registrationSuccessBanner.ownerName}</strong> telah berhasil didaftarkan di database klinik Vier Pet Care.
                </p>
                <p className="text-[11px] sm:text-xs text-emerald-700/80 mt-1">
                  Hewan Anda sudah resmi terdata untuk kunjungan atau pemeriksaan di waktu mendatang tanpa perlu antre hari ini.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRegistrationSuccessBanner(null)}
              className="text-emerald-600 hover:text-emerald-900 text-xs font-bold px-2 py-1 rounded-md hover:bg-emerald-100/60 transition cursor-pointer"
              title="Tutup notifikasi"
            >
              ✕
            </button>
          </div>
        )}

        {/* Soft Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-fuchsia-100/80 text-fuchsia-900 text-xs sm:text-sm font-semibold mb-4 sm:mb-6 border border-fuchsia-200">
          <Sparkles className="w-4 h-4 text-fuchsia-600" />
          <span>Portal Pasien & Pendaftaran Mandiri Online</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-neutral-900 tracking-tight leading-tight max-w-2xl mb-3 sm:mb-4">
          Perawatan Kasih Sayang untuk <span className="text-fuchsia-600">Sahabat Berbulu</span> Anda
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-neutral-600 max-w-xl mb-6 sm:mb-8 leading-relaxed">
          Ambil nomor antrean secara instan dan pantau giliran pemeriksaan dokter hewan secara langsung.
        </p>

        {/* Live Queue Pulse Bar */}
        <div id="live-clinic-status" className="w-full max-w-2xl bg-white rounded-2xl p-4 sm:p-5 border border-fuchsia-100 shadow-sm mb-6 sm:mb-8 text-left">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500 animate-ping"></span>
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-600">Status Poli Hari Ini</span>
            </div>
            <span className="text-xs font-semibold text-fuchsia-700 bg-fuchsia-50 px-2.5 py-0.5 rounded-md border border-fuchsia-200">
              Real-Time Sync
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <div className="p-2.5 sm:p-3 bg-neutral-50 rounded-xl border border-neutral-100">
              <p className="text-xs sm:text-sm text-neutral-500 font-medium mb-0.5">Sedang Dilayani</p>
              <p className="text-xl sm:text-3xl font-black text-fuchsia-600">{currentServingTicket || '-'}</p>
            </div>
            <div className="p-2.5 sm:p-3 bg-neutral-50 rounded-xl border border-neutral-100">
              <p className="text-xs sm:text-sm text-neutral-500 font-medium mb-0.5">Antrean Menunggu</p>
              <p className="text-xl sm:text-3xl font-black text-neutral-800">{waitingCount} <span className="text-xs font-normal text-neutral-400">pet</span></p>
            </div>
            <div className="p-2.5 sm:p-3 bg-neutral-50 rounded-xl border border-neutral-100">
              <p className="text-xs sm:text-sm text-neutral-500 font-medium mb-0.5">Estimasi Tunggu</p>
              <p className="text-xl sm:text-3xl font-black text-fuchsia-600">~{waitingCount * 12} <span className="text-xs font-normal text-neutral-400">mnt</span></p>
            </div>
          </div>
        </div>

        {/* Two Large Center Action Buttons */}
        <div id="portal-actions" className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl">
          <button
            id="btn-register-new-visit"
            onClick={() => navigate('/pasien/daftar')}
            className="group relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-fuchsia-600 to-fuchsia-800 hover:from-fuchsia-700 hover:to-fuchsia-900 text-white shadow-xl shadow-fuchsia-600/25 transition-all transform active:scale-98 border border-fuchsia-400/40 text-center cursor-pointer"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl sm:text-4xl mb-3 group-hover:scale-110 transition shadow-inner">
              🐾
            </div>
            <span className="text-xl sm:text-2xl font-black tracking-tight mb-1">
              Daftar Kunjungan Baru
            </span>
            <span className="text-xs sm:text-sm text-fuchsia-100 font-medium max-w-xs">
              Ambil nomor antrean & registrasi hewan (3 langkah mudah)
            </span>
            <div className="mt-5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white text-fuchsia-800 px-4 py-2 rounded-full shadow-md group-hover:bg-fuchsia-50 transition">
              <span>Mulai Pendaftaran</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          <button
            id="btn-check-queue-status"
            onClick={() => {
              setSearchResult({ performed: false, matchedQueues: [], matchedOwners: [], matchedPets: [] });
              setSearchError('');
              setShowCheckModal(true);
            }}
            className="group relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-3xl bg-white hover:bg-neutral-50 text-neutral-800 shadow-lg shadow-neutral-200/60 transition-all transform active:scale-98 border-2 border-neutral-200 hover:border-fuchsia-400 text-center cursor-pointer"
          >
            <div className="w-16 h-16 rounded-2xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center text-3xl sm:text-4xl mb-3 group-hover:scale-110 transition border border-fuchsia-100">
              📱
            </div>
            <span className="text-xl sm:text-2xl font-black tracking-tight text-neutral-900 mb-1">
              Cek Status Antrean & Data Pasien
            </span>
            <span className="text-xs sm:text-sm text-neutral-500 font-medium max-w-xs">
              Lihat posisi antrean live atau cek data rekam hewan terdaftar via nama & WhatsApp
            </span>
            <div className="mt-5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-fuchsia-50 text-fuchsia-700 px-4 py-2 rounded-full shadow-xs group-hover:bg-fuchsia-100 transition border border-fuchsia-200">
              <span>Cek Antrean & Data Pasien</span>
              <Search className="w-4 h-4" />
            </div>
          </button>
        </div>

        {/* Kotak Saran & Masukan Pasien */}
        <div id="kotak-saran-pasien" className="w-full max-w-2xl mt-8 sm:mt-12 bg-white rounded-3xl p-5 sm:p-8 border border-neutral-200 shadow-sm text-left">
          <div className="flex items-center gap-3 pb-4 border-b border-neutral-100 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">
                Tingkat Kepuasan & Kotak Saran Pasien
              </h3>
              <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
                Beri nilai kepuasan dan masukan untuk pelayanan dokter, kenyamanan klinik, dan keramahan staf Vier Pet Care.
              </p>
            </div>
          </div>

          {feedbackSubmitted ? (
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-emerald-900">Terima Kasih Atas Masukan & Penilaian Anda!</h4>
              <p className="text-xs sm:text-sm text-emerald-700 max-w-md mx-auto leading-relaxed">
                Tingkat kepuasan serta saran & kritik Anda telah berhasil disimpan ke sistem Vier Pet Care untuk evaluasi peningkatan mutu klinik.
              </p>
              <button
                type="button"
                onClick={handleResetFeedback}
                className="mt-2 text-xs sm:text-sm font-semibold px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Kirim Masukan Baru</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-neutral-700 mb-1.5">
                    Nama Pemilik / Klien <span className="text-neutral-400 font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={feedbackName}
                    onChange={(e) => setFeedbackName(e.target.value)}
                    placeholder="Contoh: Ibu Rina / Anonim"
                    className="w-full px-3.5 py-3 rounded-xl border border-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 text-sm transition"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-neutral-700 mb-1.5">
                    Nomor WhatsApp <span className="text-neutral-400 font-normal">(Awali angka 0, opsional)</span>
                  </label>
                  <input
                    type="tel"
                    value={feedbackPhone}
                    onChange={(e) => setFeedbackPhone(formatPhoneInput(e.target.value))}
                    onBlur={() => {
                      if (feedbackPhone.trim()) {
                        setFeedbackPhone(normalizePhoneWithZero(feedbackPhone));
                      }
                    }}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3.5 py-3 rounded-xl border border-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 text-sm transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-neutral-700 mb-1.5">
                    Nama Anabul / Hewan <span className="text-neutral-400 font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={feedbackPetName}
                    onChange={(e) => setFeedbackPetName(e.target.value)}
                    placeholder="Contoh: Milo (Kucing Persia)"
                    className="w-full px-3.5 py-3 rounded-xl border border-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 text-sm transition"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-neutral-700 mb-1.5">
                    Nomor Tiket Antrean <span className="text-neutral-400 font-normal">(Jika ada)</span>
                  </label>
                  <input
                    type="text"
                    value={feedbackTicket}
                    onChange={(e) => setFeedbackTicket(e.target.value)}
                    placeholder="Contoh: A-004"
                    className="w-full px-3.5 py-3 rounded-xl border border-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 text-sm transition uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-neutral-700 mb-1.5">
                    Kategori Layanan
                  </label>
                  <select
                    value={feedbackCategory}
                    onChange={(e) => setFeedbackCategory(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl border border-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 text-sm bg-white transition"
                  >
                    <option value="Pelayanan Dokter & Medis">Pelayanan Dokter & Tindakan Medis</option>
                    <option value="Fasilitas & Kebersihan Klinik">Fasilitas & Kebersihan Klinik</option>
                    <option value="Pendaftaran & Waktu Tunggu">Pendaftaran Online & Waktu Tunggu Antrean</option>
                    <option value="Keramahan & Komunikasi Staf">Keramahan & Komunikasi Staf Frontdesk</option>
                    <option value="Rawat Inap & Titip Hewan">Rawat Inap & Penitipan Hewan</option>
                    <option value="Saran & Masukan Umum">Saran, Kritik & Masukan Umum Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-neutral-700 mb-1.5">
                    Tingkat Kepuasan Pelayanan
                  </label>
                  <div className="flex items-center gap-1.5 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackRating(star)}
                        className="p-1 text-amber-400 hover:scale-110 transition cursor-pointer"
                        title={`${star} Bintang`}
                      >
                        <Star
                          className={`w-6 h-6 sm:w-7 sm:h-7 ${
                            star <= feedbackRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-neutral-300'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs sm:text-sm text-neutral-600 font-semibold ml-2">
                      {feedbackRating === 5 ? '5/5 (Sangat Puas ⭐⭐⭐⭐⭐)' : feedbackRating === 4 ? '4/5 (Puas ⭐⭐⭐⭐)' : feedbackRating === 3 ? '3/5 (Cukup ⭐⭐⭐)' : feedbackRating === 2 ? '2/5 (Kurang ⭐⭐)' : '1/5 (Sangat Kurang ⭐)'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-neutral-700 mb-1.5">
                  Saran, Kritik dan Masukan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={feedbackMessage}
                  onChange={(e) => {
                    setFeedbackMessage(e.target.value);
                    if (feedbackError) setFeedbackError('');
                  }}
                  placeholder="Tuliskan pengalaman, saran perbaikan, kritik atau masukan Anda untuk Vier Pet Care..."
                  className="w-full px-3.5 py-3 rounded-xl border border-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 text-sm resize-none transition"
                />
                {feedbackError && (
                  <p className="text-xs text-rose-500 font-medium mt-1">{feedbackError}</p>
                )}
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-sm font-bold rounded-xl shadow-md shadow-fuchsia-700/20 transition cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Saran & Nilai Kepuasan</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-neutral-200 bg-white py-6 text-center text-xs text-neutral-500">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-center">
          <p>© 2026 myPet - Sistem Manajemen Klinik Hewan Terpadu by RichOne Labs Studio</p>
        </div>
      </footer>

      {/* Modal Cek Status Antrean & Data Pasien */}
      {showCheckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col border border-neutral-100 relative animate-in fade-in zoom-in-95 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-start justify-between bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center text-xl shrink-0 border border-fuchsia-200 shadow-xs">
                  📱
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-neutral-900 leading-tight">
                    Cek Status Antrean & Data Pasien
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Cari berdasarkan Nomor Tiket, Nama Pemilik, atau Nomor WhatsApp.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCheckModal(false);
                  setSearchError('');
                  setSearchResult({ performed: false, matchedQueues: [], matchedOwners: [], matchedPets: [] });
                }}
                className="text-neutral-400 hover:text-neutral-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-200/60 transition cursor-pointer"
                title="Tutup"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* Search Form */}
              <form onSubmit={handleSearchTicket} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                    Nomor Tiket / Nama Pemilik / No. WhatsApp
                  </label>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Contoh: A-12, Budi, atau 081288990011"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-neutral-300 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 text-sm bg-white"
                        autoFocus
                      />
                      <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-fuchsia-700 hover:from-fuchsia-700 hover:to-fuchsia-800 text-white text-xs font-bold shadow-md shadow-fuchsia-600/20 transition shrink-0 cursor-pointer"
                    >
                      Cari Data
                    </button>
                  </div>
                  {searchError && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium mt-2 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{searchError}</span>
                    </div>
                  )}
                </div>
              </form>

              {/* Hasil Pencarian */}
              {searchResult.performed && (
                <div className="space-y-5 pt-2 border-t border-neutral-100 animate-in fade-in duration-200">
                  {/* 1. Status Antrean Aktif Hari Ini */}
                  {searchResult.matchedQueues.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse"></span>
                          Status Antrean Aktif Hari Ini
                        </h4>
                        <span className="text-[11px] text-fuchsia-700 font-semibold bg-fuchsia-50 px-2.5 py-0.5 rounded-full border border-fuchsia-200">
                          {searchResult.matchedQueues.length} Antrean Ditemukan
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {searchResult.matchedQueues.map((q) => {
                          const statusBg =
                            q.status === 'Di Ruang Poli'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : q.status === 'Selesai'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300';

                          return (
                            <div
                              key={q.id}
                              className="p-4 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl font-black text-fuchsia-700 tracking-tight">
                                    {q.ticketNumber}
                                  </span>
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${statusBg}`}>
                                    {q.status}
                                  </span>
                                </div>
                                <p className="text-xs text-neutral-800 font-semibold">
                                  {q.petName} ({q.petType}) • <span className="text-neutral-600 font-normal">Pemilik: {q.ownerName}</span>
                                </p>
                                <p className="text-[11px] text-neutral-500">
                                  Layanan: {q.serviceType} • Keluhan: {q.chiefComplaint}
                                </p>
                                {q.assignedDoctor && (
                                  <p className="text-[11px] text-fuchsia-900 font-medium">
                                    Dokter: {q.assignedDoctor}
                                  </p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setTrackedTicket(q.ticketNumber);
                                  setShowCheckModal(false);
                                  navigate('/pasien/dashboard');
                                }}
                                className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white shadow-xs transition shrink-0 cursor-pointer"
                              >
                                <span>Pantau Antrean Live</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. Data Pasien Hewan & Pemilik Terdaftar */}
                  {(searchResult.matchedOwners.length > 0 || searchResult.matchedPets.length > 0) && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2">
                          <span>🐾 Data Pasien Hewan & Pemilik Terdaftar</span>
                        </h4>
                      </div>

                      {/* Tampilkan Pemilik */}
                      {searchResult.matchedOwners.map((owner) => {
                        const ownerPets = pets.filter(
                          (p) =>
                            p.ownerId === owner.id ||
                            String(p.ownerWhatsapp ?? '').replace(/\D/g, '') === String(owner.whatsapp ?? '').replace(/\D/g, '')
                        );

                        return (
                          <div
                            key={owner.id}
                            className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 shadow-xs space-y-3"
                          >
                            {/* Info Pemilik */}
                            <div className="pb-3 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center">
                                    <User className="w-4 h-4" />
                                  </div>
                                  <h5 className="text-sm font-bold text-neutral-900">{owner.name}</h5>
                                </div>
                                <p className="text-xs text-neutral-500 mt-1">
                                  WhatsApp: <strong>{formatPhoneDisplay(owner.whatsapp)}</strong> • Alamat: {owner.address || '-'}
                                </p>
                              </div>

                              {/* Informed Consent Status */}
                              {owner.informedConsent && (
                                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Informed Consent Terdata</span>
                                </div>
                              )}
                            </div>

                            {/* Daftar Hewan Terdaftar */}
                            <div>
                              <p className="text-xs font-bold text-neutral-700 mb-2">
                                Hewan Peliharaan Terdaftar ({ownerPets.length}):
                              </p>
                              {ownerPets.length === 0 ? (
                                <p className="text-xs text-neutral-400 italic">Belum ada data hewan terdaftar untuk pemilik ini.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {ownerPets.map((pet) => {
                                    const petEmoji =
                                      pet.type === 'Cat'
                                        ? '🐱'
                                        : pet.type === 'Dog'
                                        ? '🐶'
                                        : pet.type === 'Rabbit'
                                        ? '🐰'
                                        : '🐾';

                                    return (
                                      <div
                                        key={pet.id}
                                        className="p-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 hover:bg-fuchsia-50/40 hover:border-fuchsia-200 transition space-y-1.5"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-lg">{petEmoji}</span>
                                            <span className="text-xs font-bold text-neutral-900">{pet.name}</span>
                                          </div>
                                          <span className="text-[10px] font-semibold bg-white text-neutral-700 px-2 py-0.5 rounded-md border border-neutral-200">
                                            {pet.status || 'Sehat'}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-neutral-500">
                                          {pet.type} • {pet.breed || 'Mix'} • {pet.sex} • {pet.ageOrDob || '-'}
                                        </p>
                                        {pet.informedConsent && (
                                          <p className="text-[10px] text-emerald-700 font-medium">
                                            ✓ Persetujuan Medis: Tercatat
                                          </p>
                                        )}
                                        <div className="pt-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              try {
                                                sessionStorage.setItem('prefill_reg_phone', owner.whatsapp);
                                                sessionStorage.setItem('prefill_reg_pet_id', pet.id);
                                              } catch {
                                                // ignore
                                              }
                                              setShowCheckModal(false);
                                              navigate('/pasien/daftar');
                                            }}
                                            className="w-full text-center text-[11px] font-bold text-fuchsia-700 bg-white hover:bg-fuchsia-100/70 border border-fuchsia-200 py-1 rounded-lg transition cursor-pointer"
                                          >
                                            + Ambil Antrean untuk {pet.name}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Jika Tidak Ada Antrean Aktif tetapi data pemilik ditemukan */}
                  {searchResult.matchedQueues.length === 0 &&
                    (searchResult.matchedOwners.length > 0 || searchResult.matchedPets.length > 0) && (
                      <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-center text-xs text-neutral-600">
                        <span>Tidak ada tiket antrean yang sedang menunggu hari ini untuk pasien di atas.</span>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-3">
              {searchResult.performed ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchResult({ performed: false, matchedQueues: [], matchedOwners: [], matchedPets: [] });
                    setSearchQuery('');
                    setSearchError('');
                  }}
                  className="text-xs font-semibold text-fuchsia-700 hover:text-fuchsia-800 underline cursor-pointer"
                >
                  ← Cari Kata Kunci Lain
                </button>
              ) : (
                <span className="text-[11px] text-neutral-400">
                  Klinik Vier Pet Care Cirebon
                </span>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCheckModal(false);
                    setSearchError('');
                    setSearchResult({ performed: false, matchedQueues: [], matchedOwners: [], matchedPets: [] });
                  }}
                  className="py-2 px-4 rounded-xl border border-neutral-200 text-neutral-700 text-xs font-semibold hover:bg-neutral-100 transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCheckModal(false);
                    navigate('/pasien/daftar');
                  }}
                  className="py-2 px-4 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  Daftar Pasien Baru
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
