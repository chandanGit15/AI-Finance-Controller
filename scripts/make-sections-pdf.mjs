// Generates ReconAI_100_INR_Sections_Dataset.pdf — same synthetic demo data as
// the wide fixture but laid out as separate source tables, each with its own
// header and page: INVOICES, PAYMENTS, BANK TRANSACTIONS.
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples')
const outFile = path.join(outDir, 'ReconAI_100_INR_Sections_Dataset.pdf')

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260904)
const VENDORS = ['Acme Technologies Pvt Ltd', 'Bharat Logistics', 'Shakti Enterprises', 'Bengaluru Systems Pvt Ltd', 'Karnataka Supplies', 'Nilgiri Traders', 'Vasundhara Textiles', 'Cauvery Infotech']
const CITIES = ['Bengaluru', 'Mumbai', 'Pune', 'Chennai', 'Hyderabad', 'Delhi', 'Kolkata', 'Ahmedabad']
const inrDigits = (n) => {
  const [i, d] = n.toFixed(2).split('.')
  return `${i.replace(/(\d)(?=(\d\d)+\d$)/g, '$1,')}.${d}`
}

const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 45, left: 30, right: 30 } })
let SYMBOL = 'Rs.'
try { doc.registerFont('InrFont', 'C:\\Windows\\Fonts\\arial.ttf'); doc.font('InrFont'); SYMBOL = '₹' } catch { doc.font('Helvetica') }
const amt = (n) => `${SYMBOL}${inrDigits(n)}`

const stream = fs.createWriteStream(outFile)
doc.pipe(stream)

function sectionTitle(text) {
  doc.fontSize(13).fillColor('#0f172a').text(text, 30, 46)
  doc.moveTo(30, 60).lineTo(565, 60).lineWidth(1.2).strokeColor('#0f172a').stroke()
}
function note(text) {
  doc.fontSize(8).fillColor('#64748b').text(text, 30, 66)
}
function headerRow(cols, y = 96) {
  doc.fontSize(8).fillColor('#1e293b')
  for (const c of cols) doc.text(c.label, c.x, y, { width: c.w, lineBreak: false })
  doc.moveTo(28, y + 10).lineTo(565, y + 10).strokeColor('#94a3b8').lineWidth(0.6).stroke()
}
const HEADER_Y = 96
const TOP = 116
const ROW_H = 17.5

function tablePage(title, noteText, cols, data, fmt, perPage) {
  const pages = Math.ceil(data.length / perPage)
  for (let p = 0; p < pages; p++) {
    if (p > 0 || title !== undefined) { /* title drawn per page */ }
    doc.addPage()
    sectionTitle(title)
    if (noteText) note(noteText)
    headerRow(cols)
    doc.fontSize(8)
    const slice = data.slice(p * perPage, (p + 1) * perPage)
    slice.forEach((row, idx) => {
      const y = TOP + idx * ROW_H
      doc.fillColor('#334155')
      fmt(row, y, cols)
    })
    doc.fontSize(7).fillColor('#94a3b8').text(`Page ${p + 1} of ${pages} — ReconAI synthetic demo data. Not actual company transactions.`, 30, 780)
  }
}
function cell(row, key, col, y) {
  const val = row[key] != null ? String(row[key]) : ''
  doc.text(val, col.x, y, { width: col.w, lineBreak: false })
}

// ---------- data ----------
const invoices = []
for (let i = 1; i <= 100; i++) {
  invoices.push({
    id: `INV-${String(1000 + i)}`,
    vendor: VENDORS[Math.floor(rnd() * VENDORS.length)],
    city: CITIES[Math.floor(rnd() * CITIES.length)],
    date: new Date(Date.UTC(2026, 5 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 27))).toISOString().slice(0, 10),
    amount: Math.round((5000 + rnd() * 540000) * 100) / 100,
  })
}
const payments = []
for (let i = 1; i <= 98; i++) {
  const inv = invoices[i - 1]
  const payDate = new Date(inv.date + 'T00:00:00Z').getTime() + (1 + Math.floor(rnd() * 4)) * 86400000
  payments.push({
    id: `PAY-${String(i).padStart(4, '0')}`,
    ref: inv.id,
    date: new Date(payDate).toISOString().slice(0, 10),
    amount: i % 13 === 0 ? Math.round((inv.amount - 500) * 100) / 100 : inv.amount,
    status: i % 17 === 0 ? 'Partially paid' : 'Paid',
  })
}
const bankTxs = []
for (let i = 1; i <= 88; i++) {
  const pay = payments[i - 1] || payments[payments.length - 1]
  const txDate = new Date(pay.date + 'T00:00:00Z').getTime() + Math.floor(rnd() * 3) * 86400000
  bankTxs.push({
    id: `TX-${String(i).padStart(4, '0')}`,
    ref: pay.id,
    date: new Date(txDate).toISOString().slice(0, 10),
    amount: pay.amount,
    status: 'Cleared',
  })
}

// ---------- INVOICES table (2 pages, repeated headers) ----------
{    const cols = [
    { key: 'id', x: 30, w: 70, label: 'Invoice ID' },
    { key: 'vendor', x: 105, w: 185, label: 'Vendor' },
    { key: 'city', x: 295, w: 85, label: 'City' },
    { key: 'date', x: 385, w: 70, label: 'Inv Date' },
    { key: 'amount', x: 460, w: 105, label: 'Invoice Amount' },
  ]
  const pages = Math.ceil(invoices.length / 36)
  for (let p = 0; p < pages; p++) {
    doc.addPage()
    sectionTitle('INVOICES')
    note('Synthetic invoices — 100 records')
    headerRow(cols)
    doc.fontSize(8)
    invoices.slice(p * 36, (p + 1) * 36).forEach((row, idx) => {
      const y = TOP + idx * ROW_H
      doc.fillColor('#334155')
      cell(row, 'id', cols[0], y)
      cell(row, 'vendor', cols[1], y)
      cell(row, 'city', cols[2], y)
      cell(row, 'date', cols[3], y)
      doc.text(amt(row.amount), cols[4].x, y, { width: cols[4].w, lineBreak: false })
    })
    doc.fontSize(7).fillColor('#94a3b8').text(`Page ${p + 1} of ${pages} — ReconAI synthetic demo data. Not actual company transactions.`, 30, 780)
  }
}

// ---------- PAYMENTS table ----------
{    const cols = [
    { key: 'id', x: 30, w: 110, label: 'Payment ID' },
    { key: 'ref', x: 145, w: 120, label: 'Invoice Ref' },
    { key: 'date', x: 270, w: 90, label: 'Pay Date' },
    { key: 'amount', x: 365, w: 120, label: 'Payment Amount' },
    { key: 'status', x: 490, w: 75, label: 'Pay Status' },
  ]
  const ppay = Math.ceil(payments.length / 36)
  for (let p = 0; p < ppay; p++) {
    doc.addPage()
    sectionTitle('PAYMENTS')
    note('Synthetic payments against the invoices above — 98 records')
    headerRow(cols)
    doc.fontSize(8)
    payments.slice(p * 36, (p + 1) * 36).forEach((row, idx) => {
      const y = TOP + idx * ROW_H
      doc.fillColor('#334155')
      cell(row, 'id', cols[0], y)
      cell(row, 'ref', cols[1], y)
      cell(row, 'date', cols[2], y)
      doc.text(amt(row.amount), cols[3].x, y, { width: cols[3].w, lineBreak: false })
      cell(row, 'status', cols[4], y)
    })
    doc.fontSize(7).fillColor('#94a3b8').text(`Page ${p + 1} of ${ppay} — ReconAI synthetic demo data. Not actual company transactions.`, 30, 780)
  }
}

// ---------- BANK TRANSACTIONS table ----------
{    const cols = [
    { key: 'id', x: 30, w: 100, label: 'Bank Tx ID' },
    { key: 'ref', x: 135, w: 120, label: 'Payment Ref' },
    { key: 'date', x: 260, w: 100, label: 'Tx Date' },
    { key: 'amount', x: 365, w: 120, label: 'Bank Amount' },
    { key: 'status', x: 490, w: 75, label: 'Tx Status' },
  ]
  const pbank = Math.ceil(bankTxs.length / 36)
  for (let p = 0; p < pbank; p++) {
    doc.addPage()
    sectionTitle('BANK TRANSACTIONS')
    note('Synthetic bank transactions against the payments above — 88 records')
    headerRow(cols)
    doc.fontSize(8)
    bankTxs.slice(p * 36, (p + 1) * 36).forEach((row, idx) => {
      const y = TOP + idx * ROW_H
      doc.fillColor('#334155')
      cell(row, 'id', cols[0], y)
      cell(row, 'ref', cols[1], y)
      cell(row, 'date', cols[2], y)
      doc.text(amt(row.amount), cols[3].x, y, { width: cols[3].w, lineBreak: false })
      cell(row, 'status', cols[4], y)
    })
    doc.fontSize(7).fillColor('#94a3b8').text(`Page ${p + 1} of ${pbank} — ReconAI synthetic demo data. Not actual company transactions.`, 30, 780)
  }
}

doc.end()
stream.on('finish', () => {
  console.log(`Wrote ${outFile}`)
  console.log(`invoices=${invoices.length} payments=${payments.length} bankTxs=${bankTxs.length}`)
})
