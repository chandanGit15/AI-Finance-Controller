import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractTables } from '../backend/services/pdfTables.js'

const sampleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples')
const file = process.argv[2] || 'ReconAI_100_INR_Reconciliation_Dataset.pdf'
const buf = fs.readFileSync(path.join(sampleDir, file))

const out = await extractTables(buf)
console.log('ok:', out.ok, '| pagesScanned:', out.pagesScanned)
for (const t of out.tables) {
  console.log(`table: ${t.label} | header: ${t.header} | pages: ${t.pageCount} | rows: ${t.rowCount}`)
}
console.log('records:', out.records.length)
const byType = {}
for (const r of out.records) byType[r.recordType] = (byType[r.recordType] || 0) + 1
console.log('by type:', JSON.stringify(byType))
const ids = out.records.map(r => r.invoiceId || r.paymentId || r.bankTransactionId)
console.log('first 4:', out.records.slice(0, 4).map(r => JSON.stringify({ t: r.recordType, id: r.invoiceId || r.paymentId || r.bankTransactionId, date: r.date, amt: r.amount, payRef: r.invoiceId && r.recordType === 'payment' ? r.invoiceId : undefined })))
console.log('last 4:', out.records.slice(-4).map(r => JSON.stringify({ t: r.recordType, id: r.invoiceId || r.paymentId || r.bankTransactionId, date: r.date, amt: r.amount })))
// sanity: no header words in id fields
const headerWords = ['Inv', 'Date', 'Invoice', 'Amount', 'Payment', 'Bank', 'Tx']
const bad = out.records.filter(r => headerWords.some(h => String(r.invoiceId || r.paymentId || r.bankTransactionId || '').includes(h)))
console.log('records whose ids contain header words:', bad.length)
process.exit(0)
