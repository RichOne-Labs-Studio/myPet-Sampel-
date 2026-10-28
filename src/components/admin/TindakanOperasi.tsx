import React, { useState, useMemo } from 'react';
import {
  Syringe,
  Plus,
  Search,
  Calendar,
  Clock,
  User,
  PawPrint,
  FileText,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  MessageCircle,
  Copy,
  Activity,
  HeartPulse,
  Pill,
  Send,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { SurgeryRecord, SurgeryStatus, PetType, Pet } from '../../types';
import { formatPhoneDisplay, toWhatsappNumber } from '../../utils/phoneUtils';
import { getPetEmoji, getPetTypeIndonesian } from '../../utils/petUtils';
import { getPracticingDoctorNames } from '../../utils/staffUtils';

interface Props {
  navigate: (to: AppRoute) => void;
}

const COMMON_SURGERY_TYPES = [
  'Ovariohisterektomi (OH / Steril Betina)',
  'Kastrasi (Orkhiektomi / Steril Jantan)',
  'Laparatomi Eksplorasi',
  'Herniotomi (Umbilikalis / Inguinalis)',
  'Enukleasi Bulbi',
  'Ekstirpasi Tumor Mammae',
  'Sistotomi (Batu VU / Saluran Kemih)',
  'Pinning / Fiksasi Fraktur Tulang',
  'Penjahitan Luka (Vulnus Debridement)',
  'Amputasi (Digit / Ekor / Ekstremitas)',
  'Dental Scaling & Ekstraksi Gigi',
  'Sectio Caesarea (Operasi Caesar)',
];

export const TindakanOperasi: React.FC<Props> = ({ navigate }) => {
  const {
    surgeries,
    addSurgeryRecord,
    updateSurgeryRecord,
    deleteSurgeryRecord,
    pets,
    owners,
    currentUser,
    staffList,
  } = useClinic();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | SurgeryStatus>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [detailSurgery, setDetailSurgery] = useState<SurgeryRecord | null>(null);
  const [copiedResume, setCopiedResume] = useState(false);

  // Form State
  const initialFormData: Partial<SurgeryRecord> = {
    petId: '',
    petName: '',
    petType: 'Cat',
    ownerName: '',
    ownerWhatsapp: '',
    operationType: '',
    atropineDose: '',
    xylazineDose: '',
    ketamineDose: '',
    acpDose: '',
    yohimbineDose: '',
    antibioticDoseAndType: '',
    analgesicDoseAndType: '',
    operator: currentUser?.isPracticingDoctor ? currentUser.name : '',
    operationNotes: '',
    status: 'Dijadwalkan',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };

  const [formData, setFormData] = useState<Partial<SurgeryRecord>>(initialFormData);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  // Default dokter bedah / operator
  const availableDoctors = useMemo(() => {
    const docList = getPracticingDoctorNames(staffList);
    if (docList.length === 0) return ['drh. Widia Ilhami'];
    return docList;
  }, [staffList]);

  // Autocomplete Pasien
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.toLowerCase().trim();
    return pets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.ownerName && p.ownerName.toLowerCase().includes(q)) ||
        (p.ownerWhatsapp && p.ownerWhatsapp.includes(q))
    ).slice(0, 6);
  }, [pets, patientSearch]);

  const handleSelectPatient = (pet: Pet) => {
    setFormData((prev) => ({
      ...prev,
      petId: pet.id,
      petName: pet.name,
      petType: pet.type,
      ownerName: pet.ownerName || '',
      ownerWhatsapp: pet.ownerWhatsapp || '',
    }));
    setPatientSearch(`${pet.name} (${pet.type}) - ${pet.ownerName || ''}`);
    setShowPatientDropdown(false);
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormData({
      ...initialFormData,
      operator: currentUser?.isPracticingDoctor ? currentUser.name : availableDoctors[0] || '',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }),
    });
    setPatientSearch('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (surg: SurgeryRecord) => {
    setEditingId(surg.id);
    setFormData({ ...surg });
    setPatientSearch(surg.petName ? `${surg.petName} (${surg.petType || 'Pasien'}) - ${surg.ownerName || ''}` : '');
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateSurgeryRecord(editingId, formData);
    } else {
      await addSurgeryRecord(formData);
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteSurgeryRecord(id);
    setDeleteConfirmId(null);
    if (detailSurgery?.id === id) {
      setDetailSurgery(null);
    }
  };

  // Status Filtered List
  const filteredSurgeries = useMemo(() => {
    return surgeries.filter((s) => {
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      if (!matchStatus) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchPet = (s.petName || '').toLowerCase().includes(q);
      const matchType = (s.operationType || '').toLowerCase().includes(q);
      const matchOperator = (s.operator || '').toLowerCase().includes(q);
      const matchOwner = (s.ownerName || '').toLowerCase().includes(q);
      const matchNotes = (s.operationNotes || '').toLowerCase().includes(q);

      return matchPet || matchType || matchOperator || matchOwner || matchNotes;
    });
  }, [surgeries, statusFilter, searchQuery]);

  // KPI Counts
  const counts = useMemo(() => {
    const total = surgeries.length;
    const scheduled = surgeries.filter((s) => s.status === 'Dijadwalkan').length;
    const inProgress = surgeries.filter((s) => s.status === 'Sedang Berlangsung').length;
    const completed = surgeries.filter((s) => s.status === 'Selesai').length;
    return { total, scheduled, inProgress, completed };
  }, [surgeries]);

  // Generator Pesan WhatsApp Resume Tindakan Operasi
  const buildWhatsappResume = (surg: SurgeryRecord): string => {
    let msg = `*RESUME TINDAKAN OPERASI & BEDAH - VIER PET CARE* 🏥🐾\n\n`;
    msg += `Halo Kak *${surg.ownerName || 'Klien'}*,\n`;
    msg += `Berikut laporan resmi tindakan pembedahan anabul di Vier Pet Care:\n\n`;
    msg += `🐾 *Nama Pasien:* ${surg.petName || '-'} (${surg.petType || 'Hewan'})\n`;
    msg += `🔪 *Jenis Tindakan:* ${surg.operationType || 'Tindakan Operasi'}\n`;
    msg += `📅 *Tanggal & Waktu:* ${surg.date || '-'} pukul ${surg.time || '-'} WIB\n`;
    msg += `👨‍⚕️ *Dokter Bedah / Operator:* ${surg.operator || '-'}\n`;
    msg += `📌 *Status:* ${surg.status || 'Selesai'}\n\n`;

    msg += `*💉 PROTOKOL ANESTESI & MEDIKASI:*\n`;
    if (surg.atropineDose) msg += `• Dosis Atropin: ${surg.atropineDose}\n`;
    if (surg.xylazineDose) msg += `• Dosis Xylazine: ${surg.xylazineDose}\n`;
    if (surg.ketamineDose) msg += `• Dosis Ketamin: ${surg.ketamineDose}\n`;
    if (surg.acpDose) msg += `• Dosis ACP: ${surg.acpDose}\n`;
    if (surg.yohimbineDose) msg += `• Dosis Yohimbine: ${surg.yohimbineDose}\n`;
    if (surg.antibioticDoseAndType) msg += `• Antibiotik: ${surg.antibioticDoseAndType}\n`;
    if (surg.analgesicDoseAndType) msg += `• Analgesik: ${surg.analgesicDoseAndType}\n`;

    if (!surg.atropineDose && !surg.xylazineDose && !surg.ketamineDose && !surg.antibioticDoseAndType) {
      msg += `• Terapi anestesi & medikasi diberikan sesuai standar medis operatif.\n`;
    }

    if (surg.operationNotes) {
      msg += `\n*📝 CATATAN INTRAOPERATIF & PASCA BEDAH:*\n${surg.operationNotes}\n`;
    }

    msg += `\n*⚠️ PETUNJUK PERAWATAN PASCA OPERASI DI RUMAH:*`;
    msg += `\n1. Letakkan anabul di tempat hangat, tenang, dan beralas bersih.`;
    msg += `\n2. Pasangkan Elizabethan Collar (Cone) agar luka tidak dijilat/digigit.`;
    msg += `\n3. Jangan biarkan anabul melompat tinggi atau berlari kencang.`;
    msg += `\n4. Berikan obat minum sesuai resep dokter hingga tuntas.`;
    msg += `\n5. Segera hubungi klinik bila ada rembesan darah aktif atau muntah berulang.\n\n`;
    msg += `Semoga lekas pulih dan sehat selalu! 🐾❤️\n_Vier Pet Care_`;

    return msg;
  };

  const handleShareWhatsapp = (surg: SurgeryRecord) => {
    const phone = toWhatsappNumber(surg.ownerWhatsapp || '');
    const text = encodeURIComponent(buildWhatsappResume(surg));
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handleCopyResume = (surg: SurgeryRecord) => {
    const text = buildWhatsappResume(surg);
    navigator.clipboard.writeText(text);
    setCopiedResume(true);
    setTimeout(() => setCopiedResume(false), 2000);
  };

  const getStatusBadgeClass = (status?: SurgeryStatus) => {
    switch (status) {
      case 'Sedang Berlangsung':
        return 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse';
      case 'Selesai':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Batal':
        return 'bg-neutral-200 text-neutral-600 border-neutral-300';
      case 'Dijadwalkan':
      default:
        return 'bg-sky-100 text-sky-800 border-sky-300';
    }
  };

  return (
    <div id="tindakan-operasi-panel" className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Top Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-700 text-white flex items-center justify-center shadow-md shadow-fuchsia-700/20">
              <Syringe className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
                Tindakan Operasi &amp; Bedah
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                Pencatatan protokol pembedahan, anestesi, sedasi, dosis obat, operator, dan catatan operatif.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold text-xs shadow-sm transition active:scale-98 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Catat Tindakan Operasi</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Total Tindakan</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-neutral-900">{counts.total}</span>
            <Activity className="w-4 h-4 text-neutral-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-sky-100 bg-sky-50/30 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Dijadwalkan</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-sky-800">{counts.scheduled}</span>
            <Calendar className="w-4 h-4 text-sky-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 bg-amber-50/30 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Sedang Berlangsung</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-amber-800">{counts.inProgress}</span>
            <HeartPulse className="w-4 h-4 text-amber-500 animate-pulse" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Selesai Operasi</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-emerald-800">{counts.completed}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Search Bar & Status Filter Tabs */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {(['All', 'Dijadwalkan', 'Sedang Berlangsung', 'Selesai', 'Batal'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  statusFilter === st
                    ? 'bg-fuchsia-700 text-white shadow-xs'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                }`}
              >
                {st === 'All' ? 'Semua Status' : st}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari pasien, tindakan, dokter..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-fuchsia-600 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Surgeries List / Grid */}
      {filteredSurgeries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-neutral-300 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
            <Syringe className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-800">Belum Ada Catatan Tindakan Operasi</h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'All'
                ? 'Tidak ada data operasi yang cocok dengan kriteria filter saat ini.'
                : 'Mulai catat prosedur bedah dan protokol obat anestesi dengan klik tombol "Catat Tindakan Operasi".'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 text-white font-bold text-xs hover:bg-fuchsia-800 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Tindakan Baru</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSurgeries.map((surg) => (
            <div
              key={surg.id}
              className="bg-white rounded-2xl border border-neutral-200 hover:border-neutral-300 shadow-2xs hover:shadow-xs transition duration-200 flex flex-col justify-between overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getPetEmoji(surg.petType || 'Cat')}</span>
                    <div>
                      <h3 className="text-sm font-black text-neutral-900 leading-tight">
                        {surg.petName || 'Pasien Tanpa Nama'}
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        {getPetTypeIndonesian(surg.petType || 'Cat')} • Pemilik: {surg.ownerName || '-'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusBadgeClass(
                      surg.status
                    )}`}
                  >
                    {surg.status || 'Dijadwalkan'}
                  </span>
                </div>

                <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-600">
                  <span className="font-extrabold text-fuchsia-900 truncate">
                    🔪 {surg.operationType || 'Tindakan Operasi'}
                  </span>
                  <span className="text-neutral-400 shrink-0">
                    {surg.date} {surg.time ? `• ${surg.time}` : ''}
                  </span>
                </div>
              </div>

              {/* Card Body: Meds & Protocol Summary */}
              <div className="p-4 space-y-3 text-xs flex-1">
                {/* Operator info */}
                <div className="flex items-center gap-1.5 text-neutral-700 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                  <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-[11px]">
                    <strong className="text-neutral-900">Operator:</strong> {surg.operator || 'Dokter Hewan'}
                  </span>
                </div>

                {/* Anesthesia pills */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Protokol Anestesi &amp; Medikasi:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="p-1.5 rounded-md bg-neutral-50 border border-neutral-100 truncate">
                      <span className="text-neutral-400">Atropin: </span>
                      <strong className="text-neutral-800">{surg.atropineDose || '-'}</strong>
                    </div>
                    <div className="p-1.5 rounded-md bg-neutral-50 border border-neutral-100 truncate">
                      <span className="text-neutral-400">Xylazine: </span>
                      <strong className="text-neutral-800">{surg.xylazineDose || '-'}</strong>
                    </div>
                    <div className="p-1.5 rounded-md bg-neutral-50 border border-neutral-100 truncate">
                      <span className="text-neutral-400">Ketamin: </span>
                      <strong className="text-neutral-800">{surg.ketamineDose || '-'}</strong>
                    </div>
                    <div className="p-1.5 rounded-md bg-neutral-50 border border-neutral-100 truncate">
                      <span className="text-neutral-400">ACP: </span>
                      <strong className="text-neutral-800">{surg.acpDose || '-'}</strong>
                    </div>
                  </div>

                  {(surg.antibioticDoseAndType || surg.analgesicDoseAndType) && (
                    <div className="pt-1 space-y-1 text-[11px]">
                      {surg.antibioticDoseAndType && (
                        <div className="truncate text-emerald-800">
                          💊 <strong>Antibiotik:</strong> {surg.antibioticDoseAndType}
                        </div>
                      )}
                      {surg.analgesicDoseAndType && (
                        <div className="truncate text-indigo-800">
                          💉 <strong>Analgesik:</strong> {surg.analgesicDoseAndType}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Operation Notes preview */}
                {surg.operationNotes && (
                  <div className="p-2 rounded-lg bg-amber-50/60 border border-amber-200/60 text-[11px] text-amber-950">
                    <p className="line-clamp-2">
                      <strong className="text-amber-900">Catatan:</strong> {surg.operationNotes}
                    </p>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="p-3 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => setDetailSurgery(surg)}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-neutral-100 text-neutral-700 text-[11px] font-bold border border-neutral-200 transition cursor-pointer"
                >
                  Detail &amp; Resume
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleShareWhatsapp(surg)}
                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer"
                    title="Kirim Resume Operasi ke WhatsApp Pemilik"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(surg)}
                    className="p-1.5 rounded-lg bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 transition cursor-pointer"
                    title="Edit Data Tindakan"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(surg.id)}
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                    title="Hapus Catatan Tindakan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: INPUT / EDIT TINDAKAN OPERASI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-neutral-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-fuchsia-800 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/15 text-white flex items-center justify-center border border-white/20">
                  <Syringe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold">
                    {editingId ? 'Edit Catatan Tindakan Operasi' : 'Catat Tindakan Operasi Baru'}
                  </h3>
                  <p className="text-[11px] text-fuchsia-200">
                    Semua isian bersifat opsional dan fleksibel untuk kelancaran administrasi dokter bedah.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveForm} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Section 1: Pasien & Pemilik */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                <span className="font-bold text-neutral-800 uppercase tracking-wider text-[11px]">
                  1. Informasi Pasien &amp; Pemilik
                </span>

                {/* Autocomplete Search Pasien */}
                <div className="relative">
                  <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                    Cari Pasien Terdaftar (Opsional):
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setShowPatientDropdown(true);
                      }}
                      onFocus={() => setShowPatientDropdown(true)}
                      placeholder="Ketik nama anabul / pemilik / no WA..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-hidden focus:border-fuchsia-600"
                    />
                  </div>

                  {showPatientDropdown && filteredPatients.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-neutral-200 z-20 max-h-48 overflow-y-auto">
                      {filteredPatients.map((pet) => (
                        <button
                          key={pet.id}
                          type="button"
                          onClick={() => handleSelectPatient(pet)}
                          className="w-full text-left p-2.5 hover:bg-fuchsia-50 border-b border-neutral-100 last:border-0 flex items-center justify-between cursor-pointer"
                        >
                          <div>
                            <span className="font-bold text-neutral-900">
                              {getPetEmoji(pet.type)} {pet.name}
                            </span>
                            <span className="text-[11px] text-neutral-500 ml-1.5">
                              ({getPetTypeIndonesian(pet.type)}) • Pemilik: {pet.ownerName || '-'}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-neutral-400">{pet.ownerWhatsapp}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Nama Pasien</label>
                    <input
                      type="text"
                      value={formData.petName || ''}
                      onChange={(e) => setFormData({ ...formData, petName: e.target.value })}
                      placeholder="cth: Milo"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Jenis Hewan</label>
                    <select
                      value={formData.petType || 'Cat'}
                      onChange={(e) => setFormData({ ...formData, petType: e.target.value as PetType })}
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    >
                      <option value="Cat">Kucing (Cat)</option>
                      <option value="Dog">Anjing (Dog)</option>
                      <option value="Rabbit">Kelinci (Rabbit)</option>
                      <option value="Exotic">Eksotik (Exotic)</option>
                      <option value="Farm Animal">Hewan Ternak</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Nama Pemilik</label>
                    <input
                      type="text"
                      value={formData.ownerName || ''}
                      onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                      placeholder="cth: Kak Arsi"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 mb-1">WhatsApp Pemilik</label>
                  <input
                    type="text"
                    value={formData.ownerWhatsapp || ''}
                    onChange={(e) => setFormData({ ...formData, ownerWhatsapp: e.target.value })}
                    placeholder="cth: 081234567890"
                    className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Section 2: Informasi Tindakan & Jadwal */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                <span className="font-bold text-neutral-800 uppercase tracking-wider text-[11px]">
                  2. Detail Tindakan Bedah &amp; Operator
                </span>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                    Jenis Tindakan Operasi:
                  </label>
                  <input
                    type="text"
                    value={formData.operationType || ''}
                    onChange={(e) => setFormData({ ...formData, operationType: e.target.value })}
                    placeholder="Ketik atau pilih dari rekomendasi di bawah..."
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-medium"
                  />

                  {/* Quick Select Buttons */}
                  <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {COMMON_SURGERY_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormData({ ...formData, operationType: t })}
                        className="px-2 py-1 rounded-md bg-white hover:bg-fuchsia-50 text-[10px] border border-neutral-200 text-neutral-700 transition cursor-pointer"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Tanggal</label>
                    <input
                      type="date"
                      value={formData.date || ''}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Waktu / Jam</label>
                    <input
                      type="text"
                      value={formData.time || ''}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      placeholder="cth: 10:30"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Status Tindakan</label>
                    <select
                      value={formData.status || 'Dijadwalkan'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as SurgeryStatus })}
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg font-bold"
                    >
                      <option value="Dijadwalkan">Dijadwalkan</option>
                      <option value="Sedang Berlangsung">Sedang Berlangsung</option>
                      <option value="Selesai">Selesai</option>
                      <option value="Batal">Batal</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                    Dokter Bedah / Operator:
                  </label>
                  <input
                    type="text"
                    value={formData.operator || ''}
                    onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
                    placeholder="Nama dokter bedah penanggung jawab..."
                    className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                  />
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {availableDoctors.map((doc) => (
                      <button
                        key={doc}
                        type="button"
                        onClick={() => setFormData({ ...formData, operator: doc })}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                      >
                        Pilih {doc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 3: Protokol Anestesi & Medikasi (Sesuai Permintaan Spesifik User) */}
              <div className="p-3.5 bg-fuchsia-50/50 rounded-xl border border-fuchsia-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fuchsia-950 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Syringe className="w-3.5 h-3.5 text-fuchsia-700" />
                    3. Protokol Premedikasi, Anestesi &amp; Obat (Opsional)
                  </span>
                  <span className="text-[10px] text-fuchsia-700 bg-white px-2 py-0.5 rounded-full border border-fuchsia-200">
                    Bebas diisi
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Dosis Atropin (Premedikasi):
                    </label>
                    <input
                      type="text"
                      value={formData.atropineDose || ''}
                      onChange={(e) => setFormData({ ...formData, atropineDose: e.target.value })}
                      placeholder="cth: 0.15 ml (0.04 mg/kg SC)"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Dosis Xylazine (Sedasi):
                    </label>
                    <input
                      type="text"
                      value={formData.xylazineDose || ''}
                      onChange={(e) => setFormData({ ...formData, xylazineDose: e.target.value })}
                      placeholder="cth: 0.2 ml (1-2 mg/kg IM)"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Dosis Ketamin (Anestesi):
                    </label>
                    <input
                      type="text"
                      value={formData.ketamineDose || ''}
                      onChange={(e) => setFormData({ ...formData, ketamineDose: e.target.value })}
                      placeholder="cth: 0.35 ml (10-15 mg/kg IM)"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Dosis ACP (Acepromazine):
                    </label>
                    <input
                      type="text"
                      value={formData.acpDose || ''}
                      onChange={(e) => setFormData({ ...formData, acpDose: e.target.value })}
                      placeholder="cth: 0.1 ml (0.05 mg/kg IM)"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Dosis Yohimbine (Reversal / Antidota):
                    </label>
                    <input
                      type="text"
                      value={formData.yohimbineDose || ''}
                      onChange={(e) => setFormData({ ...formData, yohimbineDose: e.target.value })}
                      placeholder="cth: 0.1 ml (0.1 mg/kg IV/IM)"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Dosis Antibiotik (Dosis &amp; Jenis):
                    </label>
                    <input
                      type="text"
                      value={formData.antibioticDoseAndType || ''}
                      onChange={(e) => setFormData({ ...formData, antibioticDoseAndType: e.target.value })}
                      placeholder="cth: Amoxicillin LA 0.3 ml SC"
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Dosis Analgesik (Dosis &amp; Jenis):
                  </label>
                  <input
                    type="text"
                    value={formData.analgesicDoseAndType || ''}
                    onChange={(e) => setFormData({ ...formData, analgesicDoseAndType: e.target.value })}
                    placeholder="cth: Ketoprofen 0.2 ml SC / Meloxicam 0.1 ml"
                    className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Section 4: Catatan Operasi */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                <span className="font-bold text-neutral-800 uppercase tracking-wider text-[11px]">
                  4. Catatan Operasi (Intraoperatif &amp; Pasca Bedah)
                </span>
                <textarea
                  rows={3}
                  value={formData.operationNotes || ''}
                  onChange={(e) => setFormData({ ...formData, operationNotes: e.target.value })}
                  placeholder="Catatan temuan patologis, status saturasi, durasi bedah, kondisi pemulihan, benang jahitan..."
                  className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold transition shadow-xs cursor-pointer"
                >
                  {editingId ? 'Simpan Perubahan' : 'Simpan Tindakan Operasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETAIL & RESUME WHATSAPP */}
      {detailSurgery && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-neutral-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-gradient-to-r from-fuchsia-800 to-indigo-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold">Resume Tindakan Operasi</h3>
                <p className="text-[11px] text-fuchsia-200">{detailSurgery.petName} • {detailSurgery.operationType}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailSurgery(null)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Pasien:</span>
                  <span className="font-bold text-neutral-900">
                    {getPetEmoji(detailSurgery.petType || 'Cat')} {detailSurgery.petName} ({detailSurgery.petType})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Pemilik:</span>
                  <span className="font-semibold text-neutral-800">{detailSurgery.ownerName || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">WhatsApp:</span>
                  <span className="font-mono text-neutral-800">{detailSurgery.ownerWhatsapp || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Tindakan:</span>
                  <span className="font-bold text-fuchsia-900">{detailSurgery.operationType || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Tanggal / Jam:</span>
                  <span className="text-neutral-800">{detailSurgery.date} {detailSurgery.time || ''} WIB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Operator:</span>
                  <span className="font-bold text-neutral-800">{detailSurgery.operator || '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Status:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadgeClass(detailSurgery.status)}`}>
                    {detailSurgery.status || 'Dijadwalkan'}
                  </span>
                </div>
              </div>

              {/* Anesthesia Summary */}
              <div className="p-3 bg-fuchsia-50/60 rounded-xl border border-fuchsia-200 space-y-1 text-[11px]">
                <span className="font-bold text-fuchsia-950 uppercase tracking-wider text-[10px]">
                  Rincian Dosis Anestesi &amp; Obat:
                </span>
                <p>• Dosis Atropin: <strong>{detailSurgery.atropineDose || '-'}</strong></p>
                <p>• Dosis Xylazine: <strong>{detailSurgery.xylazineDose || '-'}</strong></p>
                <p>• Dosis Ketamin: <strong>{detailSurgery.ketamineDose || '-'}</strong></p>
                <p>• Dosis ACP: <strong>{detailSurgery.acpDose || '-'}</strong></p>
                <p>• Dosis Yohimbine: <strong>{detailSurgery.yohimbineDose || '-'}</strong></p>
                <p>• Antibiotik: <strong>{detailSurgery.antibioticDoseAndType || '-'}</strong></p>
                <p>• Analgesik: <strong>{detailSurgery.analgesicDoseAndType || '-'}</strong></p>
              </div>

              {detailSurgery.operationNotes && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-[11px] text-amber-950">
                  <span className="font-bold text-amber-900 block mb-1">Catatan Operasi:</span>
                  <p className="whitespace-pre-line leading-relaxed">{detailSurgery.operationNotes}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleCopyResume(detailSurgery)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-neutral-100 text-neutral-700 font-bold border border-neutral-300 text-xs transition cursor-pointer"
              >
                {copiedResume ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Format WA</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleShareWhatsapp(detailSurgery)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim ke WhatsApp Pemilik</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-neutral-200 p-5 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Hapus Catatan Tindakan Operasi?</h4>
              <p className="text-xs text-neutral-500 mt-1">
                Data tindakan ini akan dihapus dari sistem klinik dan disinkronkan ke database Google Spreadsheet.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
