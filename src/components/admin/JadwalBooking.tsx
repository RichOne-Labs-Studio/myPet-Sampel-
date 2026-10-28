import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  User,
  PawPrint,
  ArrowRight,
  List,
  Grid,
  Search,
  Phone,
  Sparkles,
  Check,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { BookingSchedule, ServiceType, PetType } from '../../types';
import { formatPhoneDisplay, toWhatsappNumber, formatPhoneInput } from '../../utils/phoneUtils';
import { normalizePetType, getPetEmoji, getPetTypeIndonesian } from '../../utils/petUtils';
import { searchPatientsAutocompleteApi } from '../../database/backendSyncClient';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const JadwalBooking: React.FC<Props> = ({ navigate }) => {
  const { bookings, addBooking, updateBookingStatus, registerPatient, pets } = useClinic();

  const [viewMode, setViewMode] = useState<'agenda' | 'calendar'>('agenda');
  const [filterService, setFilterService] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [showAddModal, setShowAddModal] = useState(false);

  const monthsList = [
    { value: 0, label: 'Januari' },
    { value: 1, label: 'Februari' },
    { value: 2, label: 'Maret' },
    { value: 3, label: 'April' },
    { value: 4, label: 'Mei' },
    { value: 5, label: 'Juni' },
    { value: 6, label: 'Juli' },
    { value: 7, label: 'Agustus' },
    { value: 8, label: 'September' },
    { value: 9, label: 'Oktober' },
    { value: 10, label: 'November' },
    { value: 11, label: 'Desember' },
  ];

  const yearsList = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  // New Booking form
  const [bDate, setBDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bTime, setBTime] = useState('10:00');
  const [bOwnerName, setBOwnerName] = useState('');
  const [bOwnerPhone, setBOwnerPhone] = useState('');
  const [bPetName, setBPetName] = useState('');
  const [bPetType, setBPetType] = useState<PetType>('Cat');
  const [bService, setBService] = useState<ServiceType>('Consultation');
  const [bNotes, setBNotes] = useState('');

  // Autocomplete state
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [debouncedModalSearch, setDebouncedModalSearch] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [isSearchingAutocomplete, setIsSearchingAutocomplete] = useState(false);
  const [selectedRegisteredPet, setSelectedRegisteredPet] = useState<any | null>(null);
  const [activeDropdownField, setActiveDropdownField] = useState<'quick' | 'owner' | 'phone' | 'pet' | null>(null);

  const autocompleteDropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedModalSearch(modalSearchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [modalSearchQuery]);

  // Fetch autocomplete results from server / database
  useEffect(() => {
    if (!showAddModal) {
      setAutocompleteResults([]);
      return;
    }
    const q = debouncedModalSearch.trim();
    if (!q) {
      setAutocompleteResults([]);
      return;
    }

    let isMounted = true;
    setIsSearchingAutocomplete(true);

    searchPatientsAutocompleteApi(q, 15)
      .then((results) => {
        if (isMounted) {
          setAutocompleteResults(results || []);
        }
      })
      .catch((err) => {
        console.error('Autocomplete booking error:', err);
      })
      .finally(() => {
        if (isMounted) setIsSearchingAutocomplete(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedModalSearch, showAddModal]);

  // Click outside to close suggestion dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        autocompleteDropdownRef.current &&
        !autocompleteDropdownRef.current.contains(e.target as Node)
      ) {
        setActiveDropdownField(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAutocompleteItem = (item: any) => {
    setBOwnerName(item.ownerName || '');
    setBOwnerPhone(formatPhoneInput(item.ownerWhatsapp || ''));
    setBPetName(item.name || '');
    setBPetType((normalizePetType(item.type) as PetType) || 'Cat');
    setSelectedRegisteredPet(item);
    setActiveDropdownField(null);
    setModalSearchQuery('');
  };

  const handleClearSelectedPatient = () => {
    setSelectedRegisteredPet(null);
    setBOwnerName('');
    setBOwnerPhone('');
    setBPetName('');
    setBPetType('Cat');
    setModalSearchQuery('');
  };

  // Other pets belonging to this owner
  const ownerOtherPets = useMemo(() => {
    if (!selectedRegisteredPet) return [];
    const ownerId = selectedRegisteredPet.ownerId;
    const ownerWhatsapp = selectedRegisteredPet.ownerWhatsapp;
    return pets.filter(
      (p) =>
        p.id !== selectedRegisteredPet.id &&
        ((ownerId && p.ownerId === ownerId) ||
          (ownerWhatsapp && p.ownerWhatsapp === ownerWhatsapp))
    );
  }, [pets, selectedRegisteredPet]);

  const services = ['all', 'Consultation', 'Vaccine', 'Grooming', 'Hotel', 'Surgery'];

  const filteredBookings = bookings.filter((b) => {
    if (filterService !== 'all' && b.serviceType !== filterService) return false;
    const bDateObj = new Date(b.date);
    if (bDateObj.getFullYear() !== selectedYear || bDateObj.getMonth() !== selectedMonth) {
      return false;
    }
    return true;
  });

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bOwnerName.trim() || !bPetName.trim()) return;

    addBooking({
      date: bDate,
      time: bTime,
      ownerName: bOwnerName.trim(),
      ownerWhatsapp: bOwnerPhone.trim(),
      petName: bPetName.trim(),
      petType: bPetType,
      serviceType: bService,
      status: 'Terjadwal',
      notes: bNotes.trim(),
    });

    setShowAddModal(false);
    setBOwnerName('');
    setBOwnerPhone('');
    setBPetName('');
    setBNotes('');
  };

  const handleCheckInToQueue = (booking: BookingSchedule) => {
    registerPatient({
      owner: {
        name: booking.ownerName,
        whatsapp: booking.ownerWhatsapp,
        address: 'Alamat Klien Booking',
      },
      pet: {
        name: booking.petName,
        type: booking.petType || 'Cat',
        breed: 'Ras',
        ageOrDob: 'Dewasa',
        sex: 'Jantan',
      },
      visit: {
        chiefComplaint: `Kunjungan Booking: ${booking.serviceType}${booking.notes ? ` - ${booking.notes}` : ''}`,
        serviceType: booking.serviceType,
      },
    });

    updateBookingStatus(booking.id, 'Selesai');
    navigate('/admin/dashboard');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-fuchsia-700" />
            <span>Jadwal Booking & Janji Temu Klinis</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Agenda terjadwal konsultasi spesialis, operasi sterilisasi, vaksinasi terjadwal, dan grooming.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs">
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition ${
                viewMode === 'agenda' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Agenda List</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition ${
                viewMode === 'calendar' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Matriks Kalender</span>
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Janji Temu</span>
          </button>
        </div>
      </div>

      {/* Month & Year Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-neutral-700 font-semibold">Periode:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-neutral-900 font-medium focus:outline-hidden focus:border-fuchsia-500"
          >
            {monthsList.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-neutral-900 font-medium focus:outline-hidden focus:border-fuchsia-500"
          >
            {yearsList.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="text-neutral-500 font-mono text-[11px]">
          Menampilkan <strong className="text-neutral-900">{filteredBookings.length}</strong> jadwal untuk {monthsList[selectedMonth].label} {selectedYear}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-white p-2.5 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
        <span className="text-neutral-500 font-semibold px-2">Layanan:</span>
        {services.map((svc) => (
          <button
            key={svc}
            onClick={() => setFilterService(svc)}
            className={`px-3 py-1 rounded-xl font-semibold transition whitespace-nowrap ${
              filterService === svc
                ? 'bg-fuchsia-700 text-white shadow-2xs'
                : 'bg-neutral-50 text-neutral-600 hover:text-neutral-900 border border-neutral-200'
            }`}
          >
            {svc === 'all' ? 'Semua Jadwal' : svc}
          </button>
        ))}
      </div>

      {/* AGENDA VIEW */}
      {viewMode === 'agenda' && (
        <div className="space-y-3">
          {filteredBookings.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 bg-white rounded-2xl border border-neutral-200/80 text-xs">
              Tidak ada jadwal booking pada filter ini.
            </div>
          ) : (
            filteredBookings.map((b) => (
              <div
                key={b.id}
                className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-neutral-300 shadow-xs transition"
              >
                {/* Date & Time Badge */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col items-center justify-center font-mono">
                    <span className="text-[10px] uppercase text-fuchsia-700 font-bold">
                      {new Date(b.date).toLocaleDateString('id-ID', { month: 'short' })}
                    </span>
                    <span className="text-lg font-black text-neutral-900">
                      {new Date(b.date).getDate()}
                    </span>
                    <span className="text-[10px] text-neutral-500">{b.time}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-neutral-900">{b.petName}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200">
                        {b.serviceType}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          b.status === 'Terjadwal'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : b.status === 'Selesai'
                            ? 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-600 mt-1 flex flex-wrap items-center gap-x-1.5">
                      <span>Klien: <strong className="text-neutral-800">{b.ownerName}</strong></span>
                      {b.ownerWhatsapp ? (
                        <a
                          href={`https://wa.me/${toWhatsappNumber(b.ownerWhatsapp)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 hover:underline font-mono font-bold"
                          title="Hubungi lewat WhatsApp"
                        >
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>({formatPhoneDisplay(b.ownerWhatsapp)})</span>
                        </a>
                      ) : (
                        <span className="text-neutral-400 font-mono">-</span>
                      )}
                      <span>• Jenis: {b.petType}</span>
                    </p>

                    {b.notes && (
                      <p className="text-[11px] text-neutral-500 italic mt-0.5">
                        Catatan: {b.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {b.status === 'Terjadwal' && (
                    <button
                      onClick={() => handleCheckInToQueue(b)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition"
                      title="Masukkan pasien langsung ke Antrean Live Poli"
                    >
                      <span>Check-in ke Antrean Poli</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {b.status === 'Terjadwal' && (
                    <button
                      onClick={() => updateBookingStatus(b.id, 'Batal')}
                      className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Batalkan janji temu"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CALENDAR MATRIX VIEW (FULL MONTH) */}
      {viewMode === 'calendar' && (() => {
        const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1);
        const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        let startDayIndex = firstDayOfMonth.getDay() - 1; // Mon = 0, Sun = 6
        if (startDayIndex === -1) startDayIndex = 6;

        return (
          <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-neutral-900">
                Kalender Bulan {monthsList[selectedMonth].label} {selectedYear}
              </h3>
              <span className="text-xs text-neutral-500 font-mono">
                Total {daysInMonth} Hari
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-xs font-mono font-bold text-neutral-500 pb-3 border-b border-neutral-200">
              <span>Senin</span>
              <span>Selasa</span>
              <span>Rabu</span>
              <span>Kamis</span>
              <span>Jumat</span>
              <span className="text-fuchsia-700 font-bold">Sabtu</span>
              <span className="text-rose-600">Minggu</span>
            </div>

            <div className="grid grid-cols-7 gap-2 pt-3">
              {Array.from({ length: startDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[95px] rounded-xl bg-neutral-50/50 border border-neutral-100 opacity-60" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayBookings = bookings.filter((b) => {
                  if (filterService !== 'all' && b.serviceType !== filterService) return false;
                  return b.date === dateStr;
                });

                return (
                  <div
                    key={dayNum}
                    className="min-h-[105px] rounded-xl bg-white p-2 border border-neutral-200 flex flex-col justify-between hover:border-neutral-300 shadow-2xs transition"
                  >
                    <div className="flex justify-between items-center text-[10px] font-mono text-neutral-500">
                      <span className="font-bold text-neutral-900">{dayNum}</span>
                      {dayBookings.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-800 font-bold text-[9px] border border-fuchsia-200">
                          {dayBookings.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 my-1 overflow-y-auto max-h-[60px]">
                      {dayBookings.map((bk) => (
                        <div
                          key={bk.id}
                          className="text-[10px] bg-neutral-50 border border-neutral-200 text-neutral-700 p-1 rounded-sm truncate"
                          title={`${bk.time} - ${bk.petName} (${bk.serviceType}) - ${bk.ownerName}`}
                        >
                          {bk.time} {bk.petName}
                        </div>
                      ))}
                    </div>

                    <span className="text-[9px] text-neutral-400 font-mono truncate">
                      {dayBookings.length > 0 ? `${dayBookings.length} booking` : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ADD BOOKING MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div
            ref={autocompleteDropdownRef}
            className="bg-white border border-neutral-200 rounded-2xl shadow-2xl max-w-lg w-full p-5 sm:p-6 text-neutral-900 animate-in zoom-in-95 my-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center font-bold">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-neutral-900">Buat Janji Temu Klinis Baru</h3>
                  <p className="text-[11px] text-neutral-500">Jadwalkan konsultasi, vaksinasi, atau tindakan medis</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  handleClearSelectedPatient();
                }}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* QUICK SEARCH & AUTOFILL FROM REGISTERED DATABASE */}
            <div className="relative mb-4 bg-fuchsia-50/60 border border-fuchsia-200/80 rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-fuchsia-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-fuchsia-700" />
                  <span>Cari Data Pasien &amp; Pemilik Terdaftar</span>
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-200/70 text-fuchsia-800">
                  Isi Otomatis
                </span>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-fuchsia-600 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={modalSearchQuery}
                  onChange={(e) => {
                    setModalSearchQuery(e.target.value);
                    setActiveDropdownField('quick');
                  }}
                  onFocus={() => setActiveDropdownField('quick')}
                  placeholder="Ketik nama pemilik, pasien, atau nomor WhatsApp..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-white border border-fuchsia-300 text-xs text-neutral-900 font-medium placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 shadow-2xs"
                />
                {modalSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalSearchQuery('');
                      setActiveDropdownField(null);
                    }}
                    className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown List */}
              {activeDropdownField === 'quick' && modalSearchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-neutral-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto z-50 divide-y divide-neutral-100">
                  {isSearchingAutocomplete ? (
                    <div className="p-3 text-center text-xs text-neutral-500 font-medium animate-pulse">
                      🔍 Mencari di database pasien &amp; pemilik terdaftar...
                    </div>
                  ) : autocompleteResults.length > 0 ? (
                    autocompleteResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectAutocompleteItem(item)}
                        className="w-full p-2.5 text-left hover:bg-fuchsia-50/80 transition flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xl shrink-0 p-1.5 bg-neutral-100 rounded-xl group-hover:bg-white group-hover:shadow-2xs">
                            {getPetEmoji(item.type)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-neutral-900 flex items-center gap-1.5 truncate">
                              <span>{item.name}</span>
                              <span className="text-[10px] text-neutral-500 font-normal">
                                ({getPetTypeIndonesian(item.type)} • {item.breed || 'Mix'})
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-600 truncate flex items-center gap-1.5 mt-0.5">
                              <span>👤 <strong>{item.ownerName || 'Klien'}</strong></span>
                              <span>•</span>
                              <span className="font-mono text-emerald-700">📞 {formatPhoneDisplay(item.ownerWhatsapp || '')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-700 bg-fuchsia-100/80 px-2 py-0.5 rounded-lg group-hover:bg-fuchsia-600 group-hover:text-white transition">
                            <Check className="w-3 h-3" />
                            <span>Pilih</span>
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-neutral-500">
                      <p className="font-semibold text-neutral-700">Tidak ada data terdaftar yang cocok.</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        Anda dapat langsung mengisi formulir di bawah secara manual untuk klien baru.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Status Banner when patient selected */}
              {selectedRegisteredPet && (
                <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-emerald-950 animate-in fade-in-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{getPetEmoji(bPetType)}</span>
                    <div className="min-w-0 text-xs">
                      <div className="font-bold truncate flex items-center gap-1.5">
                        <span>{bPetName}</span>
                        <span className="text-[9px] bg-emerald-200 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded-full">
                          TERDAFTAR
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-700 truncate">
                        Pemilik: <strong>{bOwnerName}</strong> • {bOwnerPhone}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelectedPatient}
                    className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded-lg transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Ganti / Batal</span>
                  </button>
                </div>
              )}

              {/* Quick switch to other pets of same owner */}
              {ownerOtherPets.length > 0 && (
                <div className="mt-2 pt-2 border-t border-fuchsia-200/50 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-semibold text-fuchsia-900">Peliharaan lain milik {bOwnerName}:</span>
                  {ownerOtherPets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setBPetName(p.name);
                        setBPetType((normalizePetType(p.type) as PetType) || 'Cat');
                        setSelectedRegisteredPet((prev: any) => ({ ...prev, ...p }));
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-fuchsia-600 hover:text-white text-neutral-800 border border-fuchsia-300 text-[11px] font-semibold transition cursor-pointer shadow-2xs"
                    >
                      <span>{getPetEmoji(p.type)}</span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleCreateBooking} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={bDate}
                    onChange={(e) => setBDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Jam Temu</label>
                  <input
                    type="time"
                    required
                    value={bTime}
                    onChange={(e) => setBTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              {/* Nama Pemilik Input with inline auto-suggest */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-neutral-700 font-semibold">Nama Pemilik</label>
                  {!selectedRegisteredPet && (
                    <span className="text-[10px] text-neutral-400">Ketik untuk mencari terdaftar</span>
                  )}
                </div>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={bOwnerName}
                    onChange={(e) => {
                      setBOwnerName(e.target.value);
                      setModalSearchQuery(e.target.value);
                      setActiveDropdownField('owner');
                    }}
                    onFocus={() => {
                      if (bOwnerName && !selectedRegisteredPet) {
                        setModalSearchQuery(bOwnerName);
                        setActiveDropdownField('owner');
                      }
                    }}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>

                {/* Inline suggestion dropdown for Owner */}
                {activeDropdownField === 'owner' && modalSearchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-40 divide-y divide-neutral-100">
                    {autocompleteResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectAutocompleteItem(item)}
                        className="w-full p-2 text-left hover:bg-fuchsia-50 transition flex items-center justify-between text-xs cursor-pointer"
                      >
                        <div>
                          <div className="font-bold text-neutral-800">👤 {item.ownerName}</div>
                          <div className="text-[10px] text-neutral-500">
                            {getPetEmoji(item.type)} Pasien: {item.name} • 📞 {formatPhoneDisplay(item.ownerWhatsapp || '')}
                          </div>
                        </div>
                        <span className="text-[10px] text-fuchsia-700 font-bold">Pilih</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* WhatsApp Input with inline auto-suggest */}
              <div className="relative">
                <label className="block text-neutral-700 font-semibold mb-1">WhatsApp / Telepon</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    value={bOwnerPhone}
                    onChange={(e) => {
                      const formatted = formatPhoneInput(e.target.value);
                      setBOwnerPhone(formatted);
                      setModalSearchQuery(formatted);
                      setActiveDropdownField('phone');
                    }}
                    onFocus={() => {
                      if (bOwnerPhone && !selectedRegisteredPet) {
                        setModalSearchQuery(bOwnerPhone);
                        setActiveDropdownField('phone');
                      }
                    }}
                    placeholder="Contoh: 081234567890"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>

                {/* Inline suggestion dropdown for Phone */}
                {activeDropdownField === 'phone' && modalSearchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-40 divide-y divide-neutral-100">
                    {autocompleteResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectAutocompleteItem(item)}
                        className="w-full p-2 text-left hover:bg-fuchsia-50 transition flex items-center justify-between text-xs cursor-pointer"
                      >
                        <div>
                          <div className="font-bold text-neutral-800 font-mono">📞 {formatPhoneDisplay(item.ownerWhatsapp || '')}</div>
                          <div className="text-[10px] text-neutral-500">
                            👤 {item.ownerName} • {getPetEmoji(item.type)} {item.name}
                          </div>
                        </div>
                        <span className="text-[10px] text-fuchsia-700 font-bold">Pilih</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Nama Hewan with inline auto-suggest */}
                <div className="relative">
                  <label className="block text-neutral-700 font-semibold mb-1">Nama Hewan</label>
                  <div className="relative">
                    <PawPrint className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={bPetName}
                      onChange={(e) => {
                        setBPetName(e.target.value);
                        setModalSearchQuery(e.target.value);
                        setActiveDropdownField('pet');
                      }}
                      onFocus={() => {
                        if (bPetName && !selectedRegisteredPet) {
                          setModalSearchQuery(bPetName);
                          setActiveDropdownField('pet');
                        }
                      }}
                      placeholder="Contoh: Caca"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                    />
                  </div>

                  {/* Inline suggestion dropdown for Pet Name */}
                  {activeDropdownField === 'pet' && modalSearchQuery.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-40 divide-y divide-neutral-100">
                      {autocompleteResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectAutocompleteItem(item)}
                          className="w-full p-2 text-left hover:bg-fuchsia-50 transition flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-neutral-800">{getPetEmoji(item.type)} {item.name}</div>
                            <div className="text-[10px] text-neutral-500">
                              👤 Pemilik: {item.ownerName} • 📞 {formatPhoneDisplay(item.ownerWhatsapp || '')}
                            </div>
                          </div>
                          <span className="text-[10px] text-fuchsia-700 font-bold">Pilih</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Jenis Hewan</label>
                  <select
                    value={bPetType}
                    onChange={(e) => setBPetType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  >
                    <option value="Cat">🐱 Kucing</option>
                    <option value="Dog">🐶 Anjing</option>
                    <option value="Rabbit">🐰 Kelinci</option>
                    <option value="Exotic">🦜 Eksotik</option>
                    <option value="Farm Animal">🐄 Hewan Ternak</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Layanan yang Dituju</label>
                <select
                  value={bService}
                  onChange={(e) => setBService(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                >
                  <option value="Consultation">Konsultasi Medis Umum</option>
                  <option value="Vaccine">Vaksinasi / Booster</option>
                  <option value="Grooming">Grooming & Spa Medis</option>
                  <option value="Hotel">Penitipan / Rawat Inap (Hotel)</option>
                  <option value="Surgery">Operasi / Tindakan Bedah</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  value={bNotes}
                  onChange={(e) => setBNotes(e.target.value)}
                  placeholder="Contoh: Vaksin F4 booster, puasa dari jam 8 pagi"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    handleClearSelectedPatient();
                  }}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold shadow-xs transition transform active:scale-98 cursor-pointer"
                >
                  Jadwalkan Janji Temu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
