const http = require('http')
const get = (p) => new Promise((res, rej) => http.get('http://localhost:3001' + p, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej))

;(async () => {
  const { evaluation: e } = await get('/api/results')
  console.log('processed:', e.total_records, '| matched:', e.matched, '| partial:', e.partial_match, '| exceptions:', e.exceptions, '| unresolved:', e.unresolved, '| duplicates:', e.duplicates, '| missing:', e.missing, '| sum:', e.matched + e.partial_match + e.exceptions + e.unresolved + e.duplicates + e.missing)
  console.log('precision:', Math.round(e.precision * 100) + '%', '| recall:', Math.round(e.recall * 100) + '%', '| f1:', Math.round(e.f1 * 100) + '%', '| accuracy:', Math.round(e.accuracy * 100) + '%', '| gt:', e.has_ground_truth, '| matchRate:', Math.round(e.match_rate * 100) + '%')
  const cc = await get('/api/consistency-check')
  console.log('consistency ok:', cc.ok, '| errors:', cc.errors.length)
  const { results } = await get('/api/results')
  const mt = {}
  results.forEach(x => { mt[x.match_type] = (mt[x.match_type] || 0) + 1 })
  console.log('match types:', JSON.stringify(mt))
  const aud = await get('/api/audit')
  console.log('audit entries:', aud.logs.length)
  const ds = await get('/api/dataset')
  console.log('dataset:', ds.invoices.length, 'invoices /', ds.payments.length, 'payments /', ds.transactions.length, 'tx /', ds.groundTruthCount, 'ground truth')
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
