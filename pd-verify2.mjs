// per-page replication of the app's parse
import * as pdfjs from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function pdfRowsPerPage(data) {
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = [];
    for (const it of content.items) {
      const s = (it.str || '').trim();
      if (!s) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      row.cells.push({ x, s });
    }
    rows.forEach(r => r.cells.sort((a, b) => a.x - b.x));
    rows.sort((a, b) => a.y - b.y);
    pages.push(rows);
  }
  return pages;
}

function parsePage(rows, sourceName) {
  const lines = rows.map(r => r.cells.map(c => c.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const qtyRe = /(\d+\s*[xX]\s*\d+(?:\.\d+)?\s*PALLETS?|\d+(?:\.\d+)?\s*PALLETS?|\d+\s*[xX]\s*\d+\s*CASES?|\d+(?:\.\d+)?\s*CASES?|\d+\/\d+\s*PALLETS?)/i;
  const priceRe = /\$\s*(\d+(?:\.\d+)?)/;
  const orders = [];
  let cur = null;
  const flush = () => { if (cur && (cur.customerName || cur.doNo)) orders.push(cur); cur = null; };
  for (const ln of lines) {
    if (/^(Page \d+ of \d+|DO NO\.|PENDING|Product|Today|United States|Correct BB|Also Label)/i.test(ln)) continue;
    if (/Delivery Plan|Production Plan|\(SKU\)|Product Name|Pending Deliveries -/i.test(ln)) continue;
    const doM = /^(\d{3,5})\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\b(.*)$/.exec(ln);
    if (doM) {
      flush();
      cur = { doNo: doM[1], poDate: doM[2], customerName: '', salesExecutive: '', address: '', items: [], sourceFile: sourceName };
      const rest = (doM[3] || '').trim();
      if (rest) {
        const qm2 = qtyRe.exec(rest);
        if (qm2) {
          const qty = qm2[1].replace(/\s*[xX]\s*/, ' X ').toUpperCase();
          const pm2 = priceRe.exec(rest);
          cur.items.push({ item: rest.slice(0, qm2.index).replace(/^\S+\s+/, '').trim(), qty, salePrice: pm2 ? '$' + pm2[1] : '' });
        } else {
          cur.customerName = rest;
        }
      }
      continue;
    }
    if (!cur) continue;
    if (qtyRe.test(ln)) {
      const qm = qtyRe.exec(ln);
      const pm = priceRe.exec(ln);
      cur.items.push({ item: ln.slice(0, qm.index).replace(/^\S+\s+/, '').trim(), qty: qm[1].toUpperCase(), salePrice: pm ? '$' + pm[1] : '' });
      continue;
    }
    if (cur.items.length) { cur.items[cur.items.length - 1].remarks = (cur.items[cur.items.length - 1].remarks + ' ' + ln).trim(); }
    else if (!cur.customerName) cur.customerName = ln;
    else if (/\d/.test(ln)) cur.address = (cur.address + ' ' + ln).trim();
    else if (ln.split(' ').length === 1 && !cur.salesExecutive) cur.salesExecutive = ln;
    else cur.customerName = (cur.customerName + ' ' + ln).replace(/\s+/g, ' ').trim();
  }
  flush();
  return orders;
}

const pages = await pdfRowsPerPage(new Uint8Array(fs.readFileSync('./pd-1122-3.pdf')));
const all = [];
pages.forEach((rows, i) => all.push(...parsePage(rows, 'Pending Deliveries - 11.12.2026 (3).pdf')));
console.log('RESULT ORDERS:', all.length, '| ITEMS:', all.reduce((a, o) => a + o.items.length, 0));
all.slice(0, 10).forEach(o => console.log('• DO', o.doNo, '|', o.poDate, '|', (o.customerName || '(no cust)').slice(0, 28), '|', o.items.length, 'items |', (o.items[0]?.item || '').slice(0, 35), '|', o.items[0]?.qty));
const bad = all.filter(o => o.customerName.includes('|') || o.items.some(i => i.item.includes('|')));
console.log('garbage:', bad.length);
fs.writeFileSync('parsed-verify.json', JSON.stringify(all, null, 1));
