/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ClinicProvider, useClinic } from './context/ClinicContext';
import { useRouter, AppRoute } from './navigation';

// Patient Portal Components
import { PatientLanding } from './components/patient/PatientLanding';
import { RegistrationWizard } from './components/patient/RegistrationWizard';
import { PatientDashboard } from './components/patient/PatientDashboard';

// Auth Components
import { LoginPage } from './components/auth/LoginPage';

// Admin Portal Components
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { DataPemilik } from './components/admin/DataPemilik';
import { DataPasien } from './components/admin/DataPasien';
import { RekamMedis } from './components/admin/RekamMedis';
import { RawatInap } from './components/admin/RawatInap';
import { TindakanOperasi } from './components/admin/TindakanOperasi';
import { StokObat } from './components/admin/StokObat';
import { JadwalBooking } from './components/admin/JadwalBooking';
import { AdminLaporan } from './components/admin/AdminLaporan';
import { AdminPengaturan } from './components/admin/AdminPengaturan';

import { VisitQueue, Pet } from './types';

const MainAppContent: React.FC = () => {
  const { currentRoute, navigate } = useRouter();
  const { currentUser } = useClinic();

  // Cross-view selection for SOAP form
  const [selectedQueueForSoap, setSelectedQueueForSoap] = useState<VisitQueue | null>(null);
  const [selectedPetForSoap, setSelectedPetForSoap] = useState<Pet | null>(null);

  const handleSelectQueueForSoap = (queue: VisitQueue) => {
    setSelectedQueueForSoap(queue);
    setSelectedPetForSoap(null);
  };

  const handleSelectPetForSoap = (pet: Pet) => {
    setSelectedPetForSoap(pet);
    setSelectedQueueForSoap(null);
  };

  const handleClearSoapSelection = () => {
    setSelectedQueueForSoap(null);
    setSelectedPetForSoap(null);
  };

  // --- PATIENT PORTAL ROUTES (PUBLIC) ---
  if (currentRoute === '/') {
    return <PatientLanding navigate={navigate} />;
  }

  if (currentRoute === '/pasien/daftar') {
    return <RegistrationWizard navigate={navigate} />;
  }

  if (currentRoute === '/pasien/dashboard') {
    return <PatientDashboard navigate={navigate} />;
  }

  // --- AUTH ROUTE ---
  if (currentRoute === '/login') {
    return <LoginPage navigate={navigate} />;
  }

  // --- ADMIN PORTAL ROUTES (PROTECTED) ---
  // Security gate: If accessing /admin/* without logged-in staff, redirect to login
  if (currentRoute.startsWith('/admin')) {
    if (!currentUser) {
      return (
        <LoginPage
          navigate={navigate}
          redirectTarget={currentRoute}
        />
      );
    }

    // Inside Admin Shell
    return (
      <AdminLayout currentRoute={currentRoute} navigate={navigate}>
        {currentRoute === '/admin' || currentRoute === '/admin/dashboard' ? (
          <AdminDashboard
            navigate={navigate}
            onSelectPatientForSoap={handleSelectQueueForSoap}
          />
        ) : currentRoute === '/admin/pemilik' ? (
          <DataPemilik
            navigate={navigate}
            onSelectPetForSoap={handleSelectPetForSoap}
          />
        ) : currentRoute === '/admin/pasien' ? (
          <DataPasien
            navigate={navigate}
            onSelectPetForSoap={handleSelectPetForSoap}
          />
        ) : currentRoute === '/admin/rekam-medis' ? (
          <RekamMedis
            navigate={navigate}
            selectedPatientQueue={selectedQueueForSoap}
            selectedPetDirect={selectedPetForSoap}
            onClearSoapSelection={handleClearSoapSelection}
          />
        ) : currentRoute === '/admin/rawat-inap' ? (
          <RawatInap navigate={navigate} />
        ) : currentRoute === '/admin/operasi' ? (
          <TindakanOperasi navigate={navigate} />
        ) : currentRoute === '/admin/stok' ? (
          <StokObat navigate={navigate} />
        ) : currentRoute === '/admin/booking' ? (
          <JadwalBooking navigate={navigate} />
        ) : currentRoute === '/admin/laporan' ? (
          <AdminLaporan navigate={navigate} />
        ) : currentRoute === '/admin/pengaturan' ? (
          <AdminPengaturan navigate={navigate} />
        ) : (
          <AdminDashboard
            navigate={navigate}
            onSelectPatientForSoap={handleSelectQueueForSoap}
          />
        )}
      </AdminLayout>
    );
  }

  // Fallback default
  return <PatientLanding navigate={navigate} />;
};

export default function App() {
  return (
    <ClinicProvider>
      <MainAppContent />
    </ClinicProvider>
  );
}
