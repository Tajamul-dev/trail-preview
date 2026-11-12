import * as pdfjs from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const data = new Uint8Array(fs.readFileSync('./new-deliveries.pdf'));
const pdf = await pdfjs.getDocument({ data }).promise;
const page = await pdf.getPage(2);
const content = await page.getTextContent();
let n = 0;
for (const it of content.items) {
  const s = (it.str || '').trim();
  if (!s) continue;
  const x = Math.round(it.transform[4]);
  const y = Math.round(it.transform[5]);
  console.log(y, x, JSON.stringify(s).slice(0, 40));
  if (++n > 30) break;
}
