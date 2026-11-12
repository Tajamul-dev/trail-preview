import * as pdfjs from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const BIZ_SKIP = ['Page', 'PENDING', 'Product', 'Today'];

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

const HDR = ['DO', 'Purchase', 'Customer', 'Sales', 'Address', 'Items', 'Brand', 'Description', 'Qty', 'Sale', 'Label Ordered', 'Label Received', 'Bottle', 'Remarks'];
const HDR_WORDS = { DO: 'DO', Purchase: 'Purchase', Customer: 'Customer', Sales: 'Sales', Address: 'Address', Items: 'Items', Brand: 'Brand', Description: 'Description', Qty: 'Qty', Sale: 'Sale', 'Label Ordered': 'Label', 'Label Received': 'Label', Bottle: 'Bottle', Remarks: 'Remarks' };

function detectBounds(words) {
  // find the header center: the y where the MOST keywords cluster within +-12
  const KWS = ['Purchase', 'Customer', 'Description', 'Qty', 'Bottle', 'Remarks', 'Sale', 'Items'];
  const kwHits = [];
  words.forEach(w => { KWS.forEach(k => { if (w.text.includes(k)) kwHits.push({ k, y: w.y }); }); });
  if (!kwHits.length) { console.log('no header keywords found'); return { keys: [], bounds: [] }; }
  let mid = kwHits[0].y, bestCount = 0;
  kwHits.forEach(h => {
    const c = kwHits.filter(x => Math.abs(x.y - h.y) <= 12).length;
    if (c > bestCount) { bestCount = c; mid = h.y; }
  });
  console.log('header center y:', mid, 'clustered keywords:', bestCount);
  const band = words.filter(w => w.y >= mid - 18 && w.y <= mid + 14).sort((a, b) => a.x - b.x);
  console.log('band words:', band.length, JSON.stringify(band.map(w => w.text).slice(0, 24)));
  const anchors = {};
  for (const key of HDR) {
    const firstWord = HDR_WORDS[key];
    if (key === 'Label Ordered' || key === 'Label Received') {
      const xs = band.filter(w => w.text === firstWord).map(w => w.x).sort((a, b) => a - b);
      if (xs.length > 0) anchors['Label Ordered'] = xs[0] - 2;
      if (xs.length > 1) anchors['Label Received'] = xs[1] - 2;
    } else {
      const hit = band.find(w => w.text === firstWord);
      if (hit) anchors[key] = hit.x - 2;
    }
  }
  // simpler: known anchors by header keyword search
  const findByWord = word => { const hit = band.find(w => w.text === word); return hit ? hit.x - 2 : undefined; };
  const res = {};
  res['DO'] = band.find(w => w.text === 'DO') ? band.find(w => w.text === 'DO').x - 2 : (findByWord('Purchase') ? findByWord('Purchase') - 26 : undefined);
  res['Purchase'] = findByWord('Purchase');
  res['Customer'] = findByWord('Customer');
  res['Sales'] = findByWord('Sales');
  res['Address'] = findByWord('Address');
  res['Items'] = findByWord('Items');
  res['Brand'] = findByWord('Brand');
  res['Description'] = findByWord('Description');
  res['Qty'] = findByWord('Qty');
  res['Sale'] = findByWord('Sale');
  const labelXs = band.filter(w => w.text === 'Label').map(w => w.x).sort((a, b) => a - b);
  res['Label Ordered'] = labelXs.length ? labelXs[0] - 2 : undefined;
  res['Label Received'] = labelXs.length > 1 ? labelXs[1] - 2 : undefined;
  res['Bottle'] = findByWord('Bottle');
  res['Remarks'] = findByWord('Remarks');
  const keys = HDR.filter(k => res[k] !== undefined).sort((a, b) => res[a] - res[b]);
  const bounds = [];
  keys.forEach((k, i) => {
    const hi = i + 1 < keys.length ? res[keys[i + 1]] : 10000;
    bounds.push([res[k], hi]);
  });
  return { keys, bounds };
}

function parsePage(rows, bounds, keys, sourceName, ordersByKey, orders) {
  const colwords = keys.map(() => []);
  for (const r of rows) {
    r.cells.forEach(c => {
      let j = 0;
      for (let i = keys.length - 1; i >= 0; i--) { if (c.x >= bounds[i][0]) { j = i; break; } }
      colwords[Math.min(j, keys.length - 1)].push({ y: r.y, text: c.s });
    });
  }
  const idx = n => keys.indexOf(n);
  const colbands = j => {
    const out = [];
    for (const w of colwords[j].sort((a, b) => a.y - b.y)) {
      const t = w.text;
      if (out.length && Math.abs(out[out.length - 1].y - w.y) <= 4) out[out.length - 1].texts.push(t);
      else out.push({ y: w.y, texts: [t] });
    }
    return out.filter(b => b.texts.join(' ').trim());
  };
  const bandsBy = {};
  keys.forEach(k => { bandsBy[k] = colbands(idx(k)); });

  // order blocks: DO bands delimit
  const doBands = bandsBy['DO'];
  const blocks = [];
  for (let i = 0; i < doBands.length; i++) {
    const y0 = doBands[i].y;
    const y1 = i + 1 < doBands.length ? doBands[i + 1].y : 10000;
    blocks.push({ y0, y1, doNo: doBands[i].texts.join(' ') });
  }
  if (!doBands.length) return;

  for (const blk of blocks) {
    const inRange = b => b.y >= blk.y0 - 4 && b.y < blk.y1;
    const customer = (bandsBy['Customer'] || []).filter(inRange).map(b => b.texts.join(' ')).join(' ').trim();
    const exec = (bandsBy['Sales'] || []).filter(inRange).map(b => b.texts.join(' ')).join(' ').trim();
    const address = (bandsBy['Address'] || []).filter(inRange).map(b => b.texts.join(' ')).join(' ').trim();
    const key = customer.toLowerCase() || blk.doNo;
    let o = ordersByKey.get(key);
    if (!o) {
      o = { doNo: blk.doNo, poDate: '', customerName: customer, salesExecutive: exec, address, items: [], sourceFile: sourceName };
      ordersByKey.set(key, o);
      orders.push(o);
    }
    // items: qty bands in range
    (bandsBy['Qty'] || []).filter(inRange).forEach(qb => {
      const nearest = (key2) => {
        const bands = bandsBy[key2] || [];
        let best = null, bd = Infinity;
        bands.forEach(b => { if (b.y >= blk.y0 - 4 && b.y < blk.y1) { const d = Math.abs(b.y - qb.y); if (d < bd) { bd = d; best = b; } } });
        return best ? best.texts.join(' ').trim() : '';
      };
      const pm = /\$/.test(qb.texts.join(' ')) ? qb.texts.join(' ') : qb.texts.join(' ');
      o.items.push({
        item: nearest('Items'),
        brand: nearest('Brand'),
        qty: qb.texts.join(' ').toUpperCase(),
        salePrice: (() => { const m = /\$?\s*(\d+(?:\.\d+)?)/.exec(nearest('Sale')); return m ? '$' + m[1] : nearest('Sale'); })(),
        labelOrdered: nearest('Label Ordered'),
        labelReceived: nearest('Label Received'),
        remarks: nearest('Remarks'),
      });
    });
    // poDate from Purchase band in range
    if (!o.poDate) {
      const pd = (bandsBy['Purchase'] || []).filter(inRange);
      if (pd.length) o.poDate = pd[0].texts.join(' ').trim();
    }
  }
}

const pages = await pdfRowsPerPage(new Uint8Array(fs.readFileSync('./pd-1122-3.pdf')));
let bounds = null, keys = null;
const orders = [];
const ordersByKey = new Map();
pages.forEach((rows, p) => {
  if (p === 0 && !bounds) {
    const det = detectBounds(rows.flatMap(r => r.cells.map(c => ({ x: c.x, y: r.y, text: c.s }))));
    bounds = det.bounds; keys = det.keys;
    console.log('bounds:', keys.map(k => k + '=' + Math.round(det[k])));
  }
  if (bounds) parsePage(rows, bounds, keys, 'Pending Deliveries - 11.12.2026 (3).pdf', ordersByKey, orders);
});
console.log('ORDERS:', orders.length, '| ITEMS:', orders.reduce((a, o) => a + o.items.length, 0));
orders.slice(0, 10).forEach(o => console.log('• DO', o.doNo, '|', o.poDate, '|', o.customerName.slice(0, 30), '|', o.salesExecutive.slice(0, 10), '|', o.items.length, 'items'));
fs.writeFileSync('parsed-verify.json', JSON.stringify(orders, null, 1));
