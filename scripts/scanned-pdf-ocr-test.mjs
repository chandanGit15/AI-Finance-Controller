import { readFile } from 'fs/promises';
import path from 'path';
import jpeg from 'jpeg-js';
import { createWorker } from 'tesseract.js';
import { deflateSync } from 'zlib';

const root = path.resolve();
const buf = await readFile(path.join(root, 'samples', 'invoice_scanned_inr.pdf'));
const s = buf.toString('latin1');

// Find all image streams
function extractStreams(text) {
  const out = [];
  const re = /(\d+) 0 obj[\s\S]*?\/Subtype\s*\/Image[\s\S]*?\/Filter\s*\/(DCTDecode|FlateDecode)[\s\S]*?\/Length\s*(\d+)[\s\S]*?stream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const startIdx = m.index + m[0].length - m[0].length + m[0].lastIndexOf('stream\n') + 7;
    out.push({ filter: m[2], length: parseInt(m[3], 10), start: startIdx });
  }
  return out;
}

const streams = extractStreams(s);
console.log('image streams found:', streams.length);
let png = null;
for (const st of streams) {
  const slice = s.slice(st.start, st.start + st.length);
  if (st.filter === 'DCTDecode') {
    const jpegBuf = Buffer.from(slice, 'latin1');
    const decoded = jpeg.decode(jpegBuf, { formatAsRGBA: true });
    console.log('decoded jpeg', decoded.width + 'x' + decoded.height, decoded.data.length);
    // wrap RGBA into a PNG (colortype 6)
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(decoded.width, 0);
    ihdr.writeUInt32BE(decoded.height, 4);
    ihdr[8] = 8; ihdr[9] = 6; // RGBA
    const raw = Buffer.alloc(decoded.height * (1 + decoded.width * 4));
    for (let y = 0; y < decoded.height; y++) {
      raw[y * (1 + decoded.width * 4)] = 0;
      const row = Buffer.from(decoded.data.buffer, y * decoded.width * 4, decoded.width * 4);
      raw.set(row, y * (1 + decoded.width * 4) + 1);
    }
    png = makePng(ihdr, raw);
  }
}

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

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePng(ihdr, raw) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const worker = await createWorker('eng', 1, {
  langPath: path.join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0'),
  gzip: true,
});
try {
  const { data } = await worker.recognize(png);
  console.log('OCR confidence:', data.confidence);
  console.log(data.text.slice(0, 900));
} finally {
  await worker.terminate();
}
