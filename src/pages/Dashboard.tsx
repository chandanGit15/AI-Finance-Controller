import { useContext, useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../App'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Icon, MetricHint, EmptyState, STATUS_META, reviewStateCounts } from '../components/ui'
import { formatINR } from '../format'

const pct = (v?: number | null, digits = 0) => v == null ? '—' : `${(v * 100).toFixed(digits).replace(/\.0$/, '')}%`

const STATUS_COLOR: Record<string, string> = {
  MATCHED: '#059669',
  PARTIAL_MATCH: '#d97706',
  EXCEPTION: '#dc2626',
  UNRESOLVED: '#64748b',
  DUPLICATE: '#7c3aed',
  MISSING: '#0284c7',
}

const flaggedStatuses = new Set(['EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING'])

function timeGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtTime(iso?: string | null, withDate = false) {
  if (!iso) return 'Not run yet'
  const d = new Date(iso)
  if (withDate) return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/* ------------------------------------------------------------------ */
/* Hero header                                                         */
/* ------------------------------------------------------------------ */

function HeroHeader({ hasData, hasResults, runAt, running }: {
  hasData: boolean
  hasResults: boolean
  runAt?: string | null
  running: boolean
}) {
  const { session, runReconciliation, generateDemo } = useContext(AppContext)
  const statusTxt = hasResults ? 'Operational' : hasData ? 'Idle — ready to reconcile' : 'Standby'
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">{timeGreeting()}, {session?.name || 'Chandan'}<span className="text-slate-300 mx-1.5">·</span>{session?.role || 'Finance Analyst'}</p>
          <h1 className="text-[26px] md:text-[28px] font-bold tracking-tight text-slate-900 leading-tight">Finance Control Center</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Monitor reconciliation, exceptions and financial operations across your data sources.
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${hasResults ? 'bg-emerald-500' : hasData ? 'bg-amber-400' : 'bg-slate-300'}`} />
              Reconciliation Agent {statusTxt}
            </span>
            <span className="text-slate-300">|</span>
            <span>Demo Organization</span>
            <span className="badge badge-info !text-[10px]">Sandbox</span>
            <span className="text-slate-300">|</span>
            <span>Last run: <b className="text-slate-700 font-medium">{runAt ? fmtTime(runAt, true) : 'never'}</b></span>
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={generateDemo} className="btn-secondary" disabled={running} title="Regenerate the synthetic INR demo dataset">
            <Icon.Refresh size={15} /> Generate Demo Data
          </button>
          <button
            onClick={runReconciliation}
            disabled={running || !hasData}
            className="btn-primary !px-5 !py-2.5 text-sm shadow-panel"
            aria-label="Run the reconciliation agent"
          >
            {running
              ? <><span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Reconciling…</>
              : <><Icon.Play size={15} /> Run Reconciliation</>}
          </button>
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Status banner (pre / post run)                                      */
/* ------------------------------------------------------------------ */

function StatusBanner({ hasData, hasResults, loading, running, onRun, onReview }: {
  hasData: boolean
  hasResults: boolean
  loading: boolean
  running: boolean
  onRun: () => void
  onReview: () => void
}) {
  const { dataset, evaluation, lastRun } = useContext(AppContext)
  const runAt = evaluation?.run_at || lastRun?.run_at
  const active = evaluation?.active_queue ?? evaluation?.review_queue ?? 0

  if (!hasData) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-panel">
        <div className="flex items-center gap-3.5">
          <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200"><Icon.Database size={18} /></span>
          <div>
            <p className="text-sm font-bold text-slate-800">No financial data loaded</p>
            <p className="text-xs text-slate-500 mt-0.5">Generate the synthetic demo dataset or upload documents to begin.</p>
          </div>
        </div>
      </div>
    )
  }

  if (hasResults && evaluation) {
    const sum = evaluation.matched + evaluation.partial_match + evaluation.exceptions + evaluation.unresolved + evaluation.duplicates + evaluation.missing
    const consistent = sum === evaluation.total_records
    return (
      <div className="rounded-xl border border-emerald-200 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-panel">
        <div className="flex items-start gap-3.5 min-w-0">
          <span className="mt-0.5 w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0"><Icon.Check size={18} /></span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-800 flex flex-wrap items-center gap-2">
              RECONCILIATION COMPLETE
              {consistent && <span className="badge badge-matched !text-[10px]"><Icon.Check size={10} /> statuses sum to {evaluation.total_records}</span>}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              <b className="num text-slate-800">{evaluation.total_records}</b> records processed ·{' '}
              <b className="num text-emerald-700">{evaluation.matched}</b> matched ·{' '}
              <b className={`num ${active > 0 ? 'text-amber-700' : 'text-slate-600'}`}>{active}</b> requiring attention
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Last run: {runAt ? fmtTime(runAt, true) : '—'} ·{' '}
              {(evaluation.processing_time_ms ?? 0) > 0 ? `${(evaluation.processing_time_ms / 1000).toFixed(2)}s · ${evaluation.throughput ?? '—'} rec/s` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={onReview} className="btn-secondary">Review Results</button>
        </div>
      </div>
    )
  }

  // Dataset loaded, reconciliation not yet run
  return (
    <div className="rounded-xl border border-brand-200 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-panel">
      <div className="flex items-center gap-3.5">
        <span className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200"><Icon.Layers size={18} /></span>
        <div>
          <p className="text-sm font-bold text-brand-800">DATASET READY</p>
          <p className="text-xs text-slate-600 mt-0.5">
            <b className="num text-slate-800">{dataset?.invoices?.length || 0}</b> invoices ·{' '}
            <b className="num text-slate-800">{dataset?.payments?.length || 0}</b> payments ·{' '}
            <b className="num text-slate-800">{dataset?.transactions?.length || 0}</b> bank transactions staged
            {dataset?.hasGroundTruth ? ' · ground truth available' : ' · no ground truth (uploaded data)'}
          </p>
        </div>
      </div>
      <button onClick={onRun} disabled={running} className="btn-primary !px-5 !py-2.5">
        {running ? <><span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Reconciling…</> : <><Icon.Play size={15} /> Run Reconciliation</>}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Action required                                                     */
/* ------------------------------------------------------------------ */

function ActionRequired({ results }: { results: any[] }) {
  const navigate = useNavigate()
  const { dataset, exceptions } = useContext(AppContext)
  const amountMap = useMemo(() => new Map((dataset?.invoices || []).map((i: any) => [i.invoice_id, i.amount])), [dataset])

  const active = useMemo(() => results.filter(r => flaggedStatuses.has(r.status) && r.resolved !== 1), [results])
  const exposure = useMemo(() => active.reduce((a, r) => a + (Number(amountMap.get(r.invoice_id)) || 0), 0), [active, amountMap])

  const buckets = useMemo(() => {
    const b: { label: string; count: number; cls: string; icon: string }[] = []
    const push = (label: string, key: string, cls: string) => {
      const n = active.filter(r => r.status === key).length
      if (n > 0) b.push({ label, count: n, cls, icon: key })
    }
    push('Exceptions', 'EXCEPTION', 'bg-red-50 text-red-700 ring-red-200')
    push('Missing records', 'MISSING', 'bg-sky-50 text-sky-700 ring-sky-200')
    push('Duplicates', 'DUPLICATE', 'bg-violet-50 text-violet-700 ring-violet-200')
    push('Unresolved', 'UNRESOLVED', 'bg-slate-100 text-slate-600 ring-slate-200')
    const lowConf = active.filter(r => (r.reason_code === 'LOW_CONFIDENCE' || r.exception_category === 'low_confidence') && r.status !== 'UNRESOLVED').length
    if (lowConf > 0) b.push({ label: 'Low confidence', count: lowConf, cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: 'LOW' })
    return b
  }, [active])

  if (!results.length) return null

  return (
    <section className={`rounded-xl border p-5 shadow-panel ${active.length ? 'border-amber-300 bg-gradient-to-b from-amber-50/70 to-white' : 'border-emerald-200 bg-white'}`} aria-label="Action required">
      {active.length ? (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="eyebrow !text-amber-700 !tracking-wide">Action Required</p>
              <h3 className="text-[17px] font-bold text-slate-900 mt-0.5">
                {active.length} record{active.length === 1 ? '' : 's'} require{active.length === 1 ? 's' : ''} attention
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Active in the exception queue — auto-resolution was not possible for these records.
              </p>
            </div>
            <button onClick={() => navigate('/exceptions')} className="btn-secondary !py-2 text-amber-700 border-amber-300 hover:bg-amber-50">
              <Icon.Alert size={14} /> Review Exceptions
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {buckets.map(b => (
              <span key={b.label} className={`rounded-md ring-1 ring-inset px-3 py-1.5 text-xs font-medium ${b.cls}`}>
                <b className="num text-[15px]">{b.count}</b> <span className="ml-0.5">{b.label}</span>
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 border-t border-slate-200/80 pt-3">
            <span className="inline-flex items-center gap-1.5"><Icon.Activity size={13} className="text-slate-400" /> Queue: <b className="num text-slate-700">{active.length}</b> active · <b className="num text-slate-700">{exceptions?.length || 0}</b> shown in queue</span>
            <span className="inline-flex items-center gap-1.5"><Icon.Shield size={13} className="text-slate-400" /> Financial exposure: <b className="num text-amber-700">{exposure ? formatINR(exposure) : '—'}</b></span>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3.5">
          <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200"><Icon.Check size={18} /></span>
          <div>
            <p className="text-sm font-bold text-emerald-800">All clear</p>
            <p className="text-xs text-slate-500 mt-0.5">No records currently require human intervention.</p>
          </div>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
/* ------------------------------------------------------------------ */

function KpiTile({ label, value, sub, tone, hint, bar, action }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'ok' | 'warn' | 'danger' | 'info' | 'plain'
  hint?: string
  bar?: number
  action?: { label: string; onClick: () => void }
}) {
  const toneCls = tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600'
    : tone === 'danger' ? 'text-red-600' : tone === 'info' ? 'text-brand-700' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-panel flex flex-col">
      <div className="eyebrow flex items-center gap-1">{label}{hint && <MetricHint text={hint} />}</div>
      <div className={`num text-[26px] font-bold leading-tight mt-1.5 ${toneCls}`}>{value}</div>
      {bar != null && (
        <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${label}: ${Math.round(bar * 100)}%`}>
          <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500" style={{ width: `${Math.min(100, bar * 100)}%` }} />
        </div>
      )}
      {sub && <div className="text-[11px] text-slate-400 mt-1.5 leading-snug">{sub}</div>}
      {action && (
        <button onClick={action.onClick} className="mt-auto pt-2.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
          {action.label} <Icon.ArrowRight size={11} />
        </button>
      )}
    </div>
  )
}

function KpiSection({ results, evaluation }: { results: any[]; evaluation: any }) {
  const navigate = useNavigate()
  const { dataset } = useContext(AppContext)
  const hasResults = results.length > 0
  const hasData = dataset?.hasDataset
  const gtMissing = hasResults && evaluation?.has_ground_truth === false

  if (!hasResults && hasData) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Invoices" value={dataset?.invoices?.length || 0} sub="Staged in dataset" />
        <KpiTile label="Payments" value={dataset?.payments?.length || 0} sub="Staged in dataset" />
        <KpiTile label="Bank Transactions" value={dataset?.transactions?.length || 0} sub="Staged in dataset" />
        <KpiTile label="Ground Truth" value={dataset?.hasGroundTruth ? 'Available' : '—'} tone={dataset?.hasGroundTruth ? 'ok' : 'warn'}
          sub={dataset?.hasGroundTruth ? `${dataset?.groundTruthCount || 0} hidden records` : 'Demo dataset only'} />
      </div>
    )
  }
  if (!evaluation) return null

  const activeQueue = evaluation?.active_queue ?? evaluation?.review_queue ?? 0
  const f1 = evaluation.f1
  const f1Num = f1 == null ? '—' : `${Math.round(f1 * 100)}%`
  const gtSub = gtMissing ? 'Ground truth required' : undefined

  return (
    <section className="space-y-3" aria-label="Key performance indicators">
      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Records Processed" value={evaluation.total_records} sub={`${evaluation.total_records} invoices in the run`}
          hint="Total financial records processed in the reconciliation run." />
        <KpiTile label="Match Rate" value={pct(evaluation.match_rate)} tone="ok" bar={evaluation.match_rate ?? 0}
          sub={`${evaluation.matched} successfully matched / ${evaluation.total_records} processed`}
          hint="Percentage of processed records successfully reconciled." />
        <KpiTile label="F1 Score" value={gtMissing ? '—' : f1Num} tone={!gtMissing && f1 != null && f1 >= 0.8 ? 'ok' : 'plain'} bar={f1 ?? undefined}
          sub={gtSub || (f1 == null ? 'Compute requires ground truth' : `Harmonic mean of precision & recall`)}
          hint="Harmonic mean of precision and recall." />
        <KpiTile label="Exceptions" value={evaluation.exceptions} tone={evaluation.exceptions > 0 ? 'danger' : 'ok'}
          sub={activeQueue > 0 ? `${activeQueue} awaiting human review` : 'None flagged for review'}
          hint="Records the agent could not fully resolve automatically and flagged for review."
          action={evaluation.exceptions > 0 ? { label: 'View exceptions', onClick: () => navigate('/exceptions') } : undefined} />
      </div>
      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Precision" value={gtMissing ? '—' : pct(evaluation.precision)} tone={evaluation.precision != null && evaluation.precision >= 0.95 ? 'ok' : 'info'}
          sub={gtMissing ? 'No ground truth' : evaluation.precision == null ? 'Ground truth required' : `Correct / predicted (${evaluation.correct_matches}/${evaluation.predicted_matches})`}
          hint="Of the records predicted as matches, how many were correct?" />
        <KpiTile label="Recall" value={gtMissing ? '—' : pct(evaluation.recall)} tone="info"
          sub={gtMissing ? 'No ground truth' : evaluation.recall == null ? 'Ground truth required' : `Correct / true (${evaluation.correct_matches}/${evaluation.true_matches})`}
          hint="Of the true matching records, how many were successfully identified?" />
        <KpiTile label="Accuracy" value={gtMissing ? '—' : pct(evaluation.accuracy)} tone="info"
          sub={gtMissing ? 'No ground truth' : evaluation.accuracy == null ? 'Ground truth required' : 'Correct decisions vs. total'}
          hint="Percentage of all evaluated records classified correctly against ground truth." />
        <KpiTile label="Processing Time" value={evaluation.processing_time_ms != null ? `${(evaluation.processing_time_ms / 1000).toFixed(2)}s` : '—'}
          sub={evaluation.throughput != null ? `${evaluation.throughput} records/sec` : 'Throughput = records ÷ seconds'}
          hint="Wall-clock time of the reconciliation run; throughput = total records ÷ seconds." />
      </div>
      {gtMissing && (
        <p className="text-[11px] text-slate-400 px-1">
          <Icon.Info size={11} className="inline mr-1 text-amber-500" />
          Precision, Recall, F1 and Accuracy need hidden ground truth. Uploaded records have none — they appear as “—”, never as fabricated 0%.
        </p>
      )}
      {/* Reconciliation performance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
        {([
          ['Auto-reconciled', String((() => { const { auto } = reviewStateCounts(results); return auto })()), 'Decided by agent rules'],
          ['Awaiting human review', String((() => { const { awaiting } = reviewStateCounts(results); return awaiting })()), 'Active in exception queue'],
          ['Manually resolved', String((() => { const { manual } = reviewStateCounts(results); return manual })()), 'Human reviewer actions'],
          ['Throughput', evaluation.throughput != null ? `${evaluation.throughput} rec/s` : '—', 'Total records ÷ seconds'],
        ] as [string, string, string][]).map(([l, v, s]) => (
          <div key={l} className="bg-white px-4 py-3">
            <div className="eyebrow !text-[10px]">{l}</div>
            <div className={`num text-lg font-bold mt-0.5 ${l === 'Awaiting human review' && Number(v) > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{v}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{s}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Reconciliation health                                               */
/* ------------------------------------------------------------------ */

function HealthCard({ results, evaluation }: { results: any[]; evaluation: any }) {
  const [open, setOpen] = useState(false)
  if (!results.length || !evaluation) return null

  const total = evaluation.total_records || 1
  const matchRate = evaluation.match_rate ?? 0
  const reviewRate = Math.min(1, (evaluation.exceptions + evaluation.unresolved + evaluation.duplicates + evaluation.missing) / total)
  const unresolvedRate = (evaluation.unresolved || 0) / total
  const matchedRows = results.filter(r => r.status === 'MATCHED' || r.status === 'PARTIAL_MATCH')
  const avgConf = matchedRows.length
    ? matchedRows.reduce((a, r) => a + (Number(r.confidence) || 0), 0) / matchedRows.length
    : (evaluation.match_rate ?? 0)

  const factors = [
    { label: 'Match rate', weight: 45, value: matchRate, display: pct(matchRate, 1) },
    { label: 'No open attention', weight: 25, value: 1 - reviewRate, display: `${Math.round((1 - reviewRate) * 100)}%` },
    { label: 'No unresolved', weight: 15, value: 1 - unresolvedRate, display: `${Math.round((1 - unresolvedRate) * 100)}%` },
    { label: 'Avg match confidence', weight: 15, value: avgConf, display: pct(avgConf, 0) },
  ]
  const score = Math.max(0, Math.min(100, Math.round(factors.reduce((a, f) => a + f.weight * f.value, 0))))
  const band = score >= 85 ? { txt: 'Healthy', cls: 'text-emerald-600', bar: 'bg-emerald-500' }
    : score >= 65 ? { txt: 'Attention needed', cls: 'text-amber-600', bar: 'bg-amber-500' }
    : { txt: 'High attention', cls: 'text-red-600', bar: 'bg-red-500' }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="section-title">Reconciliation Health</h3>
          <p className="text-xs text-slate-500 mt-0.5">Transparent indicator from live results — not a model score</p>
        </div>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="btn-icon w-7 h-7" aria-label="Show health factors">
          <Icon.Info size={14} />
        </button>
      </div>
      <div className="flex items-end gap-3 mt-4">
        <div className={`num text-[40px] font-bold leading-none ${band.cls}`}>{score}</div>
        <div className="text-xs text-slate-500 pb-1.5">/ 100 <span className={`font-semibold ${band.cls} ml-1`}>{band.txt}</span></div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
        <span className={`block h-full rounded-full ${band.bar}`} style={{ width: `${score}%` }} />
      </div>
      <div className="mt-4 space-y-2 text-xs">
        {factors.map(f => (
          <div key={f.label} className="flex items-center justify-between gap-3">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Icon.Layers size={11} className="text-slate-300" /> {f.label}
              <span className="text-slate-300">·</span>
              <span className="text-slate-400 num">{f.weight} pts</span>
            </span>
            <b className={`num ${f.value >= 0.8 ? 'text-emerald-600' : f.value >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>{f.display}</b>
          </div>
        ))}
      </div>
      {open && (
        <p className="text-[11px] text-slate-400 border-t border-slate-100 mt-4 pt-3 leading-relaxed">
          Score = 45·match rate + 25·(1 − attention rate) + 15·(1 − unresolved rate) + 15·average confidence of matched records.
          Computed from the current reconciliation results each render.
        </p>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

function StatusDonut({ results }: { results: any[] }) {
  const total = results.length
  const data = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1
    return Object.entries(counts).map(([status, value]) => ({
      status,
      name: STATUS_META[status]?.label || status,
      value,
      color: STATUS_COLOR[status] || '#94a3b8',
    }))
  }, [results])

  if (!total) return null

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-panel overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="section-title">Reconciliation Status</h3>
        <p className="text-xs text-slate-500 mt-0.5">Final decision status across the batch</p>
      </div>
      <div className="px-2 pb-1 relative">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={58} outerRadius={78} paddingAngle={2} dataKey="value" strokeWidth={1} stroke="#fff" isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v: number, _n: string, props: any) => [`${v} record${v === 1 ? '' : 's'} (${Math.round((v / total) * 100)}%)`, props.payload?.name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="num text-[24px] font-bold text-slate-900 leading-none">{total}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-1">Records</div>
        </div>
      </div>
      <div className="px-5 pb-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
          {data.map(d => (
            <span key={d.status} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
              {STATUS_META[d.status]?.short || d.status} · <b className="num">{d.value}</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function MatchTypeCard({ results, evaluation }: { results: any[]; evaluation: any }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {}
    const keyFor = (r: any) => {
      if (r.status === 'PARTIAL_MATCH') return 'Partial'
      if (r.status !== 'MATCHED') return null
      if (r.match_type === 'AI_ASSISTED') return 'AI'
      if (r.match_type === 'THREE_WAY_DETERMINISTIC') return 'Three-way'
      if (r.match_type === 'MANUAL') return 'Manual'
      return 'Deterministic'
    }
    for (const r of results) { const k = keyFor(r); if (k) counts[k] = (counts[k] || 0) + 1 }
    return counts
  }, [results])

  const matchedTotal = results.filter(r => r.status === 'MATCHED' || r.status === 'PARTIAL_MATCH').length || 1
  const aiUsed = (data.AI || 0) > 0
  const llm = evaluation?.ai_mode === 'LLM'
  const palette: Record<string, string> = { Deterministic: '#3f66ee', 'Three-way': '#0284c7', AI: '#6366f1', Manual: '#0d9488', Partial: '#f59e0b' }
  const order = ['Deterministic', 'Three-way', 'AI', 'Manual', 'Partial']

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-panel overflow-hidden">
      <div className="px-5 pt-4 pb-1">
        <h3 className="section-title">Match Type Distribution</h3>
        <p className="text-xs text-slate-500 mt-0.5">How matched records were resolved</p>
      </div>
      <div className="px-5 py-3 space-y-3">
        {order.filter(k => data[k]).map(k => {
          const v = data[k]
          const share = (v / matchedTotal) * 100
          return (
            <div key={k}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-600 font-medium">
                  {k === 'AI' ? (llm ? 'AI-Assisted (LLM)' : 'AI-Assisted') : k === 'Partial' ? 'Partial match (not auto-resolved)' : k}
                </span>
                <span className="num font-semibold text-slate-800">{v} · {Math.round(share)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${share}%`, background: palette[k] }} />
              </div>
              {k === 'AI' && !llm && aiUsed && (
                <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1"><Icon.Info size={10} /> deterministic fallback — no LLM key configured</p>
              )}
            </div>
          )
        })}
        {!aiUsed && !llm && (
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100 pt-3">
            <Icon.Info size={12} className="text-amber-500" />
            AI-assisted matching unavailable — deterministic fallback active. No AI-assisted matches were produced.
          </p>
        )}
      </div>
    </section>
  )
}

function ConfidenceCard({ results }: { results: any[] }) {
  const [thresholds, setThresholds] = useState<{ auto: number; review: number }>({ auto: 0.95, review: 0.8 })
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const s = d?.settings || {}
      setThresholds({
        auto: typeof s.auto_reconcile_threshold === 'number' ? s.auto_reconcile_threshold : 0.95,
        review: typeof s.review_threshold === 'number' ? s.review_threshold : 0.8,
      })
    }).catch(() => { /* keep defaults */ })
  }, [])

  const buckets = useMemo(() => {
    const ranges = [
      { label: '95–100%', min: 0.95, max: 1.01, color: '#059669', band: 'auto' },
      { label: '80–95%', min: 0.8, max: 0.95, color: '#6366f1', band: 'review' },
      { label: '60–80%', min: 0.6, max: 0.8, color: '#d97706', band: 'below' },
      { label: '40–60%', min: 0.4, max: 0.6, color: '#f59e0b', band: 'below' },
      { label: '20–40%', min: 0.2, max: 0.4, color: '#94a3b8', band: 'below' },
      { label: '0–20%', min: 0, max: 0.2, color: '#cbd5e1', band: 'below' },
    ]
    for (const r of results) {
      const c = Number(r.confidence) || 0
      const b = ranges.find(b => c >= b.min && c < b.max)
      if (b) b.count = (b.count || 0) + 1
    }
    return ranges.map(b => ({ ...b, count: b.count || 0 }))
  }, [results])

  const total = results.length || 1
  const autoPct = Math.round((thresholds.auto * 100))
  const reviewPct = Math.round((thresholds.review * 100))

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-panel overflow-hidden">
      <div className="px-5 pt-4 pb-1">
        <h3 className="section-title">Confidence Distribution</h3>
        <p className="text-xs text-slate-500 mt-0.5">Agent confidence across the batch, vs. decision thresholds</p>
      </div>
      <div className="px-5 py-3 space-y-3">
        {buckets.map(b => {
          const share = (b.count / total) * 100
          return (
            <div key={b.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-600 font-medium inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: b.color }} />{b.label}</span>
                <span className="num font-semibold text-slate-800">{b.count} record{b.count === 1 ? '' : 's'} · {Math.round(share)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(share, b.count ? 1.5 : 0)}%`, background: b.color }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
        <div className="eyebrow !text-[10px] mb-1.5">Decision bands (from Settings)</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥{autoPct}% auto-reconcile</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> {reviewPct}–{autoPct - 1}% human review</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> &lt;{reviewPct}% unresolved / exception</span>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Evaluation metrics (three intentional states)                       */
/* ------------------------------------------------------------------ */

function MetricBar({ label, value, hint, total, color, suffix }: {
  label: string; value: React.ReactNode; hint: string; total?: number; color: string; suffix?: string
}) {
  const num = typeof value === 'number' && isFinite(value) ? value : null
  const p = num != null && (total ?? 100) > 0 ? Math.min(100, (num / (total ?? 100)) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600 flex items-center">{label}<MetricHint text={hint} /></span>
        <span className="num font-semibold text-slate-800">
          {value}{suffix}
          {total != null && !suffix && num != null ? <span className="text-slate-400 font-normal"> / {total}</span> : null}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        {num != null && <span className="block h-full rounded-full" style={{ width: `${p}%`, background: color }} />}
      </div>
    </div>
  )
}

function EvaluationMetrics({ results, evaluation, hasData, running }: {
  results: any[]
  evaluation: any
  hasData: boolean
  running: boolean
}) {
  const { runReconciliation } = useContext(AppContext)
  const hasResults = results.length > 0
  const gtMissing = hasResults && evaluation?.has_ground_truth === false

  const defs: Record<string, string> = {
    Precision: 'Of the records predicted as matches, how many were correct?',
    Recall: 'Of the true matching records, how many were successfully identified?',
    'F1 Score': 'Harmonic mean of precision and recall.',
    Accuracy: 'Percentage of all evaluated records classified correctly against ground truth.',
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-panel overflow-hidden" aria-label="Evaluation metrics">
      <div className="px-5 pt-4 pb-1">
        <h3 className="section-title">Evaluation Metrics</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {hasResults && !gtMissing ? 'Agent decisions vs. hidden ground truth' : 'Comparison against known expected outcomes'}
        </p>
      </div>

      {!hasData ? null : !hasResults ? (
        /* STATE A — pre-reconciliation: intentional pending state */
        <div className="px-5 py-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {['Precision', 'Recall', 'F1 Score', 'Accuracy'].map(k => (
              <MetricBar key={k} label={k} value="—" hint={defs[k]} color="#cbd5e1" />
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3.5 mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-slate-700">Evaluation pending</p>
              <p className="text-xs text-slate-500 mt-0.5">Run the reconciliation agent to calculate Precision, Recall, F1 and Accuracy against ground truth.</p>
            </div>
            <button onClick={runReconciliation} disabled={running} className="btn-primary btn-sm">
              {running ? 'Reconciling…' : 'Run Reconciliation'}
            </button>
          </div>
        </div>
      ) : gtMissing ? (
        /* STATE B' — no hidden ground truth: never fabricate metrics */
        <div className="px-5 py-6">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3.5">
            <span className="mt-0.5 text-amber-600"><Icon.Info size={15} /></span>
            <div>
              <p className="text-[13px] font-semibold text-amber-800">Evaluation unavailable — no ground truth</p>
              <p className="text-xs text-amber-700/90 mt-0.5 leading-relaxed">
                Precision, Recall, F1 and Accuracy require ground-truth records to compare against. Uploaded documents have no hidden
                ground truth — only the <b>Synthetic Demo Dataset</b> ships with one. Operational metrics (records processed, match rate,
                exceptions, processing time, throughput) remain fully available above.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 mt-5 opacity-70">
            {['Precision', 'Recall', 'F1 Score', 'Accuracy'].map(k => (
              <MetricBar key={k} label={k} value="—" hint={defs[k]} color="#cbd5e1" />
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">Not fabricated — ground-truth records are required for these metrics.</p>
        </div>
      ) : (
        /* STATE B — results + ground truth: real evaluation */
        <div className="px-5 py-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {[
              { k: 'Precision', v: evaluation.precision, c: '#3f66ee' },
              { k: 'Recall', v: evaluation.recall, c: '#059669' },
              { k: 'F1 Score', v: evaluation.f1, c: '#7c3aed' },
              { k: 'Accuracy', v: evaluation.accuracy, c: '#0d9488' },
            ].map(({ k, v, c }) => (
              <MetricBar key={k} label={k} value={v == null ? '—' : `${Math.round(v * 100)}%`} hint={defs[k]} color={c} />
            ))}
          </div>
          <div className="divider-x my-4" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <MetricBar label="True Matches" value={evaluation.true_matches} total={evaluation.total_records} color="#3f66ee" hint="Expected matches defined by the hidden ground truth." />
            <MetricBar label="Predicted Matches" value={evaluation.predicted_matches} total={evaluation.total_records} color="#0d9488" hint="Records the agent matched (correct + incorrect)." />
            <MetricBar label="Correct Matches" value={evaluation.correct_matches} total={evaluation.predicted_matches} color="#059669" hint="Predicted matches that agree with ground truth." />
            <MetricBar label="False Positives" value={evaluation.false_positives} total={evaluation.predicted_matches} color="#dc2626" hint="Predicted matches that were actually wrong." />
            <MetricBar label="False Negatives" value={evaluation.false_negatives} total={evaluation.true_matches} color="#d97706" hint="Expected matches the agent failed to identify." />
            <MetricBar label="False Positive Rate" value={Math.round((evaluation.false_positive_rate ?? 0) * 100)} suffix="%" color="#f87171" hint="Incorrect automatic matches as a share of all automatic matches." />
          </div>
          <p className="text-[11px] text-slate-400 mt-4">
            Evaluated against hidden ground truth · {evaluation.total_records} records ·{' '}
            {evaluation.ai_mode === 'LLM' ? 'LLM-assisted analysis' : 'deterministic fallback active (no LLM key)'}
          </p>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Recent activity + agent workflow                                    */
/* ------------------------------------------------------------------ */

function RecentActivity() {
  const { auditLogs, lastRun, runAt } = useContext(AppContext)
  const HUMAN = new Set(['MANUAL_MATCH', 'MANUAL_RESOLUTION', 'DISMISSED'])
  const INGEST = new Set(['DOCUMENT_PROCESSED', 'RECORDS_LOADED'])

  const items = useMemo(() => {
    const out: { ts: string; text: string; kind: 'run' | 'human' | 'ingest' | 'decision' }[] = []
    if (lastRun?.run_at) {
      out.push({ ts: lastRun.run_at, text: `Reconciliation completed — ${lastRun.total_processed ?? '—'} records processed`, kind: 'run' })
    }
    for (const log of auditLogs.slice(0, 9)) {
      const ts = log.timestamp
      if (HUMAN.has(log.action)) {
        out.push({ ts, text: `${log.invoice_id} ${log.action === 'DISMISSED' ? 'dismissed' : 'manually resolved'}`, kind: 'human' })
      } else if (INGEST.has(log.action)) {
        const n = (() => { try { return JSON.parse(log.evidence_json || '{}').recordsExtracted ?? null } catch { return null } })()
        out.push({ ts, text: `Document processed — ${n != null ? `${n} records extracted` : log.action.toLowerCase().replace('_', ' ')}`, kind: 'ingest' })
      } else {
        out.push({ ts, text: `${log.invoice_id} → ${STATUS_META[log.action]?.label || log.action} (${(log.method || 'deterministic').toLowerCase().replace(/_/g, ' ')})`, kind: 'decision' })
      }
    }
    return out
  }, [auditLogs, lastRun])

  if (!items.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white shadow-panel overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="section-title">Recent Activity</h3>
          <p className="text-xs text-slate-500 mt-1">Run the reconciliation agent or resolve exceptions to build the activity trail.</p>
        </div>
      </section>
    )
  }

  const iconFor = (kind: string) => {
    if (kind === 'run') return { cls: 'bg-emerald-50 text-emerald-600 border-emerald-200', node: <Icon.Check size={12} /> }
    if (kind === 'human') return { cls: 'bg-teal-50 text-teal-600 border-teal-200', node: <Icon.User size={12} /> }
    if (kind === 'ingest') return { cls: 'bg-brand-50 text-brand-600 border-brand-200', node: <Icon.Upload size={12} /> }
    return { cls: 'bg-slate-100 text-slate-500 border-slate-200', node: <Icon.Activity size={12} /> }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-panel overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="section-title">Recent Activity</h3>
        <p className="text-xs text-slate-500 mt-0.5">Live events from reconciliation, ingestion and human review</p>
      </div>
      <div className="px-5 pb-4">
        <ol className="relative space-y-3">
          {items.slice(0, 8).map((it, i) => {
            const ic = iconFor(it.kind)
            return (
              <li key={i} className="relative pl-8">
                {i < Math.min(items.length, 8) - 1 && <span className="absolute left-[9px] top-5 bottom-[-8px] w-px bg-slate-200" aria-hidden />}
                <span className={`absolute left-0 top-0.5 w-5 h-5 rounded-full border flex items-center justify-center ${ic.cls}`}>{ic.node}</span>
                <p className="text-xs text-slate-700 leading-snug">{it.text}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{fmtTime(it.ts, true)}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function AgentCard({ results, evaluation, runAt }: { results: any[]; evaluation: any; runAt?: string | null }) {
  const hasResults = results.length > 0
  const llm = evaluation?.ai_mode === 'LLM'
  const steps = [
    { label: 'Data ingestion', state: 'ok' as const },
    { label: 'Normalization', state: 'ok' as const },
    { label: 'Candidate matching', state: 'ok' as const },
    { label: 'Deterministic matching', state: 'ok' as const },
    { label: llm ? 'AI-assisted matching (LLM)' : 'AI-assisted matching', state: llm ? ('ok' as const) : ('alt' as const) },
    { label: 'Confidence scoring', state: 'ok' as const },
    { label: 'Decision', state: 'ok' as const },
    { label: 'Audit logging', state: 'ok' as const },
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-panel overflow-hidden">
      <div className="px-5 pt-4 pb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title">Reconciliation Agent</h3>
          <p className="text-xs text-slate-500 mt-0.5">Deterministic rules + AI-assisted analysis + human review</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1 ${hasResults ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200'}`}>
          <span className={`w-2 h-2 rounded-full ${hasResults ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          {hasResults ? 'Operational' : 'Idle'}
        </span>
      </div>
      <div className="px-5 py-3.5">
        <ol className="flex flex-col lg:flex-row lg:items-stretch lg:flex-wrap gap-y-1.5">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center lg:flex-row">
              <span className={`inline-flex items-center gap-2 text-[12px] ${s.state === 'ok' ? 'text-slate-700' : 'text-amber-700'}`}>
                {s.state === 'ok'
                  ? <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Icon.Check size={10} /></span>
                  : <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 text-[9px] font-bold">!</span>}
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <span className="hidden lg:inline text-slate-300 mx-2" aria-hidden><Icon.ChevronRight size={13} /></span>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
          <span>Last run: <b className="text-slate-700">{runAt ? fmtTime(runAt, true) : 'never'}</b></span>
          {evaluation?.processing_time_ms != null && hasResults && (
            <span>Processed <b className="num text-slate-700">{evaluation.total_records}</b> records in <b className="num text-slate-700">{(evaluation.processing_time_ms / 1000).toFixed(2)}s</b></span>
          )}
          {!llm && (
            <span className="inline-flex items-center gap-1 text-amber-600"><Icon.Info size={11} /> AI-assisted matching not configured — deterministic fallback active</span>
          )}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const navigate = useNavigate()
  const { dataset, results, evaluation, lastRun, consistency, runPhase, loading, refreshData, runReconciliation, generateDemo } = useContext(AppContext)

  const hasData = dataset?.hasDataset
  const hasResults = results.length > 0
  const running = runPhase === 'running'
  const runAt = evaluation?.run_at || lastRun?.run_at

  // Re-fetch once on mount so manual resolutions made on other pages show up.
  useEffect(() => { if (hasData && !running) refreshData() }, [])

  if (!hasData && !loading && !running) {
    return (
      <div className="pt-6">
        <HeroHeader hasData={false} hasResults={false} running={running} />
        <div className="mt-6">
          <EmptyState
            icon={<Icon.Database size={26} />}
            title="No financial data loaded"
            message="Generate the synthetic demo dataset or upload your own documents to begin."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={generateDemo} className="btn-primary !py-2.5 px-5"><Icon.Refresh size={15} /> Generate Demo Dataset</button>
                <button onClick={() => navigate('/data')} className="btn-secondary !py-2.5 px-5"><Icon.Upload size={15} /> Upload Documents</button>
              </div>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <HeroHeader hasData={hasData} hasResults={hasResults} runAt={runAt} running={running} />

      <StatusBanner hasData={hasData} hasResults={hasResults} loading={loading} running={running}
        onRun={runReconciliation} onReview={() => navigate('/reconciliation')} />

      {/* Consistency banner */}
      {hasResults && consistency?.ok === false && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3" role="alert">
          <span className="mt-0.5 text-red-600"><Icon.Alert size={17} /></span>
          <div>
            <p className="text-sm font-semibold text-red-700">Metrics consistency check failed</p>
            <ul className="text-xs text-red-600 mt-1 space-y-0.5 list-disc list-inside">
              {(consistency.errors || []).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Action required + KPI region */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-4"><ActionRequired results={results} /></div>
        <div className="xl:col-span-8 min-w-0"><KpiSection results={results} evaluation={evaluation} /></div>
      </div>

      {/* Health + status charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <HealthCard results={results} evaluation={evaluation} />
        {hasResults && <StatusDonut results={results} />}
        {hasResults && <MatchTypeCard results={results} evaluation={evaluation} />}
      </div>

      {/* Confidence + evaluation */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {hasResults && <ConfidenceCard results={results} />}
        <EvaluationMetrics results={results} evaluation={evaluation} hasData={hasData} running={running} />
      </div>

      {/* Agent + activity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <AgentCard results={results} evaluation={evaluation} runAt={runAt} />
        <RecentActivity />
      </div>
    </div>
  )
}
