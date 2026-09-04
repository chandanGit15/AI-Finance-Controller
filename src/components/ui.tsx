import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* Icon set — inline SVG, stroke-based, 1.8px, professional           */
/* ------------------------------------------------------------------ */

type IconProps = { size?: number; className?: string }

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }
}

export const Icon = {
  Overview: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  Reconcile: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <path d="M9 4h10a1 1 0 0 1 1 1v4" />
      <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
      <circle cx="9" cy="12" r="3.2" />
      <path d="M12.5 12h8.5" />
    </svg>
  ),
  Alert: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  Audit: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  Database: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  ),
  Settings: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
  Bell: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
  Search: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  ChevronDown: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  ChevronRight: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  X: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Check: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  Info: (p: IconProps) => (
    <svg {...base(p.size ?? 14, p.className)}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </svg>
  ),
  Clock: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  Activity: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M22 12h-4l-3 8L9 4l-3 8H2" />
    </svg>
  ),
  Play: (p: IconProps) => (
    <svg {...base(p.size ?? 14, p.className)}>
      <path d="M7 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  ),
  Upload: (p: IconProps) => (
    <svg {...base(p.size ?? 18, p.className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  ),
  File: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  User: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  ),
  Shield: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M12 2 4 5.5v5.6c0 5 3.4 8.6 8 10.9 4.6-2.3 8-5.9 8-10.9V5.5Z" />
      <path d="m8.8 11.8 2.3 2.3 4.1-4.4" />
    </svg>
  ),
  LogOut: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  Menu: (p: IconProps) => (
    <svg {...base(p.size ?? 20, p.className)}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  Refresh: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  ),
  Layers: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  ),
  ArrowRight: (p: IconProps) => (
    <svg {...base(p.size ?? 16, p.className)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  External: (p: IconProps) => (
    <svg {...base(p.size ?? 14, p.className)}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  ),
}

/* ------------------------------------------------------------------ */
/* Status configuration (single source for all pages)                 */
/* ------------------------------------------------------------------ */

export const STATUS_META: Record<string, { label: string; badge: string; dot: string; short: string }> = {
  MATCHED: { label: 'MATCHED', badge: 'badge-matched', dot: 'bg-emerald-500', short: 'Matched' },
  PARTIAL_MATCH: { label: 'PARTIAL MATCH', badge: 'badge-partial', dot: 'bg-amber-500', short: 'Partial' },
  EXCEPTION: { label: 'EXCEPTION', badge: 'badge-exception', dot: 'bg-red-500', short: 'Exception' },
  UNRESOLVED: { label: 'UNRESOLVED', badge: 'badge-unresolved', dot: 'bg-slate-500', short: 'Unresolved' },
  DUPLICATE: { label: 'DUPLICATE', badge: 'badge-duplicate', dot: 'bg-violet-500', short: 'Duplicate' },
  MISSING: { label: 'MISSING', badge: 'badge-missing', dot: 'bg-sky-500', short: 'Missing' },
}

export const CATEGORY_LABELS: Record<string, string> = {
  amount_mismatch: 'Amount Mismatch',
  date_mismatch: 'Date Mismatch',
  missing_payment: 'Missing Payment',
  missing_invoice: 'Missing Invoice',
  duplicate: 'Duplicate Transaction',
  multiple_candidates: 'Multiple Candidates',
  low_confidence: 'Low Confidence',
  missing_identifier: 'Missing Identifier',
}

export function categoryLabel(cat?: string | null): string {
  return CATEGORY_LABELS[cat || ''] || 'Other'
}

export function categoryBadgeClass(cat?: string | null): string {
  switch (cat) {
    case 'amount_mismatch': return 'badge-exception'
    case 'date_mismatch': return 'badge-partial'
    case 'missing_payment':
    case 'missing_invoice': return 'badge-missing'
    case 'duplicate': return 'badge-duplicate'
    case 'multiple_candidates': return 'badge-info'
    case 'low_confidence':
    case 'missing_identifier': return 'badge-neutral'
    default: return 'badge-neutral'
  }
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status]
  if (!meta) return <span className={`badge badge-neutral ${className || ''}`}>{status}</span>
  return (
    <span className={`badge ${meta.badge} ${className || ''}`}>
      <span className={`status-dot ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  )
}

/* ---------- Review state (orthogonal to status) ---------- */

export const REVIEW_STATE_META: Record<string, { label: string; badge: string; hint: string }> = {
  AUTO_RESOLVED: { label: 'AUTO-RESOLVED', badge: 'badge-matched', hint: 'Decided automatically — confidence met the auto-reconcile threshold.' },
  AWAITING_REVIEW: { label: 'AWAITING REVIEW', badge: 'badge-partial', hint: 'Flagged for human review — still active in the exception queue.' },
  MANUALLY_RESOLVED: { label: 'MANUALLY RESOLVED', badge: 'badge-manual', hint: 'A human reviewer resolved or matched this record.' },
}

export function reviewStateLabel(state?: string): string {
  return REVIEW_STATE_META[state || '']?.label || state || '—'
}

export function ReviewStateBadge({ state, className }: { state?: string; className?: string }) {
  const meta = REVIEW_STATE_META[state || '']
  if (!meta) return <span className={`badge badge-neutral ${className || ''}`}>—</span>
  return <span className={`badge ${meta.badge} ${className || ''}`} title={meta.hint}>{meta.label}</span>
}

export function reviewStateCounts(results: any[]): { auto: number; awaiting: number; manual: number } {
  let auto = 0, awaiting = 0, manual = 0
  for (const r of results) {
    if (r.review_state === 'MANUALLY_RESOLVED' || r.resolved === 1) manual++
    else if (r.review_state === 'AWAITING_REVIEW' || ['EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING'].includes(r.status)) awaiting++
    else auto++
  }
  return { auto, awaiting, manual }
}

/* ---------- Reason codes ---------- */

export const REASON_CODE_LABELS: Record<string, string> = {
  MATCH_EXACT_REFERENCE: 'Invoice reference or customer matched exactly',
  MATCH_AMOUNT_DATE: 'Amount and date evidence support the match',
  LOW_CONFIDENCE: 'Confidence below the review threshold',
  MISSING_PAYMENT: 'No payment candidate found for this invoice',
  MISSING_INVOICE: 'No invoice found for this record',
  DUPLICATE_PAYMENT: 'Multiple payments match the same invoice',
  AMOUNT_MISMATCH: 'Expected and received amounts differ beyond tolerance',
  DATE_MISMATCH: 'Payment date outside the configured tolerance',
  MULTIPLE_CANDIDATES: 'Multiple equally plausible candidates',
}

export function reasonCodeOf(result: any): string | null {
  if (result.reason_code) return result.reason_code
  const catMap: Record<string, string> = {
    amount_mismatch: 'AMOUNT_MISMATCH',
    date_mismatch: 'DATE_MISMATCH',
    missing_payment: 'MISSING_PAYMENT',
    missing_invoice: 'MISSING_INVOICE',
    duplicate: 'DUPLICATE_PAYMENT',
    multiple_candidates: 'MULTIPLE_CANDIDATES',
    low_confidence: 'LOW_CONFIDENCE',
  }
  if (result.exception_category && catMap[result.exception_category]) return catMap[result.exception_category]
  if (result.status === 'DUPLICATE') return 'DUPLICATE_PAYMENT'
  const rules: string[] = Array.isArray(result.rules_triggered) ? result.rules_triggered : []
  if (rules.includes('INVOICE_REF_FOUND')) return 'MATCH_EXACT_REFERENCE'
  if (result.status === 'MATCHED' || result.status === 'PARTIAL_MATCH') return 'MATCH_AMOUNT_DATE'
  if (result.status === 'UNRESOLVED') return 'LOW_CONFIDENCE'
  if (result.status === 'MISSING') return 'MISSING_PAYMENT'
  return rules[0] || null
}

export function ReasonCodeChip({ code, className }: { code?: string | null; className?: string }) {
  if (!code) return null
  const label = REASON_CODE_LABELS[code]
  return <span className={`badge badge-neutral font-mono ${className || ''}`} title={label || code}>{code}</span>
}

/* ------------------------------------------------------------------ */
/* Page primitives                                                    */
/* ------------------------------------------------------------------ */

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[22px] font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  )
}

export function MetricHint({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} className="inline-flex cursor-help text-slate-300 hover:text-slate-500 ml-1 align-middle">
      <Icon.Info size={13} />
    </span>
  )
}

export function EmptyState({ icon, title, message, action }: {
  icon?: ReactNode
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4 border border-slate-200">
        {icon || <Icon.Layers size={26} />}
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {message && <p className="text-sm text-slate-500 mt-1.5 max-w-md">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Modal({ onClose, children, labelledBy, wide }: {
  onClose: () => void
  children: ReactNode
  labelledBy?: string
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="fixed inset-0 bg-navy-950/60 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} animate-panel-in shadow-panel-lg max-h-[88vh] overflow-hidden flex flex-col`}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function ModalHeader({ title, subtitle, onClose, tone }: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
      <div>
        <h2 id="modal-title" className={`text-[15px] font-bold ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="btn-icon w-8 h-8">
        <Icon.X size={16} />
      </button>
    </div>
  )
}

export function InfoRow({ label, value, mono, className }: { label: string; value: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="eyebrow !tracking-normal">{label}</div>
      <div className={`text-sm font-medium text-slate-900 mt-0.5 break-words ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-brand-600' : 'bg-slate-300'
      }`}
      style={{ height: 22 }}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
      }`} />
    </button>
  )
}

export function StatTile({ label, value, sublabel, tone, className, hint }: {
  label: string
  value: ReactNode
  sublabel?: ReactNode
  tone?: 'ok' | 'warn' | 'danger' | 'info'
  className?: string
  hint?: string
}) {
  const toneCls = tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600'
    : tone === 'danger' ? 'text-red-600' : tone === 'info' ? 'text-brand-700' : 'text-slate-900'
  return (
    <div className={`card px-4 py-3.5 ${className || ''}`} title={hint}>
      <div className="eyebrow flex items-center gap-1">{label}{hint && <MetricHint text={hint} />}</div>
      <div className={`num text-[26px] font-bold leading-tight mt-1 ${toneCls}`}>{value}</div>
      {sublabel && <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sublabel}</div>}
    </div>
  )
}

export function InfoChip({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-panel">
      {icon && <span className="text-slate-400 flex">{icon}</span>}
      <div className="leading-tight">
        <div className="eyebrow !text-[10px]">{label}</div>
        <div className="text-xs font-semibold text-slate-800">{value}</div>
      </div>
    </div>
  )
}
