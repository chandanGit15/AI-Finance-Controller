import { createWorker } from 'tesseract.js';
import { readFile } from 'fs/promises';
import path from 'path';

const root = path.resolve();
const imgPath = path.join(root, 'samples', 'invoice_inr.png');
const buf = await readFile(imgPath);

const worker = await createWorker('eng', 1, {
  langPath: path.join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0'),
  gzip: true,
});
try {
  const { data } = await worker.recognize(buf);
  console.log('OCR confidence:', data.confidence);
  console.log('---- text ----');
  console.log(data.text.slice(0, 1200));
} finally {
  await worker.terminate();
}
