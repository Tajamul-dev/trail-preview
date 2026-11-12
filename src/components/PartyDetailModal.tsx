import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Download,
  FileSpreadsheet,
  Building2,
  Package,
  Boxes,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ChevronRight,
  ExternalLink,
  Plus,
  UserCog,
  Save,
  Pencil,
} from 'lucide-react';
import { OrderRecord, DispatchRecord, MasterSheetItem, PartyBomRequirement, CustomerAccount, PendingDeliveryOrder } from '../types';
import { SoundEngine } from '../utils/audio';
import { idbSet, migrateFromLS } from '../utils/idbStore';
import { exportToXLSX, exportToCSV } from '../utils/productionData';

const PARTY_ACCOUNT_STORAGE_KEY = 'gfi_customer_accounts_v1';

// Editable client-detail fields shown in the Party Details tab
const PARTY_DETAIL_FIELDS: Array<{ key: keyof CustomerAccount; label: string; wide?: boolean }> = [
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'cbm', label: 'CBM' },
  { key: 'contractNo', label: 'Contract #' },
  { key: 'orderNo', label: 'Order #' },
  { key: 'cartonQty', label: 'Carton Qty' },
  { key: 'otherQty', label: 'Other Qty' },
  { key: 'address', label: 'Party Address', wide: true },
  { key: 'portOfLoading', label: 'Port of Loading' },
  { key: 'portOfDischarge', label: 'Port of Discharge' },
  { key: 'finalDestination', label: 'Final Destination' },
  { key: 'salesPack', label: 'Sales Pack' },
  { key: 'items', label: 'Items', wide: true },
  { key: 'pendingCharges', label: 'Pending Charges', wide: true },
];

function blankAccount(partyCode: string, partyName: string): CustomerAccount {
  return {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    partyName,
    partyCode,
    cbm: '',
    contractNo: '',
    orderNo: '',
    cartonQty: '',
    otherQty: '',
    address: '',
    contactPerson: '',
    email: '',
    phone: '',
    portOfLoading: '',
    portOfDischarge: '',
    finalDestination: '',
    salesPack: '',
    items: '',
    pendingCharges: '',
    updatedAt: new Date().toISOString(),
  };
}

// Fuzzy party-name matcher: links dossier ↔ deliveries/accounts even when names differ
// slightly (abbreviations, extra words). Matches on shared significant words (>=4 chars).
function nameMatches(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const wx = new Set(x.split(/[^a-z0-9]+/).filter(w => w.length >= 4));
  const wy = new Set(y.split(/[^a-z0-9]+/).filter(w => w.length >= 4));
  if (!wx.size || !wy.size) return false;
  for (const w of wx) if (wy.has(w)) return true;
  return false;
}

async function loadPartyAccount(partyCode: string, partyName: string): Promise<CustomerAccount> {
  const saved = (await migrateFromLS<CustomerAccount[]>(PARTY_ACCOUNT_STORAGE_KEY)) || [];
  const found = saved.find(
    a =>
      (a.partyCode && a.partyCode.trim().toLowerCase() === partyCode.trim().toLowerCase()) ||
      nameMatches(a.partyName, partyName)
  );
  return found || blankAccount(partyCode, partyName);
}

async function savePartyAccount(account: CustomerAccount) {
  const saved = (await migrateFromLS<CustomerAccount[]>(PARTY_ACCOUNT_STORAGE_KEY)) || [];
  const idx = saved.findIndex(
    a => a.partyCode.trim().toLowerCase() === account.partyCode.trim().toLowerCase()
  );
  account.updatedAt = new Date().toISOString();
  if (idx >= 0) saved[idx] = { ...saved[idx], ...account, id: saved[idx].id };
  else saved.push(account);
  await idbSet(PARTY_ACCOUNT_STORAGE_KEY, saved);
  window.dispatchEvent(new CustomEvent('gfi-customer-accounts-updated'));
}

interface PartyDetailModalProps {
  isOpen: boolean;
  partyCode: string;
  partyName: string;
  allOrders: OrderRecord[];
  allDispatches: DispatchRecord[];
  allMasterItems: MasterSheetItem[];
  onClose: () => void;
  onUpdateOrder?: (order: OrderRecord) => void;
}

export const PartyDetailModal: React.FC<PartyDetailModalProps> = ({
  isOpen,
  partyCode,
  partyName,
  allOrders,
  allDispatches,
  allMasterItems,
  onClose,
  onUpdateOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'packaging' | 'dispatches' | 'master' | 'details' | 'deliveries'>(
    'orders'
  );

  // Editable client details (shared store with the Customer Accounts section on the main page)
  const [accountDraft, setAccountDraft] = useState<CustomerAccount>(() =>
    blankAccount(partyCode, partyName)
  );
  const [detailsSaved, setDetailsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPartyAccount(partyCode, partyName).then(acc => setAccountDraft(acc));
      setDetailsSaved(false);
    }
  }, [isOpen, partyCode, partyName]);

  // Live update: if client details are edited elsewhere (Customer Accounts section),
  // refresh the draft shown here — without clobbering unsaved local edits.
  useEffect(() => {
    const handler = () => {
      if (!isOpen || activeTab !== 'details') return;
      loadPartyAccount(partyCode, partyName).then(acc => {
        setAccountDraft(prev =>
          JSON.stringify(prev) === JSON.stringify(acc) ? prev : acc
        );
      });
    };
    window.addEventListener('gfi-customer-accounts-updated', handler);
    return () => window.removeEventListener('gfi-customer-accounts-updated', handler);
  }, [isOpen, partyCode, partyName, activeTab]);

  const handleSaveDetails = async () => {
    await savePartyAccount(accountDraft);
    setDetailsSaved(true);
    SoundEngine.play('success');
    setTimeout(() => setDetailsSaved(false), 2500);
  };

  // Pending Deliveries for this party — live from the Pending Deliveries store


  const [partyDeliveries, setPartyDeliveries] = useState<PendingDeliveryOrder[]>([]);

  const loadPartyDeliveries = async () => {
    const all = (await migrateFromLS<PendingDeliveryOrder[]>('gfi_pending_deliveries_v1')) || [];
    setPartyDeliveries(all.filter(o => nameMatches(o.customerName, partyName)));
  };

  useEffect(() => {
    if (isOpen) loadPartyDeliveries();
    // Live update: if Pending Deliveries is updated elsewhere while this dossier is open,
    // refresh the deliveries shown here automatically.
    const handler = () => {
      if (isOpen) loadPartyDeliveries();
    };
    window.addEventListener('gfi-pending-deliveries-updated', handler);
    return () => window.removeEventListener('gfi-pending-deliveries-updated', handler);
  }, [isOpen, partyName]);

  const handleOpenDeliveriesTab = () => {
    loadPartyDeliveries();
    setActiveTab('deliveries');
  };

  const totalPendingItems = partyDeliveries.reduce((a, o) => a + o.items.length, 0);

  // Filter orders for this specific party
  const partyOrders = useMemo(() => {
    return allOrders.filter(
      o =>
        o.partyCode.toLowerCase() === partyCode.toLowerCase() ||
        o.partyName.toLowerCase().includes(partyName.toLowerCase()) ||
        partyName.toLowerCase().includes(o.partyName.toLowerCase())
    );
  }, [allOrders, partyCode, partyName]);

  // Filter dispatches for this party (matched by product name/code or location)
  const partyDispatches = useMemo(() => {
    const skuCodes = new Set(partyOrders.map(o => o.skuCode.toLowerCase()));
    const skuNames = partyOrders.map(o => o.skuName.toLowerCase());

    return allDispatches.filter(d => {
      const matchCode = skuCodes.has(d.productCode.toLowerCase());
      const matchName = skuNames.some(
        name =>
          name.includes(d.productName.toLowerCase()) || d.productName.toLowerCase().includes(name)
      );
      return matchCode || matchName;
    });
  }, [allDispatches, partyOrders]);

  // Filter master sheet items for this party
  const partyMasterItems = useMemo(() => {
    return allMasterItems.filter(
      m =>
        m.partyCode.toLowerCase() === partyCode.toLowerCase() ||
        m.partyName.toLowerCase().includes(partyName.toLowerCase()) ||
        partyName.toLowerCase().includes(m.partyName.toLowerCase())
    );
  }, [allMasterItems, partyCode, partyName]);

  // Aggregate Packaging Material Requirements (BOM) across all orders for this party
  const consolidatedBOM = useMemo(() => {
    const map = new Map<
      string,
      {
        type: string;
        code: string;
        desc: string;
        uom: string;
        totalRequired: number;
        availableQty: number;
        balanceStk: number;
        shortExcess: number;
        skus: Set<string>;
      }
    >();

    partyOrders.forEach(order => {
      order.bom.forEach(b => {
        const key = `${b.type}-${b.code}`;
        const existing = map.get(key);
        if (existing) {
          existing.totalRequired += b.requiredQty;
          existing.shortExcess += b.shortExcess;
          existing.skus.add(order.skuCode);
        } else {
          map.set(key, {
            type: b.type,
            code: b.code,
            desc: b.desc,
            uom: b.uom,
            totalRequired: b.requiredQty,
            availableQty: b.availableQty,
            balanceStk: b.balanceStk,
            shortExcess: b.shortExcess,
            skus: new Set([order.skuCode]),
          });
        }
      });
    });

    return Array.from(map.values()).map(item => ({
      ...item,
      skuList: Array.from(item.skus).join(', '),
      isDeficit: item.shortExcess < 0,
    }));
  }, [partyOrders]);

  // Party level statistics
  const stats = useMemo(() => {
    const totalPlanCs = partyOrders.reduce((acc, o) => acc + o.planCs, 0);
    const totalFillingCs = partyOrders.reduce((acc, o) => acc + o.fillingCs, 0);
    const totalDispatchedCs = partyOrders.reduce((acc, o) => acc + o.dispatchedCs, 0);
    const totalBalanceCs = partyOrders.reduce((acc, o) => acc + o.balanceCs, 0);
    const totalKg = partyOrders.reduce((acc, o) => acc + o.planKg, 0);
    const totalPallets = partyOrders.reduce((acc, o) => acc + o.planPallets, 0);
    const deficitCount = consolidatedBOM.filter(b => b.isDeficit).length;

    return {
      orderCount: partyOrders.length,
      totalPlanCs,
      totalFillingCs,
      totalDispatchedCs,
      totalBalanceCs,
      totalKg,
      totalMt: Math.round((totalKg / 1000) * 100) / 100,
      totalPallets,
      deficitCount,
      fillingPct: totalPlanCs > 0 ? Math.round((totalFillingCs / totalPlanCs) * 100) : 0,
      dispatchPct: totalPlanCs > 0 ? Math.round((totalDispatchedCs / totalPlanCs) * 100) : 0,
    };
  }, [partyOrders, consolidatedBOM]);

  if (!isOpen) return null;

  // Export handlers
  const handleExportXLS = () => {
    SoundEngine.play('export');
    const ordersData = partyOrders.map(o => ({
      'Party Code': o.partyCode,
      'Party Name': o.partyName,
      'PO Number': o.poNo,
      'PO Date': o.poDate,
      'Expiry Date': o.poExp,
      'SKU Code': o.skuCode,
      'Product Name': o.skuName,
      'Pack Size': `${o.packSize}${o.packUnit}`,
      'Qty/Cs': o.qtyPerCs,
      'Plan Cs': o.planCs,
      'Plan KG': o.planKg,
      Pallets: o.planPallets,
      'Filling Cs': o.fillingCs,
      'Dispatched Cs': o.dispatchedCs,
      'Balance Cs': o.balanceCs,
      Status: o.status,
    }));

    const bomData = consolidatedBOM.map(b => ({
      Category: b.type.toUpperCase(),
      'PM Code': b.code,
      Description: b.desc,
      'Used In SKUs': b.skuList,
      'Total Required': b.totalRequired,
      'Available In Stock': b.availableQty,
      'Shortfall / Left to Buy': b.isDeficit ? Math.abs(b.shortExcess) : 0,
      'Surplus Stock': !b.isDeficit ? b.shortExcess : 0,
      UOM: b.uom,
      Status: b.isDeficit ? 'DEFICIT - ACTION REQUIRED' : 'SUFFICIENT',
    }));

    const wb = XLSX.utils.book_new();
    const wsOrders = XLSX.utils.json_to_sheet(ordersData);
    const wsBOM = XLSX.utils.json_to_sheet(bomData);

    XLSX.utils.book_append_sheet(wb, wsOrders, 'All Orders');
    XLSX.utils.book_append_sheet(wb, wsBOM, 'Packaging Materials (BOM)');

    XLSX.writeFile(wb, `${partyCode}_${partyName.replace(/[^a-zA-Z0-9]/g, '_')}_Dossier.xlsx`);
  };

  const handleExportCSV = () => {
    SoundEngine.play('export');
    const flatData = partyOrders.map(o => ({
      Party: `${partyCode} - ${partyName}`,
      PO: o.poNo,
      SKU: o.skuCode,
      Name: o.skuName,
      Pack: o.packSize,
      PlanCs: o.planCs,
      PlanKg: o.planKg,
      FilledCs: o.fillingCs,
      DispatchedCs: o.dispatchedCs,
      BalanceCs: o.balanceCs,
      Status: o.status,
    }));
    exportToCSV(`${partyCode}_Orders_Summary`, flatData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl shadow-2xl max-w-6xl w-full max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 font-black text-xl flex items-center justify-center shadow-md">
              {partyCode}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">{partyName}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-900 uppercase">
                  Party 360° Dossier
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                Party Code: <span className="font-bold text-amber-300">{partyCode}</span> • Total Orders: {stats.orderCount} • Net Planned: {stats.totalPlanCs.toLocaleString()} Cases ({stats.totalMt} MT)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportXLS}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs active:scale-95"
              title="Download full Party Dossier as Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export XLS</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-all active:scale-95"
              title="Export as CSV"
            >
              <Download className="w-4 h-4" />
              <span>CSV</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 p-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-xs">
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase text-slate-400">Total Planned</span>
            <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
              {stats.totalPlanCs.toLocaleString()} <span className="text-xs font-normal">Cs</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase text-amber-600">Filling Finished</span>
            <div className="text-base font-black font-mono text-amber-600 mt-0.5">
              {stats.totalFillingCs.toLocaleString()} <span className="text-xs font-normal">Cs</span>
            </div>
            <span className="text-[10px] text-slate-400">{stats.fillingPct}% Filled</span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase text-blue-600">Dispatched Cs</span>
            <div className="text-base font-black font-mono text-blue-600 mt-0.5">
              {stats.totalDispatchedCs.toLocaleString()} <span className="text-xs font-normal">Cs</span>
            </div>
            <span className="text-[10px] text-slate-400">{stats.dispatchPct}% Left Port</span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase text-rose-600">Balance Pending</span>
            <div className="text-base font-black font-mono text-rose-600 mt-0.5">
              {stats.totalBalanceCs.toLocaleString()} <span className="text-xs font-normal">Cs</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase text-purple-600">Pallets Required</span>
            <div className="text-base font-black font-mono text-purple-600 mt-0.5">
              {stats.totalPallets} <span className="text-xs font-normal">Pallets</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase text-slate-500">Packaging Deficit</span>
            <div
              className={`text-base font-black font-mono mt-0.5 ${
                stats.deficitCount > 0 ? 'text-rose-600 animate-pulse' : 'text-emerald-600'
              }`}
            >
              {stats.deficitCount > 0 ? `${stats.deficitCount} Short Items` : '0 (Sufficient)'}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>1. All Orders Ordered ({partyOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('packaging')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'packaging'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>2. Packaging Materials Needed & Deficit ({consolidatedBOM.length})</span>
            {stats.deficitCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black">
                {stats.deficitCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('dispatches')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'dispatches'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>3. Dispatches & Container Stuffing ({partyDispatches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('master')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'master'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>4. Master SKU Catalog ({partyMasterItems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('details')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'details'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <UserCog className="w-3.5 h-3.5" />
            <span>5. Party Details — Update Client Info</span>
          </button>

          <button
            onClick={handleOpenDeliveriesTab}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'deliveries'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>6. Pending Deliveries ({totalPendingItems})</span>
          </button>
        </div>

        {/* Modal Body: Column Structure Views */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: ALL ORDERS ORDERED BY THIS PARTY (COLUMN STRUCTURE) */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Comprehensive Order Register for {partyName}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Showing all purchase orders, planned quantities, filling milestones, and remaining balances in column structure.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-[10.5px] uppercase font-black text-slate-700 dark:text-slate-300 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-700">P.O. No</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700">PO Date</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700">Expiry Date</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 font-mono">SKU Code</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-700 min-w-[200px]">Product / SKU Name</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center">Pack Size</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center">Qty/Cs</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right bg-amber-50/70 dark:bg-amber-950/20 font-bold">Plan Cs</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right bg-amber-50/70 dark:bg-amber-950/20">Plan KG</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center">Pallets</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right text-emerald-700 dark:text-emerald-400 font-bold">Filling Cs</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right text-blue-700 dark:text-blue-400 font-bold">Dispatched</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right text-rose-700 dark:text-rose-400 font-bold">Balance</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {partyOrders.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="py-10 text-center text-slate-400 font-medium">
                            No open production orders found for this party.
                          </td>
                        </tr>
                      ) : (
                        partyOrders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {order.poNo}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                              {order.poDate}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                              {order.poExp}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                              {order.skuCode}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                              {order.skuName}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">
                              {order.packSize}{order.packUnit}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono text-slate-500">
                              {order.qtyPerCs}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-black bg-amber-50/50 dark:bg-amber-950/20">
                              {order.planCs.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono text-slate-600 dark:text-slate-400">
                              {order.planKg.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono font-bold text-purple-700 dark:text-purple-300">
                              {order.planPallets}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                              {order.fillingCs.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-bold text-blue-700 dark:text-blue-400">
                              {order.dispatchedCs.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-black text-rose-700 dark:text-rose-400">
                              {order.balanceCs.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  order.status === 'Completed'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : order.status === 'Ready for Dispatch'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                    : order.status === 'Partially Filled'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {order.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONSOLIDATED PACKAGING MATERIALS & SHORTFALL (COLUMN STRUCTURE) */}
          {activeTab === 'packaging' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Packaging Materials Needed vs. Live Stock Left to Buy (BOM Breakdown)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Consolidated material balance across all purchase orders for {partyName}. Items marked in Red Deficit must be ordered immediately.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-[10.5px] uppercase font-black text-slate-700 dark:text-slate-300 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-700 w-24">Material Category</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-700 w-24 font-mono">PM Code</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-700 min-w-[220px]">Material Description</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-700 w-32 font-mono">Used In SKU(s)</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right w-24 font-bold">Total Required</th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-right w-24 font-mono">In Warehouse</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-700 text-right w-36 bg-rose-50/70 dark:bg-rose-950/20 font-black text-rose-700 dark:text-rose-400">
                          Left to Buy New (Deficit)
                        </th>
                        <th className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center w-16">UOM</th>
                        <th className="py-2.5 px-3 text-center w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {consolidatedBOM.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-slate-400 font-medium">
                            No BOM materials configured for this party yet.
                          </td>
                        </tr>
                      ) : (
                        consolidatedBOM.map((bom, idx) => (
                          <tr
                            key={idx}
                            className={bom.isDeficit ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''}
                          >
                            <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 font-bold uppercase text-[10px] text-slate-700 dark:text-slate-300">
                              {bom.type}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 font-mono font-bold text-amber-700 dark:text-amber-400">
                              {bom.code}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100">
                              {bom.desc}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-500">
                              {bom.skuList}
                            </td>
                            <td className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-bold">
                              {bom.totalRequired.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-800 text-right font-mono text-slate-600 dark:text-slate-400">
                              {bom.availableQty.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-black bg-rose-50/70 dark:bg-rose-950/20">
                              {bom.isDeficit ? (
                                <span className="text-rose-600 dark:text-rose-400 font-black">
                                  🚨 BUY {Math.abs(bom.shortExcess).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  +{bom.shortExcess.toLocaleString()} (Surplus)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono text-slate-500">
                              {bom.uom}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  bom.isDeficit
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 animate-pulse'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}
                              >
                                {bom.isDeficit ? 'DEFICIT' : 'READY'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DISPATCHES & CONTAINER STUFFING (COLUMN STRUCTURE) */}
          {activeTab === 'dispatches' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Dispatched Shipments & Port Logs for {partyName}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Container stuffing records, invoice numbers, batch tracking, and export specifications.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-[10.5px] uppercase font-black text-slate-700 dark:text-slate-300 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Invoice No</th>
                        <th className="py-2.5 px-2">Date</th>
                        <th className="py-2.5 px-2">Batch No</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Product Dispatched</th>
                        <th className="py-2.5 px-2 text-center">Case Pack</th>
                        <th className="py-2.5 px-2 text-right font-bold text-blue-700 dark:text-blue-300">Cases Dispatched</th>
                        <th className="py-2.5 px-2 text-right font-bold text-emerald-700 dark:text-emerald-300">Net Weight (MT)</th>
                        <th className="py-2.5 px-3">Destination Port</th>
                        <th className="py-2.5 px-2">Pallet Config</th>
                        <th className="py-2.5 px-2">Specs (Moisture/HMF)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {partyDispatches.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-10 text-center text-slate-400 font-medium">
                            No container dispatches logged for this party yet.
                          </td>
                        </tr>
                      ) : (
                        partyDispatches.map(d => (
                          <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {d.invoiceNo}
                            </td>
                            <td className="py-2 px-2 font-mono text-slate-500 whitespace-nowrap">
                              {d.invoiceDate}
                            </td>
                            <td className="py-2 px-2 font-mono font-bold text-amber-700 dark:text-amber-400">
                              {d.batchNo}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                              {d.productName}
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-slate-500">
                              {d.casePack}
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-black text-blue-700 dark:text-blue-300">
                              {d.dispatchCs.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-black text-emerald-700 dark:text-emerald-300">
                              {d.dispatchMt} MT
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                              {d.dispatchLocation}
                            </td>
                            <td className="py-2 px-2 font-mono text-[11px] text-slate-500">
                              {d.palletConfig || 'Standard'}
                            </td>
                            <td className="py-2 px-2 font-mono text-[10.5px] text-slate-500">
                              {d.moisture ? `M:${d.moisture} HMF:${d.hmf}` : 'Standard'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MASTER SKU CATALOG (COLUMN STRUCTURE) */}
          {activeTab === 'master' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Master SKU Catalog & Specifications for {partyName}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Officially approved bottle sizes, pack configurations, and pallet loading requirements.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-[10.5px] uppercase font-black text-slate-700 dark:text-slate-300 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 w-28">SKU Code</th>
                        <th className="py-2.5 px-3 min-w-[240px]">SKU / Product Description</th>
                        <th className="py-2.5 px-2 text-center w-24">Pack Size</th>
                        <th className="py-2.5 px-2 text-center w-20">Qty/Cs</th>
                        <th className="py-2.5 px-3 text-right w-24">Quoted MRP</th>
                        <th className="py-2.5 px-3">Pallet Requirement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {partyMasterItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-400 font-medium">
                            No master catalog SKUs mapped for this party.
                          </td>
                        </tr>
                      ) : (
                        partyMasterItems.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-700 dark:text-amber-400">
                              {m.skuCode}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                              {m.skuName}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono">
                              {m.packSize}g
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono text-slate-500">
                              {m.qtyPerCs}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                              {m.mrp ? `₹${m.mrp}` : 'Export Spec'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                              {m.palletRequirement || 'Floor Loading'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PARTY DETAILS — UPDATE CLIENT INFO */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5 text-amber-500" />
                    Client Details for {partyName}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Update the party's contact, contract, shipment and commercial details. Saved details also appear in the Customer Accounts section on the main page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors ${
                    detailsSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  {detailsSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{detailsSaved ? 'Saved!' : 'Save Details'}</span>
                </button>
              </div>

              {/* Read-only identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Party Code</span>
                  <div className="text-xs font-black font-mono text-slate-800 dark:text-slate-200 mt-0.5">{partyCode}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Party Name</span>
                  <div className="text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">{partyName}</div>
                </div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PARTY_DETAIL_FIELDS.map(f => (
                  <div key={f.key} className={f.wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                      {f.label}
                    </label>
                    <input
                      type="text"
                      value={accountDraft[f.key] as string}
                      onChange={e => {
                        setAccountDraft(d => ({ ...d, [f.key]: e.target.value }));
                        setDetailsSaved(false);
                      }}
                      placeholder={`Enter ${f.label.toLowerCase()}…`}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TAB 6: PENDING DELIVERIES — live view of imported delivery orders */}
        {activeTab === 'deliveries' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Pending Deliveries for {partyName}
              </h4>
              <p className="text-[11px] text-slate-500">
                Live view of every imported delivery order for this party. Updates automatically whenever the Pending Deliveries section is updated.
              </p>
            </div>

            {partyDeliveries.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                No pending deliveries recorded for this party yet. Import delivery sheets in the Pending Deliveries section — they will appear here automatically.
              </div>
            ) : (
              partyDeliveries.map(o => (
                <div key={o.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 text-amber-400 text-[10px] font-mono font-black">DO {o.doNo || '—'}</span>
                    {o.poDate && <span className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400">PO: {o.poDate}</span>}
                    {o.salesExecutive && <span className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400">Exec: {o.salesExecutive}</span>}
                    <span className="ml-auto text-[9.5px] font-mono text-slate-400">{o.items.length} items</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[10.5px] border-collapse">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-[9px] uppercase font-black text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="py-1.5 px-2.5 w-12">Image</th>
                          <th className="py-1.5 px-2.5 min-w-[200px]">Item / Description</th>
                          <th className="py-1.5 px-2.5 w-24">Brand</th>
                          <th className="py-1.5 px-2.5 w-32">Qty</th>
                          <th className="py-1.5 px-2.5 w-20 text-right">Sale Price</th>
                          <th className="py-1.5 px-2.5 w-28">Status</th>
                          <th className="py-1.5 px-2.5 w-20">Label Ordered</th>
                          <th className="py-1.5 px-2.5 w-20">Label Received</th>
                          <th className="py-1.5 px-2.5 min-w-[120px]">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {o.items.map(it => (
                          <tr key={it.id}>
                            <td className="py-1.5 px-2.5">
                              {it.imageUrl ? (
                                <img src={it.imageUrl} alt="product" className="w-9 h-9 object-contain rounded-md border border-slate-200 dark:border-slate-700 bg-white" />
                              ) : (
                                <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800" />
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200 leading-snug">{it.item || '—'}</td>
                            <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{it.brand || '—'}</td>
                            <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">{it.qty || '—'}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{it.salePrice || '—'}</td>
                            <td className="py-1.5 px-2.5">
                              {it.status ? (
                                <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase ${
                                  it.status === 'Delivered'
                                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                                    : it.status === 'Dispatched'
                                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                }`}>{it.status}</span>
                              ) : '—'}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{it.labelOrdered || '—'}</td>
                            <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{it.labelReceived || '—'}</td>
                            <td className="py-1.5 px-2.5 text-slate-500 dark:text-slate-400">{it.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            Party ID: {partyCode} • {partyName}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity"
          >
            Close Party Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
