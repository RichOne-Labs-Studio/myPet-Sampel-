import React, { useState, useMemo, useEffect } from 'react';
import {
  Heart,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  User,
  Phone,
  MapPin,
  Sparkles,
  AlertCircle,
  Clock,
  ShieldCheck,
  RotateCcw,
  Camera,
  Upload,
  Search,
  X,
  Check,
  ChevronRight,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { PetType, ServiceType, Owner, Pet } from '../../types';
import { VierLogo } from '../VierLogo';
import { normalizePhoneWithZero, formatPhoneInput, formatPhoneDisplay } from '../../utils/phoneUtils';
import { compressImageFile } from '../../utils/imageUtils';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const RegistrationWizard: React.FC<Props> = ({ navigate }) => {
  const { registerPatient, getOwnerByPhone, getPetsByOwnerPhone, owners, pets } = useClinic();

  // Wizard Step: 1 = Owner, 2 = Pet, 3 = Service & Complaint
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);

  // Form states - Step 1: Owner
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [isExistingOwner, setIsExistingOwner] = useState(false);

  // Quick lookup & suggestions states
  const [quickSearch, setQuickSearch] = useState('');
  const [showQuickDropdown, setShowQuickDropdown] = useState(false);
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [autoFilledNotice, setAutoFilledNotice] = useState<{
    ownerName: string;
    petName: string | null;
    petBreed: string | null;
    petType: string | null;
  } | null>(null);

  // Form states - Step 2: Pet
  const [selectedExistingPetId, setSelectedExistingPetId] = useState<string>('new');
  const [petName, setPetName] = useState('');
  const [petType, setPetType] = useState<PetType>('Cat');
  const [petBreed, setPetBreed] = useState('');
  const [petAge, setPetAge] = useState('');
  const [petSex, setPetSex] = useState<'Jantan' | 'Betina'>('Jantan');
  const [petPhotoUrl, setPetPhotoUrl] = useState('');

  // Form states - Step 3: Service & Complaint
  const [serviceType, setServiceType] = useState<ServiceType>('Consultation');
  const [chiefComplaint, setChiefComplaint] = useState('');

  // Mode: 'periksa' (dengan pemeriksaan) vs 'daftar' (hanya sekedar mendaftar data hewan)
  const [registrationMode, setRegistrationMode] = useState<'periksa' | 'daftar'>('periksa');

  // Pernyataan persetujuan medis
  const [consentAgreed, setConsentAgreed] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Phone normalization & owner recognition
  const cleanPhone = String(ownerPhone ?? '').replace(/\D/g, '');
  const normalizedPhone = cleanPhone.startsWith('62') ? '0' + cleanPhone.slice(2) : cleanPhone;

  const recognizedOwner = useMemo(() => {
    if (!normalizedPhone || normalizedPhone.length < 8) return null;
    return (
      owners.find((o) => {
        const oClean = String(o.whatsapp ?? '').replace(/\D/g, '');
        const oNorm = oClean.startsWith('62') ? '0' + oClean.slice(2) : oClean;
        return (
          oNorm === normalizedPhone ||
          (normalizedPhone.length >= 9 && oNorm.endsWith(normalizedPhone.slice(-9)))
        );
      }) || null
    );
  }, [owners, normalizedPhone]);

  const existingPets = useMemo(() => {
    if (!recognizedOwner && (!normalizedPhone || normalizedPhone.length < 8)) return [];
    return pets.filter((p) => {
      if (recognizedOwner && p.ownerId === recognizedOwner.id) return true;
      const pClean = String(p.ownerWhatsapp ?? '').replace(/\D/g, '');
      const pNorm = pClean.startsWith('62') ? '0' + pClean.slice(2) : pClean;
      return (
        pNorm === normalizedPhone ||
        (normalizedPhone.length >= 9 && pNorm.endsWith(normalizedPhone.slice(-9)))
      );
    });
  }, [pets, recognizedOwner, normalizedPhone]);

  // Master auto-fill handler for both Owner and Patient
  const autoFillWithData = (owner: Owner, petToSelect?: Pet) => {
    setOwnerPhone(owner.whatsapp);
    setOwnerName(owner.name);
    setOwnerAddress(owner.address);
    setIsExistingOwner(true);
    setShowQuickDropdown(false);
    setShowPhoneDropdown(false);
    setShowNameDropdown(false);
    setQuickSearch('');

    // Clear step 1 & 2 validation errors
    setErrors((prev) => {
      const next = { ...prev };
      delete next.ownerPhone;
      delete next.ownerName;
      delete next.ownerAddress;
      delete next.petName;
      delete next.petAge;
      return next;
    });

    // Resolve owner's pets
    const oClean = String(owner.whatsapp ?? '').replace(/\D/g, '');
    const oNorm = oClean.startsWith('62') ? '0' + oClean.slice(2) : oClean;
    const ownerPets = pets.filter((p) => {
      if (p.ownerId === owner.id) return true;
      const pClean = String(p.ownerWhatsapp ?? '').replace(/\D/g, '');
      const pNorm = pClean.startsWith('62') ? '0' + pClean.slice(2) : pClean;
      return pNorm === oNorm;
    });

    const targetPet = petToSelect || (ownerPets.length > 0 ? ownerPets[0] : null);
    if (targetPet) {
      setSelectedExistingPetId(targetPet.id);
      setPetName(targetPet.name);
      setPetType(targetPet.type);
      setPetBreed(targetPet.breed);
      setPetAge(targetPet.ageOrDob);
      setPetSex(targetPet.sex);
      setPetPhotoUrl(targetPet.photoUrl || '');
      setAutoFilledNotice({
        ownerName: owner.name,
        petName: targetPet.name,
        petBreed: targetPet.breed,
        petType: targetPet.type,
      });
    } else {
      setSelectedExistingPetId('new');
      setPetName('');
      setPetType('Cat');
      setPetBreed('');
      setPetAge('');
      setPetSex('Jantan');
      setPetPhotoUrl('');
      setAutoFilledNotice({
        ownerName: owner.name,
        petName: null,
        petBreed: null,
        petType: null,
      });
    }
  };

  // Reset form back to fresh entry
  const handleResetForm = () => {
    setOwnerPhone('');
    setOwnerName('');
    setOwnerAddress('');
    setIsExistingOwner(false);
    setSelectedExistingPetId('new');
    setPetName('');
    setPetType('Cat');
    setPetBreed('');
    setPetAge('');
    setPetSex('Jantan');
    setPetPhotoUrl('');
    setAutoFilledNotice(null);
    setQuickSearch('');
    setShowQuickDropdown(false);
    setShowPhoneDropdown(false);
    setShowNameDropdown(false);
  };

  // Handle prefill from sessionStorage (if clicked from check modal)
  useEffect(() => {
    try {
      const storedPhone = sessionStorage.getItem('prefill_reg_phone');
      const storedPetId = sessionStorage.getItem('prefill_reg_pet_id');
      if (storedPhone) {
        sessionStorage.removeItem('prefill_reg_phone');
        sessionStorage.removeItem('prefill_reg_pet_id');

        const clean = String(storedPhone).replace(/\D/g, '');
        const norm = clean.startsWith('62') ? '0' + clean.slice(2) : clean;
        const matched = owners.find((o) => {
          const oClean = String(o.whatsapp ?? '').replace(/\D/g, '');
          const oNorm = oClean.startsWith('62') ? '0' + oClean.slice(2) : oClean;
          return oNorm === norm;
        });

        if (matched) {
          const targetPet = storedPetId ? pets.find((p) => p.id === storedPetId) : undefined;
          autoFillWithData(matched, targetPet);
        }
      }
    } catch {
      // ignore
    }
  }, [owners, pets]);

  // Real-time phone input handler with instant auto-fill & auto-search
  const handlePhoneChange = (val: string) => {
    const formatted = formatPhoneInput(val);
    setOwnerPhone(formatted);
    if (errors.ownerPhone) setErrors((prev) => ({ ...prev, ownerPhone: '' }));

    const norm = normalizePhoneWithZero(formatted);

    if (norm.length >= 8) {
      const match = owners.find((o) => {
        const oNorm = normalizePhoneWithZero(o.whatsapp);
        return oNorm === norm || (norm.length >= 9 && oNorm.endsWith(norm.slice(-9)));
      });

      if (match) {
        autoFillWithData(match);
        return;
      }
    }

    if (formatted.length >= 4 && !isExistingOwner) {
      setShowPhoneDropdown(true);
    } else {
      setShowPhoneDropdown(false);
    }

    if (!val.trim()) {
      setIsExistingOwner(false);
      setAutoFilledNotice(null);
    }
  };

  // Phone blur fallback
  const handlePhoneBlur = () => {
    setTimeout(() => {
      setShowPhoneDropdown(false);
    }, 200);

    const norm = normalizePhoneWithZero(ownerPhone);
    if (norm) {
      setOwnerPhone(norm);
    }

    if (norm.length >= 8) {
      const match = owners.find((o) => {
        const oNorm = normalizePhoneWithZero(o.whatsapp);
        return oNorm === norm || (norm.length >= 9 && oNorm.endsWith(norm.slice(-9)));
      });
      if (match && !isExistingOwner) {
        autoFillWithData(match);
      }
    }
  };

  // Real-time owner name input handler
  const handleOwnerNameChange = (val: string) => {
    setOwnerName(val);
    if (errors.ownerName) setErrors((prev) => ({ ...prev, ownerName: '' }));

    if (val.trim().length >= 2 && !isExistingOwner) {
      setShowNameDropdown(true);
    } else {
      setShowNameDropdown(false);
    }
  };

  // Quick lookup across owners and pets
  const quickSearchResults = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const cleanQ = q.replace(/\D/g, '');
    const results: { owner: Owner; pet?: Pet; matchLabel: string }[] = [];
    const addedKeys = new Set<string>();

    owners.forEach((o) => {
      const oPhone = String(o.whatsapp ?? '').replace(/\D/g, '');
      const oName = String(o.name ?? '').toLowerCase();
      const matchPhone = cleanQ.length >= 3 && oPhone.includes(cleanQ);
      const matchName = oName.includes(q);

      if (matchPhone || matchName) {
        const oPets = pets.filter(
          (p) => p.ownerId === o.id || String(p.ownerWhatsapp ?? '').replace(/\D/g, '') === oPhone
        );
        if (oPets.length > 0) {
          oPets.forEach((p) => {
            const key = `${o.id}_${p.id}`;
            if (!addedKeys.has(key)) {
              addedKeys.add(key);
              results.push({
                owner: o,
                pet: p,
                matchLabel: matchPhone ? `No. WhatsApp: ${o.whatsapp}` : `Pemilik: ${o.name}`,
              });
            }
          });
        } else {
          const key = `${o.id}_no_pet`;
          if (!addedKeys.has(key)) {
            addedKeys.add(key);
            results.push({
              owner: o,
              matchLabel: matchPhone ? `No. WhatsApp: ${o.whatsapp}` : `Pemilik: ${o.name}`,
            });
          }
        }
      }
    });

    pets.forEach((p) => {
      const pName = String(p.name ?? '').toLowerCase();
      if (pName.includes(q)) {
        const pPhone = String(p.ownerWhatsapp ?? '').replace(/\D/g, '');
        const foundOwner = owners.find(
          (o) => o.id === p.ownerId || String(o.whatsapp ?? '').replace(/\D/g, '') === pPhone
        );
        if (foundOwner) {
          const key = `${foundOwner.id}_${p.id}`;
          if (!addedKeys.has(key)) {
            addedKeys.add(key);
            results.push({
              owner: foundOwner,
              pet: p,
              matchLabel: `Nama Pasien: ${p.name}`,
            });
          }
        }
      }
    });

    return results.slice(0, 6);
  }, [quickSearch, owners, pets]);

  // Suggestions for phone input
  const phoneSuggestions = useMemo(() => {
    const clean = String(ownerPhone ?? '').replace(/\D/g, '');
    if (clean.length < 3 || isExistingOwner) return [];
    return owners
      .filter((o) => String(o.whatsapp ?? '').replace(/\D/g, '').includes(clean))
      .slice(0, 4);
  }, [ownerPhone, owners, isExistingOwner]);

  // Suggestions for name input
  const nameSuggestions = useMemo(() => {
    const q = ownerName.trim().toLowerCase();
    if (q.length < 2 || isExistingOwner) return [];
    return owners
      .filter((o) => String(o.name ?? '').toLowerCase().includes(q))
      .slice(0, 4);
  }, [ownerName, owners, isExistingOwner]);

  const handleSelectExistingPet = (petId: string) => {
    setSelectedExistingPetId(petId);
    if (petId === 'new') {
      setPetName('');
      setPetType('Cat');
      setPetBreed('');
      setPetAge('');
      setPetSex('Jantan');
      setPetPhotoUrl('');
    } else {
      const found = existingPets.find((p) => p.id === petId) || pets.find((p) => p.id === petId);
      if (found) {
        setPetName(found.name);
        setPetType(found.type);
        setPetBreed(found.breed);
        setPetAge(found.ageOrDob);
        setPetSex(found.sex);
        setPetPhotoUrl(found.photoUrl || '');
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, { maxWidth: 480, maxHeight: 480, quality: 0.72 });
        setPetPhotoUrl(compressed);
      } catch {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPetPhotoUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Camera states and handlers
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // prefer back/rear camera for pet photos
        audio: false,
      });
      setCameraStream(stream);
      // Let React render videoRef container, then assign stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      console.error('Error starting camera:', err);
      alert('Gagal membuka kamera. Pastikan izin kamera telah diberikan di browser Anda.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      let width = video.videoWidth || 640;
      let height = video.videoHeight || 480;
      const maxDim = 480;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        setPetPhotoUrl(dataUrl);
      }
    }
    stopCamera();
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Step 1 validation
  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!ownerPhone.trim()) {
      errs.ownerPhone = 'Nomor WhatsApp wajib diisi';
    } else {
      const norm = normalizePhoneWithZero(ownerPhone);
      if (!norm.startsWith('0')) {
        errs.ownerPhone = 'Nomor telepon harus berawal dengan "0" (contoh: 08123456789)';
      } else if (norm.length < 9) {
        errs.ownerPhone = 'Nomor WhatsApp minimal 9 digit (contoh: 08123456789)';
      }
    }
    if (!ownerName.trim()) {
      errs.ownerName = 'Nama pemilik wajib diisi';
    }
    if (!ownerAddress.trim()) {
      errs.ownerAddress = 'Alamat domisili wajib diisi';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Step 2 validation
  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!petName.trim()) {
      errs.petName = 'Nama hewan / pasien wajib diisi';
    }
    if (!petAge.trim()) {
      errs.petAge = 'Usia hewan wajib diisi (misal: 2 Tahun / 6 Bulan)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Step 3 validation
  const validateStep3 = () => {
    const errs: Record<string, string> = {};
    if (registrationMode === 'periksa' && !chiefComplaint.trim()) {
      errs.chiefComplaint = 'Keluhan utama / alasan kunjungan wajib diisi';
    }
    if (!consentAgreed) {
      errs.consent =
        'Anda wajib mencentang persetujuan pernyataan sebelum mengakhiri proses pendaftaran.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 1 && validateStep1()) {
      setErrors({});
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (currentStep === 2 && validateStep2()) {
      setErrors({});
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (currentStep === 3) setCurrentStep(2);
    else if (currentStep === 2) setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) return;

    const finalServiceType: ServiceType =
      registrationMode === 'daftar' ? 'Daftar' : serviceType;
    const finalComplaint =
      registrationMode === 'daftar'
        ? chiefComplaint.trim() || 'Pendaftaran data hewan baru (tanpa pemeriksaan saat ini)'
        : chiefComplaint.trim();

    const ticket = registerPatient({
      owner: {
        name: ownerName.trim(),
        whatsapp: normalizePhoneWithZero(ownerPhone.trim()),
        address: ownerAddress.trim(),
      },
      pet: {
        name: petName.trim(),
        type: petType,
        breed: petBreed.trim() || 'Mix / Domestik',
        ageOrDob: petAge.trim() || '1 Tahun',
        sex: petSex,
        photoUrl: petPhotoUrl.trim() || undefined,
      },
      visit: {
        chiefComplaint: finalComplaint,
        serviceType: finalServiceType,
      },
      informedConsent: consentAgreed
        ? 'Disetujui: Bebas tuntutan resiko medis sesuai kaidah kedokteran hewan'
        : 'Tidak disetujui',
    });

    if (registrationMode === 'daftar') {
      try {
        sessionStorage.setItem(
          'vier_reg_success_msg',
          JSON.stringify({
            petName: petName.trim(),
            petType,
            ownerName: ownerName.trim(),
          })
        );
      } catch (err) {
        console.error(err);
      }
      handleReset();
      navigate('/');
      return;
    }

    setSubmittedTicket(ticket);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = () => {
    setOwnerPhone('');
    setOwnerName('');
    setOwnerAddress('');
    setIsExistingOwner(false);
    setSelectedExistingPetId('new');
    setPetName('');
    setPetType('Cat');
    setPetBreed('');
    setPetAge('');
    setPetSex('Jantan');
    setPetPhotoUrl('');
    setRegistrationMode('periksa');
    setServiceType('Consultation');
    setChiefComplaint('');
    setConsentAgreed(false);
    setErrors({});
    setCurrentStep(1);
    setSubmittedTicket(null);
  };

  // Success screen
  if (submittedTicket) {
    return (
      <div id="registration-success-root" className="min-h-screen bg-neutral-50 py-10 px-4 font-sans flex flex-col justify-center items-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-neutral-200/60 border border-fuchsia-100 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-fuchsia-100 text-fuchsia-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-fuchsia-900 bg-fuchsia-50 px-3 py-1 rounded-full border border-fuchsia-200 mb-2">
              {serviceType === 'Daftar' ? 'Registrasi Data Hewan Berhasil' : 'Pendaftaran Kunjungan Berhasil'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
              {serviceType === 'Daftar' ? 'Nomor Registrasi Pasien' : 'Nomor Antrean Anda'}
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              {serviceType === 'Daftar'
                ? 'Data hewan peliharaan Anda telah tersimpan resmi di database klinik Vier Pet Care.'
                : 'Data kunjungan langsung tersinkronisasi ke sistem antrean klinik dokter.'}
            </p>
          </div>

          {/* Ticket Display Card */}
          <div className="bg-gradient-to-br from-fuchsia-900 via-fuchsia-800 to-neutral-950 rounded-2xl p-6 text-white shadow-lg shadow-fuchsia-900/25 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
            <p className="text-xs font-semibold text-fuchsia-200 uppercase tracking-widest">
              {serviceType === 'Daftar' ? 'ID Registrasi' : 'Tiket Pasien'}
            </p>
            <p className="text-5xl sm:text-6xl font-black font-mono my-2 tracking-tight">
              {submittedTicket}
            </p>
            <div className="pt-3 border-t border-white/20 flex items-center justify-between text-xs text-fuchsia-100">
              <span>{petName} ({petType})</span>
              <span className="font-semibold">{serviceType === 'Daftar' ? 'Daftar (Tanpa Periksa)' : serviceType}</span>
            </div>
          </div>

          {/* Details Summary */}
          <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 text-left text-xs space-y-2 text-neutral-700">
            <div className="flex justify-between">
              <span className="text-neutral-500">Pemilik:</span>
              <span className="font-semibold text-neutral-800">{ownerName} ({formatPhoneDisplay(ownerPhone)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Pasien:</span>
              <span className="font-semibold text-neutral-800">{petName} • {petSex} • {petAge}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Layanan:</span>
              <span className="font-semibold text-neutral-800">{serviceType === 'Daftar' ? 'Daftar Data Hewan Saja' : serviceType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Keterangan:</span>
              <span className="font-medium text-neutral-800 text-right max-w-[200px] truncate">{chiefComplaint || 'Registrasi Baru'}</span>
            </div>
            {serviceType !== 'Daftar' ? (
              <div className="pt-2 border-t border-neutral-200 flex items-center justify-between text-fuchsia-800 font-semibold">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-fuchsia-600" /> Estimasi Giliran:
                </span>
                <span>± 15 - 25 Menit</span>
              </div>
            ) : (
              <div className="pt-2 border-t border-neutral-200 flex items-center justify-between text-emerald-800 font-semibold">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Status:
                </span>
                <span>Terdaftar Aktif di Klinik</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              id="btn-goto-live-queue"
              onClick={() => navigate('/pasien/dashboard')}
              className="w-full py-3.5 px-4 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-sm shadow-md shadow-fuchsia-700/20 transition flex items-center justify-center gap-2"
            >
              <span>Pantau Status Antrean Live</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-center gap-4 text-xs pt-1">
              <button
                onClick={handleReset}
                className="text-fuchsia-800 hover:underline font-medium"
              >
                Daftar Kunjungan Lain
              </button>
              <span className="text-neutral-300">•</span>
              <button
                onClick={() => navigate('/')}
                className="text-neutral-500 hover:text-neutral-800 hover:underline"
              >
                Kembali ke Beranda
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="registration-wizard-root" className="min-h-screen bg-neutral-50 py-8 sm:py-12 px-4 font-sans text-neutral-800">
      <div className="max-w-xl mx-auto w-full space-y-6">
        {/* Header Back Button & Clinic Label */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-fuchsia-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Beranda</span>
          </button>

          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
            <VierLogo className="h-7 w-auto" />
            <span className="hidden sm:inline text-neutral-300">|</span>
            <span className="hidden sm:inline text-neutral-500">Pendaftaran Pasien Baru</span>
          </div>
        </div>

        {/* Wizard Main Container Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-neutral-200/50 border border-fuchsia-100/80">
          {/* Step Progress Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
              <span>Langkah {currentStep} dari 3</span>
              <span className="text-fuchsia-700 font-bold">
                {currentStep === 1 && 'Data Pemilik'}
                {currentStep === 2 && 'Data Hewan / Pasien'}
                {currentStep === 3 && 'Layanan & Keluhan'}
              </span>
            </div>

            <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-fuchsia-700 to-fuchsia-500 transition-all duration-300"
                style={{ width: `${(currentStep / 3) * 100}%` }}
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 1: DATA PEMILIK */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                  Informasi Pemilik Hewan
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Masukkan nomor WhatsApp aktif untuk menghubungkan data riwayat hewan dan notifikasi antrean.
                </p>
              </div>

              {/* Quick Auto-Lookup for Registered Patients */}
              <div className="p-4 bg-gradient-to-br from-fuchsia-50/80 via-white to-fuchsia-50/40 rounded-2xl border border-fuchsia-200/80 shadow-xs space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fuchsia-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-fuchsia-600" />
                    Pencarian Cepat Data Terdaftar
                  </span>
                  <span className="text-[10px] font-bold text-fuchsia-700 bg-fuchsia-100/80 px-2 py-0.5 rounded-full">
                    Auto-Fill Aktif
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Sudah terdaftar sebelumnya? Masukkan No. WhatsApp, Nama Pemilik, atau Nama Pasien Hewan:
                </p>
                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={quickSearch}
                    onChange={(e) => {
                      setQuickSearch(e.target.value);
                      setShowQuickDropdown(true);
                    }}
                    onFocus={() => setShowQuickDropdown(true)}
                    placeholder="Ketik nomor WhatsApp, nama pemilik, atau nama hewan..."
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-fuchsia-200 bg-white focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden transition"
                  />
                  {quickSearch && (
                    <button
                      type="button"
                      onClick={() => setQuickSearch('')}
                      className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown Results */}
                {showQuickDropdown && quickSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white rounded-xl shadow-xl border border-neutral-200 p-1.5 space-y-1 max-h-60 overflow-y-auto">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase text-neutral-400">
                      Data Terdaftar Ditemukan ({quickSearchResults.length})
                    </p>
                    {quickSearchResults.map((res, idx) => (
                      <button
                        key={`${res.owner.id}_${res.pet?.id || idx}`}
                        type="button"
                        onClick={() => autoFillWithData(res.owner, res.pet)}
                        className="w-full p-2.5 rounded-lg text-left hover:bg-fuchsia-50 flex items-center justify-between text-xs transition group cursor-pointer"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-neutral-900 group-hover:text-fuchsia-900">
                            <User className="w-3.5 h-3.5 text-fuchsia-600" />
                            <span>{res.owner.name}</span>
                            <span className="text-neutral-400 text-[11px] font-normal">({formatPhoneDisplay(res.owner.whatsapp)})</span>
                          </div>
                          {res.pet && (
                            <div className="text-[11px] text-fuchsia-700 flex items-center gap-1 font-medium">
                              <span>🐾 Pasien: <strong>{res.pet.name}</strong> ({res.pet.type} - {res.pet.breed || 'Mix'})</span>
                            </div>
                          )}
                          <p className="text-[10px] text-neutral-400 truncate max-w-[280px]">Alamat: {res.owner.address || '-'}</p>
                        </div>
                        <span className="px-2 py-1 bg-fuchsia-100 text-fuchsia-800 rounded-md text-[10px] font-bold group-hover:bg-fuchsia-700 group-hover:text-white transition shrink-0 ml-2">
                          Isi Otomatis
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Notice & Preview if Existing Owner Recognized */}
              {isExistingOwner && (
                <div className="p-4 bg-emerald-50/90 rounded-2xl border border-emerald-200 shadow-xs space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-emerald-950">
                          Data Terdaftar Dikenali! Isian Pemilik & Pasien Berhasil Dimuat
                        </h4>
                        <p className="text-[11px] text-emerald-700">
                          Data pemilik dan hewan telah terisi otomatis di bawah.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="text-[10px] font-bold text-neutral-500 hover:text-neutral-800 bg-white hover:bg-neutral-100 px-2 py-1 rounded-md border border-neutral-200 transition cursor-pointer"
                    >
                      Reset Form
                    </button>
                  </div>

                  {/* Summary Card */}
                  <div className="bg-white/95 rounded-xl p-3 border border-emerald-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-neutral-400 block">Pemilik:</span>
                      <p className="font-bold text-neutral-800">{ownerName}</p>
                      <p className="text-[11px] text-neutral-500">WA: {formatPhoneDisplay(ownerPhone)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-neutral-400 block">Pasien Hewan:</span>
                      <p className="font-bold text-fuchsia-900">
                        {petName ? `${petName} (${petType})` : 'Belum memilih hewan'}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {petBreed ? `Ras: ${petBreed}` : ''} {petAge ? `• Usia: ${petAge}` : ''} {petSex ? `• ${petSex}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Quick Pet Switcher on Step 1 */}
                  {existingPets.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[11px] font-bold text-emerald-950 block mb-1.5">
                        Pilih Pasien Hewan untuk Kunjungan Ini:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {existingPets.map((p) => {
                          const isSelected = selectedExistingPetId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectExistingPet(p.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                                isSelected
                                  ? 'bg-fuchsia-700 text-white shadow-xs font-bold'
                                  : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-fuchsia-50'
                              }`}
                            >
                              <span>{p.type === 'Cat' ? '🐱' : p.type === 'Dog' ? '🐶' : '🐾'}</span>
                              <span>{p.name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 ml-0.5" />}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => handleSelectExistingPet('new')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            selectedExistingPetId === 'new'
                              ? 'bg-fuchsia-700 text-white shadow-xs font-bold'
                              : 'bg-white text-neutral-600 border border-dashed border-neutral-300 hover:bg-neutral-50'
                          }`}
                        >
                          + Tambah Hewan Baru
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {/* WhatsApp Phone */}
                <div className="relative">
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                    Nomor WhatsApp / HP <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                    <input
                      type="tel"
                      value={ownerPhone}
                      onBlur={handlePhoneBlur}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onFocus={() => {
                        if (phoneSuggestions.length > 0) setShowPhoneDropdown(true);
                      }}
                      placeholder="Contoh: 081234567890"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm transition"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Nomor telepon harus berawal dengan angka 0 (contoh: 08123456789)
                  </p>

                  {/* Phone Suggestions Dropdown */}
                  {showPhoneDropdown && phoneSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-neutral-200 p-1 space-y-1">
                      <p className="px-2 py-0.5 text-[10px] font-bold text-neutral-400 uppercase">
                        Saran Nomor Terdaftar:
                      </p>
                      {phoneSuggestions.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onMouseDown={() => autoFillWithData(o)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-fuchsia-50 flex items-center justify-between cursor-pointer"
                        >
                          <span className="font-bold text-neutral-800">{formatPhoneDisplay(o.whatsapp)} — {o.name}</span>
                          <span className="text-[10px] text-fuchsia-700 font-semibold">Pilih & Isi Otomatis</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {errors.ownerPhone && (
                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.ownerPhone}
                    </p>
                  )}
                  {isExistingOwner && (
                    <p className="text-xs text-fuchsia-800 flex items-center gap-1 mt-1.5 font-medium bg-fuchsia-50 p-2 rounded-lg border border-fuchsia-100">
                      <Sparkles className="w-3.5 h-3.5 text-fuchsia-600" />
                      Nomor terdaftar! Data nama pemilik dan pasien berhasil dimuat otomatis.
                    </p>
                  )}
                </div>

                {/* Owner Name */}
                <div className="relative">
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                    Nama Lengkap Pemilik <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => handleOwnerNameChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
                      onFocus={() => {
                        if (nameSuggestions.length > 0) setShowNameDropdown(true);
                      }}
                      placeholder="Nama lengkap Anda"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm transition"
                    />
                  </div>

                  {/* Name Suggestions Dropdown */}
                  {showNameDropdown && nameSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-neutral-200 p-1 space-y-1">
                      <p className="px-2 py-0.5 text-[10px] font-bold text-neutral-400 uppercase">
                        Saran Pemilik Terdaftar:
                      </p>
                      {nameSuggestions.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onMouseDown={() => autoFillWithData(o)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-fuchsia-50 flex items-center justify-between cursor-pointer"
                        >
                          <span className="font-bold text-neutral-800">{o.name} ({formatPhoneDisplay(o.whatsapp)})</span>
                          <span className="text-[10px] text-fuchsia-700 font-semibold">Pilih & Isi Otomatis</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {errors.ownerName && (
                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.ownerName}
                    </p>
                  )}
                </div>

                {/* Owner Address */}
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                    Alamat Domisili <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                    <textarea
                      rows={2}
                      value={ownerAddress}
                      onChange={(e) => {
                        setOwnerAddress(e.target.value);
                        if (errors.ownerAddress) setErrors((prev) => ({ ...prev, ownerAddress: '' }));
                      }}
                      placeholder="Jalan, RT/RW, Kelurahan, Kota"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm resize-none transition"
                    />
                  </div>
                  {errors.ownerAddress && (
                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.ownerAddress}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Button Step 1 */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full py-3 px-4 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-sm shadow-md shadow-fuchsia-700/20 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Lanjut: Data Pasien</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: DATA PASIEN / HEWAN */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                  Identitas Hewan Peliharaan
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Pilih hewan yang sudah pernah terdaftar atau tambahkan profil pasien baru.
                </p>
              </div>

              {/* Notice if patient data auto-filled */}
              {isExistingOwner && selectedExistingPetId !== 'new' && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Data pasien <strong>{petName}</strong> telah terisi otomatis dari database klinik.
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md shrink-0">
                    Terisi Otomatis
                  </span>
                </div>
              )}

              {/* Option to pick existing pet if owner recognized */}
              {existingPets.length > 0 && (
                <div className="p-3 bg-fuchsia-50/70 rounded-2xl border border-fuchsia-100 space-y-2">
                  <span className="text-xs font-bold text-fuchsia-900 uppercase tracking-wider block">
                    Hewan Terdaftar Milik Anda:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {existingPets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectExistingPet(p.id)}
                        className={`p-2.5 rounded-xl text-left border text-xs transition cursor-pointer ${
                          selectedExistingPetId === p.id
                            ? 'bg-white border-fuchsia-500 text-fuchsia-950 shadow-xs font-bold ring-1 ring-fuchsia-500'
                            : 'bg-white/60 border-neutral-200 text-neutral-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="truncate font-bold">
                            {p.type === 'Cat' ? '🐱' : p.type === 'Dog' ? '🐶' : p.type === 'Rabbit' ? '🐰' : '🐾'} {p.name}
                          </p>
                          {selectedExistingPetId === p.id && (
                            <Check className="w-3.5 h-3.5 text-fuchsia-700" />
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 font-normal mt-0.5">
                          {p.type} • {p.breed || 'Mix'}
                        </p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleSelectExistingPet('new')}
                      className={`p-2.5 rounded-xl text-center border text-xs transition cursor-pointer ${
                        selectedExistingPetId === 'new'
                          ? 'bg-white border-fuchsia-500 text-fuchsia-950 shadow-xs font-bold ring-1 ring-fuchsia-500'
                          : 'bg-white/60 border-neutral-200 text-neutral-700 hover:bg-white'
                      }`}
                    >
                      + Tambah Hewan Baru
                    </button>
                  </div>
                </div>
              )}

              {/* Pet Photo Upload Section */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
                  Foto Hewan Peliharaan (Opsional)
                </label>
                <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-neutral-200 shadow-xs">
                  <div className="w-20 h-20 rounded-2xl bg-neutral-100 border-2 border-dashed border-neutral-300 flex items-center justify-center overflow-hidden relative group shrink-0">
                    {petPhotoUrl ? (
                      <img
                        src={petPhotoUrl}
                        alt="Preview Pet"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-neutral-400 gap-1">
                        <Camera className="w-6 h-6" />
                        <span className="text-[10px]">Belum ada</span>
                      </div>
                    )}
                    <label className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer text-xs font-semibold gap-1">
                      <Upload className="w-4 h-4" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-800 font-semibold text-xs rounded-xl border border-fuchsia-200 cursor-pointer transition inline-flex items-center gap-1.5 shadow-2xs">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Unggah Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                      
                      <button
                        type="button"
                        onClick={startCamera}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs rounded-xl border border-amber-200 cursor-pointer transition inline-flex items-center gap-1.5 shadow-2xs"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Kamera Langsung</span>
                      </button>

                      {petPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setPetPhotoUrl('')}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs rounded-xl border border-red-200 transition cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      Ambil foto dengan kamera langsung atau unggah JPG/PNG maks. 2MB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Species selector pills */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
                  Jenis Hewan <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {[
                    { type: 'Cat' as PetType, label: 'Kucing', emoji: '🐱' },
                    { type: 'Dog' as PetType, label: 'Anjing', emoji: '🐶' },
                    { type: 'Rabbit' as PetType, label: 'Kelinci', emoji: '🐰' },
                    { type: 'Exotic' as PetType, label: 'Eksotik', emoji: '🦜' },
                    { type: 'Farm Animal' as PetType, label: 'Farm Animal', emoji: '🐄' },
                  ].map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setPetType(item.type)}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1 text-xs font-semibold transition ${
                        petType === item.type
                          ? 'border-fuchsia-500 bg-fuchsia-50/80 text-fuchsia-950 shadow-xs'
                          : 'border-neutral-200 hover:bg-neutral-50 text-neutral-600'
                      }`}
                    >
                      <span className="text-2xl">{item.emoji}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Opsi Tujuan Pendaftaran: Periksa vs Hanya Daftar */}
              <div className="p-4 bg-fuchsia-50/50 rounded-2xl border border-fuchsia-200/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-800 uppercase tracking-wider">
                    Pilihan Tujuan Kunjungan <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-semibold text-fuchsia-800 bg-fuchsia-100 px-2 py-0.5 rounded-full">
                    {registrationMode === 'daftar' ? 'Mode: Daftar Saja' : 'Mode: Periksa'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRegistrationMode('periksa');
                      if (serviceType === 'Daftar') setServiceType('Consultation');
                    }}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                      registrationMode === 'periksa'
                        ? 'border-fuchsia-600 bg-white ring-2 ring-fuchsia-500/20 shadow-xs'
                        : 'border-neutral-200 bg-white/70 hover:bg-white text-neutral-600'
                    }`}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">🩺</span>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">Periksa & Ambil Antrean</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                        Untuk konsultasi dokter, pemeriksaan sakit, suntik vaksin, grooming, atau rawat inap hari ini.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRegistrationMode('daftar');
                      setServiceType('Daftar');
                    }}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                      registrationMode === 'daftar'
                        ? 'border-fuchsia-600 bg-white ring-2 ring-fuchsia-500/20 shadow-xs'
                        : 'border-neutral-200 bg-white/70 hover:bg-white text-neutral-600'
                    }`}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">📋</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-neutral-900">Daftar</p>
                        <span className="text-[10px] bg-fuchsia-100 text-fuchsia-800 font-bold px-1.5 py-0.2 rounded">
                          Tanpa Periksa
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                        Hanya sekedar mendaftar data hewan tanpa mau melakukan pemeriksaan.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Pet Name */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                  Nama Hewan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={petName}
                  onChange={(e) => {
                    setPetName(e.target.value);
                    if (errors.petName) setErrors((prev) => ({ ...prev, petName: '' }));
                  }}
                  placeholder="Contoh: Mochi / Brownie"
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm transition"
                />
                {errors.petName && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.petName}
                  </p>
                )}
              </div>

              {/* Breed & Age */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                    Ras / Breed (Opsional)
                  </label>
                  <input
                    type="text"
                    value={petBreed}
                    onChange={(e) => setPetBreed(e.target.value)}
                    placeholder="Contoh: Persian / Golden"
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                    Usia / Perkiraan Umur <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={petAge}
                    onChange={(e) => {
                      setPetAge(e.target.value);
                      if (errors.petAge) setErrors((prev) => ({ ...prev, petAge: '' }));
                    }}
                    placeholder="Contoh: 2 Tahun / 8 Bulan"
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm transition"
                  />
                  {errors.petAge && (
                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.petAge}
                    </p>
                  )}
                </div>
              </div>

              {/* Sex */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
                  Jenis Kelamin <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'Jantan', label: 'Jantan (Male)', symbol: '♂' },
                    { id: 'Betina', label: 'Betina (Female)', symbol: '♀' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPetSex(s.id as 'Jantan' | 'Betina')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        petSex === s.id
                          ? 'border-fuchsia-500 bg-fuchsia-50/80 text-fuchsia-950 shadow-xs'
                          : 'border-neutral-200 hover:bg-neutral-50 text-neutral-600'
                      }`}
                    >
                      <span className="font-bold text-sm">{s.symbol}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons Step 2 */}
              <div className="pt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-1/3 py-3 px-4 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-semibold text-sm transition"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-2/3 py-3 px-4 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-sm shadow-md shadow-fuchsia-700/20 transition flex items-center justify-center gap-2"
                >
                  <span>
                    {registrationMode === 'daftar'
                      ? 'Lanjut: Konfirmasi & Pernyataan'
                      : 'Lanjut: Layanan & Keluhan'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: LAYANAN & KELUHAN */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                  {registrationMode === 'daftar'
                    ? 'Konfirmasi Pendaftaran Pasien'
                    : 'Tujuan Kunjungan & Keluhan'}
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  {registrationMode === 'daftar'
                    ? 'Konfirmasi pendaftaran data hewan peliharaan ke basis data klinik Vier Pet Care.'
                    : 'Pilih tipe layanan dan jelaskan gejala atau kondisi hewan saat ini.'}
                </p>
              </div>

              {/* Mode: Daftar Saja */}
              {registrationMode === 'daftar' ? (
                <div className="p-4 bg-fuchsia-50/70 rounded-2xl border border-fuchsia-200 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">📋</span>
                    <div>
                      <h4 className="text-xs font-bold text-fuchsia-950 uppercase tracking-wider">
                        Pendaftaran Tanpa Pemeriksaan
                      </h4>
                      <p className="text-[11px] text-fuchsia-800 leading-snug mt-0.5">
                        Hewan Anda akan didaftarkan ke rekam medis klinik. Anda tidak perlu menunggu di ruang tunggu antrean dokter hari ini.
                      </p>
                    </div>
                  </div>

                  {/* Optional notes */}
                  <div className="pt-2 border-t border-fuchsia-200/70">
                    <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                      Catatan Tambahan / Keperluan Khusus (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      placeholder="Contoh: Hanya ingin menyimpan data vaksin sebelumnya, atau rencana kontrol bulan depan"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm resize-none transition"
                    />
                  </div>
                </div>
              ) : (
                /* Mode: Periksa (Pilih Layanan & Keluhan Utama) */
                <>
                  {/* Service Selection */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
                      Tipe Layanan Kunjungan <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        {
                          id: 'Consultation' as ServiceType,
                          title: 'Pemeriksaan & Pengobatan',
                          desc: 'Dokter hewan memeriksa gejala sakit atau cek kesehatan umum.',
                        },
                        {
                          id: 'Vaccine' as ServiceType,
                          title: 'Vaksinasi & Cacing',
                          desc: 'Vaksin tahunan, suntik scabies, atau pencegahan kutu/cacing.',
                        },
                        {
                          id: 'Grooming' as ServiceType,
                          title: 'Grooming & Medicated Spa',
                          desc: 'Mandi jamur, kutu, atau pembersihan rutin steril.',
                        },
                        {
                          id: 'Hotel' as ServiceType,
                          title: 'Rawat Inap / Pet Hotel',
                          desc: 'Penitipan hewan sehat atau observasi medis.',
                        },
                      ].map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setServiceType(item.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition ${
                            serviceType === item.id
                              ? 'border-fuchsia-500 bg-fuchsia-50/70 shadow-xs'
                              : 'border-neutral-200 hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="radio"
                              name="serviceType"
                              checked={serviceType === item.id}
                              onChange={() => setServiceType(item.id)}
                              className="w-4 h-4 text-fuchsia-700 focus:ring-fuchsia-500"
                            />
                            <span className="text-xs font-bold text-neutral-800">{item.title}</span>
                          </div>
                          <p className="text-[11px] text-neutral-500 pl-6 leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chief Complaint */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                      Keluhan Utama / Alasan Kunjungan <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={chiefComplaint}
                      onChange={(e) => {
                        setChiefComplaint(e.target.value);
                        if (errors.chiefComplaint) setErrors((prev) => ({ ...prev, chiefComplaint: '' }));
                      }}
                      placeholder="Contoh: Muntah 2 hari, nafsu makan turun, ada luka di telinga kiri"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-hidden text-sm resize-none transition"
                    />
                    {errors.chiefComplaint && (
                      <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> {errors.chiefComplaint}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Review Summary Box */}
              <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 text-xs space-y-1.5">
                <span className="font-bold text-neutral-700 uppercase tracking-wider block text-[11px] mb-1">
                  Ringkasan Kunjungan
                </span>
                <p><span className="text-neutral-400">Pemilik:</span> <strong className="text-neutral-800">{ownerName}</strong> ({formatPhoneDisplay(ownerPhone)})</p>
                <p><span className="text-neutral-400">Pasien:</span> <strong className="text-neutral-800">{petName}</strong> ({petType} - {petSex})</p>
                <p>
                  <span className="text-neutral-400">Tujuan Layanan:</span>{' '}
                  <span className="text-fuchsia-800 font-semibold">
                    {registrationMode === 'daftar' ? 'Daftar (Tanpa Pemeriksaan)' : serviceType}
                  </span>
                </p>
              </div>

              {/* Kotak Pernyataan Resiko Medis & Kaidah Kedokteran Hewan */}
              <div
                id="medical-disclaimer-box"
                className={`p-4 rounded-2xl border transition-all ${
                  errors.consent
                    ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-300/40'
                    : consentAgreed
                    ? 'bg-fuchsia-50/70 border-fuchsia-300'
                    : 'bg-amber-50/60 border-amber-200/90'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="consent-checkbox"
                    checked={consentAgreed}
                    onChange={(e) => {
                      setConsentAgreed(e.target.checked);
                      if (errors.consent) setErrors((prev) => ({ ...prev, consent: '' }));
                    }}
                    className="w-5 h-5 mt-0.5 rounded-md border-neutral-300 text-fuchsia-700 focus:ring-fuchsia-500 cursor-pointer shrink-0"
                  />
                  <label
                    htmlFor="consent-checkbox"
                    className="text-xs text-neutral-800 leading-relaxed select-none cursor-pointer"
                  >
                    <span className="font-bold text-neutral-900 block mb-1">
                      Lembar Persetujuan & Pernyataan Pendaftar <span className="text-red-500">*</span>
                    </span>
                    &ldquo;Dengan ini kami tidak akan melakukan tuntutan pidana atau perdata untuk resiko medis yang terjadi. Kami memahami dan menyetujui bahwa semua tindakan medis diberikan sesuai berbagai pertimbangan kaidah kedokteran hewan yang berlaku.&rdquo;
                  </label>
                </div>
                {errors.consent && (
                  <p className="text-xs text-rose-600 font-semibold flex items-center gap-1 mt-2 pl-8">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errors.consent}
                  </p>
                )}
              </div>

              {/* Action Buttons Step 3 */}
              <div className="pt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-1/3 py-3.5 px-4 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-semibold text-sm transition"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3.5 px-4 rounded-xl bg-gradient-to-r from-fuchsia-700 to-fuchsia-600 hover:from-fuchsia-800 hover:to-fuchsia-700 text-white font-bold text-sm shadow-lg shadow-fuchsia-700/25 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{registrationMode === 'daftar' ? 'Selesaikan & Kembali ke Awal' : 'Ambil Nomor Antrean'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Informational Security Card */}
        <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
          <ShieldCheck className="w-4 h-4 text-fuchsia-700" />
          <span>Data pasien dan pemilik terlindungi dengan standar keamanan klinik Vier Pet Care</span>
        </div>
      </div>

      {/* MODAL: LIVE CAMERA CAPTURE */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl relative text-neutral-900 border border-neutral-200">
            <button
              type="button"
              onClick={stopCamera}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-base mb-1 text-neutral-950">Ambil Foto Pasien</h3>
            <p className="text-xs text-neutral-500 mb-4">Posisikan kamera ke hewan peliharaan Anda lalu ambil gambar.</p>

            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black border border-neutral-200">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-fuchsia-600/30 rounded-xl pointer-events-none" />
            </div>

            <div className="flex gap-2.5 mt-4">
              <button
                type="button"
                onClick={stopCamera}
                className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-semibold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Ambil Foto</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
