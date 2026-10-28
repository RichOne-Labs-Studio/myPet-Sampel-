import React, { useState } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Activity,
  Pill,
  Microscope,
  FileText,
  ExternalLink,
  Copy,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Printer,
  Heart,
  Droplet,
} from 'lucide-react';
import { VeterinaryCdssResponse } from '../../server/veterinaryAiService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  analysis: VeterinaryCdssResponse | null;
  onApplyAssessment: (text: string) => void;
  onApplyPlan: (text: string) => void;
  onApplyBoth: (assessmentText: string, planText: string) => void;
  onReanalyze: () => void;
  petName?: string;
  petType?: string;
}

export const VeterinaryCdssDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  isLoading,
  analysis,
  onApplyAssessment,
  onApplyPlan,
  onApplyBoth,
  onReanalyze,
  petName = 'Pasien',
  petType = 'Hewan',
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [showFullViewModal, setShowFullViewModal] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleOpenFullTab = () => {
    setShowFullViewModal(true);
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Floating Side Panel Drawer */}
      <aside
        id="veterinary-cdss-drawer"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[540px] md:w-[600px] bg-white shadow-2xl flex flex-col justify-between border-l border-neutral-200 transform transition-transform duration-300 ease-in-out font-sans animate-in slide-in-from-right-5"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-fuchsia-900 via-fuchsia-800 to-indigo-900 text-white flex items-center justify-between border-b border-fuchsia-700/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md text-amber-300 flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black tracking-tight flex items-center gap-1.5">
                  myPet Veterinary CDSS
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-fuchsia-500/40 text-amber-200 px-2 py-0.5 rounded-full border border-fuchsia-400/40">
                  AI Co-Pilot
                </span>
              </div>
              <p className="text-[11px] text-fuchsia-200">
                Clinical Decision Support System • Pasien: <strong className="text-white">{petName}</strong> ({petType})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleOpenFullTab}
              className="p-1.5 text-fuchsia-200 hover:text-white hover:bg-white/10 rounded-lg transition"
              title="Buka Layar Penuh"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-fuchsia-200 hover:text-white hover:bg-white/10 rounded-lg transition"
              title="Tutup Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-neutral-50/70">
          {/* Loading State */}
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-fuchsia-100 flex items-center justify-center text-fuchsia-700 animate-bounce">
                  <Stethoscope className="w-8 h-8" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center text-amber-950 animate-spin">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Menganalisis S & O Pasien...</h4>
                <p className="text-xs text-neutral-500 max-w-xs mt-1 leading-relaxed">
                  Menghitung kalkulasi dosis obat per kg, menyusun diagnosis banding, dan memeriksa riwayat kontraindikasi spesies.
                </p>
              </div>
            </div>
          )}

          {/* Results State */}
          {!isLoading && analysis && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Quick 1-Click Action Bar */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-fuchsia-50 to-indigo-50 border border-fuchsia-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-fuchsia-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-700" />
                    Terapkan Rekomendasi Klinis ke Form SOAP
                  </span>
                  <button
                    type="button"
                    onClick={onReanalyze}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-800 hover:text-fuchsia-950 hover:underline"
                    title="Analisis Ulang"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Analisis Ulang S-O
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onApplyAssessment(analysis.assessmentSuggestionText);
                      handleCopy(analysis.assessmentSuggestionText, 'assessment');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs border border-amber-300 shadow-2xs transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                    <span>Terapkan ke (A) Diagnosa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyPlan(analysis.planSuggestionText);
                      handleCopy(analysis.planSuggestionText, 'plan');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-900 font-bold text-xs border border-emerald-300 shadow-2xs transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Terapkan ke (P) Terapi</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onApplyBoth(analysis.assessmentSuggestionText, analysis.planSuggestionText);
                    handleCopy('all', 'both');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold text-xs shadow-md shadow-fuchsia-700/20 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{copiedSection === 'both' ? '✓ Berhasil Diterapkan ke (A & P)!' : 'Terapkan Sekaligus ke Diagnosa & Terapi (A & P)'}</span>
                </button>
              </div>

              {/* Red Flags / Critical Warnings (if any) */}
              {analysis.redFlags && analysis.redFlags.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Peringatan Khusus &amp; Kontraindikasi Spesies</span>
                  </div>
                  <ul className="text-xs space-y-1 text-rose-900 font-medium pl-1">
                    {analysis.redFlags.map((flag, idx) => (
                      <li key={idx} className="leading-snug">{flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Patient Brief & Synthesis Summary */}
              <div className="p-4 rounded-2xl bg-white border border-neutral-200/90 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                    Sintesis Klinis Kasus
                  </span>
                  <span className="text-[10px] font-mono text-fuchsia-700 font-semibold bg-fuchsia-50 px-2 py-0.5 rounded-md border border-fuchsia-200">
                    {analysis.patientProfileBrief || `${petType} • ${petName}`}
                  </span>
                </div>
                <p className="text-xs text-neutral-800 leading-relaxed font-medium">
                  {analysis.summary}
                </p>
              </div>

              {/* 1. Differential Diagnoses */}
              <div className="bg-white rounded-2xl p-4 border border-neutral-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-black">
                      A
                    </div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                      Diagnosis Banding (Differential Diagnoses)
                    </h4>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {analysis.differentialDiagnoses.length} Indikasi
                  </span>
                </div>

                <div className="space-y-2.5">
                  {analysis.differentialDiagnoses.map((ddx, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border transition ${
                        idx === 0
                          ? 'bg-amber-50/70 border-amber-200/80 shadow-2xs'
                          : 'bg-neutral-50 border-neutral-200/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center text-[10px] font-mono shrink-0">
                            {idx + 1}
                          </span>
                          <span>{ddx.condition}</span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono shrink-0 ${
                            ddx.probability.includes('Tinggi')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : ddx.probability.includes('Sedang')
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-neutral-200 text-neutral-700'
                          }`}
                        >
                          {ddx.probability}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-600 mt-1 pl-5.5 leading-relaxed">
                        {ddx.reasoning}
                      </p>
                      {ddx.pathophysiology && (
                        <p className="text-[10px] text-neutral-400 mt-0.5 pl-5.5 italic">
                          Patofisiologi: {ddx.pathophysiology}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Suggested Diagnostics */}
              {analysis.suggestedDiagnostics && analysis.suggestedDiagnostics.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-neutral-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                    <Microscope className="w-4 h-4 text-sky-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                      Pemeriksaan Penunjang yang Disarankan
                    </h4>
                  </div>
                  <ul className="space-y-1.5 text-xs text-neutral-700 pl-1">
                    {analysis.suggestedDiagnostics.map((diag, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-sky-600 font-bold shrink-0">▸</span>
                        <span className="leading-snug">{diag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 3. Suggested Therapy & Plan */}
              <div className="bg-white rounded-2xl p-4 border border-neutral-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-black">
                      P
                    </div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                      Rencana Terapi &amp; Kalkulasi Dosis Obat
                    </h4>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Per BB Pasien
                  </span>
                </div>

                {/* Fluid Therapy */}
                {analysis.suggestedTherapyPlan?.fluidTherapy && (
                  <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-200/80 flex items-start gap-2 text-xs">
                    <Droplet className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sky-950">Terapi Cairan (Fluid Therapy)</p>
                      <p className="text-[11px] text-sky-900 mt-0.5">{analysis.suggestedTherapyPlan.fluidTherapy}</p>
                    </div>
                  </div>
                )}

                {/* Medications List */}
                {analysis.suggestedTherapyPlan?.medications && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                      Pilihan Medikasi &amp; Dosis:
                    </p>
                    {analysis.suggestedTherapyPlan.medications.map((med, idx) => (
                      <div key={idx} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-900">
                            💊 {med.name}
                          </span>
                          <span className="text-[10px] bg-neutral-200/80 text-neutral-700 px-2 py-0.5 rounded-md font-mono font-semibold">
                            {med.drugClass}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-fuchsia-900 font-bold font-mono">
                          <span>Dosis: {med.dosage}</span>
                          <span>•</span>
                          <span>{med.routeAndFrequency}</span>
                        </div>
                        {med.notes && (
                          <p className="text-[10px] text-neutral-500 italic">
                            Catatan: {med.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Dietary & Supportive */}
                {analysis.suggestedTherapyPlan?.dietaryAndSupportive && (
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-700">
                    <span className="font-bold text-neutral-900 block mb-0.5">🥗 Edukasi Nutrisi / Pakan:</span>
                    <p className="text-[11px] leading-relaxed">{analysis.suggestedTherapyPlan.dietaryAndSupportive}</p>
                  </div>
                )}
              </div>

              {/* Medical Ethics & Disclaimer Box */}
              <div className="p-3 rounded-xl bg-neutral-100 border border-neutral-200 text-[10px] text-neutral-500 leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                <p>{analysis.disclaimer}</p>
              </div>
            </div>
          )}

          {/* Empty / Error State */}
          {!isLoading && !analysis && (
            <div className="py-16 text-center space-y-3">
              <Stethoscope className="w-10 h-10 text-neutral-300 mx-auto" />
              <p className="text-xs text-neutral-500">
                Belum ada data analisis klinis. Masukkan data Subjective & Objective lalu klik tombol analisis.
              </p>
              <button
                type="button"
                onClick={onReanalyze}
                className="px-4 py-2 bg-fuchsia-700 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-fuchsia-800 transition cursor-pointer"
              >
                Mulai Analisis Klinis AI
              </button>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-white border-t border-neutral-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-100 transition cursor-pointer"
          >
            Tutup Panel
          </button>

          {analysis && (
            <button
              type="button"
              onClick={handleOpenFullTab}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold transition border border-neutral-300 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-neutral-600" />
              <span>Buka Tampilan Penuh / Tab Terpisah</span>
            </button>
          )}
        </div>
      </aside>

      {/* FULLSCREEN POPUP / EXPANDED VIEW MODAL */}
      {showFullViewModal && analysis && (
        <div className="fixed inset-0 z-60 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-fuchsia-900 to-indigo-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-amber-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight">
                    Laporan Analisis Klinis Veteriner (CDSS Full Report)
                  </h3>
                  <p className="text-xs text-fuchsia-200">
                    Pasien: {petName} ({petType}) • {analysis.patientProfileBrief}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullViewModal(false)}
                  className="p-1.5 text-fuchsia-200 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-neutral-800 text-xs">
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1">
                <p className="text-[11px] font-bold text-neutral-500 uppercase">Ringkasan Sintesis Medis</p>
                <p className="text-sm font-semibold text-neutral-900">{analysis.summary}</p>
              </div>

              {/* 2-Columns Grid in Full View */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Differential Diagnoses */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-amber-600 text-white flex items-center justify-center text-[10px]">A</span>
                    <span>Daftar Diagnosis Banding</span>
                  </h4>
                  <div className="space-y-2">
                    {analysis.differentialDiagnoses.map((ddx, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-xl border border-neutral-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-900">{idx + 1}. {ddx.condition}</span>
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                            {ddx.probability}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-600">{ddx.reasoning}</p>
                        {ddx.pathophysiology && (
                          <p className="text-[10px] text-neutral-400 italic">Etiologi: {ddx.pathophysiology}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Suggested Diagnostics */}
                  <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 space-y-2 mt-4">
                    <h5 className="font-bold text-sky-950 flex items-center gap-1.5">
                      <Microscope className="w-4 h-4 text-sky-700" />
                      <span>Rencana Diagnostik Penunjang:</span>
                    </h5>
                    <ul className="space-y-1 pl-1 text-[11px] text-sky-900">
                      {analysis.suggestedDiagnostics.map((d, i) => (
                        <li key={i}>• {d}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Right: Therapy & Medications */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center text-[10px]">P</span>
                    <span>Rencana Terapi &amp; Kalkulasi Medikasi</span>
                  </h4>

                  {analysis.suggestedTherapyPlan?.fluidTherapy && (
                    <div className="p-3 bg-sky-50 rounded-xl border border-sky-200 text-sky-950 font-medium">
                      💧 {analysis.suggestedTherapyPlan.fluidTherapy}
                    </div>
                  )}

                  <div className="space-y-2">
                    {analysis.suggestedTherapyPlan?.medications.map((m, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-xl border border-neutral-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-900">💊 {m.name}</span>
                          <span className="text-[10px] font-mono text-neutral-500">{m.drugClass}</span>
                        </div>
                        <p className="text-[11px] font-mono font-bold text-fuchsia-800">
                          {m.dosage} ({m.routeAndFrequency})
                        </p>
                        {m.notes && <p className="text-[10px] text-neutral-500">{m.notes}</p>}
                      </div>
                    ))}
                  </div>

                  {analysis.suggestedTherapyPlan?.dietaryAndSupportive && (
                    <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-700 text-[11px]">
                      <strong>🥗 Nutrisi &amp; Perawatan:</strong> {analysis.suggestedTherapyPlan.dietaryAndSupportive}
                    </div>
                  )}
                </div>
              </div>

              {/* Ready-to-copy boxes */}
              <div className="pt-4 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-neutral-700 text-[11px]">Teks Siap Salin ke (A) Diagnosa:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(analysis.assessmentSuggestionText, 'modal-a')}
                      className="text-[10px] font-bold text-fuchsia-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedSection === 'modal-a' ? 'Disalin!' : 'Salin'}
                    </button>
                  </div>
                  <p className="text-[11px] font-mono text-neutral-800 bg-white p-2 rounded-lg border border-neutral-200 whitespace-pre-wrap">
                    {analysis.assessmentSuggestionText}
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-neutral-700 text-[11px]">Teks Siap Salin ke (P) Terapi:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(analysis.planSuggestionText, 'modal-p')}
                      className="text-[10px] font-bold text-fuchsia-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedSection === 'modal-p' ? 'Disalin!' : 'Salin'}
                    </button>
                  </div>
                  <p className="text-[11px] font-mono text-neutral-800 bg-white p-2 rounded-lg border border-neutral-200 whitespace-pre-wrap">
                    {analysis.planSuggestionText}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowFullViewModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-200 transition"
              >
                Tutup Jendela Penuh
              </button>

              <button
                type="button"
                onClick={() => {
                  onApplyBoth(analysis.assessmentSuggestionText, analysis.planSuggestionText);
                  setShowFullViewModal(false);
                  onClose();
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold shadow-md shadow-fuchsia-700/20 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Terapkan ke SOAP Form &amp; Kembali</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
