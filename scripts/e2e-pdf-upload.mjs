// End-to-end validation of the 100-record PDF fix through the live API.
// Scenario: dataset contains INV-1001 only; the PDF has INV-1001..INV-1100
// (+98 payments +88 bank txs). One duplicate must NOT stop the rest.
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.join(root, 'data', 'reconai.db')
const pdfPath = path.join(root, 'samples', 'ReconAI_100_INR_Reconciliation_Dataset.pdf')
const BASE = 'http://localhost:3001'
let failures = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures++ }

async function api(p, opts = {}) {
  const res = await fetch(BASE + p, opts)
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

// ---- Reset: wipe all source data, keep only INV-1001 -----------------------
{
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec('DELETE FROM invoices; DELETE FROM payments; DELETE FROM bank_transactions; DELETE FROM ground_truth; DELETE FROM reconciliation_results; DELETE FROM audit_log; DELETE FROM reconciliation_runs; DELETE FROM document_uploads; DELETE FROM extracted_records;')
  db.prepare('INSERT INTO invoices (invoice_id, customer, invoice_date, due_date, amount, currency, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('INV-1001', 'Existing Customer', '2026-01-15', '2026-02-15', 15000, 'INR', '')
  db.close()
  console.log('reset: dataset contains only INV-1001')
}

// ---- Upload the 100-record PDF ---------------------------------------------
{
  const buf = fs.readFileSync(pdfPath)
  const fd = new FormData()
  fd.append('files', new Blob([buf]), 'ReconAI_100_INR_Reconciliation_Dataset.pdf')
  fd.append('types', JSON.stringify(['AUTO']))
  const r = await api('/api/ingest', { method: 'POST', body: fd })
  const j = r.json
  globalThis.__ingestRecords = j.records || []
  check('ingest HTTP 200', r.status === 200)
  check('summary: records extracted = 286', j.summary.recordsExtracted === 286, `got ${j.summary.recordsExtracted}`)
  check('summary: duplicates detected = 1', j.summary.duplicatesDetected === 1, `got ${j.summary.duplicatesDetected}`)
  check('summary: byType 100/98/88', JSON.stringify(j.summary.recordsByType) === JSON.stringify({ invoice: 100, payment: 98, bank_transaction: 88, other: 0 }), JSON.stringify(j.summary.recordsByType))
  check('file method PDF_TABLE', j.files[0].method === 'PDF_TABLE', j.files[0].method)
  check('file pages=4 tables=1', j.files[0].pagesScanned === 4 && j.files[0].tablesDetected === 1)
  check('file duplicate count = 1', j.files[0].duplicatesDetected === 1)
  check('no header words in any id', !j.records.some(r => /Invoice|Amount|Date|Payment|Bank/.test(String(r.invoiceId || r.paymentId || r.bankTransactionId || ''))))
  const invIds = j.records.filter(r => r.recordType === 'invoice').map(r => r.invoiceId)
  check('invoice ids INV-1001..INV-1100 extracted', invIds.length === 100 && invIds[0] === 'INV-1001' && invIds[invIds.length - 1] === 'INV-1100')
  const payIds = j.records.filter(r => r.recordType === 'payment').map(r => r.paymentId)
  check('payment ids PAY-0001..PAY-0098', payIds.length === 98 && payIds[0] === 'PAY-0001' && payIds[97] === 'PAY-0098')
  const txIds = j.records.filter(r => r.recordType === 'bank_transaction').map(r => r.bankTransactionId)
  check('bank ids TX-0001..TX-0088', txIds.length === 88 && txIds[0] === 'TX-0001' && txIds[87] === 'TX-0088')
  const dupRec = j.records.find(r => (r.warnings || []).some(w => /Duplicate/.test(w)))
  check('duplicate warning only on INV-1001', dupRec && dupRec.invoiceId === 'INV-1001')
  const inv1002 = j.records.find(r => r.invoiceId === 'INV-1002')
  check('INV-1002 valid with INR amount', inv1002 && inv1002.validationStatus === 'valid' && inv1002.amount > 0 && inv1002.currency === 'INR', JSON.stringify(inv1002 && { amt: inv1002.amount, cur: inv1002.currency }))
}

// ---- Accept everything except the duplicate --------------------------------
let loaded = 0
{
  const recs = (globalThis.__ingestRecords || []).map(r => ({
    id: r.recordId, record_type: r.recordType, entity_name: r.entityName, doc_date: r.date,
    amount: r.amount, currency: r.currency, invoice_id: r.invoiceId, payment_id: r.paymentId,
    bank_transaction_id: r.bankTransactionId, description: r.description, reference_id: r.referenceId,
    warnings_json: JSON.stringify(r.warnings || []),
  }))
  const accepted = recs.filter(r => !JSON.parse(r.warnings_json || '[]').some(w => /Duplicate/.test(w)))
  const r = await api('/api/ingest/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: accepted.map(rec => ({
      recordId: rec.id, recordType: rec.record_type, entityName: rec.entity_name, date: rec.doc_date,
      amount: rec.amount, currency: rec.currency, invoiceId: rec.invoice_id, paymentId: rec.payment_id,
      bankTransactionId: rec.bank_transaction_id, description: rec.description, referenceId: rec.reference_id,
    })) }),
  })
  loaded = r.json.loaded || 0
  check('accept loaded 285 (286 minus duplicate)', loaded === 285, `loaded ${loaded}, duplicates ${JSON.stringify(r.json.duplicates)}`)
  check('accept skipped only INV-1001', (r.json.duplicates || []).includes('INV-1001'), JSON.stringify(r.json.duplicates))
}

// ---- Reconcile the loaded dataset ------------------------------------------
{
  const r = await api('/api/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
  const j = r.json
  check('reconcile OK', j.success === true, j.message || '')
  const cc = await api('/api/consistency-check')
  check('consistency ok after load+reconcile', cc.json && cc.json.ok === true, JSON.stringify(cc.json && cc.json.metrics && { total: cc.json.metrics.total, sum: cc.json.metrics.sum }))
  const res = await api('/api/results')
  check('results total = 100', (res.json.results || res.json).length === 100, `total ${(res.json.results || res.json).length}`)
  // audit DOCUMENT_PROCESSED entry carries pages/tables
  const aud = await api('/api/audit')
  const docEntry = aud.json.logs.find(l => l.action === 'DOCUMENT_PROCESSED')
  const ev = docEntry ? JSON.parse(docEntry.evidence_json || '{}') : null
  check('DOCUMENT_PROCESSED audit entry w/ method+pages+tables', !!docEntry && docEntry.method === 'PDF_TABLE' && ev.pagesScanned === 4 && ev.tablesDetected === 1, docEntry && `${docEntry.method} pages=${ev && ev.pagesScanned}`)
}

console.log(failures === 0 ? '\nALL PDF UPLOAD E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
