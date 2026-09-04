import { readFile } from 'fs/promises';
import path from 'path';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

const root = path.resolve();

// Node path: run the worker on the main thread via a transfer handler port
async function extract(pdfPath) {
  const data = new Uint8Array(await readFile(pdfPath));
  const loadingTask = getDocument({ data, useSystemFonts: true, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map(it => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  return out;
}

for (const name of ['invoice_text_inr.pdf', 'invoice_scanned_inr.pdf']) {
  try {
    const t = await extract(path.join(root, 'samples', name));
    console.log(name, '=> len', t.length, '|', t.replace(/\s+/g, ' ').slice(0, 150));
  } catch (e) {
    console.log(name, '=> ERROR', e.message);
  }
}
