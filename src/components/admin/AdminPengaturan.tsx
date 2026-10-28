import React, { useState } from 'react';
import {
  Settings,
  UserPlus,
  Trash2,
  Shield,
  UserCheck,
  Stethoscope,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Users,
  Info,
  Lock,
  Crown,
  Edit3,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { StaffRole, StaffUser } from '../../types';
import { getRoleBadgeInfo, isSuperAdminRole, canViewRevenue } from '../../utils/authUtils';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const AdminPengaturan: React.FC<Props> = ({ navigate }) => {
  const {
    staffList,
    currentUser,
    addStaff,
    deleteStaff,
    updateStaff,
    updateStaffPassword,
    syncToSpreadsheet,
  } = useClinic();

  // Modal / Form state for adding new staff
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('Staff Admin / Frontdesk');
  const [avatar, setAvatar] = useState('👨‍💼');
  const [isPracticingDoctor, setIsPracticingDoctor] = useState(false);
  const [formError, setFormError] = useState('');

  // Modal / Form state for editing staff (name, role, username, password, avatar, isPracticingDoctor)
  const [editModalStaff, setEditModalStaff] = useState<StaffUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<StaffRole>('Staff Admin / Frontdesk');
  const [editAvatar, setEditAvatar] = useState('👨‍💼');
  const [editIsPracticingDoctor, setEditIsPracticingDoctor] = useState(false);
  const [editFormError, setEditFormError] = useState('');

  // Modal for changing staff password
  const [passwordModalStaff, setPasswordModalStaff] = useState<StaffUser | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [passwordModalError, setPasswordModalError] = useState('');

  // Notification message for actions
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Nama lengkap staf / dokter wajib diisi.');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setFormError('Username wajib diisi untuk login.');
      return;
    }

    if (cleanUsername.length < 3) {
      setFormError('Username minimal harus 3 karakter.');
      return;
    }

    if (!password.trim()) {
      setFormError('Password akun staf wajib diisi.');
      return;
    }

    if (password.trim().length < 3) {
      setFormError('Password minimal harus 3 karakter.');
      return;
    }

    const result = addStaff({
      name: name.trim(),
      username: cleanUsername,
      role,
      password: password.trim(),
      avatar,
      isPracticingDoctor: role === 'Dokter Hewan' ? true : isPracticingDoctor,
    });

    if (result.success) {
      showToast(result.message, 'success');
      setName('');
      setUsername('');
      setPassword('');
      setRole('Staff Admin / Frontdesk');
      setAvatar('👨‍💼');
      setIsPracticingDoctor(false);
      setShowAddModal(false);
    } else {
      setFormError(result.message);
    }
  };

  const handleDeleteStaff = (id: string, staffName: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus akun admin/staf "${staffName}"?`)) {
      const res = deleteStaff(id);
      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    }
  };

  const handleOpenEditModal = (staf: StaffUser) => {
    setEditModalStaff(staf);
    setEditName(staf.name);
    setEditUsername(staf.username);
    setEditPassword(staf.password || 'admin');
    setEditRole(staf.role);
    setEditAvatar(staf.avatar || '👨‍💼');
    setEditIsPracticingDoctor(staf.role === 'Dokter Hewan' ? true : Boolean(staf.isPracticingDoctor));
    setEditFormError('');
  };

  const handleSaveEditStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalStaff) return;
    setEditFormError('');

    if (!editName.trim()) {
      setEditFormError('Nama lengkap wajib diisi.');
      return;
    }
    const cleanUsername = editUsername.trim().toLowerCase();
    if (!cleanUsername) {
      setEditFormError('Username wajib diisi.');
      return;
    }
    if (cleanUsername.length < 3) {
      setEditFormError('Username minimal 3 karakter.');
      return;
    }

    const payload: Partial<StaffUser> = {
      name: editName.trim(),
      username: cleanUsername,
      role: editRole,
      avatar: editAvatar,
      isPracticingDoctor: editRole === 'Dokter Hewan' ? true : editIsPracticingDoctor,
    };

    if (editPassword.trim()) {
      if (editPassword.trim().length < 3) {
        setEditFormError('Kata sandi baru minimal 3 karakter.');
        return;
      }
      payload.password = editPassword.trim();
    }

    const res = updateStaff(editModalStaff.id, payload);

    if (res.success) {
      showToast(res.message, 'success');
      setEditModalStaff(null);
    } else {
      setEditFormError(res.message);
    }
  };

  const avatarOptions = [
    { emoji: '👑', label: 'Owner / Direktur' },
    { emoji: '👨‍💼', label: 'Admin Pria' },
    { emoji: '👩‍💼', label: 'Admin Wanita' },
    { emoji: '👨‍⚕️', label: 'Dokter Pria' },
    { emoji: '👩‍⚕️', label: 'Dokter Wanita' },
    { emoji: '🧑‍⚕️', label: 'Perawat Hewan' },
    { emoji: '👤', label: 'Staf Umum' },
  ];

  // Restrict access: Only Super Admin / Owner can view & manage Pengaturan
  if (!canViewRevenue(currentUser)) {
    return (
      <div className="bg-white rounded-3xl border border-neutral-200/80 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto text-2xl">
          🔒
        </div>
        <div>
          <h2 className="text-xl font-black text-neutral-900 tracking-tight">Akses Terbatas: Khusus Super Admin / Owner</h2>
          <p className="text-xs text-neutral-500 leading-relaxed mt-2">
            Halaman Pengaturan & Manajemen Admin hanya dapat diakses oleh akun dengan tingkatan hak akses <strong>Super Admin / Owner</strong>.
          </p>
        </div>
        <div className="pt-3">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="px-5 py-2.5 bg-fuchsia-700 hover:bg-fuchsia-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-lg border text-xs font-bold flex items-center gap-2.5 transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-800 text-white border-emerald-700'
              : 'bg-rose-800 text-white border-rose-700'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-300" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-fuchsia-100 text-fuchsia-700">
            <Settings className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Pengaturan & Manajemen Admin</h2>
            <p className="text-xs text-neutral-500">
              Kelola daftar akun staf, dokter hewan, kata sandi, dan hak akses sistem klinik
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-tambah-admin"
            onClick={() => {
              setFormError('');
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Data Admin</span>
          </button>
        </div>
      </div>



      {/* Quick Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Total Admin & Staf
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">
                {staffList.length}
              </span>
              <span className="text-xs text-neutral-400">pengguna aktif</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-neutral-100 text-neutral-600">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Dokter Hewan
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-fuchsia-700 font-mono">
                {staffList.filter((s) => s.role === 'Dokter Hewan' || s.isPracticingDoctor).length}
              </span>
              <span className="text-xs text-neutral-400">tenaga medis</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-fuchsia-50 text-fuchsia-700">
            <Stethoscope className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Akun Aktif Anda
            </span>
            <div className="mt-2">
              <p className="text-sm font-bold text-neutral-900 truncate">
                {currentUser?.name || 'Admin'}
              </p>
              <p className="text-[11px] text-fuchsia-700 font-mono">
                @{currentUser?.username || 'user'} • {currentUser?.role}
              </p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200 flex items-center justify-center text-lg font-bold">
            {currentUser?.avatar || '👨‍💼'}
          </div>
        </div>
      </div>

      {/* Info: Matrix Hak Akses Login Berjenjang */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-fuchsia-700" />
          <h3 className="text-sm font-bold text-neutral-900">Struktur Hak Akses Login Berjenjang</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-950 text-xs">
              <span>👑</span>
              <span>Super Admin / Owner</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              <strong>Hak Akses Penuh:</strong> Melihat semua data, grafik tren, manajemen akun staf, serta <strong>rekapitulasi estimasi pendapatan & nominal tarif finansial</strong> di Dashboard dan Laporan.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/50 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-sky-950 text-xs">
              <span>🛡️</span>
              <span>Staff Admin / Frontdesk</span>
            </div>
            <p className="text-[11px] text-sky-900 leading-relaxed">
              <strong>Operasional Frontdesk:</strong> Registrasi pasien, antrean poli, data pemilik, rawat inap, stok obat, & kepuasan klien. <em>Rekapitulasi estimasi nominal omset disembunyikan.</em>
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-fuchsia-200 bg-fuchsia-50/50 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-fuchsia-950 text-xs">
              <span>🩺</span>
              <span>Dokter Hewan</span>
            </div>
            <p className="text-[11px] text-fuchsia-900 leading-relaxed">
              <strong>Pelayanan Medis:</strong> Pemeriksaan klinis SOAP, unggah berkas rontgen/lab, e-resep, dan observasi rawat inap. <em>Rekapitulasi total omset klinik disembunyikan.</em>
            </p>
          </div>
        </div>
      </div>

      {/* Staff User Management Table */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Daftar Akun Admin & Tenaga Medis</h3>
            <p className="text-xs text-neutral-500">
              Setiap staf dapat masuk ke sistem portal admin menggunakan username & kata sandi yang terdaftar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 font-semibold">
              {staffList.length} Akun Terdaftar
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-600 font-bold border-b border-neutral-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4">Staf / Dokter</th>
                <th className="p-4">Username Login</th>
                <th className="p-4">Peran / Hak Akses</th>
                <th className="p-4">Kata Sandi</th>
                <th className="p-4">Status Akun</th>
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {staffList.map((staf) => {
                const isCurrent = currentUser?.id === staf.id;

                return (
                  <tr key={staf.id} className="hover:bg-neutral-50/60 transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-base shrink-0">
                          {staf.avatar || '👨‍💼'}
                        </div>
                        <div>
                          <p className="font-bold text-neutral-900 text-xs">{staf.name}</p>
                          <p className="text-[10px] text-neutral-400 font-mono">ID: {staf.id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 font-mono font-semibold text-neutral-800">
                      <span className="bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                        {staf.username}
                      </span>
                    </td>

                    <td className="p-4">
                      {(() => {
                        const badgeInfo = getRoleBadgeInfo(staf.role);
                        const isMerangkap = staf.role !== 'Dokter Hewan' && staf.isPracticingDoctor;
                        return (
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeInfo.badgeClass}`}
                            >
                              <span>{badgeInfo.icon}</span>
                              <span>{badgeInfo.label}</span>
                            </span>
                            {isMerangkap && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200">
                                <span>🩺</span>
                                <span>Merangkap Dokter Praktek</span>
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-700">
                        <span className="bg-fuchsia-50/90 border border-fuchsia-200 text-fuchsia-950 font-bold px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-2xs select-all">
                          <KeyRound className="w-3.5 h-3.5 text-fuchsia-700 shrink-0" />
                          <span>{staf.password || 'admin'}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordModalStaff(staf);
                            setNewPasswordInput(staf.password || '');
                            setPasswordModalError('');
                          }}
                          className="text-[11px] text-fuchsia-700 hover:text-fuchsia-900 font-bold hover:underline cursor-pointer px-1 py-0.5"
                          title="Ubah kata sandi akun ini"
                        >
                          Ubah Sandi
                        </button>
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Sedang Aktif Login
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600 text-[10px] w-fit">
                            Siap Digunakan
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          Akun Terverifikasi
                        </span>
                      </div>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(staf)}
                          title="Edit akun, peran/hak akses, dan sandi"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-neutral-700 hover:text-fuchsia-800 bg-neutral-100 hover:bg-fuchsia-50 border border-neutral-200 hover:border-fuchsia-300 rounded-lg transition cursor-pointer shadow-2xs"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-fuchsia-700" />
                          <span>Edit</span>
                        </button>
                        {isCurrent ? (
                          <span className="text-[10px] text-neutral-400 italic px-1.5 py-1 bg-neutral-50 rounded-md border border-neutral-200">Akun Anda</span>
                        ) : (
                          <button
                            onClick={() => handleDeleteStaff(staf.id, staf.name)}
                            title="Hapus akun admin/staf ini"
                            className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Tambah Admin Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-neutral-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-fuchsia-100 text-fuchsia-700">
                  <UserPlus className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-neutral-900">Tambah Akun Admin / Staf Baru</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-4">
              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Nama Lengkap & Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: drh. Anita Wijayanti atau Dimas Pratama"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20"
                />
              </div>

              {/* Username Login */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Username Login <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: anita.vet atau admin.dimas"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20"
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  Huruf kecil tanpa spasi. Digunakan untuk masuk pada layar login.
                </p>
              </div>

              {/* Password Login */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Password Akun <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masukkan password untuk login staf"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20"
                />
              </div>

              {/* Peran / Hak Akses */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Peran / Posisi di Klinik <span className="text-rose-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => {
                    const selectedRole = e.target.value as StaffRole;
                    setRole(selectedRole);
                    if (selectedRole === 'Super Admin / Owner') {
                      setAvatar('👑');
                      setIsPracticingDoctor(false);
                    } else if (selectedRole === 'Dokter Hewan') {
                      setAvatar('👩‍⚕️');
                      setIsPracticingDoctor(true);
                    } else {
                      setAvatar('👨‍💼');
                      setIsPracticingDoctor(false);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
                >
                  <option value="Super Admin / Owner">👑 Super Admin / Owner (Akses Penuh & Rekap Omset)</option>
                  <option value="Staff Admin / Frontdesk">🛡️ Staff Admin / Frontdesk (Operasional Klinik)</option>
                  <option value="Dokter Hewan">🩺 Dokter Hewan (Pemeriksaan & SOAP)</option>
                </select>
              </div>

              {/* Status Praktek Dokter Pemeriksa */}
              <div className="p-3 bg-fuchsia-50/70 rounded-2xl border border-fuchsia-200/90 space-y-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-fuchsia-950">
                  <input
                    type="checkbox"
                    checked={role === 'Dokter Hewan' ? true : isPracticingDoctor}
                    disabled={role === 'Dokter Hewan'}
                    onChange={(e) => setIsPracticingDoctor(e.target.checked)}
                    className="w-4 h-4 rounded text-fuchsia-700 focus:ring-fuchsia-500 cursor-pointer"
                  />
                  <span>🩺 Merangkap Dokter Pemeriksa (Praktek Klinik)</span>
                </label>
                <p className="text-[11px] text-fuchsia-800 leading-snug pl-6">
                  {role === 'Dokter Hewan'
                    ? 'Otomatis terdaftar sebagai Dokter Pemeriksa di sistem.'
                    : 'Centang jika Owner / Admin ini juga praktek memeriksa pasien di klinik.'}
                </p>
              </div>

              {/* Pilihan Avatar */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Pilih Ikon Avatar
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {avatarOptions.map((opt) => (
                    <button
                      key={opt.emoji}
                      type="button"
                      onClick={() => setAvatar(opt.emoji)}
                      title={opt.label}
                      className={`p-2 rounded-xl text-lg border transition cursor-pointer ${
                        avatar === opt.emoji
                          ? 'border-fuchsia-500 bg-fuchsia-50 ring-2 ring-fuchsia-700/20'
                          : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {opt.emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tombol Aksi */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl text-neutral-600 hover:bg-neutral-100 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  Simpan Admin Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ubah Password Akun Staf */}
      {passwordModalStaff && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-neutral-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-100 text-amber-800">
                  <KeyRound className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Ubah Kata Sandi Akun</h3>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    {passwordModalStaff.name} (@{passwordModalStaff.username})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPasswordModalStaff(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {passwordModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {passwordModalError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPasswordModalError('');
                if (!newPasswordInput.trim()) {
                  setPasswordModalError('Password baru wajib diisi.');
                  return;
                }
                const res = updateStaffPassword(passwordModalStaff.id, newPasswordInput.trim());
                if (res.success) {
                  showToast(res.message, 'success');
                  setPasswordModalStaff(null);
                  setNewPasswordInput('');
                } else {
                  setPasswordModalError(res.message);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masukkan kata sandi baru (min. 3 karakter)"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 font-mono font-bold text-neutral-900 select-all"
                />
                <p className="text-[10px] text-neutral-500 mt-1">
                  Kata sandi ini langsung terlihat oleh Super Admin dan tersimpan ke sistem klinik.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalStaff(null)}
                  className="px-4 py-2.5 rounded-xl text-neutral-600 hover:bg-neutral-100 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  Simpan Kata Sandi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Akun, Peran / Hak Akses & Kata Sandi */}
      {editModalStaff && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-neutral-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-fuchsia-100 text-fuchsia-700">
                  <Edit3 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Edit Akun & Hak Akses</h3>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    ID: {editModalStaff.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditModalStaff(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{editFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditStaff} className="space-y-4">
              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Nama Lengkap & Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: drh. Anita Wijayanti atau Dimas Pratama"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20"
                />
              </div>

              {/* Username Login */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Username Login <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: anita.vet atau admin.dimas"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20"
                />
              </div>

              {/* Password Login */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Kata Sandi Akun <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Masukkan kata sandi akun"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 select-all"
                />
                <p className="text-[10px] text-neutral-500 mt-1">
                  Kata sandi tampil jelas dan dapat dilihat serta diubah langsung oleh Super Admin.
                </p>
              </div>

              {/* Peran / Hak Akses */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Peran & Tingkatan Hak Akses <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editRole}
                  onChange={(e) => {
                    const selectedRole = e.target.value as StaffRole;
                    setEditRole(selectedRole);
                    if (selectedRole === 'Super Admin / Owner') {
                      setEditAvatar('👑');
                    } else if (selectedRole === 'Dokter Hewan') {
                      setEditAvatar('👩‍⚕️');
                      setEditIsPracticingDoctor(true);
                    } else {
                      setEditAvatar('👨‍💼');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
                >
                  <option value="Super Admin / Owner">👑 Super Admin / Owner (Akses Penuh & Rekap Omset)</option>
                  <option value="Staff Admin / Frontdesk">🛡️ Staff Admin / Frontdesk (Operasional Klinik)</option>
                  <option value="Dokter Hewan">🩺 Dokter Hewan (Pemeriksaan & SOAP)</option>
                </select>
              </div>

              {/* Status Praktek Dokter Pemeriksa */}
              <div className="p-3 bg-fuchsia-50/70 rounded-2xl border border-fuchsia-200/90 space-y-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-fuchsia-950">
                  <input
                    type="checkbox"
                    checked={editRole === 'Dokter Hewan' ? true : editIsPracticingDoctor}
                    disabled={editRole === 'Dokter Hewan'}
                    onChange={(e) => setEditIsPracticingDoctor(e.target.checked)}
                    className="w-4 h-4 rounded text-fuchsia-700 focus:ring-fuchsia-500 cursor-pointer"
                  />
                  <span>🩺 Merangkap Dokter Pemeriksa (Praktek Klinik)</span>
                </label>
                <p className="text-[11px] text-fuchsia-800 leading-snug pl-6">
                  {editRole === 'Dokter Hewan'
                    ? 'Otomatis terdaftar sebagai Dokter Pemeriksa di sistem.'
                    : 'Centang jika Owner / Admin ini juga praktek memeriksa pasien di klinik.'}
                </p>
              </div>

              {/* Pilihan Avatar */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Pilih Ikon Avatar
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {avatarOptions.map((opt) => (
                    <button
                      key={opt.emoji}
                      type="button"
                      onClick={() => setEditAvatar(opt.emoji)}
                      title={opt.label}
                      className={`p-2 rounded-xl text-lg border transition cursor-pointer text-center ${
                        editAvatar === opt.emoji
                          ? 'border-fuchsia-500 bg-fuchsia-50 ring-2 ring-fuchsia-700/20'
                          : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {opt.emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tombol Aksi */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalStaff(null)}
                  className="px-4 py-2.5 rounded-xl text-neutral-600 hover:bg-neutral-100 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
