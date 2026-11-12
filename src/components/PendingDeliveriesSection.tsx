import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Truck,
  Upload,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Building2,
  MapPin,
  UserCheck,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  Edit3,
  Save,
  Plus,
  Download,
} from 'lucide-react';
import { PendingDeliveryOrder, PendingDeliveryItem, ProductionSheetData } from '../types';

interface UploadedFileRecord {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
  uploadedAt: string;
}
import { SoundEngine } from '../utils/audio';
import { GLOBAL_FUTURA_LOGO_PATH } from '../utils/constants';
import { ocrPdfFile, ocrImageFile, pdfTextRows, PdfTextRow } from '../utils/ocr';
import { savePdfTable } from '../utils/pdfExport';
import { idbGet, idbSet, migrateFromLS } from '../utils/idbStore';

const STORAGE_KEY = 'gfi_pending_deliveries_v1';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// Column matchers for XLS uploads (fuzzy, best-match scoring like Customer Accounts)
const DO_HEADER_MAP: Array<[RegExp, string]> = [
  [/^\s*(d\.?o\.?|delivery\s*order)\s*(no|#|number)?\b|^\s*do\s*no/i, 'doNo'],
  [/purchase\s*order\s*date|^p\.?o\.?\s*date|^po\s*date/i, 'poDate'],
  [/customer\s*name|^customer\b|client\s*name|^client\b|^party\b/i, 'customerName'],
  [/sales\s*executive|sales\s*rep|executive\b/i, 'salesExecutive'],
  [/address/i, 'address'],
  [/region|section|location\s*group|city\b|borough/i, 'region'],
  [/item\b|product|description\b|goods\b/i, 'item'],
  [/brand/i, 'brand'],
  [/^qty|quantity|pallets?\b|cases?\b/i, 'qty'],
  [/sale\s*price|rate|price\b|amount\b/i, 'salePrice'],
  [/label\s*ordered/i, 'labelOrdered'],
  [/label\s*received/i, 'labelReceived'],
  [/remarks?|notes?|status\b/i, 'remarks'],
];

function matchDoField(label: string): string | undefined {
  let best: { field: string; len: number } | undefined;
  for (const [re, field] of DO_HEADER_MAP) {
    const m = label.match(re);
    if (m && m[0].length > (best?.len ?? 0)) best = { field, len: m[0].length };
  }
  return best?.field;
}

// Convert an Excel date serial (e.g. 46267) into d.m.yy; pass through anything else
function excelSerialToDateStr(serial: string): string {
  const n = parseFloat(serial);
  if (isNaN(n) || n < 20000 || n > 90000) return serial;
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${String(d.getUTCFullYear()).slice(2)}`;
}

// Positional parser for the "Pending Deliveries" layout (no header row):
// col0 DO No | col1 PO Date (Excel serial) | col2 Customer | col3 Sales Exec | col4 Address |
// col5 Item | col6 Brand | col7 Description | col8 Qty | col9 Sale Price |
// col10 Label Ordered | col11 Label Received | col13 Remarks
function parsePositionalOrders(
  rows: any[][],
  sheetName: string,
  sheetIdx: number,
  images: Map<string, string>,
  sourceName: string
): PendingDeliveryOrder[] {
  const orders: PendingDeliveryOrder[] = [];
  let doCount = 0;
  for (const row of rows) {
    if (/^\d{3,5}$/.test(String(row[0] ?? '').trim())) doCount++;
  }
  if (doCount < 1) return orders;

  let current: PendingDeliveryOrder | null = null;
  const pushCurrent = () => {
    if (current && (current.customerName || current.doNo)) orders.push(current);
    current = null;
  };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const cells = row.map((c: any) => String(c ?? '').trim());
    const c0 = cells[0] || '';
    const startsOrder = /^\d{3,5}$/.test(c0) && (cells[2] || '').length > 0;

    if (startsOrder) {
      pushCurrent();
      current = blankOrder();
      current.doNo = c0;
      current.sourceSheet = sheetName;
      current.poDate = excelSerialToDateStr(cells[1] || '');
      current.customerName = cells[2];
      current.salesExecutive = cells[3] || '';
      current.address = cells[4] || '';
      current.sourceFile = sourceName;
    }
    if (!current) continue;

    const itemName = cells[5] || '';
    if (!itemName) {
      // Order-level note on its own row (e.g. "(Dispatch after Piyush Approval)")
      if (c0 && !/^\d/.test(c0) && current.items.length) {
        const last = current.items[current.items.length - 1];
        last.remarks = last.remarks ? `${last.remarks} ${c0}` : c0;
      }
      continue;
    }

    const item: PendingDeliveryItem = {
      ...emptyItem(),
      item: `${itemName}${cells[7] ? ` ${cells[7]}` : ''}`.trim(),
      description: cells[7] || undefined,
      brand: cells[6] || '',
      qty: cells[8] || '',
      salePrice: cells[9] || '',
      labelOrdered: cells[10] || '',
      labelReceived: cells[11] || '',
      remarks: cells[13] || cells[12] || '',
    };
    const img =
      images.get(`${sheetIdx}:${r}`) ||
      images.get(`${sheetIdx}:${r - 1}`) ||
      images.get(`${sheetIdx}:${r - 2}`);
    if (img) item.imageUrl = img;
    current.items.push(item);
  }
  pushCurrent();
  return orders;
}

const fmtPallets = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? r.toString() : r.toFixed(2);
};

function emptyItem(): PendingDeliveryItem {
  return {
    id: `pdi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item: '',
    brand: '',
    qty: '',
    salePrice: '',
    labelOrdered: '',
    labelReceived: '',
    remarks: '',
  };
}

function blankOrder(): PendingDeliveryOrder {
  return {
    id: `pdo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    doNo: '',
    poDate: '',
    customerName: '',
    salesExecutive: '',
    address: '',
    region: '',
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

// Parse an XLSX/XLS/CSV workbook into delivery orders.
// Supports a flat table (one row per item with repeated order columns) and embedded images.
async function parseWorkbookToOrders(
  buf: ArrayBuffer,
  sourceName: string
): Promise<{ orders: PendingDeliveryOrder[]; sheets: string[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const orders: PendingDeliveryOrder[] = [];
  let images = new Map<string, string>();

  try {
    images = await extractXlsxImages(buf);
  } catch (e) {
    console.warn('XLSX image extraction skipped:', e);
  }

  for (const sheetName of wb.SheetNames) {
    const sheetIdx = wb.SheetNames.indexOf(sheetName);
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    if (!rows.length) continue;

    // 0) Positional mode: the "Pending Deliveries" layout has NO header row —
    //    col0 DO No | col1 PO Date | col2 Customer | col3 Sales Exec | col4 Address |
    //    col5 Item | col6 Brand | col7 Description | col8 Qty | col9 Price |
    //    col10 Label Ordered | col11 Label Received | col13 Remarks
    const positional = parsePositionalOrders(rows, wb.SheetNames[sheetIdx], sheetIdx, images, sourceName);
    if (positional.length) {
      orders.push(...positional);
      continue; // next sheet
    }

    // 1) Header-based mode: find the best header row in the first 25 rows
    let headerIdx = -1;
    let bestMatches = 0;
    let headerMap: Record<number, string> = {};
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const row = rows[r] || [];
      const map: Record<number, string> = {};
      let count = 0;
      for (let c = 0; c < row.length; c++) {
        const s = String(row[c] ?? '').trim();
        if (!s) continue;
        const f = matchDoField(s);
        if (f && !Object.values(map).includes(f)) {
          map[c] = f;
          count++;
        }
      }
      if (count > bestMatches) {
        bestMatches = count;
        headerIdx = r;
        headerMap = map;
      }
    }
    if (headerIdx < 0 || bestMatches < 3) continue;

    let current: PendingDeliveryOrder | null = null;
    const pushCurrent = () => {
      if (current && (current.customerName || current.doNo)) orders.push(current);
      current = null;
    };

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const get = (field: string) => {
        for (const [colStr, f] of Object.entries(headerMap)) {
          if (f === field) return String(row[Number(colStr)] ?? '').trim();
        }
        return '';
      };

      // Skip total / blank rows
      const firstCell = String(row[0] ?? '').trim();
      if (/^total/i.test(firstCell)) continue;
      if (!row.some((c: any) => String(c ?? '').trim())) continue;

      // A new delivery order starts when the order-level columns are filled
      const doNo = get('doNo');
      const customerName = get('customerName');
      if (current && (doNo || customerName) && customerName !== current.customerName) {
        pushCurrent();
      }
      if (!current) {
        current = blankOrder();
        current.doNo = doNo;
        current.poDate = get('poDate');
        current.customerName = customerName;
        current.salesExecutive = get('salesExecutive');
        current.address = get('address');
        current.region = get('region');
        current.sourceFile = sourceName;
      }

      const itemText = get('item');
      if (!itemText && !get('qty')) continue;
      const item: PendingDeliveryItem = {
        ...emptyItem(),
        item: itemText,
        brand: get('brand'),
        qty: get('qty'),
        salePrice: get('salePrice'),
        labelOrdered: get('labelOrdered'),
        labelReceived: get('labelReceived'),
        remarks: get('remarks'),
      };
      // Attach embedded product image for this row (this row or the row above)
      const img =
        images.get(`${sheetIdx}:${r}`) ||
        images.get(`${sheetIdx}:${r - 1}`) ||
        images.get(`${sheetIdx}:${r - 2}`);
      if (img) item.imageUrl = img;
      current.items.push(item);
    }
    pushCurrent();
  }

  return { orders, sheets: wb.SheetNames };
}

// Extract embedded images from an XLSX zip, mapped by sheet index + row index (0-based).
async function extractXlsxImages(buf: ArrayBuffer): Promise<Map<string, string>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const result = new Map<string, string>();

  // Map media files to data URLs
  const mediaCache = new Map<string, string>();
  const mediaToDataUrl = async (mediaPath: string): Promise<string> => {
    if (mediaCache.has(mediaPath)) return mediaCache.get(mediaPath)!;
    const file = zip.file(mediaPath);
    if (!file) return '';
    const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const b64 = await file.async('base64');
    const url = `data:${mime};base64,${b64}`;
    mediaCache.set(mediaPath, url);
    return url;
  };

  // Find drawing relationships per sheet
  const sheetFiles = Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  for (const sheetFile of sheetFiles) {
    const sheetIdx = parseInt(sheetFile.match(/sheet(\d+)\.xml/)?.[1] || '1', 10) - 1;
    const relsFile = sheetFile.replace('worksheets/', 'worksheets/_rels/') + '.rels';
    const rels = zip.file(relsFile);
    if (!rels) continue;
    const relsDoc = new DOMParser().parseFromString(await rels.async('string'), 'text/xml');
    const drawingRels = Array.from(relsDoc.getElementsByTagName('*')).filter(n =>
      n.nodeName.endsWith('Relationship')
    );
    const drawingTargets = drawingRels
      .map(n => n.getAttribute('Target') || '')
      .filter(t => t.includes('drawing'));

    for (const drawingTarget of drawingTargets) {
      const drawingPath =
        'xl/drawings/' + drawingTarget.replace(/^\.\.\//, '').replace(/^.*drawings\//, '');
      const drawingFile = zip.file(drawingPath) || zip.file(drawingTarget.replace('../', 'xl/'));
      if (!drawingFile) continue;
      const drawingDoc = new DOMParser().parseFromString(await drawingFile.async('string'), 'text/xml');
      const drawingPathOnly = drawingPath.replace('xl/drawings/', '');
      const drawingRelsFile = zip.file(`xl/drawings/_rels/${drawingPathOnly}.rels`);
      let blipMap = new Map<string, string>();
      if (drawingRelsFile) {
        const rDoc = new DOMParser().parseFromString(await drawingRelsFile.async('string'), 'text/xml');
        for (const n of Array.from(rDoc.getElementsByTagName('*'))) {
          if (n.nodeName.endsWith('Relationship')) {
            const id = n.getAttribute('Id') || '';
            const target = (n.getAttribute('Target') || '').replace('../', 'xl/').replace('../../', 'xl/');
            blipMap.set(id, target);
          }
        }
      }

      // Walk anchors: twoCellAnchor / oneCellAnchor → from/row + blip embed
      const anchors = Array.from(drawingDoc.getElementsByTagName('*')).filter(n =>
        /CellAnchor$/.test(n.nodeName)
      );
      for (const anchor of anchors) {
        let row = -1;
        for (const child of anchor.getElementsByTagName('*')) {
          if (child.nodeName.endsWith('row') && child.parentElement?.nodeName.endsWith('from')) {
            row = parseInt(child.textContent || '-1', 10);
            break;
          }
        }
        let blipId = '';
        for (const child of anchor.getElementsByTagName('*')) {
          if (child.nodeName.endsWith('blip')) {
            for (const attr of Array.from(child.attributes)) {
              if (attr.name.includes('embed')) {
                blipId = attr.value;
                break;
              }
            }
            break;
          }
        }
        if (row < 0 || !blipId || !blipMap.has(blipId)) continue;
        const mediaTarget = blipMap.get(blipId)!;
        const dataUrl = await mediaToDataUrl(mediaTarget);
        if (dataUrl && !result.has(`${sheetIdx}:${row}`)) {
          result.set(`${sheetIdx}:${row}`, dataUrl);
        }
      }
    }
  }
  return result;
}

async function dataUrlFromFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// AI extraction for scanned PDFs / photos (requires GEMINI_API_KEY on the server)
// ---- Offline OCR fallback for deliveries (no API key) ----
// Best-effort: collects item-like lines (Qty patterns) into one editable import order.
function parseDeliveriesFromOcrText(text: string, sourceName: string): PendingDeliveryOrder[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items: PendingDeliveryItem[] = [];
  let currentParty = '';
  for (const line of lines) {
    if (/^(total|page|subtotal)/i.test(line)) continue;
    const qtyMatch = line.match(/([\d.]+\s*[xX]\s*[\d./]+\s*(?:pallets?|cases?|pal)\b)|(\d+\s*(?:cases?|pal\b))|(1\/2\s*pallet)/i);
    if (!qtyMatch) {
      // Likely a party/customer line (short, no digits-heavy)
      if (line.length > 3 && line.length < 40 && !/label/i.test(line)) currentParty = line;
      continue;
    }
    const qty = qtyMatch[0].replace(/[xX]/, 'X').toUpperCase();
    const itemText = line.replace(qtyMatch[0], '').replace(/\s{2,}/g, ' ').trim() || currentParty || 'Item';
    items.push({
      ...emptyItem(),
      item: itemText.slice(0, 120),
      brand: '',
      qty,
      salePrice: '',
      labelOrdered: '',
      labelReceived: '',
    });
  }
  if (!items.length) return [];
  const order: PendingDeliveryOrder = {
    ...blankOrder(),
    doNo: 'OCR',
    customerName: currentParty || 'Scanned Pending Orders (OCR)',
    items,
    sourceFile: sourceName,
    updatedAt: new Date().toISOString(),
  };
  return [order];
}

// ---- Exact inverse parser for the app's own "Pending Orders" export PDF ----
// Deterministic: product banner -> size heading -> rows (Party|BRAND|Pallet|Label|Status) -> Total.
// 100% accurate because the format is generated by this app.
// ---- Line-based parser for the printed "Pending Deliveries" sheet PDF (100% text-layer) ----
// Layout: DO rows ("1152 9.5.26"), wrapped customer/exec/address lines, item rows with
// Qty (PALLETS/CASES), $ Sale Price, Label Ordered (Yes/Not), Label Received, Remarks.
// ---- Column-grid parser for the printed "Pending Deliveries" sheet PDF ----
// Words are mapped by x-position into the sheet's columns (DO | PO Date | Customer |
// Sales Exec | Address | Items | Brand | Description | Qty | Sale Price | Label Ordered |
// Label Received | Remarks); DO rows delimit order blocks; per-block, columns are
// concatenated (handles wrapped cells) and items are keyed by their Qty-row y position.
// ---- Exact inverse parser for the app's own "Pending Orders" export PDF ----
function parsePendingOrdersExportPdf(rows: import('../utils/ocr').PdfTextRow[], sourceName: string): PendingDeliveryOrder[] {
  const isNum = (t: string) => /^\d+(\.\d+)?$/.test(String(t ?? '').trim());
  const merged = rows
    .map(r => {
      const cells: Array<{ x: number; s: string }> = [];
      r.cells.forEach(c => {
        const last = cells[cells.length - 1];
        if (last && c.x - last.x < 14) last.s += ' ' + c.s;
        else cells.push({ x: c.x, s: c.s });
      });
      return cells.map(c => ({ x: c.x, s: c.s.trim() })).filter(c => c.s);
    })
    .filter(cells => cells.length > 0);

  const isChrome = (joined: string) =>
    /^Pending Orders/i.test(joined) ||
    /Global Futura Inc/i.test(joined) ||
    /Generated .*Printed/i.test(joined) ||
    /^Page \d/i.test(joined) ||
    /Operations Suite/i.test(joined) ||
    /Filtered delivery items/i.test(joined) ||
    /^Party Name\b/i.test(joined);

  const orders: PendingDeliveryOrder[] = [];
  const ordersByKey = new Map<string, PendingDeliveryOrder>();
  let fam = '';
  let size = '';
  let dataRowCount = 0;
  let lastOrder: PendingDeliveryOrder | null = null;

  for (const cells of merged) {
    const joined = cells.map(c => c.s).join(' ');
    if (isChrome(joined)) continue;
    if (cells.length === 1) {
      const t = cells[0].s;
      if (/^Total\b/i.test(t)) continue;
      const hasLowercase = /[a-z]/.test(t) && !/^[A-Z0-9 &'.\-]+$/.test(t);
      if (fam && hasLowercase && lastOrder) {
        lastOrder.customerName = (lastOrder.customerName + ' ' + t).replace(/\s+/g, ' ').trim();
        continue;
      }
      if (fam && t.toUpperCase().startsWith(fam.toUpperCase()) && t.toUpperCase() !== fam.toUpperCase()) {
        size = t.slice(fam.length).trim();
        continue;
      }
      fam = t;
      size = '';
      continue;
    }
    if (/^Total\b/i.test(cells[0].s)) continue;
    let numIdx = -1;
    cells.forEach((c, ci) => { if (isNum(c.s)) numIdx = ci; });
    if (numIdx < 0) continue;
    if (!fam) continue;
    const pallets = parseFloat(cells[numIdx].s) || 0;
    const party = (numIdx >= 2 ? cells.slice(0, numIdx - 1).map(c => c.s).join(' ') : cells[0].s).replace(/\s+/g, ' ').trim() || 'Unnamed Party';
    const brand = numIdx >= 2 ? cells[numIdx - 1].s : '';
    const label = cells[numIdx + 1]?.s || '';
    const status = cells.slice(numIdx + 2).map(c => c.s).join(' ');

    const key = party.trim().toLowerCase();
    let o = ordersByKey.get(key);
    if (!o) {
      o = { ...blankOrder(), customerName: party, sourceFile: sourceName, updatedAt: new Date().toISOString() };
      ordersByKey.set(key, o);
      orders.push(o);
    }
    lastOrder = o;
    const labelReceived = label === 'Available' ? 'Received' : label === 'Not Label' ? 'Not' : label;
    const labelOrdered = /not/i.test(label) ? 'Not' : '';
    o.items.push({
      ...emptyItem(),
      item: [fam, size].filter(Boolean).join(' '),
      brand,
      qty: (Math.round(pallets * 100) / 100) + ' PALLETS',
      salePrice: '',
      labelOrdered,
      labelReceived,
      remarks: status,
    });
    dataRowCount++;
  }
  if (!fam || dataRowCount < 2) return [];
  return orders;
}

function parseSheetDeliveriesPdf(rows: import('../utils/ocr').PdfTextRow[], sourceName: string): PendingDeliveryOrder[] {
  const pageMap = new Map<number, import('../utils/ocr').PdfTextRow[]>();
  rows.forEach(r => {
    if (!pageMap.has(r.page)) pageMap.set(r.page, []);
    pageMap.get(r.page)!.push(r);
  });

  const orders: PendingDeliveryOrder[] = [];
  const ordersByKey = new Map<string, PendingDeliveryOrder>();

  const COLS = ['DO', 'PO Date', 'Customer', 'Sales Exec', 'Address', 'Items', 'Brand', 'Desc', 'Qty', 'Sale Price', 'Label Ordered', 'Label Received', 'Remarks'];
  const KEYWORDS = ['DO', 'Purchase', 'Customer', 'Sales', 'Address', 'Items', 'Brand', 'Description', 'Qty', 'Sale', 'Bottle', 'Remarks'];

  for (const pageRows of pageMap.values()) {
    // flatten words
    const words: Array<{ x: number; y: number; s: string }> = [];
    pageRows.forEach(r => r.cells.forEach(c => words.push({ x: c.x, y: r.y, s: c.s })));
    if (!words.length) continue;

    // 1) locate the header band: the y where the most column keywords appear
    let headerY = -1, headerScore = 0;
    words.forEach(w => {
      let sc = 0;
      KEYWORDS.forEach(k => { if (w.s.toUpperCase().includes(k)) sc++; });
      if (sc > headerScore) { headerScore = sc; headerY = w.y; }
    });
    if (headerScore < 6) {
      // page has no header (only page 1 does in this layout) — reuse nothing, skip page
      continue;
    }
    // header words: near the keyword cluster (some labels wrap up/down a few px)
    const headerWords = words.filter(w => Math.abs(w.y - headerY) <= 10).sort((a, b) => a.x - b.x);

    // 2) column anchors from the header words (left edge of each keyword)
    const anchors: Record<string, number> = {};
    const findAnchor = (kw: string): number | undefined => {
      const hits = headerWords.filter(w => w.s.toUpperCase().includes(kw)).map(w => w.x).sort((a, b) => a - b);
      return hits.length ? hits[0] : undefined;
    };
    const defs: Array<[string, string]> = [
      ['DO', 'DO'], ['PO Date', 'Purchase'], ['Customer', 'Customer'], ['Sales Exec', 'Sales'],
      ['Address', 'Address'], ['Items', 'Items'], ['Brand', 'Brand'], ['Desc', 'Description'],
      ['Qty', 'Qty'], ['Sale Price', 'Sale'], ['Label Ordered', 'Label'], ['Remarks', 'Remarks'],
    ];
    defs.forEach(([col, kw]) => {
      const x = findAnchor(kw);
      if (x !== undefined) anchors[col] = x - 2;
    });
    // Label Received: second 'Label' occurrence to the right of Label Ordered
    if (anchors['Label Ordered'] !== undefined) {
      const second = headerWords
        .filter(w => w.s.toUpperCase().includes('LABEL') && w.x > (anchors['Label Ordered'] ?? 0) + 8)
        .map(w => w.x).sort((a, b) => a - b)[0];
      if (second !== undefined) anchors['Label Received'] = second - 2;
    }
    const keys = COLS.filter(c => anchors[c] !== undefined);
    if (keys.length < 6) continue;
    const sortedAnchors = keys.map(k => anchors[k]).sort((a, b) => a - b);
    const bounds: Array<[number, number]> = sortedAnchors.map((v, i) => [v, i + 1 < sortedAnchors.length ? sortedAnchors[i + 1] : 10000]);
    const colOf = (x: number): number => {
      for (let j = bounds.length - 1; j >= 0; j--) { if (x >= bounds[j][0]) return j; }
      return 0;
    };
    const colName = (j: number): string => {
      const cname = keys[Math.min(j, keys.length - 1)];
      return cname;
    };

    // 3) per-column y-banded text
    const bands: Record<string, Array<{ y: number; text: string }>> = {};
    keys.forEach(k => { bands[k] = []; });
    words.forEach(w => {
      const j = colOf(w.x);
      const k = colName(j);
      const list = bands[k];
      const last = list[list.length - 1];
      if (last && Math.abs(last.y - w.y) <= 4) {
        last.text += (last.text ? ' ' : '') + w.s;
      } else {
        list.push({ y: w.y, text: w.s });
      }
    });
    // clean noise bands
    Object.keys(bands).forEach(k => {
      bands[k] = bands[k].filter(b =>
        !/^Pending Deliveries/i.test(b.text) &&
        !/^Today/i.test(b.text) &&
        !/Delivery Plan|Production Plan/i.test(b.text) &&
        !/^Product Name/i.test(b.text) &&
        !/^\(SKU\)/i.test(b.text) &&
        !/^Page \d+/i.test(b.text) &&
        !/^United States$/i.test(b.text)
      );
    });

    // 4) order blocks delimited by DO rows
    const doBands = [...bands['DO']].sort((a, b) => a.y - b.y);
    if (!doBands.length) continue;
    const blocks: Array<{ y0: number; y1: number; doNo: string }> = [];
    doBands.forEach((b, i) => {
      const y1 = i + 1 < doBands.length ? doBands[i + 1].y - 26 : 10000;
      blocks.push({ y0: b.y - 30, y1, doNo: b.text.replace(/\s+/g, ' ').trim() });
    });

    // 5) build orders per block
    blocks.forEach(blk => {
      const inB = (b: { y: number }) => b.y >= blk.y0 && b.y < blk.y1;
      const joinCol = (k: string) => (bands[k] || []).filter(inB).map(b => b.text).join(' ').replace(/\s+/g, ' ').trim();
      const customer = joinCol('Customer');
      if (!customer && !blk.doNo) return;
      const key = (blk.doNo + '|' + customer).toLowerCase();
      let o = ordersByKey.get(key);
      if (!o) {
        o = {
          ...blankOrder(),
          doNo: blk.doNo,
          poDate: joinCol('PO Date'),
          customerName: customer,
          salesExecutive: joinCol('Sales Exec'),
          address: joinCol('Address'),
          sourceFile: sourceName,
          updatedAt: new Date().toISOString(),
        };
        ordersByKey.set(key, o);
        orders.push(o);
      }
      // items: Qty bands in block -> nearest-y text from item/brand/desc/price/labels/remarks
      const qtyBands = (bands['Qty'] || []).filter(inB);
      qtyBands.forEach(qb => {
        const nearest = (k: string): string => {
          const list = (bands[k] || []).filter(inB);
          let best = '', bd = Infinity;
          list.forEach(b => { const d = Math.abs(b.y - qb.y); if (d < bd) { bd = d; best = b.text; } });
          return best;
        };
        o.items.push({
          ...emptyItem(),
          item: nearest('Items'),
          brand: nearest('Brand'),
          qty: qb.text.toUpperCase(),
          salePrice: (() => { const m = /\$?\s*(\d+(?:\.\d+)?)/.exec(nearest('Sale Price')); return m ? '$' + m[1] : nearest('Sale Price'); })(),
          labelOrdered: nearest('Label Ordered'),
          labelReceived: nearest('Label Received'),
          remarks: nearest('Remarks'),
        });
      });
    });
  }
  return orders;
}

async function aiExtractOrdersWithFallback(file: File, name: string): Promise<PendingDeliveryOrder[]> {
  try {
    return await aiExtractOrders(await dataUrlFromFile(file), name);
  } catch (e) {
    console.warn('AI extraction unavailable — using offline OCR:', e);
    const text = /\.pdf$/i.test(name) || file.type === 'application/pdf' ? await ocrPdfFile(file) : await ocrImageFile(file);
    return parseDeliveriesFromOcrText(text, name);
  }
}

async function aiExtractOrders(dataUrl: string, name: string): Promise<PendingDeliveryOrder[]> {
  const mimeType = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  const res = await fetch('/api/scan-pending-deliveries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: dataUrl, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const serverError = err.error || `Server returned ${res.status}`;
    throw new Error(
      `${serverError}. Note: scanned PDFs/photos need the AI extraction endpoint — make sure GEMINI_API_KEY is set in ERP-V44-main/.env and the dev server has been restarted.`
    );
  }
  const parsed = await res.json();
  const rawOrders: any[] = Array.isArray(parsed) ? parsed : parsed.orders || [];
  return rawOrders
    .filter((o: any) => o && (o.customerName || o.doNo))
    .map((o: any) => ({
      ...blankOrder(),
      doNo: String(o.doNo ?? '').trim(),
      poDate: String(o.poDate ?? '').trim(),
      customerName: String(o.customerName ?? '').trim(),
      salesExecutive: String(o.salesExecutive ?? '').trim(),
      address: String(o.address ?? '').trim(),
      region: String(o.region ?? '').trim(),
      items: (o.items || []).map((it: any) => ({
        ...emptyItem(),
        item: String(it.item ?? '').trim(),
        brand: String(it.brand ?? '').trim(),
        qty: String(it.qty ?? '').trim(),
        salePrice: String(it.salePrice ?? '').trim(),
        labelOrdered: String(it.labelOrdered ?? '').trim(),
        labelReceived: String(it.labelReceived ?? '').trim(),
        remarks: String(it.remarks ?? '').trim(),
      })),
      sourceFile: name,
      updatedAt: new Date().toISOString(),
    }));
}

export const PendingDeliveriesSection: React.FC<{ onNotify?: (msg: string) => void }> = ({ onNotify }) => {
  const [orders, setOrders] = useState<PendingDeliveryOrder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isEditable, setIsEditable] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [productFilters, setProductFilters] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<'all' | 'pending' | 'ordered' | 'received'>('all');
  const [viewTab, setViewTab] = useState<'deliveries' | 'production'>('deliveries');
  const [productionUploaded, setProductionUploaded] = useState<ProductionSheetData | null>(null);
  const [prodSource, setProdSource] = useState<'auto' | 'uploaded'>('auto');
  const [prodBusy, setProdBusy] = useState(false);
  const prodFileRef = useRef<HTMLInputElement>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  // Uploaded production sheet (separate store)
  useEffect(() => {
    migrateFromLS<ProductionSheetData | null>('gfi_production_v1').then(d => {
      if (d && (d as any)?.cols) setProductionUploaded(d);
    });
  }, []);

  // One-time cleanup: drop rows imported by the old offline-OCR path (pipes/garbage parties)
  useEffect(() => {
    setOrders(prev => {
      const cleaned = prev.filter(o => {
        const garbage =
          o.customerName.includes('|') ||
          (o.items || []).some(
            it => (it.remarks || '').includes('offline OCR') || (it.item || '').includes('|')
          );
        return !garbage;
      });
      return cleaned.length !== prev.length ? cleaned : prev;
    });
  }, []);
  useEffect(() => {
    if (productionUploaded) idbSet('gfi_production_v1', productionUploaded);
  }, [productionUploaded]);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileRecord[]>([]);
  // Refs keep the latest data for the unmount flush (never lose a status update)
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const filesRef = useRef(uploadedFiles);
  filesRef.current = uploadedFiles;
  const fileRef = useRef<HTMLInputElement>(null);

  // Load from IndexedDB (with one-time migration from legacy localStorage)
  useEffect(() => {
    (async () => {
      const saved = await migrateFromLS<PendingDeliveryOrder[]>(STORAGE_KEY);
      if (saved?.length) setOrders(saved);
      const files = await migrateFromLS<UploadedFileRecord[]>('gfi_pending_delivery_files_v1');
      if (files?.length) setUploadedFiles(files);
    })();
  }, []);

  // Persist to IndexedDB (debounced) — big datasets with images exceed localStorage quota
  useEffect(() => {
    const t = setTimeout(() => {
      idbSet(STORAGE_KEY, orders).then(ok => {
        if (ok) window.dispatchEvent(new CustomEvent('gfi-pending-deliveries-updated'));
      });
    }, 400);
    return () => clearTimeout(t);
  }, [orders]);

  useEffect(() => {
    const t = setTimeout(() => {
      idbSet('gfi_pending_delivery_files_v1', uploadedFiles);
    }, 400);
    return () => clearTimeout(t);
  }, [uploadedFiles]);

  // Unmount flush: guarantee the very latest orders/files are persisted even if the
  // user navigates away within the debounce window. Every listener re-reads IndexedDB
  // when this event fires, so status changes propagate everywhere automatically.
  useEffect(() => {
    return () => {
      idbSet(STORAGE_KEY, ordersRef.current).then(ok => {
        if (ok) window.dispatchEvent(new CustomEvent('gfi-pending-deliveries-updated'));
      });
      idbSet('gfi_pending_delivery_files_v1', filesRef.current);
    };
  }, []);

  const regions = Array.from(new Set(orders.map(o => o.region || 'Unassigned')));

  // Product family for the product-wise filter: e.g. "MAIZO CORN OIL FUTURA (128 FL OZ X 4)"
  // → family "MAIZO CORN OIL FUTURA" (everything before the pack-size parenthesis)
  const productFamily = (item: string): string => {
    const base = item.toUpperCase().split('(')[0];
    const fam = base.replace(/[^A-Z& ]/g, ' ').replace(/\s+/g, ' ').trim();
    return fam || item.toUpperCase().slice(0, 30);
  };

  const productOptions = (() => {
    const counts = new Map<string, number>();
    orders.forEach(o =>
      o.items.forEach(it => {
        const f = productFamily(it.item);
        if (f) counts.set(f, (counts.get(f) || 0) + 1);
      })
    );
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  const filtered = orders
    .filter(o => regionFilter === 'all' || (o.region || 'Unassigned') === regionFilter)
    .filter(o => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        o.customerName.toLowerCase().includes(q) ||
        o.doNo.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        o.items.some(it => it.item.toLowerCase().includes(q) || it.brand.toLowerCase().includes(q))
      );
    })
    .map(o => {
      let items = o.items;
      if (productFilters.length) items = items.filter(it => productFilters.includes(productFamily(it.item)));
      if (labelFilter !== 'all') {
        items = items.filter(it => {
          const ordered = (it.labelOrdered || '').toLowerCase();
          const received = (it.labelReceived || '').toLowerCase();
          const isReceived = received.includes('received');
          const isPending = ordered.includes('not') || received.includes('not') || (!ordered && !received);
          if (labelFilter === 'pending') return isPending && !isReceived;
          if (labelFilter === 'ordered') return ordered.includes('yes');
          return isReceived;
        });
      }
      return { ...o, items };
    })
    .filter(o => o.items.length > 0);

  const filteredItemCount = filtered.reduce((a, o) => a + o.items.length, 0);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setStatusMsg(null);
    let collected: PendingDeliveryOrder[] = [];
    let sheetsInfo = '';

    try {
      for (const file of Array.from(files)) {
        const name = file.name;
        if (/\.(xlsx|xls|csv)$/i.test(name)) {
          const { orders: parsedOrders, sheets } = await parseWorkbookToOrders(await file.arrayBuffer(), name);
          collected.push(...parsedOrders);
          if (!parsedOrders.length) {
            sheetsInfo += `${name} → sheets: ${sheets.join(', ')}; `;
          }
        } else if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
          // PDF: try text extraction first (works for text-based PDFs), else AI endpoint
          let text = '';
          // 1) Exact inverse parser for the app's own "Pending Orders" export — 100% accurate
          try {
            const exportRows = await pdfTextRows(file);
            const exportOrders = parsePendingOrdersExportPdf(exportRows, name);
            if (exportOrders.length) {
              collected.push(...exportOrders);
              continue;
            }
          } catch (e) {
            console.warn('Export-PDF exact parse skipped:', e);
          }
          // 2) Line-based parse of the printed "Pending Deliveries" sheet layout
          try {
            const sheetRows = await pdfTextRows(file);
            const sheetOrders = parseSheetDeliveriesPdf(sheetRows, name);
            if (sheetOrders.length) {
              collected.push(...sheetOrders);
              continue;
            }
          } catch (e) {
            console.warn('Sheet-layout PDF parse skipped:', e);
          }
          // 3) Generic PDF text (informational) — then AI/offline-OCR fallbacks
          try {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            const chunks: string[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              chunks.push(content.items.map((it: any) => it.str).join(' '));
            }
            text = chunks.join('\n');
          } catch (e) {
            console.warn('PDF text extraction failed:', e);
          }
          collected.push(...(await aiExtractOrdersWithFallback(file, name)));
        } else {
          collected.push(...(await aiExtractOrdersWithFallback(file, name)));
        }
      }

      if (!collected.length) {
        setStatusMsg({
          kind: 'error',
          text: `No delivery orders could be extracted. ${sheetsInfo ? `Scanned: ${sheetsInfo}. ` : ''}The sheet needs a header row with columns like "DO No", "PO Date", "Customer Name", "Address", "Item", "Brand", "Qty", "Sale Price", "Label Ordered", "Label Received", "Remarks". Send me your exact column names and I'll add them.`,
        });
      } else {
        // Show ONLY what's in the uploaded sheet — replace everything else.
        // Re-uploading an updated sheet refreshes the data in place.
        setOrders(collected);
        // Keep the uploaded source files attached to this section permanently
        for (const file of Array.from(files)) {
          const dataUrl = await dataUrlFromFile(file);
          setUploadedFiles(prev =>
            prev.some(f => f.name === file.name)
              ? prev
              : [
                  ...prev,
                  {
                    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    name: file.name,
                    dataUrl,
                    size: file.size,
                    uploadedAt: new Date().toISOString(),
                  },
                ]
          );
        }
        setStatusMsg({
          kind: 'ok',
          text: `${collected.length} delivery order${collected.length !== 1 ? 's' : ''} imported and updated automatically. The uploaded file is kept in this section.`,
        });
        onNotify?.(`✅ ${collected.length} delivery order(s) imported.`);
      }
    } catch (err: any) {
      console.error('Pending deliveries upload failed:', err);
      setStatusMsg({ kind: 'error', text: err.message || 'Failed to process the uploaded file.' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deriveItemStatus = (it: PendingDeliveryItem): 'Ready' | '' =>
    it.status
      ? (it.status as 'Ready' | '')
      : /received/i.test(it.labelReceived) || /ready/i.test(it.remarks)
      ? 'Ready'
      : '';

  const handleItemEdit = (orderId: string, itemId: string, patch: Partial<PendingDeliveryItem>) => {
    setOrders(prev =>
      prev.map(o =>
        o.id !== orderId
          ? o
          : {
              ...o,
              items: o.items.map(it => (it.id === itemId ? { ...it, ...patch } : it)),
              updatedAt: new Date().toISOString(),
            }
      )
    );
  };
  // ---- Print/PDF + Production-matrix helpers ----
  const printHtml = (html: string) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 300);
    setTimeout(() => iframe.remove(), 60000);
  };

  const extractSize = (item: string): string => {
    const m = item.match(/\(([^)]+)\)/);
    return m ? m[1].trim() : '';
  };

  const parsePallets = (qty: string): number => {
    const t = (qty || '').toUpperCase().replace(/\s+/g, ' ');
    const half = t.match('1/2\\s*PALLET');
    if (half) return 0.5;
    const mult = t.match('(\\d+(?:\\.\\d+)?)\\s*X\\s*(\\d+(?:\\.\\d+)?)\\s*PALLET');
    if (mult) return parseFloat(mult[2]) || 0;
    const single = t.match('(\\d+(?:\\.\\d+)?)\\s*PALLET');
    if (single) return parseFloat(single[1]) || 0;
    return 0;
  };

  const labelShort = (it: PendingDeliveryItem): string => {
    const received = (it.labelReceived || '').toLowerCase();
    if (received.includes('received')) return 'Available';
    if ((it.labelOrdered || '').toLowerCase().includes('not') || received.includes('not')) return 'Not Label';
    return it.labelReceived || it.labelOrdered || '';
  };

  const fmtP = (n: number): string => {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? r.toString() : r.toFixed(2);
  };

  const pdfShell = (title: string, bodyHtml: string): string => {
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>' +
      'body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 18px; }' +
      '.head { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 10px; }' +
      '.head img { height: 52px; }' +
      '.head h1 { font-size: 16px; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }' +
      '.head .sub { font-size: 11px; color: #444; }' +
      'h2.prod { font-size: 13px; margin: 14px 0 6px; background: #ffe97a; border: 1px solid #333; padding: 3px 8px; text-transform: uppercase; }' +
      'h3.size { font-size: 11.5px; margin: 10px 0 4px; }' +
      'table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }' +
      'th, td { border: 1px solid #555; padding: 3px 6px; text-align: left; }' +
      'th { background: #eee; text-transform: uppercase; font-size: 10px; }' +
      'td.num, th.num { text-align: right; font-family: \'Courier New\', monospace; }' +
      'tr.total td { font-weight: bold; background: #f3f3f3; }' +
      'tr.totalblue td { background: #0d5ddd; color: #ffffff; font-weight: bold; border-color: #0d5ddd; }' +
      'tr.totalblue td.num { color: #ffe97a; }' +
      '.foot { margin-top: 14px; border-top: 1px solid #999; padding-top: 6px; font-size: 9.5px; color: #555; display: flex; justify-content: space-between; }' +
      '.oilbar { background: #111; color: #fff; padding: 6px 10px; font-size: 13px; margin-bottom: 10px; }' +
      '.oilbar .lbl { color: #ffd54a; font-weight: bold; letter-spacing: 1px; }' +
      '.oilbar .sects { font-size: 10px; color: #bbb; }' +
      '.grand { border: 2px solid #111; background: #ffe97a; padding: 8px 12px; font-size: 14px; margin-top: 6px; display: flex; justify-content: space-between; }' +
      '.grand b { font-size: 16px; }' +
      '@page { size: A4 portrait; margin: 12mm; }' +
      '</style></head><body>' +
      '<div class="head"><img src="' + GLOBAL_FUTURA_LOGO_PATH + '" alt="Global Futura Inc." />' +
      '<div><h1>' + title + '</h1><div class="sub">Global Futura Inc. \u2022 Generated ' + new Date().toLocaleDateString() + ' \u2022 Printed ' + new Date().toLocaleTimeString() + '</div></div></div>' +
      bodyHtml +
      '<div class="foot"><span>Global Futura Inc. Operations Suite</span><span>Page 1</span></div>' +
      '</body></html>';
  };

  const buildPendingPdfHtml = (): string => {
    const fams = new Map<string, Map<string, Array<{ party: string; brand: string; pallets: number; label: string; status: string }>>>();
    filtered.forEach(o =>
      o.items.forEach(it => {
        const fam = productFamily(it.item);
        const size = extractSize(it.item) || 'Other';
        if (!fams.has(fam)) fams.set(fam, new Map());
        const sizes = fams.get(fam)!;
        if (!sizes.has(size)) sizes.set(size, []);
        sizes.get(size)!.push({
          party: o.customerName,
          brand: it.brand || '',
          pallets: parsePallets(it.qty),
          label: labelShort(it) || '\u2014',
          status: it.remarks || it.status || '\u2014',
        });
      })
    );
    let body = '';
    const famNames = productFilters.length ? productFilters : Array.from(fams.keys()).sort();
    let grandTotal = 0;
    famNames.forEach(fam => {
      const sizes = fams.get(fam);
      if (!sizes) return;
      body += '<h2 class="prod">' + fam + '</h2>';
      Array.from(sizes.keys()).sort().forEach(size => {
        const list = sizes.get(size)!;
        const total = list.reduce((a, r) => a + r.pallets, 0);
        grandTotal += total;
        body += '<h3 class="size">' + fam + ' ' + size + '</h3>';
        body += '<table><thead><tr><th>Party Name</th><th>BRAND</th><th>SIZE</th><th class="num">Quantity (Pallets)</th><th>Label</th><th>Status</th></tr></thead><tbody>';
        list.forEach(r => {
          body += '<tr><td>' + r.party + '</td><td>' + r.brand + '</td><td>' + size + '</td><td class="num">' + fmtP(r.pallets) + ' PALLETS</td><td>' + r.label + '</td><td>' + r.status + '</td></tr>';
        });
        body += '<tr class="totalblue"><td colspan="3">TOTAL PALLETS FOR THIS SIZE (' + size + ')</td><td class="num">' + fmtP(total) + ' PALLETS</td><td colspan="2"></td></tr>';
        body += '</tbody></table>';
      });
    });
    const oilLine = '<div class="oilbar"><span class="lbl">OIL:</span> <b>' + (famNames.join('  +  ') || 'All Products') + '</b>' +
      ' <span class="sects">(' + famNames.length + ' product' + (famNames.length !== 1 ? 's' : '') + ' listed below)</span></div>';
    const grandBar = '<div class="grand"><span>TOTAL PALLETS NEEDED:</span> <b>' + fmtP(grandTotal) + '</b></div>';
    return pdfShell(
      'Pending Orders' + (famNames.length === 1 ? ' - ' + famNames[0] : ''),
      oilLine + body + grandBar
    );
  };

  // ---- Production uploads (XLS matrix / PDF) ----
  // Precise offline parse of a text-based Production Sheet PDF using text positions:
  // column anchors come from header rows; numeric cells are assigned to the nearest column.
  const parseProductionFromTextRows = (rows: PdfTextRow[], sourceName: string): ProductionSheetData | null => {
    const isNum = (t: string) => /^\d+(\.\d+)?$/.test(t.trim());
    // merge horizontally-adjacent fragments into cells
    const merged = rows
      .map(r => {
        const cells: Array<{ x: number; s: string }> = [];
        r.cells.forEach(c => {
          const last = cells[cells.length - 1];
          if (last && c.x - last.x < 14) last.s += ' ' + c.s;
          else cells.push({ x: c.x, s: c.s });
        });
        const clean = cells.map(c => ({ x: c.x, s: c.s.trim() })).filter(c => c.s);
        return { y: r.y, cells: clean };
      })
      .filter(r => r.cells.length > 0);

    // first data row: name in col0 + at least 2 numeric cells
    let dataIdx = -1;
    merged.forEach((r, i) => {
      if (dataIdx >= 0) return;
      const c0 = r.cells[0]?.s || '';
      const nums = r.cells.slice(1).filter(c => isNum(c.s)).length;
      if (c0 && !isNum(c0) && nums >= 2) dataIdx = i;
    });
    if (dataIdx < 1) return null;

    const dataRow = merged[dataIdx];
    // column anchors: x positions of numeric cells in the first data row
    const anchors = dataRow.cells.filter(c => isNum(c.s)).map(c => c.x);
    if (anchors.length < 2) return null;

    // labels from the header rows above (assign each header text to the nearest anchor)
    const labels = anchors.map(() => '');
    const headerRows = merged.slice(Math.max(0, dataIdx - 2), dataIdx);
    headerRows.forEach(hr => {
      hr.cells.forEach(c => {
        if (isNum(c.s) || /^total/i.test(c.s)) return;
        let bi = -1, bd = Infinity;
        anchors.forEach((ax, i) => {
          const d = Math.abs(ax - c.x);
          if (d < bd) { bd = d; bi = i; }
        });
        if (bi >= 0 && bd < 90) labels[bi] = (labels[bi] ? labels[bi] + ' ' : '') + c.s;
      });
    });
    const colLabels = labels.map(l => l.trim().replace(/\s+/g, ' ') || 'Qty');

    const dataRows: Array<{ client: string; cells: number[] }> = [];
    let pendingName = '';
    for (let i = dataIdx; i < merged.length; i++) {
      const r = merged[i];
      const c0 = r.cells[0]?.s || '';
      const numericCells = r.cells.filter(c => isNum(c.s));
      if (/^total/i.test(c0)) break;
      if (!numericCells.length) {
        pendingName = (pendingName ? pendingName + ' ' : '') + r.cells.map(c => c.s).join(' ');
        continue;
      }
      const client = ((pendingName ? pendingName + ' ' : '') + c0).replace(/\s+/g, ' ').trim();
      pendingName = '';
      const cells = anchors.map(() => 0);
      r.cells.forEach(c => {
        if (!isNum(c.s)) return;
        let bi = -1, bd = Infinity;
        anchors.forEach((ax, ai) => {
          const d = Math.abs(ax - c.x);
          if (d < bd) { bd = d; bi = ai; }
        });
        if (bi >= 0) cells[bi] += parseFloat(c.s) || 0;
      });
      if (cells.some(v => v > 0)) dataRows.push({ client, cells });
    }
    if (dataRows.length < 2) return null;
    const colTotals = colLabels.map((_, i) => dataRows.reduce((a, r) => a + (r.cells[i] || 0), 0));
    const grand = colTotals.reduce((a: number, b: number) => a + b, 0);
    return {
      id: 'prod-' + Date.now(),
      cols: colLabels,
      rows: dataRows,
      colTotals,
      grand,
      sourceFile: sourceName,
      updatedAt: new Date().toISOString(),
    };
  };

  const parseProductionMatrixWorkbook = async (buf: ArrayBuffer, sourceName: string): Promise<ProductionSheetData | null> => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
      if (!rows.length) continue;
      let dataStart = -1;
      for (let r = 0; r < Math.min(rows.length, 40); r++) {
        const row = rows[r] || [];
        const nums = row.slice(1).filter((c: any) => typeof c === 'number' || /^\d+(\.\d+)?$/.test(String(c ?? '').trim())).length;
        if (String(row[0] ?? '').trim() && nums >= 2) { dataStart = r; break; }
      }
      if (dataStart < 0) continue;
      const h1 = rows[dataStart - 2] || [];
      const h2 = rows[dataStart - 1] || [];
      const width = Math.max((rows[dataStart] || []).length, h1.length, h2.length);
      const colIdx: number[] = [];
      const labels: string[] = [];
      for (let c = 1; c < width; c++) {
        const a = String(h1[c] ?? '').trim();
        const b = String(h2[c] ?? '').trim();
        const label = [a, b].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        if (/^total/i.test(label) || !label) continue;
        colIdx.push(c);
        labels.push(label);
      }
      if (colIdx.length < 2) continue;
      const dataRows: Array<{ client: string; cells: number[] }> = [];
      for (let r = dataStart; r < rows.length; r++) {
        const row = rows[r] || [];
        const client = String(row[0] ?? '').trim();
        if (!client || /^total/i.test(client)) continue;
        const cells = colIdx.map(ci => {
          const raw = String(row[ci] ?? '').trim();
          const v = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
          return isNaN(v) ? 0 : v;
        });
        if (cells.some(v => v > 0)) dataRows.push({ client, cells });
      }
      if (dataRows.length < 2) continue;
      const colTotals = labels.map((_, i) => dataRows.reduce((a, r) => a + (r.cells[i] || 0), 0));
      const grand = colTotals.reduce((a, b) => a + b, 0);
      return { id: 'prod-' + Date.now(), cols: labels, rows: dataRows, colTotals, grand, sourceFile: sourceName, updatedAt: new Date().toISOString() };
    }
    return null;
  };

  const handleProductionFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setProdBusy(true);
    try {
      let matrix: ProductionSheetData | null = null;
      for (const file of Array.from(files)) {
        const name = file.name;
        if (/\.(xlsx|xls|csv)$/i.test(name)) {
          matrix = await parseProductionMatrixWorkbook(await file.arrayBuffer(), name);
        } else {
          // 1) Precise offline parse from PDF text positions (no key, no server)
          if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
            try {
              const textRows = await pdfTextRows(file);
              matrix = parseProductionFromTextRows(textRows, name);
            } catch (e) {
              console.warn('Production PDF text-row parse failed:', e);
            }
          }
          // 2) Offline OCR fallback (photos / scanned sheets)
          let text = '';
          if (!matrix) {
            try {
              text = /\.pdf$/i.test(name) || file.type === 'application/pdf' ? await ocrPdfFile(file) : await ocrImageFile(file);
            } catch {}
          }
          try {
            const res = await fetch('/api/scan-production', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: await dataUrlFromFile(file), mimeType: file.type || 'application/pdf' }),
            });
            if (res.ok) {
              const parsed = await res.json();
              if (parsed?.cols?.length && parsed?.rows?.length) {
                const cols = parsed.cols.map((c: any) => String(c).trim()).filter(Boolean);
                const rows = parsed.rows.map((r: any) => ({ client: String(r.client ?? '').trim(), cells: (r.cells || []).map((v: any) => Number(v) || 0) }));
                const colTotals = cols.map((_: string, i: number) => rows.reduce((a: number, r: { cells: number[] }) => a + (r.cells[i] || 0), 0));
                matrix = { id: 'prod-' + Date.now(), cols, rows, colTotals, grand: colTotals.reduce((a: number, b: number) => a + b, 0), sourceFile: name, updatedAt: new Date().toISOString() };
              }
            }
          } catch {}
          if (!matrix && text.trim()) {
            const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
            let headerIdx = -1, best = 0;
            lines.forEach((l, i) => {
              const alpha = (l.match(/[A-Za-z]/g) || []).length;
              if (alpha > best) { best = alpha; headerIdx = i; }
            });
            if (headerIdx >= 0) {
              const headerCells = lines[headerIdx].split(/ {2,}|\t/).map(x => x.trim()).filter(Boolean);
              const colLabels = headerCells.slice(1).filter(h => !/^total/i.test(h));
              if (colLabels.length >= 2) {
                const dataRows: Array<{ client: string; cells: number[] }> = [];
                lines.slice(headerIdx + 1).forEach(l => {
                  const cells = l.split(/ {2,}|\t/).map(x => x.trim()).filter(Boolean);
                  if (cells.length < 2 || /^total/i.test(cells[0])) return;
                  const vals = cells.slice(1).map(v => { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; });
                  dataRows.push({ client: cells[0], cells: vals });
                });
                if (dataRows.length >= 2) {
                  const norm = dataRows.map(r => ({ client: r.client, cells: Array.from({ length: colLabels.length }, (_, i) => r.cells[i] || 0) }));
                  const colTotals = colLabels.map((_, i) => norm.reduce((a, r) => a + (r.cells[i] || 0), 0));
                  matrix = { id: 'prod-' + Date.now(), cols: colLabels, rows: norm, colTotals, grand: colTotals.reduce((a: number, b: number) => a + b, 0), sourceFile: name, updatedAt: new Date().toISOString() };
                }
              }
            }
          }
        }
      }
      if (matrix) {
        setProductionUploaded(matrix);
        setProdSource('uploaded');
        SoundEngine.play('success');
        onNotify?.('Production sheet imported: ' + matrix.rows.length + ' clients x ' + matrix.cols.length + ' products.');
      } else {
        onNotify?.('Could not read a production matrix from the file. Recommended: upload the Production Sheet as XLS.');
      }
    } catch (e: any) {
      onNotify?.(e?.message || 'Failed to process the production file.');
    } finally {
      setProdBusy(false);
      if (prodFileRef.current) prodFileRef.current.value = '';
    }
  };

  const buildProductionMatrix = () => {
    // Uploaded production sheet takes precedence when selected
    if (prodSource === 'uploaded' && productionUploaded) {
      const cols = productionUploaded.cols.map(label => ({ key: label, label }));
      const rowsMap = new Map<string, Map<string, number>>();
      productionUploaded.rows.forEach(r => {
        const m = new Map<string, number>();
        cols.forEach((c, i) => {
          const v = r.cells[i];
          if (typeof v === 'number' && v > 0) m.set(c.key, v);
        });
        rowsMap.set(r.client, m);
      });
      const rowNames = productionUploaded.rows.map(r => r.client);
      const colTotals = cols.map(c => Array.from(rowsMap.values()).reduce((a, m) => a + (m.get(c.key) || 0), 0));
      const grand = colTotals.reduce((a, b) => a + b, 0);
      return { cols, rowsMap, rowNames, colTotals, grand };
    }

    const cols: Array<{ key: string; label: string }> = [];
    const colSet = new Set<string>();
    const rowsMap = new Map<string, Map<string, number>>();
    filtered.forEach(o =>
      o.items.forEach(it => {
        const fam = productFamily(it.item);
        const size = extractSize(it.item) || 'Other';
        const key = fam + '|' + size;
        if (!colSet.has(key)) { colSet.add(key); cols.push({ key, label: fam + ' ' + size }); }
        const rowKey = o.customerName.trim();
        if (!rowsMap.has(rowKey)) rowsMap.set(rowKey, new Map());
        const m = rowsMap.get(rowKey)!;
        m.set(key, (m.get(key) || 0) + parsePallets(it.qty));
      })
    );
    const rowNames = Array.from(rowsMap.keys()).sort();
    const colTotals = cols.map(c => Array.from(rowsMap.values()).reduce((a, m) => a + (m.get(c.key) || 0), 0));
    const grand = colTotals.reduce((a, b) => a + b, 0);
    return { cols, rowsMap, rowNames, colTotals, grand };
  };

  const buildProductionPdfHtml = (): string => {
    const m = buildProductionMatrix();
    let head = '<tr><th style="min-width:140px">Total of Client</th>';
    m.cols.forEach(c => { head += '<th>' + c.label + '</th>'; });
    head += '</tr>';
    let bodyRows = '';
    m.rowNames.forEach(rn => {
      const m2 = m.rowsMap.get(rn)!;
      const rowTotal = m.cols.reduce((a, c) => a + (m2.get(c.key) || 0), 0);
      bodyRows += '<tr><td>' + rn + '</td>';
      m.cols.forEach(c => {
        const v = m2.get(c.key);
        bodyRows += '<td class="num">' + (v ? fmtP(v) : '') + '</td>';
      });
      bodyRows += '<td class="num">' + fmtP(rowTotal) + '</td></tr>';
    });
    let totalRow = '<tr class="total"><td>Total</td>';
    m.colTotals.forEach(v => { totalRow += '<td class="num">' + fmtP(v) + '</td>'; });
    totalRow += '<td class="num">' + fmtP(m.grand) + '</td></tr>';
    const body = '<h2 class="prod">Production Sheet - Pallets by Client & Product</h2><table><thead>' + head + '</thead><tbody>' + bodyRows + '</tbody><tfoot>' + totalRow + '</tfoot></table>';
    return pdfShell('Production Sheet', body);
  };

  // Save PDF as an actual downloadable file (jsPDF) — pending orders layout
  const handleSavePendingPdf = async () => {
    const fams = new Map<string, Map<string, Array<{ party: string; brand: string; pallets: number; label: string; status: string }>>>();
    filtered.forEach(o =>
      o.items.forEach(it => {
        const fam = productFamily(it.item);
        const size = extractSize(it.item) || 'Other';
        if (!fams.has(fam)) fams.set(fam, new Map());
        const sizes = fams.get(fam)!;
        if (!sizes.has(size)) sizes.set(size, []);
        sizes.get(size)!.push({
          party: o.customerName,
          brand: it.brand || '',
          pallets: parsePallets(it.qty),
          label: labelShort(it) || '-',
          status: it.remarks || it.status || '-',
        });
      })
    );
    const sections: Array<{ heading?: string; head: string[]; body: Array<Array<string | number>>; numericFrom?: number }> = [];
    const famNames = productFilters.length ? productFilters : Array.from(fams.keys()).sort();
    let grandTotal = 0;
    famNames.forEach(fam => {
      const sizes = fams.get(fam);
      if (!sizes) return;
      Array.from(sizes.keys()).sort().forEach(size => {
        const list = sizes.get(size)!;
        const total = list.reduce((a, r) => a + r.pallets, 0);
        grandTotal += total;
        sections.push({
          heading: fam + ' — ' + size,
          head: ['Party Name', 'BRAND', 'SIZE', 'Quantity (Pallets)', 'Label', 'Status'],
          numericFrom: 3,
          body: [
            ...list.map(r => [r.party, r.brand, size, fmtP(r.pallets) + ' PALLETS', r.label, r.status]),
            ['TOTAL PALLETS FOR THIS SIZE (' + size + ')', '', '', fmtP(total) + ' PALLETS', '', ''],
          ],
        });
      });
    });
    sections.push({
      heading: 'TOTAL PALLETS NEEDED',
      head: ['Oil(s)', 'Total Pallets'],
      body: [[famNames.join(' + ') || 'All Products', fmtP(grandTotal)]],
    });
    const stamp = new Date().toISOString().slice(0, 10);
    await savePdfTable({
      filename: 'Pending-Orders' + (productFilters.length === 1 ? '-' + productFilters[0].replace(/[^A-Za-z0-9]+/g, '-') : '') + '_' + stamp + '.pdf',
      title: 'Pending Orders' + (productFilters.length === 1 ? ' — ' + productFilters[0] : ''),
      subtitle: 'Oil: ' + (famNames.join(' + ') || 'All Products') + ' \u2022 Filtered delivery items \u2022 ' + filtered.reduce((a, o) => a + o.items.length, 0) + ' items across ' + filtered.length + ' orders \u2022 TOTAL PALLETS NEEDED: ' + fmtP(grandTotal),
      sections,
    });
    SoundEngine.play('success');
  };

  // Save Production Sheet as an actual downloadable PDF file
  const handleSaveProductionPdf = async () => {
    const m = buildProductionMatrix();
    const head = ['Total of Client', ...m.cols.map(c => c.label), 'Total'];
    const body: Array<Array<string | number>> = m.rowNames.map(rn => {
      const m2 = m.rowsMap.get(rn)!;
      const rowTotal = m.cols.reduce((a, c) => a + (m2.get(c.key) || 0), 0);
      return [rn, ...m.cols.map(c => (m2.get(c.key) ? fmtP(m2.get(c.key)!) : '')), fmtP(rowTotal)];
    });
    body.push(['Total', ...m.colTotals.map(v => fmtP(v)), fmtP(m.grand)]);
    await savePdfTable({
      filename: 'Production-Sheet_' + new Date().toISOString().slice(0, 10) + '.pdf',
      title: 'Production Sheet',
      subtitle: 'Pallets by client & product \u2022 ' + m.rowNames.length + ' clients \u2022 Grand total ' + fmtP(m.grand) + ' pallets',
      sections: [{ head, body, numericFrom: 1 }],
      landscape: true,
    });
    SoundEngine.play('success');
  };

  const handleDownloadProductionXLS = async () => {
    const XLSX = await import('xlsx');
    const m = buildProductionMatrix();
    const aoa: any[][] = [['Total of Client', ...m.cols.map(c => c.label), 'Total']];
    m.rowNames.forEach(rn => {
      const m2 = m.rowsMap.get(rn)!;
      const rowTotal = m.cols.reduce((a, c) => a + (m2.get(c.key) || 0), 0);
      aoa.push([rn, ...m.cols.map(c => m2.get(c.key) || ''), rowTotal]);
    });
    aoa.push(['Total', ...m.colTotals, m.grand]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wbb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbb, ws, 'Production Sheet');
    XLSX.writeFile(wbb, 'Production-Sheet_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    SoundEngine.play('success');
  };

  const toggleProduct = (fam: string) =>
    setProductFilters(prev =>
      prev.includes(fam) ? prev.filter(f => f !== fam) : [...prev, fam]
    );

  // Download filtered deliveries as XLS — mirrors the original workbook format:
  // one sheet per source table ("Table 1"..."Table N"), same column positions
  // (DO No | PO Date | Customer | Sales Exec | Address | Item | Brand | Description |
  //  Qty | Sale Price | Label Ordered | Label Received | Remarks)
  const handleDownloadXLS = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const groups = new Map<string, PendingDeliveryOrder[]>();
    filtered.forEach(o => {
      const key = o.sourceSheet || 'Table 1';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    });

    const used = new Set<string>();
    const safeSheet = (name: string) => {
      let n = (name || 'Table').replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Table';
      const base = n;
      let i = 2;
      while (used.has(n)) n = base.slice(0, 28) + ' ' + i++;
      used.add(n);
      return n;
    };

    groups.forEach((groupOrders, sheetName) => {
      const rows: any[][] = [];
      groupOrders.forEach(o => {
        o.items.forEach((it, idx) => {
          const desc = it.description || '';
          const itemBase =
            desc && it.item.toLowerCase().endsWith(desc.toLowerCase())
              ? it.item.slice(0, it.item.length - desc.length).trim()
              : it.item;
          const row = new Array(14).fill('');
          if (idx === 0) {
            row[0] = o.doNo;
            row[1] = o.poDate;
            row[2] = o.customerName;
            row[3] = o.salesExecutive;
            row[4] = o.address;
          }
          row[5] = itemBase;
          row[6] = it.brand || '';
          row[7] = desc;
          row[8] = it.qty || '';
          row[9] = it.salePrice || '';
          row[10] = it.labelOrdered || '';
          row[11] = it.labelReceived || '';
          row[13] = it.remarks || '';
          rows.push(row);
        });
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, safeSheet(sheetName));
    });

    const parts: string[] = ['Pending-Deliveries'];
    if (regionFilter !== 'all') parts.push(regionFilter.replace(/[^A-Za-z0-9]+/g, '-'));
    if (productFilters.length) parts.push(productFilters.map(f => f.replace(/[^A-Za-z0-9]+/g, '-')).join('_').slice(0, 60));
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, parts.join('_') + '_' + stamp + '.xlsx');
    SoundEngine.play('success');
    onNotify?.('Downloaded ' + filtered.reduce((a, o) => a + o.items.length, 0) + ' items across ' + filtered.length + ' orders as XLS (' + groups.size + ' sheet' + (groups.size !== 1 ? 's' : '') + ').');
  };

  // Built-in AI / manual add: create a new blank delivery order (editable inline)
  const handleAddOrder = () => {
    const o = blankOrder();
    o.customerName = 'New Delivery Order';
    o.doNo = String(1200 + orders.length);
    o.poDate = new Date().toLocaleDateString('en-GB').replace(/ /g, '');
    o.items = [{ ...emptyItem() }];
    o.updatedAt = new Date().toISOString();
    setOrders(prev => [...prev, o]);
    setIsEditable(true);
    setExpandedOrder(o.id);
    SoundEngine.play('pop');
    onNotify?.('New delivery order added — fill in the details and upload a photo if needed.');
  };

  // AI extraction status pill: scanned PDFs/photos go through the built-in AI endpoint
  const aiHint = 'AI: upload a scanned PDF or photo of the delivery sheet and every DO, item, price and label status is extracted automatically.';


  const totalItems = orders.reduce((a, o) => a + o.items.length, 0);
  const prodMatrix = viewTab === 'production' ? buildProductionMatrix() : null;
  const showDeliveries = viewTab === 'deliveries';

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
            <Truck className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Pending Deliveries
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Delivery orders by region — DO No, PO Date, Customer, Items with brand images, Qty, Prices, Labels & Remarks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,image/*"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => setIsEditable(!isEditable)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              isEditable
                ? 'bg-amber-500 text-slate-950 border-amber-600'
                : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditable ? 'Editing Active' : 'Edit'}</span>
          </button>
          <button
            type="button"
            onClick={handleAddOrder}
            className="px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-amber-500/20 transition-colors"
            title="Add a new delivery order manually"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Delivery Order</span>
          </button>
          <span className="text-[9.5px] text-slate-400 dark:text-slate-500 max-w-40 leading-tight">{aiHint}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <div className="relative">
              <button
                type="button"
                disabled={orders.length === 0}
                onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
                className="px-3.5 py-2 rounded-xl border-2 border-emerald-600 disabled:opacity-50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download ▾</span>
              </button>
              {downloadMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setDownloadMenuOpen(false)} />
                  <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1.5">
                    {([
                      ['Deliveries — XLS', () => handleDownloadXLS()],
                      ['Deliveries — PDF (print / save as PDF)', () => printHtml(buildPendingPdfHtml())],
                      ['Deliveries — Save PDF file', () => handleSavePendingPdf()],
                      ['Production — XLS', () => handleDownloadProductionXLS()],
                      ['Production — PDF (print / save as PDF)', () => printHtml(buildProductionPdfHtml())],
                      ['Production — Save PDF file', () => handleSaveProductionPdf()],
                    ] as Array<[string, () => void]>).map(([label, fn]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => { setDownloadMenuOpen(false); fn(); }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{busy ? 'Processing…' : 'Upload PDF / Picture / XLS'}</span>
          </button>
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${
            statusMsg.kind === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {statusMsg.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* View tabs: Deliveries vs Production */}
      {orders.length > 0 && (
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs font-black">
          <button
            type="button"
            onClick={() => setViewTab('deliveries')}
            className={`px-4 py-1.5 rounded-lg transition-colors cursor-pointer ${viewTab === 'deliveries' ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Deliveries
          </button>
          <button
            type="button"
            onClick={() => setViewTab('production')}
            className={`px-4 py-1.5 rounded-lg transition-colors cursor-pointer ${viewTab === 'production' ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Production
          </button>
        </div>
      )}

      {/* Search + region filter */}
      {orders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search customer, DO No, item…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-52 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRegionFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border cursor-pointer transition-colors ${
                regionFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              All Regions ({orders.length})
            </button>
            {regions.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRegionFilter(r)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border cursor-pointer transition-colors ${
                  regionFilter === r
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Product-wise filter — multi-select: pick one or many oils/products */}
          {productOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 relative">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProductDropdownOpen(!productDropdownOpen)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    productFilters.length
                      ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  Filter Products{productFilters.length ? ` (${productFilters.length})` : ''} ▾
                </button>

                {productDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setProductDropdownOpen(false)} />
                    <div className="absolute z-30 mt-1 left-0 w-80 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2">
                      <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Select products</span>
                        {productFilters.length > 0 && (
                          <button type="button" onClick={() => setProductFilters([])} className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer">
                            Clear all
                          </button>
                        )}
                      </div>
                      {productOptions.map(([fam, count]) => (
                        <label key={fam} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-800 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={productFilters.includes(fam)}
                            onChange={() => toggleProduct(fam)}
                            className="accent-amber-500 cursor-pointer"
                          />
                          <span className="flex-1 truncate" title={fam}>{fam}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{count}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {productFilters.map(f => (
                <span key={f} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  <span className="truncate max-w-40">{f}</span>
                  <button type="button" onClick={() => toggleProduct(f)} className="cursor-pointer hover:text-rose-500 font-black">×</button>
                </span>
              ))}

              {/* Label status filter: pending / ordered / received */}
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase">
                {([['all', 'All Labels'], ['pending', 'Labels Pending'], ['ordered', 'Labels Ordered'], ['received', 'Labels Received']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setLabelFilter(val)}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                      labelFilter === val
                        ? val === 'pending'
                          ? 'bg-rose-500 text-white'
                          : val === 'received'
                          ? 'bg-emerald-500 text-white'
                          : val === 'ordered'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(productFilters.length > 0 || labelFilter !== 'all') && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Showing {filteredItemCount} item{filteredItemCount !== 1 ? 's' : ''} across {filtered.length} order{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Kept source files — uploaded PDFs/XLS stay attached to this section */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Kept Files:</span>
          {uploadedFiles.map(f => (
            <a
              key={f.id}
              href={f.dataUrl}
              download={f.name}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 hover:border-amber-400 transition-colors cursor-pointer"
              title="Download the kept source file"
            >
              <FileText className="w-3 h-3" />
              <span className="truncate max-w-48">{f.name}</span>
              <span className="text-slate-400">({(f.size / 1048576).toFixed(1)} MB)</span>
            </a>
          ))}
        </div>
      )}

      {/* Orders */}
      {viewTab === 'production' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={prodFileRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,image/*"
            className="hidden"
            onChange={e => handleProductionFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={prodBusy}
            onClick={() => prodFileRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {prodBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{prodBusy ? 'Processing…' : 'Upload Production (PDF / XLS)'}</span>
          </button>

          {productionUploaded && (
            <button
              type="button"
              onClick={() => setProdSource(prodSource === 'uploaded' ? 'auto' : 'uploaded')}
              className={`px-3 py-1.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-wide cursor-pointer transition-colors ${
                prodSource === 'uploaded'
                  ? 'border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-900 dark:border-white'
                  : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}
              title="Switch between the uploaded production sheet and the auto-derived one from deliveries"
            >
              {prodSource === 'uploaded' ? 'Source: Uploaded Sheet' : 'Source: Auto from Deliveries'}
            </button>
          )}
          {productionUploaded && (
            <button
              type="button"
              onClick={() => { setProductionUploaded(null); idbSet('gfi_production_v1', null); setProdSource('auto'); }}
              className="p-1.5 text-rose-500 hover:text-rose-600 cursor-pointer"
              title="Remove the uploaded production sheet"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {viewTab === 'production' && prodMatrix && prodMatrix.rowNames.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Production Sheet — Pallets by Client & Product ({prodMatrix.rowNames.length} clients × {prodMatrix.cols.length} packs)
          </div>
          <table className="w-full text-left text-[10px] border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[9px] uppercase font-black text-slate-500 dark:text-slate-400 sticky top-0">
              <tr>
                <th className="py-1.5 px-2.5 min-w-[140px] sticky left-0 bg-slate-50 dark:bg-slate-800/60">Total of Client</th>
                {prodMatrix.cols.map(c => <th key={c.key} className="py-1.5 px-2 min-w-[90px]">{c.label}</th>)}
                <th className="py-1.5 px-2.5 text-right min-w-[70px]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {prodMatrix.rowNames.map(rn => {
                const m2 = prodMatrix.rowsMap.get(rn)!;
                const rowTotal = prodMatrix.cols.reduce((a, c) => a + (m2.get(c.key) || 0), 0);
                return (
                  <tr key={rn} className="hover:bg-amber-50/40 dark:hover:bg-amber-950/10">
                    <td className="py-1.5 px-2.5 font-bold text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-900">{rn}</td>
                    {prodMatrix.cols.map(c => {
                      const v = m2.get(c.key);
                      return <td key={c.key} className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{v ? (Number.isInteger(v) ? v : Math.round(v * 100) / 100) : ''}</td>;
                    })}
                    <td className="py-1.5 px-2.5 text-right font-mono font-black text-slate-900 dark:text-slate-100">{Number.isInteger(rowTotal) ? rowTotal : Math.round(rowTotal * 100) / 100}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-700">
                <td className="py-2 px-2.5 font-black uppercase text-[10px] text-slate-700 dark:text-slate-200 sticky left-0 bg-slate-100 dark:bg-slate-800">Total</td>
                {prodMatrix.colTotals.map((v, i) => (
                  <td key={i} className="py-2 px-2 text-right font-mono font-black text-amber-700 dark:text-amber-400">{Number.isInteger(v) ? v : Math.round(v * 100) / 100}</td>
                ))}
                <td className="py-2 px-2.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                  {Number.isInteger(prodMatrix.grand) ? prodMatrix.grand : Math.round(prodMatrix.grand * 100) / 100}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {viewTab === 'production' && prodMatrix && prodMatrix.rowNames.length === 0 && (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
          Nothing to produce for the current filters.
        </div>
      )}
      {!showDeliveries ? null : orders.length === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 text-center space-y-2">
          <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <FileText className="w-5 h-5" />
            <FileSpreadsheet className="w-5 h-5" />
            <ImageIcon className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            No pending deliveries yet. Upload the delivery plan sheet (PDF with images, or Excel) and every delivery
            order — DO No, PO Date, Customer, Address, Items with brand images, Qty, Sale Price, Label Ordered/Received
            and Remarks — will be imported automatically, grouped by region.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div key={order.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {/* Order header */}
              <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-md bg-slate-900 text-amber-400 text-[10px] font-mono font-black">
                    DO {order.doNo || '—'}
                  </span>
                  <span className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                    {order.customerName || 'Unnamed Customer'}
                  </span>
                  {order.poDate && (
                    <span className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400">PO: {order.poDate}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {order.salesExecutive && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-slate-500 dark:text-slate-400">
                      <UserCheck className="w-3 h-3" />
                      {order.salesExecutive}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setOrders(prev => prev.filter(o => o.id !== order.id))}
                    className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer"
                    title="Delete delivery order"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {order.address && (
                <div className="px-3.5 py-1.5 flex items-start gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/70">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{order.address}</span>
                </div>
              )}

              {/* Items table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10.5px] border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[9px] uppercase font-black text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-1.5 px-2.5 w-12">Image</th>
                      <th className="py-1.5 px-2.5 min-w-[220px]">Item / Description</th>
                      <th className="py-1.5 px-2.5 w-24">Brand</th>
                      <th className="py-1.5 px-2.5 w-32">Qty</th>
                      <th className="py-1.5 px-2.5 w-20 text-right">Sale Price</th>
                      <th className="py-1.5 px-2.5 w-28">Status</th>
                      <th className="py-1.5 px-2.5 w-20">Label Ordered</th>
                      <th className="py-1.5 px-2.5 w-20">Label Received</th>
                      <th className="py-1.5 px-2.5 min-w-[140px]">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {order.items.map(it => (
                      <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-1.5 px-2.5">
                          {it.imageUrl ? (
                            <img src={it.imageUrl} alt="product" className="w-9 h-9 object-contain rounded-md border border-slate-200 dark:border-slate-700 bg-white" />
                          ) : (
                            <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                          {it.item || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{it.brand || '—'}</td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {isEditable ? (
                            <input
                              type="text"
                              value={it.qty}
                              onChange={e => handleItemEdit(order.id, it.id, { qty: e.target.value })}
                              className="w-full px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-center font-bold"
                            />
                          ) : (
                            it.qty || '—'
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {isEditable ? (
                            <input
                              type="text"
                              value={it.salePrice}
                              onChange={e => handleItemEdit(order.id, it.id, { salePrice: e.target.value })}
                              className="w-16 px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-right font-bold"
                            />
                          ) : (
                            it.salePrice || '—'
                          )}
                        </td>
                        <td className="py-1.5 px-2.5">
                          <select
                            value={deriveItemStatus(it)}
                            onChange={e => handleItemEdit(order.id, it.id, { status: e.target.value })}
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase border cursor-pointer ${
                              it.status === 'Delivered'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : it.status === 'Dispatched'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
                                : it.status === 'Ready'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                                : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            <option value="">Auto</option>
                            <option value="Ready">Ready</option>
                            <option value="Dispatched">Dispatched</option>
                            <option value="Delivered">Delivered</option>
                          </select>
                        </td>
                        <td className="py-1.5 px-2.5">
                          {it.labelOrdered && /not/i.test(it.labelOrdered) ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-[9.5px] font-bold text-rose-600 dark:text-rose-400">{it.labelOrdered}</span>
                          ) : it.labelOrdered ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400">{it.labelOrdered}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-1.5 px-2.5">
                          {it.labelReceived && /received/i.test(it.labelReceived) ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400">{it.labelReceived}</span>
                          ) : it.labelReceived ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9.5px] font-bold text-amber-600 dark:text-amber-400">{it.labelReceived}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-500 dark:text-slate-400">
                          {isEditable ? (
                            <input
                              type="text"
                              value={it.remarks}
                              onChange={e => handleItemEdit(order.id, it.id, { remarks: e.target.value })}
                              className="w-full px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800"
                            />
                          ) : (
                            it.remarks || '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {isEditable && (
                  <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800/70">
                    <button
                      type="button"
                      onClick={() => {
                        setOrders(prev =>
                          prev.map(o =>
                            o.id === order.id
                              ? { ...o, items: [...o.items, { ...emptyItem() }] }
                              : o
                          )
                        );
                      }}
                      className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add Item Row
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
