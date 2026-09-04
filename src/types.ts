export interface Invoice {
  invoice_id: string
  customer: string
  invoice_date: string
  due_date: string
  amount: number
  currency: string
  account_id: string
}

export interface Payment {
  payment_id: string
  customer: string
  payment_date: string
  amount: number
  currency: string
  description: string
  account_id: string
}

export interface BankTransaction {
  transaction_id: string
  transaction_date: string
  amount: number
  currency: string
  description: string
  account_id: string
}

export type MatchStatus = 'MATCHED' | 'PARTIAL_MATCH' | 'EXCEPTION' | 'UNRESOLVED' | 'DUPLICATE' | 'MISSING'
export type MatchType = 'DETERMINISTIC' | 'AI_ASSISTED' | 'THREE_WAY_DETERMINISTIC' | 'MANUAL' | 'PENDING'

export interface ReconciliationResult {
  invoice_id: string
  payment_id: string | null
  transaction_id: string | null
  status: MatchStatus
  confidence: number
  match_type: MatchType
  evidence: any
  reason: string | null
  candidate_ids?: string[]
  rules_triggered?: string[]
  exception_category?: string | null
  ai_used?: number
  ai_mode?: string | null
  resolved?: number
  resolution_action?: string | null
  resolution_note?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
}

export interface Evaluation {
  total_records: number
  matched: number
  partial_match: number
  exceptions: number
  unresolved: number
  duplicates: number
  missing: number
  review_queue: number
  active_queue: number
  resolved_queue_count: number
  match_rate: number
  precision: number
  recall: number
  f1: number
  false_positive_rate: number
  exception_rate: number
  accuracy: number
  true_matches: number
  predicted_matches: number
  correct_matches: number
  false_positives: number
  false_negatives: number
  correctly_flagged: number
  exact_match_count: number
  ai_assisted_count: number
  three_way_count: number
  deterministic_count: number
  manual_count: number
  processing_time_ms?: number
  throughput?: number
  run_at?: string
  ai_mode?: string
  exception_categories?: Record<string, number>
  breakdown: {
    exact: number
    ai_assisted: number
    three_way: number
    deterministic: number
    manual: number
    partial: number
    exceptions: number
    duplicates: number
    missing: number
    unresolved: number
  }
}

export interface AuditLogEntry {
  id: number
  timestamp: string
  invoice_id: string
  action: string
  candidate_ids: string
  rules_triggered: string
  ai_decision: string
  confidence: number
  evidence_json: string
  status: string
  method?: string
  ai_used?: number
  ai_mode?: string
  resolution_note?: string
}

export interface RunStep {
  message: string
  detail?: string | null
  ms: number
}

export interface RunReport {
  success: boolean
  totalProcessed: number
  processingTimeMs: number
  throughput: number
  runLog: RunStep[]
  evaluation: Evaluation
  settings: any
  ai: { configured: boolean; model: string; mode: string; label: string }
}

export interface AiStatus {
  configured: boolean
  model: string
  mode: string
  label: string
}

export interface ConsistencyCheck {
  ok: boolean
  checked: boolean
  errors: string[]
  warnings?: string[]
  metrics?: any
}