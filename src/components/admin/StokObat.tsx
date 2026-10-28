import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  AlertTriangle,
  Plus,
  Search,
  CheckCircle2,
  RefreshCw,
  X,
  TrendingDown,
  Calendar,
  Layers,
  ArrowUpRight,
  Edit,
  Trash2,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { InventoryItem } from '../../types';
import { formatExpirationDate } from '../../utils/dateUtils';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const StokObat: React.FC<Props> = ({ navigate }) => {
  const {
    inventory,
    restockItem,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    soapRecords,
    syncStatus,
    triggerDataRefresh,
    dataVersion,
  } = useClinic();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Edit Item modal
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCat, setEditCat] = useState<InventoryItem['category']>('Antibiotik');
  const [editBatch, setEditBatch] = useState('');
  const [editExp, setEditExp] = useState('2027-06-30');
  const [editMin, setEditMin] = useState<number>(15);
  const [editQty, setEditQty] = useState<number>(50);
  const [addQty, setAddQty] = useState<number>(0);
  const [editUnit, setEditUnit] = useState('Tablet');
  const [editPrice, setEditPrice] = useState<number>(10000);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleOpenEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setEditName(item.name || '');
    setEditCat(item.category || 'Antibiotik');
    setEditBatch(item.batchNo || '');
    setEditExp(item.expireDate || '');
    setEditMin(item.minThreshold || 0);
    setEditQty(item.stockQuantity || 0);
    setAddQty(0);
    setEditUnit(item.unit || 'Tablet');
    setEditPrice(item.price || 0);
    setConfirmDeleteId(null);
  };

  const handleSaveEditItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editName.trim()) return;

    const finalStockQty = Math.max(0, Number(editQty) + Number(addQty));

    updateInventoryItem(editingItem.id, {
      name: editName.trim(),
      category: editCat,
      batchNo: editBatch.trim(),
      expireDate: editExp,
      minThreshold: Number(editMin),
      stockQuantity: finalStockQty,
      unit: editUnit.trim(),
      price: Number(editPrice),
      lastRestocked: Number(addQty) > 0 ? new Date().toISOString().split('T')[0] : editingItem.lastRestocked,
    });

    setEditingItem(null);
  };

  const handleDeleteItem = (itemId: string) => {
    deleteInventoryItem(itemId);
    setEditingItem(null);
  };

  // New Item modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<InventoryItem['category']>('Antibiotik');
  const [newBatch, setNewBatch] = useState('');
  const [newExp, setNewExp] = useState('2027-06-30');
  const [newMin, setNewMin] = useState<number>(15);
  const [newQty, setNewQty] = useState<number>(50);
  const [newUnit, setNewUnit] = useState('Tablet');
  const [newPrice, setNewPrice] = useState<number>(10000);

  const categories = [
    'all',
    'Antibiotik',
    'Analgesik & Antiradang',
    'Antiparasit',
    'Vaksin',
    'Cairan Infus',
    'Suplemen & Vitamin',
    'BHP Medis',
  ];

  const [sortBy, setSortBy] = useState<'lowest' | 'highest' | 'name' | 'exp'>('lowest');

  const filteredItems = useMemo(() => {
    const list = inventory.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = String(item.name || '').toLowerCase().includes(q) || String(item.batchNo || '').toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    // Urutkan mulai dari stok paling rendah/kritis ke terbanyak
    return [...list].sort((a, b) => {
      if (sortBy === 'lowest') {
        return a.stockQuantity - b.stockQuantity;
      }
      if (sortBy === 'highest') {
        return b.stockQuantity - a.stockQuantity;
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'exp') {
        return (a.expireDate || '').localeCompare(b.expireDate || '');
      }
      return a.stockQuantity - b.stockQuantity;
    });
  }, [inventory, searchQuery, selectedCategory, sortBy]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, sortBy]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage]);

  const lowStockItems = inventory.filter((i) => i.stockQuantity <= i.minThreshold);

  const handleAddNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    addInventoryItem({
      name: newName.trim(),
      category: newCat,
      batchNo: newBatch.trim() || `BAT-${Date.now().toString().slice(-6)}`,
      expireDate: newExp,
      minThreshold: Number(newMin),
      stockQuantity: Number(newQty),
      unit: newUnit,
      price: Number(newPrice),
    });

    setShowAddModal(false);
    setNewName('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-fuchsia-700" />
            <span>Matriks Kontrol Stok Obat & BHP Farmasi</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manajemen persediaan obat hewan, batch number, batas keamanan minimum, dan pemotongan otomatis dari E-Prescription.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition w-fit cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Item Farmasi</span>
          </button>
        </div>
      </div>

      {/* WARNING BANNER: CRITICAL LOW STOCK ALERT */}
      {lowStockItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-neutral-900">
                Peringatan Ambang Batas Minimum! ({lowStockItems.length} Item Menipis)
              </p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Item ditandai merah karena kuantitas berada di bawah ambang batas safety threshold. Segera lakukan restock.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lowStockItems.slice(0, 2).map((item) => (
              <button
                key={item.id}
                onClick={() => handleOpenEditModal(item)}
                className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] border border-rose-300 transition cursor-pointer"
              >
                Edit {item.name.split(' ')[0]} ✏️
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-neutral-200/80 text-xs shadow-xs">
        {/* Category pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-fuchsia-50 text-fuchsia-900 border border-fuchsia-200/80 font-bold shadow-xs'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
              }`}
            >
              {cat === 'all' ? 'Semua Kategori' : cat}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          {/* Sort selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-neutral-500 font-semibold whitespace-nowrap">Urutan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-800 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-fuchsia-500 cursor-pointer"
            >
              <option value="lowest">📉 Stok Terendah (Prioritas)</option>
              <option value="highest">📈 Stok Terbanyak</option>
              <option value="name">🔤 Nama A - Z</option>
              <option value="exp">⏳ Tanggal Kadaluarsa</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-60 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama obat atau no batch..."
              className="w-full px-3 py-1.5 pl-8 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 text-xs focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
            />
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2" />
          </div>
        </div>
      </div>

      {/* INVENTORY CONTROL MATRIX TABLE */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-700">
            <thead className="bg-neutral-50/80 text-neutral-500 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-200/80">
              <tr>
                <th className="px-4 py-3">Nama Item / Obat</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">No. Batch</th>
                <th className="px-4 py-3">Kadaluarsa (Exp)</th>
                <th className="px-4 py-3 text-center">Safety Threshold</th>
                <th className="px-4 py-3 text-center">Stok Kuantitas</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                    Tidak ditemukan item obat dalam kategori ini.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const isCritical = item.stockQuantity <= item.minThreshold;

                  return (
                    <tr
                      key={item.id}
                      className={`transition ${
                        isCritical
                          ? 'bg-rose-50/40 hover:bg-rose-50/70 border-l-2 border-l-rose-500'
                          : 'hover:bg-neutral-50/80'
                      }`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-900 text-sm">{item.name}</div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          Rp {item.price.toLocaleString('id-ID')} / {item.unit}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <span className="text-[11px] bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200 text-neutral-700">
                          {item.category}
                        </span>
                      </td>

                      {/* Batch */}
                      <td className="px-4 py-3 font-mono text-[11px] text-fuchsia-800 font-bold">
                        {item.batchNo}
                      </td>

                      {/* Expire Date */}
                      <td className="px-4 py-3 font-semibold text-neutral-600">
                        {formatExpirationDate(item.expireDate)}
                      </td>

                      {/* Minimum safety threshold */}
                      <td className="px-4 py-3 text-center font-mono text-xs text-neutral-500">
                        {item.minThreshold} {item.unit}
                      </td>

                      {/* Stock Quantity (HIGHLIGHTED IN RED IF CRITICAL) */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-mono font-black text-sm px-2.5 py-1 rounded-lg inline-block ${
                            isCritical
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs animate-pulse'
                              : 'bg-neutral-50 text-neutral-900 border border-neutral-200'
                          }`}
                        >
                          {item.stockQuantity} {item.unit}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isCritical
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200'
                          }`}
                        >
                          {isCritical ? '⚠️ Stok Kritis' : 'Aman'}
                        </span>
                      </td>

                      {/* Actions: Edit */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-extrabold border border-amber-200/90 transition shadow-2xs cursor-pointer"
                          title="Edit nama obat, harga, batch & tambah stok"
                        >
                          <Edit className="w-3.5 h-3.5 text-amber-700" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-neutral-200/80 text-xs">
          <span className="text-neutral-500 font-medium">
            Menampilkan halaman <strong className="text-neutral-900">{currentPage}</strong> dari <strong className="text-neutral-900">{totalPages}</strong> ({filteredItems.length} total item)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}



      {/* ADD NEW ITEM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-md w-full p-6 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <h3 className="font-bold text-base text-neutral-900">Tambah Item Farmasi Baru</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Nama Item</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Cefalexin 250mg"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Kategori</label>
                  <select
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  >
                    {categories.filter((c) => c !== 'all').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Satuan</label>
                  <input
                    type="text"
                    required
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="Tablet / Botol / Ampul"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">No. Batch</label>
                  <input
                    type="text"
                    value={newBatch}
                    onChange={(e) => setNewBatch(e.target.value)}
                    placeholder="Contoh: CFX-2026"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Kadaluarsa</label>
                  <input
                    type="date"
                    required
                    value={newExp}
                    onChange={(e) => setNewExp(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Stok Awal</label>
                  <input
                    type="number"
                    required
                    value={newQty}
                    onChange={(e) => setNewQty(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Safety Min.</label>
                  <input
                    type="number"
                    required
                    value={newMin}
                    onChange={(e) => setNewMin(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Harga (Rp)</label>
                  <input
                    type="number"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold shadow-xs"
                >
                  Simpan Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ITEM MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-lg w-full p-6 text-neutral-900 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">Edit Data Item / Obat</h3>
                  <p className="text-[11px] text-neutral-500">Ubah nama obat, harga, kategori, atau kuantitas stok</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditItem} className="space-y-4 text-xs">
              {/* Nama Item / Obat */}
              <div>
                <label className="block text-neutral-800 font-bold mb-1">
                  Nama Item / Obat <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama obat..."
                  className="w-full px-3.5 py-2 rounded-xl bg-neutral-50 border border-neutral-300 text-neutral-900 font-bold text-sm focus:bg-white focus:ring-2 focus:ring-fuchsia-500 shadow-2xs"
                />
              </div>

              {/* Kategori & Satuan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Kategori</label>
                  <select
                    value={editCat}
                    onChange={(e) => setEditCat(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  >
                    {categories.filter((c) => c !== 'all').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Satuan</label>
                  <input
                    type="text"
                    required
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    placeholder="Tablet / Botol / Ampul"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              {/* Batch & Kadaluarsa */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">No. Batch</label>
                  <input
                    type="text"
                    value={editBatch}
                    onChange={(e) => setEditBatch(e.target.value)}
                    placeholder="Contoh: BAT-12345"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Kadaluarsa (EXP)</label>
                  <input
                    type="date"
                    required
                    value={editExp}
                    onChange={(e) => setEditExp(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              {/* Safety Min & Harga Jual */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Batas Min. Safety</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editMin}
                    onChange={(e) => setEditMin(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Harga Satuan (Rp)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono font-bold focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              {/* STOK CONTROL MATRIX (Ubah Stok Saat Ini OR Restock Tambah Stok) */}
              <div className="p-3.5 rounded-2xl bg-fuchsia-50/70 border border-fuchsia-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-fuchsia-950 text-xs flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-fuchsia-700" />
                    Manajemen &amp; Penambahan Stok Obat
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-fuchsia-200 text-fuchsia-900">
                    Total Nanti: {Math.max(0, Number(editQty) + Number(addQty))} {editUnit}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-700 font-semibold mb-1">Stok Saat Ini</label>
                    <input
                      type="number"
                      min="0"
                      value={editQty}
                      onChange={(e) => setEditQty(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-neutral-300 text-neutral-900 font-mono font-bold focus:ring-2 focus:ring-fuchsia-500"
                    />
                  </div>
                  <div>
                    <label className="block text-fuchsia-900 font-bold mb-1">+ Tambah Stok Baru (Restock)</label>
                    <input
                      type="number"
                      min="0"
                      value={addQty}
                      onChange={(e) => setAddQty(parseInt(e.target.value, 10) || 0)}
                      placeholder="+0"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-fuchsia-300 text-fuchsia-900 font-mono font-extrabold focus:ring-2 focus:ring-fuchsia-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                {confirmDeleteId === editingItem.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-rose-700 font-bold">Yakin hapus obat ini?</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(editingItem.id)}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px]"
                    >
                      Ya, Hapus
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1 bg-neutral-200 text-neutral-700 rounded-lg text-[11px]"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(editingItem.id)}
                    className="px-3 py-1.5 rounded-xl text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Item</span>
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 font-bold hover:bg-neutral-50 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-extrabold shadow-md shadow-fuchsia-700/20 transition cursor-pointer"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
