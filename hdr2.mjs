import * as pdfjs from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const data = new Uint8Array(fs.readFileSync('./pd-1122-3.pdf'));
const pdf = await pdfjs.getDocument({ data }).promise;
console.log('pages:', pdf.numPages);
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const txt = content.items.map(i => i.str).join('|');
  const all = content.items.map(i => i.str.trim());
  const found = ['DO', 'Purchase', 'Customer', 'Description', 'Bottle', 'Remarks', 'Qty', 'Sale', 'Items', 'Brand', 'Label'].filter(k => all.some(t => t.includes(k)));
  console.log('page', p, 'items:', content.items.length, 'substring-found:', found.join(','));
  if (p === 1) {
    // dump the header-band words with y between 380 and 430
    const hb = content.items.filter(i => { const y = Math.round(i.transform[5]); return y >= 370 && y <= 440; });
    console.log('header-ish words:', JSON.stringify(hb.map(i => [Math.round(i.transform[4]), Math.round(i.transform[5]), i.str.trim()])));
  }
}
