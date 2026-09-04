// Generates ReconAI_100_INR_Reconciliation_Dataset.pdf — a synthetic demo PDF
// replicating the user-reported scenario: a multi-page INR *wide* table with
// the columns Invoice ID | Inv Date | Invoice Amount | Payment ID | Pay Date |
// Payment Amount | Bank Tx ID | Tx Date | Bank Amount, repeated table headers
// on every page, and rows where payment/bank cells are legitimately blank.
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples')
const outFile = path.join(outDir, 'ReconAI_100_INR_Reconciliation_Dataset.pdf')

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260904)

// Indian-grouping amount digits (4,90,387.92 etc.)
function inrDigits(amount) {
  const s = amount.toFixed(2)
  const [int, dec] = s.split('.')
  return `${int.replace(/(\d)(?=(\d\d)+\d$)/g, '$1,')}.${dec}`
}
const amt = (n) => `${SYMBOL}${inrDigits(n)}`

// 9 columns — tight but fits A4 portrait at small fonts
const cols = [
  { key: 'inv', x: 30, label: 'Invoice ID' },
  { key: 'invDate', x: 90, label: 'Inv Date' },
  { key: 'invAmt', x: 150, label: 'Invoice Amount' },
  { key: 'pay', x: 210, label: 'Payment ID' },
  { key: 'payDate', x: 264, label: 'Pay Date' },
  { key: 'payAmt', x: 318, label: 'Payment Amount' },
  { key: 'bank', x: 378, label: 'Bank Tx ID' },
  { key: 'txDate', x: 436, label: 'Tx Date' },
  { key: 'txAmt', x: 492, label: 'Bank Amount' },
]
for (let i = 0; i < cols.length; i++) {
  cols[i].w = i < cols.length - 1 ? cols[i + 1].x - cols[i].x - 4 : 540 - cols[i].x
}

const rows = []
for (let i = 1; i <= 100; i++) {
  const invAmt = Math.round((5000 + rnd() * 540000) * 100) / 100
  const invDate = new Date(Date.UTC(2026, 5 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 27)))
  const iso = (d) => d.toISOString().slice(0, 10)
  const row = { inv: `INV-${String(1000 + i)}`, invDate: iso(invDate), invAmt, pay: null, payDate: null, payAmt: null, bank: null, txDate: null, txAmt: null }
  if (i <= 98) {
    const payAmt = i % 13 === 0 ? Math.round((invAmt - 500) * 100) / 100 : invAmt
    const payDate = new Date(invDate.getTime() + (1 + Math.floor(rnd() * 4)) * 86400000)
    row.pay = `PAY-${String(i).padStart(4, '0')}`
    row.payDate = iso(payDate)
    row.payAmt = payAmt
  }
  if (i <= 88) {
    const txDate = new Date(invDate.getTime() + (1 + Math.floor(rnd() * 5)) * 86400000)
    row.bank = `TX-${String(i).padStart(4, '0')}`
    row.txDate = iso(txDate)
    row.txAmt = i % 13 === 0 ? Math.round((invAmt - 500) * 100) / 100 : invAmt
  }
  rows.push(row)
}

const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 45, left: 30, right: 30 } })
let INR_SYMBOL = null
try {
  doc.registerFont('InrFont', 'C:\\Windows\\Fonts\\arial.ttf')
  doc.font('InrFont')
  INR_SYMBOL = '₹'
} catch { doc.font('Helvetica') }
const SYMBOL = INR_SYMBOL || 'Rs.'

const PER_PAGE = 25
const pageCount = Math.ceil(rows.length / PER_PAGE)
const HEADER_Y = 120
const ROW_H = 20
const TOP = HEADER_Y + 16
const FOOTER_Y = 778

const stream = fs.createWriteStream(outFile)
doc.pipe(stream)

function drawHeader() {
  doc.fontSize(7).fillColor('#1e293b')
  for (const c of cols) doc.text(c.label, c.x, HEADER_Y, { width: c.w + 2, lineBreak: false })
  doc.moveTo(28, HEADER_Y + 9).lineTo(562, HEADER_Y + 9).strokeColor('#94a3b8').lineWidth(0.6).stroke()
}

for (let p = 0; p < pageCount; p++) {
  if (p > 0) doc.addPage()
  doc.fontSize(11.5).fillColor('#0f172a').text('ReconAI — INR Reconciliation Dataset', 30, 46)
  doc.fontSize(7.5).fillColor('#64748b').text('Synthetic demo dataset — 100 invoice records with linked payments and bank transactions', 30, 64)
  drawHeader()
  const slice = rows.slice(p * PER_PAGE, (p + 1) * PER_PAGE)
  doc.fontSize(7)
  slice.forEach((row, idx) => {
    const y = TOP + idx * ROW_H
    doc.fillColor('#334155')
    doc.text(row.inv, cols[0].x, y, { width: cols[0].w, lineBreak: false })
    doc.text(row.invDate, cols[1].x, y, { width: cols[1].w, lineBreak: false })
    doc.text(amt(row.invAmt), cols[2].x, y, { width: cols[2].w, lineBreak: false })
    doc.text(row.pay || '', cols[3].x, y, { width: cols[3].w, lineBreak: false })
    doc.text(row.payDate || '', cols[4].x, y, { width: cols[4].w, lineBreak: false })
    doc.text(row.payAmt != null ? amt(row.payAmt) : '', cols[5].x, y, { width: cols[5].w, lineBreak: false })
    doc.text(row.bank || '', cols[6].x, y, { width: cols[6].w, lineBreak: false })
    doc.text(row.txDate || '', cols[7].x, y, { width: cols[7].w, lineBreak: false })
    doc.text(row.txAmt != null ? amt(row.txAmt) : '', cols[8].x, y, { width: cols[8].w, lineBreak: false })
  })
  doc.fontSize(7).fillColor('#94a3b8').text(`Page ${p + 1} of ${pageCount} — ReconAI synthetic demo data. Not actual company transactions.`, 30, FOOTER_Y)
}

doc.end()
stream.on('finish', () => {
  console.log(`Wrote ${outFile}`)
  console.log(`rows=${rows.length} pages=${pageCount} payments=${rows.filter(r => r.pay).length} bankTxs=${rows.filter(r => r.bank).length}`)
})
