import type * as React from 'react'
import { useContext, useState, useMemo } from 'react'
import { AppContext } from '../App'
import { Icon, PageHeader, StatusBadge, EmptyState, STATUS_META, ReasonCodeChip } from '../components/ui'

const METHOD_LABELS: Record<string, string> = {
  MANUAL: 'Manual resolution',
  DETERMINISTIC: 'Deterministic rules',
  DETERMINISTIC_THREE_WAY: 'Deterministic (three-way)',
  AI_ASSISTED: 'AI-assisted',
  PDF_TEXT: 'PDF text extraction',
  PDF_OCR: 'PDF OCR',
  IMAGE_OCR: 'Image OCR',
  CSV: 'CSV parsing',
  TXT: 'Text parsing',
  INGESTION: 'Document ingestion',
}

function methodLabel(log: any): string {
  if (log.method === 'MANUAL') return 'Manual resolution'
  if (log.ai_used) return log.ai_mode === 'LLM' ? 'AI-assisted (LLM)' : 'AI-assisted (deterministic fallback)'
  return METHOD_LABELS[log.method] || log.method || 'Deterministic rules'
}

const HUMAN_ACTIONS = new Set(['MANUAL_MATCH', 'MANUAL_RESOLUTION', 'DISMISSED'])
const INGEST_ACTIONS = new Set(['DOCUMENT_PROCESSED', 'RECORDS_LOADED'])
const DECISION_STATUSES = new Set(['MATCHED', 'PARTIAL_MATCH', 'EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING'])

function rowKind(log: any): 'decision' | 'human' | 'ingestion' | 'other' {
  if (HUMAN_ACTIONS.has(log.action)) return 'human'
  if (INGEST_ACTIONS.has(log.action)) return 'ingestion'
  if (DECISION_STATUSES.has(log.action) || DECISION_STATUSES.has(log.status)) return 'decision'
  return 'other'
}

function actor(log: any): { label: string; icon: React.ReactNode } {
  const kind = rowKind(log)
  if (kind === 'human') return { label: 'Human Reviewer', icon: <Icon.User size={12} /> }
  if (kind === 'ingestion') return { label: 'Ingestion Service', icon: <Icon.Upload size={12} /> }
  return { label: 'Reconciliation Agent', icon: <Icon.Activity size={12} /> }
}

export default function AuditLog() {
  const { auditLogs } = useContext(AppContext)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [kindFilter, setKindFilter] = useState('ALL')
  const [expanded, setExpanded] = useState<number | null>(null)

  const filtered = useMemo(() => {
    let items = [...auditLogs]
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(log =>
        log.invoice_id?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.ai_decision?.toLowerCase().includes(q) ||
        log.method?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'ALL') items = items.filter(log => log.status === statusFilter)
    if (kindFilter !== 'ALL') items = items.filter(log => {
      const k = rowKind(log)
      if (kindFilter === 'decision') return k === 'decision'
      if (kindFilter === 'human') return k === 'human'
      if (kindFilter === 'ingestion') return k === 'ingestion'
      return true
    })
    return items
  }, [auditLogs, search, statusFilter, kindFilter])

  const parseJson = (str: string | null): any => {
    if (!str) return null
    try { return JSON.parse(str) } catch { return str }
  }

  const countByKind = useMemo(() => ({
    decision: auditLogs.filter(l => rowKind(l) === 'decision').length,
    human: auditLogs.filter(l => rowKind(l) === 'human').length,
    ingestion: auditLogs.filter(l => rowKind(l) === 'ingestion').length,
  }), [auditLogs])

  if (auditLogs.length === 0) {
    return (
      <div className="pt-8">
        <EmptyState
          icon={<Icon.Audit size={26} />}
          title="No audit entries"
          message="Run the reconciliation agent or process documents to build the audit trail."
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Audit Log"
        subtitle="Complete history of reconciliation decisions and user actions."
      />

      {/* Filters */}
      <div className="card card-pad !py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Icon.Search size={15} /></span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search record, action, method…" aria-label="Search audit log" className="input !pl-9 w-64" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select w-44" aria-label="Filter by decision status">
            <option value="ALL">All decisions</option>
            {Object.keys(STATUS_META).map(k => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
          </select>
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} className="select w-48" aria-label="Filter by event type">
            <option value="ALL">All event types</option>
            <option value="decision">Agent decisions ({countByKind.decision})</option>
            <option value="human">Human actions ({countByKind.human})</option>
            <option value="ingestion">Ingestion events ({countByKind.ingestion})</option>
          </select>
          <span className="ml-auto text-xs text-slate-400 num">{filtered.length} of {auditLogs.length} entries</span>
        </div>
      </div>

      {/* Trail */}
      <div>
        {filtered.map(log => {
          const kind = rowKind(log)
          const isExpanded = expanded === log.id
          const act = actor(log)
          const evidence = parseJson(log.evidence_json)
          const rules = parseJson(log.rules_triggered)
          const candidates = parseJson(log.candidate_ids)
          const ts = new Date(log.timestamp)
          const dotColor = kind === 'human' ? 'bg-teal-500'
            : kind === 'ingestion' ? 'bg-brand-500'
            : (STATUS_META[log.action]?.dot || STATUS_META[log.status]?.dot || 'bg-slate-400')

          return (
            <div key={log.id} className="relative pl-10 pb-1 group">
              {/* rail */}
              <span className="absolute left-[11px] top-5 bottom-0 w-px bg-slate-200 group-last:hidden" aria-hidden />
              <span className={`absolute left-1.5 w-5 h-5 rounded-full ring-4 ring-slate-100 flex items-center justify-center ${dotColor}`} style={{ top: 18 }}>
                {kind === 'human' ? <Icon.User size={10} className="text-white" /> : kind === 'ingestion' ? <Icon.File size={10} className="text-white" /> : <Icon.Check size={10} className="text-white" />}
              </span>

              <div className="card hover:shadow-panel transition-shadow overflow-hidden">
                <button className="w-full text-left p-4 focus:outline-none" onClick={() => setExpanded(isExpanded ? null : log.id)} aria-expanded={isExpanded}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs text-slate-400 num whitespace-nowrap">
                      {ts.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                      <span className="mx-1 text-slate-300">·</span>
                      {ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-mono text-[13px] font-bold text-slate-900">{log.invoice_id}</span>

                    {kind === 'decision' && (
                      <>
                        <StatusBadge status={log.action || log.status} />
                        <span className="badge badge-neutral">{methodLabel(log)}</span>
                      </>
                    )}
                    {kind === 'human' && (
                      <>
                        <span className="badge badge-manual"><Icon.User size={11} /> {log.action}</span>
                        {evidence && log.status && evidence !== log.status && (
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            <StatusBadge status={typeof evidence?.resolution === 'object' ? evidence.resolution.previous_status : evidence?.previous_status || evidence?.resolution} />
                            {typeof evidence?.resolution === 'object' && evidence.resolution.previous_status !== log.status && <Icon.ArrowRight size={11} className="text-slate-400" />}
                            <StatusBadge status={log.status} />
                          </span>
                        )}
                      </>
                    )}
                    {kind === 'ingestion' && (
                      <>
                        <span className="badge badge-info"><Icon.Upload size={11} /> {log.action}</span>
                        <span className="badge badge-neutral">{log.method}</span>
                      </>
                    )}

                    <span className="ml-auto flex items-center gap-3">
                      {(kind === 'decision' || kind === 'human') && (
                        <span className="num text-xs font-semibold text-slate-600">{Math.round((log.confidence || 0) * 100)}% conf</span>
                      )}
                      <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                        {act.icon} {act.label}
                      </span>
                      <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><Icon.ChevronDown size={15} /></span>
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 space-y-3.5 animate-panel-in">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3.5">
                      <Detail label="Record" mono>{log.invoice_id}</Detail>
                      <Detail label="Action">{log.action}</Detail>
                      {kind === 'human' && (
                        <>
                          <Detail label="Previous status">{
                            typeof evidence?.resolution === 'object' && evidence.resolution.previous_status
                              ? <StatusBadge status={evidence.resolution.previous_status} />
                              : evidence?.previous_status ? <StatusBadge status={evidence.previous_status} /> : '—'
                          }</Detail>
                          <Detail label="New status">{log.status ? <StatusBadge status={log.status} /> : '—'}</Detail>
                        </>
                      )}
                      <Detail label="Reason code">{log.reason_code ? <ReasonCodeChip code={log.reason_code} /> : '—'}</Detail>
                      <Detail label="Decision method">{methodLabel(log)}</Detail>
                      <Detail label="Performed by">{act.label}</Detail>
                      <Detail label="Confidence">{log.confidence != null ? `${Math.round(log.confidence * 100)}%` : '—'}</Detail>
                      <Detail label="AI used">
                        {kind === 'ingestion' ? 'No (extraction)' : log.ai_used ? (log.ai_mode === 'LLM' ? 'Yes — LLM' : 'Yes — deterministic fallback') : 'No — rules only'}
                      </Detail>
                      <Detail label="Human intervention">
                        {kind === 'human' ? <span className="badge badge-manual text-[10px]">Yes</span> : 'No'}
                      </Detail>
                      <Detail label="Agent version">v1.2.0</Detail>
                    </div>

                    {kind === 'ingestion' && evidence && typeof evidence === 'object' && (
                      <div className="rounded-md border border-slate-200 bg-white p-3.5">
                        <div className="eyebrow mb-2">Extraction summary</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-700">
                          <Detail label="File">{evidence.fileName || '—'}</Detail>
                          <Detail label="Method">{evidence.method || log.method}</Detail>
                          <Detail label="Records extracted">{evidence.recordsExtracted ?? '—'}</Detail>
                          <Detail label="Extraction confidence">{evidence.extractionConfidence != null ? `${evidence.extractionConfidence}%` : '—'}</Detail>
                          {evidence.sourceType && <Detail label="Source type">{evidence.sourceType}</Detail>}
                          {evidence.foreignCurrency && <Detail label="Foreign currency">⚠ {evidence.foreignCurrency}</Detail>}
                        </div>
                      </div>
                    )}

                    {rules && Array.isArray(rules) && rules.length > 0 && (
                      <div>
                        <div className="eyebrow mb-1.5">Rules / factors used</div>
                        <div className="flex flex-wrap gap-1.5">
                          {rules.map((rule: string, i: number) => (
                            <span key={i} className="badge badge-neutral font-mono">{rule}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {candidates && Array.isArray(candidates) && candidates.length > 0 && (
                      <div>
                        <div className="eyebrow mb-1.5">Records involved</div>
                        <div className="flex flex-wrap gap-1.5">
                          {candidates.map((c: string, i: number) => (
                            <span key={i} className="badge badge-info font-mono">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {evidence && kind === 'decision' && typeof evidence === 'object' && !Array.isArray(evidence) && (
                      <div>
                        <div className="eyebrow mb-1.5">Evidence</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1">
                          {Object.entries(evidence)
                            .filter(([k]) => !['reasoning', 'candidates', 'duplicates', 'method', 'resolution', 'bank_transaction_id'].includes(k))
                            .map(([k, v]) => (
                              <div key={k} className="text-xs text-slate-600">
                                <span className="capitalize font-medium text-slate-700">{k.replace(/_/g, ' ')}:</span>{' '}
                                {Array.isArray(v) ? v.join('; ') : String(v)}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {evidence?.resolution && (
                      <div className="rounded-md border border-teal-200 bg-teal-50 p-3.5">
                        <div className="text-xs font-semibold text-teal-800 mb-1.5 flex items-center gap-1.5"><Icon.User size={13} /> Human resolution details</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 text-xs text-teal-800">
                          {typeof evidence.resolution === 'object' && !Array.isArray(evidence.resolution)
                            ? Object.entries(evidence.resolution)
                                .filter(([k]) => k !== 'note')
                                .map(([k, v]) => (
                                  <div key={k}><span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span> {String(v ?? '—')}</div>
                                ))
                            : <div className="sm:col-span-2">{String(evidence.resolution)}</div>}
                          {(log.resolution_note || (typeof evidence.resolution === 'object' && evidence.resolution.note)) && (
                            <div className="sm:col-span-2"><span className="font-medium">Note:</span> {log.resolution_note || (typeof evidence.resolution === 'object' ? evidence.resolution.note : '')}</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 pt-0.5">Recorded {ts.toLocaleString()}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="card mt-2">
          <EmptyState icon={<Icon.Search size={22} />} title="No matching audit entries" message="Adjust the search or filters to see more of the audit trail." />
        </div>
      )}
    </div>
  )
}

function Detail({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow !text-[10px]">{label}</div>
      <div className={`text-xs text-slate-700 mt-0.5 break-words ${mono ? 'font-mono' : ''}`}>{children || '—'}</div>
    </div>
  )
}
