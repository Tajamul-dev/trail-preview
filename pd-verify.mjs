import * as pdfjs from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

// replicate pdfTextRows (ascending y)
async function pdfTextRows(data) {
  const pdf = await pdfjs.getDocument({ data }).promise;
  const rows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      const s = (it.str || '').trim();
      if (!s) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      row.cells.push({ x, s });
    }
  }
  rows.forEach(r => r.cells.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => a.y - b.y);
  return rows;
}

function parseSheetDeliveriesPdf(rows, sourceName) {
  const lines = rows.map(r => r.cells.map(c => c.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  console.log('lines:', lines.length);
  console.log('sample lines:', lines.slice(0, 12).map(l => l.slice(0, 70)));
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
          const price = pm2 ? '$' + pm2[1] : '';
          const before = rest.slice(0, qm2.index).trim();
          const after = rest.slice(qm2.index + qm2[0].length).trim();
          const loM = /\b(Yes|Not)\b/i.exec(after);
          const labelOrdered = loM ? loM[1] : '';
          const after2 = loM ? after.slice(loM.index + loM[0].length).trim() : after;
          const lrM = /\b(Received|Available|Not Label|Without Label|Not)\b/i.exec(after2);
          const labelReceived = lrM ? lrM[1] : '';
          const remarks = lrM ? after2.slice(lrM.index + lrM[0].length).trim().replace(/^[.|\s]+|[.|\s]+$/g, '') : after2;
          cur.items.push({ item: before.replace(/^\S+\s+/, '').replace(/\s+/g, ' ').trim(), brand: '', qty, salePrice: price, labelOrdered, labelReceived, remarks });
        } else {
          cur.customerName = rest;
        }
      }
      continue;
    }
    if (!cur) continue;
    if (qtyRe.test(ln)) {
      const qm = qtyRe.exec(ln);
      const qty = qm[1].replace(/\s*[xX]\s*/, ' X ').toUpperCase();
      const pm = priceRe.exec(ln);
      const price = pm ? '$' + pm[1] : '';
      const before = ln.slice(0, qm.index).trim();
      const after = ln.slice(qm.index + qm[0].length).trim();
      const loM = /\b(Yes|Not)\b/i.exec(after);
      const labelOrdered = loM ? loM[1] : '';
      const after2 = loM ? after.slice(loM.index + loM[0].length).trim() : after;
      const lrM = /\b(Received|Available|Not Label|Without Label|Not)\b/i.exec(after2);
      const labelReceived = lrM ? lrM[1] : '';
      const remarks = lrM ? after2.slice(lrM.index + lrM[0].length).trim().replace(/^[.|\s]+|[.|\s]+$/g, '') : after2;
      const itemText = before.replace(/^\S+\s+/, '').replace(/\s+/g, ' ').trim();
      cur.items.push({ item: itemText, brand: '', qty, salePrice: price, labelOrdered, labelReceived, remarks });
      continue;
    }
    if (cur.items.length) {
      cur.items[cur.items.length - 1].remarks = (cur.items[cur.items.length - 1].remarks + ' ' + ln).trim();
    } else if (!cur.customerName) {
      cur.customerName = ln;
    } else if (/\d/.test(ln)) {
      cur.address = (cur.address + ' ' + ln).trim();
    } else if (ln.split(' ').length === 1 && !cur.salesExecutive) {
      cur.salesExecutive = ln;
    } else {
      cur.customerName = (cur.customerName + ' ' + ln).replace(/\s+/g, ' ').trim();
    }
  }
  flush();
  return orders;
}

const rows = await pdfTextRows(new Uint8Array(fs.readFileSync('./pd-1122-3.pdf')));
const orders = parseSheetDeliveriesPdf(rows, 'test');
console.log('RESULT ORDERS:', orders.length, '| ITEMS:', orders.reduce((a, o) => a + o.items.length, 0));
orders.slice(0, 8).forEach(o => console.log('• DO', o.doNo, '|', o.poDate, '|', o.customerName.slice(0, 30), '|', o.items.length, 'items'));
fs.writeFileSync('parsed-check.json', JSON.stringify(orders, null, 1));
