// Real PDF file generation (downloadable .pdf) using jsPDF + AutoTable.
// Complements the print-dialog flows: this produces an actual saved file.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GLOBAL_FUTURA_LOGO_PATH } from './constants';

const BASE_URL = (import.meta as any).env?.BASE_URL || '/';

export interface SavePdfOptions {
  filename: string;
  title: string;
  subtitle?: string;
  /** Table sections: each gets its own heading + table */
  sections: Array<{
    heading?: string;
    head: string[];
    body: Array<Array<string | number>>;
    /** Column index (0-based) treated as right-aligned numeric */
    numericFrom?: number;
  }>;
  landscape?: boolean;
}

export async function savePdfTable(opts: SavePdfOptions): Promise<void> {
  const doc = new jsPDF({ orientation: opts.landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 28;

  // Header: logo + title
  try {
    const img = await loadImage(GLOBAL_FUTURA_LOGO_PATH);
    if (img) doc.addImage(img.dataUrl, img.format, margin, 24, 64, 26);
  } catch {}
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(opts.title.toUpperCase(), margin + 76, 34, { maxWidth: pageWidth - margin * 2 - 80 });
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(opts.subtitle, margin + 76, 48, { maxWidth: pageWidth - margin * 2 - 80 });
  }
  doc.setDrawColor(30);
  doc.setLineWidth(1.4);
  doc.line(margin, 62, pageWidth - margin, 62);
  doc.setTextColor(20);

  let cursorY = 78;
  const pageCount = () => doc.getNumberOfPages();

  opts.sections.forEach(section => {
    if (section.heading) {
      if (cursorY > doc.internal.pageSize.getHeight() - 120) {
        doc.addPage();
        cursorY = 60;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setFillColor(255, 233, 122);
      doc.rect(margin, cursorY - 9, pageWidth - margin * 2, 14, 'FD');
      doc.text(section.heading.toUpperCase(), margin + 5, cursorY + 0.5);
      cursorY += 12;
    }
    autoTable(doc, {
      startY: cursorY,
      head: [section.head],
      body: section.body.map(r => r.map(c => (c === null || c === undefined ? '' : String(c)))),
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, lineColor: [90, 90, 90], lineWidth: 0.5, textColor: [20, 20, 20] },
      headStyles: { fillColor: [238, 238, 238], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: (() => {
        const cs: Record<string, { halign: 'right' }> = {};
        if (section.numericFrom !== undefined) {
          section.head.forEach((_, i) => {
            if (i >= (section.numericFrom as number)) cs[String(i)] = { halign: 'right' };
          });
        }
        return cs;
      })(),
      didParseCell: (data: any) => {
        // Blue inserted band for per-size total lines (e.g. "TOTAL PALLETS FOR THIS SIZE (...)")
        if (
          data.section === 'body' &&
          data.row &&
          typeof data.row.raw?.[0] === 'string' &&
          data.row.raw[0].startsWith('TOTAL PALLETS FOR THIS SIZE')
        ) {
          data.cell.styles.fillColor = [13, 93, 221];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => {
        // Footer on every page
        const pages = pageCount();
        for (let p = 1; p <= pages; p++) {
          doc.setPage(p);
          const h = doc.internal.pageSize.getHeight();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(110);
          doc.text('Global Futura Inc. - Operations Suite', margin, h - 16);
          doc.text(`Page ${p}`, pageWidth - margin, h - 16, { align: 'right' });
          doc.setTextColor(20);
        }
      },
    });
    const last = (doc as any).lastAutoTable;
    if (last) cursorY = last.finalY + 18;
  });

  doc.save(opts.filename);
}

function loadImage(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL('image/png'), format: 'PNG' });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url.startsWith('http') ? url : BASE_URL.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url);
  });
}
