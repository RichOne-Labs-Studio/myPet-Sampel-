import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  FileText,
  Stethoscope,
  Heart,
  Thermometer,
  Activity,
  Pill,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Clock,
  User,
  PawPrint,
  AlertCircle,
  Search,
  UploadCloud,
  FileImage,
  Image as ImageIcon,
  Paperclip,
  Eye,
  X,
  FileDown,
  Microscope,
  FileCheck,
  ChevronDown,
  ChevronRight,
  Printer,
  Phone,
  MessageCircle,
  ExternalLink,
  Calendar,
  Filter,
  Hotel,
  Lock,
  Sparkles,
  Loader2,
  RefreshCw,
  Edit,
  DollarSign,
  Scissors,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { Pet, VisitQueue, PrescriptionItem, DiagnosticAttachment, SoapRecord } from '../../types';
import { EditSoapRecordModal } from './EditSoapRecordModal';
import { SearchableMedicineSelect } from './SearchableMedicineSelect';
import { formatDateTimeDisplay } from '../../utils/dateUtils';
import { toWhatsappNumber, normalizePhoneWithZero, formatPhoneDisplay } from '../../utils/phoneUtils';
import { getPetEmoji, getPetTypeIndonesian, normalizePetType } from '../../utils/petUtils';
import { compressImageFile } from '../../utils/imageUtils';
import { canViewRevenue } from '../../utils/authUtils';
import { getPracticingDoctorNames } from '../../utils/staffUtils';
import {
  fetchPaginatedSoapRecords,
  searchPatientsAutocompleteApi,
  fetchPatientSoapHistoryApi,
} from '../../database/backendSyncClient';

interface Props {
  navigate: (to: AppRoute) => void;
  selectedPatientQueue?: VisitQueue | null;
  selectedPetDirect?: Pet | null;
  onClearSoapSelection?: () => void;
}

export const RekamMedis: React.FC<Props> = ({
  navigate,
  selectedPatientQueue,
  selectedPetDirect,
  onClearSoapSelection,
}) => {
  const {
    queues,
    inventory,
    saveSoapRecord,
    deleteSoapRecord,
    currentUser,
    inpatientHistory,
    soapRecords: contextSoapRecords,
    pets: contextPets,
    staffList,
    dataVersion,
    triggerDataRefresh,
    surgeries,
  } = useClinic();

  const handleDeleteSoap = async (record: SoapRecord) => {
    if (
      window.confirm(
        `Apakah Anda yakin ingin menghapus data rekam medis pasien "${record.petName}" (${record.date})?\n\nData ini juga akan dihapus dari Google Spreadsheet.`
      )
    ) {
      // Hapus seketika dari tampilan antarmuka
      setSoapRecordsList((prev) => prev.filter((r) => String(r.id).trim().toLowerCase() !== String(record.id).trim().toLowerCase()));
      setTotalCount((prev) => Math.max(0, prev - 1));
      // Hapus dari state global, disk backend, dan Google Sheets
      await deleteSoapRecord(record.id);
    }
  };

  const getResolvedPetDetails = (record: SoapRecord) => {
    let pType = (record as any).petType;
    let pBreed = (record as any).petBreed;
    let pName = record.petName;
    if (record.petId) {
      const found = (contextPets || []).find(
        (p) => p.id === record.petId || (p.name && record.petName && p.name.trim().toLowerCase() === record.petName.trim().toLowerCase())
      );
      if (found) {
        pType = found.type || pType;
        pBreed = found.breed || pBreed;
        pName = found.name || pName;
      }
    }
    if ((!pType || pType === 'Exotic') && record.petName) {
      const foundByName = (contextPets || []).find(
        (p) => String(p.name).trim().toLowerCase() === String(record.petName).trim().toLowerCase()
      );
      if (foundByName) {
        pType = foundByName.type || pType;
        pBreed = foundByName.breed || pBreed;
      }
    }
    const isCat = String(record.petName || '').toLowerCase().includes('dalgona') || String(pType || '').toLowerCase().includes('kucing') || String(pType || '').toLowerCase() === 'cat';
    const resolvedType = isCat ? 'Cat' : normalizePetType(pType || 'Cat', `${pName || ''} ${pBreed || ''}`);
    const resolvedBreed = pBreed || 'Mix / Domestik';
    return {
      emoji: getPetEmoji(resolvedType),
      typeIndonesian: getPetTypeIndonesian(resolvedType),
      breed: resolvedBreed,
    };
  };

  // Mode: 'list' (Daftar Arsip Rekam Medis) | 'form' (Input SOAP Baru)
  const [activeTab, setActiveTab] = useState<'list' | 'form'>(
    selectedPatientQueue || selectedPetDirect ? 'form' : 'list'
  );

  // Active pet state for SOAP Form
  const [activePet, setActivePet] = useState<Pet | null>(selectedPetDirect || null);
  const [selectedPetId, setSelectedPetId] = useState<string>(
    selectedPatientQueue?.petId || selectedPetDirect?.id || ''
  );

  // If parent route passes a pet or queue, resolve activePet and switch tab to form
  useEffect(() => {
    if (selectedPatientQueue) {
      const matchedPet = (contextPets || []).find((p) => p.id === selectedPatientQueue.petId) || {
        id: selectedPatientQueue.petId || `pet-q-${selectedPatientQueue.id}`,
        name: selectedPatientQueue.petName || 'Pasien',
        type: (selectedPatientQueue.petType as any) || 'Cat',
        ownerName: selectedPatientQueue.ownerName || 'Pemilik',
        ownerWhatsapp: selectedPatientQueue.ownerWhatsapp || '',
        registeredAt: selectedPatientQueue.createdAt || new Date().toISOString(),
      };
      setActivePet(matchedPet as Pet);
      setSelectedPetId(matchedPet.id);
      setActiveTab('form');
    } else if (selectedPetDirect?.id) {
      setActivePet(selectedPetDirect);
      setSelectedPetId(selectedPetDirect.id);
      setActiveTab('form');
    }
  }, [selectedPatientQueue, selectedPetDirect, contextPets]);

  // Expandable row state in List view
  const [expandedSoapId, setExpandedSoapId] = useState<string | null>(null);

  // Search & Filter for SOAP List
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>('all');
  const [hasDiagnosticFilter, setHasDiagnosticFilter] = useState<boolean>(false);
  const [hasPrescriptionFilter, setHasPrescriptionFilter] = useState<boolean>(false);

  // Server-Side Paginated SOAP list state
  const [soapRecordsList, setSoapRecordsList] = useState<SoapRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalEstimatedRevenue, setTotalEstimatedRevenue] = useState<number>(0);
  const [isListLoading, setIsListLoading] = useState<boolean>(false);
  const pageSize = 10;

  // Load paginated SOAP records from backend
  const loadSoapRecords = useCallback(
    async (page: number, q: string, vet: string, diag: boolean, rx: boolean) => {
      setIsListLoading(true);
      try {
        const res = await fetchPaginatedSoapRecords({
          page,
          limit: pageSize,
          q,
          vet,
          hasDiagnostics: diag,
          hasPrescription: rx,
        });
        if (res.success) {
          setSoapRecordsList(res.data);
          setTotalCount(res.total);
          setTotalPages(res.totalPages);
          setCurrentPage(res.page);
          if (res.totalRevenue !== undefined) {
            setTotalEstimatedRevenue(res.totalRevenue);
          }
        }
      } catch (err) {
        console.error('Gagal memuat daftar SOAP:', err);
      } finally {
        setIsListLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadSoapRecords(currentPage, debouncedSearch, selectedDoctorFilter, hasDiagnosticFilter, hasPrescriptionFilter);
  }, [currentPage, debouncedSearch, selectedDoctorFilter, hasDiagnosticFilter, hasPrescriptionFilter, dataVersion, loadSoapRecords]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedDoctorFilter, hasDiagnosticFilter, hasPrescriptionFilter]);

  const activeQueueMap = useMemo(() => {
    const map = new Map<string, VisitQueue>();
    queues.forEach((q) => {
      if (q.status !== 'Selesai' && q.petId) {
        map.set(q.petId, q);
      }
    });
    return map;
  }, [queues]);

  // Associated queue if applicable
  const activeQueueForPet = useMemo(() => {
    return activeQueueMap.get(selectedPetId);
  }, [activeQueueMap, selectedPetId]);

  // Patient Search Autocomplete State in Form Tab
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState('');
  const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);
  const [autocompletePatients, setAutocompletePatients] = useState<any[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPatientSearch(patientSearchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [patientSearchQuery]);

  useEffect(() => {
    let isCancelled = false;
    const search = async () => {
      setIsSearchingPatients(true);
      try {
        const results = await searchPatientsAutocompleteApi(debouncedPatientSearch, 30);
        if (!isCancelled) {
          setAutocompletePatients(results);
        }
      } finally {
        if (!isCancelled) setIsSearchingPatients(false);
      }
    };
    search();
    return () => {
      isCancelled = true;
    };
  }, [debouncedPatientSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientSearchRef.current && !patientSearchRef.current.contains(event.target as Node)) {
        setIsPatientSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Vital Signs Form State
  const [weight, setWeight] = useState<string>('');
  const [temperature, setTemperature] = useState<string>('');
  const [heartRate, setHeartRate] = useState<string>('');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('');

  // SOAP Fields
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  // Diagnosa Penunjang State
  const [diagnosticCategory, setDiagnosticCategory] = useState<
    'Rontgen / X-Ray' | 'USG' | 'Hematologi / Lab' | 'Sitologi / Mikroskopik' | 'Rapid Test' | 'Lainnya'
  >('Rontgen / X-Ray');
  const [diagnosticAttachments, setDiagnosticAttachments] = useState<DiagnosticAttachment[]>([]);
  const [diagnosticNotes, setDiagnosticNotes] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<DiagnosticAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // E-Prescription Items
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [serviceFee, setServiceFee] = useState<string>('50000');
  const currentFeeNum = parseFloat(serviceFee) || 0;
  // Practicing doctors from Admin/Staff Settings
  const practicingDoctors = useMemo(() => {
    return getPracticingDoctorNames(staffList);
  }, [staffList]);

  // Available doctors for filtering list view (includes historical doctors)
  const availableDoctors = useMemo(() => {
    const set = new Set<string>();
    practicingDoctors.forEach((d) => set.add(d));
    if (Array.isArray(contextSoapRecords)) {
      contextSoapRecords.forEach((s) => {
        if (s.veterinarian) set.add(s.veterinarian);
      });
    }
    if (Array.isArray(soapRecordsList)) {
      soapRecordsList.forEach((s) => {
        if (s.veterinarian) set.add(s.veterinarian);
      });
    }
    return Array.from(set).filter(Boolean);
  }, [practicingDoctors, contextSoapRecords, soapRecordsList]);

  const [selectedVet, setSelectedVet] = useState<string>(() => {
    return (currentUser?.isPracticingDoctor ? currentUser.name : (practicingDoctors[0] || ''));
  });

  useEffect(() => {
    if (practicingDoctors.length > 0) {
      if (!selectedVet || !practicingDoctors.includes(selectedVet)) {
        if (currentUser?.name && practicingDoctors.includes(currentUser.name)) {
          setSelectedVet(currentUser.name);
        } else if (practicingDoctors[0]) {
          setSelectedVet(practicingDoctors[0]);
        }
      }
    }
  }, [practicingDoctors, currentUser, selectedVet]);

  // Specific patient SOAP history (loaded on-demand by petId)
  const [petHistory, setPetHistory] = useState<SoapRecord[]>([]);
  const [isLoadingPetHistory, setIsLoadingPetHistory] = useState(false);
  const [editingSoapRecord, setEditingSoapRecord] = useState<SoapRecord | null>(null);

  const refreshPetHistory = useCallback(async () => {
    if (!selectedPetId && !activePet?.id) {
      setPetHistory([]);
      return;
    }
    const targetId = selectedPetId || activePet?.id || '';

    setIsLoadingPetHistory(true);
    try {
      const hist = await fetchPatientSoapHistoryApi(targetId);
      setPetHistory(hist);
    } catch (err) {
      console.error('Gagal memuat riwayat SOAP pasien:', err);
    } finally {
      setIsLoadingPetHistory(false);
    }
  }, [selectedPetId, activePet?.id]);

  useEffect(() => {
    refreshPetHistory();
  }, [refreshPetHistory]);

  const currentPet = activePet;

  // Kirim Resume Pemeriksaan ke WhatsApp Pemilik
  const handleSendWhatsappResume = () => {
    if (!currentPet) {
      alert('Silakan pilih pasien hewan terlebih dahulu.');
      return;
    }

    const rawPhone = currentPet.ownerWhatsapp || activeQueueForPet?.ownerWhatsapp || '';
    const phone = toWhatsappNumber(rawPhone);
    if (!phone) {
      alert('Nomor WhatsApp pemilik tidak ditemukan atau format nomor tidak valid.');
      return;
    }

    const ownerName = activeQueueForPet?.ownerName || currentPet.ownerName || 'Klien';
    const petName = currentPet.name || 'hewan';
    const diagnosa = assessment || '-';
    const terapi = plan || '-';

    const message = `Halo Kak ${ownerName}, berikut adalah resume rekam medis pasien ${petName} di Vier Pet Care: Diagnosa: ${diagnosa}, Terapi: ${terapi}.`;

    const encodedMsg = encodeURIComponent(message);
    window.open(`https://wa.me/${phone}?text=${encodedMsg}`, '_blank');
  };

  // Update fields when pet changes in form
  useEffect(() => {
    if (currentPet) {
      setWeight(currentPet.weight ? String(currentPet.weight) : '');
      setTemperature('');
      setHeartRate('');
      setRespiratoryRate('');

      const queue = activeQueueMap.get(currentPet.id);
      if (queue) {
        setSubjective(`Keluhan Utama: ${queue.chiefComplaint}`);
      } else {
        setSubjective('');
      }

      setObjective('');
      setAssessment('');
      setPlan('');
      setPrescriptions([]);
      setDiagnosticAttachments([]);
      setDiagnosticNotes('');
    } else {
      setWeight('');
      setTemperature('');
      setHeartRate('');
      setRespiratoryRate('');
      setSubjective('');
      setObjective('');
      setAssessment('');
      setPlan('');
      setPrescriptions([]);
      setDiagnosticAttachments([]);
      setDiagnosticNotes('');
    }
  }, [currentPet, activeQueueMap]);

  // Dynamic default service fee based on queue's service type
  useEffect(() => {
    if (activeQueueForPet) {
      switch (activeQueueForPet.serviceType) {
        case 'Consultation':
          setServiceFee('50000');
          break;
        case 'Vaccine':
          setServiceFee('150000');
          break;
        case 'Grooming':
          setServiceFee('75000');
          break;
        case 'Hotel':
          setServiceFee('100000');
          break;
        case 'Daftar':
          setServiceFee('50000');
          break;
        default:
          setServiceFee('50000');
      }
    } else {
      setServiceFee('50000');
    }
  }, [activeQueueForPet]);

  const petInpatientHistory = useMemo(
    () =>
      (inpatientHistory || []).filter(
        (h) =>
          (selectedPetId && h.petId === selectedPetId) ||
          (currentPet?.name && h.petName && h.petName.toLowerCase().trim() === currentPet.name.toLowerCase().trim())
      ),
    [inpatientHistory, selectedPetId, currentPet]
  );

  const petSurgeryHistory = useMemo(
    () =>
      (surgeries || []).filter(
        (s) =>
          (selectedPetId && s.petId === selectedPetId) ||
          (currentPet?.name && s.petName && s.petName.toLowerCase().trim() === currentPet.name.toLowerCase().trim())
      ),
    [surgeries, selectedPetId, currentPet]
  );



  const toggleExpandSoap = (id: string) => {
    setExpandedSoapId((prev) => (prev === id ? null : id));
  };

  // Handle Diagnostic File Upload
  const processUploadedFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(async (file) => {
      if (file.size > 15 * 1024 * 1024) {
        alert(`Ukuran berkas "${file.name}" melebihi batas 15MB.`);
        return;
      }

      const isImage = file.type.startsWith('image/');
      let dataUrl = '';
      if (isImage) {
        try {
          dataUrl = await compressImageFile(file, { maxWidth: 800, maxHeight: 800, quality: 0.75 });
        } catch {
          dataUrl = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.readAsDataURL(file);
          });
        }
      } else {
        dataUrl = await new Promise((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(file);
        });
      }

      const newAttachment: DiagnosticAttachment = {
        id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        type: isImage ? 'image' : 'file',
        fileType: file.type || 'application/octet-stream',
        dataUrl,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        category: diagnosticCategory,
        uploadedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }),
      };

      setDiagnosticAttachments((prev) => [...prev, newAttachment]);
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setDiagnosticAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  // Prescription Handlers
  const handleAddPrescription = () => {
    const defaultMed = inventory[0];
    if (!defaultMed) return;
    setPrescriptions((prev) => [
      ...prev,
      {
        inventoryItemId: defaultMed.id,
        itemName: defaultMed.name,
        dosage: '1x sehari oral sesudah makan',
        quantity: 1,
        unit: defaultMed.unit,
      },
    ]);
  };

  const handleMedChange = (index: number, invId: string) => {
    const found = inventory.find((i) => i.id === invId);
    if (!found) return;
    setPrescriptions((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              inventoryItemId: found.id,
              itemName: found.name,
              unit: found.unit,
            }
          : item
      )
    );
  };

  const handlePrescriptionFieldChange = (
    index: number,
    field: 'dosage' | 'quantity',
    value: string | number
  ) => {
    setPrescriptions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemovePrescription = (index: number) => {
    setPrescriptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const clearSelectedPatient = useCallback(() => {
    setActivePet(null);
    setSelectedPetId('');
    setPatientSearchQuery('');
    setDebouncedPatientSearch('');
    setWeight('');
    setTemperature('');
    setHeartRate('');
    setRespiratoryRate('');
    setSubjective('');
    setObjective('');
    setAssessment('');
    setPlan('');
    setPrescriptions([]);
    setDiagnosticAttachments([]);
    setDiagnosticNotes('');
    setServiceFee('50000');
    if (onClearSoapSelection) {
      onClearSoapSelection();
    }
  }, [onClearSoapSelection]);

  const handleSaveSoap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPet) {
      alert('Silakan pilih pasien terlebih dahulu sebelum menyimpan SOAP.');
      return;
    }

    saveSoapRecord(
      {
        queueId: activeQueueForPet?.id,
        petId: currentPet.id,
        petName: currentPet.name,
        ownerName: activeQueueForPet?.ownerName || currentPet.ownerName || currentPet.ownerWhatsapp || 'Klien Terdaftar',
        ownerWhatsapp: currentPet.ownerWhatsapp || activeQueueForPet?.ownerWhatsapp || '',
        veterinarian: selectedVet,
        vitals: {
          weight: parseFloat(weight) || 0,
          temperature: parseFloat(temperature) || 0,
          heartRate: parseInt(heartRate, 10) || 0,
          respiratoryRate: parseInt(respiratoryRate, 10) || 0,
        },
        soap: {
          subjective,
          objective,
          assessment,
          plan,
        },
        prescriptions,
        diagnosticAttachments,
        diagnosticNotes,
        serviceFee: parseFloat(serviceFee) || 0,
      },
      prescriptions
    );

    setSaveSuccessNotice(true);
    setTimeout(() => {
      setSaveSuccessNotice(false);
      clearSelectedPatient();
      setActiveTab('list');
      loadSoapRecords(1, debouncedSearch, selectedDoctorFilter, hasDiagnosticFilter, hasPrescriptionFilter);
    }, 2000);
  };

  const handlePrintSoap = (record: SoapRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const serviceFeeVal = record.serviceFee !== undefined ? record.serviceFee : 0;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Rekam Medis & Bukti Pembayaran - ${record.petName} (${record.id})</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; line-height: 1.5; }
            .header { border-bottom: 2px solid #429e37; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
            .logo-container { width: 140px; height: auto; }
            .badge { background: #fdf4ff; border: 1px solid #f0abfc; color: #86198f; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .card-title { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
            .soap-box { margin-bottom: 12px; }
            .soap-label { font-weight: bold; color: #86198f; font-size: 13px; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
            th { background: #f1f5f9; }
            .footer-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; font-size: 12px; }
            .receipt-box { border-left: 4px solid #16a34a; background: #f0fdf4; border-top: 1px solid #bbf7d0; border-right: 1px solid #bbf7d0; border-bottom: 1px solid #bbf7d0; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo-container">
                <svg viewBox="0 0 580 230" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <!-- Stethoscope Group (Green) -->
                  <g id="stethoscope" stroke="#429e37" stroke-linecap="round" stroke-linejoin="round">
                    <ellipse cx="28" cy="74" rx="8" ry="5.5" transform="rotate(-30 28 74)" fill="#429e37" stroke="none" />
                    <ellipse cx="88" cy="38" rx="8" ry="5.5" transform="rotate(35 88 38)" fill="#429e37" stroke="none" />
                    <path d="M 32 78 C 42 98, 54 116, 64 126" stroke-width="8.5" fill="none" />
                    <path d="M 84 44 C 74 65, 66 95, 64 126" stroke-width="8.5" fill="none" />
                    <rect x="58" y="122" width="12" height="15" rx="3.5" fill="#429e37" stroke="none" />
                    <path d="M 64 135 C 60 178, 98 214, 168 223 C 240 231, 355 231, 424 220 C 484 210, 524 172, 532 136 L 533 124" stroke-width="9.5" fill="none" />
                    <rect x="530" y="116" width="9" height="13" rx="2.5" fill="#429e37" stroke="none" />
                    <circle cx="558" cy="122" r="19" stroke-width="7.5" fill="none" />
                    <circle cx="558" cy="122" r="8.5" fill="#429e37" stroke="none" />
                  </g>
                  <!-- Mascot Cat V -->
                  <g id="mascot-cat-v">
                    <path d="M 194 160 C 158 160, 140 135, 140 98 C 140 76, 144 54, 154 32 C 156 28, 161 29, 166 36 C 174 48, 184 56, 195 56 C 206 56, 215 48, 224 36 C 228 29, 233 28, 235 32 C 245 54, 250 76, 250 98 C 250 135, 232 160, 194 160 Z" fill="#f78921" />
                    <path d="M 172 65 C 168 59, 157 65, 162 74 L 186 128 C 190 136, 199 136, 203 128 L 227 74 C 231 65, 221 59, 216 65 L 194 116 L 172 65 Z" fill="#ffffff" />
                  </g>
                  <!-- Mascot Bird I -->
                  <g id="mascot-bird-i">
                    <path d="M 284 18 C 269 18, 259 28, 258 38 C 253 40, 246 42, 241 45 C 238 46, 239 50, 242 51 C 248 52, 255 53, 258 57 C 253 78, 250 115, 258 140 C 265 156, 278 160, 294 160 C 309 160, 320 146, 320 116 C 320 74, 311 38, 305 28 C 298 21, 291 18, 284 18 Z" fill="#98cc28" />
                    <circle cx="284" cy="45" r="14.5" fill="#ffffff" />
                    <circle cx="284" cy="45" r="6" fill="#98cc28" />
                    <rect x="273" y="73" width="22" height="67" rx="11" fill="#ffffff" />
                  </g>
                  <!-- Mascot Paw E -->
                  <g id="mascot-paw-e">
                    <path d="M 320 58 C 316 48, 321 34, 332 34 C 340 34, 346 41, 348 47 C 352 35, 359 26, 370 26 C 381 26, 387 35, 389 47 C 392 40, 399 34, 407 37 C 417 39, 419 50, 417 62 C 414 88, 416 118, 410 140 C 403 158, 386 160, 368 160 C 350 160, 333 158, 326 140 C 318 118, 318 88, 320 58 Z" fill="#d27575" />
                    <path d="M 390 106 C 388 84, 373 70, 353 70 C 331 70, 317 88, 317 112 C 317 136, 333 152, 357 152 C 374 152, 386 142, 390 128 L 372 124 C 370 131, 365 136, 356 136 C 345 136, 337 126, 337 114 L 390 114 C 390 112, 390 109, 390 106 Z M 337 101 C 339 91, 345 85, 354 85 C 363 85, 370 91, 371 101 L 337 101 Z" fill="#ffffff" transform="translate(14, -1)" />
                  </g>
                  <!-- Mascot Dog R -->
                  <g id="mascot-dog-r">
                    <path d="M 406 66 C 404 48, 410 21, 421 17 C 427 15, 434 24, 437 38 C 442 27, 449 15, 460 15 C 467 15, 472 25, 473 38 C 485 46, 504 54, 523 64 C 529 67, 529 74, 522 78 C 512 82, 504 86, 509 94 C 491 110, 490 138, 481 153 C 473 160, 455 160, 434 160 C 416 160, 404 151, 399 133 C 395 112, 401 87, 406 66 Z" fill="#54b2c9" />
                    <rect x="424" y="72" width="21" height="69" rx="10.5" fill="#ffffff" />
                    <path d="M 436 90 C 439 74, 455 68, 471 72 C 482 75, 486 86, 480 97 C 474 105, 464 105, 458 97 C 452 88, 447 86, 439 90" fill="none" stroke="#ffffff" stroke-width="17" stroke-linecap="round" />
                  </g>
                  <!-- 'pet care' text -->
                  <g id="text-pet-care">
                    <text x="315" y="202" text-anchor="middle" fill="#429e37" font-size="36" font-weight="900" font-family="'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letter-spacing="0.04em">pet care</text>
                  </g>
                </svg>
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Jl. Kalitanjung No. 72 Kota Cirebon</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">REKAM MEDIS & BUKTI PEMBAYARAN</span>
              <div style="font-size: 10px; color: #64748b; margin-top: 6px; font-family: monospace;">No. RM: ${record.id}</div>
            </div>
          </div>

          <div class="grid-2">
            <div class="card">
              <div class="card-title">Informasi Pasien</div>
              <div style="font-size: 14px; font-weight: bold;">${record.petName || '-'}</div>
              <div style="font-size: 12px; color: #64748b;">ID Pasien: ${record.petId || '-'}</div>
            </div>
            <div class="card">
              <div class="card-title">Waktu & Dokter Pemeriksa</div>
              <div style="font-size: 13px; font-weight: bold;">${formatDateTimeDisplay(record.date)}</div>
              <div style="font-size: 12px; color: #64748b;">Pemeriksa: ${record.veterinarian || '-'}</div>
            </div>
          </div>

          <div class="card" style="margin-bottom: 16px;">
            <div class="card-title">Tanda-Tanda Vital (Vitals)</div>
            <div style="display: flex; gap: 24px; font-size: 12px; font-family: monospace;">
              <div>Berat: <strong>${record.vitals?.weight ? `${record.vitals.weight} kg` : '-'}</strong></div>
              <div>Suhu: <strong>${record.vitals?.temperature ? `${record.vitals.temperature} °C` : '-'}</strong></div>
              <div>Heart Rate: <strong>${record.vitals?.heartRate ? `${record.vitals.heartRate} bpm` : '-'}</strong></div>
              <div>Resp Rate: <strong>${record.vitals?.respiratoryRate ? `${record.vitals.respiratoryRate} rpm` : '-'}</strong></div>
            </div>
          </div>

          <div class="card" style="margin-bottom: 16px;">
            <div class="card-title">Catatan Pemeriksaan SOAP</div>
            <div class="soap-box">
              <div class="soap-label">S (Subjective / Anamnesa):</div>
              <div style="font-size: 12px;">${record.soap?.subjective || '-'}</div>
            </div>
            <div class="soap-box">
              <div class="soap-label">O (Objective / Pemeriksaan Fisik):</div>
              <div style="font-size: 12px;">${record.soap?.objective || '-'}</div>
            </div>
            <div class="soap-box">
              <div class="soap-label">A (Assessment / Diagnosa):</div>
              <div style="font-size: 12px; font-weight: bold;">${record.soap?.assessment || '-'}</div>
            </div>
            <div class="soap-box">
              <div class="soap-label">P (Plan / Terapi & Instruksi):</div>
              <div style="font-size: 12px;">${record.soap?.plan || '-'}</div>
            </div>
          </div>

          ${
            record.prescriptions && record.prescriptions.length > 0
              ? `
            <div class="card" style="margin-bottom: 16px;">
              <div class="card-title">Resep Obat & BHP Medis</div>
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Nama Obat</th>
                    <th>Dosis & Aturan Minum (Signa)</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  ${record.prescriptions
                    .map(
                      (p, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td><strong>${p.itemName}</strong></td>
                      <td>${p.dosage}</td>
                      <td>${p.quantity} ${p.unit}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
              : ''
          }

          <div class="footer-section">
            <div style="font-size: 10px; color: #64748b;">
              Pet Care ID: ${record.petId || '-'}<br/>
              Waktu Cetak: ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })} WIB
            </div>
            <div style="text-align: center;">
              <div>Dokter Hewan Pemeriksa,</div>
              <div style="margin-top: 50px; font-weight: bold; border-bottom: 1px solid #1e293b; padding-bottom: 2px;">
                ${record.veterinarian || currentUser?.name || '-'}
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-fuchsia-700" />
            <span>Rekam Medis Elektronik (SOAP)</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Format rekam medis SOAP terpadu dengan tanda vital, diagnosa penunjang (X-Ray/USG/Lab), dan e-resep farmasi.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 p-1 bg-neutral-200/60 rounded-2xl w-fit">
          <button
            id="tab-soap-list"
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'list'
                ? 'bg-white text-fuchsia-800 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Daftar Rekam Medis</span>
          </button>

          <button
            id="tab-soap-form"
            onClick={() => {
              if (activeTab !== 'form') {
                clearSelectedPatient();
              }
              setActiveTab('form');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'form'
                ? 'bg-white text-fuchsia-800 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Input SOAP / Pemeriksaan Baru</span>
          </button>
        </div>
      </div>

      {saveSuccessNotice && (
        <div className="p-4 rounded-2xl bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-900 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-3 animate-in zoom-in-95 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-fuchsia-700 shrink-0" />
            <span>
              Rekam Medis SOAP Berhasil Disimpan! Stok obat farmasi telah dipotong otomatis.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSendWhatsappResume}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>📲 Kirim Resume WA</span>
            </button>
            <button
              onClick={() => navigate('/admin/stok')}
              className="underline hover:text-fuchsia-700 text-xs font-semibold cursor-pointer"
            >
              Cek Stok Obat →
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW TAB 1: DAFTAR REKAM MEDIS (ARSIP SOAP - EXPANDABLE ROWS) */}
      {/* ======================================================== */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          {/* Search &amp; Filter Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari pasien, pemilik, dokter, diagnosa..."
                className="w-full px-3.5 py-2 pl-9 pr-8 rounded-xl bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 shadow-2xs font-medium"
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

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Doctor Filter */}
              {availableDoctors.length > 0 && (
                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-neutral-200">
                  <span className="text-neutral-500 font-semibold">Dokter:</span>
                  <select
                    value={selectedDoctorFilter}
                    onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                    className="bg-transparent font-bold text-neutral-900 text-xs focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">Semua Dokter</option>
                    {availableDoctors.map((doc) => (
                      <option key={doc} value={doc}>
                        {doc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Has Diagnostic Lampiran Filter */}
              <button
                type="button"
                onClick={() => setHasDiagnosticFilter((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                  hasDiagnosticFilter
                    ? 'bg-fuchsia-700 text-white border-fuchsia-700 shadow-2xs'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <Microscope className="w-3.5 h-3.5" />
                <span>Ada Diagnosa Penunjang</span>
              </button>

              {/* Has Prescription Filter */}
              <button
                type="button"
                onClick={() => setHasPrescriptionFilter((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                  hasPrescriptionFilter
                    ? 'bg-fuchsia-700 text-white border-fuchsia-700 shadow-2xs'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <Pill className="w-3.5 h-3.5" />
                <span>Ada Resep Obat</span>
              </button>
            </div>
          </div>

          {/* Quick Search Active Notice */}
          {searchQuery && (
            <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-fuchsia-50 border border-fuchsia-200 text-xs text-fuchsia-900">
              <span>
                Hasil pencarian untuk <strong>"{searchQuery}"</strong> (Ditemukan {totalCount} rekam medis)
              </span>
              <button
                onClick={() => setSearchQuery('')}
                className="text-fuchsia-700 hover:text-fuchsia-900 font-bold underline cursor-pointer"
              >
                Reset Pencarian
              </button>
            </div>
          )}

          {/* SOAP Records Table with Expandable Rows (Identical UX to Data Pemilik) */}
          <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-700">
                <thead className="bg-neutral-50 text-neutral-500 font-bold text-[11px] uppercase tracking-wider border-b border-neutral-200">
                  <tr>
                    <th className="w-10 px-3 py-3 text-center"></th>
                    <th className="px-4 py-3">Waktu & ID SOAP</th>
                    <th className="px-4 py-3">Nama Pasien</th>
                    <th className="px-4 py-3">Pemilik</th>
                    <th className="px-4 py-3">Dokter Pemeriksa</th>
                    <th className="px-4 py-3">Assessment (Diagnosa)</th>
                    <th className="px-4 py-3 text-center">Penunjang &amp; Resep</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {isListLoading && soapRecordsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-neutral-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-fuchsia-600 mb-2" />
                        <span>Memuat data rekam medis dari server...</span>
                      </td>
                    </tr>
                  ) : soapRecordsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-neutral-500 space-y-2">
                        <FileText className="w-8 h-8 mx-auto text-neutral-300" />
                        <p className="font-bold text-neutral-700 text-sm">
                          Belum ada data rekam medis dengan filter saat ini.
                        </p>
                        <p className="text-neutral-400 text-xs">
                          Klik tombol "Input SOAP / Pemeriksaan Baru" di kanan atas untuk membuat rekam medis pertama.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    soapRecordsList.map((record) => {
                      const isExpanded = expandedSoapId === record.id;
                      const ownerPhone = String(record.ownerWhatsapp || '');
                      const cleanPhone = ownerPhone.replace(/\D/g, '');
                      const diagCount = record.diagnosticAttachments?.length || 0;
                      const rxCount = record.prescriptions?.length || 0;

                      return (
                        <React.Fragment key={record.id}>
                          {/* Main Row */}
                          <tr
                            onClick={() => toggleExpandSoap(record.id)}
                            className={`cursor-pointer transition hover:bg-neutral-50/80 ${
                              isExpanded ? 'bg-neutral-50/60 border-l-2 border-l-fuchsia-600' : ''
                            }`}
                          >
                            {/* Expand/Collapse Chevron Indicator */}
                            <td className="px-3 py-3 text-center text-neutral-400">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-fuchsia-700" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </td>

                            {/* Date & SOAP ID */}
                            <td className="px-4 py-3 font-mono">
                              <span className="font-bold text-neutral-900 block text-xs whitespace-nowrap">
                                {formatDateTimeDisplay(record.date)}
                              </span>
                              <span className="text-[10px] text-neutral-400 block">{record.id}</span>
                            </td>

                            {/* Pet Info */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl shrink-0">{getResolvedPetDetails(record).emoji}</span>
                                <div>
                                  <span className="font-bold text-neutral-900 text-sm block tracking-tight">
                                    {record.petName || 'Pasien'}
                                  </span>
                                  <span className="text-[10px] text-neutral-500">
                                    {getResolvedPetDetails(record).typeIndonesian} • {getResolvedPetDetails(record).breed}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Owner Info */}
                            <td className="px-4 py-3">
                              <span className="font-semibold text-neutral-800 block truncate max-w-[140px]">
                                {record.ownerName || 'Klien'}
                              </span>
                              {ownerPhone ? (
                                <a
                                  href={`https://wa.me/${toWhatsappNumber(ownerPhone)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] font-mono text-emerald-600 hover:text-emerald-700 hover:underline font-bold flex items-center gap-1"
                                >
                                  <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{formatPhoneDisplay(ownerPhone)}</span>
                                </a>
                              ) : (
                                <span className="text-neutral-400 text-[11px]">-</span>
                              )}
                            </td>

                             {/* Veterinarian */}
                            <td className="px-4 py-3">
                              <span className="font-bold text-neutral-900 text-xs block">
                                {record.veterinarian || '-'}
                              </span>
                              <span className="text-[10px] text-neutral-400">Dokter Hewan</span>
                            </td>

                            {/* Assessment (Diagnosa) */}
                            <td className="px-4 py-3 max-w-xs truncate">
                              <span className="font-bold text-neutral-900 block truncate" title={record.soap.assessment}>
                                {record.soap.assessment || '-'}
                              </span>
                              <span className="text-[11px] text-neutral-500 truncate block max-w-xs" title={record.soap.plan}>
                                Plan: {record.soap.plan || '-'}
                              </span>
                            </td>

                            {/* Diagnostic & Prescription Badges */}
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {diagCount > 0 ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200"
                                    title={`${diagCount} Berkas Diagnosa Penunjang Terlampir`}
                                  >
                                    <Microscope className="w-3 h-3 text-sky-600" />
                                    <span>{diagCount} File</span>
                                  </span>
                                ) : null}

                                {rxCount > 0 ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200"
                                    title={`${rxCount} Resep Obat Terdaftar`}
                                  >
                                    <Pill className="w-3 h-3 text-fuchsia-600" />
                                    <span>{rxCount} Resep</span>
                                  </span>
                                ) : null}

                                {diagCount === 0 && rxCount === 0 && (
                                  <span className="text-[10px] text-neutral-400 font-mono">-</span>
                                )}
                              </div>
                            </td>

                            {/* Action Column */}
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handlePrintSoap(record)}
                                  className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition cursor-pointer"
                                  title="Cetak Lembar SOAP"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSoapRecord(record)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-fuchsia-50 border border-neutral-300 hover:border-fuchsia-400 text-neutral-700 hover:text-fuchsia-800 text-xs font-bold transition shadow-2xs cursor-pointer"
                                  title="Edit data rekam medis & susulkan diagnosa penunjang"
                                >
                                  <Edit className="w-3.5 h-3.5 text-fuchsia-700" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSoap(record)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold border border-rose-200 transition cursor-pointer"
                                  title="Hapus Data Rekam Medis Ini"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-700" />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* EXPANDED ACCORDION: COMPLETE SOAP DETAILS */}
                          {isExpanded && (
                            <tr className="bg-neutral-50/80 border-b border-neutral-200">
                              <td colSpan={8} className="p-4 sm:p-6">
                                <div className="space-y-4">
                                  {/* Expanded Top Header */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200">
                                    <div className="flex items-center gap-3">
                                      <div className="w-11 h-11 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-2xl shadow-2xs">
                                        {getResolvedPetDetails(record).emoji}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <h4 className="text-base font-extrabold text-neutral-900">
                                            {record.petName || 'Pasien'}
                                          </h4>
                                          <span className="font-mono text-xs text-fuchsia-800 bg-fuchsia-50 px-2.5 py-0.5 rounded-full border border-fuchsia-200 font-bold">
                                            {record.id}
                                          </span>
                                          <span className="text-[11px] font-bold text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded-md border border-fuchsia-200">
                                            {getResolvedPetDetails(record).typeIndonesian} • {getResolvedPetDetails(record).breed}
                                          </span>
                                        </div>
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                          Pemeriksa:{' '}
                                          <strong className="text-neutral-800">{record.veterinarian}</strong> • Waktu:{' '}
                                          <span className="font-mono">{formatDateTimeDisplay(record.date)}</span>
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingSoapRecord(record)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-fuchsia-50 border border-neutral-300 hover:border-fuchsia-400 text-neutral-800 hover:text-fuchsia-800 text-xs font-bold transition shadow-2xs cursor-pointer"
                                        title="Edit data rekam medis & susulkan diagnosa penunjang"
                                      >
                                        <Edit className="w-3.5 h-3.5 text-fuchsia-700" />
                                        <span>Edit Rekam Medis</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handlePrintSoap(record)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 text-xs font-bold transition shadow-2xs cursor-pointer"
                                      >
                                        <Printer className="w-3.5 h-3.5 text-neutral-600" />
                                        <span>Cetak Lembar Rekam Medis</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (record.petId) setSelectedPetId(record.petId);
                                          setActiveTab('form');
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Buat SOAP Lanjutan Pasien Ini</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* TANDA-TANDA VITAL (VITALS MATRIX) */}
                                  <div className="bg-white p-3.5 rounded-xl border border-neutral-200/80 shadow-2xs">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                                      <Activity className="w-3.5 h-3.5 text-fuchsia-700" />
                                      <span>Tanda-Tanda Vital (Vital Signs)</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs text-center">
                                      <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                                        <span className="text-[10px] text-neutral-500 block">Berat Badan:</span>
                                        <span className="text-fuchsia-800 font-bold text-sm">
                                          {record.vitals?.weight ? `${record.vitals.weight} kg` : '-'}
                                        </span>
                                      </div>
                                      <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                                        <span className="text-[10px] text-neutral-500 block">Suhu Rektal:</span>
                                        <span className="text-rose-700 font-bold text-sm">
                                          {record.vitals?.temperature ? `${record.vitals.temperature} °C` : '-'}
                                        </span>
                                      </div>
                                      <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                                        <span className="text-[10px] text-neutral-500 block">Heart Rate:</span>
                                        <span className="text-neutral-900 font-bold text-sm">
                                          {record.vitals?.heartRate ? `${record.vitals.heartRate} bpm` : '-'}
                                        </span>
                                      </div>
                                      <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                                        <span className="text-[10px] text-neutral-500 block">Resp Rate:</span>
                                        <span className="text-neutral-900 font-bold text-sm">
                                          {record.vitals?.respiratoryRate ? `${record.vitals.respiratoryRate} rpm` : '-'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* BENTO GRID: 4 SOAP SECTIONS */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* S: Subjective */}
                                    <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-900 border-b border-neutral-100 pb-1.5">
                                        <span className="w-5 h-5 rounded-md bg-fuchsia-100 text-fuchsia-800 font-black flex items-center justify-center text-xs">
                                          S
                                        </span>
                                        <span>Subjective (Anamnesa & Keluhan Klien)</span>
                                      </div>
                                      <p className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">
                                        {record.soap?.subjective || 'Tidak ada catatan subjektif.'}
                                      </p>
                                    </div>

                                    {/* O: Objective */}
                                    <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-sky-900 border-b border-neutral-100 pb-1.5">
                                        <span className="w-5 h-5 rounded-md bg-sky-100 text-sky-800 font-black flex items-center justify-center text-xs">
                                          O
                                        </span>
                                        <span>Objective (Pemeriksaan Fisik Dokter)</span>
                                      </div>
                                      <p className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">
                                        {record.soap?.objective || 'Tidak ada catatan objektif.'}
                                      </p>
                                    </div>

                                    {/* A: Assessment */}
                                    <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 border-b border-neutral-100 pb-1.5">
                                        <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 font-black flex items-center justify-center text-xs">
                                          A
                                        </span>
                                        <span>Assessment (Diagnosa & Prognosis)</span>
                                      </div>
                                      <p className="text-xs text-neutral-900 font-bold whitespace-pre-wrap leading-relaxed">
                                        {record.soap?.assessment || 'Belum ditegakkan diagnosa.'}
                                      </p>
                                    </div>

                                    {/* P: Plan */}
                                    <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 border-b border-neutral-100 pb-1.5">
                                        <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-xs">
                                          P
                                        </span>
                                        <span>Plan (Rencana Tindakan & Edukasi)</span>
                                      </div>
                                      <p className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">
                                        {record.soap?.plan || 'Tidak ada rencana tindakan khusus.'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* DIAGNOSA PENUNJANG ATTACHMENTS (IF ANY) */}
                                  {(record.diagnosticNotes ||
                                    (record.diagnosticAttachments &&
                                      record.diagnosticAttachments.length > 0)) && (
                                    <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-3">
                                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-900">
                                          <Microscope className="w-4 h-4 text-sky-700" />
                                          <span>Diagnosa Penunjang (X-Ray / USG / Lab / Sitologi)</span>
                                        </div>
                                        <span className="text-[11px] font-mono text-neutral-400">
                                          {record.diagnosticAttachments?.length || 0} Berkas Terlampir
                                        </span>
                                      </div>

                                      {record.diagnosticNotes && (
                                        <div className="p-3 rounded-lg bg-sky-50/50 border border-sky-100 text-xs text-sky-950 italic">
                                          "{record.diagnosticNotes}"
                                        </div>
                                      )}

                                      {record.diagnosticAttachments &&
                                        record.diagnosticAttachments.length > 0 && (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                                            {record.diagnosticAttachments.map((att) => (
                                              <div
                                                key={att.id}
                                                className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between gap-2 hover:border-neutral-300 transition"
                                              >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                  {att.type === 'image' ? (
                                                    <div
                                                      onClick={() => setPreviewModalImage(att)}
                                                      className="w-10 h-10 rounded-lg bg-neutral-200 overflow-hidden shrink-0 cursor-pointer border border-neutral-300"
                                                    >
                                                      <img
                                                        src={att.dataUrl}
                                                        alt={att.name}
                                                        className="w-full h-full object-cover"
                                                      />
                                                    </div>
                                                  ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                                                      <FileText className="w-5 h-5" />
                                                    </div>
                                                  )}
                                                  <div className="min-w-0">
                                                    <p className="font-bold text-neutral-800 text-xs truncate">
                                                      {att.name}
                                                    </p>
                                                    <p className="text-[10px] text-neutral-400">
                                                      {att.category} • {att.size}
                                                    </p>
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-1 shrink-0">
                                                  {att.type === 'image' && (
                                                    <button
                                                      type="button"
                                                      onClick={() => setPreviewModalImage(att)}
                                                      className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 transition cursor-pointer"
                                                      title="Lihat Gambar"
                                                    >
                                                      <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}
                                                  <a
                                                    href={att.dataUrl}
                                                    download={att.name}
                                                    className="p-1.5 rounded-lg text-fuchsia-700 hover:text-fuchsia-900 hover:bg-fuchsia-50 transition cursor-pointer"
                                                    title="Unduh Berkas"
                                                  >
                                                    <FileDown className="w-3.5 h-3.5" />
                                                  </a>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                  )}

                                  {/* RESEP OBAT TERINTEGRASI (IF ANY) */}
                                  {record.prescriptions && record.prescriptions.length > 0 && (
                                    <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-2.5">
                                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-900">
                                          <Pill className="w-4 h-4 text-fuchsia-700" />
                                          <span>Resep Obat & BHP Medis Terintegrasi</span>
                                        </div>
                                        <span className="text-[11px] font-mono text-neutral-400">
                                          {record.prescriptions.length} Item Obat
                                        </span>
                                      </div>

                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                          <thead className="text-[10px] uppercase font-mono text-neutral-500 border-b border-neutral-100">
                                            <tr>
                                              <th className="pb-1.5">Nama Obat</th>
                                              <th className="pb-1.5">Signa / Aturan Pakai</th>
                                              <th className="pb-1.5 text-right">Jumlah</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-neutral-100 text-neutral-800">
                                            {record.prescriptions.map((p, idx) => (
                                              <tr key={idx} className="py-1.5">
                                                <td className="py-1.5 font-bold text-neutral-900">
                                                  💊 {p.itemName}
                                                </td>
                                                <td className="py-1.5 text-neutral-600">{p.dosage}</td>
                                                <td className="py-1.5 text-right font-mono font-bold text-fuchsia-800">
                                                  {p.quantity} {p.unit}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}

                                  {/* RIWAYAT TERKAIT PASIEN INI: RAWAT INAP & TINDAKAN OPERASI */}
                                  {(() => {
                                    const relatedInpatients = (inpatientHistory || []).filter(
                                      (h) =>
                                        (record.petId && h.petId === record.petId) ||
                                        (record.petName && h.petName && h.petName.toLowerCase().trim() === record.petName.toLowerCase().trim())
                                    );
                                    const relatedSurgeries = (surgeries || []).filter(
                                      (s) =>
                                        (record.petId && s.petId === record.petId) ||
                                        (record.petName && s.petName && s.petName.toLowerCase().trim() === record.petName.toLowerCase().trim())
                                    );

                                    if (relatedInpatients.length === 0 && relatedSurgeries.length === 0) return null;

                                    return (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Riwayat Rawat Inap Terkait */}
                                        {relatedInpatients.length > 0 && (
                                          <div className="bg-white p-4 rounded-xl border border-fuchsia-200/80 shadow-2xs space-y-2.5">
                                            <div className="flex items-center justify-between border-b border-fuchsia-100 pb-2">
                                              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-900">
                                                <Hotel className="w-4 h-4 text-fuchsia-700" />
                                                <span>Riwayat Rawat Inap Terkait ({relatedInpatients.length})</span>
                                              </div>
                                            </div>
                                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                              {relatedInpatients.map((inp) => (
                                                <div key={inp.id} className="p-2.5 rounded-lg bg-fuchsia-50/40 border border-fuchsia-100 text-xs space-y-1">
                                                  <div className="flex items-center justify-between font-bold text-fuchsia-950">
                                                    <span>{inp.cageLabel ? `Kandang ${inp.cageLabel}` : 'Rawat Inap'}</span>
                                                    <span className="font-mono text-[10px] text-neutral-500 font-normal">
                                                      {inp.admittedAt} - {inp.dischargedAt || 'Dirawat'}
                                                    </span>
                                                  </div>
                                                  <p className="text-[11px] text-neutral-700">
                                                    <span className="font-semibold text-neutral-900">Diagnosa:</span> {inp.diagnosis}
                                                  </p>
                                                  <p className="text-[10px] text-neutral-500">
                                                    DPJP: <strong className="text-neutral-700">{inp.veterinarian}</strong>
                                                  </p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Riwayat Tindakan Operasi Terkait */}
                                        {relatedSurgeries.length > 0 && (
                                          <div className="bg-white p-4 rounded-xl border border-purple-200/80 shadow-2xs space-y-2.5">
                                            <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                                              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-900">
                                                <Scissors className="w-4 h-4 text-purple-700" />
                                                <span>Riwayat Tindakan Operasi Terkait ({relatedSurgeries.length})</span>
                                              </div>
                                            </div>
                                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                              {relatedSurgeries.map((surg) => (
                                                <div key={surg.id} className="p-2.5 rounded-lg bg-purple-50/40 border border-purple-100 text-xs space-y-1">
                                                  <div className="flex items-center justify-between font-bold text-purple-950">
                                                    <span>{surg.operationType || 'Tindakan Operasi'}</span>
                                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold border ${
                                                      surg.status === 'Selesai'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : surg.status === 'Sedang Berlangsung'
                                                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                        : surg.status === 'Batal'
                                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}>
                                                      {surg.status || 'Dijadwalkan'}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                                                    <span>Tgl: {surg.date || '-'} {surg.time ? `• ${surg.time}` : ''}</span>
                                                    <span>Operator: <strong className="text-neutral-700">{surg.operator || '-'}</strong></span>
                                                  </div>
                                                  {(surg.atropineDose || surg.ketamineDose || surg.xylazineDose || surg.acpDose || surg.yohimbineDose) && (
                                                    <p className="text-[10px] text-neutral-600 bg-white/80 p-1.5 rounded border border-purple-100/60">
                                                      <span className="font-semibold text-purple-900">Anestesi: </span>
                                                      {[
                                                        surg.atropineDose ? `Atropin: ${surg.atropineDose}` : '',
                                                        surg.xylazineDose ? `Xylazine: ${surg.xylazineDose}` : '',
                                                        surg.ketamineDose ? `Ketamin: ${surg.ketamineDose}` : '',
                                                        surg.acpDose ? `ACP: ${surg.acpDose}` : '',
                                                        surg.yohimbineDose ? `Yohimbine: ${surg.yohimbineDose}` : '',
                                                      ].filter(Boolean).join(' • ')}
                                                    </p>
                                                  )}
                                                  {surg.operationNotes && (
                                                    <p className="text-[10px] text-neutral-600 italic bg-white/60 p-1 rounded">
                                                      "{surg.operationNotes}"
                                                    </p>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Expanded Footer Actions */}
                                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2">
                                      {cleanPhone && (
                                        <a
                                          href={`https://wa.me/${toWhatsappNumber(cleanPhone)}?text=Halo%20Kak%20${encodeURIComponent(
                                            record.ownerName || 'Klien'
                                          )},%20berikut%20adalah%20resume%20rekam%20medis%20pasien%20${encodeURIComponent(
                                            record.petName || 'hewan'
                                          )}%20di%20Vier%20Pet%20Care:%20Diagnosa:%20${encodeURIComponent(
                                            record.soap.assessment || '-'
                                          )},%20Terapi:%20${encodeURIComponent(record.soap.plan || '-')}.`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 transition"
                                        >
                                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                          <span>Kirim Resume ke WhatsApp</span>
                                        </a>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingSoapRecord(record)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-fuchsia-50 text-neutral-800 hover:text-fuchsia-800 font-bold border border-neutral-300 hover:border-fuchsia-400 transition cursor-pointer"
                                      >
                                        <Edit className="w-3.5 h-3.5 text-fuchsia-700" />
                                        <span>Edit Rekam Medis</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigate('/admin/pasien');
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold border border-neutral-300 transition cursor-pointer"
                                      >
                                        <PawPrint className="w-3.5 h-3.5 text-neutral-600" />
                                        <span>Buka di Basis Data Pasien</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (record.petId) setSelectedPetId(record.petId);
                                          setActiveTab('form');
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold transition shadow-2xs cursor-pointer"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Input SOAP Lanjutan</span>
                                      </button>
                                    </div>
                                  </div>
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
                <strong className="text-neutral-900">{totalPages}</strong> ({totalCount} total rekam medis)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1 || isListLoading}
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition cursor-pointer"
                >
                  Sebelumnya
                </button>
                <span className="px-2 font-mono font-bold text-neutral-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages || isListLoading}
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition cursor-pointer"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW TAB 2: INPUT SOAP & PEMERIKSAAN MEDIS BARU */}
      {/* ======================================================== */}
      {activeTab === 'form' && (
        <div className="space-y-6">
          {/* Patient Search Panel */}
          <div
            ref={patientSearchRef}
            className="bg-white rounded-2xl p-4 sm:p-5 border border-neutral-200/80 shadow-xs space-y-3 relative"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-fuchsia-100 text-fuchsia-800 flex items-center justify-center shrink-0 border border-fuchsia-200 shadow-2xs">
                  <PawPrint className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <span>Pilih / Cari Pasien yang Diperiksa</span>
                    {currentPet && (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Pasien Aktif: {currentPet.name}</span>
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Ketik nama pasien, nama pemilik, atau nomor HP/WhatsApp untuk mencari pasien langsung ke backend
                  </p>
                </div>
              </div>

              {currentPet && (
                <button
                  type="button"
                  onClick={() => {
                    setActivePet(null);
                    setSelectedPetId('');
                    setPatientSearchQuery('');
                    setIsPatientSearchOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Ganti Pasien</span>
                </button>
              )}
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <input
                type="text"
                value={patientSearchQuery}
                onChange={(e) => {
                  setPatientSearchQuery(e.target.value);
                  setIsPatientSearchOpen(true);
                }}
                onFocus={() => setIsPatientSearchOpen(true)}
                placeholder="🔍 Ketik nama pasien, pemilik, atau no. WhatsApp (otomatis reset saat pasien dipilih)..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-neutral-50 border border-neutral-300 text-neutral-900 placeholder-neutral-400 text-xs sm:text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 shadow-2xs transition"
              />
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
              {patientSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setPatientSearchQuery('');
                    setIsPatientSearchOpen(true);
                  }}
                  className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 p-1 rounded-md cursor-pointer"
                  title="Hapus pencarian"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Floating Dropdown Results Panel */}
              {isPatientSearchOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl border border-neutral-200/90 shadow-2xl overflow-hidden max-h-96 flex flex-col animate-in fade-in zoom-in-95 duration-150">
                  {/* Summary Bar */}
                  <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between text-[11px] font-bold text-neutral-500">
                    <span>
                      {isSearchingPatients ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-600" />
                          <span>Mencari di server...</span>
                        </span>
                      ) : patientSearchQuery ? (
                        `Hasil pencarian "${patientSearchQuery}" (${autocompletePatients.length} pasien)`
                      ) : (
                        `Daftar Pasien (${autocompletePatients.length} teratas)`
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPatientSearchOpen(false)}
                      className="text-[10px] text-fuchsia-700 hover:underline font-bold cursor-pointer"
                    >
                      Tutup [X]
                    </button>
                  </div>

                  {/* Results List */}
                  <div className="overflow-y-auto divide-y divide-neutral-100 p-1.5">
                    {autocompletePatients.length === 0 && !isSearchingPatients ? (
                      <div className="p-8 text-center text-neutral-500 space-y-2">
                        <PawPrint className="w-8 h-8 text-neutral-300 mx-auto" />
                        <p className="text-xs font-bold text-neutral-700">Pasien tidak ditemukan</p>
                        <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
                          Tidak ada pasien dengan kata kunci "{patientSearchQuery}".
                        </p>
                      </div>
                    ) : (
                      autocompletePatients.map((p) => {
                        const inQueue = activeQueueMap.get(p.id) || p.queueInfo;
                        const isSelected = selectedPetId === p.id;

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setActivePet(p);
                              setSelectedPetId(p.id);
                              setPatientSearchQuery(''); // o kolom pencarian otomatis kosong
                              setIsPatientSearchOpen(false); // o pasien tetap menjadi pasien aktif
                            }}
                            className={`w-full p-3 text-left rounded-xl transition flex items-center justify-between gap-3 cursor-pointer ${
                              isSelected
                                ? 'bg-fuchsia-50/90 border border-fuchsia-300'
                                : 'hover:bg-neutral-50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-xl shrink-0 overflow-hidden shadow-2xs">
                                {p.photoUrl ? (
                                  <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                                ) : (
                                  getPetEmoji(p.type)
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-neutral-900 text-xs sm:text-sm tracking-tight">
                                    {p.name}
                                  </span>
                                  <span className="text-[10px] font-bold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-md border border-neutral-200 shrink-0">
                                    {getPetTypeIndonesian(p.type)} • {p.breed || 'Mix'}
                                  </span>
                                  {inQueue && (
                                    <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 shrink-0 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                      Tiket: {inQueue.ticketNumber} ({inQueue.serviceType})
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-neutral-500 mt-0.5 truncate flex items-center gap-2">
                                  <span>Pemilik: <strong className="text-neutral-800 font-semibold">{p.ownerName || 'Klien'}</strong></span>
                                  <span>•</span>
                                  <span className="font-mono text-fuchsia-800 font-semibold flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-fuchsia-600 inline" />
                                    <span>{formatPhoneDisplay(p.ownerWhatsapp)}</span>
                                  </span>
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isSelected ? (
                                <span className="text-xs font-bold text-fuchsia-800 bg-fuchsia-100 px-2.5 py-1 rounded-lg border border-fuchsia-200">
                                  Dipilih ✓
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 px-2.5 py-1 rounded-lg border border-fuchsia-200 transition">
                                  Pilih Pasien →
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STATE KOSONG: Belum Ada Pasien Dipilih */}
          {!currentPet ? (
            <div className="bg-white rounded-3xl p-8 sm:p-12 border border-neutral-200/80 shadow-xs text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-fuchsia-50 text-fuchsia-700 flex items-center justify-center text-3xl mx-auto border border-fuchsia-200 shadow-2xs">
                🩺
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base font-bold text-neutral-900">
                  Belum Ada Pasien Dipilih
                </h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Silakan pilih pasien hewan dari pencarian di atas untuk mengisi tanda-tanda vital, SOAP, diagnosa penunjang (X-Ray/USG/Lab), dan e-resep farmasi.
                </p>
              </div>

              {/* Quick Selector from Active Queues */}
              {Array.from(activeQueueMap.values()).length > 0 && (
                <div className="pt-6 max-w-xl mx-auto border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-700 mb-3 flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-fuchsia-600 animate-pulse"></span>
                    <span>Pilih Cepat dari Antrean Aktif Hari Ini:</span>
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {Array.from(activeQueueMap.values()).map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          if (q.petId) {
                            setSelectedPetId(q.petId);
                            setActivePet({
                              id: q.petId,
                              name: q.petName,
                              type: (q.petType as any) || 'Cat',
                              breed: (q as any).breed || '',
                              ownerName: q.ownerName,
                              ownerWhatsapp: q.ownerWhatsapp,
                              ageOrDob: '',
                              sex: 'Jantan',
                              weight: 0,
                              status: 'Sehat',
                              registeredAt: new Date().toISOString().split('T')[0],
                            });
                            setPatientSearchQuery('');
                          }
                        }}
                        className="text-xs font-semibold bg-neutral-50 hover:bg-fuchsia-50 hover:text-fuchsia-800 text-neutral-700 px-3.5 py-2 rounded-xl border border-neutral-200 hover:border-fuchsia-300 transition flex items-center gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="font-mono font-bold text-fuchsia-700">{q.ticketNumber}</span>
                        <span>{q.petName} ({q.petType})</span>
                        <span className="text-[10px] text-neutral-400">• {q.serviceType}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Patient Header Banner */}
              <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-fuchsia-50 border border-fuchsia-100 flex items-center justify-center overflow-hidden shrink-0 text-2xl shadow-2xs relative">
                    {currentPet.photoUrl ? (
                      <img
                        src={currentPet.photoUrl}
                        alt={currentPet.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      getPetEmoji(currentPet.type)
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-neutral-900">{currentPet.name}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200">
                        {getPetTypeIndonesian(currentPet.type)} • {currentPet.breed || 'Mix'}
                      </span>
                      {activeQueueForPet && (
                        <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
                          Tiket: {activeQueueForPet.ticketNumber} ({activeQueueForPet.serviceType})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Kontak Pemilik:</span>
                      {currentPet.ownerWhatsapp ? (
                        <a
                          href={`https://wa.me/${toWhatsappNumber(currentPet.ownerWhatsapp)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline font-mono font-bold"
                          title="Hubungi lewat WhatsApp"
                        >
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{formatPhoneDisplay(currentPet.ownerWhatsapp)}</span>
                        </a>
                      ) : (
                        <span className="text-neutral-400 font-mono">-</span>
                      )}
                      <span>• Kelamin: {currentPet.sex} • Umur: {currentPet.ageOrDob || '-'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearSelectedPatient}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-neutral-600 hover:text-rose-700 bg-neutral-100 hover:bg-rose-50 border border-neutral-200 hover:border-rose-200 transition cursor-pointer"
                    title="Kosongkan form dan pilih pasien lain"
                  >
                    ✕ Kosongkan / Ganti Pasien
                  </button>

                  <div className="flex items-center gap-2 text-xs bg-fuchsia-50/50 p-2 rounded-xl border border-fuchsia-100">
                    <span className="text-fuchsia-900 font-bold">Dokter Pemeriksa:</span>
                    <select
                      value={selectedVet}
                      onChange={(e) => setSelectedVet(e.target.value)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-neutral-300 font-bold text-neutral-800 text-xs focus:ring-1 focus:ring-fuchsia-500 shadow-2xs cursor-pointer focus:outline-hidden"
                    >
                      {practicingDoctors.map((docName) => (
                        <option key={docName} value={docName}>
                          {docName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* MAIN SOAP & DIAGNOSTIC FORM */}
              <form onSubmit={handleSaveSoap} className="space-y-6">
                {/* VITAL SIGNS INPUT MATRIX */}
                <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-fuchsia-700" />
                      <span>Tanda-Tanda Vital (Vital Signs)</span>
                    </h3>
                    <span className="text-[11px] text-neutral-400">
                      Hasil pengukuran fisik pasien saat ini
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Weight */}
                    <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                      <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                        Berat Badan (Weight)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder=""
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          className="w-full bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono text-sm font-bold focus:ring-2 focus:ring-fuchsia-500"
                        />
                        <span className="text-xs font-mono text-neutral-500 font-bold">kg</span>
                      </div>
                    </div>

                    {/* Temperature */}
                    <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                      <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                        Suhu Rektal (Temp)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          placeholder=""
                          value={temperature}
                          onChange={(e) => setTemperature(e.target.value)}
                          className="w-full bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono text-sm font-bold focus:ring-2 focus:ring-fuchsia-500"
                        />
                        <span className="text-xs font-mono text-neutral-500 font-bold">°C</span>
                      </div>
                    </div>

                    {/* Heart Rate */}
                    <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-neutral-600 block">
                          Heart Rate (HR)
                        </label>
                        <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-neutral-200/80 text-neutral-500">
                          (Opsional)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder=""
                          value={heartRate}
                          onChange={(e) => setHeartRate(e.target.value)}
                          className="w-full bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono text-sm font-bold focus:ring-2 focus:ring-fuchsia-500"
                        />
                        <span className="text-xs font-mono text-neutral-500 font-bold">bpm</span>
                      </div>
                    </div>

                    {/* Respiratory Rate */}
                    <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-neutral-600 block">
                          Respiratory Rate (RR)
                        </label>
                        <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-neutral-200/80 text-neutral-500">
                          (Opsional)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder=""
                          value={respiratoryRate}
                          onChange={(e) => setRespiratoryRate(e.target.value)}
                          className="w-full bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-900 font-mono text-sm font-bold focus:ring-2 focus:ring-fuchsia-500"
                        />
                        <span className="text-xs font-mono text-neutral-500 font-bold">rpm</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* S-O-A-P STRUCTURED FIELDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* S: Subjective */}
                  <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-fuchsia-700 text-white font-black flex items-center justify-center text-xs shadow-2xs">
                          S
                        </span>
                        <span>Subjective (Keluhan Klien / Anamnesa)</span>
                      </label>
                      <span className="text-[10px] text-neutral-400 font-mono">Anamnesis</span>
                    </div>
                    <textarea
                      rows={4}
                      value={subjective}
                      onChange={(e) => setSubjective(e.target.value)}
                      placeholder="Contoh: Anamnesa dari pemilik hewan, riwayat keluhan, durasi sakit, pola makan, muntah, feses, riwayat vaksin/obat..."
                      className="w-full flex-1 p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 focus:outline-hidden leading-relaxed resize-none"
                    />
                  </div>

                  {/* O: Objective */}
                  <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-sky-600 text-white font-black flex items-center justify-center text-xs shadow-2xs">
                          O
                        </span>
                        <span>Objective (Pemeriksaan Fisik Klinis)</span>
                      </label>
                      <span className="text-[10px] text-neutral-400 font-mono">Pemeriksaan Fisik</span>
                    </div>
                    <textarea
                      rows={4}
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Contoh: Inspeksi, palpasi abdomen, auskultasi jantung/paru, mukosa konjungtiva, CRT, limfonodus, turgor kulit, kondisi bulu..."
                      className="w-full flex-1 p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden leading-relaxed resize-none"
                    />
                  </div>

                  {/* A: Assessment */}
                  <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-amber-600 text-white font-black flex items-center justify-center text-xs shadow-2xs">
                          A
                        </span>
                        <span>Assessment (Diagnosa & Prognosis)</span>
                      </label>
                      <span className="text-[10px] text-neutral-400 font-mono">Diagnosis</span>
                    </div>
                    <textarea
                      rows={4}
                      required
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                      placeholder="Contoh: Diagnosa primer, diagnosa banding (differential diagnosis), stadium, serta prognosis (Fausta / Dubious / Infausta)..."
                      className="w-full flex-1 p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden leading-relaxed resize-none font-medium"
                    />
                  </div>

                  {/* P: Plan */}
                  <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-emerald-600 text-white font-black flex items-center justify-center text-xs shadow-2xs">
                          P
                        </span>
                        <span>Plan (Rencana Tindakan & Edukasi Klien)</span>
                      </label>
                      <span className="text-[10px] text-neutral-400 font-mono">Tindakan Medis</span>
                    </div>
                    <textarea
                      rows={4}
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      placeholder="Contoh: Rencana terapi cairan (infus), injeksi medikasi, prosedur bedah/grooming medis, jadwal kontrol ulang, edukasi perawatan di rumah..."
                      className="w-full flex-1 p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden leading-relaxed resize-none"
                    />
                  </div>
                </div>

                {/* DIAGNOSA PENUNJANG & ATTACHMENT UPLOADER */}
                <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                        <Microscope className="w-4 h-4 text-fuchsia-700" />
                        <span>Modul Diagnosa Penunjang (X-Ray / USG / Lab / Sitologi)</span>
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Unggah foto rontgen radiologi, scan USG, hasil hematologi darah lengkap, atau sitologi mikroskop.
                      </p>
                    </div>

                    {/* Category Selector */}
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-neutral-500 font-semibold">Kategori Berkas:</label>
                      <select
                        value={diagnosticCategory}
                        onChange={(e) => setDiagnosticCategory(e.target.value as any)}
                        className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-xs text-neutral-900 font-bold focus:ring-2 focus:ring-fuchsia-500"
                      >
                        <option value="Rontgen / X-Ray">📸 Rontgen / X-Ray</option>
                        <option value="USG">📡 USG Abdomen/Organ</option>
                        <option value="Hematologi / Lab">🩸 Hematologi / Lab Darah</option>
                        <option value="Sitologi / Mikroskopik">🔬 Sitologi / Mikroskopik</option>
                        <option value="Rapid Test">🧪 Rapid Test Kit (Parvo/Distemper/FeLV)</option>
                        <option value="Lainnya">📁 Berkas Lainnya</option>
                      </select>
                    </div>
                  </div>

                  {/* Dropzone Area */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
                      isDraggingFile
                        ? 'border-fuchsia-600 bg-fuchsia-50/50'
                        : 'border-neutral-200 hover:border-fuchsia-400 bg-neutral-50/50 hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileInputChange}
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      className="hidden"
                    />
                    <UploadCloud className="w-8 h-8 mx-auto mb-2 text-fuchsia-700" />
                    <p className="text-xs font-bold text-neutral-800">
                      Tarik & Letakkan Berkas di Sini, atau <span className="text-fuchsia-700 underline">Pilih Berkas</span>
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Mendukung Foto Rontgen (JPG, PNG, WebP) dan Dokumen Hasil Lab (PDF, DOCX) hingga 8MB
                    </p>
                  </div>

                  {/* Attached Files List */}
                  {diagnosticAttachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <span className="text-[11px] font-bold text-neutral-700 block">
                        Berkas Terlampir ({diagnosticAttachments.length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {diagnosticAttachments.map((att) => (
                          <div
                            key={att.id}
                            className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between gap-2 shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {att.type === 'image' ? (
                                <div
                                  onClick={() => setPreviewModalImage(att)}
                                  className="w-10 h-10 rounded-lg bg-neutral-200 overflow-hidden shrink-0 cursor-pointer border border-neutral-300"
                                >
                                  <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                                  <FileText className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-neutral-800 text-xs truncate">{att.name}</p>
                                <p className="text-[10px] text-neutral-400">
                                  {att.category} • {att.size}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {att.type === 'image' && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewModalImage(att)}
                                  className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 transition cursor-pointer"
                                  title="Lihat Gambar"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(att.id)}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Hapus Berkas"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Diagnostic Notes Input */}
                  <div className="mt-4">
                    <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                      Catatan Interpretasi Hasil Diagnosa Penunjang:
                    </label>
                    <input
                      type="text"
                      value={diagnosticNotes}
                      onChange={(e) => setDiagnosticNotes(e.target.value)}
                      placeholder="Contoh: Tampak pembesaran vesica urinaria pada USG, atau fraktur os femur dekstra pada X-Ray..."
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                    />
                  </div>
                </div>

                {/* INTEGRATED E-PRESCRIPTION MODULE */}
                <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                        <Pill className="w-4 h-4 text-fuchsia-700" />
                        <span>Modul E-Resep (E-Prescription Terintegrasi Stok)</span>
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Obat yang dipilih akan otomatis dipotong dari persediaan Stok Obat saat rekam medis ini disimpan.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddPrescription}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-xs font-bold transition w-fit shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Obat</span>
                    </button>
                  </div>

                  {prescriptions.length === 0 ? (
                    <div className="p-6 text-center text-neutral-500 text-xs bg-neutral-50 rounded-xl border border-neutral-200">
                      Belum ada resep obat yang ditambahkan. Klik tombol <strong>+ Tambah Obat</strong> jika pasien membutuhkan terapi farmasi.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {prescriptions.map((item, idx) => {
                        const selectedInv = inventory.find((i) => i.id === item.inventoryItemId);

                        return (
                          <div
                            key={idx}
                            className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col sm:flex-row sm:items-center gap-3"
                          >
                            {/* Medicine Dropdown with Search */}
                            <div className="flex-1 min-w-[200px]">
                              <label className="text-[10px] text-neutral-500 font-semibold block mb-1">
                                Pilih Obat / BHP Medis
                              </label>
                              <SearchableMedicineSelect
                                value={item.inventoryItemId}
                                onChange={(newId) => handleMedChange(idx, newId)}
                                inventory={inventory}
                              />
                            </div>

                            {/* Dosage Instructions */}
                            <div className="flex-2 min-w-[220px]">
                              <label className="text-[10px] text-neutral-500 font-semibold block mb-1">
                                Dosis & Aturan Minum (Signa)
                              </label>
                              <input
                                type="text"
                                value={item.dosage}
                                onChange={(e) => handlePrescriptionFieldChange(idx, 'dosage', e.target.value)}
                                placeholder="Contoh: 2x sehari 1 tablet sesudah makan"
                                className="w-full bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:ring-2 focus:ring-fuchsia-500"
                              />
                            </div>

                            {/* Quantity */}
                            <div className="w-28">
                              <label className="text-[10px] text-neutral-500 font-semibold block mb-1">
                                Jumlah ({item.unit})
                              </label>
                              <input
                                type="number"
                                min="1"
                                max={selectedInv ? selectedInv.stockQuantity : 999}
                                value={item.quantity}
                                onChange={(e) =>
                                  handlePrescriptionFieldChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                                }
                                className="w-full bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-xs text-neutral-900 font-mono font-bold focus:ring-2 focus:ring-fuchsia-500"
                              />
                            </div>

                            {/* Remove Action */}
                            <div className="sm:self-end pb-0.5">
                              <button
                                type="button"
                                onClick={() => handleRemovePrescription(idx)}
                                className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-neutral-200 cursor-pointer"
                                title="Hapus baris obat"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Panel Biaya Jasa Medis & Tarif Tindakan (Service Fee) */}
                  <div className="mt-6 pt-5 border-t border-neutral-200">
                    <div className="bg-gradient-to-br from-fuchsia-50/70 via-purple-50/40 to-emerald-50/30 rounded-2xl p-4 sm:p-5 border border-fuchsia-200/80 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-fuchsia-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-fuchsia-100 text-fuchsia-800 flex items-center justify-center shadow-2xs shrink-0">
                            <DollarSign className="w-5 h-5 text-fuchsia-700" />
                          </div>
                          <div>
                            <h4 className="text-xs sm:text-sm font-extrabold text-neutral-900 flex items-center gap-1.5 flex-wrap">
                              <span>Biaya Jasa Medis &amp; Tarif Tindakan (Service Fee)</span>
                            </h4>
                            <p className="text-[11px] text-neutral-500 mt-0.5">
                              Nilai diisi manual oleh dokter (sudah termasuk obat dan seluruh tindakan).
                            </p>
                          </div>
                        </div>

                        <div className="text-left sm:text-right shrink-0 bg-white/80 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-xl border sm:border-0 border-fuchsia-100">
                          <span className="text-[10px] text-neutral-500 block uppercase font-bold tracking-wider">Nilai Service Fee</span>
                          <span className="text-base sm:text-lg font-black font-mono text-fuchsia-900">
                            Rp {currentFeeNum.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* Input Service Fee */}
                        <div className="md:col-span-5">
                          <label className="text-[11px] font-bold text-neutral-700 block mb-1.5 flex items-center justify-between">
                            <span>Biaya Jasa Medis &amp; Tarif Tindakan (Service Fee)</span>
                            <span className="text-[10px] font-mono text-neutral-400">Diisi manual</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500 font-mono">
                              Rp
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={serviceFee}
                              onChange={(e) => setServiceFee(e.target.value)}
                              placeholder="50000"
                              className="w-full bg-white border border-neutral-300 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono font-extrabold text-neutral-900 focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* Quick Preset Buttons */}
                        <div className="md:col-span-7">
                          <span className="text-[10px] text-neutral-500 font-semibold block mb-1.5">
                            Pilihan Cepat Tarif Standar:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: 'Gratis (Rp 0)', value: '0' },
                              { label: 'Rp 35.000 (Ringan)', value: '35000' },
                              { label: 'Rp 50.000 (Standar)', value: '50000' },
                              { label: 'Rp 75.000 (Injeksi)', value: '75000' },
                              { label: 'Rp 100.000 (Lengkap)', value: '100000' },
                              { label: 'Rp 150.000 (Khusus)', value: '150000' },
                            ].map((preset) => (
                              <button
                                key={preset.value}
                                type="button"
                                onClick={() => setServiceFee(preset.value)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${
                                  serviceFee === preset.value
                                    ? 'bg-fuchsia-700 text-white border-fuchsia-700 shadow-2xs'
                                    : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submit & WhatsApp Action Bar */}
                  <div className="mt-5 pt-4 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleSendWhatsappResume}
                      disabled={!currentPet}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 transition text-xs shadow-2xs cursor-pointer disabled:opacity-50"
                      title="Kirim resume rekam medis langsung ke WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                      <span>Kirim Resume ke WhatsApp</span>
                    </button>

                    <button
                      type="submit"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition transform active:scale-98 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>Simpan Rekam Medis &amp; Selesaikan Antrean</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* HISTORICAL SOAP RECORDS FOR THIS PET */}
              {petHistory.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-fuchsia-700" />
                    <span>Riwayat Rekam Medis Sebelumnya ({petHistory.length} Kali Kunjungan)</span>
                  </h3>

                  <div className="space-y-4">
                    {petHistory.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs space-y-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-fuchsia-800 font-bold">{rec.date}</span>
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded-md bg-neutral-200 text-neutral-600">
                              {rec.id}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-500 hidden sm:inline">
                              Pemeriksa: <strong className="text-neutral-800">{rec.veterinarian}</strong>
                            </span>
                            {(currentPet?.ownerWhatsapp || activeQueueForPet?.ownerWhatsapp) && (
                              <a
                                href={`https://wa.me/${toWhatsappNumber(currentPet?.ownerWhatsapp || activeQueueForPet?.ownerWhatsapp || '')}?text=Halo%20Kak%20${encodeURIComponent(
                                  rec.ownerName || currentPet?.ownerName || 'Klien'
                                )},%20berikut%20adalah%20resume%20rekam%20medis%20pasien%20${encodeURIComponent(
                                  rec.petName || currentPet?.name || 'hewan'
                                )}%20di%20Vier%20Pet%20Care:%20Diagnosa:%20${encodeURIComponent(
                                  rec.soap.assessment || '-'
                                )},%20Terapi:%20${encodeURIComponent(rec.soap.plan || '-')}.`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 transition text-[11px]"
                              >
                                <MessageCircle className="w-3 h-3 text-emerald-600" />
                                <span>Kirim Resume ke WhatsApp</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingSoapRecord(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-fuchsia-50 border border-neutral-300 hover:border-fuchsia-400 text-neutral-700 hover:text-fuchsia-800 font-bold text-[11px] shadow-2xs transition cursor-pointer"
                              title="Edit data rekam medis & susulkan diagnosa penunjang"
                            >
                              <Edit className="w-3 h-3 text-fuchsia-700" />
                              <span>Edit Rekam Medis</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSoap(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-[11px] transition cursor-pointer"
                              title="Hapus data rekam medis ini"
                            >
                              <Trash2 className="w-3 h-3 text-rose-700" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 font-mono text-[11px] text-neutral-600">
                          <span>BB: <strong className="text-neutral-900">{rec.vitals.weight > 0 ? `${rec.vitals.weight}kg` : '-'}</strong></span>
                          <span>Suhu: <strong className="text-neutral-900">{rec.vitals.temperature > 0 ? `${rec.vitals.temperature}°C` : '-'}</strong></span>
                          <span>HR: <strong className="text-neutral-900">{rec.vitals.heartRate > 0 ? `${rec.vitals.heartRate}bpm` : '-'}</strong></span>
                          <span>RR: <strong className="text-neutral-900">{rec.vitals.respiratoryRate > 0 ? `${rec.vitals.respiratoryRate}rpm` : '-'}</strong></span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-neutral-700">
                          <div>
                            <strong className="text-fuchsia-900 text-[11px] block">Assessment (Diagnosa):</strong>
                            <p>{rec.soap.assessment}</p>
                          </div>
                          <div>
                            <strong className="text-fuchsia-900 text-[11px] block">Plan (Terapi):</strong>
                            <p>{rec.soap.plan}</p>
                          </div>
                        </div>

                        {/* Diagnosa Penunjang (X-Ray, USG, Lab Darah, dll) */}
                        {((rec.diagnosticAttachments && rec.diagnosticAttachments.length > 0) || rec.diagnosticNotes) && (
                          <div className="pt-2 border-t border-neutral-200 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-neutral-700 flex items-center gap-1">
                                <Microscope className="w-3.5 h-3.5 text-sky-600" />
                                <span>Diagnosa Penunjang ({rec.diagnosticAttachments?.length || 0} Berkas):</span>
                              </span>
                            </div>
                            {rec.diagnosticNotes && (
                              <p className="text-[11px] text-neutral-600 italic bg-white p-2 rounded-lg border border-neutral-200/80">
                                "{rec.diagnosticNotes}"
                              </p>
                            )}
                            {rec.diagnosticAttachments && rec.diagnosticAttachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {rec.diagnosticAttachments.map((att) => (
                                  <div
                                    key={att.id}
                                    onClick={() => att.type === 'image' && setPreviewModalImage(att)}
                                    className={`flex items-center gap-1.5 px-2 py-1 bg-white border border-neutral-200 rounded-lg text-[10px] ${
                                      att.type === 'image' ? 'cursor-pointer hover:border-fuchsia-400' : ''
                                    }`}
                                  >
                                    <span>{att.type === 'image' ? '🖼️' : '📄'}</span>
                                    <span className="font-semibold text-neutral-800">{att.category}:</span>
                                    <span className="text-neutral-600 truncate max-w-[120px]">{att.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {rec.prescriptions.length > 0 && (
                          <div className="pt-2 border-t border-neutral-200 text-neutral-500 text-[11px]">
                            <span className="font-semibold text-neutral-700">Obat Diberikan: </span>
                            {rec.prescriptions.map((p, i) => (
                              <span
                                key={i}
                                className="inline-block bg-white border border-neutral-200 px-2 py-0.5 rounded-md mr-1.5 text-fuchsia-900 font-medium"
                              >
                                {p.itemName} ({p.quantity} {p.unit})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HISTORICAL INPATIENT RECORDS FOR THIS PET */}
              {petInpatientHistory.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                    <Hotel className="w-4 h-4 text-fuchsia-700" />
                    <span>Riwayat Rawat Inap Sebelumnya ({petInpatientHistory.length} Kali Dirawat)</span>
                  </h3>

                  <div className="space-y-4">
                    {petInpatientHistory.map((hist) => (
                      <div
                        key={hist.id}
                        className="p-4 rounded-xl bg-fuchsia-50/30 border border-fuchsia-100 text-xs space-y-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-fuchsia-100">
                          <span className="font-mono text-fuchsia-800 font-bold bg-fuchsia-100/60 px-2 py-0.5 rounded-md">
                            {hist.cageLabel ? `Kandang ${hist.cageLabel}` : 'Perawatan Rawat Inap'}
                          </span>
                          <span className="text-neutral-500 text-[10px] font-mono">
                            Masuk: {hist.admittedAt} | Keluar: {hist.dischargedAt}
                          </span>
                        </div>

                        <div className="text-neutral-700 space-y-1">
                          <p>
                            <strong className="text-neutral-900 block font-bold text-[11px]">Diagnosa Rawat Inap:</strong>
                            <span className="italic">"{hist.diagnosis}"</span>
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            Dokter Penanggungjawab: <strong className="text-neutral-700">{hist.veterinarian}</strong>
                          </p>
                        </div>

                        {hist.observations && hist.observations.length > 0 && (
                          <div className="pt-2 border-t border-fuchsia-100/50">
                            <span className="font-semibold text-neutral-700 block mb-1">Catatan Log Observasi Harian:</span>
                            <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 font-sans">
                              {hist.observations.map((obs, oIdx) => (
                                <div key={obs.id || oIdx} className="bg-white/80 p-2 rounded-lg border border-neutral-100 text-[10px] flex justify-between gap-2">
                                  <div>
                                    <span className="font-bold text-neutral-800">{obs.date} {obs.time}</span> - <span className="text-neutral-600">{obs.notes}</span>
                                  </div>
                                  <div className="shrink-0 text-right font-mono text-neutral-500">
                                    Suhu: {obs.temp}°C | Nafsu: {obs.appetite}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HISTORICAL SURGERY RECORDS FOR THIS PET */}
              {petSurgeryHistory.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                      <Scissors className="w-4 h-4 text-purple-700" />
                      <span>Riwayat Tindakan Operasi ({petSurgeryHistory.length} Kali Tindakan)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/operasi')}
                      className="text-[11px] font-bold text-purple-700 hover:text-purple-800 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Input Operasi Baru</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {petSurgeryHistory.map((surg) => (
                      <div
                        key={surg.id}
                        className="p-4 rounded-xl bg-purple-50/40 border border-purple-100 text-xs space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-purple-100">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-950 text-xs sm:text-sm">
                              {surg.operationType || 'Tindakan Operasi'}
                            </span>
                            <span className="font-mono text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-bold">
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
                            <span className="text-neutral-500 text-[10px] font-mono">
                              {surg.date || '-'} {surg.time ? `• ${surg.time}` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-700">
                          <div>
                            <span className="text-[11px] text-neutral-500 block">Operator / Dokter Bedah:</span>
                            <strong className="text-neutral-900">{surg.operator || '-'}</strong>
                          </div>
                          <div>
                            <span className="text-[11px] text-neutral-500 block">Jenis Tindakan:</span>
                            <strong className="text-neutral-900">{surg.operationType || '-'}</strong>
                          </div>
                        </div>

                        {/* Rincian Dosis Anestesi & Premedikasi */}
                        {(surg.atropineDose || surg.xylazineDose || surg.ketamineDose || surg.acpDose || surg.yohimbineDose) && (
                          <div className="bg-white/80 p-2.5 rounded-lg border border-purple-100">
                            <span className="font-bold text-purple-950 block text-[11px] mb-1">
                              Protokol Anestesi & Premedikasi:
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-neutral-600">
                              {surg.atropineDose && <span>Atropin: <strong className="text-neutral-800">{surg.atropineDose}</strong></span>}
                              {surg.xylazineDose && <span>Xylazine: <strong className="text-neutral-800">{surg.xylazineDose}</strong></span>}
                              {surg.ketamineDose && <span>Ketamin: <strong className="text-neutral-800">{surg.ketamineDose}</strong></span>}
                              {surg.acpDose && <span>ACP: <strong className="text-neutral-800">{surg.acpDose}</strong></span>}
                              {surg.yohimbineDose && <span>Yohimbine: <strong className="text-neutral-800">{surg.yohimbineDose}</strong></span>}
                            </div>
                          </div>
                        )}

                        {/* Dosis Antibiotik & Analgesik */}
                        {(surg.antibioticDoseAndType || surg.analgesicDoseAndType) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            {surg.antibioticDoseAndType && (
                              <div className="bg-white/80 p-2 rounded-lg border border-purple-100">
                                <span className="text-neutral-500 block">Antibiotik (Dosis & Jenis):</span>
                                <strong className="text-neutral-800">{surg.antibioticDoseAndType}</strong>
                              </div>
                            )}
                            {surg.analgesicDoseAndType && (
                              <div className="bg-white/80 p-2 rounded-lg border border-purple-100">
                                <span className="text-neutral-500 block">Analgesik (Dosis & Jenis):</span>
                                <strong className="text-neutral-800">{surg.analgesicDoseAndType}</strong>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Catatan Operasi */}
                        {surg.operationNotes && (
                          <div className="pt-1">
                            <span className="font-semibold text-neutral-700 block mb-0.5 text-[11px]">Catatan Operasi:</span>
                            <p className="italic text-neutral-700 bg-white/90 p-2 rounded-lg border border-purple-100 whitespace-pre-wrap">
                              "{surg.operationNotes}"
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status jika semua riwayat medis sebelumnya kosong */}
              {petHistory.length === 0 && petInpatientHistory.length === 0 && petSurgeryHistory.length === 0 && (
                <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs text-center text-neutral-400 py-8">
                  <FileText className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
                  <p className="font-bold text-neutral-700 text-sm">
                    Belum Ada Riwayat Medis Sebelumnya
                  </p>
                  <p className="text-neutral-400 text-xs mt-1">
                    Pasien ini belum memiliki riwayat pemeriksaan SOAP, riwayat rawat inap, atau riwayat tindakan operasi tercatat.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL PREVIEW GAMBAR DIAGNOSA PENUNJANG */}
      {previewModalImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative border border-neutral-100">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">
                  {previewModalImage.category}
                </span>
                <h4 className="text-xs font-bold text-neutral-900 truncate max-w-md">
                  {previewModalImage.name}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950">
              <img
                src={previewModalImage.dataUrl}
                alt={previewModalImage.name}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
              <span>Ukuran: {previewModalImage.size} • Diunggah: {previewModalImage.uploadedAt}</span>
              <a
                href={previewModalImage.dataUrl}
                download={previewModalImage.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-700 hover:bg-fuchsia-800 text-white rounded-xl font-bold cursor-pointer transition"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Unduh Gambar Asli</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT REKAM MEDIS & SUSULAN DIAGNOSA PENUNJANG */}
      <EditSoapRecordModal
        isOpen={!!editingSoapRecord}
        onClose={() => setEditingSoapRecord(null)}
        record={editingSoapRecord}
        petName={editingSoapRecord?.petName || currentPet?.name}
        onSuccess={() => {
          loadSoapRecords(currentPage, debouncedSearch, selectedDoctorFilter, hasDiagnosticFilter, hasPrescriptionFilter);
          refreshPetHistory();
        }}
      />

    </div>
  );
};
