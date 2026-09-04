import type * as React from 'react'
import { useContext, useState, useEffect } from 'react'
import { AppContext } from '../App'
import { Icon, PageHeader, Toggle } from '../components/ui'
import type { AiStatus } from '../types'

interface Settings {
  auto_reconcile_threshold: number
  review_threshold: number
  date_tolerance_days: number
  amount_tolerance_percent: number
  enable_ai_matching: boolean
}

const DEFAULT_SETTINGS: Settings = {
  auto_reconcile_threshold: 0.95,
  review_threshold: 0.80,
  date_tolerance_days: 3,
  amount_tolerance_percent: 2.0,
  enable_ai_matching: true,
}

function SectionCard({ icon, title, subtitle, children, actions }: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">{icon}</span>
          <div>
            <h2 className="section-title">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">{subtitle}</p>
          </div>
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function Settings() {
  const { refreshData } = useContext(AppContext)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }))
    }).catch(console.error)
    fetch('/api/ai-status').then(r => r.json()).then(setAiStatus).catch(console.error)
  }, [])

  const handleSave = async () => {
    setLoading(true)
    try {
      const payload = { ...settings }
      if (payload.review_threshold >= payload.auto_reconcile_threshold) {
        payload.review_threshold = Math.max(0.01, payload.auto_reconcile_threshold - 0.01)
      }
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSettings(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 3500)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const autoPct = Math.round(settings.auto_reconcile_threshold * 100)
  const reviewPct = Math.round(settings.review_threshold * 100)
  const aiActive = settings.enable_ai_matching && aiStatus?.configured

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Configure reconciliation rules and matching behavior — applied on the next reconciliation run."
      />

      {/* ------- Reconciliation rules ------- */}
      <SectionCard
        icon={<Icon.Settings size={16} />}
        title="Reconciliation Rules"
        subtitle="Confidence thresholds decide whether a record is auto-resolved, sent to human review, or left unresolved."
      >
        {/* Decision band scale */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 mb-5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2">
            <span>Unresolved / exception</span>
            <span>Human review band</span>
            <span>Auto-reconcile</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden" role="img" aria-label="Decision bands">
            <span className="bg-slate-200" style={{ width: `${reviewPct}%` }} />
            <span className="bg-amber-300" style={{ width: `${Math.max(0, autoPct - reviewPct)}%` }} />
            <span className="bg-emerald-400" style={{ width: `${100 - autoPct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2">
            <span>0%</span>
            <span className="num">&lt; {reviewPct}% → unresolved</span>
            <span className="num">{reviewPct}–{autoPct - 1}% → human review</span>
            <span className="num text-emerald-700 font-semibold">≥ {autoPct}% → auto-reconcile</span>
            <span>100%</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Below the review threshold the agent never forces a match — the record stays unresolved and appears in the Exception Queue.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="auto-threshold" className="text-sm font-medium text-slate-700">Auto-Reconcile Threshold</label>
              <span className="num text-lg font-bold text-brand-700">{autoPct}%</span>
            </div>
            <p className="text-xs text-slate-400 mb-3 mt-0.5">Records with confidence at or above this value are reconciled automatically.</p>
            <input id="auto-threshold" type="range" min={0.5} max={1} step={0.01}
              value={settings.auto_reconcile_threshold}
              onChange={e => setSettings(s => ({ ...s, auto_reconcile_threshold: parseFloat(e.target.value) }))}
              className="w-full accent-brand-600" aria-label="Auto-reconcile threshold" />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>50%</span><span>100%</span></div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="review-threshold" className="text-sm font-medium text-slate-700">Human Review Threshold</label>
              <span className="num text-lg font-bold text-amber-600">{reviewPct}%</span>
            </div>
            <p className="text-xs text-slate-400 mb-3 mt-0.5">Between review and auto-reconcile thresholds, matches are flagged for review.</p>
            <input id="review-threshold" type="range"
              min={0.3} max={Math.max(0.31, settings.auto_reconcile_threshold - 0.01)} step={0.01}
              value={settings.review_threshold}
              onChange={e => setSettings(s => ({ ...s, review_threshold: parseFloat(e.target.value) }))}
              className="w-full accent-amber-500" aria-label="Human review threshold" />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>30%</span><span>{Math.max(0.31, settings.auto_reconcile_threshold - 0.01) * 100}%</span></div>
          </div>
        </div>
      </SectionCard>

      {/* ------- Matching parameters ------- */}
      <SectionCard
        icon={<Icon.Reconcile size={16} />}
        title="Matching Parameters"
        subtitle="Tolerances used by the deterministic rules to classify amount and date mismatches."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <label htmlFor="date-tol" className="text-sm font-medium text-slate-700">Date Tolerance</label>
            <div className="flex items-center gap-2.5 mt-2">
              <input id="date-tol" type="number" min={1} max={60} value={settings.date_tolerance_days}
                onChange={e => setSettings(s => ({ ...s, date_tolerance_days: parseInt(e.target.value) || 7 }))}
                className="input max-w-[140px] num" />
              <span className="text-sm text-slate-500">days</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Payment dates farther than this from the invoice date trigger a date-mismatch exception.</p>
          </div>
          <div>
            <label htmlFor="amt-tol" className="text-sm font-medium text-slate-700">Amount Tolerance</label>
            <div className="flex items-center gap-2.5 mt-2">
              <input id="amt-tol" type="number" min={0} max={50} step={0.5} value={settings.amount_tolerance_percent}
                onChange={e => setSettings(s => ({ ...s, amount_tolerance_percent: parseFloat(e.target.value) || 2 }))}
                className="input max-w-[140px] num" />
              <span className="text-sm text-slate-500">%</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Amount differences larger than this percentage trigger an amount-mismatch exception.</p>
          </div>
        </div>
      </SectionCard>

      {/* ------- AI matching ------- */}
      <SectionCard
        icon={<Icon.Activity size={16} />}
        title="AI Matching"
        subtitle="Ambiguous records are evaluated by the AI-assisted matching layer before a decision is made."
        actions={
          aiStatus?.configured
            ? <span className="badge badge-matched"><Icon.Check size={11} /> LLM connected</span>
            : <span className="badge badge-partial"><Icon.Info size={11} /> Deterministic fallback active</span>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${settings.enable_ai_matching ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                <Icon.Activity size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">Enable AI Matching</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {settings.enable_ai_matching
                    ? 'Ambiguous records are analyzed by the AI-assisted layer before review.'
                    : 'Disabled — ambiguous records are sent straight to human review.'}
                </p>
              </div>
            </div>
            <Toggle checked={settings.enable_ai_matching} onChange={v => setSettings(s => ({ ...s, enable_ai_matching: v }))} label="Enable AI matching" />
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              AI Configuration Status
            </div>
            <div className="p-4 space-y-3">
              {aiStatus ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className={`w-2 h-2 rounded-full ${aiStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className={aiStatus.configured ? 'text-emerald-700' : 'text-amber-700'}>
                      {aiStatus.configured
                        ? `LLM connected — AI-assisted matching active (${aiStatus.model})`
                        : 'AI-assisted matching unavailable — deterministic fallback active'}
                    </span>
                  </div>
                  {!aiStatus.configured && (
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Set <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">LLM_API_URL</code> and{' '}
                      <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">LLM_API_KEY</code> on the server to enable real LLM
                      reasoning. Without them the agent never claims an LLM made its decisions — the engine still runs, using deterministic rules.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <span className={`badge ${aiActive ? 'badge-matched' : settings.enable_ai_matching ? 'badge-partial' : 'badge-neutral'}`}>
                      AI-assisted matching: {aiActive ? 'Enabled' : settings.enable_ai_matching ? 'Fallback' : 'Disabled'}
                    </span>
                    <span className="badge badge-neutral">Deterministic matching: Enabled</span>
                    <span className="badge badge-neutral">Human review: Enabled</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">Checking configuration…</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Matching pipeline
            </div>
            <ol className="p-4 space-y-2 text-[13px] text-slate-600">
              {[
                ['Deterministic normalization', 'customer names, IDs, amounts, dates, descriptions'],
                ['Candidate generation', 'currency, amount, date and customer filters'],
                ['Deterministic matching', 'exact matches auto-resolved; clear mismatches flagged'],
                ['AI-assisted analysis', aiStatus?.configured ? 'LLM evaluates ambiguous records' : 'deterministic fallback evaluates ambiguous records (no LLM key)'],
                ['Confidence scoring', 'threshold-based decision (auto / review / unresolved)'],
                ['Human review', 'uncertain cases reach the Exception Queue'],
              ].map(([t, d], i) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[9px] font-bold shrink-0">{i + 1}</span>
                  <span><b className="text-slate-700">{t}:</b> {d}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </SectionCard>

      {/* ------- System information ------- */}
      <SectionCard
        icon={<Icon.Overview size={16} />}
        title="System Information"
        subtitle="Runtime details for the deployed instance."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          {[
            ['Version', '1.2.0'],
            ['Database', 'SQLite'],
            ['AI Mode', settings.enable_ai_matching ? (aiStatus?.configured ? `LLM (${aiStatus.model})` : 'Deterministic Fallback') : 'Rules Only'],
            ['Matching Engine', 'Hybrid (Rules + AI + Human)'],
            ['Three-Way Matching', 'Invoice → Payment → Bank'],
            ['Ground Truth', 'Hidden — evaluation only'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="eyebrow">{k}</div>
              <p className="text-sm font-medium text-slate-800 mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1 pb-4">
        <button onClick={handleSave} disabled={loading} className="btn-primary !px-6">
          {loading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Icon.Check size={15} />}
          {loading ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5"><Icon.Check size={14} /> Saved — applied on the next reconciliation run</span>}
      </div>
    </div>
  )
}
