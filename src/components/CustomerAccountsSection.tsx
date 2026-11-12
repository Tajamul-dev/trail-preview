import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Building2, Upload, FileSpreadsheet, FileText, ImageIcon, Loader2, Trash2,
  CheckCircle2, AlertTriangle, Users,
} from 'lucide-react';
import { CustomerAccount, CustomerTxn } from '../types';
import { idbGet, idbSet, migrateFromLS } from '../utils/idbStore';
import { ocrPdfFile, ocrImageFile } from '../utils/ocr';

const STORAGE_KEY = 'gfi_customer_accounts_v1';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const FIELD_LABELS: Record<Exclude<keyof CustomerAccount, 'id' | 'sourceFile' | 'updatedAt' | 'transactions'>, string> = {
  partyName: 'Party Name', partyCode: 'Party Code', cbm: 'CBM', contractNo: 'Contract #',
  orderNo: 'Order #', cartonQty: 'Carton Qty', otherQty: 'Other Qty', address: 'Party Address',
  contactPerson: 'Contact Person', email: 'Email', phone: 'Phone', portOfLoading: 'Port of Loading',
  portOfDischarge: 'Port of Discharge', finalDestination: 'Final Destination', salesPack: 'Sales Pack',
  items: 'Items', pendingCharges: 'Pending Charges', totalSalesAmount: 'Total Sales',
  totalQty: 'Total Qty', invoiceCount: 'Invoices', dateRange: 'Date Range',
};

const HEADER_MAP: Array<[RegExp, keyof typeof FIELD_LABELS]> = [
  [/party\s*name|customer\s*name|party\b/i, 'partyName'],
  [/customer\b/i, 'partyName'],
  [/party\s*code|customer\s*code|code/i, 'partyCode'],
  [/cbm/i, 'cbm'],
  [/contract/i, 'contractNo'],
  [/invoice\s*(no|#|number)?\b|^invoice\b/i, 'orderNo'],
  [/order\s*(no|#|num)/i, 'orderNo'],
  [/carton\s*qty|carton\s*quantity/i, 'cartonQty'],
  [/other\s*qty|other\s*quantity/i, 'otherQty'],
  [/address/i, 'address'],
  [/contact\s*no/i, 'phone'],
  [/contact\s*person|contact\s*name/i, 'contactPerson'],
  [/\bcontact\b/i, 'contactPerson'],
  [/e-?mail/i, 'email'],
  [/phone|mobile|tel/i, 'phone'],
  [/port\s*of\s*loading|loading\s*port/i, 'portOfLoading'],
  [/port\s*of\s*discharge|discharge\s*port/i, 'portOfDischarge'],
  [/final\s*destination|destination/i, 'finalDestination'],
  [/sales\s*pack|packing/i, 'salesPack'],
  [/items?|products?|brand/i, 'items'],
  [/pending\s*charges?|remarks?|notes?/i, 'pendingCharges'],
];

// Transaction-report mode (QuickBooks "Sales by Customer Detail" style)
const TXN_HEADER_MAP: Array<[RegExp, string]> = [
  [/customer/i, 'customer'], [/invoice/i, 'invoiceNo'], [/product|service/i, 'product'],
  [/memo|description/i, 'memo'], [/quantity|^qty/i, 'qty'],
  [/sales\s*price|unit\s*price|^price|^rate/i, 'price'],
  [/amount|total|value/i, 'amount'], [/^date/i, 'date'],
];

function matchFieldByBest<T extends string>(map: Array<[RegExp, T]>, label: string): T | undefined {
  let best: { field: T; len: number } | undefined;
  for (const [re, field] of map) {
    const m = label.match(re);
    if (m && m[0].length > (best?.len ?? 0)) best = { field, len: m[0].length };
  }
  return best?.field;
}

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const chunks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const it of content.items as Array<{ str: string; hasEOL?: boolean }>) {
      line += it.str;
      if (it.hasEOL) { lines.push(line.trim()); line = ''; }
    }
    if (line.trim()) lines.push(line.trim());
    chunks.push(lines.join('\n'));
  }
  return chunks.join('\n');
}

function parsePartiesFromText(text: string): Partial<CustomerAccount>[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parties: Partial<CustomerAccount>[] = [];
  let current: Partial<CustomerAccount> | null = null;
  let pendingLabel: keyof typeof FIELD_LABELS | null = null;
  const pushCurrent = () => {
    if (current && (current.partyName || current.partyCode)) parties.push(current);
    current = null; pendingLabel = null;
  };
  for (const rawLine of lines) {
    if (/^(party\s*name|customer\s*name|party|client)\b[:\-]?/i.test(rawLine) && current && current.partyName) pushCurrent();
    if (!current) current = {};
    let matched = false;
    for (const [re, field] of HEADER_MAP) {
      const m = rawLine.match(new RegExp(`^${re.source.slice(1)}\\s*[:\\-]?\\s*(.*)$`, 'i'));
      if (m) {
        const value = m[1].trim();
        if (value) {
          (current as any)[field] = (current as any)[field] ? `${(current as any)[field]} ${value}` : value;
          pendingLabel = null;
        } else pendingLabel = field;
        matched = true;
        break;
      }
    }
    if (!matched && pendingLabel) { (current as any)[pendingLabel] = rawLine; pendingLabel = null; }
  }
  pushCurrent();
  return parties;
}

function emptyAccount(): CustomerAccount {
  return {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    partyName: '', partyCode: '', cbm: '', contractNo: '', orderNo: '', cartonQty: '', otherQty: '',
    address: '', contactPerson: '', email: '', phone: '', portOfLoading: '', portOfDischarge: '',
    finalDestination: '', salesPack: '', items: '', pendingCharges: '', updatedAt: new Date().toISOString(),
  };
}

function normalize(raw: Partial<CustomerAccount>, sourceFile: string): CustomerAccount {
  return {
    ...emptyAccount(),
    ...Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v ?? ''])),
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceFile,
    updatedAt: new Date().toISOString(),
  } as CustomerAccount;
}

function mergeAccounts(existing: CustomerAccount[], incoming: CustomerAccount[]): CustomerAccount[] {
  const next = [...existing];
  for (const inc of incoming) {
    const key = (inc.partyCode || inc.partyName || '').trim().toLowerCase();
    if (!key) continue;
    const idx = next.findIndex(a => (a.partyCode || a.partyName || '').trim().toLowerCase() === key);
    if (idx >= 0) {
      next[idx] = {
        ...next[idx], ...inc, id: next[idx].id, updatedAt: new Date().toISOString(),
        transactions: inc.transactions?.length ? inc.transactions : next[idx].transactions,
      };
    } else next.push({ ...inc, id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
  }
  return next;
}

async function dataUrlFromFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function aiExtract(file: File, name: string): Promise<CustomerAccount[]> {
  const mimeType = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  const dataUrl = await dataUrlFromFile(file);
  const res = await fetch('/api/scan-customer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: dataUrl, mimeType }),
  });
  if (res.ok) {
    const parsed = await res.json();
    const rawAccounts: Partial<CustomerAccount>[] = Array.isArray(parsed) ? parsed : parsed.accounts || [];
    return rawAccounts.map(raw => normalize(raw, name)).filter(acc => acc.partyName || acc.partyCode);
  }

  // ---- OFFLINE FALLBACK: browser OCR (no API key, no server) ----
  const text = /.pdf$/i.test(name) || file.type === 'application/pdf' ? await ocrPdfFile(file) : await ocrImageFile(file);
  const parties = parsePartiesFromText(text);
  return parties.map(raw => normalize(raw, name)).filter(acc => acc.partyName || acc.partyCode);
}

async function parseWorkbookToAccounts(buf: ArrayBuffer, sourceName: string): Promise<{ accounts: CustomerAccount[]; sheets: string[]; headerFound: boolean }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const out: CustomerAccount[] = [];
  let headerFound = false;

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    if (!rows.length) continue;

    // 0) Transaction-report mode (Customer + Qty/Amount columns → aggregate per customer)
    let txnHeaderRow = -1, txnCols: Record<string, number> = {}, txnScore = 0;
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const row = rows[r] || [];
      const cols: Record<string, number> = {};
      for (let c = 0; c < row.length; c++) {
        const s = String(row[c] ?? '').trim();
        if (!s) continue;
        const f = matchFieldByBest(TXN_HEADER_MAP, s);
        if (f && cols[f] === undefined) cols[f] = c;
      }
      const score = Object.keys(cols).length;
      if (cols.customer !== undefined && (cols.amount !== undefined || cols.qty !== undefined) && score > txnScore) {
        txnScore = score; txnHeaderRow = r; txnCols = cols;
      }
    }
    if (txnHeaderRow >= 0) {
      headerFound = true;
      const groups = new Map<string, { name: string; totalAmount: number; totalQty: number; invoices: Set<string>; products: Set<string>; dates: string[]; txns: CustomerTxn[] }>();
      for (let r = txnHeaderRow + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const customer = String(row[txnCols.customer] ?? '').trim();
        if (!customer || /^total/i.test(customer)) continue;
        const key = customer.toLowerCase();
        let g = groups.get(key);
        if (!g) { g = { name: customer, totalAmount: 0, totalQty: 0, invoices: new Set(), products: new Set(), dates: [], txns: [] }; groups.set(key, g); }
        const num = (col: number) => { const v = parseFloat(String(row[col] ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(v) ? 0 : v; };
        if (txnCols.amount !== undefined) g.totalAmount += num(txnCols.amount);
        if (txnCols.qty !== undefined) g.totalQty += num(txnCols.qty);
        const invoiceVal = txnCols.invoiceNo !== undefined ? String(row[txnCols.invoiceNo] ?? '').trim() : '';
        if (invoiceVal) g.invoices.add(invoiceVal);
        const productVal = txnCols.product !== undefined ? String(row[txnCols.product] ?? '').trim() : '';
        if (productVal) g.products.add(productVal);
        const dateVal = txnCols.date !== undefined ? String(row[txnCols.date] ?? '').trim() : '';
        if (dateVal) g.dates.push(dateVal);
        const qtyVal = txnCols.qty !== undefined ? num(txnCols.qty) : 0;
        const priceVal = txnCols.price !== undefined ? num(txnCols.price) : 0;
        const amountVal = txnCols.amount !== undefined ? num(txnCols.amount) : 0;
        const memoVal = txnCols.memo !== undefined ? String(row[txnCols.memo] ?? '').replace(/\s+/g, ' ').trim() : '';
        if (productVal || invoiceVal || amountVal) {
          g.txns.push({ date: dateVal, invoiceNo: invoiceVal, product: productVal, memo: memoVal, qty: qtyVal, price: priceVal, amount: amountVal });
        }
      }
      for (const g of groups.values()) {
        const acc = emptyAccount();
        acc.partyName = g.name;
        acc.items = Array.from(g.products).slice(0, 8).join(', ') + (g.products.size > 8 ? ` … (+${g.products.size - 8} more)` : '');
        if (txnCols.amount !== undefined) acc.totalSalesAmount = g.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (txnCols.qty !== undefined) acc.totalQty = g.totalQty.toLocaleString();
        if (txnCols.invoiceNo !== undefined) acc.invoiceCount = String(g.invoices.size);
        if (txnCols.date !== undefined && g.dates.length) {
          const parsed = g.dates.map(d => ({ raw: d, t: Date.parse(d) })).filter(x => !isNaN(x.t)).sort((a, b) => a.t - b.t);
          if (parsed.length) acc.dateRange = `${parsed[0].raw} – ${parsed[parsed.length - 1].raw}`;
        }
        acc.transactions = g.txns;
        out.push(normalize(acc, sourceName));
      }
      continue;
    }

    // 1) Header-row mode: find best header row within first 25 rows
    let headerIdx = -1, bestMatches = 0, headerMap: Record<number, keyof typeof FIELD_LABELS> = {};
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const row = rows[r] || [];
      const map: Record<number, keyof typeof FIELD_LABELS> = {};
      let count = 0;
      for (let c = 0; c < row.length; c++) {
        const s = String(row[c] ?? '').trim();
        if (!s) continue;
        const f = matchFieldByBest(HEADER_MAP, s);
        if (f && !Object.values(map).includes(f)) { map[c] = f; count++; }
      }
      if (count > bestMatches) { bestMatches = count; headerIdx = r; headerMap = map; }
    }
    if (headerIdx >= 0 && bestMatches >= 2) {
      headerFound = true;
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const acc = emptyAccount();
        let hasData = false;
        for (const [colStr, field] of Object.entries(headerMap)) {
          const v = String(row[Number(colStr)] ?? '').trim();
          if (v) { (acc as any)[field] = v; hasData = true; }
        }
        if (hasData && (acc.partyName || acc.partyCode)) out.push(normalize(acc, sourceName));
      }
      continue;
    }

    // 2) Label → value fallback (vertical sheets or inline "Label: value" cells)
    for (const row of rows) {
      const acc = emptyAccount();
      let hasData = false;
      const consumed = new Set<number>();
      for (let c = 0; c < row.length; c++) {
        if (consumed.has(c)) continue;
        const s = String(row[c] ?? '').trim();
        if (!s) continue;
        const tryLabel = (label: string, value: string): boolean => {
          const f = matchFieldByBest(HEADER_MAP, label.trim());
          if (f && value && !(acc as any)[f]) { (acc as any)[f] = value.trim(); hasData = true; return true; }
          return false;
        };
        const inline = s.match(/^([^:：]{2,40})[:：]\s*(.+)$/);
        if (inline && tryLabel(inline[1], inline[2])) continue;
        const nextVal = String(row[c + 1] ?? '').trim();
        if (tryLabel(s, nextVal)) { consumed.add(c + 1); c++; }
      }
      if (hasData && (acc.partyName || acc.partyCode)) out.push(normalize(acc, sourceName));
    }
  }
  return { accounts: out, sheets: wb.SheetNames, headerFound };
}

export const CustomerAccountsSection: React.FC<{ onNotify?: (msg: string) => void }> = ({ onNotify }) => {
  const [accounts, setAccounts] = useState<CustomerAccount[]>(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) return JSON.parse(saved); } catch {}
    return [];
  });
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const selfUpdateRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load from IndexedDB (one-time migration from legacy localStorage)
  useEffect(() => {
    (async () => {
      const saved = await migrateFromLS<CustomerAccount[]>(STORAGE_KEY);
      if (saved?.length) setAccounts(saved);
    })();
  }, []);

  // Persist to IndexedDB (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      idbSet(STORAGE_KEY, accounts).then(ok => {
        if (ok) {
          selfUpdateRef.current = true;
          window.dispatchEvent(new CustomEvent('gfi-customer-accounts-updated'));
          setTimeout(() => { selfUpdateRef.current = false; }, 800);
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [accounts]);

  // Live update: when client details are edited in the Party Dossier (or elsewhere),
  // reload from IndexedDB — unless this section itself just saved (loop guard).
  useEffect(() => {
    const handler = async () => {
      if (selfUpdateRef.current) return;
      const saved = await idbGet<CustomerAccount[]>(STORAGE_KEY);
      if (saved?.length) setAccounts(saved);
    };
    window.addEventListener('gfi-customer-accounts-updated', handler);
    return () => window.removeEventListener('gfi-customer-accounts-updated', handler);
  }, []);

  // Unmount flush: never lose the latest account/status data on fast navigation
  useEffect(() => {
    return () => {
      idbSet(STORAGE_KEY, accountsRef.current).then(ok => {
        if (ok) window.dispatchEvent(new CustomEvent('gfi-customer-accounts-updated'));
      });
    };
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true); setStatusMsg(null);
    let collected: CustomerAccount[] = [];
    let sheetsInfo = '';
    try {
      for (const file of Array.from(files)) {
        const name = file.name;
        if (/\.(xlsx|xls|csv)$/i.test(name)) {
          const { accounts: parsedAccounts, sheets, headerFound } = await parseWorkbookToAccounts(await file.arrayBuffer(), name);
          collected.push(...parsedAccounts);
          if (!parsedAccounts.length) sheetsInfo += `${name} → sheets: ${sheets.join(', ')}${headerFound ? '' : ' (no recognizable header row)'}; `;
        } else if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
          let text = '';
          try { text = await extractPdfText(file); } catch (e) { console.warn('PDF text extraction failed:', e); }
          const parsedParties = text.trim() ? parsePartiesFromText(text) : [];
          if (parsedParties.length) {
            for (const raw of parsedParties) {
              const acc = normalize(raw, name);
              if (acc.partyName || acc.partyCode) collected.push(acc);
            }
          } else {
            collected.push(...(await aiExtract(file, name)));
          }
        } else {
          collected.push(...(await aiExtract(file, name)));
        }
      }
      if (!collected.length) {
        setStatusMsg({
          kind: 'error',
          text: `No customer records could be extracted. ${sheetsInfo ? `Scanned: ${sheetsInfo}. ` : ''}The sheet needs a header row with columns like "Party", "Party Code", "Contact", "Address", "Port of Loading", etc. — or label/value pairs like "Party: …". If your file uses different wording, tell me the column names and I'll add them.`,
        });
      } else {
        setAccounts(prev => mergeAccounts(prev, collected));
        setStatusMsg({ kind: 'ok', text: `${collected.length} customer account${collected.length !== 1 ? 's' : ''} imported and updated automatically.` });
        onNotify?.(`✅ ${collected.length} customer account(s) imported.`);
      }
    } catch (err: any) {
      console.error('Customer account upload failed:', err);
      setStatusMsg({ kind: 'error', text: err.message || 'Failed to process the uploaded file.' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
            <Users className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">Customer Accounts</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Upload a PDF, picture, or Excel file of your party data — records are extracted and updated automatically.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,image/*" className="hidden" onChange={e => handleFiles(e.target.files)} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{busy ? 'Processing…' : 'Upload PDF / Picture / XLS'}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${statusMsg.kind === 'ok' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'}`}>
          {statusMsg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {Object.values(FIELD_LABELS).map(label => (
          <span key={label} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        ))}
      </div>

      {accounts.length === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 text-center space-y-2">
          <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <FileText className="w-5 h-5" /><FileSpreadsheet className="w-5 h-5" /><ImageIcon className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            No customer accounts yet. Upload a party sheet (PDF, photo, or Excel) and the records will be created automatically in the format above — currently empty of names and details.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <strong className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">{acc.partyName || 'Unnamed Party'}</strong>
                  {acc.partyCode && <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[9.5px] font-mono font-bold text-slate-700 dark:text-slate-200">{acc.partyCode}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {acc.sourceFile && <span className="text-[9.5px] text-slate-400 font-mono truncate max-w-40" title={acc.sourceFile}>{acc.sourceFile}</span>}
                  <button type="button" onClick={() => setAccounts(prev => prev.filter(a => a.id !== acc.id))} className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer" title="Remove account">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800/70">
                {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>)
                  .filter(f => f !== 'partyName' && f !== 'partyCode')
                  .map(field => (
                    <div key={field} className="px-3 py-2 min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">{FIELD_LABELS[field]}</div>
                      <div className={`text-[11px] font-semibold text-slate-800 dark:text-slate-200 break-words ${acc[field] ? '' : 'text-slate-300 dark:text-slate-600'}`}>
                        {acc[field] || '—'}
                      </div>
                    </div>
                  ))}
              </div>

              {acc.transactions && acc.transactions.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800/70">
                  <button type="button" onClick={() => setExpandedTxnId(expandedTxnId === acc.id ? null : acc.id)}
                    className="w-full px-3.5 py-2 flex items-center justify-between text-[10.5px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                    <span>{expandedTxnId === acc.id ? '▼' : '▶'} Transaction History — {acc.transactions.length} line item{acc.transactions.length !== 1 ? 's' : ''} sold</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">${acc.transactions.reduce((a, t) => a + (t.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </button>
                  {expandedTxnId === acc.id && (
                    <div className="overflow-x-auto max-h-96 border-t border-slate-100 dark:border-slate-800/70">
                      <table className="w-full text-left text-[10.5px] border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-[9px] uppercase font-black text-slate-500 dark:text-slate-400 sticky top-0">
                          <tr>
                            <th className="py-1.5 px-2.5">Date</th><th className="py-1.5 px-2.5">Invoice #</th>
                            <th className="py-1.5 px-2.5">Item / Product Sold</th>
                            <th className="py-1.5 px-2.5 text-right">Qty</th><th className="py-1.5 px-2.5 text-right">Unit Price</th><th className="py-1.5 px-2.5 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                          {acc.transactions.map((t, i) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-1 px-2.5 font-mono whitespace-nowrap text-slate-600 dark:text-slate-400">{t.date || '—'}</td>
                              <td className="py-1 px-2.5 font-mono text-slate-600 dark:text-slate-400">{t.invoiceNo || '—'}</td>
                              <td className="py-1 px-2.5">
                                <div className="font-semibold text-slate-800 dark:text-slate-200 leading-snug">{t.product || '—'}</div>
                                {t.memo && <div className="text-[9.5px] text-slate-400 dark:text-slate-500 whitespace-pre-line leading-snug">{t.memo}</div>}
                              </td>
                              <td className="py-1 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{t.qty ? t.qty.toLocaleString() : '—'}</td>
                              <td className="py-1 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{t.price ? t.price.toFixed(2) : '—'}</td>
                              <td className="py-1 px-2.5 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">{t.amount ? t.amount.toFixed(2) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-t-2 border-slate-200 dark:border-slate-700">
                            <td colSpan={3} className="py-1.5 px-2.5 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Grand Total — {acc.transactions.length} line item{acc.transactions.length !== 1 ? 's' : ''}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono tabular-nums font-black text-slate-900 dark:text-slate-100">{acc.transactions.reduce((a, t) => a + (t.qty || 0), 0).toLocaleString()}</td>
                            <td></td>
                            <td className="py-1.5 px-2.5 text-right font-mono tabular-nums font-black text-emerald-600 dark:text-emerald-400">${acc.transactions.reduce((a, t) => a + (t.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
