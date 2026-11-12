// Offline OCR (Tesseract) — runs 100% in the browser. No API key, no server, no restart.
// Used as the automatic fallback when no Gemini key is configured.
import Tesseract from 'tesseract.js';

export async function ocrDataUrl(dataUrl: string): Promise<string> {
  const worker = await Tesseract.createWorker('eng');
  try {
    const { data } = await worker.recognize(dataUrl);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

export async function ocrImageFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return await ocrDataUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rasterize every PDF page and OCR it (for scanned PDFs with no text layer). */
export async function ocrPdfFile(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = (workerMod as any).default || workerMod;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport } as any).promise;
    const text = await ocrDataUrl(canvas.toDataURL('image/png'));
    out += '\n' + text;
  }
  return out;
}

export function ocrFileAuto(file: File): Promise<string> {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return ocrPdfFile(file);
  return ocrImageFile(file);
}

export interface PdfTextRow {
  y: number;
  page: number;
  cells: Array<{ x: number; s: string }>;
}

/** Extract text items with positions from a text-based PDF, clustered into rows. */
export async function pdfTextRows(file: File): Promise<PdfTextRow[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = (workerMod as any).default || workerMod;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const rows: PdfTextRow[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items as any[]) {
      const s = (it.str || '').trim();
      if (!s) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]);
      const row = rows.find(r => r.page === p && Math.abs(r.y - y) <= 3);
      if (row) row.cells.push({ x, s });
      else rows.push({ y, page: p, cells: [{ x, s }] });
    }
  }
  rows.forEach(r => r.cells.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => a.y - b.y);
  return rows;
}
