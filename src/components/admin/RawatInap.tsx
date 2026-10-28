import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Hotel,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Thermometer,
  Clock,
  User,
  Plus,
  X,
  ClipboardList,
  LogOut,
  RefreshCw,
  Search,
  Calendar,
  Eye,
  FileText,
  Activity,
  PawPrint,
  ShieldCheck,
  Phone,
  Loader2,
  Pencil,
  Trash2,
  Save,
  MessageCircle,
  Send,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { InpatientCage, InpatientObservation, CageStatus, InpatientHistoryRecord, Pet, Owner, PetType } from '../../types';
import { sanitizeCagesList } from '../../utils/cageUtils';
import { formatPhoneDisplay, toWhatsappNumber } from '../../utils/phoneUtils';
import { formatDateTimeDisplay } from '../../utils/dateUtils';
import { searchPatientsAutocompleteApi } from '../../database/backendSyncClient';
import { getPetEmoji, getPetTypeIndonesian } from '../../utils/petUtils';
import { getPracticingDoctorNames } from '../../utils/staffUtils';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const RawatInap: React.FC<Props> = ({ navigate }) => {
  const {
    cages,
    inpatientHistory,
    updateCageStatus,
    addCageObservation,
    admitPetToCage,
    dischargeCage,
    deleteInpatientHistoryRecord,
    updateInpatientHistoryRecord,
    currentUser,
    staffList,
  } = useClinic();

  const defaultDoctor = useMemo(() => {
    if (currentUser?.isPracticingDoctor) return currentUser.name;
    const practicingVets = getPracticingDoctorNames(staffList);
    return practicingVets[0] || '';
  }, [currentUser, staffList]);

  const formatDoctorPJ = (vet?: string) => {
    if (!vet || typeof vet !== 'string') return '-';
    const clean = vet.trim();
    if (!clean || clean.toLowerCase().includes('sarah wijaya') || clean.toLowerCase().includes('dummy')) {
      return '-';
    }
    return clean;
  };

  const buildInpatientWhatsappResume = (params: {
    petName: string;
    petType?: string;
    ownerName: string;
    cageLabel: string;
    diagnosis?: string;
    veterinarian?: string;
    admittedAt?: string;
    dischargedAt?: string;
    observations: InpatientObservation[];
  }): string => {
    const { petName, petType, ownerName, cageLabel, diagnosis, veterinarian, admittedAt, dischargedAt, observations } = params;

    let msg = `*RESUME OBSERVASI RAWAT INAP - VIER PET CARE* 🐾\n\n`;
    msg += `Halo Kak *${ownerName || 'Klien'}*,\n`;
    msg += `Berikut laporan perkembangan dan observasi berkala anabul selama rawat inap:\n\n`;
    msg += `🐾 *Nama Pasien:* ${petName} (${petType || 'Hewan'})\n`;
    msg += `🏠 *Kandang:* ${cageLabel}\n`;
    msg += `📋 *Diagnosa:* ${diagnosis || '-'}\n`;
    msg += `👨‍⚕️ *Dokter PJ:* ${veterinarian || '-'}\n`;
    msg += `📅 *Mulai Rawat:* ${admittedAt ? formatDateTimeDisplay(admittedAt) : '-'}\n`;
    if (dischargedAt) {
      msg += `🏁 *Selesai Rawat:* ${formatDateTimeDisplay(dischargedAt)}\n`;
    }
    msg += `\n*📊 CATATAN OBSERVASI KLINIS:*`;

    if (!observations || observations.length === 0) {
      msg += `\nBelum ada catatan parameter baru. Pasien saat ini dalam pemantauan tim medis.`;
    } else {
      // Ambil hingga 5 observasi terbaru
      const displayLogs = observations.slice(0, 5);
      displayLogs.forEach((obs, idx) => {
        msg += `\n\n📌 *Log #${idx + 1} (${obs.date} ${obs.time})*`;
        msg += `\n• Suhu Tubuh: ${obs.temp}°C`;
        msg += `\n• Nafsu Makan: ${obs.appetite}`;
        msg += `\n• Ekskresi: ${obs.defecationUrination}`;
        if (obs.medicationGiven !== undefined) {
          msg += `\n• Pemberian Obat: ${obs.medicationGiven ? 'Sudah diberikan ✅' : 'Belum ⏳'}`;
        }
        if (obs.notes) {
          msg += `\n• Catatan: ${obs.notes}`;
        }
        msg += `\n• Pemeriksa: ${obs.checkedBy}`;
      });
      if (observations.length > 5) {
        msg += `\n\n_(Menampilkan 5 dari total ${observations.length} log observasi klinik)_`;
      }
    }

    msg += `\n\nKondisi anabul terus kami pantau dengan seksama. Jika ada pertanyaan, silakan hubungi kami. Terima kasih atas kepercayaannya! 🙏🐾❤️`;
    return msg;
  };

  const handleSendWhatsappResume = (params: {
    ownerWhatsapp?: string;
    petName: string;
    petType?: string;
    ownerName: string;
    cageLabel: string;
    diagnosis?: string;
    veterinarian?: string;
    admittedAt?: string;
    dischargedAt?: string;
    observations: InpatientObservation[];
  }) => {
    const cleanPhone = toWhatsappNumber(params.ownerWhatsapp);
    if (!cleanPhone) {
      alert('Nomor WhatsApp pemilik tidak ditemukan atau format nomor tidak valid.');
      return;
    }
    const text = buildInpatientWhatsappResume(params);
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Pastikan layout HANYA menampilkan 12 kandang fisik standar (A1-A6 & B1-B6)
  const activeLayoutCages = useMemo(() => {
    return sanitizeCagesList(cages);
  }, [cages]);

  const [activeTab, setActiveTab] = useState<'layout' | 'history'>('layout');
  const [selectedCageId, setSelectedCageId] = useState<string>('A1');
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<InpatientHistoryRecord | null>(null);

  // History Search filter
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // Edit & Delete Inpatient History modal state
  const [editingHistoryRecord, setEditingHistoryRecord] = useState<InpatientHistoryRecord | null>(null);
  const [editPetName, setEditPetName] = useState('');
  const [editPetType, setEditPetType] = useState<PetType>('Cat');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editOwnerWhatsapp, setEditOwnerWhatsapp] = useState('');
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [editAdmittedAt, setEditAdmittedAt] = useState('');
  const [editDischargedAt, setEditDischargedAt] = useState('');
  const [editVeterinarian, setEditVeterinarian] = useState('');

  // Populate edit form when editingHistoryRecord changes
  useEffect(() => {
    if (editingHistoryRecord) {
      setEditPetName(editingHistoryRecord.petName || '');
      setEditPetType((editingHistoryRecord.petType as PetType) || 'Cat');
      setEditOwnerName(editingHistoryRecord.ownerName || '');
      setEditOwnerWhatsapp(editingHistoryRecord.ownerWhatsapp || '');
      setEditDiagnosis(editingHistoryRecord.diagnosis || '');
      setEditAdmittedAt(editingHistoryRecord.admittedAt || '');
      setEditDischargedAt(editingHistoryRecord.dischargedAt || '');
      setEditVeterinarian(editingHistoryRecord.veterinarian || defaultDoctor);
    }
  }, [editingHistoryRecord, defaultDoctor]);

  const handleSaveHistoryEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHistoryRecord) return;

    updateInpatientHistoryRecord(editingHistoryRecord.id, {
      petName: editPetName,
      petType: editPetType,
      ownerName: editOwnerName,
      ownerWhatsapp: editOwnerWhatsapp,
      diagnosis: editDiagnosis,
      admittedAt: editAdmittedAt,
      dischargedAt: editDischargedAt,
      veterinarian: editVeterinarian,
    });

    setEditingHistoryRecord(null);
  };

  const handleDeleteHistory = (item: InpatientHistoryRecord) => {
    if (
      window.confirm(
        `Apakah Anda yakin ingin menghapus data riwayat rawat inap pasien "${item.petName}" (${item.ownerName})?\n\nData ini juga akan dihapus dari Google Spreadsheet.`
      )
    ) {
      deleteInpatientHistoryRecord(item.id);
    }
  };

  // Admit form state with lazy load / on-demand search
  const [selectedAdmitPet, setSelectedAdmitPet] = useState<Pet | null>(null);
  const [admitSearchQuery, setAdmitSearchQuery] = useState('');
  const [admitSearchResults, setAdmitSearchResults] = useState<any[]>([]);
  const [isSearchingAdmit, setIsSearchingAdmit] = useState(false);
  const [admitDiagnosis, setAdmitDiagnosis] = useState('');

  // Search autocomplete for admit modal
  useEffect(() => {
    if (!showAdmitModal) return;

    let isMounted = true;
    setIsSearchingAdmit(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatientsAutocompleteApi(admitSearchQuery, 20);
        if (isMounted) {
          setAdmitSearchResults(results);
          if (!selectedAdmitPet && results.length > 0 && !admitSearchQuery) {
            setSelectedAdmitPet(results[0]);
          }
        }
      } finally {
        if (isMounted) setIsSearchingAdmit(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [showAdmitModal, admitSearchQuery]);

  // Observation form state (dimulai dari kosong)
  const [obsTemp, setObsTemp] = useState<number | ''>('');
  const [obsAppetite, setObsAppetite] = useState<'Lahap' | 'Sedang' | 'Menolak' | ''>('');
  const [obsElimination, setObsElimination] = useState<'Normal' | 'Abnormal' | 'Belum Ada' | ''>('');
  const [obsMedGiven, setObsMedGiven] = useState(false);
  const [obsCleaned, setObsCleaned] = useState(false);
  const [obsNotes, setObsNotes] = useState('');

  const currentCageData = activeLayoutCages.find((c) => c.id === selectedCageId) || activeLayoutCages[0];
  const selectedCage = currentCageData;

  // Counts - dihitung dari 12 unit fisik aktif
  const occupiedCount = activeLayoutCages.filter((c) => c.status === 'Occupied').length;
  const cleaningCount = activeLayoutCages.filter((c) => c.status === 'Cleaning').length;
  const availableCount = activeLayoutCages.filter((c) => c.status === 'Available').length;

  const filteredHistory = useMemo(() => {
    if (!historySearchQuery.trim()) return inpatientHistory;
    const q = historySearchQuery.toLowerCase().trim();
    return inpatientHistory.filter(
      (h) =>
        (h.petName || '').toLowerCase().includes(q) ||
        (h.ownerName || '').toLowerCase().includes(q) ||
        (h.diagnosis || '').toLowerCase().includes(q) ||
        (h.cageId || '').toLowerCase().includes(q) ||
        (h.cageLabel || '').toLowerCase().includes(q) ||
        (h.veterinarian || '').toLowerCase().includes(q)
    );
  }, [inpatientHistory, historySearchQuery]);

  const handleAddObservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCageData) return;

    const tempNum = typeof obsTemp === 'number' ? obsTemp : parseFloat(obsTemp) || 38.5;
    const appetiteVal = (obsAppetite || 'Sedang') as 'Lahap' | 'Sedang' | 'Menolak';
    const eliminationVal = (obsElimination || 'Normal') as 'Normal' | 'Abnormal' | 'Belum Ada';

    const now = new Date();
    addCageObservation(currentCageData.id, {
      date: now.toISOString().split('T')[0],
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      temp: tempNum,
      appetite: appetiteVal,
      defecationUrination: eliminationVal,
      medicationGiven: obsMedGiven,
      cleaned: obsCleaned,
      notes: obsNotes || 'Pemeriksaan rutin berjalan tertib.',
      checkedBy: currentUser?.name || defaultDoctor,
    });

    setObsTemp('');
    setObsAppetite('');
    setObsElimination('');
    setObsMedGiven(false);
    setObsCleaned(false);
    setObsNotes('');
  };

  const handleAdmitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCage || !selectedAdmitPet) return;

    const pet: Pet = {
      id: selectedAdmitPet.id,
      name: selectedAdmitPet.name,
      type: selectedAdmitPet.type,
      breed: selectedAdmitPet.breed || '',
      sex: (selectedAdmitPet.sex === 'Betina' ? 'Betina' : 'Jantan') as 'Jantan' | 'Betina',
      weight: Number(selectedAdmitPet.weight) || 0,
      ageOrDob: selectedAdmitPet.ageOrDob || '',
      ownerWhatsapp: selectedAdmitPet.ownerWhatsapp || '',
      status: 'Rawat Inap',
      registeredAt: selectedAdmitPet.registeredAt || new Date().toISOString().split('T')[0],
      ownerName: selectedAdmitPet.ownerName || '',
    };

    const owner: Owner = {
      id: selectedAdmitPet.ownerId || 'own-admit',
      name: selectedAdmitPet.ownerName || 'Pemilik',
      whatsapp: selectedAdmitPet.ownerWhatsapp || '',
      address: (selectedAdmitPet as any).ownerAddress || '-',
      registeredAt: selectedAdmitPet.registeredAt || new Date().toISOString().split('T')[0],
    };

    admitPetToCage(
      selectedCage.id,
      pet,
      owner,
      admitDiagnosis || 'Observasi Medis Pasca Tindakan',
      currentUser?.isPracticingDoctor ? currentUser.name : (defaultDoctor || '')
    );

    setShowAdmitModal(false);
    setSelectedAdmitPet(null);
    setAdmitSearchQuery('');
    setAdmitDiagnosis('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <Hotel className="w-6 h-6 text-fuchsia-700" />
            <span>Manajemen Rawat Inap (Kennel & Cages)</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Layout kandang ruang rawat inap aktif dan dokumentasi riwayat rekam medis rawat inap pasien.
          </p>
        </div>

        {/* Status Legend Pills */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="flex items-center gap-1.5 bg-rose-50 text-rose-800 px-2.5 py-1 rounded-full border border-rose-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Terisi ({occupiedCount})</span>
          </span>
          <span className="flex items-center gap-1.5 bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>Disinfeksi ({cleaningCount})</span>
          </span>
          <span className="flex items-center gap-1.5 bg-fuchsia-50 text-fuchsia-800 px-2.5 py-1 rounded-full border border-fuchsia-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-fuchsia-600"></span>
            <span>Tersedia ({availableCount})</span>
          </span>
        </div>
      </div>

      {/* Navigation Tabs: Layout vs History */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          onClick={() => setActiveTab('layout')}
          className={`px-4 py-2.5 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'layout'
              ? 'border-fuchsia-700 text-fuchsia-900 bg-fuchsia-50/50 rounded-t-xl'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Hotel className="w-4 h-4" />
          <span>Layout Kandang Aktif</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-800">
            {activeLayoutCages.length} Kandang
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'history'
              ? 'border-fuchsia-700 text-fuchsia-900 bg-fuchsia-50/50 rounded-t-xl'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Riwayat Rawat Inap (Rekam Medis)</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800 font-bold">
            {inpatientHistory.length} Record
          </span>
        </button>
      </div>

      {/* TAB 1: LAYOUT KANDANG RUANG RAWAT */}
      {activeTab === 'layout' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT 7 COLS: VISUAL INTERACTIVE CAGE GRID */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center justify-between">
                <span>Layout Kandang Ruang Rawat (A1 - B6)</span>
                <span className="text-[11px] text-fuchsia-700 font-mono font-bold">Total {activeLayoutCages.length} Unit</span>
              </h3>

              {/* Grid representation */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {activeLayoutCages.map((cage) => {
                  const isSelected = selectedCage?.id === cage.id;
                  const isOccupied = cage.status === 'Occupied';
                  const isCleaning = cage.status === 'Cleaning';
                  const isAvailable = cage.status === 'Available';

                  return (
                    <div
                      key={cage.id}
                      onClick={() => setSelectedCageId(cage.id)}
                      className={`cursor-pointer rounded-2xl p-4 border transition duration-150 flex flex-col justify-between relative overflow-hidden group ${
                        isSelected ? 'ring-2 ring-fuchsia-600 shadow-xs' : 'shadow-2xs'
                      } ${
                        isOccupied
                          ? 'bg-rose-50/50 border-rose-200 hover:border-rose-400'
                          : isCleaning
                          ? 'bg-amber-50/50 border-amber-200 hover:border-amber-400'
                          : 'bg-neutral-50/70 border-neutral-200 hover:border-fuchsia-300'
                      }`}
                    >
                      {/* Top Cage ID & Status Tag */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-black text-base text-neutral-900">
                          {cage.id}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isOccupied
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : isCleaning
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200'
                          }`}
                        >
                          {isAvailable ? 'Kosong' : cage.status}
                        </span>
                      </div>

                      {/* Middle: Patient Info if Occupied or Empty State */}
                      <div className="my-2 min-h-[52px]">
                        {isOccupied ? (
                          <div>
                            <p className="font-extrabold text-sm text-neutral-900 flex items-center gap-1.5">
                              <span>{cage.petType === 'Cat' ? '🐱' : cage.petType === 'Dog' ? '🐶' : '🐰'}</span>
                              <span className="truncate">{cage.petName}</span>
                            </p>
                            <p className="text-[11px] text-neutral-600 line-clamp-1 mt-0.5">
                              {cage.diagnosis || 'Perawatan intensif'}
                            </p>
                            <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                              Masuk: {cage.admittedAt?.split(' ')[0]}
                            </p>
                          </div>
                        ) : isCleaning ? (
                          <div className="flex flex-col justify-center h-full">
                            <p className="text-xs text-amber-800 font-semibold flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                              <span>Sterilisasi</span>
                            </p>
                            <p className="text-[10px] text-neutral-500 mt-0.5">Siap setelah disinfeksi</p>
                          </div>
                        ) : (
                          <div className="flex flex-col justify-center h-full">
                            <p className="text-xs text-fuchsia-800 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-fuchsia-600" />
                              <span>Kandang Kosong</span>
                            </p>
                            <p className="text-[10px] text-neutral-500 mt-0.5">Belum ada pasien yang dirawat</p>
                          </div>
                        )}
                      </div>

                      {/* Footer indicator */}
                      <div className="pt-2 border-t border-neutral-200 text-[10px] text-neutral-500 flex items-center justify-between font-mono">
                        <span>{isOccupied ? `${(cage.observations || []).length} Log Observasi` : 'Siapdigunakan'}</span>
                        <span className="text-fuchsia-700 font-semibold group-hover:underline">Pilih →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: CAGE DETAIL & CLINICAL OBSERVATION CHECKLIST */}
          <div className="lg:col-span-5 space-y-4">
            {currentCageData && (
              <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs space-y-5">
                {/* Cage Banner */}
                <div className="pb-3 border-b border-neutral-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
                      <span>Detail {currentCageData.label}</span>
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Status Saat Ini:{' '}
                      <strong className="text-neutral-900">
                        {currentCageData.status === 'Available' ? 'Kosong (Tersedia)' : currentCageData.status}
                      </strong>
                    </p>
                  </div>

                  {/* Status action buttons */}
                  <div className="flex items-center gap-1.5">
                    {currentCageData.status === 'Available' && (
                      <button
                        onClick={() => setShowAdmitModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        + Masukkan Pasien
                      </button>
                    )}

                    {currentCageData.status === 'Cleaning' && (
                      <button
                        onClick={() => updateCageStatus(currentCageData.id, 'Available')}
                        className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-200 font-bold text-xs transition cursor-pointer"
                      >
                        Tandai Selesai Bersih
                      </button>
                    )}

                    {currentCageData.status === 'Occupied' && (
                      <button
                        onClick={() => dischargeCage(currentCageData.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition cursor-pointer"
                        title="Selesaikan rawat inap & simpan ke data riwayat rekam medis"
                      >
                        Pasien Pulang (Discharge)
                      </button>
                    )}
                  </div>
                </div>

                {/* Patient details if occupied */}
                {currentCageData.status === 'Occupied' && (
                  <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-neutral-900 gap-2">
                      <span>Pasien: {currentCageData.petName} ({currentCageData.petType})</span>
                      {currentCageData.ownerWhatsapp ? (
                        <a
                          href={`https://wa.me/${toWhatsappNumber(currentCageData.ownerWhatsapp)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 hover:underline font-mono text-[11px] font-bold flex items-center gap-0.5"
                          title="Hubungi lewat WhatsApp"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          <span>{formatPhoneDisplay(currentCageData.ownerWhatsapp)}</span>
                        </a>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </div>
                    <p className="text-neutral-600">Pemilik: <strong className="text-neutral-800">{currentCageData.ownerName}</strong></p>
                    <p className="text-rose-700 font-medium">Diagnosa: {currentCageData.diagnosis}</p>
                    <p className="text-neutral-400 text-[11px]">Dokter PJ: {formatDoctorPJ(currentCageData.veterinarian)}</p>

                    {/* Button Kirim Resume ke WhatsApp */}
                    {currentCageData.ownerWhatsapp && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSendWhatsappResume({
                            ownerWhatsapp: currentCageData.ownerWhatsapp,
                            petName: currentCageData.petName || 'Pasien',
                            petType: currentCageData.petType,
                            ownerName: currentCageData.ownerName || 'Pemilik',
                            cageLabel: currentCageData.label || `Kandang ${currentCageData.id}`,
                            diagnosis: currentCageData.diagnosis,
                            veterinarian: formatDoctorPJ(currentCageData.veterinarian),
                            admittedAt: currentCageData.admittedAt,
                            observations: currentCageData.observations || [],
                          })
                        }
                        className="w-full mt-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                        title="Kirim resume observasi klinis ke WhatsApp pemilik"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Kirim Resume ke WhatsApp Pemilik</span>
                      </button>
                    )}
                  </div>
                )}

                {/* DAILY CLINICAL PARAMETERS OBSERVATION CHECKLIST FORM */}
                {currentCageData.status === 'Occupied' ? (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-3 flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-fuchsia-700" />
                      <span>Checklist Observasi Parameter Harian</span>
                    </h4>

                    <form onSubmit={handleAddObservation} className="space-y-3 text-xs">
                      {/* Temperature */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                            Suhu Tubuh (°C)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            required
                            value={obsTemp}
                            onChange={(e) => setObsTemp(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            placeholder="misal 38.5"
                            className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono font-bold focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                          />
                        </div>

                        {/* Appetite */}
                        <div>
                          <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                            Nafsu Makan
                          </label>
                          <select
                            required
                            value={obsAppetite}
                            onChange={(e) => setObsAppetite(e.target.value as any)}
                            className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                          >
                            <option value="">-- Pilih Nafsu Makan --</option>
                            <option value="Lahap">Lahap</option>
                            <option value="Sedang">Sedang</option>
                            <option value="Menolak">Menolak (Anorexia)</option>
                          </select>
                        </div>
                      </div>

                      {/* Defecation / Urination */}
                      <div>
                        <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                          Defekasi & Urinasi
                        </label>
                        <select
                          required
                          value={obsElimination}
                          onChange={(e) => setObsElimination(e.target.value as any)}
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                        >
                          <option value="">-- Pilih Defekasi / Urin --</option>
                          <option value="Normal">Normal (Feses padat, urin jernih)</option>
                          <option value="Abnormal">Abnormal (Diare / Hematuria)</option>
                          <option value="Belum Ada">Belum Ada</option>
                        </select>
                      </div>

                      {/* Checkboxes: Medication Given & Cleaned */}
                      <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                        <label className="flex items-center gap-2 cursor-pointer text-neutral-700">
                          <input
                            type="checkbox"
                            checked={obsMedGiven}
                            onChange={(e) => setObsMedGiven(e.target.checked)}
                            className="rounded border-neutral-300 text-fuchsia-600 focus:ring-fuchsia-500"
                          />
                          <span className="font-semibold">Obat Diberikan</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-neutral-700">
                          <input
                            type="checkbox"
                            checked={obsCleaned}
                            onChange={(e) => setObsCleaned(e.target.checked)}
                            className="rounded border-neutral-300 text-fuchsia-600 focus:ring-fuchsia-500"
                          />
                          <span className="font-semibold">Alas Diganti</span>
                        </label>
                      </div>

                      {/* Observation notes */}
                      <div>
                        <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                          Catatan Parameter / Reaksi Pasien
                        </label>
                        <input
                          type="text"
                          value={obsNotes}
                          onChange={(e) => setObsNotes(e.target.value)}
                          placeholder="Contoh: Infus lancar 10 tpm, respon aktif, tidak muntah..."
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 placeholder-neutral-400 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2 px-3 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        + Tambah Log Observasi
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="p-5 text-center text-neutral-500 text-xs bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-2">
                    <Hotel className="w-8 h-8 text-neutral-300 mx-auto" />
                    <p className="font-bold text-neutral-700">
                      Kandang {currentCageData.id} Sedang {currentCageData.status === 'Cleaning' ? 'Dalam Sterilisasi' : 'Kosong'}
                    </p>
                    <p className="text-[11px] text-neutral-500 max-w-xs mx-auto">
                      Belum ada pasien yang sedang dirawat di kandang ini. Klik tombol <strong className="text-neutral-800">+ Masukkan Pasien</strong> untuk mendaftarkan rawat inap baru.
                    </p>
                  </div>
                )}

                {/* Historical observations log for active cage */}
                {(currentCageData.observations || []).length > 0 && (
                  <div className="pt-4 border-t border-neutral-100">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Log Observasi Parameter Harian ({(currentCageData.observations || []).length})
                      </h4>
                      {currentCageData.ownerWhatsapp && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSendWhatsappResume({
                              ownerWhatsapp: currentCageData.ownerWhatsapp,
                              petName: currentCageData.petName || 'Pasien',
                              petType: currentCageData.petType,
                              ownerName: currentCageData.ownerName || 'Pemilik',
                              cageLabel: currentCageData.label || `Kandang ${currentCageData.id}`,
                              diagnosis: currentCageData.diagnosis,
                              veterinarian: formatDoctorPJ(currentCageData.veterinarian),
                              admittedAt: currentCageData.admittedAt,
                              observations: currentCageData.observations || [],
                            })
                          }
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                          title="Kirim seluruh riwayat log observasi ini ke WhatsApp pemilik"
                        >
                          <MessageCircle className="w-3 h-3 text-emerald-600" />
                          <span>Kirim Resume WA</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {(currentCageData.observations || []).map((obs) => (
                        <div
                          key={obs.id}
                          className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between font-mono text-fuchsia-800">
                            <span>{obs.date} {obs.time}</span>
                            <span className="text-neutral-900 font-bold">{obs.temp}°C</span>
                          </div>
                          <div className="flex items-center gap-3 text-neutral-600">
                            <span>Makan: <strong className="text-neutral-900">{obs.appetite}</strong></span>
                            <span>Ekskresi: <strong className="text-neutral-900">{obs.defecationUrination}</strong></span>
                          </div>
                          <p className="text-neutral-700">{obs.notes}</p>
                          <p className="text-neutral-400 text-[10px]">Oleh: {obs.checkedBy}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RIWAYAT RAWAT INAP (REKAM MEDIS) */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-fuchsia-700" />
                <span>Arsip Rekam Medis & Riwayat Rawat Inap Pasien</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Data pasien selesai rawat inap otomatis masuk ke Rekam Medis (SOAP) dan tersimpan di Sheet Rawat Inap (mulai baris 14).
              </p>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari nama pasien, pemilik, diagnosa..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
              />
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200 space-y-2">
              <ClipboardList className="w-10 h-10 text-neutral-300 mx-auto" />
              <p className="text-sm font-bold text-neutral-700">Belum Ada Data Riwayat Rawat Inap</p>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                {historySearchQuery
                  ? 'Tidak ditemukan data riwayat rawat inap sesuai pencarian Anda.'
                  : 'Pasien yang telah selesai menjalani rawat inap (Discharge) akan otomatis masuk ke daftar riwayat ini.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600 font-bold uppercase text-[10px] tracking-wider border-b border-neutral-200">
                  <tr>
                    <th className="px-4 py-3">Pasien & Hewan</th>
                    <th className="px-4 py-3">Pemilik & WhatsApp</th>
                    <th className="px-4 py-3">Unit Kandang</th>
                    <th className="px-4 py-3">Diagnosa / Alasan</th>
                    <th className="px-4 py-3">Tanggal Masuk</th>
                    <th className="px-4 py-3">Tanggal Pulang</th>
                    <th className="px-4 py-3">Dokter PJ</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50/80 transition">
                      <td className="px-4 py-3">
                        <div className="font-extrabold text-neutral-900 flex items-center gap-1.5">
                          <span>{item.petType === 'Cat' ? '🐱' : item.petType === 'Dog' ? '🐶' : '🐰'}</span>
                          <span>{item.petName}</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 font-mono">{item.petType}</span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-neutral-800">{item.ownerName}</div>
                        {item.ownerWhatsapp ? (
                          <a
                            href={`https://wa.me/${toWhatsappNumber(item.ownerWhatsapp)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline font-mono font-bold flex items-center gap-0.5"
                            title="Hubungi lewat WhatsApp"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            <span>{formatPhoneDisplay(item.ownerWhatsapp)}</span>
                          </a>
                        ) : (
                          <span className="text-neutral-400 font-mono text-[10px]">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-neutral-400">
                        {item.cageId && !item.cageId.startsWith('cag-') ? (
                          <span className="font-mono font-bold bg-fuchsia-50 text-fuchsia-900 px-2 py-0.5 rounded border border-fuchsia-200 text-[11px]">
                            {item.cageId}
                          </span>
                        ) : (
                          <span className="text-neutral-300">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-medium text-rose-700 max-w-[200px] truncate">
                        {item.diagnosis}
                      </td>

                      <td className="px-4 py-3 font-mono text-neutral-700 whitespace-nowrap">
                        {formatDateTimeDisplay(item.admittedAt)}
                      </td>

                      <td className="px-4 py-3 font-mono text-neutral-700 whitespace-nowrap">
                        {item.dischargedAt ? formatDateTimeDisplay(item.dischargedAt) : '-'}
                      </td>

                      <td className="px-4 py-3 font-medium text-neutral-700">
                        {formatDoctorPJ(item.veterinarian)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.ownerWhatsapp && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSendWhatsappResume({
                                  ownerWhatsapp: item.ownerWhatsapp,
                                  petName: item.petName || 'Pasien',
                                  petType: item.petType,
                                  ownerName: item.ownerName || 'Pemilik',
                                  cageLabel: item.cageLabel || `Kandang ${item.cageId}`,
                                  diagnosis: item.diagnosis,
                                  veterinarian: formatDoctorPJ(item.veterinarian),
                                  admittedAt: item.admittedAt,
                                  dischargedAt: item.dischargedAt,
                                  observations: item.observations || [],
                                })
                              }
                              className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-[11px] border border-emerald-200 transition cursor-pointer flex items-center gap-1"
                              title="Kirim Resume Observasi ke WhatsApp Pemilik"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Resume WA</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedHistoryRecord(item)}
                            className="px-2 py-1 rounded-lg bg-fuchsia-50 text-fuchsia-800 hover:bg-fuchsia-100 font-bold text-[11px] border border-fuchsia-200 transition cursor-pointer flex items-center gap-1"
                            title="Lihat Detail Log Observasi"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Log ({(item.observations || []).length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingHistoryRecord(item)}
                            className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-[11px] border border-amber-200 transition cursor-pointer flex items-center gap-1"
                            title="Edit Data Riwayat Rawat Inap"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteHistory(item)}
                            className="px-2 py-1 rounded-lg bg-rose-50 text-rose-800 hover:bg-rose-100 font-bold text-[11px] border border-rose-200 transition cursor-pointer flex items-center gap-1"
                            title="Hapus Data Riwayat Rawat Inap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ADMIT PATIENT MODAL */}
      {showAdmitModal && selectedCage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-lg w-full p-6 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div>
                <h3 className="font-bold text-base text-neutral-900">Masukkan Pasien ke Kandang {selectedCage.id}</h3>
                <p className="text-[11px] text-neutral-500">Cari pasien langsung dari backend secara on-demand</p>
              </div>
              <button
                onClick={() => setShowAdmitModal(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer p-1 rounded-lg hover:bg-neutral-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdmitSubmit} className="space-y-4 text-xs">
              {/* Patient Search & Selection */}
              <div>
                <label className="block text-neutral-800 font-bold mb-1.5 flex items-center justify-between">
                  <span>Pilih Pasien Hewan:</span>
                  {isSearchingAdmit && (
                    <span className="text-[11px] text-fuchsia-700 font-normal flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Memuat...
                    </span>
                  )}
                </label>

                {/* Search Bar */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    value={admitSearchQuery}
                    onChange={(e) => setAdmitSearchQuery(e.target.value)}
                    placeholder="Ketik nama hewan, pemilik, atau no. WA..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-medium text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500"
                  />
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                  {admitSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAdmitSearchQuery('')}
                      className="absolute right-2.5 top-2 text-neutral-400 hover:text-neutral-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Candidate Selection List */}
                <div className="max-h-44 overflow-y-auto rounded-xl border border-neutral-200 divide-y divide-neutral-100 bg-neutral-50/50 p-1">
                  {admitSearchResults.length === 0 ? (
                    <div className="p-4 text-center text-neutral-400">
                      {isSearchingAdmit ? 'Mencari...' : 'Pasien tidak ditemukan'}
                    </div>
                  ) : (
                    admitSearchResults.map((p) => {
                      const isSelected = selectedAdmitPet?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedAdmitPet(p)}
                          className={`w-full p-2.5 rounded-lg text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-fuchsia-100/80 border border-fuchsia-300'
                              : 'hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-base">{getPetEmoji(p.type)}</span>
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-900 truncate text-xs">
                                {p.name}{' '}
                                <span className="font-normal text-neutral-500 text-[10px]">
                                  ({getPetTypeIndonesian(p.type)} - {p.breed || 'Mix'})
                                </span>
                              </p>
                              <p className="text-[10px] text-neutral-500 truncate">
                                Owner: <strong className="text-neutral-700">{p.ownerName || 'Klien'}</strong> • {formatPhoneDisplay(p.ownerWhatsapp)}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-fuchsia-700 shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Selected Pet Confirmation Card */}
              {selectedAdmitPet && (
                <div className="p-3 bg-fuchsia-50/70 border border-fuchsia-200 rounded-xl flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-fuchsia-200 flex items-center justify-center text-xl shrink-0">
                    {getPetEmoji(selectedAdmitPet.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-neutral-900 text-xs">
                      {selectedAdmitPet.name}{' '}
                      <span className="text-[10px] font-semibold text-fuchsia-800 bg-fuchsia-100 px-1.5 py-0.5 rounded">
                        Kandang {selectedCage.id}
                      </span>
                    </p>
                    <p className="text-[11px] text-neutral-600 truncate">
                      Pemilik: {selectedAdmitPet.ownerName || 'Klien'} • WA: {formatPhoneDisplay(selectedAdmitPet.ownerWhatsapp)}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Diagnosa / Alasan Rawat Inap</label>
                <textarea
                  rows={2}
                  required
                  value={admitDiagnosis}
                  onChange={(e) => setAdmitDiagnosis(e.target.value)}
                  placeholder="Contoh: Parvovirus Therapy / Post-Op Ovariohysterectomy / Severe Dehydration"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!selectedAdmitPet}
                  className="px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Konfirmasi Rawat Inap</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL HISTORY MODAL */}
      {selectedHistoryRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-xl w-full p-6 text-neutral-900 space-y-4 my-8 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-fuchsia-700" />
                <h3 className="font-bold text-base text-neutral-900">
                  Rekam Medis Rawat Inap Pasien
                </h3>
              </div>
              <button
                onClick={() => setSelectedHistoryRecord(null)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Card Header Info */}
            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 text-xs space-y-2">
              <div className="flex items-center justify-between font-bold text-neutral-900">
                <span className="text-sm">Pasien: {selectedHistoryRecord.petName} ({selectedHistoryRecord.petType})</span>
                <span className="bg-fuchsia-100 text-fuchsia-800 px-2.5 py-0.5 rounded font-mono">
                  {selectedHistoryRecord.cageId}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-neutral-600">
                <p>Pemilik: <strong className="text-neutral-800">{selectedHistoryRecord.ownerName}</strong></p>
                <p className="flex items-center gap-1.5">
                  <span>WhatsApp:</span>
                  {selectedHistoryRecord.ownerWhatsapp ? (
                    <a
                      href={`https://wa.me/${toWhatsappNumber(selectedHistoryRecord.ownerWhatsapp)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-600 hover:text-emerald-700 hover:underline font-mono font-bold flex items-center gap-0.5"
                    >
                      <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>{formatPhoneDisplay(selectedHistoryRecord.ownerWhatsapp)}</span>
                    </a>
                  ) : (
                    <span className="text-neutral-400 font-mono">-</span>
                  )}
                </p>
                <p>Masuk: <strong className="text-neutral-800 font-mono">{formatDateTimeDisplay(selectedHistoryRecord.admittedAt)}</strong></p>
                <p>Pulang: <strong className="text-neutral-800 font-mono">{selectedHistoryRecord.dischargedAt ? formatDateTimeDisplay(selectedHistoryRecord.dischargedAt) : '-'}</strong></p>
              </div>
              <p className="text-rose-700 font-medium pt-1 border-t border-neutral-200">
                Diagnosa: {selectedHistoryRecord.diagnosis}
              </p>
              <p className="text-neutral-500 text-[11px]">
                Dokter Penanggung Jawab: {formatDoctorPJ(selectedHistoryRecord.veterinarian)}
              </p>
            </div>

            {/* Observations History Log */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-2">
                Log Parameter Observasi Klinis Harian ({(selectedHistoryRecord.observations || []).length})
              </h4>

              {(selectedHistoryRecord.observations || []).length === 0 ? (
                <p className="text-xs text-neutral-500 italic bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                  Tidak ada catatan observasi harian untuk sesi rawat inap ini.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {(selectedHistoryRecord.observations || []).map((obs) => (
                    <div
                      key={obs.id}
                      className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono text-fuchsia-800 font-bold">
                        <span>{obs.date} {obs.time}</span>
                        <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {obs.temp}°C
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-neutral-600">
                        <span>Nafsu Makan: <strong className="text-neutral-900">{obs.appetite}</strong></span>
                        <span>Ekskresi: <strong className="text-neutral-900">{obs.defecationUrination}</strong></span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                        <span>Obat: {obs.medicationGiven ? '✅ Ya' : '❌ Tidak'}</span>
                        <span>Alas: {obs.cleaned ? '✅ Diganti' : '❌ Belum'}</span>
                      </div>
                      <p className="text-neutral-800 pt-1 border-t border-neutral-200/60 font-medium">
                        {obs.notes}
                      </p>
                      <p className="text-neutral-400 text-[10px]">Oleh: {obs.checkedBy}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-neutral-100">
              {selectedHistoryRecord.ownerWhatsapp ? (
                <button
                  type="button"
                  onClick={() =>
                    handleSendWhatsappResume({
                      ownerWhatsapp: selectedHistoryRecord.ownerWhatsapp,
                      petName: selectedHistoryRecord.petName || 'Pasien',
                      petType: selectedHistoryRecord.petType,
                      ownerName: selectedHistoryRecord.ownerName || 'Pemilik',
                      cageLabel: selectedHistoryRecord.cageLabel || `Kandang ${selectedHistoryRecord.cageId}`,
                      diagnosis: selectedHistoryRecord.diagnosis,
                      veterinarian: formatDoctorPJ(selectedHistoryRecord.veterinarian),
                      admittedAt: selectedHistoryRecord.admittedAt,
                      dischargedAt: selectedHistoryRecord.dischargedAt,
                      observations: selectedHistoryRecord.observations || [],
                    })
                  }
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="Kirim resume log observasi rawat inap ini ke WhatsApp pemilik"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Kirim Resume ke WhatsApp Pemilik</span>
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={() => setSelectedHistoryRecord(null)}
                className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT INPATIENT HISTORY RECORD MODAL */}
      {editingHistoryRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-lg w-full p-6 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-extrabold text-neutral-900">
                  Edit Riwayat Rawat Inap
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingHistoryRecord(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHistoryEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    Nama Pasien
                  </label>
                  <input
                    type="text"
                    required
                    value={editPetName}
                    onChange={(e) => setEditPetName(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-bold focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    Jenis Hewan
                  </label>
                  <select
                    value={editPetType}
                    onChange={(e) => setEditPetType(e.target.value as PetType)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Cat">🐱 Kucing (Cat)</option>
                    <option value="Dog">🐶 Anjing (Dog)</option>
                    <option value="Rabbit">🐰 Kelinci (Rabbit)</option>
                    <option value="Bird">🦜 Burung (Bird)</option>
                    <option value="Other">🐾 Lainnya</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    Nama Pemilik
                  </label>
                  <input
                    type="text"
                    required
                    value={editOwnerName}
                    onChange={(e) => setEditOwnerName(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    WhatsApp Pemilik
                  </label>
                  <input
                    type="text"
                    value={editOwnerWhatsapp}
                    onChange={(e) => setEditOwnerWhatsapp(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Diagnosa / Alasan Rawat Inap
                </label>
                <input
                  type="text"
                  required
                  value={editDiagnosis}
                  onChange={(e) => setEditDiagnosis(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    Tanggal & Waktu Masuk
                  </label>
                  <input
                    type="text"
                    value={editAdmittedAt}
                    onChange={(e) => setEditAdmittedAt(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono text-[11px] focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    Tanggal & Waktu Pulang
                  </label>
                  <input
                    type="text"
                    value={editDischargedAt}
                    onChange={(e) => setEditDischargedAt(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono text-[11px] focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Dokter Penanggung Jawab (Dokter PJ)
                </label>
                <input
                  type="text"
                  value={editVeterinarian}
                  onChange={(e) => setEditVeterinarian(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-neutral-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingHistoryRecord(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
