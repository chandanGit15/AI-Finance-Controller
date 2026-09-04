import type * as React from 'react'
import { useContext, useState, useRef, useMemo } from 'react'
import { AppContext } from '../App'
import { formatINR } from '../format'
import { Icon, PageHeader, EmptyState } from '../components/ui'

const SUPPORTED = ['csv', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'webp']
const ACCEPT_ATTR = SUPPORTED.map(e => `.${e}`).join(',')
const SUPPORTED_LABEL = 'CSV, TXT, PDF, PNG, JPG, JPEG, WEBP'

const FILE_TYPE_META: Record<string, { label: string; cls: string }> = {
  CSV: { label: 'CSV', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  TXT: { label: 'TXT', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  PDF: { label: 'PDF', cls: 'bg-red-50 text-red-700 ring-red-200' },
  PNG: { label: 'PNG', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  JPG: { label: 'JPG', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  JPEG: { label: 'JPEG', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  WEBP: { label: 'WEBP', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  UNKNOWN: { label: 'FILE', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

const TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  bank_transaction: 'Bank Transaction',
  other: 'Other / Unknown',
}

interface ExtractedRecord {
  recordId: number
  uploadId: number
  fileName?: string
  recordType: string
  entityName?: string | null
  date?: string | null
  amount?: number | null
  currency?: string
  referenceId?: string | null
  invoiceId?: string | null
  paymentId?: string | null
  bankTransactionId?: string | null
  description?: string | null
  extractionMethod?: string
  extractionConfidence?: number | null
  validationStatus?: string
  warnings?: string[]
  foreignCurrency?: string | null
}

function UploadSection({ type, label, icon, onUpload }: { type: string; label: string; icon: React.ReactNode; onUpload: (type: string, file: File) => Promise<void> }) {
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await onUpload(type, file)
      setUploaded(true)
      setTimeout(() => setUploaded(false), 3000)
    } catch (err: any) {
      setError(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-slate-400">{icon}</span>
        <div>
          <h3 className="text-[13px] font-semibold text-slate-800">{label}</h3>
          <p className="text-[11px] text-slate-400">Per-table CSV upload</p>
        </div>
      </div>
      <div
        className="border border-dashed border-slate-300 rounded-md p-4 text-center hover:border-brand-400 transition-colors cursor-pointer bg-white"
        onClick={() => fileRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} aria-label={`Upload ${label} CSV`} />
        {uploading ? (
          <span className="inline-flex items-center gap-2 text-xs text-brand-600"><span className="w-3.5 h-3.5 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />Uploading…</span>
        ) : uploaded ? (
          <span className="text-xs text-emerald-600 font-medium">✓ Loaded into dataset</span>
        ) : error ? (
          <span className="text-xs text-red-600 font-medium">{error}</span>
        ) : (
          <span className="text-xs text-slate-400">Select .csv file</span>
        )}
      </div>
    </div>
  )
}

interface FileEntry {
  name: string
  fileType?: string
  fileSize?: number
  status: string
  message?: string
  recordCount?: number
  recordsValid?: number
  extractionConfidence?: number | null
  method?: string
  sourceType?: string
  pagesScanned?: number | null
  tablesDetected?: number | null
  tableDetail?: { label: string; rows: number; pages: number }[] | null
  recordsByType?: Record<string, number> | null
  duplicatesDetected?: number
}

interface ValidationSummary {
  uploaded: number
  processed: number
  requiresReview: number
  recordsExtracted: number
  validationErrors: number
  duplicatesDetected?: number
  recordsByType?: Record<string, number>
}

const PREVIEW_PAGE_SIZE = 25

export default function DataPage() {
  const { dataset, evaluation, loading, generateDemo, refreshData } = useContext(AppContext)
  const [generating, setGenerating] = useState(false)

  // Document ingestion state
  const [docType, setDocType] = useState('AUTO')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [ingesting, setIngesting] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedRecord[]>([])
  const [validation, setValidation] = useState<ValidationSummary | null>(null)
  const [acceptedIds, setAcceptedIds] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<ExtractedRecord> | null>(null)
  const [loadedMsg, setLoadedMsg] = useState('')
  const [loadError, setLoadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [previewPage, setPreviewPage] = useState(1)
  const [previewSearch, setPreviewSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasData = dataset?.hasDataset

  const handleUpload = async (type: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/upload/${type}`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!data.success) throw new Error(data.error)
    await refreshData()
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try { await generateDemo() } finally { setGenerating(false) }
  }

  const startIngest = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    setLoadError('')
    setLoadedMsg('')
    setValidation(null)
    setExtracted([])
    setAcceptedIds(new Set())
    setPreviewPage(1)
    setPreviewSearch('')

    const bad = arr.filter(f => !SUPPORTED.includes((f.name.split('.').pop() || '').toLowerCase()))
    if (bad.length) {
      setLoadError(`Unsupported file type. Please upload ${SUPPORTED_LABEL}. (${bad.map(f => f.name).join(', ')})`)
      return
    }
    if (!arr.length) return

    setFiles(arr.map(f => ({ name: f.name, fileSize: f.size, status: 'queued' })))
    setIngesting(true)
    setFiles(prev => prev.map(f => ({ ...f, status: f.status === 'queued' ? 'processing' : f.status })))

    const form = new FormData()
    arr.forEach(f => form.append('files', f))
    form.append('types', JSON.stringify(arr.map(() => docType)))

    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: form })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Processing failed')

      setValidation(data.summary)
      setFiles(data.files.map((f: any) => ({
        name: f.fileName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        status: f.status,
        message: f.status === 'error' ? f.message : undefined,
        recordCount: f.recordCount,
        recordsValid: f.recordsValid,
        extractionConfidence: f.extractionConfidence,
        method: f.method,
        sourceType: f.sourceType,
        pagesScanned: f.pagesScanned ?? null,
        tablesDetected: f.tablesDetected ?? null,
        tableDetail: f.tableDetail ?? null,
        recordsByType: f.recordsByType ?? null,
        duplicatesDetected: f.duplicatesDetected ?? 0,
      })))

      const recs: ExtractedRecord[] = (data.records || []).map((r: any) => {
        const upload = (data.files || []).find((f: any) => Number(f.uploadId) === Number(r.uploadId))
        return { ...r, fileName: upload?.fileName }
      })
      setExtracted(recs)
      // Valid records are pre-selected, but duplicates of existing dataset rows
      // stay unchecked — skipping one duplicate must not stop the rest.
      const autoAccepted = new Set<number>()
      for (const r of recs) {
        const dup = (r.warnings || []).some(w => /^Duplicate:/.test(w))
        if (r.validationStatus === 'valid' && !dup && !r.foreignCurrency && r.recordType !== 'other') autoAccepted.add(r.recordId)
      }
      setAcceptedIds(autoAccepted)
    } catch (err: any) {
      setLoadError(err?.message || 'Processing failed')
      setFiles(prev => prev.map(f => ({ ...f, status: 'error' })))
    } finally {
      setIngesting(false)
    }
  }

  const toggleAccept = (id: number) => {
    setAcceptedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const startEdit = (r: ExtractedRecord) => {
    setEditingId(r.recordId)
    setEditDraft({ entityName: r.entityName, date: r.date, amount: r.amount, recordType: r.recordType })
  }
  const saveEdit = () => {
    if (!editDraft) return
    setExtracted(prev => prev.map(r => r.recordId === editingId ? { ...r, ...editDraft, amount: editDraft.amount !== undefined ? Number(editDraft.amount) : r.amount } : r))
    setEditingId(null)
    setEditDraft(null)
  }

  const acceptedRecords = useMemo(
    () => extracted.filter(r => acceptedIds.has(r.recordId) && r.validationStatus !== 'error' && r.recordType !== 'other'),
    [extracted, acceptedIds]
  )

  const duplicateCount = useMemo(
    () => extracted.filter(r => (r.warnings || []).some(w => /^Duplicate:/.test(w))).length,
    [extracted]
  )

  const isNewValid = (r: ExtractedRecord) =>
    r.validationStatus === 'valid' && r.recordType !== 'other' && !(r.warnings || []).some(w => /^Duplicate:/.test(w))
  const newValidCount = useMemo(() => extracted.filter(isNewValid).length, [extracted])

  const filteredExtracted = useMemo(() => {
    const q = previewSearch.trim().toLowerCase()
    if (!q) return extracted
    return extracted.filter(r =>
      [r.invoiceId, r.paymentId, r.bankTransactionId, r.entityName, r.recordType, r.extractionMethod]
        .join(' ').toLowerCase().includes(q)
    )
  }, [extracted, previewSearch])
  const previewPageCount = Math.max(1, Math.ceil(filteredExtracted.length / PREVIEW_PAGE_SIZE))
  const curPage = Math.min(previewPage, previewPageCount)
  const pageItems = useMemo(() => filteredExtracted.slice((curPage - 1) * PREVIEW_PAGE_SIZE, curPage * PREVIEW_PAGE_SIZE), [filteredExtracted, curPage])

  const selectAllNew = () => {
    setAcceptedIds(prev => {
      const next = new Set(prev)
      for (const r of extracted) if (isNewValid(r)) next.add(r.recordId)
      return next
    })
  }

  const loadAccepted = async () => {
    if (!acceptedRecords.length) return
    setLoadError('')
    setLoadedMsg('')
    try {
      const res = await fetch('/api/ingest/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: acceptedRecords.map(r => ({
          recordId: r.recordId,
          recordType: r.recordType,
          entityName: r.entityName,
          date: r.date,
          amount: r.amount,
          currency: r.currency,
          invoiceId: r.invoiceId,
          paymentId: r.paymentId,
          bankTransactionId: r.bankTransactionId,
          description: r.description,
          referenceId: r.referenceId,
        })) }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Load failed')
      setLoadedMsg(`${data.loaded} record${data.loaded === 1 ? '' : 's'} loaded into the dataset. Run Reconciliation to process them.`)
      if (data.duplicates?.length) setLoadError(`Skipped duplicates already in dataset: ${data.duplicates.join(', ')}`)
      await refreshData()
    } catch (err: any) {
      setLoadError(err?.message || 'Load failed')
    }
  }

  const statusChip = (s?: string) => {
    if (s === 'valid') return <span className="badge badge-matched"><Icon.Check size={10} /> Valid</span>
    if (s === 'needs_review') return <span className="badge badge-partial">Requires review</span>
    if (s === 'error') return <span className="badge badge-exception">Error</span>
    return null
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Data Sources"
        subtitle="Import and manage the financial records used by the reconciliation agent."
      />

      {/* ============ Upload Financial Documents ============ */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="section-title">Upload Financial Documents</h2>
          <p className="text-xs text-slate-500 mt-0.5">Invoices · Payments · Bank Statements · Receipts — every file is extracted, normalized and validated before it can enter the reconciliation engine.</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              Supported formats: <b>{SUPPORTED_LABEL}</b> <span className="text-slate-400">· up to 20 MB each</span>
            </div>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="select w-60" aria-label="Document type override">
              <option value="AUTO">Auto-detect document type</option>
              <option value="INVOICE">Invoice</option>
              <option value="PAYMENT">Payment</option>
              <option value="BANK_STATEMENT">Bank Transaction / Statement</option>
              <option value="OTHER">Other</option>
            </select>
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" disabled={ingesting}>
              <Icon.File size={15} /> Choose Files
            </button>
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden"
              onChange={e => { if (e.target.files?.length) startIngest(e.target.files) }} />
          </div>

          {/* Dropzone */}
          <div
            className={`rounded-lg border-2 border-dashed p-9 text-center transition-colors ${dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-slate-300 hover:border-brand-400 bg-slate-50/40'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) startIngest(e.dataTransfer.files) }}
            role="button" aria-label="Drop financial documents here"
          >
            {ingesting ? (
              <div className="flex flex-col items-center gap-2 text-brand-600">
                <span className="w-7 h-7 border-[3px] border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                <p className="text-sm font-medium">Uploading · Extracting · Validating…</p>
                <p className="text-xs text-slate-400">OCR and text extraction run on the server</p>
              </div>
            ) : (
              <>
                <span className="mx-auto w-11 h-11 rounded-full bg-white border border-slate-200 text-slate-400 flex items-center justify-center mb-3">
                  <Icon.Upload size={20} />
                </span>
                <p className="text-sm font-medium text-slate-700">Drop financial documents here</p>
                <p className="text-xs text-slate-400 mt-1">or click “Choose Files” — multiple files allowed</p>
              </>
            )}
          </div>

          {loadError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 flex items-start gap-2.5" role="alert">
              <span className="mt-0.5"><Icon.Alert size={15} /></span>
              <span>{loadError}</span>
            </div>
          )}

          {/* Per-file statuses */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map(f => {
                const meta = FILE_TYPE_META[f.fileType || 'UNKNOWN'] || FILE_TYPE_META.UNKNOWN
                const size = f.fileSize != null ? (f.fileSize / 1024 / 1024).toFixed(1) : null
                return (
                  <div key={f.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2.5">
                    <span className={`w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center ${f.status === 'error' ? 'text-red-500' : f.status === 'processed' ? 'text-emerald-500' : 'text-slate-300'}`}>
                      {f.status === 'error' ? <Icon.X size={14} /> : f.status === 'processed' ? <Icon.Check size={14} /> : <Icon.File size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-slate-800 truncate">{f.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {size ? `${size} MB · ` : ''}
                        {f.sourceType || '—'} source{f.method ? ` · ${f.method}` : ''}
                      </p>
                      {f.status === 'processed' && f.recordCount != null && f.recordCount > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                          {f.method === 'PDF_TABLE' && f.pagesScanned != null && (
                            <span className="badge badge-neutral text-[10px]">{f.pagesScanned} page{f.pagesScanned === 1 ? '' : 's'} scanned · {f.tablesDetected ?? 0} table{f.tablesDetected === 1 ? '' : 's'}</span>
                          )}
                          {f.recordsByType && (
                            <span className="badge badge-info text-[10px]">
                              {(['invoice', 'payment', 'bank_transaction'] as const)
                                .map(t => `${f.recordsByType![t] || 0} ${t === 'invoice' ? 'inv' : t === 'payment' ? 'pay' : 'bank'}`)
                                .join(' · ')}
                            </span>
                          )}
                          {f.duplicatesDetected ? <span className="badge badge-partial text-[10px]"><Icon.Alert size={10} /> {f.duplicatesDetected} duplicate{f.duplicatesDetected === 1 ? '' : 's'} skipped</span> : null}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${meta.cls}`}>{meta.label}</span>
                    {f.status === 'processing' && <span className="badge badge-neutral"><span className="w-2.5 h-2.5 border border-slate-400 border-t-transparent rounded-full animate-spin mr-0.5" /> Processing</span>}
                    {f.status === 'processed' && (
                      <span className="badge badge-matched"><Icon.Check size={10} /> {f.recordCount ? `${f.recordCount} record${f.recordCount === 1 ? '' : 's'}` : 'Processed'}{f.recordsValid != null && f.recordCount ? ` · ${f.recordsValid} valid` : ''}{f.extractionConfidence != null ? ` · ${f.extractionConfidence}% conf` : ''}</span>
                    )}
                    {f.status === 'error' && <span className="badge badge-exception"><Icon.Alert size={10} /> {f.message || 'Failed'}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Validation summary */}
          {validation && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
                {[
                  { l: 'Uploaded', v: validation.uploaded, t: '' },
                  { l: 'Processed', v: validation.processed, t: 'text-emerald-600' },
                  { l: 'Records extracted', v: validation.recordsExtracted, t: 'text-brand-700' },
                  { l: 'Duplicates', v: validation.duplicatesDetected ?? 0, t: (validation.duplicatesDetected ?? 0) ? 'text-amber-600' : '' },
                  { l: 'Requires review', v: validation.requiresReview, t: validation.requiresReview ? 'text-amber-600' : '' },
                  { l: 'Validation errors', v: validation.validationErrors, t: validation.validationErrors ? 'text-red-600' : '' },
                ].map(s => (
                  <div key={s.l} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className={`num text-lg font-bold ${s.t || 'text-slate-800'}`}>{s.v}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{s.l}</div>
                  </div>
                ))}
              </div>
              {validation.recordsByType && (validation.recordsByType.invoice || validation.recordsByType.payment || validation.recordsByType.bank_transaction) ? (
                <p className="text-[11px] text-slate-500 mt-2">
                  Extracted: <b className="text-slate-700">{validation.recordsByType.invoice || 0} invoices</b> · <b className="text-slate-700">{validation.recordsByType.payment || 0} payments</b> · <b className="text-slate-700">{validation.recordsByType.bank_transaction || 0} bank transactions</b> — one record per row, no headers.
                </p>
              ) : null}
            </div>
          )}

          {/* Extracted preview */}
          {extracted.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">Review Extracted Data</p>
                  <p className="text-[11px] text-slate-500">Records stay in preview until accepted — they do not silently enter the engine. Page {curPage} of {previewPageCount}.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="badge badge-matched">{newValidCount} new valid</span>
                  {duplicateCount > 0 && <span className="badge badge-partial">{duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} skipped</span>}
                  <span className="badge badge-info">{acceptedRecords.length} accepted</span>
                </div>
              </div>
              <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-2 bg-slate-50/50">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Icon.Search size={14} /></span>
                  <input type="text" value={previewSearch} onChange={e => { setPreviewSearch(e.target.value); setPreviewPage(1) }}
                    placeholder="Search id, entity, type…" aria-label="Filter extracted records" className="input !pl-8 !py-1.5 w-64 text-xs" />
                </div>
                <button onClick={selectAllNew} className="btn-secondary btn-sm">Select all new valid</button>
                <button onClick={() => setAcceptedIds(new Set())} className="btn-secondary btn-sm">Clear</button>
                <span className="ml-auto text-[11px] text-slate-400">{filteredExtracted.length} of {extracted.length} shown</span>
              </div>
              <div className="p-3 space-y-2 max-h-[32rem] overflow-y-auto scrollbar-thin">
                {pageItems.map(r => {
                  const error = r.validationStatus === 'error'
                  return (
                    <div key={`${r.uploadId}-${r.recordId}`} className={`rounded-md border p-3 ${error ? 'border-red-200 bg-red-50/40' : acceptedIds.has(r.recordId) ? 'border-brand-200 bg-brand-50/30' : 'border-slate-200 bg-white'}`}>
                      <div className="flex flex-wrap items-start gap-3">
                        <input type="checkbox" checked={acceptedIds.has(r.recordId)} disabled={error} onChange={() => toggleAccept(r.recordId)}
                          className="mt-1 accent-brand-600" aria-label={`Accept record ${r.invoiceId || r.paymentId || r.bankTransactionId || r.recordId}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`badge ${r.recordType === 'invoice' ? 'badge-info' : r.recordType === 'payment' ? 'badge-matched' : r.recordType === 'bank_transaction' ? 'badge-missing' : 'badge-neutral'}`}>
                              {TYPE_LABELS[r.recordType] || r.recordType}
                            </span>
                            <span className="font-mono text-[13px] font-semibold text-slate-800">
                              {r.invoiceId || r.paymentId || r.bankTransactionId || (r.recordType === 'bank_transaction' ? 'Bank statement line' : '(no reference)')}
                            </span>
                            {statusChip(r.validationStatus)}
                            {r.foreignCurrency && <span className="badge badge-partial"><Icon.Alert size={10} /> Foreign currency: {r.foreignCurrency}</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>{r.entityName || '— entity'}</span>
                            <span className="text-slate-300">·</span>
                            <span>{r.date || '— date'}</span>
                            <span className="text-slate-300">·</span>
                            <span className="num">{r.amount != null ? formatINR(r.amount) : '— amount'}</span>
                            <span className="text-slate-300">·</span>
                            <span>{r.currency}</span>
                          </div>
                          {r.extractionConfidence != null && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              Extraction confidence: <b className="text-slate-600">{r.extractionConfidence}%</b>
                              <span className="text-slate-300"> · extraction confidence is separate from reconciliation confidence</span>
                            </p>
                          )}
                          {r.warnings && r.warnings.length > 0 && (
                            <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1"><Icon.Info size={11} /> {r.warnings.join(' · ')}</p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5">{r.fileName} · {r.extractionMethod}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {editingId === r.recordId ? (
                            <>
                              <button onClick={saveEdit} className="btn-primary btn-sm">Save</button>
                              <button onClick={() => { setEditingId(null); setEditDraft(null) }} className="btn-secondary btn-sm">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(r)} className="btn-secondary btn-sm">Edit</button>
                              <button onClick={() => toggleAccept(r.recordId)} disabled={error}
                                className={`btn-sm border rounded-md font-medium ${acceptedIds.has(r.recordId) ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                {acceptedIds.has(r.recordId) ? 'Reject' : 'Accept'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {editingId === r.recordId && editDraft && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-t border-slate-200 pt-3">
                          <select value={editDraft.recordType || r.recordType} onChange={e => setEditDraft(d => ({ ...d, recordType: e.target.value }))} className="input text-xs" aria-label="Record type">
                            <option value="invoice">Invoice</option>
                            <option value="payment">Payment</option>
                            <option value="bank_transaction">Bank Transaction</option>
                          </select>
                          <input className="input text-xs" placeholder="Entity / customer" aria-label="Entity" value={editDraft.entityName || ''} onChange={e => setEditDraft(d => ({ ...d, entityName: e.target.value }))} />
                          <input className="input text-xs" placeholder="Date (YYYY-MM-DD)" aria-label="Date" value={editDraft.date || ''} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} />
                          <input className="input text-xs num" type="number" placeholder="Amount (₹)" aria-label="Amount" value={editDraft.amount ?? ''} onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredExtracted.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-400">No records match “{previewSearch}”.</div>
                )}
              </div>
              {previewPageCount > 1 && (
                <div className="px-4 py-2 border-t border-slate-200 flex flex-wrap items-center gap-2 bg-white">
                  <button onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={curPage <= 1} className="btn-secondary btn-sm">‹ Prev</button>
                  <span className="text-xs text-slate-500 num">Page {curPage} of {previewPageCount}</span>
                  <button onClick={() => setPreviewPage(p => Math.min(previewPageCount, p + 1))} disabled={curPage >= previewPageCount} className="btn-secondary btn-sm">Next ›</button>
                  <span className="ml-auto text-[10px] text-slate-400">{PREVIEW_PAGE_SIZE} records per page</span>
                </div>
              )}
              <div className="px-4 py-3.5 border-t border-slate-200 flex flex-wrap items-center gap-3 bg-slate-50/60">
                <button onClick={loadAccepted} disabled={!acceptedRecords.length || ingesting} className="btn-primary">
                  <Icon.Database size={15} /> Load {acceptedRecords.length} accepted record{acceptedRecords.length === 1 ? '' : 's'} into dataset
                </button>
                <span className="text-[11px] text-slate-500">Duplicates are skipped by the loader — the other records load normally.</span>
                {loadedMsg && <span className="text-xs text-emerald-600 font-medium">✓ {loadedMsg}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============ Synthetic demo dataset ============ */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="section-title">Synthetic Demo Dataset</h2>
          <p className="text-xs text-slate-500 mt-0.5">Ground-truth dataset for testing the full reconciliation loop — clearly synthetic, INR only.</p>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl text-sm text-slate-600 leading-relaxed">
              <p>
                Generates <b className="text-slate-800">100 synthetic invoices</b> with realistic <b className="text-slate-800">Indian Rupee (₹)</b> amounts,
                fictitious Indian companies and known hidden ground truth. The batch deliberately includes name variations, date discrepancies,
                amount mismatches, duplicates and missing payments.
              </p>
              <p className="mt-1.5 text-xs text-slate-400">
                Ground truth is stored separately and used only for evaluation — the reconciliation engine never sees it.
              </p>
            </div>
            <button onClick={handleGenerate} disabled={generating || loading} className="btn-primary !py-2.5 px-5">
              {generating ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Icon.Refresh size={15} />}
              {generating ? 'Generating…' : 'Generate Demo Dataset'}
            </button>
          </div>

          {hasData && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2.5">
              {[
                { l: 'Invoices', v: dataset?.invoices?.length || 0 },
                { l: 'Payments', v: dataset?.payments?.length || 0 },
                { l: 'Bank transactions', v: dataset?.transactions?.length || 0 },
                { l: 'Ground truth', v: dataset?.groundTruthCount || 0 },
                { l: 'Currency', v: 'INR (₹)' },
              ].map(s => (
                <div key={s.l} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="num text-lg font-bold text-slate-800">{s.v}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{s.l}</div>
                </div>
              ))}
            </div>
          )}
          {!hasData && (
            <div className="mt-4 rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-400">
              No dataset loaded — generate one, upload documents, or load records from preview above.
            </div>
          )}
        </div>
      </div>

      {/* ============ Legacy per-table CSV upload ============ */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="section-title">Direct CSV Upload</h2>
          <p className="text-xs text-slate-500 mt-0.5">Per-source CSV upload for well-structured files (legacy format).</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <UploadSection type="invoices" label="Invoices" icon={<Icon.File size={17} />} onUpload={handleUpload} />
          <UploadSection type="payments" label="Payments" icon={<Icon.Activity size={17} />} onUpload={handleUpload} />
          <UploadSection type="transactions" label="Bank Transactions" icon={<Icon.Database size={17} />} onUpload={handleUpload} />
        </div>
      </div>

      {/* ============ CSV format reference ============ */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="section-title">Expected CSV Formats</h2>
          <p className="text-xs text-slate-500 mt-0.5">Column headers are auto-detected; these are the canonical layouts.</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <CsvExample title="invoices.csv" body={`invoice_id,customer,invoice_date,due_date,amount,currency,account_id\nINV-1001,Karnataka Supplies,2026-08-01,2026-08-31,125400.00,INR,ACC-001`} />
          <CsvExample title="payments.csv" body={`payment_id,customer,payment_date,amount,currency,description,account_id\nPAY-0001,KARNATAKA SUPPLIES,2026-08-03,125400.00,INR,NEFT PAYMENT KARNATAKA SUPPLIES INV1001,ACC-001`} />
          <CsvExample title="bank_transactions.csv" body={`transaction_id,transaction_date,amount,currency,description,account_id\nTX-3001,2026-08-03,125400.00,INR,NEFT INWARD KARNATAKA SUPPLIES INV1001,ACC-001`} />
        </div>
      </div>

      {/* ============ Current dataset outcomes ============ */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="section-title">Synthetic Batch Design</h2>
          <p className="text-xs text-slate-500 mt-0.5">The demo deliberately includes cases the agent must handle: name variations, date tolerance, amount mismatches, duplicates, missing and ambiguous records.</p>
        </div>
        <div className="p-5">
          {evaluation ? (
            <>
              <p className="text-xs text-slate-500 mb-3">Outcome of the most recent reconciliation across this dataset:</p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
                {[
                  { l: 'Matched', v: evaluation.matched, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
                  { l: 'Partial match', v: evaluation.partial_match, cls: 'border-amber-200 bg-amber-50 text-amber-700' },
                  { l: 'Exceptions', v: evaluation.exceptions, cls: 'border-red-200 bg-red-50 text-red-700' },
                  { l: 'Unresolved', v: evaluation.unresolved, cls: 'border-slate-300 bg-slate-100 text-slate-600' },
                  { l: 'Duplicates', v: evaluation.duplicates, cls: 'border-violet-200 bg-violet-50 text-violet-700' },
                  { l: 'Missing', v: evaluation.missing, cls: 'border-sky-200 bg-sky-50 text-sky-700' },
                ].map(s => (
                  <div key={s.l} className={`rounded-lg border p-3.5 ${s.cls}`}>
                    <div className="num text-2xl font-bold">{s.v}</div>
                    <div className="text-xs font-medium mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Run a reconciliation to see how the agent handles this dataset — cases include name variations, date tolerance,
              amount mismatches, duplicate payments, missing payments and ambiguous candidates.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CsvExample({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 overflow-hidden">
      <div className="px-3.5 py-2 border-b border-slate-200 bg-white flex items-center gap-2">
        <Icon.File size={13} className="text-slate-400" />
        <span className="text-xs font-mono font-medium text-slate-700">{title}</span>
      </div>
      <pre className="p-3.5 text-[11px] font-mono text-slate-600 overflow-x-auto scrollbar-thin leading-relaxed">{body}</pre>
    </div>
  )
}
