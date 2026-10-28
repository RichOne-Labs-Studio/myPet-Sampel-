export type PetType = 'Cat' | 'Dog' | 'Rabbit' | 'Exotic' | 'Farm Animal';
export type ServiceType = 'Consultation' | 'Vaccine' | 'Grooming' | 'Hotel' | 'Daftar';
export type QueueStatus = 'Menunggu' | 'Di Ruang Poli' | 'Selesai' | 'Dibatalkan';
export type CageStatus = 'Occupied' | 'Cleaning' | 'Available';
export type StaffRole = 'Super Admin / Owner' | 'Dokter Hewan' | 'Staff Admin / Frontdesk';

export interface Owner {
  id: string;
  name: string;
  whatsapp: string;
  address: string;
  registeredAt: string;
  notes?: string;
  informedConsent?: string;
}

export interface Pet {
  id: string;
  ownerId?: string;
  ownerName?: string;
  ownerWhatsapp: string;
  name: string;
  type: PetType;
  breed: string;
  ageOrDob: string;
  sex: 'Jantan' | 'Betina';
  weight?: number;
  photoUrl?: string;
  status: 'Sehat' | 'Rawat Inap' | 'Perawatan' | 'Kontrol';
  registeredAt: string;
  notes?: string;
  informedConsent?: string;
}

export interface VisitQueue {
  id: string;
  ticketNumber: string; // e.g. "A-12"
  ownerWhatsapp: string;
  ownerName: string;
  petId: string;
  petName: string;
  petType: PetType;
  photoUrl?: string;
  serviceType: ServiceType;
  chiefComplaint: string;
  status: QueueStatus;
  createdAt: string;
  calledAt?: string;
  completedAt?: string;
  assignedDoctor?: string;
  notes?: string;
  informedConsent?: string;
}

export interface PrescriptionItem {
  inventoryItemId: string;
  itemName: string;
  dosage: string;
  quantity: number;
  unit: string;
  price?: number;
}

export interface DiagnosticAttachment {
  id: string;
  name: string;
  type: 'image' | 'file';
  fileType?: string;
  dataUrl: string;
  size?: string;
  category: 'Rontgen / X-Ray' | 'USG' | 'Hematologi / Lab' | 'Sitologi / Mikroskopik' | 'Rapid Test' | 'Lainnya';
  notes?: string;
  uploadedAt: string;
}

export interface SoapRecord {
  id: string;
  queueId?: string;
  petId: string;
  petName: string;
  ownerName: string;
  ownerWhatsapp?: string;
  veterinarian: string;
  date: string;
  vitals: {
    weight: number; // kg
    temperature: number; // °C
    heartRate: number; // bpm
    respiratoryRate: number; // rpm
  };
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  prescriptions: PrescriptionItem[];
  diagnosticAttachments?: DiagnosticAttachment[];
  diagnosticNotes?: string;
  serviceFee?: number;
  notes?: string;
}

export interface InpatientObservation {
  id: string;
  date: string;
  time: string;
  temp: number;
  appetite: 'Lahap' | 'Sedang' | 'Menolak';
  defecationUrination: 'Normal' | 'Abnormal' | 'Belum Ada';
  medicationGiven: boolean;
  cleaned: boolean;
  notes: string;
  checkedBy: string;
}

export interface InpatientCage {
  id: string; // e.g., "A1", "A2", "B1"
  label: string;
  status: CageStatus;
  petId?: string;
  petName?: string;
  petType?: PetType;
  ownerName?: string;
  ownerWhatsapp?: string;
  diagnosis?: string;
  admittedAt?: string;
  dischargedAt?: string;
  veterinarian?: string;
  observations: InpatientObservation[];
}

export interface InpatientHistoryRecord {
  id: string;
  cageId: string;
  cageLabel: string;
  petId: string;
  petName: string;
  petType: PetType;
  ownerName: string;
  ownerWhatsapp: string;
  diagnosis: string;
  admittedAt: string;
  dischargedAt: string;
  veterinarian: string;
  observations: InpatientObservation[];
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'Antibiotik' | 'Analgesik & Antiradang' | 'Antiparasit' | 'Vaksin' | 'Cairan Infus' | 'Suplemen & Vitamin' | 'BHP Medis';
  batchNo: string;
  expireDate: string;
  minThreshold: number;
  stockQuantity: number;
  unit: string;
  price: number;
  lastRestocked: string;
}

export interface BookingAppointment {
  id: string;
  petName: string;
  petType?: PetType;
  ownerName: string;
  ownerWhatsapp: string;
  serviceType: ServiceType;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  doctor?: string;
  notes: string;
  status: 'Terkonfirmasi' | 'Menunggu' | 'Selesai' | 'Batal' | 'Terjadwal';
}

export type BookingSchedule = BookingAppointment;

export interface StaffUser {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  password?: string;
  avatar: string;
  isPracticingDoctor?: boolean;
}

export type SatisfactionRating = 1 | 2 | 3 | 4 | 5;

export interface CustomerFeedback {
  id: string;
  ticketNumber?: string;
  ownerName: string;
  ownerWhatsapp?: string;
  petName?: string;
  serviceType?: string;
  satisfactionRating: number; // 1 to 5
  satisfactionLabel: 'Sangat Puas' | 'Puas' | 'Cukup' | 'Kurang' | 'Sangat Kurang';
  category: string;
  feedbackText: string; // Saran, kritik, dan masukan
  submittedAt: string;
  isRead?: boolean;
  readAt?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'connected' | 'error';

export interface SpreadsheetConfig {
  webAppUrl: string;
  spreadsheetName: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  isConnected: boolean;
}

export type SurgeryStatus = 'Dijadwalkan' | 'Sedang Berlangsung' | 'Selesai' | 'Batal';

export interface SurgeryRecord {
  id: string;
  petId?: string;
  petName?: string;
  petType?: PetType;
  ownerName?: string;
  ownerWhatsapp?: string;
  operationType?: string; // Jenis tindakan
  atropineDose?: string; // Dosis Atropin
  xylazineDose?: string; // Dosis Xylazine
  ketamineDose?: string; // Dosis Ketamin
  acpDose?: string; // Dosis ACP
  yohimbineDose?: string; // Dosis Yohimbine
  antibioticDoseAndType?: string; // Dosis Antibiotik (dosis dan jenis)
  analgesicDoseAndType?: string; // Dosis Analgesik (dosis dan jenis)
  operator?: string; // Operator
  operationNotes?: string; // Catatan operasi
  status?: SurgeryStatus; // Status tindakan
  date?: string; // Tanggal tindakan YYYY-MM-DD
  time?: string; // Jam tindakan HH:mm
  createdAt?: string;
}

export interface PendingWriteVerification {
  id: string;
  table: 'pets' | 'owners' | 'soapRecords' | 'inventory' | 'queues' | 'cages' | 'bookings' | 'feedbacks' | 'staff' | 'surgeries';
  title: string;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'verified' | 'failed';
  lastAttemptAt?: number;
  error?: string;
}


