import React, { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Stethoscope,
  Pill,
  Droplet,
  Eye,
  EyeOff,
} from 'lucide-react';
import { VeterinaryCdssResponse } from '../../server/veterinaryAiService';

interface AICopilotPanelProps {
  subjective: string;
  objective: string;
  patientInfo?: {
    petName?: string;
    petType?: string;
    breed?: string;
    age?: string;
    weight?: string;
    temperature?: string;
    heartRate?: string;
    respiratoryRate?: string;
    sex?: string;
  };
  analysis: VeterinaryCdssResponse | null;
  isLoading: boolean;
  onRunAnalysis: () => void;
  onApplyAssessment: (text: string) => void;
  onApplyPlan?: (text: string) => void;
  onOpenSidePanel: () => void;
}

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  subjective,
  objective,
  patientInfo,
  analysis,
  isLoading,
  onRunAnalysis,
  onApplyAssessment,
  onApplyPlan,
  onOpenSidePanel,
}) => {
  // Toggle show/hide state
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [copiedSection, setCopiedSection] = useState<'assessment' | 'plan' | 'both' | null>(null);

  const handleCopyAssessment = () => {
    if (!analysis) return;
    onApplyAssessment(analysis.assessmentSuggestionText);
    navigator.clipboard.writeText(analysis.assessmentSuggestionText);
    setCopiedSection('assessment');
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const handleCopyPlan = () => {
    if (!analysis || !onApplyPlan) return;
    onApplyPlan(analysis.planSuggestionText);
    navigator.clipboard.writeText(analysis.planSuggestionText);
    setCopiedSection('plan');
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const petLabel = patientInfo?.petName
    ? `${patientInfo.petName} (${patientInfo.petType || 'Pasien'})`
    : 'Pasien Terpilih';

  return (
    <div
      id="ai-copilot-panel"
      className="bg-white rounded-2xl border-2 border-fuchsia-200/90 shadow-sm overflow-hidden transition-all duration-300"
    >
      {/* Top Header Bar with Toggle & Action Buttons */}
      <div className="bg-gradient-to-r from-fuchsia-900 via-fuchsia-800 to-indigo-900 px-4 sm:px-5 py-3.5 text-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-md text-amber-300 flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                AI Co-Pilot Dokter Hewan (CDSS)
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-fuchsia-500/40 text-amber-200 px-2 py-0.5 rounded-full border border-fuchsia-400/30">
                Gemini Medical
              </span>
            </div>
            <p className="text-[11px] text-fuchsia-200 truncate">
              {petLabel} • Asisten diagnosis banding &amp; kalkulasi dosis obat
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Button to Open in Side Panel Drawer */}
          <button
            type="button"
            onClick={onOpenSidePanel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition border border-white/15 cursor-pointer"
            title="Buka Analisis Lengkap di Panel Samping (Side Drawer)"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Buka di Panel Samping</span>
          </button>

          {/* Toggle Show / Hide Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title={isExpanded ? 'Sembunyikan Panel AI' : 'Tampilkan Panel AI'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-fuchsia-200" />
            ) : (
              <ChevronDown className="w-4 h-4 text-fuchsia-200" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Panel Body */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4 bg-neutral-50/50 animate-in fade-in duration-200">
          {/* Run / Re-run Trigger Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-fuchsia-50/70 border border-fuchsia-200/80 rounded-xl">
            <div className="text-xs text-fuchsia-950">
              <span className="font-bold">Status Data: </span>
              {subjective.trim() || objective.trim() ? (
                <span className="text-emerald-700 font-semibold">
                  ✓ S &amp; O terisi ({patientInfo?.weight ? `${patientInfo.weight} kg` : 'tanpa BB'})
                </span>
              ) : (
                <span className="text-amber-700">
                  Ketik keluhan (S) &amp; fisik (O) di form bawah untuk hasil presisi.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRunAnalysis}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold text-xs shadow-xs transition transform active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>{analysis ? 'Analisis Ulang S & O' : 'Minta Analisis AI Sekarang'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Loading Animation */}
          {isLoading && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center animate-bounce">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-800">
                  AI sedang menganalisis data klinis &amp; menghitung dosis...
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Memeriksa diagnosis banding, kontraindikasi spesies, dan literatur veteriner.
                </p>
              </div>
            </div>
          )}

          {/* Analysis Result Preview */}
          {!isLoading && analysis && (
            <div className="space-y-4">
              {/* Red Flags / Warnings */}
              {analysis.redFlags && analysis.redFlags.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Peringatan Khusus Spesies (Red Flags):</span>
                  </div>
                  <ul className="pl-5 list-disc space-y-0.5 text-[11px] text-rose-900 font-medium">
                    {analysis.redFlags.map((flag, i) => (
                      <li key={i}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 2-Columns Quick View */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Differential Diagnoses */}
                <div className="p-3.5 bg-white rounded-xl border border-neutral-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 font-black text-[11px] flex items-center justify-center">
                        A
                      </span>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                        Diagnosis Banding (DDx)
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyAssessment}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md border border-amber-200 transition cursor-pointer"
                      title="Salin langsung ke isian Assessment (A)"
                    >
                      {copiedSection === 'assessment' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Tersalin ke (A)!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin ke (A)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {analysis.differentialDiagnoses.slice(0, 3).map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border text-xs ${
                          idx === 0 ? 'bg-amber-50/60 border-amber-200' : 'bg-neutral-50 border-neutral-200/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-bold text-neutral-900 leading-snug">
                            {idx + 1}. {item.condition}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 shrink-0 font-mono">
                            {item.probability}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                          {item.reasoning}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Treatment & Dosage Recommendations */}
                <div className="p-3.5 bg-white rounded-xl border border-neutral-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 font-black text-[11px] flex items-center justify-center">
                        P
                      </span>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                        Rencana Terapi &amp; Dosis
                      </h4>
                    </div>

                    {onApplyPlan && (
                      <button
                        type="button"
                        onClick={handleCopyPlan}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md border border-emerald-200 transition cursor-pointer"
                        title="Salin langsung ke isian Plan (P)"
                      >
                        {copiedSection === 'plan' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Tersalin ke (P)!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Salin ke (P)</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* Fluid Therapy hint */}
                    {analysis.suggestedTherapyPlan?.fluidTherapy && (
                      <div className="p-2 bg-sky-50 rounded-lg border border-sky-200 text-[11px] text-sky-950 flex items-start gap-1.5">
                        <Droplet className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                        <span className="font-medium leading-relaxed">
                          {analysis.suggestedTherapyPlan.fluidTherapy}
                        </span>
                      </div>
                    )}

                    {/* Top 2-3 medications */}
                    {analysis.suggestedTherapyPlan?.medications.slice(0, 3).map((med, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-900 flex items-center gap-1">
                            <Pill className="w-3 h-3 text-fuchsia-600" />
                            {med.name}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500">
                            {med.drugClass}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-fuchsia-900 font-bold">
                          {med.dosage} • {med.routeAndFrequency}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Bar at bottom of panel */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-neutral-200">
                <p className="text-[11px] text-neutral-500 italic">
                  💡 Rekomendasi dihitung otomatis berdasarkan berat badan ({patientInfo?.weight || '3.5'} kg) &amp; tanda vital.
                </p>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={onOpenSidePanel}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-bold border border-neutral-300 shadow-2xs transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-fuchsia-700" />
                    <span>Buka Detail Analisis di Panel Samping</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Empty initial state */}
          {!isLoading && !analysis && (
            <div className="py-6 text-center space-y-2">
              <Stethoscope className="w-8 h-8 text-neutral-300 mx-auto" />
              <p className="text-xs text-neutral-600 font-medium">
                Siap menganalisis gejala klinis dan tanda vital pasien.
              </p>
              <p className="text-[11px] text-neutral-400 max-w-sm mx-auto">
                Ketikkan keluhan (S) dan hasil pemeriksaan fisik (O) pada formulir di bawah, lalu klik tombol "Minta Analisis AI Sekarang".
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
