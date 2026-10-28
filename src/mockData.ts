import type { Owner, Pet, VisitQueue, SoapRecord, InpatientCage, InventoryItem, BookingAppointment, StaffUser, CustomerFeedback, SurgeryRecord } from './types.ts';

// Staf, Dokter & Superadmin terdaftar resmi di sistem klinik (sinkron dengan Google Spreadsheet 8_Staf)
export const INITIAL_STAFF: StaffUser[] = [
  {
    id: 'staff-1790051436391',
    username: 'owner',
    name: 'drh. Widia Ilhami',
    role: 'Super Admin / Owner',
    avatar: '👑',
    password: 'SHA256:v2:1af4116671a4f0549ac2aca83cb45cba:777bca86d658d1f89b85b1cc0304a86ae0edc5b8713b1cab92539f3527750a7e',
    isPracticingDoctor: true,
  },
  {
    id: 'staff-1790051436389',
    username: 'arsi.vet',
    name: 'drh. Widia Ilhami',
    role: 'Dokter Hewan',
    avatar: '👩‍⚕️',
    password: 'SHA256:v2:d413425745298beade2e417985fc8900:3b3edce5fd9288ba85c3ddb5e7cbab393b0646035d25ca8be3253265dac377c6',
    isPracticingDoctor: true,
  },
  {
    id: 'staff-1790051436390',
    username: 'staff.admin',
    name: 'Staff Admin',
    role: 'Staff Admin / Frontdesk',
    avatar: '👨‍💼',
    password: 'SHA256:v2:dcb3fb2297fdcbd9d69c01bdd9e49cc4:ffd0c85ad81fbc3083520f25645197f76da50438bd4b6e4fd40bb2aec6e1df48',
    isPracticingDoctor: false,
  },
];

// Data Pemilik default kosong (mengikuti isi Google Spreadsheet)
export const INITIAL_OWNERS: Owner[] = [];

// Data Pasien default kosong (mengikuti isi Google Spreadsheet)
export const INITIAL_PETS: Pet[] = [];

// Data Antrean Pasien default kosong (mengikuti isi Google Spreadsheet)
export const INITIAL_QUEUES: VisitQueue[] = [];

export const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-001',
    name: 'Azithromycin 250mg',
    category: 'Antibiotik',
    batchNo: 'BAT-366008',
    expireDate: '2027-06-30',
    minThreshold: 15,
    stockQuantity: 50,
    unit: 'Kapsul',
    price: 25000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-002',
    name: 'Amoxicillin-Clavulanate 250mg',
    category: 'Antibiotik',
    batchNo: 'BAT-294012',
    expireDate: '2027-08-15',
    minThreshold: 20,
    stockQuantity: 100,
    unit: 'Tablet',
    price: 12000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-003',
    name: 'Cefalexin 300mg',
    category: 'Antibiotik',
    batchNo: 'BAT-551092',
    expireDate: '2027-09-30',
    minThreshold: 15,
    stockQuantity: 80,
    unit: 'Tablet',
    price: 15000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-004',
    name: 'Doxycycline 100mg',
    category: 'Antibiotik',
    batchNo: 'BAT-772104',
    expireDate: '2027-11-20',
    minThreshold: 15,
    stockQuantity: 60,
    unit: 'Tablet',
    price: 10000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-005',
    name: 'Metronidazole 500mg',
    category: 'Antibiotik',
    batchNo: 'BAT-883190',
    expireDate: '2027-10-10',
    minThreshold: 15,
    stockQuantity: 75,
    unit: 'Tablet',
    price: 8000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-006',
    name: 'Meloxicam 1.5mg/ml Oral Drop',
    category: 'Analgesik & Antiradang',
    batchNo: 'BAT-442111',
    expireDate: '2027-07-25',
    minThreshold: 10,
    stockQuantity: 30,
    unit: 'Botol',
    price: 45000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-007',
    name: 'Ketoprofen Inj 10%',
    category: 'Analgesik & Antiradang',
    batchNo: 'BAT-991204',
    expireDate: '2027-12-05',
    minThreshold: 8,
    stockQuantity: 20,
    unit: 'Vial',
    price: 65000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-008',
    name: 'Ivermectin Inj 1%',
    category: 'Antiparasit',
    batchNo: 'BAT-110294',
    expireDate: '2027-08-30',
    minThreshold: 10,
    stockQuantity: 25,
    unit: 'Vial',
    price: 55000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-009',
    name: 'Selamectin Spot-On Kucing',
    category: 'Antiparasit',
    batchNo: 'BAT-332910',
    expireDate: '2027-10-15',
    minThreshold: 15,
    stockQuantity: 40,
    unit: 'Tube',
    price: 85000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-010',
    name: 'Vaksin Felocell 4 / Tricat',
    category: 'Vaksin',
    batchNo: 'BAT-661029',
    expireDate: '2027-05-30',
    minThreshold: 10,
    stockQuantity: 35,
    unit: 'Vial',
    price: 160000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-011',
    name: 'Vaksin Rabies Rabisin',
    category: 'Vaksin',
    batchNo: 'BAT-881920',
    expireDate: '2027-06-20',
    minThreshold: 15,
    stockQuantity: 50,
    unit: 'Vial',
    price: 95000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-012',
    name: 'Ringer Lactate (RL) Infus 500ml',
    category: 'Cairan Infus',
    batchNo: 'BAT-123456',
    expireDate: '2028-01-30',
    minThreshold: 20,
    stockQuantity: 45,
    unit: 'Kolf',
    price: 22000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-013',
    name: 'NaCl 0.9% Infus 500ml',
    category: 'Cairan Infus',
    batchNo: 'BAT-654321',
    expireDate: '2028-02-15',
    minThreshold: 20,
    stockQuantity: 50,
    unit: 'Kolf',
    price: 20000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-014',
    name: 'Vitamin B-Complex Inj 100ml',
    category: 'Suplemen & Vitamin',
    batchNo: 'BAT-908123',
    expireDate: '2027-09-10',
    minThreshold: 8,
    stockQuantity: 15,
    unit: 'Botol',
    price: 40000,
    lastRestocked: '2026-10-10',
  },
  {
    id: 'inv-015',
    name: 'Spuit / Syringe 1cc & 3cc Terumo',
    category: 'BHP Medis',
    batchNo: 'BAT-771122',
    expireDate: '2029-12-31',
    minThreshold: 50,
    stockQuantity: 200,
    unit: 'Pcs',
    price: 3000,
    lastRestocked: '2026-10-10',
  },
];

// Data Dummy Rekam Medis (SOAP) dikosongkan
export const INITIAL_SOAP_RECORDS: SoapRecord[] = [];

// Fasilitas Ruang Rawat Inap (12 Kandang Standar Klinik dalam kondisi Siap/Available tanpa pasien dummy)
export const INITIAL_CAGES: InpatientCage[] = [
  {
    id: 'A1',
    label: 'Kandang A-1 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A2',
    label: 'Kandang A-2 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A3',
    label: 'Kandang A-3 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A4',
    label: 'Kandang A-4 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A5',
    label: 'Kandang A-5 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A6',
    label: 'Kandang A-6 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B1',
    label: 'Kandang B-1 (Anjing/Isolasi)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B2',
    label: 'Kandang B-2 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B3',
    label: 'Kandang B-3 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B4',
    label: 'Kandang B-4 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B5',
    label: 'Kandang B-5 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B6',
    label: 'Kandang B-6 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
];

// Data Dummy Jadwal Booking dikosongkan
export const INITIAL_BOOKINGS: BookingAppointment[] = [];

// Data Feedback & Tingkat Kepuasan Pelanggan dikosongkan (Bersih / Siap Sinkron Spreadsheet)
export const INITIAL_FEEDBACKS: CustomerFeedback[] = [];

// Data Tindakan Operasi dikosongkan (Bersih / Siap Sinkron Spreadsheet Sheet 10)
export const INITIAL_SURGERIES: SurgeryRecord[] = [];

