import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Clock,
  User,
  Heart,
  Activity,
  FileText,
  Stethoscope,
  Upload,
  Plus,
  Trash2,
  FileDown,
  Eye,
  Camera,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  DollarSign,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { SoapRecord, DiagnosticAttachment, PrescriptionItem } from '../../types';
import { compressImageFile } from '../../utils/imageUtils';
import { formatPhoneDisplay } from '../../utils/phoneUtils';
import { getPracticingDoctorNames } from '../../utils/staffUtils';
import { SearchableMedicineSelect } from './SearchableMedicineSelect';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  record: SoapRecord | null;
  petName?: string;
  onSuccess?: () => void;
}

export const EditSoapRecordModal: React.FC<Props> = ({
  isOpen,
  onClose,
  record,
  petName,
  onSuccess,
}) => {
  const { updateSoapRecord, staffList, currentUser, inventory } = useClinic();
  const practicingDoctors = getPracticingDoctorNames(staffList);

  // Form states
  const [date, setDate] = useState('');
  const [veterinarian, setVeterinarian] = useState('');
  const [weight, setWeight] = useState('');
  const [temperature, setTemperature] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');

  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);

  // Diagnosa Penunjang (Supportive Diagnostics)
  const [diagnosticAttachments, setDiagnosticAttachments] = useState<DiagnosticAttachment[]>([]);
  const [diagnosticCategory, setDiagnosticCategory] = useState<DiagnosticAttachment['category']>('Rontgen / X-Ray');
  const [diagnosticNotes, setDiagnosticNotes] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<DiagnosticAttachment | null>(null);
  const [serviceFee, setServiceFee] = useState<string>('0');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Populate data when record or modal state changes
  useEffect(() => {
    if (record && isOpen) {
      setDate(record.date || new Date().toISOString());
      setVeterinarian(record.veterinarian || currentUser?.name || practicingDoctors[0] || 'Dokter Hewan');
      setWeight(record.vitals?.weight ? String(record.vitals.weight) : '');
      setTemperature(record.vitals?.temperature ? String(record.vitals.temperature) : '');
      setHeartRate(record.vitals?.heartRate ? String(record.vitals.heartRate) : '');
      setRespiratoryRate(record.vitals?.respiratoryRate ? String(record.vitals.respiratoryRate) : '');

      setSubjective(record.soap?.subjective || '');
      setObjective(record.soap?.objective || '');
      setAssessment(record.soap?.assessment || '');
      setPlan(record.soap?.plan || '');

      setPrescriptions(record.prescriptions || []);

      setDiagnosticAttachments(record.diagnosticAttachments || []);
      setDiagnosticNotes(record.diagnosticNotes || '');
      setServiceFee(record.serviceFee !== undefined && record.serviceFee !== null ? String(record.serviceFee) : '0');
      setSaveSuccess(false);
    }
  }, [record?.id, isOpen]);

  if (!isOpen || !record) return null;

  // Process uploaded diagnostic files (Images/PDFs)
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
          dataUrl = await compressImageFile(file, { maxWidth: 900, maxHeight: 900, quality: 0.8 });
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
        id: `diag-edit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        type: isImage ? 'image' : 'file',
        fileType: file.type || 'application/octet-stream',
        dataUrl,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        category: diagnosticCategory,
        uploadedAt: new Date().toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
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
    if (!defaultMed) {
      alert('Stok obat belum tersedia di inventaris.');
      return;
    }
    const newPresc: PrescriptionItem = {
      inventoryItemId: defaultMed.id,
      itemName: defaultMed.name,
      quantity: 1,
      unit: defaultMed.unit || 'Tablet',
      dosage: '2x sehari 1 tablet sesudah makan',
    };
    setPrescriptions((prev) => [...prev, newPresc]);
  };

  const handleUpdatePrescription = (index: number, field: keyof PrescriptionItem, val: any) => {
    setPrescriptions((prev) => {
      const copy = [...prev];
      if (field === 'inventoryItemId') {
        const found = inventory.find((i) => i.id === val);
        if (found) {
          copy[index] = {
            ...copy[index],
            inventoryItemId: found.id,
            itemName: found.name,
            unit: found.unit || 'Tablet',
          };
        }
      } else {
        copy[index] = { ...copy[index], [field]: val };
      }
      return copy;
    });
  };

  const handleRemovePrescription = (index: number) => {
    setPrescriptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const updatedData: Partial<SoapRecord> = {
        veterinarian: veterinarian.trim() || record.veterinarian,
        date,
        vitals: {
          weight: parseFloat(weight) || 0,
          temperature: parseFloat(temperature) || 0,
          heartRate: parseInt(heartRate, 10) || 0,
          respiratoryRate: parseInt(respiratoryRate, 10) || 0,
        },
        soap: {
          subjective: subjective.trim(),
          objective: objective.trim(),
          assessment: assessment.trim() || record.soap?.assessment || 'Pemeriksaan Klinis',
          plan: plan.trim(),
        },
        serviceFee: parseFloat(serviceFee) || 0,
        prescriptions,
        diagnosticAttachments,
        diagnosticNotes: diagnosticNotes.trim(),
      };

      updateSoapRecord(record.id, updatedData);
      setSaveSuccess(true);

      setTimeout(() => {
        setIsSaving(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 500);
    } catch (err) {
      console.error('Error updating soap record:', err);
      alert('Gagal menyimpan perubahan rekam medis.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto text-neutral-900">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-700 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-fuchsia-700/20">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-neutral-900">
                  Edit Riwayat Rekam Medis (SOAP)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800">
                  {record.id}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Pasien: <strong className="text-neutral-800">{petName || record.petName}</strong> • Pemilik: {record.ownerName || '-'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Header Info: Date & Veterinarian */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-fuchsia-50/40 p-4 rounded-2xl border border-fuchsia-100">
            <div>
              <label className="text-xs font-semibold text-neutral-700 block mb-1">
                Waktu &amp; Tanggal Pemeriksaan
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-neutral-300 text-xs text-neutral-800 font-mono font-medium focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 block mb-1">
                Dokter Pemeriksa (Veterinarian)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <select
                  value={veterinarian}
                  onChange={(e) => setVeterinarian(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-neutral-300 text-xs text-neutral-900 font-semibold focus:ring-2 focus:ring-fuchsia-500 cursor-pointer"
                >
                  {practicingDoctors.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                  {veterinarian && !practicingDoctors.includes(veterinarian) && (
                    <option value={veterinarian}>{veterinarian}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Vitals Section */}
          <div className="bg-white rounded-2xl p-4 border border-neutral-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-3 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span>Tanda-Tanda Vital Pasien (Vitals)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Berat Badan
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    placeholder=""
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1 text-neutral-900 font-mono text-xs font-bold focus:ring-1 focus:ring-fuchsia-500"
                  />
                  <span className="text-xs font-mono font-bold text-neutral-500">kg</span>
                </div>
              </div>

              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Suhu Rektal
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    placeholder=""
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1 text-neutral-900 font-mono text-xs font-bold focus:ring-1 focus:ring-fuchsia-500"
                  />
                  <span className="text-xs font-mono font-bold text-neutral-500">°C</span>
                </div>
              </div>

              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Heart Rate (HR)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder=""
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1 text-neutral-900 font-mono text-xs font-bold focus:ring-1 focus:ring-fuchsia-500"
                  />
                  <span className="text-xs font-mono font-bold text-neutral-500">bpm</span>
                </div>
              </div>

              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Resp. Rate (RR)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder=""
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1 text-neutral-900 font-mono text-xs font-bold focus:ring-1 focus:ring-fuchsia-500"
                  />
                  <span className="text-xs font-mono font-bold text-neutral-500">rpm</span>
                </div>
              </div>
            </div>
          </div>

          {/* S-O-A-P STRUCTURED EDITING */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* S */}
            <div className="bg-neutral-50/60 rounded-2xl p-4 border border-neutral-200 flex flex-col">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-md bg-fuchsia-700 text-white font-black flex items-center justify-center text-xs">
                  S
                </span>
                <span>Subjective (Keluhan / Anamnesa)</span>
              </label>
              <textarea
                rows={3}
                value={subjective}
                onChange={(e) => setSubjective(e.target.value)}
                placeholder="Contoh: Anamnesa dari pemilik hewan, riwayat keluhan, durasi sakit..."
                className="w-full flex-1 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-fuchsia-500 resize-none leading-relaxed"
              />
            </div>

            {/* O */}
            <div className="bg-neutral-50/60 rounded-2xl p-4 border border-neutral-200 flex flex-col">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-md bg-sky-600 text-white font-black flex items-center justify-center text-xs">
                  O
                </span>
                <span>Objective (Pemeriksaan Fisik Klinis)</span>
              </label>
              <textarea
                rows={3}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Contoh: Inspeksi, palpasi abdomen, auskultasi jantung/paru..."
                className="w-full flex-1 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-sky-500 resize-none leading-relaxed"
              />
            </div>

            {/* A */}
            <div className="bg-neutral-50/60 rounded-2xl p-4 border border-neutral-200 flex flex-col">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-md bg-amber-600 text-white font-black flex items-center justify-center text-xs">
                  A
                </span>
                <span>Assessment (Diagnosa &amp; Prognosis)</span>
              </label>
              <textarea
                rows={3}
                required
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                placeholder="Contoh: Diagnosa primer, stadium, diagnosa banding, prognosis..."
                className="w-full flex-1 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-amber-500 resize-none font-medium leading-relaxed"
              />
            </div>

            {/* P */}
            <div className="bg-neutral-50/60 rounded-2xl p-4 border border-neutral-200 flex flex-col">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-md bg-emerald-600 text-white font-black flex items-center justify-center text-xs">
                  P
                </span>
                <span>Plan (Rencana Tindakan Medis &amp; Terapi)</span>
              </label>
              <textarea
                rows={3}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Contoh: Rencana terapi cairan, injeksi obat, kontrol ulang..."
                className="w-full flex-1 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-emerald-500 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* DIAGNOSA PENUNJANG SUSULAN (X-Ray, USG, Lab, Darah, dll) */}
          <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200/90 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-bold shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-neutral-900 flex items-center gap-2">
                    <span>Diagnosa Penunjang (Rontgen, USG, Lab Darah, Mikroskopik)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                      Bisa Disusulkan
                    </span>
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Hasil laboratorium, foto X-Ray rontgen, atau USG dapat diunggah susulan kapan saja ke rekam medis ini.
                  </p>
                </div>
              </div>

              {/* Category Selector */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Kategori Berkas:</span>
                <select
                  value={diagnosticCategory}
                  onChange={(e) => setDiagnosticCategory(e.target.value as any)}
                  className="bg-white border border-neutral-300 text-neutral-800 text-xs font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-fuchsia-500 cursor-pointer shadow-2xs"
                >
                  <option value="Rontgen / X-Ray">🩻 Rontgen / X-Ray</option>
                  <option value="USG">📡 Ultrasonografi (USG)</option>
                  <option value="Hematologi / Lab">🔬 Hematologi / Lab Darah</option>
                  <option value="Sitologi / Mikroskopik">🧪 Sitologi / Mikroskopik</option>
                  <option value="Rapid Test">🩸 Rapid Test Kit</option>
                  <option value="Lainnya">📋 Hasil Lainnya</option>
                </select>
              </div>
            </div>

            {/* Drop Zone Area for Uploading Attachments */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleFileDrop}
              className={`p-4 border-2 border-dashed rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 transition text-center sm:text-left ${
                isDraggingFile
                  ? 'border-fuchsia-500 bg-fuchsia-50/70 scale-[0.99]'
                  : 'border-neutral-300 bg-white hover:border-neutral-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5 text-fuchsia-700" />
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-800">
                    Unggah Berkas / Foto Diagnosa Penunjang Baru
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Format didukung: JPG, PNG, WEBP, PDF (Maks. 15MB) • Kompresi otomatis
                  </p>
                </div>
              </div>

              <div>
                <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold text-xs shadow-xs cursor-pointer transition">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Pilih Berkas / Foto</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* List of Attachments */}
            {diagnosticAttachments.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-neutral-700 block mb-2">
                  Berkas Terlampir ({diagnosticAttachments.length}):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {diagnosticAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-2.5 bg-white border border-neutral-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {att.type === 'image' ? (
                          <img
                            src={att.dataUrl}
                            alt={att.name}
                            onClick={() => setPreviewModalImage(att)}
                            className="w-10 h-10 rounded-lg object-cover border border-neutral-200 cursor-pointer shrink-0 hover:opacity-80 transition"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-xs font-bold text-neutral-600 shrink-0">
                            📄
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-fuchsia-100 text-fuchsia-800 block w-fit mb-0.5">
                            {att.category}
                          </span>
                          <p className="text-xs font-semibold text-neutral-800 truncate" title={att.name}>
                            {att.name}
                          </p>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {att.size} • {att.uploadedAt}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {att.type === 'image' && (
                          <button
                            type="button"
                            onClick={() => setPreviewModalImage(att)}
                            className="p-1 rounded-lg text-neutral-400 hover:text-fuchsia-700 hover:bg-neutral-100"
                            title="Pratinjau"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Catatan Interpretasi Diagnosa Penunjang */}
            <div>
              <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
                Catatan Interpretasi Hasil Diagnosa Penunjang (Opsional)
              </label>
              <textarea
                rows={2}
                value={diagnosticNotes}
                onChange={(e) => setDiagnosticNotes(e.target.value)}
                placeholder="Contoh: Tampak pembesaran vesica urinaria pada USG, atau fraktur os femur dekstra pada X-Ray..."
                className="w-full p-2.5 bg-white border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:ring-2 focus:ring-fuchsia-500 resize-none"
              />
            </div>
          </div>

          {/* RESEP OBAT (PRESCRIPTIONS) */}
          <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-fuchsia-700" />
                <span>Resep Obat &amp; Terapi Farmasi</span>
              </h4>
              <button
                type="button"
                onClick={handleAddPrescription}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-fuchsia-700 hover:bg-fuchsia-800 px-3.5 py-1.5 rounded-xl shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambah Obat</span>
              </button>
            </div>

            {prescriptions.length === 0 ? (
              <p className="text-xs text-neutral-400 italic bg-white p-3 rounded-xl border border-neutral-200/60 text-center">
                Belum ada resep obat pada rekam medis ini. Tekan "+ Tambah Obat" jika ada obat yang diresepkan.
              </p>
            ) : (
              <div className="space-y-2">
                {prescriptions.map((presc, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-xl border border-neutral-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                  >
                    <div className="sm:col-span-5">
                      <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Nama Obat / BHP Medis</label>
                      <SearchableMedicineSelect
                        value={presc.inventoryItemId}
                        onChange={(newId) => handleUpdatePrescription(idx, 'inventoryItemId', newId)}
                        inventory={inventory}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Jumlah</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          value={presc.quantity}
                          onChange={(e) => handleUpdatePrescription(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                          className="w-full p-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono font-bold text-neutral-900"
                        />
                        <span className="text-[11px] text-neutral-500 font-medium shrink-0">{presc.unit}</span>
                      </div>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Signa / Aturan Pakai</label>
                      <input
                        type="text"
                        value={presc.dosage}
                        onChange={(e) => handleUpdatePrescription(idx, 'dosage', e.target.value)}
                        placeholder="Contoh: 2x sehari 1 tablet sesudah makan"
                        className="w-full p-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-900"
                      />
                    </div>

                    <div className="sm:col-span-1 text-right sm:pt-4">
                      <button
                        type="button"
                        onClick={() => handleRemovePrescription(idx)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Hapus Resep"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel Biaya Jasa Medis & Tarif Tindakan (Service Fee) */}
          <div className="bg-gradient-to-r from-fuchsia-50/70 via-purple-50/40 to-emerald-50/40 rounded-2xl p-4 border border-fuchsia-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-fuchsia-700" />
                  <span>Biaya Jasa Medis &amp; Tarif Tindakan (Service Fee)</span>
                </label>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Nilai diisi manual oleh dokter (sudah termasuk obat dan seluruh tindakan).
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-60">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500 font-mono">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                  placeholder="50000"
                  className="w-full bg-white border border-neutral-300 rounded-xl pl-9 pr-3 py-2 text-xs font-mono font-bold text-neutral-900 focus:ring-2 focus:ring-fuchsia-500 shadow-2xs"
                />
              </div>

              <div className="flex flex-wrap gap-1 w-full">
                {[
                  { label: 'Rp 0', value: '0' },
                  { label: 'Rp 35rb', value: '35000' },
                  { label: 'Rp 50rb', value: '50000' },
                  { label: 'Rp 75rb', value: '75000' },
                  { label: 'Rp 100rb', value: '100000' },
                  { label: 'Rp 150rb', value: '150000' },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setServiceFee(preset.value)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                      serviceFee === preset.value
                        ? 'bg-fuchsia-700 text-white border-fuchsia-700'
                        : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold text-xs shadow-md shadow-fuchsia-700/20 transition transform active:scale-98 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Menyimpan Perubahan...' : 'Simpan Perubahan Rekam Medis'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Modal Preview Gambar Lampiran */}
      {previewModalImage && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative border border-neutral-100">
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-md bg-fuchsia-100 text-fuchsia-800">
                  {previewModalImage.category}
                </span>
                <h4 className="text-xs font-bold text-neutral-900 truncate max-w-md">
                  {previewModalImage.name}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950">
              <img
                src={previewModalImage.dataUrl}
                alt={previewModalImage.name}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md"
              />
            </div>
            <div className="p-3 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
              <span>{previewModalImage.size} • {previewModalImage.uploadedAt}</span>
              <a
                href={previewModalImage.dataUrl}
                download={previewModalImage.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-700 hover:bg-fuchsia-800 text-white rounded-xl font-bold"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Unduh Gambar</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
