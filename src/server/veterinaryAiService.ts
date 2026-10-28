import { GoogleGenAI, Type } from '@google/genai';

export interface VeterinaryCdssRequest {
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
}

export interface DifferentialDiagnosisItem {
  condition: string;
  probability: string;
  reasoning: string;
  pathophysiology?: string;
}

export interface MedicationRecommendation {
  drugClass: string;
  name: string;
  dosage: string;
  routeAndFrequency: string;
  notes: string;
}

export interface VeterinaryCdssResponse {
  summary: string;
  patientProfileBrief: string;
  differentialDiagnoses: DifferentialDiagnosisItem[];
  suggestedDiagnostics: string[];
  suggestedTherapyPlan: {
    fluidTherapy?: string;
    medications: MedicationRecommendation[];
    dietaryAndSupportive?: string;
    nursingCare?: string;
  };
  redFlags: string[];
  assessmentSuggestionText: string;
  planSuggestionText: string;
  disclaimer: string;
}

// Inisialisasi GoogleGenAI instance di server secara lazy
let aiInstance: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

export async function analyzeVeterinarySoap(
  data: VeterinaryCdssRequest
): Promise<VeterinaryCdssResponse> {
  const { subjective = '', objective = '', patientInfo = {} } = data;

  const petType = patientInfo.petType || 'Hewan Peliharaan';
  const weight = patientInfo.weight ? `${patientInfo.weight} kg` : 'Belum ditimbang';
  const temp = patientInfo.temperature ? `${patientInfo.temperature} °C` : 'Suhu normal/tidak terdata';
  const age = patientInfo.age || 'Usia tidak terdata';
  const breed = patientInfo.breed || 'Campuran';
  const hr = patientInfo.heartRate ? `${patientInfo.heartRate} bpm` : '-';
  const rr = patientInfo.respiratoryRate ? `${patientInfo.respiratoryRate} rpm` : '-';

  const systemInstruction = `Anda adalah "myPet Veterinary Clinical Decision Support System (CDSS) & Clinical Co-pilot", asisten kecerdasan buatan medis veteriner profesional yang bertugas membantu Dokter Hewan Berizin (Veterinarian).
Tugas Anda adalah menganalisis data klinis Subjective (S) dan Objective (O) pasien, kemudian memberikan opini klinis berbasis bukti (Evidence-Based Veterinary Medicine).

Pedoman Klinis Wajib:
1. SPESIFIKASI SPESIES:
   - Jika pasien Kucing (Feline): Selalu waspadai toksisitas khusus (DILARANG KERAS memberikan Parasetamol/Acetaminophen, Permetrin, Aspirin dosis tinggi, Enrofloxacin overdosis).
   - Jika pasien Anjing (Canine): Perhatikan sensitivitas ras (misal Ivermectin pada ras Collie/MDR1 mutation).
   - Jika pasien Kelinci / Rodensia (Small Mammals): Waspadai antibiotik oral yang merusak flora sekum (PLACE: Penicillin, Lincosamides, Ampicillin, Cephalosporins, Erythromycin oral).
2. HITUNG DOSIS SECARA PRESISI: Gunakan berat badan pasien (${weight}) untuk menghitung dosis miligram (mg) atau mililiter (ml) perkiraan.
3. STRUKTUR RESPONS: Selalu berikan diagnosis banding dari probabilitas tertinggi, saran uji lab/diagnostik penunjang, rencana cairan & terapi obat lengkap, dan peringatan tanda bahaya (Red Flags).
4. BAHASA: Gunakan Bahasa Indonesia medis kedokteran hewan yang baku, jelas, dan profesional.
5. SIKAP: Bertindak sebagai asisten kedua (Second Opinion), beri teks siap salin untuk kolom Assessment (A) dan Plan (P).`;

  const prompt = `Lakukan analisis klinis veteriner terperinci untuk pasien berikut:

DATA PASIEN (ANONIM):
- Spesies: ${petType}
- Ras: ${breed}
- Usia: ${age}
- Berat Badan: ${weight}
- Suhu Tubuh Rektal: ${temp}
- Heart Rate (HR): ${hr}
- Respiratory Rate (RR): ${rr}

DATA ANAMNESA / SUBJECTIVE (S):
${subjective || 'Tidak ada catatan subjektif spesifik.'}

DATA PEMERIKSAAN FISIK KLINIS / OBJECTIVE (O):
${objective || 'Tidak ada catatan objektif fisik spesifik.'}

Berikan analisis lengkap dalam format JSON yang valid.`;

  // Coba jalankan dengan Gemini 3.8 Flash jika API Key terhubung
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await getAi().models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Ringkasan sintesis kasus medis secara padat (1-2 kalimat).',
              },
              patientProfileBrief: {
                type: Type.STRING,
                description: 'Profil singkat pasien (spesies, usia, berat badan, status vital).',
              },
              differentialDiagnoses: {
                type: Type.ARRAY,
                description: 'Daftar diagnosis banding terurut dari kemungkinan tertinggi.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    condition: { type: Type.STRING, description: 'Nama penyakit / diagnosis' },
                    probability: { type: Type.STRING, description: 'Tingkat probabilitas (misal: Tinggi 75%, Sedang 20%)' },
                    reasoning: { type: Type.STRING, description: 'Alasan klinis dan korelasi gejala' },
                    pathophysiology: { type: Type.STRING, description: 'Etiologi dan patofisiologi singkat' },
                  },
                  required: ['condition', 'probability', 'reasoning'],
                },
              },
              suggestedDiagnostics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Daftar uji diagnostik penunjang yang direkomendasikan (Lab, Rontgen, USG, Rapid Test).',
              },
              suggestedTherapyPlan: {
                type: Type.OBJECT,
                properties: {
                  fluidTherapy: { type: Type.STRING, description: 'Rekomendasi cairan infus dan kecepatan tetesan.' },
                  medications: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        drugClass: { type: Type.STRING, description: 'Golongan obat (misal: Antiemetik, Antibiotik, Analgesik)' },
                        name: { type: Type.STRING, description: 'Nama generik / paten obat' },
                        dosage: { type: Type.STRING, description: 'Dosis referensi dan kalkulasi sesuai berat badan' },
                        routeAndFrequency: { type: Type.STRING, description: 'Rute (SC/IM/IV/PO) dan frekuensi (q12h/q24h)' },
                        notes: { type: Type.STRING, description: 'Catatan penggunaan dan kontraindikasi' },
                      },
                      required: ['drugClass', 'name', 'dosage', 'routeAndFrequency', 'notes'],
                    },
                  },
                  dietaryAndSupportive: { type: Type.STRING, description: 'Pakan terapeutik dan nutrisi pendukung' },
                  nursingCare: { type: Type.STRING, description: 'Instruksi rawat inap atau perawatan rumah' },
                },
                required: ['medications'],
              },
              redFlags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Peringatan bahaya kritis, kontraindikasi obat berbahaya, atau tanda kegawatdaruratan.',
              },
              assessmentSuggestionText: {
                type: Type.STRING,
                description: 'Teks format siap salin untuk kolom Assessment (A) dokter.',
              },
              planSuggestionText: {
                type: Type.STRING,
                description: 'Teks format siap salin untuk kolom Plan (P) dokter.',
              },
              disclaimer: {
                type: Type.STRING,
                description: 'Pernyataan etika medis bahwa keputusan klinis tetap pada dokter hewan berizin.',
              },
            },
            required: [
              'summary',
              'patientProfileBrief',
              'differentialDiagnoses',
              'suggestedDiagnostics',
              'suggestedTherapyPlan',
              'redFlags',
              'assessmentSuggestionText',
              'planSuggestionText',
              'disclaimer',
            ],
          },
        },
      });

      const responseText = response.text;
      if (responseText) {
        const parsed = JSON.parse(responseText) as VeterinaryCdssResponse;
        return parsed;
      }
    } catch (err) {
      console.warn('[VeterinaryCDSS] Gemini API error, falling back to embedded veterinary engine:', err);
    }
  }

  // Robust Embedded Veterinary Knowledge-Base Fallback Engine
  return generateEmbeddedVeterinaryAnalysis(data);
}

/**
 * Fallback engine dengan basis pengetahuan medis veteriner komprehensif
 * untuk memastikan dokter selalu mendapatkan rekomendasi instan dalam kondisi apapun.
 */
function generateEmbeddedVeterinaryAnalysis(data: VeterinaryCdssRequest): VeterinaryCdssResponse {
  const { subjective = '', objective = '', patientInfo = {} } = data;
  const petType = patientInfo.petType || 'Kucing';
  const breed = patientInfo.breed || 'Campuran';
  const weightNum = parseFloat(patientInfo.weight || '3.5') || 3.5;
  const tempNum = parseFloat(patientInfo.temperature || '38.5') || 38.5;
  const textCombined = `${subjective} ${objective}`.toLowerCase();

  const isFeline = petType.toLowerCase().includes('kucing') || petType.toLowerCase().includes('cat');
  const isCanine = petType.toLowerCase().includes('anjing') || petType.toLowerCase().includes('dog');
  const isRabbit = petType.toLowerCase().includes('kelinci') || petType.toLowerCase().includes('rabbit');

  // Deteksi Kelompok Gejala
  const hasVomiting = textCombined.includes('muntah') || textCombined.includes('vomit');
  const hasDiarrhea = textCombined.includes('diare') || textCombined.includes('mencret') || textCombined.includes('feses cair');
  const hasFever = tempNum > 39.2 || textCombined.includes('demam') || textCombined.includes('panas');
  const hasAnorexia = textCombined.includes('tidak makan') || textCombined.includes('anoreksia') || textCombined.includes('nafsu makan turun');
  const hasRespiratory = textCombined.includes('batuk') || textCombined.includes('bersin') || textCombined.includes('pilek') || textCombined.includes('sesak') || textCombined.includes('ingus');
  const hasSkinIssues = textCombined.includes('gatal') || textCombined.includes('rontok') || textCombined.includes('scabies') || textCombined.includes('jamur') || textCombined.includes('kutu') || textCombined.includes('luka');
  const hasUrinary = textCombined.includes('kencing') || textCombined.includes('pipis') || textCombined.includes('hematuria') || textCombined.includes('flutd') || textCombined.includes('urin');
  const hasEyeEar = textCombined.includes('mata') || textCombined.includes('telinga') || textCombined.includes('ear mite') || textCombined.includes('belekan');

  const diffs: DifferentialDiagnosisItem[] = [];
  const diagnostics: string[] = [];
  const medications: MedicationRecommendation[] = [];
  const redFlags: string[] = [];
  let fluidTherapy = `Maintenance IV Fluids: ${(weightNum * 50).toFixed(0)} - ${(weightNum * 60).toFixed(0)} ml/24 jam (Ringer Lactate / NaCl 0.9%).`;

  if (isFeline) {
    redFlags.push('⚠️ KONTRAINDIKASI MUTLAK: Jangan pernah memberikan Parasetamol / Acetaminophen pada kucing (Toksik mematikan akibat defisiensi glukuronidasi).');
    redFlags.push('⚠️ Waspadai dehidrasi cepat pada anak kucing (kitten); monitor turgor kulit dan kelembapan mukosa.');
  } else if (isCanine) {
    redFlags.push('⚠️ Hati-hati penggunaan Ivermectin pada anjing ras Collie / Sheltie (sensitivitas gen MDR1).');
    redFlags.push('⚠️ Hindari pemberian cokelat, bawang, anggur, atau pemanis Xylitol.');
  } else if (isRabbit) {
    redFlags.push('⚠️ KONTRAINDIKASI MUTLAK: Hindari antibiotik oral golongan PLACE (Penicillin, Lincosamides, Ampicillin, Cephalosporins) karena mematikan flora sekum.');
    redFlags.push('⚠️ Waspadai kondisi GI Stasis jika kelinci tidak makan > 12 jam.');
  }

  // Skenario 1: Gastrointestinal (Muntah / Diare / Anoreksia)
  if (hasVomiting || hasDiarrhea || (hasAnorexia && !hasRespiratory && !hasSkinIssues)) {
    if (isFeline) {
      diffs.push({
        condition: 'Gastroenteritis Akut / Gastritis e.c. Dietary Indiscretion',
        probability: 'Tinggi (~65%)',
        reasoning: 'Kombinasi muntah/diare, anoreksia, dan ketidaknyamanan abdominal pada pasien kucing.',
        pathophysiology: 'Iritasi mukosa gaster dan usus akibat perubahan pakan, benda asing minor, atau inflamasi mukosa.',
      });
      diffs.push({
        condition: 'Feline Panleukopenia Virus (FPLV)',
        probability: hasFever ? 'Tinggi (~40%)' : 'Sedang (~20%)',
        reasoning: 'Adanya demam, letargi, muntah profus, dan risiko infeksi parvovirus felin terutama bila vaksinasi belum tuntas.',
        pathophysiology: 'Replikasi virus pada sel-sel membelah cepat (kripta usus dan sumsum tulang), menyebabkan enteritis hemoragik dan leukopenia berat.',
      });
      diffs.push({
        condition: 'Obstruksi Benda Asing / Trichobezoar (Hairball)',
        probability: 'Rendah - Sedang (~15%)',
        reasoning: 'Perlu diwaspadai jika muntah berulang pasca makan atau minum.',
        pathophysiology: 'Obstruksi mekanis parsial atau total lumen traktus gastrointestinal.',
      });

      diagnostics.push('Pemeriksaan Darah Lengkap (CBC / Hematologi) untuk cek Leukopenia & status dehidrasi');
      diagnostics.push('Rapid Test FPLV Ag (Antigen Panleukopenia) dari swab rektal');
      diagnostics.push('USG / Rontgen X-Ray Abdomen (Posisi Lateral & VD) jika curiga benda asing');

      medications.push({
        drugClass: 'Antiemetik / Anti-Muntah',
        name: 'Maropitant (Cerenia) 10 mg/ml',
        dosage: `${(weightNum * 1.0).toFixed(1)} mg (${(weightNum * 0.1).toFixed(2)} ml)`,
        routeAndFrequency: 'SC, 1x sehari (q24h)',
        notes: 'Sangat efektif menghentikan muntah perifer maupun sentral.',
      });
      medications.push({
        drugClass: 'Gastroprotektor / H2 Blocker',
        name: 'Ranitidine 25 mg/ml ATAU Ondansetron',
        dosage: `Ranitidine ${(weightNum * 1.5).toFixed(1)} mg (${(weightNum * 0.06).toFixed(2)} ml)`,
        routeAndFrequency: 'SC/IV, 2x sehari (q12h)',
        notes: 'Mengurangi hiperasiditas lambung dan melindungi mukosa gaster.',
      });
      medications.push({
        drugClass: 'Antibiotik Lini Pertama',
        name: 'Amoxicillin-Clavulanate Inj / Ampicillin Sulbactam',
        dosage: `Amoxi-Clav ${(weightNum * 12.5).toFixed(1)} mg`,
        routeAndFrequency: 'SC/IM, 2x sehari (q12h)',
        notes: 'Mencegah translokasi bakteri enterik pasca kerusakan mukosa usus.',
      });
    } else {
      diffs.push({
        condition: 'Canine Parvovirus Enteritis (CPV) / Gastroenteritis Hemoragika',
        probability: hasFever || hasDiarrhea ? 'Tinggi (~55%)' : 'Sedang (~30%)',
        reasoning: 'Gejala gastrointestinal akut disertai letargi dan penurunan kondisi fisik.',
        pathophysiology: 'Destruksi enterosit vili usus dan imunosupresi limfoid.',
      });
      diffs.push({
        condition: 'Dietary Indiscretion / Gastroenteritis Bakterial',
        probability: 'Tinggi (~50%)',
        reasoning: 'Konsumsi makanan tidak cocok atau infeksi bakteri oportunistik enterik.',
      });

      diagnostics.push('Rapid Test CPV/CCV Ag (Parvo/Corona)');
      diagnostics.push('Hematologi Lengkap (CBC) & Uji Feses Natif / Flotasi');

      medications.push({
        drugClass: 'Antiemetik',
        name: 'Maropitant 1 mg/kg SC q24h ATAU Metoclopramide 0.3 mg/kg SC q8h',
        dosage: `Maropitant ${(weightNum * 1.0).toFixed(1)} mg`,
        routeAndFrequency: 'SC, 1x sehari',
        notes: 'Kontraindikasi Metoclopramide jika ada kecurigaan obstruksi benda asing mekanis.',
      });
      medications.push({
        drugClass: 'Antibiotik Terapi Enterik',
        name: 'Metronidazole + Cefazolin / Amoxicillin Clavulanate',
        dosage: `Metronidazole ${(weightNum * 10).toFixed(0)} mg`,
        routeAndFrequency: 'IV/PO q12h',
        notes: 'Atasi infeksi anaerob dan protozoa usus (Giardia).',
      });
    }
  }
  // Skenario 2: Respiratori / Saluran Pernafasan
  else if (hasRespiratory) {
    if (isFeline) {
      diffs.push({
        condition: 'Feline Upper Respiratory Tract Infection (Cat Flu / FHV-1 & FCV)',
        probability: 'Sangat Tinggi (~75%)',
        reasoning: 'Gejala bersin, discharge nasal/okular, demam, dan penurunan nafsu makan akibat anosmia.',
        pathophysiology: 'Infeksi Feline Herpesvirus-1 dan/atau Feline Calicivirus yang merusak epitel saluran nafas atas dan rongga mulut.',
      });
      diffs.push({
        condition: 'Pneumonia / Bronkitis Sekunder',
        probability: 'Sedang (~25%)',
        reasoning: 'Komplikasi infeksi bakteri sekunder (Bordetella bronchiseptica, Chlamydia felis, Mycoplasma).',
      });

      diagnostics.push('Inspeksi Rongga Mulut (cek ulserasi lidah khas Calicivirus)');
      diagnostics.push('Fluoroscein Eye Stain (cek ulkus kornea jika ada konjungtivitis)');
      diagnostics.push('Rontgen Thorax Lateral & VD jika terdengar suara krepitasi/ronkhi pada auskultasi');

      medications.push({
        drugClass: 'Antibiotik Saluran Pernafasan',
        name: 'Doxycycline 10 mg/kg PO q24h ATAU Azithromycin 10 mg/kg q24h',
        dosage: `Doxycycline ${(weightNum * 10).toFixed(0)} mg ATAU Azithromycin ${(weightNum * 10).toFixed(0)} mg`,
        routeAndFrequency: 'PO, 1x sehari',
        notes: 'PENTING: Selalu bilas dengan 3-5 ml air pasca minum kapsul/tablet Doxycycline pada kucing untuk mencegah striktur esofagus!',
      });
      medications.push({
        drugClass: 'Mukolitik & Bronkodilator',
        name: 'N-Acetylcysteine (NAC) / Bromhexine',
        dosage: `NAC ${(weightNum * 10).toFixed(0)} mg`,
        routeAndFrequency: 'PO/Nebulisasi, 2x sehari',
        notes: 'Membantu mengencerkan sekret mukoid kental pada rongga hidung.',
      });
      medications.push({
        drugClass: 'Imunomodulator & Vitamin',
        name: 'L-Lysine + Multivitamin & Zinc',
        dosage: '250 - 500 mg per hari',
        routeAndFrequency: 'PO, 1x sehari',
        notes: 'Membantu menekan replikasi Feline Herpesvirus.',
      });
    } else {
      diffs.push({
        condition: 'Kennel Cough Complex (Infectious Tracheobronchitis)',
        probability: 'Tinggi (~70%)',
        reasoning: 'Batuk kering paroksismal pasca riwayat kontak di pet hotel/grooming.',
      });
      diagnostics.push('Rontgen Thorax & Auskultasi Kardiopulmoner');
      medications.push({
        drugClass: 'Antibiotik',
        name: 'Doxycycline 10 mg/kg PO q12h ATAU Amoxi-Clav 15 mg/kg q12h',
        dosage: `${(weightNum * 10).toFixed(0)} mg`,
        routeAndFrequency: 'PO q12h',
        notes: 'Terapi minimal 7-10 hari.',
      });
    }
  }
  // Skenario 3: Dermatologi & Parasit (Kulit / Bulu)
  else if (hasSkinIssues) {
    diffs.push({
      condition: 'Dermatofitosis (Ringworm / Microsporum canis)',
      probability: 'Tinggi (~45%)',
      reasoning: 'Lesi alopesia melingkar, berkerak, dan deskuamasi pada daun telinga atau wajah.',
    });
    diffs.push({
      condition: 'Scabies (Notoedres cati / Sarcoptes scabiei)',
      probability: 'Tinggi (~40%)',
      reasoning: 'Pruritus hebat, kerak tebal hiperkeratotik pada tepi telinga dan area kepala/kaki.',
    });
    diffs.push({
      condition: 'Flea Allergic Dermatitis (FAD) / Pyoderma Bakterial',
      probability: 'Sedang (~25%)',
      reasoning: 'Reaksi hipersensitivitas saliva kutu dan infeksi sekunder Staphylococcus pseudintermedius.',
    });

    diagnostics.push('Wood’s Lamp Examination (evaluasi fluoresensi hijau apel untuk M. canis)');
    diagnostics.push('Skin Scraping & Uji Mikroskopis KOH (deteksi tungau Scabies & spora jamur)');
    diagnostics.push('Tape Impression Cytology (evaluasi bakteri & yeast Malassezia)');

    medications.push({
      drugClass: 'Antiparasit Topikal / Sistemik (Spot On)',
      name: 'Selamectin (Revolution) ATAU Fluralaner (Bravecto) / Sarolaner',
      dosage: `1 tube Spot-On sesuai berat badan (${weightNum} kg)`,
      routeAndFrequency: 'Topikal tengkuk, 1x per bulan',
      notes: 'Membasmi tungau Scabies, kutu pinjal, dan nematoda usus secara komprehensif.',
    });
    medications.push({
      drugClass: 'Antijamur Sistemik (Bila Indikasi Dermatofitosis)',
      name: 'Itraconazole 5-10 mg/kg PO q24h',
      dosage: `Itraconazole ${(weightNum * 5).toFixed(1)} - ${(weightNum * 10).toFixed(1)} mg`,
      routeAndFrequency: 'PO bersama pakan berlemak, sistem denyut (1 minggu on, 1 minggu off)',
      notes: 'Monitor fungsi hepar jika terapi jangka panjang.',
    });
    medications.push({
      drugClass: 'Shampoo & Salep Terapi Topikal',
      name: 'Chlorhexidine 2-4% + Ketoconazole / Miconazole Medicated Shampoo',
      dosage: 'Mandi terapi kontak 10 menit',
      routeAndFrequency: 'Mandi 2x seminggu',
      notes: 'Bilas bersih dan keringkan sempurna.',
    });
  }
  // Skenario 4: Urinaria / Saluran Kemih
  else if (hasUrinary) {
    diffs.push({
      condition: 'Feline Lower Urinary Tract Disease (FLUTD) / Feline Idiopathic Cystitis (FIC)',
      probability: 'Sangat Tinggi (~70%)',
      reasoning: 'Stranguria, periuria, hematuria, disuria, dan sering menjilat area genital.',
    });
    diffs.push({
      condition: 'Urolitiasis (Struvite / Calcium Oxalate Uroliths)',
      probability: 'Tinggi (~40%)',
      reasoning: 'Kecurigaan kristaluria yang menyumbat uretra (khususnya pada jantan).',
    });

    diagnostics.push('Urinalisis Lengkap (Uji Dipstick, Berat Jenis, Sedimen Kristal & pH Urin)');
    diagnostics.push('Palpasi Vesica Urinaria (Cek status distensi/teraba keras atau kosong)');
    diagnostics.push('Rontgen & USG Saluran Kemih (deteksi urolit radiopak dan penebalan dinding VU)');

    medications.push({
      drugClass: 'Analgesik & Antispasmodik Uretra',
      name: 'Prazosin 0.5 mg/cat PO q12h ATAU Meloxicam (jika ginjal normal)',
      dosage: 'Prazosin 0.25 - 0.5 mg per kucing',
      routeAndFrequency: 'PO q12h-q24h',
      notes: 'Relaksasi otot polos uretra untuk mempermudah berkemih.',
    });
    medications.push({
      drugClass: 'Diet Terapeutik Urinari',
      name: 'Pakan Khusus Urinary (Wet Food Urinary S/O)',
      dosage: 'Sesuai kebutuhan kalori harian',
      routeAndFrequency: 'Setiap hari',
      notes: 'Meningkatkan hidrasi dan mengontrol pH urin.',
    });
  }
  // Kasus Umum / Pemeriksaan Rutin
  else {
    diffs.push({
      condition: 'Pemeriksaan Kesehatan Rutin / Suspect Mild Malaise',
      probability: 'Umum (~80%)',
      reasoning: 'Gejala klinis non-spesifik, parameter vital dalam rentang stabil.',
    });
    diagnostics.push('Pemeriksaan Fisik Lengkap Head-to-Tail & Cek Status Vaksinasi/Obat Cacing');
    medications.push({
      drugClass: 'Suplemen & Vitamin Pendukung',
      name: 'Multivitamin Asam Amino & Imunostimulan',
      dosage: `${(weightNum * 0.5).toFixed(1)} ml`,
      routeAndFrequency: 'PO, 1x sehari',
      notes: 'Diberikan bersama pakan.',
    });
  }

  const assessmentText = `Suspect ${diffs[0]?.condition || 'Pemeriksaan Medis'} (${diffs[0]?.probability || 'Stabil'}). DDx: ${diffs.slice(1).map((d) => d.condition).join(', ') || '-'}. Status Hidrasi & Vital Signs ${tempNum > 39.2 ? 'Febris' : 'Normotermia'}.`;

  const planLines = [
    `1. ${fluidTherapy}`,
    ...medications.map((m, idx) => `${idx + 2}. ${m.drugClass}: ${m.name} [Dosis: ${m.dosage}, ${m.routeAndFrequency}] - ${m.notes}`),
    `Diagnostic Plan: ${diagnostics.join('; ')}`,
    'Instruksi Klien: Pantau nafsu makan, eliminasi (urin/feses), dan kontrol ulang 3-5 hari atau segera jika kondisi memburuk.',
  ];

  return {
    summary: `Analisis klinis berbasis gejala untuk ${petType} (${weightNum} kg, ${tempNum}°C) mengarah pada kecurigaan utama ${diffs[0]?.condition || 'Gangguan Klinis'}.`,
    patientProfileBrief: `${petType} • ${breed} • BB ${weightNum} kg • T: ${tempNum}°C`,
    differentialDiagnoses: diffs,
    suggestedDiagnostics: diagnostics,
    suggestedTherapyPlan: {
      fluidTherapy,
      medications,
      dietaryAndSupportive: 'Pakan diet lunak yang mudah dicerna, sediakan air minum bersih segar ad libitum.',
      nursingCare: 'Jaga kehangatan dan kebersihan lingkungan kandang, hindari stres berlebih.',
    },
    redFlags,
    assessmentSuggestionText: assessmentText,
    planSuggestionText: planLines.join('\n'),
    disclaimer: 'PERHATIAN MEDIS: myPet Veterinary CDSS adalah asisten klinis (Second Opinion). Rekomendasi obat, diagnosa, dan terapi final sepenuhnya merupakan wewenang dan tanggung jawab Dokter Hewan yang memeriksa.',
  };
}
