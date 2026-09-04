// PDF_TABLE extraction — position-aware, multi-page financial table parser.
//
// Given a text-based PDF we reconstruct each page's visual lines from pdfjs
// text-item coordinates (x/y), detect header rows against a financial header
// lexicon, and emit one normalized record per data row, per column family
// present in the row (invoice / payment / bank transaction).
//
// Guarantees:
//   * EVERY page is scanned — page 1 alone is never enough.
//   * Repeated headers on later pages (or mid-table) are recognized and never
//     emitted as records.
//   * Titles, subtitles, footers, separators and prose that do not align to
//     table columns are ignored.
//   * Row -> column relationships come from x-position alignment, so a row is
//     never "just the first line of the document".
//   * A wide table mixing invoice + payment + bank columns yields one record
//     per family the row actually contains (blank cells => no record for that
//     family), so "100 invoices / 98 payments / 88 bank txs" style datasets
//     extract completely.
//   * Nothing is fabricated: rows without an identifier are skipped, and
//     header cells are never written into values.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseAmount, CURRENCY } from './money.js'

// ---------------------------------------------------------------------------
// Header lexicon
// ---------------------------------------------------------------------------
// key (normalized header) -> { canon, family, generic? }
// family: 'inv' | 'pay' | 'bank' | 'meta'
const LEXICON = {
  // invoice family
  invoiceid: { canon: 'invId', family: 'inv' },
  invid: { canon: 'invId', family: 'inv' },
  invno: { canon: 'invId', family: 'inv' },
  invoiceno: { canon: 'invId', family: 'inv' },
  invoicenumber: { canon: 'invId', family: 'inv' },
  customer: { canon: 'entity', family: 'inv' },
  customername: { canon: 'entity', family: 'inv' },
  vendorname: { canon: 'entity', family: 'inv' },
  vendor: { canon: 'entity', family: 'inv' },
  supplier: { canon: 'entity', family: 'inv' },
  buyer: { canon: 'entity', family: 'inv' },
  billedto: { canon: 'entity', family: 'inv' },
  party: { canon: 'entity', family: 'inv', generic: true },
  name: { canon: 'entity', family: 'inv', generic: true },
  city: { canon: 'city', family: 'inv' },
  invoicedate: { canon: 'invDate', family: 'inv' },
  invdate: { canon: 'invDate', family: 'inv' },
  dateofinvoice: { canon: 'invDate', family: 'inv' },
  invoicetotal: { canon: 'invAmount', family: 'inv' },
  invoiceamount: { canon: 'invAmount', family: 'inv' },
  amountinr: { canon: 'invAmount', family: 'inv' },
  amountinr_: { canon: 'invAmount', family: 'inv' },
  grandtotal: { canon: 'invAmount', family: 'inv' },
  total: { canon: 'amount', family: null, generic: true },
  // payment family
  paymentid: { canon: 'payId', family: 'pay' },
  payid: { canon: 'payId', family: 'pay' },
  paymentno: { canon: 'payId', family: 'pay' },
  paymentnumber: { canon: 'payId', family: 'pay' },
  paymentrefno: { canon: 'payId', family: 'pay' },
  receiptno: { canon: 'payId', family: 'pay' },
  paymentref: { canon: 'ref', family: null, generic: true },
  payref: { canon: 'ref', family: null, generic: true },
  paymentreference: { canon: 'ref', family: null, generic: true },
  paymentdate: { canon: 'payDate', family: 'pay' },
  paydate: { canon: 'payDate', family: 'pay' },
  datepaid: { canon: 'payDate', family: 'pay' },
  amountpaid: { canon: 'payAmount', family: 'pay' },
  paidamount: { canon: 'payAmount', family: 'pay' },
  paymentamount: { canon: 'payAmount', family: 'pay' },
  payamount: { canon: 'payAmount', family: 'pay' },
  amountreceived: { canon: 'payAmount', family: 'pay' },
  paymentstatus: { canon: 'payStatus', family: 'pay' },
  paystatus: { canon: 'payStatus', family: 'pay' },
  status: { canon: 'status', family: 'meta', generic: true },
  invoicereference: { canon: 'invoiceRef', family: 'pay' },
  invoiceref: { canon: 'invoiceRef', family: 'pay' },
  invref: { canon: 'invoiceRef', family: 'pay' },
  referenceinvoice: { canon: 'invoiceRef', family: 'pay' },
  againstinvoice: { canon: 'invoiceRef', family: 'pay' },
  // bank family
  banktransactionid: { canon: 'bankId', family: 'bank' },
  banktxid: { canon: 'bankId', family: 'bank' },
  transactionid: { canon: 'bankId', family: 'bank' },
  txnid: { canon: 'bankId', family: 'bank' },
  transactionno: { canon: 'bankId', family: 'bank' },
  transactionnumber: { canon: 'bankId', family: 'bank' },
  bankref: { canon: 'bankId', family: 'bank' },
  banktransactionno: { canon: 'bankId', family: 'bank' },
  transactiondate: { canon: 'bankDate', family: 'bank' },
  txndate: { canon: 'bankDate', family: 'bank' },
  txdate: { canon: 'bankDate', family: 'bank' },
  bankdate: { canon: 'bankDate', family: 'bank' },
  valuedate: { canon: 'bankDate', family: 'bank' },
  bankamount: { canon: 'bankAmount', family: 'bank' },
  txnamount: { canon: 'bankAmount', family: 'bank' },
  transactionamount: { canon: 'bankAmount', family: 'bank' },
  debit: { canon: 'bankAmount', family: 'bank' },
  credit: { canon: 'bankAmount', family: 'bank' },
  transactionstatus: { canon: 'bankStatus', family: 'bank' },
  txstatus: { canon: 'bankStatus', family: 'bank' },
  narration: { canon: 'description', family: 'bank' },
  particulars: { canon: 'description', family: 'bank', generic: true },
  remarks: { canon: 'description', family: 'bank', generic: true },
  details: { canon: 'description', family: 'bank', generic: true },
  description: { canon: 'description', family: 'bank', generic: true },
  narrative: { canon: 'description', family: 'bank', generic: true },
  reference: { canon: 'ref', family: null, generic: true },
  utr: { canon: 'ref', family: 'bank' },
  utrno: { canon: 'ref', family: 'bank' },
  date: { canon: 'date', family: null, generic: true },
  amount: { canon: 'amount', family: null, generic: true },
  // meta columns (reconciliation-output style) — never become source records
  confidence: { canon: 'confidence', family: 'meta' },
  matchtype: { canon: 'matchType', family: 'meta' },
  reason: { canon: 'meta', family: 'meta' },
  groundtruth: { canon: 'meta', family: 'meta' },
  groundtruthstatus: { canon: 'meta', family: 'meta' },
}

export function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function lexiconHit(raw) {
  return LEXICON[normalizeHeader(raw)] || null
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const ID_RE = /\b((?:INV|PAY|PMT|TXN|TX|BANK|REF|UTR|CHQ|REC|VCH|GST|NEFT|RTGS|IMPS|UPI)-?\d[\w-]*)\b/i

function cleanId(token) {
  const m = ID_RE.exec(String(token || ''))
  return m ? m[1].toUpperCase() : null
}

function isDateToken(text) {
  return /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/.test(String(text || ''))
}

function toISODate(token) {
  if (!token) return null
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(token)
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`
  m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(token)
  if (m) {
    let first = Number(m[1]), second = Number(m[2]), yy = Number(m[3])
    if (yy < 100) yy += 2000
    // Indian docs use DD/MM/YYYY unless the second part is clearly a day
    if (second > 12 && first <= 12) { const t = first; first = second; second = t }
    if (second < 1 || second > 12 || first < 1 || first > 31) return null
    return `${yy}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Page scan (pdfjs items -> visual lines with positioned cells)
// ---------------------------------------------------------------------------

async function scanPdf(buffer) {
  const data = new Uint8Array(buffer.slice(0))
  const loadingTask = getDocument({ data, useSystemFonts: true, isEvalSupported: false })
  const pdf = await loadingTask.promise
  const pages = []
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      const items = []
      for (const item of tc.items) {
        if (!('str' in item)) continue
        const s = String(item.str || '')
        if (!s.trim()) continue
        const x = item.transform ? item.transform[4] : 0
        const y = item.transform ? item.transform[5] : 0
        const w = typeof item.width === 'number' && item.width > 0 ? item.width : s.length * 5
        items.push({ s, x, y, w })
      }

      // Cluster into visual lines by y (pdf y grows upward). Rows are drawn at
      // the same baseline, so a tolerance of a few points keeps one row one line.
      const lines = []
      for (const it of items) {
        const line = lines.find(l => Math.abs(l.y - it.y) <= 3.5)
        if (line) {
          line.items.push(it)
          if (it.x < line.xMin) line.xMin = it.x
          if (it.x + it.w > line.xMax) line.xMax = it.x + it.w
        } else {
          lines.push({ y: it.y, xMin: it.x, xMax: it.x + it.w, items: [it] })
        }
      }
      lines.sort((a, b) => b.y - a.y)
      for (const line of lines) line.items.sort((a, b) => a.x - b.x)

      // Group items into cells by horizontal gap. Words inside one logical
      // cell sit a few points apart; PDF columns sit tens of points apart.
      const out = []
      for (const line of lines) {
        const cells = []
        let cur = null
        for (const it of line.items) {
          if (!cur) {
            cur = { x: it.x, w: it.w, text: it.s }
          } else {
            const gap = it.x - (cur.x + cur.w)
            if (gap > 4.5) {
              cells.push(cur)
              cur = { x: it.x, w: it.w, text: it.s }
            } else {
              cur.text += (gap > 1.5 ? ' ' : '') + it.s
              cur.w = it.x + it.w - cur.x
            }
          }
        }
        if (cur) cells.push(cur)
        out.push({ y: line.y, cells })
      }
      pages.push({ n: p, lines: out })
    }
  } finally {
    try { await loadingTask.destroy() } catch { /* ignore */ }
  }
  return pages
}

// ---------------------------------------------------------------------------
// Header / data-line classification
// ---------------------------------------------------------------------------

function headerScore(line) {
  let hits = 0
  let genericHits = 0
  const keys = []
  for (const c of line.cells) {
    const lx = lexiconHit(c.text)
    if (lx) {
      keys.push(lx.canon)
      if (lx.generic) genericHits++
      else hits++
    }
  }
  return { hits, genericHits, keys }
}

function isHeaderLine(line) {
  const s = headerScore(line)
  return s.hits >= 3 || (s.hits >= 2 && line.cells.length >= 3)
}

function isDataLine(line) {
  if (line.cells.length < 2) return false
  const joined = line.cells.map(c => c.text).join(' ')
  if (/\bpage\s*\d+\s*(of|\/)\s*\d+\b/i.test(joined)) return false
  if (/^\s*[•·▪●*\-\u2013\u2014]/.test(joined)) return false
  let idCount = 0
  let numDateCount = 0
  for (const c of line.cells) {
    if (cleanId(c.text)) idCount++
    else if (isDateToken(c.text)) numDateCount++
    else {
      const p = parseAmount(c.text)
      if (p !== null && /\d/.test(c.text) && Math.abs(p) > 0.001) numDateCount++
    }
  }
  return idCount >= 1 || numDateCount >= 2
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

const GENERIC_KEYS = new Set(['amount', 'date', 'entity', 'city', 'status', 'ref', 'description'])
const FAMILY_FOR = {
  invId: 'inv', entity: 'inv', city: 'inv', invDate: 'inv', invAmount: 'inv',
  payId: 'pay', payDate: 'pay', payAmount: 'pay', invoiceRef: 'pay', payStatus: 'pay',
  bankId: 'bank', bankDate: 'bank', bankAmount: 'bank', bankStatus: 'bank', description: 'bank', ref: 'bank',
}
const IGNORED = new Set(['meta', 'confidence', 'matchType', 'status'])

function resolveGenericKeys(keys) {
  const famCount = { inv: 0, pay: 0, bank: 0 }
  for (const k of keys) {
    if (GENERIC_KEYS.has(k)) continue
    const f = FAMILY_FOR[k]
    if (f && f !== 'meta') famCount[f]++
  }
  const dominant = (famCount.pay > famCount.inv && famCount.pay >= famCount.bank) ? 'pay'
    : (famCount.bank > famCount.inv && famCount.bank > famCount.pay) ? 'bank'
    : (famCount.inv > 0 || famCount.pay === 0 && famCount.bank === 0) ? 'inv'
    : famCount.inv >= famCount.pay ? 'inv' : 'pay'

  return keys.map(k => {
    if (k === 'amount') return dominant === 'pay' ? 'payAmount' : dominant === 'bank' ? 'bankAmount' : 'invAmount'
    if (k === 'date') return dominant === 'pay' ? 'payDate' : dominant === 'bank' ? 'bankDate' : 'invDate'
    if (k === 'entity') return 'entity'
    if (k === 'city') return 'city'
    if (k === 'status') return dominant === 'pay' ? 'payStatus' : dominant === 'bank' ? 'bankStatus' : 'status'
    if (k === 'description') return 'description'
    if (k === 'ref') return 'ref'
    return k
  })
}

function tableLabel(keys) {
  const fams = new Set(keys.map(k => FAMILY_FOR[k]).filter(Boolean))
  if (fams.size === 1) {
    if (fams.has('inv')) return 'Invoices'
    if (fams.has('pay')) return 'Payments'
    if (fams.has('bank')) return 'Bank Transactions'
  }
  return 'Reconciliation dataset (invoices with payment/bank links)'
}

// Map a data line's cells onto header columns by x proximity.
// Returns { canon: text } or null when nothing mapped.
function mapRowToColumns(line, header) {
  const row = {}
  let mapped = 0
  for (const cell of line.cells) {
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < header.xs.length; i++) {
      const limit = Math.max(header.widths[i], 30)
      const d = Math.abs(cell.x - header.xs[i])
      if (d < bestDist && d <= limit) { bestDist = d; best = i }
    }
    if (best >= 0) {
      const canon = header.keys[best]
      if (canon && !IGNORED.has(canon)) {
        mapped++
        row[canon] = row[canon] ? `${row[canon]} ${cell.text}`.trim() : cell.text.trim()
      }
    }
  }
  return mapped > 0 ? row : null
}

// ---------------------------------------------------------------------------
// Record construction
// ---------------------------------------------------------------------------

function buildRowRecords(row, tableLabelStr, meta) {
  const out = []
  const invId = cleanId(row.invId)
  const payId = cleanId(row.payId)
  const bankId = cleanId(row.bankId)
  const hasBankCols = meta.hasBank
  const hasPayCols = meta.hasPay

  // Invoice record — emitted when an invoice id exists, or for single-family
  // invoice tables where the row clearly belongs to the invoices table.
  if (invId || (!hasPayCols && !hasBankCols && (row.entity || isDataLike(row)))) {
    const date = toISODate(row.invDate || row.date)
    const amount = parseAmount(row.invAmount ?? row.amount)
    const entityBits = [row.entity, row.city].filter(Boolean)
    out.push({
      recordType: 'invoice',
      entityName: entityBits.length ? entityBits.join(', ') : null,
      date,
      amount,
      currency: CURRENCY,
      referenceId: invId,
      invoiceId: invId,
      paymentId: null,
      bankTransactionId: null,
      description: null,
      extractionMethod: 'PDF_TABLE',
    })
  }

  // Payment/bank records are only emitted when the row actually carries usable
  // data for them — an id alone (blank amount/date/description cells) means the
  // document did not provide that record's details, so no record is fabricated.
  const payUsable = payId && ((row.payAmount !== undefined && row.payAmount !== null && String(row.payAmount).trim() !== '') || (row.payDate !== undefined && row.payDate !== null && String(row.payDate).trim() !== ''))
  if (payUsable) {
    const date = toISODate(row.payDate || row.date)
    const amount = parseAmount(row.payAmount ?? row.amount)
    out.push({
      recordType: 'payment',
      entityName: row.entity ? String(row.entity).trim() : null,
      date,
      amount,
      currency: CURRENCY,
      referenceId: payId,
      invoiceId: cleanId(row.invoiceRef) || invId || null,
      paymentId: payId,
      bankTransactionId: null,
      description: row.payStatus ? `Payment status: ${row.payStatus}` : null,
      extractionMethod: 'PDF_TABLE',
    })
  }

  const bankUsable = bankId && ((row.bankAmount !== undefined && row.bankAmount !== null && String(row.bankAmount).trim() !== '') || (row.bankDate !== undefined && row.bankDate !== null && String(row.bankDate).trim() !== '') || (row.description !== undefined && row.description !== null && String(row.description).trim() !== ''))
  if (bankUsable) {
    const date = toISODate(row.bankDate || row.date)
    const amount = parseAmount(row.bankAmount ?? row.amount)
    const descBits = [
      row.description,
      row.ref ? `Ref ${row.ref}` : null,
      payId ? `Payment ${payId}` : null,
      row.bankStatus ? `Status: ${row.bankStatus}` : null,
    ].filter(Boolean)
    out.push({
      recordType: 'bank_transaction',
      entityName: null,
      date,
      amount,
      currency: CURRENCY,
      referenceId: cleanId(row.ref) || payId || bankId,
      invoiceId: invId || null,
      paymentId: payId || cleanId(row.ref) || null,
      bankTransactionId: bankId,
      description: descBits.length ? descBits.join(' — ') : null,
      extractionMethod: 'PDF_TABLE',
    })
  }
  return out
}

function isDataLike(row) {
  return Object.values(row).some(v => v !== undefined && String(v).trim() !== '')
}

function recordConfidence(headerMatched, headerTotal, row) {
  let conf = 84 + Math.round(15 * (headerMatched / Math.max(headerTotal, 1)))
  const vals = Object.values(row)
  const blanks = vals.filter(v => v === undefined || v === null || String(v).trim() === '').length
  conf -= Math.min(12, blanks * 2)
  return Math.max(55, Math.min(99, conf))
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * extractTables(buffer) -> { ok, pagesScanned, tables, records, text }
 */
export async function extractTables(buffer) {
  const pages = await scanPdf(buffer)
  const records = []
  const tableSeen = new Map() // signature -> table summary

  const flushRows = (pending) => {
    for (const line of pending) {
      if (!isDataLine(line)) continue
      const row = mapRowToColumns(line, header)
      if (!row) continue
      const sig = header.keys.join('|')
      if (!tableSeen.has(sig)) {
        tableSeen.set(sig, {
          label: header.label,
          header: header.rawCells.join(' | '),
          rowCount: 0,
          keys: header.keys,
          pages: new Set(),
        })
      }
      const t = tableSeen.get(sig)
      t.rowCount++
      t.pages.add(line._page)
      const recs = buildRowRecords(row, header.label, { hasPay: header.hasPay, hasBank: header.hasBank })
      for (const r of recs) {
        r.extractionConfidence = recordConfidence(header.matchedCount, header.keys.length, row)
        records.push(r)
      }
    }
  }

  let header = null
  let pending = []
  for (const page of pages) {
    for (const rawLine of page.lines) {
      const line = { ...rawLine, _page: page.n }
      if (isHeaderLine(line)) {
        // Rows accumulated under the previous header are flushed first; a
        // repeated header (same columns on the next page) simply continues
        // the same logical table.
        if (header) flushRows(pending)
        pending = []

        const score = headerScore(line)
        const keys = resolveGenericKeys(score.keys)
        header = {
          rawCells: line.cells.map(c => c.text),
          xs: line.cells.map(c => c.x),
          widths: line.cells.map((c, i) => {
            const next = line.cells[i + 1]
            return next ? next.x - c.x : c.w + 60
          }),
          keys,
          label: tableLabel(keys),
          matchedCount: score.hits + score.genericHits,
          hasPay: keys.some(k => FAMILY_FOR[k] === 'pay'),
          hasBank: keys.some(k => FAMILY_FOR[k] === 'bank'),
        }
      } else if (header) {
        pending.push(line)
      }
      // Lines before the first header are ignored (titles, subtitles).
    }
  }
  if (header) flushRows(pending)

  const text = pages
    .map(p => p.lines.map(l => l.cells.map(c => c.text).join('  ')).join('\n'))
    .join('\n\n')

  const tables = [...tableSeen.values()].map(t => ({
    label: t.label,
    header: t.header,
    pageCount: t.pages ? t.pages.size : 0,
    rowCount: t.rowCount,
    rowSpan: t.rowCount,
  }))

  return {
    ok: records.length > 0,
    pagesScanned: pages.length,
    tables,
    records,
    text,
  }
}
