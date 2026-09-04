import { writeFileSync } from 'fs';
import path from 'path';

// Minimal valid text-based PDF (Type1 Helvetica, no font embedding).
const lines = [
  'SYNTHETIC INVOICE - NOT A REAL TRANSACTION',
  'Invoice No : INV-2401',
  'Customer   : Shakti Enterprises',
  'Invoice Date : 20/08/2026',
  'Due Date     : 19/09/2026',
  'Amount       : Rs. 7,50,000.00',
  'Currency     : INR',
];

function esc(t) { return t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function ascii85Free(t) { return t; }

const objs = [];
// 1 catalog, 2 pages, 3 page, 4 contents, 5 font
objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
const content = lines.map(l => `(${esc(l)}) Tj T*`).join('\n');
const stream = `BT /F1 13 Tf 72 720 Td 20 TL ${content} ET`;
objs[4] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

let pdf = '%PDF-1.4\n';
const offsets = [];
for (let i = 1; i <= 5; i++) {
  offsets[i] = Buffer.byteLength(pdf, 'latin1');
  pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
}
const xrefPos = Buffer.byteLength(pdf, 'latin1');
pdf += 'xref\n0 6\n0000000000 65535 f \n';
for (let i = 1; i <= 5; i++) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

import { fileURLToPath } from 'url';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'invoice_text_inr.pdf');
writeFileSync(out, pdf, 'latin1');
console.log('wrote', out, Buffer.byteLength(pdf, 'latin1'), 'bytes');
