import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, AlertTriangle, X, Package } from 'lucide-react';
import { InventoryItem } from '../../types';

interface Props {
  value: string;
  onChange: (itemId: string) => void;
  inventory: InventoryItem[];
  className?: string;
  placeholder?: string;
}

export const SearchableMedicineSelect: React.FC<Props> = ({
  value,
  onChange,
  inventory,
  className = '',
  placeholder = 'Cari & Pilih Obat / BHP Medis...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => {
    return inventory.find((item) => item.id === value);
  }, [inventory, value]);

  // Filtered inventory based on search query
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter(
      (item) =>
        (item.name || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.batchNo || '').toLowerCase().includes(q)
    );
  }, [inventory, searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelect = (itemId: string) => {
    onChange(itemId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-neutral-300 hover:border-neutral-400 rounded-lg px-3 py-1.5 text-xs text-left text-neutral-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 font-medium flex items-center justify-between gap-2 shadow-2xs transition cursor-pointer"
      >
        <div className="flex-1 min-w-0 truncate">
          {selectedItem ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-neutral-900 truncate">{selectedItem.name}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md shrink-0 ${
                  selectedItem.stockQuantity <= selectedItem.minThreshold
                    ? 'bg-rose-100 text-rose-800 font-bold'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                Sisa: {selectedItem.stockQuantity} {selectedItem.unit}
              </span>
            </div>
          ) : (
            <span className="text-neutral-400 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span>{placeholder}</span>
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-fuchsia-600' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-neutral-200/90 shadow-xl z-50 overflow-hidden text-xs animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="p-2 border-b border-neutral-100 bg-neutral-50/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama obat, BHP, atau kategori..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-600 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-neutral-50 p-1">
            {filteredList.length === 0 ? (
              <div className="p-4 text-center text-neutral-400 text-xs space-y-1">
                <Package className="w-5 h-5 mx-auto text-neutral-300" />
                <p>Tidak ditemukan obat dengan nama "{searchQuery}"</p>
              </div>
            ) : (
              filteredList.map((item) => {
                const isSelected = item.id === value;
                const isCritical = item.stockQuantity <= item.minThreshold;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full p-2 rounded-lg text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-fuchsia-50 text-fuchsia-950 font-semibold'
                        : 'hover:bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-neutral-900 truncate">{item.name}</span>
                        {item.category && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 shrink-0">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                        Batch: {item.batchNo || '-'} {item.price ? `• Rp ${item.price.toLocaleString('id-ID')}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                          isCritical
                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isCritical ? '⚠️ ' : ''}Sisa: {item.stockQuantity} {item.unit}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-fuchsia-700 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
