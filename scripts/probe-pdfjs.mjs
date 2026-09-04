import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const sampleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples')
const buf = fs.readFileSync(path.join(sampleDir, 'ReconAI_100_INR_Reconciliation_Dataset.pdf'))
const pdf = await getDocument({ data: new Uint8Array(buf) }).promise
const page = await pdf.getPage(1)
const tc = await page.getTextContent()
// Print first ~26 items with x/y (transform[4]/[5]) and hasEOL
let count = 0
for (const it of tc.items) {
  if (!('str' in it)) continue
  const x = it.transform ? Math.round(it.transform[4] * 10) / 10 : null
  const y = it.transform ? Math.round(it.transform[5] * 10) / 10 : null
  console.log(JSON.stringify({ str: it.str.slice(0, 22), x, y, eol: !!it.hasEOL }))
  if (++count >= 34) break
}
console.log('total items page1:', tc.items.length, '| lines estimated by EOL:', tc.items.filter(i => 'hasEOL' in i && i.hasEOL).length)
await pdf.destroy()
