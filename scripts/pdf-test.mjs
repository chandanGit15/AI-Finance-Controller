import { readFile } from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const root = path.resolve();
for (const name of ['invoice_text_inr.pdf', 'invoice_scanned_inr.pdf']) {
  const buf = await readFile(path.join(root, 'samples', name));
  try {
    const data = await pdfParse(buf);
    const text = data.text.replace(/\s+/g, ' ').trim();
    console.log(name, '=> pages', data.numpages, '| text length', text.length, '|', text.slice(0, 120));
  } catch (e) {
    console.log(name, '=> ERROR', e.message);
  }
}
