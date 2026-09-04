import { useContext, useState, useMemo } from 'react'
import { AppContext } from '../App'
import { formatINR } from '../format'
import {
  Icon, PageHeader, StatusBadge, Modal, ModalHeader, EmptyState, InfoRow,
  categoryLabel, categoryBadgeClass, STATUS_META, ReasonCodeChip, ReviewStateBadge, reasonCodeOf,
} from '../components/ui'

/* ---------- derived priority (transparent heuristic, disclosed in UI) ---------- */

function priorityOf(e: any): { level: 'High' | 'Medium' | 'Low'; cls: string } {
  const cat = e.exception_category
  if (cat === 'amount_mismatch' || cat === 'duplicate' || cat === 'multiple_candidates') return { level: 'High', cls: 'badge-exception' }
  if (e.status === 'EXCEPTION' && cat === 'date_mismatch') return { level: 'Medium', cls: 'badge-partial' }
  if (cat === 'missing_payment' || cat === 'missing_invoice' || e.status === 'MISSING') return { level: 'Medium', cls: 'badge-missing' }
  if (cat === 'low_confidence' || cat === 'missing_identifier') return { level: 'Low', cls: 'badge-neutral' }
  return { level: e.status === 'EXCEPTION' ? 'High' : 'Medium', cls: e.status === 'EXCEPTION' ? 'badge-exception' : 'badge-partial' }
}

function ageOf(iso?: string): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

/* ================================================================== */

export default function Exceptions() {
  const { exceptions, resolvedExceptions, dataset, refreshData } = useContext(AppContext)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [catFilter, setCatFilter] = useState('ALL')
  const [view, setView] = useState<'active' | 'resolved'>('active')
  const [selected, setSelected] = useState<any>(null)
  const [resolving, setResolving] = useState<any>(null)

  const list = view === 'active' ? exceptions : resolvedExceptions
  const invoices = dataset?.invoices || []
  const payments = dataset?.payments || []

  const filtered = useMemo(() => {
    let items = list
    if (typeFilter !== 'ALL') items = items.filter(e => e.status === typeFilter)
    if (catFilter !== 'ALL') items = items.filter(e => (e.exception_category || 'other') === catFilter)
    return items
  }, [list, typeFilter, catFilter])

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of exceptions) c[e.status] = (c[e.status] || 0) + 1
    return c
  }, [exceptions])

  const catCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of exceptions) {
      const k = e.exception_category || 'other'
      c[k] = (c[k] || 0) + 1
    }
    return c
  }, [exceptions])

  const highPriority = useMemo(() => exceptions.filter(e => priorityOf(e).level === 'High').length, [exceptions])
  const amountMismatch = catCounts.amount_mismatch || 0
  const missingRecs = useMemo(() => exceptions.filter(e =>
    e.status === 'MISSING' || ['missing_payment', 'missing_invoice'].includes(e.exception_category)
  ).length, [exceptions])
  const lowConf = useMemo(() => exceptions.filter(e =>
    e.status === 'UNRESOLVED' || e.exception_category === 'low_confidence'
  ).length, [exceptions])

  const handleResolve = async (action: string, paymentId: string | null, note: string) => {
    if (!resolving) return
    const res = await fetch('/api/exceptions/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: resolving.invoice_id, action, payment_id: paymentId, note }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Resolution failed')
    setResolving(null)
    setSelected(null)
    await refreshData()
  }

  if (exceptions.length === 0 && resolvedExceptions.length === 0) {
    return (
      <div className="pt-8">
        <EmptyState
          icon={<Icon.Check size={26} />}
          title="No exceptions"
          message="All processed records have been successfully reconciled — or no reconciliation has been run yet. Flagged records will appear here for investigation."
        />
      </div>
    )
  }

  const summaryCards = [
    { label: 'Total Exceptions', value: exceptions.length, hint: 'Active records awaiting action' },
    { label: 'High Priority', value: highPriority, hint: 'Amount mismatch, duplicate or multiple candidates' },
    { label: 'Amount Mismatch', value: amountMismatch, hint: 'Expected vs received amounts differ beyond tolerance' },
    { label: 'Missing Records', value: missingRecs, hint: 'Invoices with no payment found' },
    { label: 'Low Confidence', value: lowConf, hint: 'No reliable candidate identified' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Exception Queue"
        subtitle="Financial records requiring investigation or human intervention."
        actions={
          resolvedExceptions.length > 0 ? (
            <button onClick={() => setView(v => v === 'active' ? 'resolved' : 'active')} className="btn-secondary">
              {view === 'active' ? `View resolved (${resolvedExceptions.length})` : 'Back to active'}
            </button>
          ) : undefined
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summaryCards.map(c => (
          <div key={c.label} className="card px-4 py-3.5" title={c.hint}>
            <div className="eyebrow flex items-center">{c.label}</div>
            <div className="num text-2xl font-bold text-slate-900 mt-1">{c.value}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{c.hint}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card card-pad !py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-slate-200 mr-1">
            <button onClick={() => setView('active')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'active' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              Active · {exceptions.length}
            </button>
            <button onClick={() => setView('resolved')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'resolved' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              Resolved · {resolvedExceptions.length}
            </button>
          </div>

          {(['ALL', 'EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`chip ${typeFilter === t ? 'chip-on' : 'chip-off'}`}>
              {t === 'ALL' ? 'All statuses' : (STATUS_META[t]?.short || t)}
              <span className="opacity-70 num">{t === 'ALL' ? list.length : statusCounts[t] || 0}</span>
            </button>
          ))}

          <span className="w-px h-5 bg-slate-200 mx-1" />

          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="select w-52" aria-label="Filter by exception type">
            <option value="ALL">All exception types</option>
            {Object.entries(catCounts).map(([cat, n]) => (
              <option key={cat} value={cat}>{categoryLabel(cat)} · {n}</option>
            ))}
          </select>

          <span className="ml-auto text-[11px] text-slate-400">
            {filtered.length} shown · priority derived from exception type
          </span>
        </div>
      </div>

      {/* Queue list */}
      <div className="space-y-3">
        {filtered.map(e => (
          <ExceptionRow
            key={`${view}-${e.invoice_id}`}
            exception={e}
            invoice={invoices.find(i => i.invoice_id === e.invoice_id)}
            payments={payments}
            onSelect={setSelected}
            onResolve={setResolving}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card">
          <EmptyState
            icon={view === 'active' ? <Icon.Alert size={24} /> : <Icon.Check size={24} />}
            title={view === 'active' ? 'No exceptions in this view' : 'No resolved exceptions yet'}
            message={view === 'active' ? 'All records in this category were reconciled by the agent.' : 'Resolve an exception from the active queue to record it here.'}
          />
        </div>
      )}

      {selected && (
        <ExceptionDetailModal
          exception={selected}
          invoices={invoices}
          payments={payments}
          onClose={() => setSelected(null)}
          onResolve={setResolving}
        />
      )}
      {resolving && (
        <ResolveModal
          exception={resolving}
          invoices={invoices}
          payments={payments}
          onClose={() => setResolving(null)}
          onAction={handleResolve}
        />
      )}
    </div>
  )
}

/* ================================================================== */

function ExceptionRow({ exception, invoice, payments, onSelect, onResolve }: {
  exception: any
  invoice: any
  payments: any[]
  onSelect: (e: any) => void
  onResolve: (e: any) => void
}) {
  const prio = priorityOf(exception)
  const isResolved = exception.resolved === 1
  const payment = payments.find((p: any) => p.payment_id === exception.payment_id)
  const recvAmt = payment?.amount

  return (
    <div className="card overflow-hidden hover:shadow-panel transition-shadow">
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-[13px] font-bold text-slate-900">{exception.invoice_id}</span>
          <StatusBadge status={exception.status} />
          <span className={`badge ${categoryBadgeClass(exception.exception_category)}`}>{categoryLabel(exception.exception_category)}</span>
          {exception.reason_code && <ReasonCodeChip code={exception.reason_code} className="hidden sm:inline-flex" />}
          <span className={`badge ${prio.cls} !bg-opacity-40`}>{prio.level}</span>
          {isResolved
            ? <ReviewStateBadge state="MANUALLY_RESOLVED" className="text-[10px]" />
            : <ReviewStateBadge state="AWAITING_REVIEW" className="hidden md:inline-flex text-[10px]" />}
          <div className="ml-auto flex items-center gap-4">
            {invoice && (
              <span className="num text-sm font-semibold text-slate-800">{formatINR(invoice.amount)}</span>
            )}
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Icon.Clock size={12} /> {ageOf(exception.created_at)}
            </span>
            <div className="flex items-center gap-1.5 w-20">
              <div className="conf-bar flex-1"><span style={{ width: `${Math.round(exception.confidence * 100)}%`, background: exception.confidence >= 0.5 ? '#d97706' : '#dc2626' }} /></div>
              <span className="num text-[11px] font-semibold text-slate-600">{Math.round(exception.confidence * 100)}%</span>
            </div>
          </div>
        </div>

        {/* amounts */}
        {invoice && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2.5 text-xs">
            <span className="text-slate-500">Expected: <b className="num text-slate-700">{formatINR(invoice.amount)}</b></span>
            {payment && recvAmt !== undefined && recvAmt !== invoice.amount && (
              <>
                <span className="text-slate-500">Received: <b className="num text-slate-700">{formatINR(recvAmt)}</b></span>
                <span className={`inline-flex items-center gap-1 font-semibold num ${invoice.amount > recvAmt ? 'text-red-600' : 'text-amber-600'}`}>
                  {invoice.amount > recvAmt ? <><Icon.X size={12} /> short {formatINR(invoice.amount - recvAmt)}</> : <><Icon.Info size={12} /> over {formatINR(recvAmt - invoice.amount)}</>}
                </span>
              </>
            )}
            {exception.payment_id && !payment && (
              <span className="text-slate-500">Payment <b className="font-mono">{exception.payment_id}</b> not in dataset</span>
            )}
          </div>
        )}

        {/* reason + code */}
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          {exception.reason_code && <ReasonCodeChip code={exception.reason_code} />}
          <p className="text-xs text-slate-600 flex-1 min-w-[220px]">{exception.reason || ''}</p>
        </div>

        {/* candidates */}
        {Array.isArray(exception.candidate_ids) && exception.candidate_ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span className="text-[11px] text-slate-400 mr-1">Candidates:</span>
            {exception.candidate_ids.map((cid: string) => {
              const p = payments.find((pp: any) => pp.payment_id === cid)
              return (
                <span key={cid} className="badge badge-info font-mono">
                  {cid}{p ? ` · ${formatINR(p.amount)}` : ''}
                </span>
              )
            })}
          </div>
        )}

        {/* actions */}
        <div className="flex gap-2 mt-3.5">
          <button onClick={() => onSelect(exception)} className="btn-secondary btn-sm">
            <Icon.Search size={13} /> View
          </button>
          {!isResolved && (
            <button onClick={() => onResolve(exception)} className="btn-primary btn-sm">
              <Icon.User size={13} /> Resolve
            </button>
          )}
          {!isResolved && exception.payment_id && (
            <button onClick={() => onResolve({ ...exception, suggestManual: true })} className="btn-ghost btn-sm">
              <Icon.Reconcile size={13} /> Manual match
            </button>
          )}
          {isResolved && (
            <button onClick={() => onSelect(exception)} className="btn-ghost btn-sm">View resolution</button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/* Detail modal                                                       */
/* ================================================================== */

function ExceptionDetailModal({ exception, invoices, payments, onClose, onResolve }: {
  exception: any
  invoices: any[]
  payments: any[]
  onClose: () => void
  onResolve: (e: any) => void
}) {
  const invoice = invoices.find(i => i.invoice_id === exception.invoice_id)
  const payment = payments.find(p => p.payment_id === exception.payment_id)
  const evidence = (() => {
    if (typeof exception.evidence === 'string') { try { return JSON.parse(exception.evidence || '{}') } catch { return {} } }
    return exception.evidence || {}
  })()
  const prio = priorityOf(exception)

  return (
    <Modal onClose={onClose} wide={false}>
      <ModalHeader
        title={<span className="flex items-center gap-2.5"><StatusBadge status={exception.status} /> <span className="font-mono">{exception.invoice_id}</span></span>}
        subtitle={<span className="flex items-center gap-2"><span>{categoryLabel(exception.exception_category)} · {prio.level} priority</span>{exception.reason_code && <ReasonCodeChip code={exception.reason_code} />}</span>}
        onClose={onClose}
      />
      <div className="p-5 space-y-4 overflow-y-auto">
        {invoice && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-slate-200 p-4">
            <InfoRow label="Customer" value={invoice.customer} className="sm:col-span-2" />
            <InfoRow label="Invoice amount" value={<b className="num">{formatINR(invoice.amount)}</b>} />
            <InfoRow label="Invoice date" value={invoice.invoice_date} />
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="eyebrow !mb-0">Investigation</span>
            <ReviewStateBadge state={exception.resolved === 1 ? 'MANUALLY_RESOLVED' : 'AWAITING_REVIEW'} className="text-[10px]" />
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{exception.reason || 'No reason recorded.'}</p>
          {payment && (
            <p className="text-xs text-slate-500 mt-2">
              Candidate payment <b className="font-mono">{payment.payment_id}</b> · {payment.customer} · {formatINR(payment.amount)} · {payment.payment_date}
            </p>
          )}
        </div>

        {Object.keys(evidence).length > 0 && (
          <div>
            <div className="eyebrow mb-2">Evidence</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
              {Object.entries(evidence)
                .filter(([k, v]) => !['reasoning', 'candidates', 'duplicates', 'method', 'bank_transaction_id'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="text-[13px] text-slate-700">
                    <span className="text-slate-400">•</span>{' '}
                    <span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
                    <span className="text-slate-600">{Array.isArray(v) ? v.join('; ') : String(v)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {exception.resolved === 1 && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-800 mb-1"><Icon.User size={14} /> Resolution</div>
            <p className="text-xs text-teal-800 leading-relaxed">
              <b>{exception.resolution_action || 'Resolved'}</b> by {exception.resolved_by || 'Human Reviewer'}
              {exception.resolved_at ? ` · ${new Date(exception.resolved_at).toLocaleString()}` : ''}
              {exception.resolution_note ? ` — “${exception.resolution_note}”` : ''}
            </p>
            {exception.status === 'MATCHED' && exception.payment_id && (
              <p className="text-xs text-teal-800 mt-1.5">Linked to <b className="font-mono">{exception.payment_id}</b>{exception.transaction_id ? ` → ${exception.transaction_id}` : ''}</p>
            )}
          </div>
        )}
      </div>
      <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2.5">
        {exception.resolved !== 1 && (
          <button onClick={() => { onClose(); onResolve(exception) }} className="btn-primary">
            <Icon.User size={14} /> Resolve / Manual Match
          </button>
        )}
      </div>
    </Modal>
  )
}

/* ================================================================== */
/* Resolve modal                                                      */
/* ================================================================== */

function ResolveModal({ exception, invoices, payments, onClose, onAction }: {
  exception: any
  invoices: any[]
  payments: any[]
  onClose: () => void
  onAction: (action: string, paymentId: string | null, note: string) => Promise<void>
}) {
  const [action, setAction] = useState<'MANUAL_MATCH' | 'MARK_RESOLVED' | 'DISMISS'>(exception.suggestManual ? 'MANUAL_MATCH' : 'MARK_RESOLVED')
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const invoice = invoices.find(i => i.invoice_id === exception.invoice_id)

  const candidatePayments = useMemo(() => {
    const ids: string[] = Array.isArray(exception.candidate_ids) ? [...exception.candidate_ids] : []
    if (exception.payment_id && !ids.includes(exception.payment_id)) ids.push(exception.payment_id)
    return ids.map(id => payments.find(p => p.payment_id === id)).filter(Boolean)
  }, [exception, payments])

  const doAction = async () => {
    if (action === 'MANUAL_MATCH' && !selectedPayment) return
    setBusy(true)
    try { await onAction(action, selectedPayment, note) } finally { setBusy(false) }
  }

  const options: { key: 'MARK_RESOLVED' | 'MANUAL_MATCH' | 'DISMISS'; title: string; desc: string }[] = [
    { key: 'MARK_RESOLVED', title: 'Mark as Resolved', desc: 'Accept the agent’s finding. The exception is handled and leaves the active queue.' },
    { key: 'MANUAL_MATCH', title: 'Create Manual Match', desc: 'Override the agent and link a specific payment to this invoice.' },
    { key: 'DISMISS', title: 'Ignore / Dismiss', desc: 'Not a real exception. Dismiss without changing status — recorded in the audit log.' },
  ]

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title={`Resolve ${exception.invoice_id}`}
        subtitle={`${categoryLabel(exception.exception_category)} · ${Math.round(exception.confidence * 100)}% agent confidence`}
        onClose={onClose}
      />
      <div className="p-5 space-y-4 overflow-y-auto">
        {invoice && (
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
            <span className="text-slate-500 truncate">{invoice.customer}</span>
            <span className="text-slate-300 mx-3">·</span>
            <span className="num font-semibold whitespace-nowrap">{formatINR(invoice.amount)}</span>
            <span className="text-slate-300 mx-3">·</span>
            <span className="text-slate-500 whitespace-nowrap">{invoice.invoice_date}</span>
          </div>
        )}

        <div className="space-y-2" role="radiogroup" aria-label="Resolution action">
          {options.map(opt => (
            <label key={opt.key} className={`flex items-start gap-3 p-3.5 rounded-md border cursor-pointer transition-colors text-left ${action === opt.key ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-200' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="action" checked={action === opt.key} onChange={() => setAction(opt.key)} className="mt-0.5 accent-brand-600" />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{opt.title}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {action === 'MANUAL_MATCH' && (
          <div>
            <p className="label-form">Select payment to link</p>
            {candidatePayments.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                No candidate payments were recorded for this exception. The agent found no payment close enough to link.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {candidatePayments.map((p: any) => (
                  <label key={p.payment_id} className={`flex items-center justify-between gap-3 p-2.5 rounded-md border cursor-pointer text-sm ${selectedPayment === p.payment_id ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input type="radio" name="pay" checked={selectedPayment === p.payment_id} onChange={() => setSelectedPayment(p.payment_id)} className="accent-brand-600" />
                      <span className="font-mono text-[13px] font-semibold">{p.payment_id}</span>
                      <span className="text-xs text-slate-500 truncate">{p.customer}</span>
                    </span>
                    <span className="num text-xs text-slate-600 whitespace-nowrap">{formatINR(p.amount)} · {p.payment_date}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="reviewer-note" className="label-form">Reviewer note <span className="font-normal normal-case text-slate-400">(optional)</span></label>
          <input id="reviewer-note" type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Verified bank statement — payment confirmed" className="input" />
        </div>
      </div>
      <div className="px-5 py-4 border-t border-slate-200 flex gap-2.5">
        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button onClick={doAction} disabled={busy || (action === 'MANUAL_MATCH' && !selectedPayment)} className="btn-primary flex-1">
          {busy ? 'Saving…' : action === 'MANUAL_MATCH' ? 'Confirm Manual Match' : action === 'DISMISS' ? 'Dismiss Exception' : 'Confirm Resolution'}
        </button>
      </div>
    </Modal>
  )
}
