import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  PawPrint,
  Search,
  Filter,
  FileText,
  Heart,
  Scale,
  Calendar,
  Phone,
  User,
  Activity,
  MapPin,
  CheckCircle2,
  X,
  Plus,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Clock,
  Stethoscope,
  Hotel,
  ShieldCheck,
  MessageCircle,
  Trash2,
  RefreshCw,
  Edit,
  Loader2,
  Camera,
  Eye,
  Upload,
  Scissors,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { Pet, PetType, SoapRecord } from '../../types';
import { formatDateTimeDisplay } from '../../utils/dateUtils';
import { normalizePhoneWithZero, toWhatsappNumber } from '../../utils/phoneUtils';
import { getPetEmoji, getPetTypeIndonesian, normalizePetType } from '../../utils/petUtils';
import { fetchPaginatedPatients, fetchPatientSoapHistoryApi } from '../../database/backendSyncClient';
import { compressImageFile } from '../../utils/imageUtils';
import { EditSoapRecordModal } from './EditSoapRecordModal';

interface Props {
  navigate: (to: AppRoute) => void;
  onSelectPetForSoap?: (pet: Pet) => void;
}

export const DataPasien: React.FC<Props> = ({ navigate, onSelectPetForSoap }) => {
  const {
    deletePet,
    updatePet,
    deleteSoapRecord,
    syncStatus,
    syncFromSpreadsheet,
    dataVersion,
    triggerDataRefresh,
    cages,
    pets: contextPets,
    owners: contextOwners,
    queues,
    inpatientHistory,
    surgeries,
  } = useClinic();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [editingSoapRecord, setEditingSoapRecord] = useState<SoapRecord | null>(null);
  const [editingSoapPetName, setEditingSoapPetName] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [selectedSpecies, setSelectedSpecies] = useState<'all' | PetType>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | Pet['status']>('all');
  const [expandedPetId, setExpandedPetId] = useState<string | null>(null);
  const [petHistoryTab, setPetHistoryTab] = useState<{ [petId: string]: 'soap' | 'inpatient' | 'surgery' }>({});
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);

  // Server-Side Paginated State
  const [patients, setPatients] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const pageSize = 10;

  // On-demand expanded pet history cache
  const [expandedPetHistory, setExpandedPetHistory] = useState<Record<string, SoapRecord[]>>({});
  const [loadingHistoryPetId, setLoadingHistoryPetId] = useState<string | null>(null);

  // Load paginated data from backend
  const loadPatients = useCallback(async (page: number, q: string, species: string, status: string) => {
    setIsLoading(true);
    try {
      const res = await fetchPaginatedPatients({
        page,
        limit: pageSize,
        q,
        species,
        status,
      });

      if (res.success) {
        setPatients(res.data);
        setTotalCount(res.total);
        setTotalPages(res.totalPages);
        setCurrentPage(res.page);
      }
    } catch (err) {
      console.error('Gagal memuat data pasien:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Effect to reload when filters, search, page, or real-time dataVersion changes across devices
  useEffect(() => {
    loadPatients(currentPage, debouncedSearch, selectedSpecies, selectedStatus);
  }, [currentPage, debouncedSearch, selectedSpecies, selectedStatus, dataVersion, loadPatients]);

  // Reset page to 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedSpecies, selectedStatus]);

  // States for editing patient (Pet)
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [editPetName, setEditPetName] = useState('');
  const [editPetType, setEditPetType] = useState<PetType>('Cat');
  const [editPetBreed, setEditPetBreed] = useState('');
  const [editPetAge, setEditPetAge] = useState('');
  const [editPetSex, setEditPetSex] = useState<'Jantan' | 'Betina'>('Jantan');
  const [editPetWeight, setEditPetWeight] = useState(0);
  const [editPetStatus, setEditPetStatus] = useState<Pet['status']>('Sehat');
  const [editPetPhotoUrl, setEditPetPhotoUrl] = useState<string | undefined>(undefined);
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (editingPet) {
      setEditPetName(editingPet.name || '');
      setEditPetType(editingPet.type || 'Cat');
      setEditPetBreed(editingPet.breed || '');
      setEditPetAge(editingPet.ageOrDob || '');
      setEditPetSex(editingPet.sex === 'Betina' ? 'Betina' : 'Jantan');
      setEditPetWeight(editingPet.weight || 0);
      setEditPetStatus(editingPet.status || 'Sehat');
      setEditPetPhotoUrl(editingPet.photoUrl);
    }
  }, [editingPet]);

  const handleSaveEditPet = async () => {
    if (!editingPet) return;
    updatePet(editingPet.id, {
      name: editPetName.trim(),
      type: editPetType,
      breed: editPetBreed.trim(),
      ageOrDob: editPetAge.trim(),
      sex: editPetSex,
      weight: Number(editPetWeight) || 0,
      status: editPetStatus,
      photoUrl: editPetPhotoUrl,
    });
    setEditingPet(null);
    setTimeout(() => {
      loadPatients(currentPage, debouncedSearch, selectedSpecies, selectedStatus);
    }, 200);
  };

  const handleDeletePetConfirm = async () => {
    if (!petToDelete) return;
    const targetId = petToDelete.id;
    setPatients((prev) => prev.filter((p) => p.id !== targetId));
    setTotalCount((prev) => Math.max(0, prev - 1));
    const target = petToDelete;
    setPetToDelete(null);
    await deletePet(target.id);
    loadPatients(currentPage, debouncedSearch, selectedSpecies, selectedStatus);
  };

  const toggleExpand = async (pet: any) => {
    const targetId = pet.id;
    if (expandedPetId === targetId) {
      setExpandedPetId(null);
      return;
    }
    setExpandedPetId(targetId);

    // Fetch history on-demand if not already cached
    if (!expandedPetHistory[targetId]) {
      setLoadingHistoryPetId(targetId);
      try {
        const hist = await fetchPatientSoapHistoryApi(pet.id);
        setExpandedPetHistory((prev) => ({ ...prev, [targetId]: hist }));
      } catch {
        // ignore
      } finally {
        setLoadingHistoryPetId(null);
      }
    }
  };

  const cageMap = useMemo(() => {
    const map = new Map<string, any>();
    (cages || []).forEach((c) => {
      if (c.petId) map.set(c.petId, c);
    });
    return map;
  }, [cages]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <PawPrint className="w-6 h-6 text-fuchsia-700" />
            <span>Basis Data Pasien Hewan Terdaftar</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Daftar lengkap seluruh hewan peliharaan teregistrasi dengan paginasi server 10 data/halaman & pencarian backend cepat.
          </p>
        </div>

        {/* Controls: Search & Refresh */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama hewan, ID, ras, pemilik, atau WhatsApp..."
              className="w-full px-3.5 py-2 pl-9 pr-8 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 font-medium"
            />
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600 p-0.5 rounded cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
        {/* Species Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-neutral-500 font-semibold px-2">Spesies:</span>
          {(
            [
              { id: 'all', label: 'Semua Spesies' },
              { id: 'Cat', label: '🐱 Kucing' },
              { id: 'Dog', label: '🐶 Anjing' },
              { id: 'Rabbit', label: '🐰 Kelinci' },
              { id: 'Exotic', label: '🦜 Eksotik' },
              { id: 'Farm Animal', label: '🐄 Ternak' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedSpecies(t.id as any)}
              className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                selectedSpecies === t.id
                  ? 'bg-fuchsia-700 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-neutral-500 font-semibold px-2">Status:</span>
          {(
            [
              { id: 'all', label: 'Semua Status' },
              { id: 'Sehat', label: '🟢 Sehat' },
              { id: 'Sakit', label: '🟡 Sakit' },
              { id: 'Rawat Inap', label: '🔴 Rawat Inap' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStatus(s.id as any)}
              className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                selectedStatus === s.id
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Patient Table */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-200/80 text-neutral-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-10 text-center">#</th>
                <th className="py-3 px-4">Nama Pasien & Spesies</th>
                <th className="py-3 px-4">Karakteristik & Fisik</th>
                <th className="py-3 px-4">Pemilik & Kontak</th>
                <th className="py-3 px-4">Status Klinis</th>
                <th className="py-3 px-4 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading && patients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-fuchsia-600 mb-2" />
                    <span>Memuat data pasien dari server...</span>
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    <PawPrint className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
                    <p className="font-semibold text-neutral-600">Tidak ada pasien ditemukan</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">Coba sesuaikan kata kunci pencarian atau filter status.</p>
                  </td>
                </tr>
              ) : (
                patients.map((pet, idx) => {
                  const isExpanded = expandedPetId === pet.id;
                  const owner = pet.resolvedOwner || {
                    id: pet.ownerId || '',
                    name: pet.ownerName || 'Pemilik',
                    whatsapp: pet.ownerWhatsapp || '',
                    address: '',
                    informedConsent: pet.informedConsent,
                  };
                  const ownerWhatsapp = owner.whatsapp || pet.ownerWhatsapp || '';
                  const activeCage = cageMap.get(pet.id);
                  const isAdmitted = activeCage && activeCage.status === 'Occupied';
                  const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                  const historyList = expandedPetHistory[pet.id] || [];

                  return (
                    <React.Fragment key={pet.id || idx}>
                      <tr
                        onClick={() => toggleExpand(pet)}
                        className={`hover:bg-neutral-50/90 transition cursor-pointer ${
                          isExpanded ? 'bg-fuchsia-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4 text-center text-neutral-400 font-mono text-[11px]">
                          {rowNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-fuchsia-50 border border-fuchsia-100 flex items-center justify-center text-lg shrink-0">
                              {getPetEmoji(pet.type, `${pet.name || ''} ${pet.breed || ''}`)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-neutral-900 text-sm">{pet.name}</span>
                                <span className="text-[10px] font-mono text-neutral-400">({pet.id})</span>
                              </div>
                              <div className="text-[11px] text-neutral-500 flex items-center gap-1.5 mt-0.5">
                                <span className="font-semibold text-neutral-700">{getPetTypeIndonesian(pet.type, `${pet.name || ''} ${pet.breed || ''}`)}</span>
                                <span>•</span>
                                <span>{pet.breed || 'Campuran'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-0.5 text-[11px] text-neutral-600">
                            <div>
                              <span className="font-semibold">{pet.sex || 'Jantan'}</span>
                              <span className="text-neutral-400">, </span>
                              <span>{pet.ageOrDob || 'Umur -'}</span>
                            </div>
                            <div className="font-mono text-neutral-500 flex items-center gap-1">
                              <Scale className="w-3 h-3 text-neutral-400" />
                              <span>{pet.weight ? `${pet.weight} kg` : '- kg'}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            <div className="font-bold text-neutral-900 flex items-center gap-1">
                              <User className="w-3 h-3 text-neutral-400" />
                              <span>{owner.name || pet.ownerName || 'Klien'}</span>
                            </div>
                            {ownerWhatsapp && (
                              <a
                                href={`https://wa.me/${toWhatsappNumber(ownerWhatsapp)}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
                              >
                                <Phone className="w-3 h-3" />
                                <span>{normalizePhoneWithZero(ownerWhatsapp)}</span>
                              </a>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {isAdmitted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <Hotel className="w-3 h-3" />
                              <span>Rawat Inap ({activeCage.label || activeCage.id})</span>
                            </span>
                          ) : pet.status === 'Sakit' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Activity className="w-3 h-3" />
                              <span>Sakit (Berobat)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Sehat</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setEditingPet(pet)}
                              className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 hover:text-amber-600 transition cursor-pointer"
                              title="Edit Pasien"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setPetToDelete(pet)}
                              className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 hover:text-rose-600 transition cursor-pointer"
                              title="Hapus Pasien"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => toggleExpand(pet)}
                              className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition cursor-pointer"
                              title="Lihat Detail & Rekam Medis"
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-fuchsia-700" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Detail Section */}
                      {isExpanded && (
                        <tr className="bg-fuchsia-50/20">
                          <td colSpan={6} className="p-4 sm:p-6 border-b border-fuchsia-100">
                            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-neutral-200/80 space-y-4 shadow-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                                <div>
                                  <h4 className="font-bold text-sm text-neutral-900 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-fuchsia-700" />
                                    <span>Detail Rekam Medis & Riwayat Pasien: {pet.name}</span>
                                  </h4>
                                  <p className="text-[11px] text-neutral-500 mt-0.5">
                                    ID: {pet.id} • Pemilik: {owner.name} • Alamat: {owner.address || '-'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      if (onSelectPetForSoap) onSelectPetForSoap(pet);
                                      navigate('/admin/rekam-medis');
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                                  >
                                    <Stethoscope className="w-3.5 h-3.5" />
                                    <span>Tulis SOAP Baru Pasien Ini</span>
                                  </button>
                                </div>
                              </div>

                              {/* FOTO & RINCIAN DETAIL PASIEN (KOMPAK & HEMAT TEMPAT) */}
                              {(() => {
                                const petPhoto =
                                  pet.photoUrl ||
                                  contextPets.find((p) => p.id === pet.id && p.photoUrl)?.photoUrl ||
                                  queues?.find((q) => q.petId === pet.id && q.photoUrl)?.photoUrl;

                                return (
                                  <div className="p-3 sm:p-3.5 rounded-xl bg-neutral-50/80 border border-neutral-200/80 flex items-center gap-3 sm:gap-4 shadow-2xs">
                                    {/* Foto Pasien di Sebelah Kiri (Kompak) */}
                                    <div className="shrink-0">
                                      {petPhoto ? (
                                        <div
                                          onClick={() => setPreviewPhotoModal({ url: petPhoto, name: pet.name })}
                                          className="relative group cursor-pointer w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-fuchsia-300 shadow-2xs"
                                          title="Klik untuk melihat foto ukuran penuh"
                                        >
                                          <img
                                            src={petPhoto}
                                            alt={`Foto pasien ${pet.name}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition"
                                          />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                            <Eye className="w-4 h-4" />
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-white border border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-400 p-1 text-center shadow-2xs">
                                          <Camera className="w-5 h-5 text-neutral-300 mb-0.5" />
                                          <span className="text-[9px] font-medium text-neutral-400 leading-tight">No Foto</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Sampingnya: Detail Pasien Lengkap & Hemat Tempat */}
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-extrabold text-sm text-neutral-900 leading-none">
                                            {pet.name}
                                          </h4>
                                          <span className="text-[10px] font-mono text-neutral-400">
                                            ({pet.id})
                                          </span>
                                          <span className="px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-[10px] font-bold text-neutral-700 inline-flex items-center gap-1">
                                            <span>{getPetEmoji(pet.type, `${pet.name || ''} ${pet.breed || ''}`)}</span>
                                            <span>{getPetTypeIndonesian(pet.type, `${pet.name || ''} ${pet.breed || ''}`)}</span>
                                          </span>
                                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                            pet.status === 'Sakit'
                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                              : pet.status === 'Rawat Inap'
                                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          }`}>
                                            {pet.status || 'Sehat'}
                                          </span>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => setEditingPet(pet)}
                                          className="text-[11px] font-bold text-fuchsia-700 hover:text-fuchsia-800 hover:underline flex items-center gap-1 cursor-pointer ml-auto"
                                        >
                                          <Edit className="w-3 h-3" />
                                          <span>{petPhoto ? 'Ganti Foto' : 'Unggah Foto'}</span>
                                        </button>
                                      </div>

                                      {/* Rincian Karakteristik Pasien Sebaris / Rapat */}
                                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-600">
                                        <span>Ras: <strong className="text-neutral-800 font-medium">{pet.breed || 'Campuran'}</strong></span>
                                        <span className="text-neutral-300">•</span>
                                        <span>Kelamin: <strong className="text-neutral-800 font-medium">{pet.sex || 'Jantan'}</strong></span>
                                        <span className="text-neutral-300">•</span>
                                        <span>Umur: <strong className="text-neutral-800 font-medium">{pet.ageOrDob || '-'}</strong></span>
                                        <span className="text-neutral-300">•</span>
                                        <span>Bobot: <strong className="text-neutral-800 font-medium font-mono">{pet.weight ? `${pet.weight} kg` : '- kg'}</strong></span>
                                        <span className="text-neutral-300">•</span>
                                        <span>Pemilik: <strong className="text-neutral-900 font-medium">{owner.name || pet.ownerName || '-'}</strong></span>
                                        {ownerWhatsapp && (
                                          <>
                                            <span className="text-neutral-300">•</span>
                                            <a
                                              href={`https://wa.me/${toWhatsappNumber(ownerWhatsapp)}`}
                                              target="_blank"
                                              rel="noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="font-mono text-emerald-700 font-bold hover:underline inline-flex items-center gap-0.5"
                                            >
                                              <Phone className="w-2.5 h-2.5" />
                                              <span>{normalizePhoneWithZero(ownerWhatsapp)}</span>
                                            </a>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* TABEL LENGKAP REKAM MEDIS: PEMERIKSAAN, RAWAT INAP, & TINDAKAN OPERASI */}
                              {(() => {
                                const petSurgeries = (surgeries || []).filter(
                                  (s) =>
                                    (pet.id && s.petId === pet.id) ||
                                    (pet.name && s.petName && s.petName.toLowerCase().trim() === pet.name.toLowerCase().trim())
                                );
                                const petInpatients = (inpatientHistory || []).filter(
                                  (h) =>
                                    (pet.id && h.petId === pet.id) ||
                                    (pet.name && h.petName && h.petName.toLowerCase().trim() === pet.name.toLowerCase().trim())
                                );
                                const currentTab = petHistoryTab[pet.id] || 'soap';

                                return (
                                  <div className="space-y-3">
                                    {/* Tab Navigation Riwayat Pasien */}
                                    <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 pb-2">
                                      <button
                                        type="button"
                                        onClick={() => setPetHistoryTab((prev) => ({ ...prev, [pet.id]: 'soap' }))}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                          currentTab === 'soap'
                                            ? 'bg-fuchsia-700 text-white shadow-xs'
                                            : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                                        }`}
                                      >
                                        <Stethoscope className="w-3.5 h-3.5" />
                                        <span>Riwayat Pemeriksaan SOAP ({historyList.length})</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setPetHistoryTab((prev) => ({ ...prev, [pet.id]: 'inpatient' }))}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                          currentTab === 'inpatient'
                                            ? 'bg-fuchsia-700 text-white shadow-xs'
                                            : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                                        }`}
                                      >
                                        <Hotel className="w-3.5 h-3.5" />
                                        <span>Riwayat Rawat Inap ({petInpatients.length})</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setPetHistoryTab((prev) => ({ ...prev, [pet.id]: 'surgery' }))}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                          currentTab === 'surgery'
                                            ? 'bg-purple-700 text-white shadow-xs'
                                            : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                                        }`}
                                      >
                                        <Scissors className="w-3.5 h-3.5" />
                                        <span>Riwayat Tindakan Operasi ({petSurgeries.length})</span>
                                      </button>
                                    </div>

                                    {/* 1. KONTEN TAB: RIWAYAT PEMERIKSAAN SOAP */}
                                    {currentTab === 'soap' && (
                                      <div>
                                        {loadingHistoryPetId === pet.id ? (
                                          <div className="p-4 text-center text-neutral-400 text-xs">
                                            <Loader2 className="w-4 h-4 animate-spin mx-auto text-fuchsia-600 mb-1" />
                                            <span>Memuat riwayat SOAP pasien...</span>
                                          </div>
                                        ) : historyList.length === 0 ? (
                                          <p className="text-xs text-neutral-400 italic bg-neutral-50 p-3 rounded-xl border border-neutral-200/60">
                                            Belum ada riwayat rekam medis SOAP tercatat untuk pasien ini.
                                          </p>
                                        ) : (
                                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {historyList.map((soap: any) => (
                                              <div
                                                key={soap.id}
                                                className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 text-xs space-y-1.5"
                                              >
                                                <div className="flex items-center justify-between font-bold text-neutral-800">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-fuchsia-700 font-mono">{soap.id}</span>
                                                    <span>•</span>
                                                    <span>{formatDateTimeDisplay(soap.date)}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-neutral-500 font-normal hidden sm:inline">
                                                      Dokter: <strong className="text-neutral-700">{soap.veterinarian || '-'}</strong>
                                                    </span>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingSoapPetName(pet.name);
                                                        setEditingSoapRecord(soap);
                                                      }}
                                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-fuchsia-50 border border-neutral-300 hover:border-fuchsia-400 text-neutral-700 hover:text-fuchsia-800 text-[10px] font-bold transition shadow-2xs cursor-pointer"
                                                      title="Edit rekam medis & susulkan diagnosa penunjang"
                                                    >
                                                      <Edit className="w-3 h-3 text-fuchsia-700" />
                                                      <span>Edit</span>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm(`Hapus rekam medis "${soap.id}" pasien ${pet.name}?\n\nData juga akan dihapus dari Google Spreadsheet.`)) {
                                                          deleteSoapRecord(soap.id);
                                                          setExpandedPetHistory((prev) => ({
                                                            ...prev,
                                                            [pet.id]: (prev[pet.id] || []).filter((s) => s.id !== soap.id),
                                                          }));
                                                        }
                                                      }}
                                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-rose-50 border border-neutral-300 hover:border-rose-400 text-neutral-700 hover:text-rose-700 text-[10px] font-bold transition shadow-2xs cursor-pointer"
                                                      title="Hapus rekam medis ini"
                                                    >
                                                      <Trash2 className="w-3 h-3 text-rose-600" />
                                                      <span>Hapus</span>
                                                    </button>
                                                  </div>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1 border-t border-neutral-200/60 text-neutral-600">
                                                  <div>
                                                    <strong className="text-neutral-700">S:</strong> {soap.soap?.subjective || '-'}
                                                  </div>
                                                  <div>
                                                    <strong className="text-neutral-700">O:</strong> {soap.soap?.objective || '-'}
                                                  </div>
                                                  <div>
                                                    <strong className="text-neutral-700">A (Diagnosa):</strong> {soap.soap?.assessment || '-'}
                                                  </div>
                                                  <div>
                                                    <strong className="text-neutral-700">P (Terapi):</strong> {soap.soap?.plan || '-'}
                                                  </div>
                                                </div>
                                                {((soap.diagnosticAttachments && soap.diagnosticAttachments.length > 0) || soap.diagnosticNotes) && (
                                                  <div className="pt-1 text-[10px] text-sky-700 font-semibold flex items-center gap-1">
                                                    <span>🩻</span>
                                                    <span>Terdapat {soap.diagnosticAttachments?.length || 0} berkas diagnosa penunjang</span>
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* 2. KONTEN TAB: RIWAYAT RAWAT INAP */}
                                    {currentTab === 'inpatient' && (
                                      <div>
                                        {petInpatients.length === 0 ? (
                                          <p className="text-xs text-neutral-400 italic bg-neutral-50 p-3 rounded-xl border border-neutral-200/60">
                                            Belum ada riwayat rawat inap tercatat untuk pasien ini.
                                          </p>
                                        ) : (
                                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {petInpatients.map((inp) => (
                                              <div
                                                key={inp.id}
                                                className="p-3 rounded-xl bg-fuchsia-50/40 border border-fuchsia-100 text-xs space-y-1.5"
                                              >
                                                <div className="flex items-center justify-between font-bold text-neutral-900">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-fuchsia-800 font-mono font-bold">
                                                      {inp.cageLabel ? `Kandang ${inp.cageLabel}` : 'Rawat Inap'}
                                                    </span>
                                                    <span>•</span>
                                                    <span className="text-neutral-500 font-mono text-[11px]">
                                                      Masuk: {inp.admittedAt} | Keluar: {inp.dischargedAt || 'Sedang Dirawat'}
                                                    </span>
                                                  </div>
                                                  <span className="text-neutral-500 font-normal">
                                                    DPJP: <strong className="text-neutral-700">{inp.veterinarian || '-'}</strong>
                                                  </span>
                                                </div>
                                                <p className="text-[11px] text-neutral-700">
                                                  <strong className="text-neutral-900">Diagnosa: </strong>
                                                  <span>{inp.diagnosis}</span>
                                                </p>
                                                {inp.observations && inp.observations.length > 0 && (
                                                  <div className="text-[10px] text-neutral-500 pt-1 border-t border-fuchsia-100/60">
                                                    Tercatat {inp.observations.length} log observasi harian.
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* 3. KONTEN TAB: RIWAYAT TINDAKAN OPERASI */}
                                    {currentTab === 'surgery' && (
                                      <div>
                                        {petSurgeries.length === 0 ? (
                                          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/60 text-center space-y-2">
                                            <p className="text-xs text-neutral-400 italic">
                                              Belum ada riwayat tindakan operasi tercatat untuk pasien ini.
                                            </p>
                                            <button
                                              type="button"
                                              onClick={() => navigate('/admin/operasi')}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                                            >
                                              <Scissors className="w-3.5 h-3.5" />
                                              <span>Input Tindakan Operasi untuk Pasien Ini</span>
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                            {petSurgeries.map((surg) => (
                                              <div
                                                key={surg.id}
                                                className="p-3 rounded-xl bg-purple-50/40 border border-purple-100 text-xs space-y-2"
                                              >
                                                <div className="flex flex-wrap items-center justify-between gap-1.5 font-bold text-neutral-900">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-purple-900 font-bold text-xs sm:text-sm">
                                                      {surg.operationType || 'Tindakan Operasi'}
                                                    </span>
                                                    <span className="font-mono text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold">
                                                      {surg.id}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <span
                                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                        surg.status === 'Selesai'
                                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                          : surg.status === 'Sedang Berlangsung'
                                                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                          : surg.status === 'Batal'
                                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                                      }`}
                                                    >
                                                      {surg.status || 'Dijadwalkan'}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-neutral-500 font-normal">
                                                      {surg.date || '-'} {surg.time ? `• ${surg.time}` : ''}
                                                    </span>
                                                  </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-neutral-700 pt-1 border-t border-purple-100/60">
                                                  <div>
                                                    <span className="text-neutral-500">Operator: </span>
                                                    <strong className="text-neutral-900">{surg.operator || '-'}</strong>
                                                  </div>
                                                  <div>
                                                    <span className="text-neutral-500">Tindakan: </span>
                                                    <strong className="text-neutral-900">{surg.operationType || '-'}</strong>
                                                  </div>
                                                </div>

                                                {(surg.atropineDose || surg.xylazineDose || surg.ketamineDose || surg.acpDose || surg.yohimbineDose) && (
                                                  <div className="bg-white/80 p-2 rounded-lg border border-purple-100/80 text-[10px] text-neutral-600">
                                                    <span className="font-bold text-purple-900 block mb-0.5">Dosis Anestesi & Premedikasi:</span>
                                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                                      {surg.atropineDose && <span>Atropin: <strong>{surg.atropineDose}</strong></span>}
                                                      {surg.xylazineDose && <span>Xylazine: <strong>{surg.xylazineDose}</strong></span>}
                                                      {surg.ketamineDose && <span>Ketamin: <strong>{surg.ketamineDose}</strong></span>}
                                                      {surg.acpDose && <span>ACP: <strong>{surg.acpDose}</strong></span>}
                                                      {surg.yohimbineDose && <span>Yohimbine: <strong>{surg.yohimbineDose}</strong></span>}
                                                    </div>
                                                  </div>
                                                )}

                                                {(surg.antibioticDoseAndType || surg.analgesicDoseAndType) && (
                                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px]">
                                                    {surg.antibioticDoseAndType && (
                                                      <div className="bg-white/80 p-1.5 rounded border border-purple-100/60">
                                                        <span className="text-neutral-500">Antibiotik: </span>
                                                        <strong className="text-neutral-800">{surg.antibioticDoseAndType}</strong>
                                                      </div>
                                                    )}
                                                    {surg.analgesicDoseAndType && (
                                                      <div className="bg-white/80 p-1.5 rounded border border-purple-100/60">
                                                        <span className="text-neutral-500">Analgesik: </span>
                                                        <strong className="text-neutral-800">{surg.analgesicDoseAndType}</strong>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}

                                                {surg.operationNotes && (
                                                  <p className="text-[11px] text-neutral-600 italic bg-white/70 p-1.5 rounded border border-purple-100/60">
                                                    "{surg.operationNotes}"
                                                  </p>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
          <span className="text-neutral-500 font-medium">
            Menampilkan halaman <strong className="text-neutral-900">{currentPage}</strong> dari{' '}
            <strong className="text-neutral-900">{totalPages}</strong> ({totalCount} total pasien)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || isLoading}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition cursor-pointer"
            >
              Sebelumnya
            </button>
            <span className="px-2 font-mono font-bold text-neutral-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || isLoading}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition cursor-pointer"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PATIENT */}
      {editingPet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 text-neutral-900 animate-in zoom-in-95 relative duration-150">
            <button
              onClick={() => setEditingPet(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-base text-neutral-900 mb-1">Edit Data Pasien</h3>
            <p className="text-xs text-neutral-500 mb-4">
              Perbarui karakteristik klinis dan identitas hewan peliharaan.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditPet();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Nama Hewan</label>
                  <input
                    type="text"
                    required
                    value={editPetName}
                    onChange={(e) => setEditPetName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm font-bold focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Spesies</label>
                  <select
                    value={editPetType}
                    onChange={(e) => setEditPetType(e.target.value as PetType)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-bold"
                  >
                    <option value="Cat">🐱 Kucing (Cat)</option>
                    <option value="Dog">🐶 Anjing (Dog)</option>
                    <option value="Rabbit">🐰 Kelinci (Rabbit)</option>
                    <option value="Exotic">🦜 Hewan Eksotik (Exotic / Bird / Reptile)</option>
                    <option value="Farm Animal">🐄 Hewan Ternak (Farm Animal)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Ras / Breed</label>
                  <input
                    type="text"
                    value={editPetBreed}
                    onChange={(e) => setEditPetBreed(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    placeholder="Contoh: Anggora, Mix"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Umur / Tgl Lahir</label>
                  <input
                    type="text"
                    value={editPetAge}
                    onChange={(e) => setEditPetAge(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    placeholder="Contoh: 1 Tahun 3 Bulan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Jenis Kelamin</label>
                  <div className="flex gap-2">
                    <label className={`flex-1 p-2 rounded-xl border text-center cursor-pointer text-xs transition ${editPetSex === 'Jantan' ? 'border-sky-500 bg-sky-50 text-sky-800 font-bold' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                      <input type="radio" name="editPetSex" checked={editPetSex === 'Jantan'} onChange={() => setEditPetSex('Jantan')} className="hidden" />
                      <span>♂ Jantan</span>
                    </label>
                    <label className={`flex-1 p-2 rounded-xl border text-center cursor-pointer text-xs transition ${editPetSex === 'Betina' ? 'border-pink-500 bg-pink-50 text-pink-800 font-bold' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                      <input type="radio" name="editPetSex" checked={editPetSex === 'Betina'} onChange={() => setEditPetSex('Betina')} className="hidden" />
                      <span>♀ Betina</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Berat Badan (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editPetWeight || ''}
                    onChange={(e) => setEditPetWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm font-mono focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    placeholder="Contoh: 3.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Status Kesehatan / Klinis</label>
                <select
                  value={editPetStatus}
                  onChange={(e) => setEditPetStatus(e.target.value as Pet['status'])}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-bold text-neutral-800 bg-white"
                >
                  <option value="Sehat">🟢 Sehat</option>
                  <option value="Sakit">🟡 Sakit (Berobat Jalan)</option>
                  <option value="Rawat Inap">🔴 Rawat Inap</option>
                </select>
              </div>

              {/* Foto Pasien di Form Edit */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Foto Pasien
                </label>
                <div className="flex items-center gap-3">
                  {editPetPhotoUrl ? (
                    <div className="relative group">
                      <img
                        src={editPetPhotoUrl}
                        alt="Preview Foto"
                        className="w-16 h-16 rounded-xl object-cover border border-fuchsia-300 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => setEditPetPhotoUrl(undefined)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs hover:bg-rose-700 shadow-xs cursor-pointer"
                        title="Hapus foto"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white border border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-400">
                      <Camera className="w-6 h-6 text-neutral-300" />
                    </div>
                  )}

                  <div className="flex-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-bold transition shadow-2xs cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-fuchsia-700" />
                      <span>{editPetPhotoUrl ? 'Ganti File Foto' : 'Pilih Foto Pasien'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const compressed = await compressImageFile(file, { maxWidth: 480, maxHeight: 480, quality: 0.75 });
                              setEditPetPhotoUrl(compressed);
                            } catch (err) {
                              console.error('Gagal memproses foto:', err);
                            }
                          }
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Format JPG / PNG (otomatis dikompres &lt; 50KB).
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingPet(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-semibold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE PET CONFIRMATION */}
      {petToDelete && (() => {
        const cleanPhone = normalizePhoneWithZero(petToDelete.ownerWhatsapp);
        const ownerPets = contextPets.filter(
          (p) =>
            (petToDelete.ownerId && p.ownerId === petToDelete.ownerId) ||
            (cleanPhone && normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone)
        );
        const isSinglePet = ownerPets.length <= 1;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
            <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-md w-full p-5 text-neutral-900 animate-in zoom-in-95">
              <div className="flex items-center gap-3 text-rose-600 mb-3">
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900">Hapus Data Pasien?</h3>
                  <p className="text-[11px] text-neutral-500">
                    {isSinglePet ? 'Penghapusan Pasien & Pemilik' : 'Penghapusan Pasien Saja'}
                  </p>
                </div>
              </div>

              <div className="text-xs text-neutral-700 bg-neutral-50 p-3 rounded-xl border border-neutral-200 mb-4 space-y-2">
                <p>
                  Anda yakin ingin menghapus data pasien <strong>{petToDelete.name}</strong> ({petToDelete.type} - {petToDelete.breed || 'Campuran'})?
                </p>
                {isSinglePet ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 font-semibold">
                    ℹ️ Pasien ini merupakan satu-satunya hewan milik pemilik ({petToDelete.ownerName}). Menghapus pasien ini akan ikut menghapus data pemilik dan seluruh rekam medisnya secara otomatis.
                  </p>
                ) : (
                  <p className="text-[11px] text-neutral-600 bg-blue-50 p-2 rounded-lg border border-blue-200">
                    ℹ️ Pemilik memiliki {ownerPets.length} hewan terdaftar. Hanya data pasien ini dan rekam medisnya yang akan dihapus. Data pemilik dan hewan lainnya tetap tersimpan.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPetToDelete(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDeletePetConfirm}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL EDIT REKAM MEDIS & SUSULAN DIAGNOSA PENUNJANG */}
      <EditSoapRecordModal
        isOpen={!!editingSoapRecord}
        onClose={() => setEditingSoapRecord(null)}
        record={editingSoapRecord}
        petName={editingSoapPetName}
        onSuccess={() => {
          if (editingSoapRecord) {
            fetchPatientSoapHistoryApi(editingSoapRecord.petId).then((hist) => {
              setExpandedPetHistory((prev) => ({
                ...prev,
                [editingSoapRecord.petId]: hist,
              }));
            });
          }
        }}
      />
      {/* MODAL PREVIEW FOTO PASIEN UKURAN PENUH */}
      {previewPhotoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setPreviewPhotoModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-neutral-100 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-fuchsia-700" />
                <h4 className="font-extrabold text-sm text-neutral-900">Foto Pasien: {previewPhotoModal.name}</h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-neutral-900/5 flex items-center justify-center">
              <img
                src={previewPhotoModal.url}
                alt={`Foto pasien ${previewPhotoModal.name}`}
                className="max-h-[70vh] w-auto max-w-full rounded-2xl object-contain shadow-md"
              />
            </div>
            <div className="p-3 bg-neutral-50 text-center border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                className="px-5 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs transition cursor-pointer"
              >
                Tutup Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
