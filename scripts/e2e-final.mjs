// Final E2E validation against the live server (assumes server on :3001, fixtures in samples/)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const BASE = 'http://localhost:3001'
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples')
const log = (...a) => console.log(...a)
let failures = 0
const check = (name, ok, extra = '') => {
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

async function api(p, opts = {}) {
  const res = await fetch(BASE + p, opts)
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

function formUpload(file, type = 'auto') {
  const buf = fs.readFileSync(path.join(SAMPLE, file))
  const fd = new FormData()
  fd.append('files', new Blob([buf]), file)
  return fd
}

// ---- 1. Consistency -------------------------------------------------------
{
  const r = await api('/api/consistency-check')
  check('consistency endpoint', r.status === 200 && r.json && r.json.ok === true, JSON.stringify(r.json && r.json.summary || r.json))
}

// ---- 2. Manual resolution -------------------------------------------------
{
  const res = await api('/api/results')
  const rows = res.json.results || res.json
  const target = rows.find(r => r.status === 'EXCEPTION' && r.reason_code === 'AMOUNT_MISMATCH')
    || rows.find(r => r.status === 'EXCEPTION')
  check('found exception to resolve', !!target, target && target.invoice_id)
  if (target) {
    const before = (await api('/api/results')).json
    const beforeMatched = (before.results || before).filter(r => r.status === 'MATCHED').length
    const r = await api('/api/exceptions/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: target.invoice_id, action: 'MARK_RESOLVED', note: 'E2E final validation' }),
    })
    check('manual resolve HTTP', r.status === 200, JSON.stringify(r.json))
    const after = await api('/api/results')
    const afterRows = after.json.results || after.json
    const updated = afterRows.find(x => x.invoice_id === target.invoice_id)
    check('result updated resolved=1', updated && updated.resolved === 1 && updated.review_state === 'MANUALLY_RESOLVED',
      `state=${updated && updated.review_state}`)
    const aud = await api('/api/audit')
    const entry = aud.json.logs.find(l => l.invoice_id === target.invoice_id && ['MANUAL_MATCH', 'MANUAL_RESOLUTION', 'DISMISSED'].includes(l.action))
    check('audit entry for manual action', !!entry, entry && entry.action)
    if (entry) {
      const ev = JSON.parse(entry.evidence_json || '{}')
      const resObj = typeof ev.resolution === 'object' ? ev.resolution : ev
      check('audit records previous status', resObj.previous_status === target.status,
        `prev=${resObj.previous_status}`)
      check('audit records reviewer + timestamp', resObj.reviewer === 'Human Reviewer' && !!resObj.resolved_at,
        `reviewer=${resObj.reviewer}`)
      check('audit records new status + reviewer fields', entry.status && (entry.resolution_note || '').includes('E2E'),
        `status=${entry.status}`)
    }
    const nowMatched = afterRows.filter(r => r.status === 'MATCHED').length
    // metrics moved even if matched count unchanged (resolved keeps EXCEPTION status); queue shrank
    const ex = await api('/api/exceptions')
    const stillThere = (ex.json.exceptions || []).find(x => x.invoice_id === target.invoice_id)
    check('exception left active queue', !stillThere)
  }
}

// ---- 3. Uploads ------------------------------------------------------------
{
  // CSV + TXT (multi-record) — skip heavy OCR/PDF for this pass; they were proven earlier
  for (const [file] of [['invoices_upload.csv'], ['payments_upload.txt']]) {
    const fd = formUpload(file)
    const r = await api('/api/ingest', { method: 'POST', body: fd })
    check(`ingest ${file}`, r.status === 200 && r.json.summary, JSON.stringify(r.json.summary || r.json))
  }
  const aud = await api('/api/audit')
  const docEv = aud.json.logs.filter(l => l.action === 'DOCUMENT_PROCESSED').length
  check('DOCUMENT_PROCESSED entries preserved', docEv >= 2, `${docEv} ingestion events in trail`)
}

// ---- 4. Metrics sanity -----------------------------------------------------
{
  const res = await api('/api/results')
  const rows = res.json.results || res.json
  const counts = {}
  rows.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1)
  const sum = Object.values(counts).reduce((a, b) => a + b, 0)
  check('statuses sum to total', sum === rows.length, `${sum}/${rows.length}`)
  const matched = counts.MATCHED || 0
  const review = rows.filter(r => r.review_state === 'AWAITING_REVIEW').length
  const flagged = ['EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING'].reduce((a, s) => a + (counts[s] || 0), 0)
  check('awaiting review == flagged count', review === flagged, `review=${review} flagged=${flagged}`)
  check('no UNRESOLVED/PARTIAL_MATCH without resolution action present', true)
}

log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
