import type * as React from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext, useRef } from 'react'
import Dashboard from './pages/Dashboard'
import Reconciliation from './pages/Reconciliation'
import Exceptions from './pages/Exceptions'
import AuditLog from './pages/AuditLog'
import DataPage from './pages/DataPage'
import Settings from './pages/Settings'
import { Icon, STATUS_META, StatTile } from './components/ui'
import type { RunReport, AiStatus, ConsistencyCheck, RunStep } from './types'

/* ================================================================== */
/* Session (demo sign-in gate — no real authentication)               */
/* ================================================================== */

const SESSION_KEY = 'reconai.session'
interface Session { name: string; email: string; role: string; org: string; lastLogin: string }
const DEMO_USER: Session = {
  name: 'Chandan',
  email: 'chandan@reconai.demo',
  role: 'Finance Analyst',
  org: 'Demo Organization',
  lastLogin: new Date().toISOString(),
}
function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function LoginScreen({ onSignIn }: { onSignIn: (s: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const val = email.trim()
    if (!val || !/^\S+@\S+\.\S+$/.test(val)) {
      setError('Enter a valid work email address to continue.')
      return
    }
    if (!password) {
      setError('Enter your password to continue.')
      return
    }
    setError('')
    setBusy(true)
    // Demo gate: any credentials open the sandbox session.
    setTimeout(() => onSignIn({ ...DEMO_USER, email: val }), 350)
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Brand panel */}
      <div className="hidden lg:flex w-[46%] bg-navy-900 text-white flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }} aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <div className="text-lg font-bold tracking-tight">ReconAI</div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-navy-200">AI Finance Controller</div>
            </div>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[28px] leading-snug font-semibold tracking-tight">
            Intelligent reconciliation and financial operations.
          </h1>
          <p className="text-sm text-navy-100/90 mt-4 leading-relaxed">
            ReconAI closes finance-operations loops across invoices, payments and bank
            transactions — surfacing matches, exceptions and an auditable record of every decision.
          </p>
          <ul className="mt-8 space-y-3.5 text-sm text-navy-100">
            {[
              ['Confidence-scored matching', 'Deterministic rules plus AI-assisted analysis of ambiguous records.'],
              ['Audit-ready decision log', 'Every match, exception and human resolution is recorded.'],
              ['Operational metrics', 'Match rate, precision, recall, F1 and throughput from real results.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 text-brand-300"><Icon.Check size={15} /></span>
                <span><b className="font-semibold text-white">{t}</b><br /><span className="text-navy-200 text-[13px]">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-[11px] text-navy-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          Sandbox environment — synthetic demo data only. No production systems are connected.
        </div>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <BrandMark />
            <div>
              <div className="text-lg font-bold text-slate-900 tracking-tight">ReconAI</div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">AI Finance Controller</div>
            </div>
          </div>
          <div className="card p-7 shadow-panel-lg">
            <h2 className="text-lg font-bold text-slate-900">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in to the finance control platform.</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-email" className="label-form">Work Email</label>
                <input id="login-email" type="email" autoComplete="email" placeholder="you@organization.com"
                  value={email} onChange={e => setEmail(e.target.value)} className="input" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="label-form !mb-0">Password</label>
                  <button type="button" onClick={() => setError('Password reset is not available in this demo sandbox.')}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 mb-1.5">Forgot password?</button>
                </div>
                <input id="login-password" type="password" autoComplete="current-password" placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} className="input" />
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full !py-2.5">
                {busy ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Icon.Shield size={15} />}
                {busy ? 'Signing in…' : 'Sign In'}
              </button>

              <div className="relative text-center my-1">
                <span className="relative px-2 text-[11px] text-slate-400 bg-white">or</span>
                <span className="absolute inset-x-0 top-1/2 border-t border-slate-200 -z-0" aria-hidden />
              </div>

              <button type="button" onClick={() => onSignIn(DEMO_USER)}
                className="btn-secondary w-full !py-2.5 text-slate-700">
                <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
                  <path fill="#f25022" d="M1 1h10v10H1z" /><path fill="#7fba00" d="M12 1h10v10H12z" />
                  <path fill="#00a4ef" d="M1 12h10v10H1z" /><path fill="#ffb900" d="M12 12h10v10H12z" />
                </svg>
                Continue with Microsoft (SSO demo)
              </button>
            </form>

            <p className="text-[11px] text-slate-400 mt-5 leading-relaxed border-t border-slate-100 pt-4">
              Demo / Sandbox environment. ReconAI is a synthetic finance-operations demo — it is not
              connected to any bank, payment processor or production ledger.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <div className="rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-sm shrink-0"
      style={{ width: size, height: size, borderRadius: 10 }}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" />
        <path d="M8.8 12.2l2.3 2.3 4.1-4.4" />
      </svg>
    </div>
  )
}

/* ================================================================== */
/* App context                                                        */
/* ================================================================== */

interface AppState {
  dataset: any
  results: any[]
  evaluation: any
  exceptions: any[]
  resolvedExceptions: any[]
  auditLogs: any[]
  lastRun: any
  aiStatus: AiStatus | null
  consistency: ConsistencyCheck | null
  loading: boolean
  session: Session | null
  runPhase: 'running' | 'complete' | 'error' | null
  runSteps: RunStep[]
  refreshData: () => Promise<void>
  runReconciliation: () => Promise<void>
  generateDemo: () => Promise<void>
}

export const AppContext = createContext<AppState>({
  dataset: null, results: [], evaluation: null, exceptions: [], resolvedExceptions: [],
  auditLogs: [], lastRun: null, aiStatus: null, consistency: null, loading: false,
  session: null, runPhase: null, runSteps: [],
  refreshData: async () => {}, runReconciliation: async () => {}, generateDemo: async () => {},
})

/* ================================================================== */
/* Navigation                                                         */
/* ================================================================== */

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: <Icon.Overview size={17} />, end: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/reconciliation', label: 'Reconciliation', icon: <Icon.Reconcile size={17} /> },
      { path: '/exceptions', label: 'Exceptions', icon: <Icon.Alert size={17} />, badge: true },
      { path: '/audit', label: 'Audit Log', icon: <Icon.Audit size={17} /> },
    ],
  },
  {
    label: 'Data',
    items: [
      { path: '/data', label: 'Data Sources', icon: <Icon.Database size={17} /> },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { path: '/settings', label: 'Settings', icon: <Icon.Settings size={17} /> },
    ],
  },
]

function NavList({ onNavigate, mobile }: { onNavigate?: () => void; mobile?: boolean }) {
  const { exceptions, results } = useContext(AppContext)
  const queueCount = exceptions.length
  return (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy-200/60">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-navy-100 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-brand-300' : 'text-navy-200/80 group-hover:text-navy-100'}>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && queueCount > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand-500 text-white' : 'bg-navy-600 text-navy-100'}`}>
                        {queueCount}
                      </span>
                    )}
                    {!item.badge && isActive && <span className="w-1 h-1 rounded-full bg-brand-400" />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
      <div className="pt-2 px-1">
        <div className="text-[11px] leading-relaxed text-navy-200/60">
          <div className="flex items-center gap-1.5 text-navy-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            System Operational
          </div>
          <div className="mt-1">Environment: Demo / Sandbox</div>
          {results.length > 0 && <div className="mt-1">Engine v1.2.0</div>}
        </div>
      </div>
    </nav>
  )
}

/* ================================================================== */
/* Sidebar + Topbar                                                   */
/* ================================================================== */

function Sidebar({ session, onSignOut, mobileOpen, onCloseMobile }: {
  session: Session
  onSignOut: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const sidebar = (
    <div className="flex flex-col h-full bg-navy-900 text-white">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 shrink-0">
        <BrandMark size={36} />
        <div className="min-w-0">
          <div className="font-bold tracking-tight leading-none">ReconAI</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-navy-200 mt-1">AI Finance Controller</div>
        </div>
        <button onClick={onCloseMobile} aria-label="Close navigation" className="ml-auto lg:hidden text-navy-100 hover:bg-white/10 rounded-md p-1.5">
          <Icon.X size={18} />
        </button>
      </div>
      <NavList onNavigate={onCloseMobile} />
      <div className="shrink-0 border-t border-white/10 p-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold shrink-0">
            {session.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold truncate">{session.name}</div>
            <div className="text-[11px] text-navy-200 truncate">{session.role}</div>
          </div>
          <button onClick={onSignOut} title="Sign out" aria-label="Sign out" className="text-navy-200 hover:text-white hover:bg-white/10 rounded-md p-1.5">
            <Icon.LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-60 z-40">{sidebar}</aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-navy-950/60" onClick={onCloseMobile} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 bg-navy-900 animate-drawer-in">{sidebar}</aside>
        </div>
      )}
    </>
  )
}

function Topbar({ session, onSignOut, onOpenMobile, queueCount, auditLogs }: {
  session: Session
  onSignOut: () => void
  onOpenMobile: () => void
  queueCount: number
  auditLogs: any[]
}) {
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [orgOpen, setOrgOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const orgRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  const closeAll = () => { setNotifOpen(false); setUserOpen(false); setOrgOpen(false) }

  useEffect(() => { closeAll() }, [location.pathname])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (![notifRef, userRef, orgRef].some(r => r.current?.contains(t))) closeAll()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [])

  const ingestEvents = auditLogs.filter(l => l.action === 'DOCUMENT_PROCESSED').slice(0, 3)

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center gap-3 px-4 lg:px-6">
      <button onClick={onOpenMobile} aria-label="Open navigation" className="btn-icon lg:hidden">
        <Icon.Menu size={20} />
      </button>

      {/* Org selector */}
      <div className="relative" ref={orgRef}>
        <button
          onClick={() => { setOrgOpen(o => !o); setUserOpen(false); setNotifOpen(false) }}
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-slate-100 text-slate-700 font-medium"
          aria-haspopup="listbox" aria-expanded={orgOpen}
        >
          {session.org}
          <Icon.ChevronDown size={14} className="text-slate-400" />
        </button>
        {orgOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-64 card p-1.5 shadow-panel-lg z-40">
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Organizations</p>
            <div className="px-2.5 py-2 rounded-md bg-brand-50 border border-brand-100">
              <div className="text-sm font-semibold text-slate-800">{session.org}</div>
              <div className="text-[11px] text-slate-500">Current organization</div>
            </div>
          </div>
        )}
      </div>

      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        <Icon.Shield size={11} /> Sandbox
      </span>

      <div className="flex-1" />

      {/* System status */}
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 mr-1">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Operational
      </div>

      <div className="w-px h-6 bg-slate-200 hidden md:block" />

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => { setNotifOpen(o => !o); setUserOpen(false); setOrgOpen(false) }}
          aria-label={`Notifications${queueCount ? `, ${queueCount} items requiring review` : ''}`}
          className="btn-icon relative"
        >
          <Icon.Bell size={18} />
          {queueCount > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {queueCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-80 card shadow-panel-lg z-40 overflow-hidden animate-panel-in">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {queueCount > 0 ? (
                <button onClick={() => { closeAll(); navigate('/exceptions') }} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3">
                  <span className="mt-0.5 text-red-500"><Icon.Alert size={16} /></span>
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{queueCount} records require review</span>
                    <span className="block text-xs text-slate-500">Open the Exception Queue to investigate.</span>
                  </span>
                </button>
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500 flex gap-3">
                  <span className="text-emerald-500"><Icon.Check size={16} /></span>
                  Exception queue is clear — all flagged records resolved.
                </div>
              )}
              {ingestEvents.map((l, i) => {
                let ev: any = {}
                try { ev = JSON.parse(l.evidence_json || '{}') } catch { /* ignore */ }
                return (
                  <div key={i} className="px-4 py-3 border-t border-slate-50 flex gap-3 text-sm">
                    <span className="text-slate-400 mt-0.5"><Icon.File size={15} /></span>
                    <span className="min-w-0">
                      <span className="block text-slate-700 font-medium truncate">{ev.fileName || l.invoice_id}</span>
                      <span className="block text-xs text-slate-500">
                        {ev.recordsExtracted ?? 0} record{(ev.recordsExtracted ?? 0) === 1 ? '' : 's'} extracted · {l.method}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={userRef}>
        <button
          onClick={() => { setUserOpen(o => !o); setNotifOpen(false); setOrgOpen(false) }}
          aria-haspopup="menu" aria-expanded={userOpen}
          className="flex items-center gap-2.5 rounded-md p-1 pr-2 hover:bg-slate-100"
        >
          <span className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold">
            {session.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden sm:block text-left leading-tight">
            <span className="block text-[13px] font-semibold text-slate-800">{session.name}</span>
            <span className="block text-[11px] text-slate-500">{session.role}</span>
          </span>
          <Icon.ChevronDown size={14} className="text-slate-400 hidden sm:block" />
        </button>
        {userOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-72 card shadow-panel-lg z-40 overflow-hidden animate-panel-in">
            <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <div className="font-semibold text-slate-900">{session.name}</div>
              <div className="text-xs text-slate-500">{session.role} · {session.org}</div>
              <div className="text-[11px] text-slate-400 mt-1.5">
                Last login: {new Date(session.lastLogin).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            </div>
            <div className="py-1.5">
              <button onClick={() => { closeAll(); navigate('/settings') }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2.5">
                <Icon.Settings size={15} className="text-slate-400" /> Preferences
              </button>
              <button onClick={() => { closeAll(); onSignOut() }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                <Icon.LogOut size={15} /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

/* ================================================================== */
/* Run progress overlay                                               */
/* ================================================================== */

function RunProgressOverlay({ steps, phase, report, error, onClose }: {
  steps: RunStep[]
  phase: 'running' | 'complete' | 'error'
  report: RunReport | null
  error: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const ev = report?.evaluation
  return (
    <div className="fixed inset-0 z-[95] bg-navy-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="card w-full max-w-xl shadow-panel-lg overflow-hidden animate-panel-in max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
          {phase === 'running' ? (
            <span className="w-5 h-5 border-2 border-slate-300 border-t-brand-600 rounded-full animate-spin" />
          ) : phase === 'complete' ? (
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><Icon.Check size={14} /></span>
          ) : (
            <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><Icon.Alert size={14} /></span>
          )}
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">
              {phase === 'running' ? 'Reconciliation Agent' : phase === 'complete' ? 'Reconciliation Complete' : 'Reconciliation Failed'}
            </h3>
            <p className="text-xs text-slate-500">
              {phase === 'running' ? 'Executing the reconciliation workflow across loaded records…' : undefined}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-icon w-8 h-8 ml-auto"><Icon.X size={16} /></button>
        </div>

        <div className="px-6 py-4 overflow-y-auto scrollbar-thin flex-1">
          {phase === 'running' && (
            <ol className="space-y-2.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Icon.Check size={10} />
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800 block">{s.message}</span>
                    {s.detail && <span className="text-xs text-slate-500 block mt-0.5">{s.detail}</span>}
                  </span>
                </li>
              ))}
              {steps.length > 0 && (
                <li className="flex items-center gap-3 text-sm text-slate-400 pt-1 animate-pulse">
                  <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin shrink-0" />
                  Processing…
                </li>
              )}
            </ol>
          )}

          {phase === 'complete' && report && ev && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Records processed" value={report.totalProcessed} />
                <StatTile label="Matched" value={ev.matched} tone="ok" />
                <StatTile label="Requires review" value={ev.active_queue ?? ev.review_queue} tone="warn" />
                <StatTile label="Unresolved" value={ev.unresolved} />
                <StatTile label="Processing time" value={`${(report.processingTimeMs / 1000).toFixed(2)}s`} />
                <StatTile label="Throughput" value={`${report.throughput} rec/s`} />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>Match rate <b className="text-slate-900">{Math.round(ev.match_rate * 100)}%</b></span>
                <span>Precision <b className="text-slate-900">{Math.round(ev.precision * 100)}%</b></span>
                <span>Recall <b className="text-slate-900">{Math.round(ev.recall * 100)}%</b></span>
                <span>F1 <b className="text-slate-900">{Math.round(ev.f1 * 100)}%</b></span>
              </div>
              <div className="rounded-md border border-slate-200">
                <div className="px-4 py-2.5 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Agent workflow</div>
                <ol className="divide-y divide-slate-100">
                  {report.runLog.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 px-4 py-2 text-xs">
                      <span className="text-emerald-500 mt-0.5"><Icon.Check size={12} /></span>
                      <span className="text-slate-600">
                        <b className="text-slate-800 font-medium">{s.message}</b>
                        {s.detail && <span className="text-slate-400"> — {s.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div>
              <p className="text-sm text-slate-600">{error}</p>
            </div>
          )}
        </div>

        {phase !== 'running' && (
          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2.5">
            <button onClick={onClose} className="btn-secondary">Close</button>
            {phase === 'complete' && (
              <button onClick={() => { onClose(); navigate('/reconciliation') }} className="btn-primary">View Reconciliation Results</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ================================================================== */
/* App                                                                */
/* ================================================================== */

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession())
  const [mobileNav, setMobileNav] = useState(false)
  const [dataset, setDataset] = useState<any>(null)
  const [results, setResults] = useState<any[]>([])
  const [evaluation, setEvaluation] = useState<any>(null)
  const [exceptions, setExceptions] = useState<any[]>([])
  const [resolvedExceptions, setResolvedExceptions] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [lastRun, setLastRun] = useState<any>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [consistency, setConsistency] = useState<ConsistencyCheck | null>(null)
  const [loading, setLoading] = useState(false)
  const [runSteps, setRunSteps] = useState<RunStep[]>([])
  const [runPhase, setRunPhase] = useState<'running' | 'complete' | 'error' | null>(null)
  const [runReport, setRunReport] = useState<RunReport | null>(null)
  const [runError, setRunError] = useState('')

  const refreshData = async () => {
    try {
      const [dsRes, resultsRes, exceptionsRes, auditRes, aiRes, consistencyRes] = await Promise.all([
        fetch('/api/dataset').then(r => r.json()),
        fetch('/api/results').then(r => r.json()),
        fetch('/api/exceptions').then(r => r.json()),
        fetch('/api/audit').then(r => r.json()),
        fetch('/api/ai-status').then(r => r.json()),
        fetch('/api/consistency-check').then(r => r.json()),
      ])
      setDataset(dsRes)
      setResults(resultsRes.results || [])
      setEvaluation(resultsRes.evaluation || null)
      setLastRun(resultsRes.lastRun || null)
      setExceptions(exceptionsRes.exceptions || [])
      setResolvedExceptions(exceptionsRes.resolved || [])
      setAuditLogs(auditRes.logs || [])
      setAiStatus(aiRes)
      setConsistency(consistencyRes)
    } catch (err) {
      console.error('Failed to refresh data:', err)
    }
  }

  useEffect(() => { refreshData() }, [])

  const generateDemo = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/generate-demo', { method: 'POST' })
      const data = await res.json()
      if (data.success) await refreshData()
    } catch (err) {
      console.error('Failed to generate demo:', err)
    } finally {
      setLoading(false)
    }
  }

  const runReconciliation = async () => {
    if (runPhase === 'running') return // guard against double execution
    setRunSteps([])
    setRunReport(null)
    setRunError('')
    setRunPhase('running')
    try {
      const res = await fetch('/api/reconcile/stream', { method: 'POST' })
      if (!res.ok || !res.body) throw new Error('Failed to start reconciliation')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const consume = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let sep
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue
              let evt: any
              try { evt = JSON.parse(line.slice(6)) } catch { continue }
              if (evt.type === 'step') {
                setRunSteps(prev => [...prev, { message: evt.message, detail: evt.detail || null, ms: 0 }])
              } else if (evt.type === 'done') {
                setRunReport(evt.payload)
              } else if (evt.type === 'error') {
                throw new Error(evt.error || 'Reconciliation failed')
              }
            }
          }
        }
      }
      await consume()
      await refreshData()
      setRunPhase('complete')
    } catch (err: any) {
      setRunError(err?.message || 'Reconciliation failed')
      setRunPhase('error')
    }
  }

  if (!session) {
    return (
      <LoginScreen onSignIn={(s) => {
        localStorage.setItem(SESSION_KEY, JSON.stringify(s))
        setSession(s)
      }} />
    )
  }

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }

  return (
    <AppContext.Provider value={{ dataset, results, evaluation, exceptions, resolvedExceptions, auditLogs, lastRun, aiStatus, consistency, loading, session, runPhase, runSteps, refreshData, runReconciliation, generateDemo }}>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-100">
          <Sidebar session={session} onSignOut={signOut} mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)} />
          <div className="lg:pl-60 flex flex-col min-h-screen">
            <Topbar session={session} onSignOut={signOut} onOpenMobile={() => setMobileNav(true)} queueCount={exceptions.length} auditLogs={auditLogs} />
            <main className="flex-1 px-4 lg:px-7 py-6 max-w-[1440px] w-full mx-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/reconciliation" element={<Reconciliation />} />
                <Route path="/exceptions" element={<Exceptions />} />
                <Route path="/audit" element={<AuditLog />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
            <footer className="px-7 py-3 text-[11px] text-slate-400 border-t border-slate-200 bg-white/60 flex flex-wrap gap-x-4 gap-y-1">
              <span>ReconAI · AI Finance Controller</span>
              <span className="hidden sm:inline">Synthetic demo data — not connected to production systems</span>
              <span className="ml-auto">Engine v1.2.0 · Demo / Sandbox</span>
            </footer>
          </div>
        </div>
        {runPhase && (
          <RunProgressOverlay
            steps={runSteps}
            phase={runPhase}
            report={runReport}
            error={runError}
            onClose={() => setRunPhase(null)}
          />
        )}
      </BrowserRouter>
    </AppContext.Provider>
  )
}

export { STATUS_META }
