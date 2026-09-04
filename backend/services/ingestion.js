// Unified document ingestion pipeline.
//
// FILE UPLOAD -> TYPE DETECTION -> EXTRACTION (CSV/TXT/PDF_TEXT/PDF_OCR/IMAGE_OCR)
//   -> STRUCTURED NORMALIZATION -> VALIDATION -> RECONCILIATION ENGINE
//
// Every input is converted to one normalized record shape. Extraction
// confidence is kept strictly separate from reconciliation confidence.
// Foreign currency is detected and flagged — never silently converted.

import { parse } from 'csv-parse/sync';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractTables } from './pdfTables.js';
import { createWorker } from 'tesseract.js';
import jpeg from 'jpeg-js';
import { inflateSync, deflateSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseAmount, detectCurrency, CURRENCY } from './money.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESS_LANG_PATH = join(__dirname, '..', '..', 'node_modules', '@tesseract.js-data', 'eng', '4.0.0');

export const SUPPORTED_EXTENSIONS = ['csv', 'txt', 'text', 'pdf', 'png', 'jpg', 'jpeg', 'webp'];
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ---------- file type detection ----------

export function sanitizeFilename(name = '') {
  const base = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.\./g, '_');
  return (base || 'document').slice(0, 120);
}

export function detectFileType(fileName = '', mime = '') {
  const ext = String(fileName.split('.').pop() || '').toLowerCase();
  const safeExt = ext.replace(/[^a-z0-9]/g, '');
  const mapping = {
    csv: { fileType: 'CSV', kind: 'csv' },
    txt: { fileType: 'TXT', kind: 'txt' },
    text: { fileType: 'TXT', kind: 'txt' },
    pdf: { fileType: 'PDF', kind: 'pdf' },
    png: { fileType: 'PNG', kind: 'image' },
    jpg: { fileType: 'JPG', kind: 'image' },
    jpeg: { fileType: 'JPEG', kind: 'image' },
    webp: { fileType: 'WEBP', kind: 'image' },
  };
  const hit = mapping[safeExt];
  if (!hit) {
    throw new Error('Unsupported file type. Please upload CSV, TXT, PDF, PNG, JPG, JPEG, or WEBP.');
  }
  return { ext: safeExt, ...hit };
}

// ---------- document source-type detection ----------

function textHint(name) {
  const n = (name || '').toLowerCase();
  if (/invoice|bill\b/.test(n)) return 'invoice';
  if (/payment|receipt|remittance/.test(n)) return 'payment';
  if (/statement|transaction|bank/.test(n)) return 'bank_statement';
  return null;
}

// Returns INVOICE | PAYMENT | BANK_STATEMENT | OTHER
export function detectSourceType(text, fileName, override) {
  if (override && override !== 'AUTO' && override !== 'auto') return override;
  const t = String(text || '');
  const hint = textHint(fileName);
  let invoice = 0, payment = 0, bank = 0;
  if (/tax\s*invoice|invoice\s*(no|number|#|id)|bill\s*(no|number|to)|gstin|inv-\d/i.test(t)) invoice += 3;
  if (/invoice|billed|supplier|vendor/.test(t)) invoice += 1;
  if (/payment\s*(receipt|ref|reference|date|id)|pay\s*ref|remittance|payer|payee|upi|neft|rtgs|imps|nach/i.test(t)) payment += 2;
  if (/receipt|against\s*invoice|paid\s*by/i.test(t)) payment += 1;
  if (/bank\s*statement|account\s*statement|transaction\s*(id|ref|date|no)|debit|credit|balance|narrative|particulars|opening\s*balance/i.test(t)) bank += 3;
  if (hint === 'invoice') invoice += 2;
  if (hint === 'payment') payment += 2;
  if (hint === 'bank_statement') bank += 2;
  if (bank > invoice && bank > payment) return 'BANK_STATEMENT';
  if (invoice >= payment && invoice > 0) return 'INVOICE';
  if (payment > 0) return 'PAYMENT';
  if (bank > 0) return 'BANK_STATEMENT';
  return 'OTHER';
}

// ---------- OCR (lazy shared worker) ----------

let workerPromise = null;
async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { langPath: TESS_LANG_PATH, gzip: true });
  }
  return workerPromise;
}

async function ocrBuffer(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  return { text: data.text || '', confidence: Math.round(data.confidence || 0) };
}

// ---------- pure-JS PNG encoder (for decoded PDF images) ----------

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, pixels, colorType) {
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  const raw = Buffer.alloc(height * (1 + width * bytesPerPixel));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * bytesPerPixel);
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * width * bytesPerPixel, (y + 1) * width * bytesPerPixel);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------- PDF extraction ----------

async function pdfText(buffer) {
  const data = new Uint8Array(buffer.slice(0));
  const task = getDocument({ data, useSystemFonts: true, isEvalSupported: false });
  const pdf = await task.promise;
  let out = '';
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let line = '';
      for (const item of tc.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          out += line.trimEnd() + '\n';
          line = '';
        } else {
          line += ' ';
        }
      }
      if (line.trim()) out += line.trimEnd() + '\n';
    }
  } finally {
    try { await pdf.destroy(); } catch { /* ignore */ }
  }
  return out;
}

// Extract embedded page images from a scanned PDF (JPEG/DCTDecode and
// FlateDecode RGB/gray), returning PNG buffers ready for OCR.
function extractPdfPageImages(buffer) {
  const text = buffer.toString('latin1');
  const images = [];
  // Match an image XObject dictionary followed by its stream
  const re = /\/Subtype\s*\/Image(?=[\s\S]{0,400}?stream)([\s\S]*?)stream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const dict = m[1];
    const streamStart = m.index + m[0].length;
    const filter = (/\/Filter\s*\/DCTDecode/.test(dict)) ? 'DCTDecode'
      : (/\/Filter\s*\/FlateDecode/.test(dict)) ? 'FlateDecode' : null;
    const cs = /\/ColorSpace\s*\/(DeviceRGB|DeviceGray|RGB|Gray)/.exec(dict);
    const colorSpace = cs ? (cs[1].includes('Gray') ? 'gray' : 'rgb') : null;
    const w = parseInt((/\/Width\s+(\d+)/.exec(dict) || [])[1] || '0', 10);
    const h = parseInt((/\/Height\s+(\d+)/.exec(dict) || [])[1] || '0', 10);
    const endIdx = text.indexOf('endstream', streamStart);
    if (endIdx === -1 || !filter || !w || !h) continue;
    const raw = Buffer.from(text.slice(streamStart, endIdx), 'latin1');
    if (filter === 'DCTDecode') {
      try {
        const jf = jpeg.decode(raw, { formatAsRGBA: true });
        images.push({ png: encodePng(jf.width, jf.height, Buffer.from(jf.data), 6), width: jf.width, height: jf.height });
      } catch { /* skip corrupt */ }
    } else if (filter === 'FlateDecode' && colorSpace && (colorSpace === 'rgb' || colorSpace === 'gray')) {
      try {
        const rawPx = inflateSync(raw);
        const bpp = colorSpace === 'rgb' ? 3 : 1;
        const expected = w * h * bpp;
        if (rawPx.length >= expected) {
          const pixels = rawPx.slice(0, expected);
          images.push({ png: encodePng(w, h, pixels, colorSpace === 'rgb' ? 2 : 0), width: w, height: h });
        }
      } catch { /* skip */ }
    }
  }
  return images;
}

// ---------- generic text parsing into normalized records ----------

const DATE_RE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;
const ISO_DATE_RE = /(\d{4})-(\d{1,2})-(\d{1,2})/;

function toISODate(token) {
  if (!token) return null;
  let m = ISO_DATE_RE.exec(token);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
  m = DATE_RE.exec(token);
  if (m) {
    let first = Number(m[1]), second = Number(m[2]), yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    // Indian docs use DD/MM/YYYY. Treat as DD/MM unless the second part is
    // clearly a day (>12) while the first is a valid month (US MM/DD).
    if (second > 12 && first <= 12) { const t = first; first = second; second = t; }
    if (second < 1 || second > 12 || first < 1 || first > 31) return null;
    return `${yy}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
  }
  return null;
}

function labelValue(text, labels, idOnly = false) {
  // labels like ['invoice no','invoice number','invoice #','invoice id']
  const escaped = labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?:^|\\n)\\s*(?:${escaped.join('|')})\\s*[:#\\-]?\\s*([^\\n]{2,80})`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  const val = m[1].trim();
  if (idOnly) {
    const id = /([A-Z]{2,4}[-\s]?\d[\w-]*)/.exec(val);
    return id ? id[1].replace(/\s/g, '') : null;
  }
  return val;
}

function findAny(text, patterns) {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}

// Like findAny but returns the first capture group (the clean id token)
function findId(text, patterns) {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && m[1] !== undefined && m[1] !== null && String(m[1]).trim()) return String(m[1]).trim();
    if (m) return m[0];
  }
  return null;
}

// first date-looking token in a value/text -> ISO date or null
function dateFromValue(value) {
  if (!value) return null;
  const any = ISO_DATE_RE.exec(value) || DATE_RE.exec(value);
  return any ? toISODate(any[0]) : null;
}

function parseAmountLine(text) {
  // Prefer labelled amount lines, then a bare ₹/Rs amount anywhere
  const labelled = /(?:^|\n)\s*(?:amount|total|grand\s*total|invoice\s*amount|amount\s*paid|amount\s*received|due|balance|credit|debit|principal)\s*[:#\-]?\s*((?:₹|$|€|£|\brs\.?|\binr\b)?\s*[-\d][\d,.]*)/im;
  const m = labelled.exec(text);
  if (m) return parseAmount(m[1]);
  const bare = /[₹]\s*[\d,]+(?:\.\d{2})?|\brs\.?\s*[\d,]+(?:\.\d{2})?|\binr\s*[\d,]+(?:\.\d{2})?/i.exec(text);
  if (bare) return parseAmount(bare[0]);
  const generic = /[\d,]+\.\d{2}/.exec(text);
  return generic ? parseAmount(generic[0]) : null;
}

// Split text into per-record blocks when a record-kind header (Invoice ID,
// Payment No, Txn Ref, …) appears on 2+ lines with an ID-like value. A single
// invoice doc mentioning one "Payment Reference" is NOT split — only repeated
// headers of the same kind are treated as record boundaries.
function splitRecordBlocks(text) {
  const re = /^\s*(invoice\s*(?:no\.?|number|#|id)|payment\s*(?:id|no\.?|number|ref(?:erence)?|code)|receipt\s*(?:no\.?|number|#)|txn?\s*(?:id|ref(?:erence)?|no\.?|number)|transaction\s*(?:id|ref(?:erence)?|no\.?|number))\s*[:#-]\s*([A-Z]{2,5}-?\d[\w-]*)/gim;
  const starts = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const kind = /^invoice/i.test(m[1]) ? 'invoice' : /^(payment|receipt)/i.test(m[1]) ? 'payment' : 'tx';
    starts.push({ index: m.index, kind });
  }
  const counts = {};
  for (const s of starts) counts[s.kind] = (counts[s.kind] || 0) + 1;
  const splitKinds = new Set(Object.keys(counts).filter(k => counts[k] >= 2));
  if (!splitKinds.size) return [text];
  const cuts = starts.filter(s => splitKinds.has(s.kind)).map(s => s.index);
  const blocks = [];
  for (let i = 0; i < cuts.length; i++) {
    blocks.push(text.slice(cuts[i], i + 1 < cuts.length ? cuts[i + 1] : undefined));
  }
  return blocks;
}

function parseTextToRecords(text, sourceType) {
  const records = [];
  const methodBase = 'TEXT';
  const t = text.replace(/\r\n/g, '\n');

  if (sourceType === 'BANK_STATEMENT') {
    const lines = t.split('\n');
    for (const line of lines) {
      const dt = dateFromValue(line);
      if (!dt) continue;
      // Find numeric tokens (Indian grouping or plain)
      const nums = [];
      const numRe = /[-+]?\(?\d[\d,]*\.?\d*\)?/g;
      let nm;
      const candidates = [];
      while ((nm = numRe.exec(line.replace(/\s+/g, ' '))) !== null) {
        const val = nm[0];
        if (/^\d{4,}$/.test(val)) continue; // long plain digits unlikely an amount
        const parsed = parseAmount(val);
        if (parsed !== null) candidates.push({ raw: val, parsed });
      }
      if (candidates.length === 0) continue;
      // last amount is likely the transaction amount (or balance)
      const amt = candidates[candidates.length - 1].parsed;
      let description = line.replace(/(?:^|\s)\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/, ' ')
        .replace(/[-+]?\(?\d[\d,]*\.?\d*\)?/g, ' ')
        .replace(/\s+/g, ' ').trim();
      if (!description || description.length < 2) description = 'Bank statement entry';
      records.push({
        recordType: 'bank_transaction',
        entityName: null,
        date: dt,
        amount: Math.abs(amt),
        currency: CURRENCY,
        referenceId: findAny(line, [/\b(TX-?\d[\w-]*)/i, /\b(NEFT|RTGS|IMPS|UPI|UTR)[-\s]?\d*/i]) || null,
        invoiceId: null,
        paymentId: null,
        bankTransactionId: findAny(line, [/\b(TX-?\d[\w-]*)/i]) || null,
        description,
        extractionMethod: methodBase,
        warnings: line.includes('balance') ? ['Possible running balance in line'] : [],
      });
    }
    return records;
  }

  // Multi-record text (e.g. a remittance sheet with several "Payment ID:" blocks):
  // recurse per block so each header group becomes its own record.
  const blocks = splitRecordBlocks(t);
  if (blocks.length > 1) {
    const out = [];
    for (const block of blocks) {
      for (const r of parseTextToRecords(block, sourceType)) out.push(r);
    }
    return out;
  }

  // ---------- single-record documents (invoice / payment / other) ----------
  const rec = {
    recordType: sourceType === 'INVOICE' ? 'invoice' : sourceType === 'PAYMENT' ? 'payment' : 'other',
    entityName: null,
    date: null,
    amount: null,
    currency: CURRENCY,
    referenceId: null,
    invoiceId: null,
    paymentId: null,
    bankTransactionId: null,
    description: null,
    extractionMethod: methodBase,
    warnings: [],
  };

  const invoiceId = findId(t, [
    /(?:invoice\s*(?:no|number|#|id))\s*[:#\-]?\s*([A-Z]{2,5}-?\d[\w-]*)/i,
    /\b(INV-?\d{3,})\b/i,
  ]);
  const paymentId = findId(t, [
    /(?:payment\s*(?:ref|no|number|id|reference)|pay\s*ref(?:erence)?|receipt\s*no)\s*[:#\-]?\s*([A-Z]{2,5}-?\d[\w-]*)/i,
    /\b(PAY-?\d{3,})\b/i,
  ]);
  const txId = findId(t, [/\b(TX-?\d{3,})\b/i, /(?:txn?\s*(?:id|ref|no|number))\s*[:#\-]?\s*([\w-]+)/i]);

  const invoiceRefAnywhere = findAny(t, [/\b(INV-?\d{3,})\b/i]) || null;

  if (sourceType === 'INVOICE' || (!paymentId && !txId && invoiceId)) {
    rec.recordType = 'invoice';
    rec.invoiceId = invoiceId || invoiceRefAnywhere;
    rec.referenceId = rec.invoiceId;
    rec.entityName = labelValue(t, ['customer', 'customer name', 'bill to', 'client', 'vendor', 'supplier', 'sold to', 'buyer']) || null;
    const dateVal = labelValue(t, ['invoice date', 'date of invoice']);
    const dueVal = labelValue(t, ['due date']);
    rec.date = dateFromValue(dateVal) || dateFromValue(t);
    rec.description = null;
    rec._dueDate = dueVal ? dateFromValue(dueVal) : null;
  } else if (sourceType === 'PAYMENT' || paymentId || (invoiceRefAnywhere && /payment|paid|receipt/i.test(t))) {
    rec.recordType = 'payment';
    rec.paymentId = paymentId;
    rec.referenceId = paymentId || findAny(t, [/\b(NEFT|RTGS|IMPS|UPI|UTR)[-\s]?\d*/i]) || null;
    rec.entityName = labelValue(t, ['payer', 'payee', 'remitter', 'customer name', 'customer', 'paid by', 'paid to']) || null;
    const dateVal = labelValue(t, ['payment date', 'date of payment', 'transaction date']);
    rec.date = dateFromValue(dateVal) || dateFromValue(t);
    const against = labelValue(t, ['against invoice', 'invoice reference', 'invoice no', 'invoice number'], true);
    rec.invoiceId = invoiceRefAnywhere || against || null;
  } else if (txId) {
    rec.recordType = 'bank_transaction';
    rec.bankTransactionId = txId;
    rec.referenceId = txId;
    rec.entityName = labelValue(t, ['payer', 'payee', 'remitter', 'beneficiary', 'customer']) || null;
    const dateVal = labelValue(t, ['transaction date', 'value date']);
    rec.date = dateFromValue(dateVal) || dateFromValue(t);
  } else {
    rec.recordType = 'other';
    rec.entityName = labelValue(t, ['customer', 'vendor', 'payer', 'payee', 'party']) || null;
    const dateVal = labelValue(t, ['date']);
    rec.date = dateVal ? dateFromValue(dateVal) : null;
  }

  rec.amount = parseAmountLine(t);
  records.push(rec);
  return records;
}

// ---------- CSV extraction ----------

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[_\s]+/g, '');
}

function detectCsvKind(headers) {
  const h = headers.map(normalizeHeader).join(',');
  if (/(invoiceid|invoiceno|invoicenumber)/.test(h) && /(customer|customername|vendorname|buyer)/.test(h)) return 'INVOICE';
  if (/(paymentid|paymentno|paymentref|paymentreference)/.test(h) && /amount/.test(h) && /(paymentdate|date)/.test(h)) return 'PAYMENT';
  if (/(transactionid|transactionref|transactionno|reference|txnid)/.test(h) && /(description|narrative|particulars|debit|credit)/.test(h)) return 'BANK_STATEMENT';
  if (/debit|credit/.test(h)) return 'BANK_STATEMENT';
  if (/amount|total/.test(h) && /date/.test(h)) return 'INVOICE';
  return 'OTHER';
}

function pickCol(row, headers, candidates) {
  for (const c of candidates) {
    const i = headers.indexOf(c);
    if (i >= 0 && row[headers[i]] !== undefined && String(row[headers[i]]).trim() !== '') return String(row[headers[i]]).trim();
  }
  return null;
}

function parseCsvToRecords(csv, fileName) {
  const rawRows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  if (!rawRows.length) return { kind: 'OTHER', records: [] };
  const headers = Object.keys(rawRows[0]);
  const kind = detectCsvKind(headers);
  const key = (arr) => arr.map(normalizeHeader);
  const hk = key(headers);
  const find = (...cands) => {
    const norm = cands.map(normalizeHeader);
    const i = hk.findIndex(c => norm.includes(c));
    return i >= 0 ? headers[i] : null;
  };

  const idOf = (col) => col ? find(col, col + 'id', col + 'no', col + 'number', col + 'ref', col + 'reference') : null;

  const colAmount = find('amount', 'total', 'grandtotal', 'invoiceamount', 'paidamount', 'amountpaid', 'credit', 'debit');
  const colDate = find('date', 'transactiondate', 'invoicedate', 'paymentdate', 'valuedate');
  const colEntity = find('customer', 'customername', 'vendorname', 'vendor', 'supplier', 'buyer', 'payer', 'payee', 'party', 'remitter', 'name');

  const records = [];
  for (let ri = 0; ri < rawRows.length; ri++) {
    const row = rawRows[ri];
    const values = Object.values(row);
    const entityName = pickCol(row, headers, [colEntity].filter(Boolean).concat(find('customer') || '', find('name') || ''));
    let amount = null;
    let currency = CURRENCY;
    if (colAmount) {
      const raw = row[colAmount];
      if (colAmount && normalizeHeader(colAmount) === 'debit') amount = -(parseAmount(raw) ?? 0);
      else if (colAmount && normalizeHeader(colAmount) === 'credit') amount = parseAmount(raw);
      else amount = parseAmount(raw);
    }
    const currencyCol = find('currency', 'ccy');
    if (currencyCol && row[currencyCol]) currency = String(row[currencyCol]).trim().toUpperCase();
    let dateRaw = colDate ? row[colDate] : null;
    const date = dateRaw ? toISODate(String(dateRaw)) : null;
    const record = {
      recordType: kind === 'INVOICE' ? 'invoice' : kind === 'PAYMENT' ? 'payment' : kind === 'BANK_STATEMENT' ? 'bank_transaction' : 'other',
      entityName: entityName || null,
      date,
      amount,
      currency,
      referenceId: null,
      invoiceId: null,
      paymentId: null,
      bankTransactionId: null,
      description: null,
      extractionMethod: 'CSV',
      warnings: [],
    };
    if (record.recordType === 'invoice') {
      record.invoiceId = pickCol(row, headers, ['invoice_id', 'invoiceid', 'invoice no', 'invoice', 'invoicenumber', 'reference']) || null;
      record.referenceId = record.invoiceId;
    } else if (record.recordType === 'payment') {
      record.paymentId = pickCol(row, headers, ['payment_id', 'paymentid', 'payment no', 'paymentref', 'paymentrefno', 'reference']) || null;
      record.referenceId = record.paymentId;
      record.invoiceId = pickCol(row, headers, ['invoice_id', 'invoiceid', 'invoice_ref', 'invoicereference', 'against invoice', 'invoice']) || null;
    } else if (record.recordType === 'bank_transaction') {
      record.bankTransactionId = pickCol(row, headers, ['transaction_id', 'transactionid', 'txn id', 'txnid', 'ref no', 'reference']) || null;
      record.referenceId = record.bankTransactionId;
      record.description = pickCol(row, headers, ['description', 'narrative', 'particulars', 'details', 'remarks']) || null;
    }
    if (!record.amount) record.amount = null;
    records.push(record);
  }
  return { kind, records };
}

// ---------- validation ----------

export function validateRecord(record, existingIds = {}) {
  const warnings = [...(record.warnings || [])];
  const rec = { ...record, warnings };
  let requiredMissing = [];

  const amountUnknown = rec.amount === null || rec.amount === undefined || isNaN(rec.amount);
  if (rec.recordType !== 'other') {
    if (amountUnknown) requiredMissing.push('amount');
    if (!rec.date) requiredMissing.push('date');
    if (rec.recordType === 'invoice' && !rec.invoiceId) requiredMissing.push('invoice id');
    if (rec.recordType === 'payment' && !rec.paymentId && !rec.invoiceId) requiredMissing.push('payment/invoice reference');
    if (rec.recordType === 'bank_transaction' && !rec.description && !rec.referenceId && !rec.date) requiredMissing.push('description');
  }

  // Duplicate identity is the record's OWN primary id — never a cross-reference
  // (a payment may legitimately point at an already-existing invoice).
  const dupKey = rec.recordType === 'invoice' ? (rec.invoiceId || null)
    : rec.recordType === 'payment' ? (rec.paymentId || null)
    : rec.recordType === 'bank_transaction' ? (rec.bankTransactionId || null)
    : (rec.invoiceId || rec.paymentId || rec.bankTransactionId || null);
  if (dupKey && existingIds[dupKey]) {
    warnings.push(`Duplicate: ${dupKey} already exists in the dataset`);
  }

  const foreign = detectCurrency([rec.description, rec.entityName, rec.referenceId].filter(Boolean).join(' ') + ' ' + (rec.currency || ''));
  const foreignCurrency = foreign.isForeign ? foreign.code : null;
  if (foreign.isForeign) {
    warnings.push(`Foreign currency detected: ${foreign.code} — record kept for review, not converted`);
  }

  let status = 'valid';
  if (requiredMissing.length) {
    warnings.push(`Missing fields: ${requiredMissing.join(', ')}`);
    status = amountUnknown && !rec.amount ? 'error' : 'needs_review';
  }
  if (amountUnknown) {
    warnings.push('Amount could not be determined from this document');
    status = 'error';
  }
  if (rec.currency && !/^(INR|USD|EUR|GBP|JPY)$/.test(String(rec.currency).toUpperCase())) {
    warnings.push(`Unrecognised currency code: ${rec.currency}`);
    status = 'needs_review';
  }
  if (rec.recordType === 'other') status = 'needs_review';

  return { ...rec, currency: foreign.isForeign ? foreign.code : (String(rec.currency || CURRENCY).toUpperCase() || CURRENCY), foreignCurrency, validationStatus: status, warnings };
}

// ---------- main per-file processor ----------

export async function processFile({ buffer, originalName, mime, docTypeOverride, existingIds }) {
  const fileName = sanitizeFilename(originalName || 'document');
  const { fileType, kind } = detectFileType(originalName || mime, mime);
  if (buffer.length > MAX_FILE_SIZE) {
    return { error: 'File exceeds the 20 MB limit' };
  }

  let method = null;
  let text = '';
  let ocrConfidence = null;
  let records = [];
  let pdfDetail = null; // set when PDF_TABLE extraction succeeded

  if (kind === 'csv') {
    const csv = buffer.toString('utf-8');
    const out = parseCsvToRecords(csv, fileName);
    method = 'CSV';
    const sourceType = docTypeOverride && docTypeOverride !== 'AUTO' ? docTypeOverride : out.kind;
    records = out.records.map(r => ({ ...r, extractionMethod: 'CSV', extractionConfidence: sourceType === 'OTHER' ? 82 : 97 }));
  } else if (kind === 'txt') {
    text = buffer.toString('utf-8');
    method = 'TXT';
    const sourceType = detectSourceType(text, fileName, docTypeOverride);
    const raw = parseTextToRecords(text, sourceType);
    records = raw.map(r => ({ ...r, extractionMethod: 'TXT', extractionConfidence: 96 }));
    if (sourceType === 'OTHER' && (!docTypeOverride || docTypeOverride === 'AUTO')) {
      records = records.map(r => ({ ...r, validationStatus: 'needs_review', warnings: [...(r.warnings || []), 'Document type not confidently identified — confirm below'] }));
    }
  } else if (kind === 'pdf') {
    const pdfTxt = await pdfText(buffer);
    const meaningful = pdfTxt.replace(/\s+/g, '').length >= 30;
    if (meaningful) {
      // 1) Position-aware table extraction — handles multi-page financial
      //    tables (all rows, all pages, repeated headers suppressed).
      const tabular = await extractTables(buffer);
      if (tabular.ok && tabular.records.length > 0) {
        method = 'PDF_TABLE';
        text = tabular.text;
        records = tabular.records;
        pdfDetail = {
          method: 'PDF_TABLE',
          pagesScanned: tabular.pagesScanned,
          tables: tabular.tables,
        };
      } else {
        // 2) Label-based text fallback (single invoice/payment documents).
        text = pdfTxt;
        method = 'PDF_TEXT';
      }
    } else {
      // Scanned PDF → OCR the embedded page images
      const pageImages = extractPdfPageImages(buffer);
      if (pageImages.length === 0) {
        return {
          error: 'Scanned PDF detected but no embedded page image could be extracted for OCR in this environment.',
          method: 'PDF_OCR',
          fileType,
          fileName,
        };
      }
      let combined = '';
      let confSum = 0;
      for (const img of pageImages) {
        const res = await ocrBuffer(img.png);
        combined += res.text + '\n';
        confSum += res.confidence;
      }
      text = combined;
      method = 'PDF_OCR';
      ocrConfidence = Math.round(confSum / pageImages.length);
    }

    if (!pdfDetail) {
      // label/OCR path → per-record metadata is applied below
      const sourceType = detectSourceType(text, fileName, docTypeOverride);
      const raw = parseTextToRecords(text, sourceType);
      records = raw.map(r => ({
        ...r,
        extractionMethod: method,
        extractionConfidence: method === 'PDF_OCR' ? (ocrConfidence ?? 88) : 97,
      }));
      if (sourceType === 'OTHER' && (!docTypeOverride || docTypeOverride === 'AUTO')) {
        records = records.map(r => ({ ...r, warnings: [...(r.warnings || []), 'Document type not confidently identified — confirm below'], validationStatus: 'needs_review' }));
      }
    }
  } else if (kind === 'image') {
    method = 'IMAGE_OCR';
    const res = await ocrBuffer(buffer);
    text = res.text;
    ocrConfidence = res.confidence;
    const sourceType = detectSourceType(text, fileName, docTypeOverride);
    const raw = parseTextToRecords(text, sourceType);
    records = raw.map(r => ({ ...r, extractionMethod: 'IMAGE_OCR', extractionConfidence: ocrConfidence }));
    if (sourceType === 'OTHER' && (!docTypeOverride || docTypeOverride === 'AUTO')) {
      records = records.map(r => ({ ...r, warnings: [...(r.warnings || []), 'Document type not confidently identified — confirm below'], validationStatus: 'needs_review' }));
    }
  }

  // Currency detection on whole document
  const currencyInfo = detectCurrency(text + ' ' + fileName);

  // Normalize + validate every record (records with validation errors are kept
  // so they can be shown and counted — they are never loaded silently)
  const validated = records.map(r => validateRecord(r, existingIds));

  // Table-driven records carry their own per-row extraction confidence and
  // per-row type; the source label reflects the actual tables, not the filename.
  let sourceTypeLabel;
  if (pdfDetail) {
    const fams = {};
    for (const r of validated) fams[r.recordType] = (fams[r.recordType] || 0) + 1;
    const present = Object.keys(fams);
    sourceTypeLabel = present.length === 1
      ? (present[0] === 'invoice' ? 'INVOICE' : present[0] === 'payment' ? 'PAYMENT' : 'BANK_STATEMENT')
      : 'MIXED';
  } else {
    sourceTypeLabel = docTypeOverride && docTypeOverride !== 'AUTO' ? docTypeOverride : detectSourceType(text, fileName, docTypeOverride);
  }

  const byType = { invoice: 0, payment: 0, bank_transaction: 0, other: 0 };
  for (const r of validated) byType[r.recordType] = (byType[r.recordType] || 0) + 1;
  const duplicatesDetected = validated.filter(r => (r.warnings || []).some(w => /^Duplicate:/.test(w))).length;

  const detail = pdfDetail ? {
    method: pdfDetail.method,
    pagesScanned: pdfDetail.pagesScanned,
    tablesDetected: pdfDetail.tables.length,
    tables: pdfDetail.tables.map(t => ({ label: t.label, rows: t.rowCount, pages: t.pageCount })),
    recordsByType: byType,
    duplicatesDetected,
  } : null;

  const summaryBits = [`${validated.length} record${validated.length === 1 ? '' : 's'} extracted`];
  if (detail) summaryBits.unshift(`PDF_TABLE: ${detail.pagesScanned} pages, ${detail.tablesDetected} table${detail.tablesDetected === 1 ? '' : 's'}`);
  const message = validated.length
    ? `${summaryBits.join(' — ')}`
    : 'No financial records could be extracted from this document';

  return {
    fileName,
    fileType,
    fileSize: buffer.length,
    kind,
    method,
    sourceType: sourceTypeLabel,
    extractionConfidence: method && method.endsWith('OCR') ? (ocrConfidence ?? null) : (validated.length ? Math.round(validated.reduce((a, r) => a + (r.extractionConfidence || 95), 0) / validated.length) : null),
    ocrConfidence,
    textPreview: text.slice(0, 800),
    foreignCurrency: currencyInfo.isForeign ? currencyInfo.code : null,
    pagesScanned: detail ? detail.pagesScanned : null,
    tablesDetected: detail ? detail.tablesDetected : null,
    tableDetail: detail ? detail.tables : null,
    recordsByType: byType,
    duplicatesDetected,
    records: validated,
    message,
  };
}
