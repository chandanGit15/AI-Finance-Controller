import { readFile } from 'fs/promises';
import path from 'path';
import { processFile } from '../backend/services/ingestion.js';

const root = path.resolve();
const samples = path.join(root, 'samples');

const cases = [
  ['invoice_text_inr.pdf', 'application/pdf'],
  ['invoice_scanned_inr.pdf', 'application/pdf'],
  ['invoice_inr.png', 'image/png'],
  ['payment_inr.png', 'image/png'],
  ['bank_statement_inr.png', 'image/png'],
  ['payment_webp.webp', 'image/webp'],
  ['invoices_upload.csv', 'text/csv'],
  ['payments_upload.txt', 'text/plain'],
];

for (const [name, mime] of cases) {
  console.error(`>>> ${name}`);
  const buf = await readFile(path.join(samples, name));
  const started = Date.now();
  try {
    const out = await processFile({ buffer: buf, originalName: name, mime, docTypeOverride: 'AUTO', existingIds: {} });
    const ok = out.records.filter(r => r.validationStatus !== 'error');
    console.error(`${name.padEnd(26)} ${out.fileType.padEnd(6)} ${String(out.method).padEnd(8)} conf=${out.extractionConfidence}% recs=${out.records.length} valid=${ok.length} ${Date.now() - started}ms ${out.foreignCurrency ? 'FOREIGN:' + out.foreignCurrency : ''}`);
    for (const r of out.records) {
      console.error('   ', r.recordType, '|', r.invoiceId || r.paymentId || r.bankTransactionId || '(none)', '|', (r.entityName || '').slice(0, 28), '|', r.date, '|', r.amount, r.currency, '|', r.validationStatus);
    }
  } catch (e) {
    console.error(`${name.padEnd(26)} THREW: ${e.message}`);
  }
}

const exe = await readFile(path.join(samples, 'evil.exe'));
try {
  await processFile({ buffer: exe, originalName: 'evil.exe', mime: 'application/x-msdownload', docTypeOverride: 'AUTO', existingIds: {} });
  console.error('evil.exe: NOT REJECTED (BUG)');
} catch (e) {
  console.error('evil.exe rejected: ' + (e.message.includes('Unsupported file type') ? 'OK' : 'WRONG MSG: ' + e.message));
}
console.error('done');
process.exit(0);
