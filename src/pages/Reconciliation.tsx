import type * as React from 'react'
import { useContext, useState, useMemo } from 'react'
import { AppContext } from '../App'
import { formatINR } from '../format'
import { Icon, PageHeader, StatusBadge, EmptyState, InfoRow, STATUS_META, ReasonCodeChip, ReviewStateBadge } from '../components/ui'

/* ---------- decision derivation ---------- */

function decisionFor(result: any): { label: string; badge: string; text: string } {
  const rules: string[] = Array.isArray(result.rules_triggered) ? result.rules_triggered : []
  if (result.status === 'MATCHED') {
    if (result.match_type === 'MANUAL') return { label: 'MANUAL RESOLUTION', badge: 'badge-manual', text: 'A human reviewer linked the records.' }
    if (result.match_type === 'AI_ASSISTED') return { label: 'AI-ASSISTED MATCH', badge: 'badge-ai', text: 'AI-assisted analysis confirmed the match.' }
    if (rules.includes('FLAGGED_FOR_REVIEW')) return { label: 'HUMAN REVIEW MATCH', badge: 'badge-partial', text: 'Matched above the review threshold; flagged for confirmation.' }
    return { label: 'AUTO-RESOLVED', badge: 'badge-matched', text: 'Confidence exceeded the auto-reconcile threshold.' }
  }
  if (result.status === 'PARTIAL_MATCH') return { label: 'PARTIAL MATCH — REVIEW', badge: 'badge-partial', text: 'Linked with gaps; requires human review.' }
  return { label: result.status, badge: STATUS_META[result.status]?.badge || 'badge-neutral', text: result.reason || '' }
}

/* ---------- matching factors ---------- */

type Factor = { key: string; label: string; value: string; verdict: 'ok' | 'warn' | 'bad' }
function matchingFactors(evidence: any): Factor[] {
  const out: Factor[] = []
  const v = (key: string, label: string, value: any, okWords: string[], badWords: string[]): void => {
    if (value === undefined || value === null) return
    const s = String(value)
    const verdict: Factor['verdict'] = okWords.some(w => s.includes(w)) ? 'ok' : badWords.some(w => s.includes(w)) || s === 'none' ? 'bad' : 'warn'
    out.push({ key, label, value: s, verdict })
  }
  v('amount', 'Payment amount', evidence.amount, ['exact'], ['mismatch'])
  v('customer', 'Customer / entity', evidence.customer, ['exact match', 'equivalent', 'strong similarity', 'found'], ['no match', 'none'])
  v('date', 'Date proximity', evidence.date, ['within'], ['apart', 'none'])
  v('invoice_reference', 'Invoice reference', evidence.invoice_reference, ['found', 'exact'], ['not found', 'none'])
  if (evidence.bank_transaction !== undefined) {
    v('bank_transaction', 'Bank transaction', evidence.bank_transaction, ['confirmed', 'found'], ['not found', 'mismatch'])
  }
  return out
}

function parseEvidence(evidence: any): any {
  if (typeof evidence === 'string') { try { return JSON.parse(evidence || '{}') } catch { return {} } }
  return evidence || {}
}

/* ================================================================== */

export default function Reconciliation() {
  const { results, dataset, evaluation, runReconciliation } = useContext(AppContext)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [matchTypeFilter, setMatchTypeFilter] = useState('ALL')
  const [confFilter, setConfFilter] = useState('ALL')
  const [selectedResult, setSelectedResult] = useState<any>(null)

  const filtered = useMemo(() => {
    let items = [...results]
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(r =>
        r.invoice_id?.toLowerCase().includes(q) ||
        r.payment_id?.toLowerCase().includes(q) ||
        r.transaction_id?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q) ||
        r.customer?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'ALL') items = items.filter(r => r.status === statusFilter)
    if (matchTypeFilter !== 'ALL') items = items.filter(r => r.match_type === matchTypeFilter)
    if (confFilter !== 'ALL') {
      const [min, max] = confFilter.split('-').map(Number)
      items = items.filter(r => r.confidence >= min / 100 && r.confidence < (max >= 100 ? 1.01 : max / 100))
    }
    return items
  }, [results, search, statusFilter, matchTypeFilter, confFilter])

  const invoices = dataset?.invoices || []
  const payments = dataset?.payments || []
  const transactions = dataset?.transactions || []

  if (results.length === 0) {
    return (
      <div className="pt-8">
        <EmptyState
          icon={<Icon.Reconcile size={26} />}
          title="No reconciliation results"
          message="Run the reconciliation agent to match invoices against payments and bank transactions."
          action={<button onClick={runReconciliation} className="btn-primary"><Icon.Play size={14} /> Run Reconciliation</button>}
        />
      </div>
    )
  }

  const summary = [
    { label: 'Records', value: results.length },
    { label: 'Matched', value: evaluation?.matched ?? results.filter(r => r.status === 'MATCHED').length },
    { label: 'Review', value: evaluation?.active_queue ?? evaluation?.review_queue ?? 0, tone: 'warn' },
    { label: 'Unresolved', value: evaluation?.unresolved ?? 0 },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Reconciliation Results"
        subtitle="Review automated matches and unresolved financial records."
        actions={
          <>
            <span className="inline-flex items-center gap-2 text-xs text-slate-500 mr-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Agent run complete
            </span>
            <button onClick={runReconciliation} className="btn-secondary"><Icon.Refresh size={15} /> Re-run</button>
          </>
        }
      />

      {/* Summary chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.map(s => (
          <div key={s.label} className="card px-4 py-3 flex items-center justify-between">
            <div>
              <div className="eyebrow">{s.label}</div>
              <div className={`num text-2xl font-bold ${s.tone === 'warn' ? 'text-amber-600' : 'text-slate-900'}`}>{s.value}</div>
            </div>
            {s.label === 'Matched' && <span className="badge badge-matched"><Icon.Check size={11} /> auto</span>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card card-pad !py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Icon.Search size={15} /></span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice, payment, reason…"
              aria-label="Search results"
              className="input !pl-9 w-64"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select w-44" aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            {Object.entries(STATUS_META).map(([key, v]) => (
              <option key={key} value={key}>{v.label}</option>
            ))}
          </select>
          <select value={matchTypeFilter} onChange={e => setMatchTypeFilter(e.target.value)} className="select w-44" aria-label="Filter by match type">
            <option value="ALL">All match types</option>
            <option value="DETERMINISTIC">Deterministic</option>
            <option value="AI_ASSISTED">AI-Assisted</option>
            <option value="THREE_WAY_DETERMINISTIC">Three-Way</option>
            <option value="MANUAL">Manual</option>
          </select>
          <select value={confFilter} onChange={e => setConfFilter(e.target.value)} className="select w-44" aria-label="Filter by confidence">
            <option value="ALL">Any confidence</option>
            <option value="95-100">≥ 95% (auto)</option>
            <option value="80-95">80–94% (review)</option>
            <option value="0-80">below 80%</option>
          </select>
          <span className="ml-auto text-xs text-slate-400 num">{filtered.length} of {results.length} records</span>
        </div>
      </div>

      {/* Table (md+) */}
      <div className="card overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Payment ID</th>
                <th>Bank Tx</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
                <th>Confidence</th>
                <th>Match Type</th>
                <th className="hidden xl:table-cell">Reason</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const invoice = invoices.find(i => i.invoice_id === r.invoice_id)
                const decision = decisionFor(r)
                return (
                  <tr key={r.invoice_id} onClick={() => setSelectedResult(r)} className="cursor-pointer">
                    <td>
                      <span className="font-mono text-[13px] font-semibold text-slate-800">{r.invoice_id}</span>
                    </td>
                    <td className="font-mono text-xs text-slate-500">{r.payment_id || <span className="text-slate-300">—</span>}</td>
                    <td className="font-mono text-xs text-slate-500">{r.transaction_id || <span className="text-slate-300">—</span>}</td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status={r.status} />
                        <span className={`text-[10px] font-medium ${decision.badge.includes('matched') ? 'text-emerald-600' : decision.badge.includes('partial') ? 'text-amber-600' : 'text-slate-400'}`}>
                          {decision.label}
                        </span>
                      </div>
                    </td>
                    <td className="text-right num text-[13px] font-medium text-slate-700">{formatINR(invoice?.amount)}</td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[92px]">
                        <div className="conf-bar flex-1"><span style={{ width: `${Math.round(r.confidence * 100)}%`, background: r.confidence >= 0.95 ? '#059669' : r.confidence >= 0.8 ? '#6366f1' : r.confidence >= 0.5 ? '#d97706' : '#dc2626' }} /></div>
                        <span className="num text-xs font-semibold text-slate-700 w-9 text-right">{Math.round(r.confidence * 100)}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-slate-600 font-mono">{r.match_type?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="hidden xl:table-cell">
                      <span className="text-xs text-slate-500 line-clamp-2 max-w-[240px] block">{r.reason || '—'}</span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedResult(r) }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md px-2.5 py-1.5 transition-colors"
                      >
                        View <Icon.ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400">No records match the current filters.</div>
        )}
      </div>

      {/* Result cards (mobile < md) */}
      <div className="md:hidden space-y-3">
        {filtered.map(r => {
          const invoice = invoices.find(i => i.invoice_id === r.invoice_id)
          const decision = decisionFor(r)
          return (
            <button key={r.invoice_id} onClick={() => setSelectedResult(r)}
              className="w-full text-left card p-4 hover:shadow-panel transition-shadow space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-mono text-[13px] font-bold text-slate-900">{r.invoice_id}</span>
                <StatusBadge status={r.status} />
                <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-semibold ${decision.badge.includes('matched') ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {decision.label}
                  <Icon.ChevronRight size={14} className="text-slate-300" />
                </span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="text-xs text-slate-500 space-y-1 min-w-0">
                  <div className="truncate">
                    Amount: <b className="num text-slate-800">{formatINR(invoice?.amount)}</b>
                  </div>
                  <div className="truncate">Payment: <span className="font-mono">{r.payment_id || '—'}</span></div>
                  <div className="truncate">Bank tx: <span className="font-mono">{r.transaction_id || '—'}</span></div>
                  <div className="truncate">Match type: <span className="font-mono text-slate-600">{r.match_type?.replace(/_/g, ' ')}</span></div>
                </div>
                <div className="text-right shrink-0">
                  <div className="conf-bar w-24 ml-auto"><span style={{ width: `${Math.round(r.confidence * 100)}%`, background: r.confidence >= 0.95 ? '#059669' : r.confidence >= 0.8 ? '#6366f1' : '#dc2626' }} /></div>
                  <div className="num text-sm font-bold text-slate-800 mt-1">{Math.round(r.confidence * 100)}%</div>
                  <div className="text-[10px] text-slate-400">confidence</div>
                </div>
              </div>
              {r.reason && <p className="text-xs text-slate-500 bg-slate-50 rounded-md px-2.5 py-2 leading-relaxed">{r.reason}</p>}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {r.reason_code && <ReasonCodeChip code={r.reason_code} />}
                <ReviewStateBadge state={r.review_state} className="text-[10px]" />
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-400">No records match the current filters.</div>
        )}
      </div>

      {selectedResult && (
        <DetailDrawer
          result={selectedResult}
          invoices={invoices}
          payments={payments}
          transactions={transactions}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  )
}

/* ================================================================== */
/* Detail drawer                                                      */
/* ================================================================== */

function SourceBlock({ label, icon, accent, children, note }: {
  label: string
  icon: React.ReactNode
  accent: string
  children: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border ${accent} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          <span className="text-slate-400">{icon}</span> {label}
        </div>
        {note}
      </div>
      {children}
    </div>
  )
}

function DetailDrawer({ result, invoices, payments, transactions, onClose }: {
  result: any
  invoices: any[]
  payments: any[]
  transactions: any[]
  onClose: () => void
}) {
  const invoice = invoices.find(i => i.invoice_id === result.invoice_id)
  const payment = payments.find(p => p.payment_id === result.payment_id)
  const tx = transactions.find(t => t.transaction_id === result.transaction_id)
  const decision = decisionFor(result)
  const evidence = parseEvidence(result.evidence)
  const rules: string[] = Array.isArray(result.rules_triggered) ? result.rules_triggered : []
  const factors = matchingFactors(evidence)
  const candidates: string[] = Array.isArray(result.candidate_ids) ? result.candidate_ids : []

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-label={`Reconciliation decision for ${result.invoice_id}`}>
      <div className="fixed inset-0 bg-navy-950/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-drawer flex flex-col animate-drawer-in">
        {/* Header */}
        <div className="px-5 h-16 flex items-center justify-between border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <p className="eyebrow">Reconciliation Decision</p>
              <h2 className="font-mono text-[15px] font-bold text-slate-900 leading-tight">{result.invoice_id}</h2>
            </div>
            <span className="badge badge-info ml-1"><Icon.Audit size={11} /> Record detail</span>
          </div>
          <button onClick={onClose} aria-label="Close panel" className="btn-icon"><Icon.X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
          {/* Decision banner */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <div className="eyebrow">Decision</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className={`badge ${decision.badge} !text-xs !px-2.5 !py-1`}>{decision.label}</span>
                {result.reason_code && <ReasonCodeChip code={result.reason_code} />}
              </div>
            </div>
            <div>
              <div className="eyebrow">Confidence</div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="conf-bar w-32"><span style={{ width: `${Math.round(result.confidence * 100)}%`, background: result.confidence >= 0.95 ? '#059669' : result.confidence >= 0.8 ? '#6366f1' : '#dc2626' }} /></div>
                <span className="num text-lg font-bold text-slate-900">{Math.round(result.confidence * 100)}%</span>
              </div>
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="eyebrow">Why</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{decision.text || result.reason || '—'}</p>
            </div>
          </div>

          {/* Source comparison */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Records</span>
              <span className="text-[10px] text-slate-400">Invoice → Payment → Bank Transaction</span>
            </div>
            <div className="p-4 space-y-2">
              <SourceBlock label="Invoice" icon={<Icon.File size={15} />} accent="border-slate-200"
                note={<span className="badge badge-neutral text-[10px]">{invoice?.currency || '—'}</span>}>
                {invoice ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <InfoRow label="Invoice ID" value={invoice.invoice_id} mono />
                    <InfoRow label="Customer" value={invoice.customer} />
                    <InfoRow label="Amount" value={<b className="num">{formatINR(invoice.amount)}</b>} />
                    <InfoRow label="Invoice date" value={invoice.invoice_date} />
                    <InfoRow label="Due date" value={invoice.due_date} />
                    <InfoRow label="Account" value={invoice.account_id} mono />
                  </div>
                ) : <p className="text-xs text-slate-400">Invoice not found in current dataset.</p>}
              </SourceBlock>

              <div className="flex justify-center text-slate-300"><Icon.ArrowRight size={16} /></div>

              <SourceBlock label="Payment" icon={<Icon.Activity size={15} />} accent="border-slate-200"
                note={result.payment_id ? <span className="badge badge-matched text-[10px]">linked</span> : <span className="badge badge-neutral text-[10px]">none</span>}>
                {payment ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <InfoRow label="Payment ID" value={payment.payment_id} mono />
                    <InfoRow label="Customer" value={payment.customer} />
                    <InfoRow label="Amount" value={<b className="num">{formatINR(payment.amount)}</b>} />
                    <InfoRow label="Payment date" value={payment.payment_date} />
                    <InfoRow label="Description" value={payment.description} className="sm:col-span-2" />
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {result.payment_id ? <span className="font-mono">{result.payment_id}</span> : 'No payment linked to this invoice.'}
                  </p>
                )}
              </SourceBlock>

              <div className="flex justify-center text-slate-300"><Icon.ArrowRight size={16} /></div>

              <SourceBlock label="Bank Transaction" icon={<Icon.Database size={15} />} accent="border-slate-200"
                note={result.transaction_id ? <span className="badge badge-matched text-[10px]">confirmed</span> : <span className="badge badge-neutral text-[10px]">none</span>}>
                {tx ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <InfoRow label="Transaction ID" value={tx.transaction_id} mono />
                    <InfoRow label="Amount" value={<b className="num">{formatINR(tx.amount)}</b>} />
                    <InfoRow label="Date" value={tx.transaction_date} />
                    <InfoRow label="Description" value={tx.description} className="sm:col-span-2" />
                    <InfoRow label="Account" value={tx.account_id} mono />
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {result.transaction_id ? <span className="font-mono">{result.transaction_id}</span> : 'No bank transaction linked.'}
                  </p>
                )}
              </SourceBlock>
            </div>
          </div>

          {/* Evidence factors */}
          {factors.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Matching Evidence</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                {factors.map(f => (
                  <div key={f.key} className="flex items-start gap-2.5 text-[13px] text-slate-700">
                    <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      f.verdict === 'ok' ? 'bg-emerald-100 text-emerald-600'
                      : f.verdict === 'bad' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      {f.verdict === 'ok' ? <Icon.Check size={10} /> : f.verdict === 'bad' ? <Icon.X size={10} /> : <span className="text-[9px] font-bold">!</span>}
                    </span>
                    <span>
                      <b className="font-medium text-slate-800">{f.label}:</b> <span className="text-slate-600">{f.value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decision detail grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-slate-200 p-4">
            <InfoRow label="Review state" value={<ReviewStateBadge state={result.review_state} />} />
            <InfoRow label="Reason code" value={result.reason_code ? <ReasonCodeChip code={result.reason_code} /> : '—'} />
            <InfoRow label="Match method" value={
              result.match_type === 'MANUAL' ? 'Manual resolution'
                : result.ai_used ? `AI-assisted${result.ai_mode === 'LLM' ? ' (LLM)' : ' (deterministic fallback)'}`
                : 'Deterministic rules'
            } />
            <InfoRow label="AI used" value={result.ai_used ? 'Yes' : 'No'} />
            <InfoRow label="Recorded" value={result.created_at ? new Date(result.created_at).toLocaleString() : '—'} />
          </div>

          {result.reason && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="eyebrow mb-1">Reason</div>
              <p className="text-sm text-slate-700">{result.reason}</p>
            </div>
          )}

          {rules.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Rules triggered</div>
              <div className="flex flex-wrap gap-1.5">
                {rules.map((rule, i) => (
                  <span key={i} className="badge badge-neutral font-mono">{rule}</span>
                ))}
              </div>
            </div>
          )}

          {candidates.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Candidate payments considered</div>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map(cid => {
                  const p = payments.find(p => p.payment_id === cid)
                  return (
                    <span key={cid} className="badge badge-info font-mono">
                      {cid}{p ? ` · ${formatINR(p.amount)}` : ''}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {result.resolved === 1 && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-teal-800 mb-1">
                <Icon.User size={14} /> Human Resolution
              </div>
              <p className="text-xs text-teal-800 leading-relaxed">
                {result.resolution_action || 'Resolved'} by {result.resolved_by || 'Human Reviewer'}
                {result.resolved_at ? ` · ${new Date(result.resolved_at).toLocaleString()}` : ''}
                {result.resolution_note ? ` — “${result.resolution_note}”` : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
