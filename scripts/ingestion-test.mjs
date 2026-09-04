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
];

for (const [name, mime] of cases) {
  console.log(`>>> starting ${name}`);
  const buf = await readFile(path.join(samples, name));
  const started = Date.now();
  try {
    const out = await processFile({ buffer: buf, originalName: name, mime, docTypeOverride: 'AUTO', existingIds: {} });
    console.log(`\n=== ${name} === (${Date.now() - started}ms)`);
    if (out.error) { console.log('ERROR:', out.error); continue; }
    console.log('type:', out.fileType, '| source:', out.sourceType, '| method:', out.method, '| conf:', out.extractionConfidence, '| foreign:', out.foreignCurrency);
    console.log('message:', out.message);
    for (const r of out.records) {
      console.log('  record:', r.recordType, '| id:', r.invoiceId || r.paymentId || r.bankTransactionId || '(none)', '| entity:', r.entityName || '(none)', '| date:', r.date, '| amount:', r.amount, r.currency, '| conf:', r.extractionConfidence, '| status:', r.validationStatus, r.warnings.length ? '| warns:' + r.warnings.join('; ') : '');
    }
  } catch (e) {
    console.log(`\n=== ${name} === THREW:`, e.message);
  }
}

// TXT + CSV + unsupported
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
const TMP = tmpdir();
const txt = `Invoice ID: INV-1024\nCustomer: Bengaluru Systems Pvt Ltd\nInvoice Date: 02/09/2026\nAmount: ₹85,500\nPayment Reference: PAY-0098`;
writeFileSync(path.join(TMP, 'test-invoice.txt'), txt);
const csv = `invoice_id,customer,invoice_date,due_date,amount,currency,account_id\nINV-3001,Karnataka Supplies,2026-08-10,2026-09-09,48500,INR,ACC-001\nINV-3002,Shakti Enterprises,2026-08-11,2026-09-10,9600.5,INR,ACC-002`;
writeFileSync(path.join(TMP, 'test-invoices.csv'), csv);
writeFileSync(path.join(TMP, 'evil.exe'), 'MZ fake');
for (const [name, path2, mime] of [
  ['invoice_sample.txt', path.join(TMP, 'test-invoice.txt'), 'text/plain'],
  ['invoices_upload.csv', path.join(TMP, 'test-invoices.csv'), 'text/csv'],
  ['evil.exe', path.join(TMP, 'evil.exe'), 'application/x-msdownload'],
]) {
  console.log(`>>> starting ${name}`);
  const buf = await readFile(path2);
  try {
    const out = await processFile({ buffer: buf, originalName: name, mime, docTypeOverride: 'AUTO', existingIds: {} });
    console.log(`\n=== ${name} ===`);
    if (out.error) { console.log('ERROR:', out.error); continue; }
    console.log('source:', out.sourceType, '| method:', out.method, '| records:', out.records.length);
    for (const r of out.records) console.log('  record:', r.recordType, r.invoiceId || r.paymentId || r.bankTransactionId, r.entityName, r.date, r.amount, r.currency, r.validationStatus, r.warnings.slice(0,2).join(';'));
  } catch (e) {
    console.log(`\n=== ${name} === THREW:`, e.message);
  }
}
console.log('\ndone');
