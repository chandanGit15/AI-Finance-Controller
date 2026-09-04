// Replicates the reported bug against the CURRENT parser: how many records and
// what do they look like when a 100-row table PDF is ingested?
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { processFile } from '../backend/services/ingestion.js'

const sampleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples')
const pdf = path.join(sampleDir, 'ReconAI_100_INR_Reconciliation_Dataset.pdf')
const buf = fs.readFileSync(pdf)

const out = await processFile({
  buffer: buf,
  originalName: 'ReconAI_100_INR_Reconciliation_Dataset.pdf',
  mime: 'application/pdf',
  docTypeOverride: 'AUTO',
  existingIds: { 'INV-1001': 1 }, // simulate INV-1001 already in the dataset
})

console.log('method:', out.method, '| sourceType:', out.sourceType, '| message:', out.message)
console.log('record count:', out.records.length)
for (const r of out.records.slice(0, 3)) {
  console.log(' record:', JSON.stringify({ type: r.recordType, inv: r.invoiceId, pay: r.paymentId, bank: r.bankTransactionId, entity: r.entityName, date: r.date, amount: r.amount, status: r.validationStatus, warnings: r.warnings }))
}
process.exit(0)
