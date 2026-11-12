import React, { useState, useEffect } from 'react';
import {
  StockStatusData,
  INITIAL_STOCK_STATUS_11_10_2026,
  OilCategory,
  HoneyCategory,
} from '../utils/stockStatusData';
import {
  Printer,
  Search,
  Edit3,
  Save,
  RotateCcw,
  CheckCircle2,
  PackageCheck,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import { GLOBAL_FUTURA_LOGO_PATH } from '../utils/constants';
import { SoundEngine } from '../utils/audio';

interface OfficialStockStatusSheetProps {
  onNotify?: (msg: string) => void;
}

export const OfficialStockStatusSheet: React.FC<OfficialStockStatusSheetProps> = ({
  onNotify,
}) => {
  const [data, setData] = useState<StockStatusData>(() => {
    try {
      const saved = localStorage.getItem('gfi_stock_status_11_10_2026');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_STOCK_STATUS_11_10_2026;
  });

  const [activePage, setActivePage] = useState<'all' | '1' | '2' | '3'>('all');
  const [isEditable, setIsEditable] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveData = () => {
    try {
      localStorage.setItem('gfi_stock_status_11_10_2026', JSON.stringify(data));
      SoundEngine.play('success');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      onNotify?.('✅ Stock Status sheet updated and saved to storage.');
    } catch {
      onNotify?.('Error saving stock status.');
    }
  };

  const handleResetToDefault = () => {
    if (confirm('Reset Stock Status to original 11/10/2026 PDF values?')) {
      setData(INITIAL_STOCK_STATUS_11_10_2026);
      localStorage.removeItem('gfi_stock_status_11_10_2026');
      SoundEngine.play('pop');
      onNotify?.('Stock Status reset to authentic PDF records.');
    }
  };

  const handleUpdateOilItem = (
    column: 'left' | 'right',
    catIdx: number,
    itemIdx: number,
    patch: { pallets?: number; cases?: number }
  ) => {
    setData(prev => {
      const colKey = column === 'left' ? 'page1Left' : 'page1Right';
      const newCols = [...prev[colKey]];
      const newCat = { ...newCols[catIdx] };
      const newItems = [...newCat.items];
      newItems[itemIdx] = { ...newItems[itemIdx], ...patch };
      newCat.items = newItems;
      newCols[catIdx] = newCat;
      return { ...prev, [colKey]: newCols };
    });
  };

  const handleUpdateHoneyItem = (
    catIdx: number,
    itemIdx: number,
    patch: { pallets?: number; cases?: number; remarks?: string }
  ) => {
    setData(prev => {
      const newHoney = [...prev.page2Honey];
      const newCat = { ...newHoney[catIdx] };
      const newItems = [...newCat.items];
      newItems[itemIdx] = { ...newItems[itemIdx], ...patch };
      newCat.items = newItems;
      newHoney[catIdx] = newCat;
      return { ...prev, page2Honey: newHoney };
    });
  };

  const handleAddOilItem = (column: 'left' | 'right', catIdx: number) => {
    setData(prev => {
      const colKey = column === 'left' ? 'page1Left' : 'page1Right';
      const newCols = [...prev[colKey]];
      const newCat = { ...newCols[catIdx] };
      const newItem = {
        id: `oil-${Date.now()}`,
        name: `${newCat.items.length + 1}) New Pack Size`,
        packSize: '1 Ltr x 12',
        palletsPerUnit: 60,
        pallets: 0,
        cases: 0,
      };
      newCat.items = [...newCat.items, newItem];
      newCols[catIdx] = newCat;
      return { ...prev, [colKey]: newCols };
    });
    SoundEngine.play('pop');
  };

  const handleDeleteOilItem = (column: 'left' | 'right', catIdx: number, itemIdx: number) => {
    setData(prev => {
      const colKey = column === 'left' ? 'page1Left' : 'page1Right';
      const newCols = [...prev[colKey]];
      const newCat = { ...newCols[catIdx] };
      newCat.items = newCat.items.filter((_, i) => i !== itemIdx);
      newCols[catIdx] = newCat;
      return { ...prev, [colKey]: newCols };
    });
    SoundEngine.play('thud');
  };

  const handleAddHoneyItem = (catIdx: number) => {
    setData(prev => {
      const newHoney = [...prev.page2Honey];
      const newCat = { ...newHoney[catIdx] };
      const newItem = {
        id: `h-item-${Date.now()}`,
        srNo: newCat.items.length + 1,
        packDescription: 'NEW PACKING DESCRIPTION',
        unitsPerPallet: 100,
        pallets: 0,
        cases: 0,
        brand: 'AL SIHA',
        expiryDate: '12/2028',
        remarks: 'New Lot',
      };
      newCat.items = [...newCat.items, newItem];
      newHoney[catIdx] = newCat;
      return { ...prev, page2Honey: newHoney };
    });
    SoundEngine.play('pop');
  };

  const handleDeleteHoneyItem = (catIdx: number, itemIdx: number) => {
    setData(prev => {
      const newHoney = [...prev.page2Honey];
      const newCat = { ...newHoney[catIdx] };
      newCat.items = newCat.items.filter((_, i) => i !== itemIdx);
      newHoney[catIdx] = newCat;
      return { ...prev, page2Honey: newHoney };
    });
    SoundEngine.play('thud');
  };

  const calculateTotalCasesForOil = (palletsPerUnit: number, pallets: number, cases: number) => {
    return palletsPerUnit * (pallets || 0) + (cases || 0);
  };

  return (
    <div className="space-y-4 font-sans select-text">
      {/* Top Toolbar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
            <PackageCheck className="w-4 h-4" />
            <span>Official Warehouse Stock Format</span>
          </div>

          {/* Page navigation */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActivePage('all')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                activePage === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All 3 Pages
            </button>
            <button
              type="button"
              onClick={() => setActivePage('1')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                activePage === '1'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Page 1: Edible Oils
            </button>
            <button
              type="button"
              onClick={() => setActivePage('2')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                activePage === '2'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Page 2: Honey Stock
            </button>
            <button
              type="button"
              onClick={() => setActivePage('3')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                activePage === '3'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Page 3: Sauces & Rice
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter item or SKU..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-44 focus:w-60 transition-all focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Edit mode toggle */}
          <button
            type="button"
            onClick={() => {
              setIsEditable(!isEditable);
              SoundEngine.play('pop');
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              isEditable
                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditable ? 'Editing Mode Active' : 'Edit Pallets/Cases'}</span>
          </button>

          {isEditable && (
            <button
              type="button"
              onClick={handleSaveData}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savedSuccess ? 'Saved!' : 'Save Changes'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* OFFICIAL STOCK STATUS — NATIVE APP STYLE (not PDF replica) */}
      <div className="space-y-5 text-xs">

        {/* ================= PAGE 1: EDIBLE OILS ================= */}
        {(activePage === 'all' || activePage === '1') && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-black">1</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">Edible Oils — Stock on Hand</h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Up to Invoice {data.invoiceCutoff} • as on {data.asOnDate}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {(['left', 'right'] as const).map(col => {
                const colKey = col === 'left' ? 'page1Left' : 'page1Right';
                const cols = data[colKey];
                return (
                  <div key={col} className="space-y-3">
                    {cols.map((cat, catIdx) => {
                      const visibleItems = cat.items.filter(it => !searchTerm || it.name.toLowerCase().includes(searchTerm.toLowerCase()));
                      if (!visibleItems.length) return null;
                      return (
                        <div key={cat.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                            <span className="text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">{cat.title}</span>
                            {isEditable && (
                              <button
                                type="button"
                                onClick={() => handleAddOilItem(col, catIdx)}
                                className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" /> Add Row
                              </button>
                            )}
                          </div>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                            {cat.items.map((it, itemIdx) => {
                              const isMatch = !searchTerm || it.name.toLowerCase().includes(searchTerm.toLowerCase());
                              if (!isMatch) return null;
                              return (
                                <div key={it.id} className={`flex items-center justify-between gap-2 px-3 py-1.5 ${it.isPlain ? 'text-slate-500 dark:text-slate-400 italic' : 'text-slate-800 dark:text-slate-200'}`}>
                                  <span className="font-semibold leading-snug">{it.name}</span>
                                  {isEditable ? (
                                    <div className="flex items-center gap-1 shrink-0 font-mono text-[10.5px]">
                                      <span className="text-slate-500 dark:text-slate-400">{it.palletsPerUnit}×</span>
                                      <input
                                        type="number" min={0} value={it.pallets}
                                        onChange={e => handleUpdateOilItem(col, catIdx, itemIdx, { pallets: parseInt(e.target.value, 10) || 0 })}
                                        className="w-12 px-1 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-center font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      />
                                      <input
                                        type="number" min={0} value={it.cases}
                                        onChange={e => handleUpdateOilItem(col, catIdx, itemIdx, { cases: parseInt(e.target.value, 10) || 0 })}
                                        className="w-12 px-1 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-center font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      />
                                      <button type="button" onClick={() => handleDeleteOilItem(col, catIdx, itemIdx)} className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer" title="Delete row">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="font-mono tabular-nums text-[10.5px] font-bold text-slate-900 dark:text-slate-100 shrink-0">
                                      {it.palletsPerUnit} × {it.pallets} Pallets &amp; {it.cases} Cases
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ================= PAGE 2: HONEY STOCK ================= */}
        {(activePage === 'all' || activePage === '2') && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-black">2</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">Honey Stock — Brands, Expiry &amp; Remarks</h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Up to Invoice {data.invoiceCutoff} • as on {data.asOnDate}
              </span>
            </div>

            <div className="p-4 space-y-3">
              {data.page2Honey.map((cat, catIdx) => {
                const visibleItems = cat.items.filter(it =>
                  !searchTerm ||
                  it.packDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  it.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (it.remarks || '').toLowerCase().includes(searchTerm.toLowerCase())
                );
                if (!visibleItems.length) return null;
                return (
                  <div key={cat.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                      {cat.title}
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {cat.items.map((it, itemIdx) => {
                        const isMatch =
                          !searchTerm ||
                          it.packDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          it.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (it.remarks || '').toLowerCase().includes(searchTerm.toLowerCase());
                        if (!isMatch) return null;
                        return (
                          <div key={it.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <div className="col-span-12 sm:col-span-5 flex items-start gap-2 text-slate-800 dark:text-slate-200">
                              <span className="font-black text-slate-400 dark:text-slate-500 w-4 shrink-0">{it.srNo}</span>
                              <span className="font-semibold leading-snug">{it.packDescription}</span>
                            </div>
                            <div className="col-span-12 sm:col-span-4 font-mono tabular-nums text-[10.5px] font-bold text-slate-900 dark:text-slate-100">
                              {isEditable ? (
                                <div className="flex items-center gap-1">
                                  {it.unitsPerPallet ? <span className="text-slate-500 dark:text-slate-400">{it.unitsPerPallet}×</span> : null}
                                  {it.pallets !== undefined && (
                                    <input
                                      type="number" min={0} value={it.pallets}
                                      onChange={e => handleUpdateHoneyItem(catIdx, itemIdx, { pallets: parseInt(e.target.value, 10) || 0 })}
                                      className="w-10 px-1 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />
                                  )}
                                  <input
                                    type="number" min={0} value={it.cases}
                                    onChange={e => handleUpdateHoneyItem(catIdx, itemIdx, { cases: parseInt(e.target.value, 10) || 0 })}
                                    className="w-10 px-1 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                              ) : (
                                <span>
                                  {it.unitsPerPallet ? `${it.unitsPerPallet} × ` : ''}
                                  {it.pallets !== undefined ? `${it.pallets} Pallets & ` : '& '}
                                  {it.cases} Cases
                                </span>
                              )}
                            </div>
                            <div className="col-span-4 sm:col-span-1">
                              <span className="inline-block px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9.5px] font-bold text-slate-700 dark:text-slate-300">{it.brand}</span>
                            </div>
                            <div className="col-span-4 sm:col-span-1 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">{it.expiryDate || '—'}</div>
                            <div className="col-span-4 sm:col-span-1 text-right">
                              {it.remarks ? (
                                <span className="inline-block px-1.5 py-0.5 rounded-md bg-rose-500/10 text-[9.5px] font-bold text-rose-600 dark:text-rose-400">{it.remarks}</span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ================= PAGE 3: SAUCES & PARTNER WAREHOUSE ================= */}
        {(activePage === 'all' || activePage === '3') && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-black">3</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">Sauces, Condiments &amp; Partner Warehouse</h2>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Mayonnaise & Ketchup stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">Vital Mayonnaise Gallon 3.78 Ltr</div>
                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">3.78 LTR × 4 pcs per carton</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">34</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cases</div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">Vital Tomato Ketchup 5 KG</div>
                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">5 KG × 4 pcs per carton</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">89</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cases</div>
                  </div>
                </div>
              </div>

              {/* Partner warehouse tables */}
              {[
                { title: 'Other Stock — Akal Supermarket', left: data.akalSupermarketLeft, right: data.akalSupermarketRight },
                { title: 'Other Stock — Central Food Market', left: null, right: data.centralFoodMarket },
              ].map(section => (
                <div key={section.title} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    {section.title}
                  </div>
                  <div className={`grid grid-cols-1 ${section.left ? 'md:grid-cols-2' : ''} divide-y md:divide-y-0 ${section.left ? 'md:divide-x' : ''} divide-slate-100 dark:divide-slate-800/70`}>
                    {section.left && (
                      <div className="p-2">
                        {section.left.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-slate-800 dark:text-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-400 dark:text-slate-500 w-4">{item.srNo}</span>
                              <span className="font-semibold">{item.name}</span>
                            </div>
                            <span className="font-mono tabular-nums text-[10.5px] font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{item.quantity} {item.unitType}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="p-2">
                      {section.right.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-slate-800 dark:text-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-400 dark:text-slate-500 w-4">{item.srNo}</span>
                            <span className="font-semibold">{item.name}</span>
                          </div>
                          <span className="font-mono tabular-nums text-[10.5px] font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{item.quantity} {item.unitType}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="pt-1 pb-2 px-1 text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap justify-between items-center gap-1">
          <span>Global Futura Inc. • Warehouse Stock Verification • {data.invoiceCutoff}</span>
          <span>Official Record as of {data.asOnDate}</span>
        </div>
      </div>
    </div>
  );
};
