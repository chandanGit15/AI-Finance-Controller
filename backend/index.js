import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { initDatabase, getDb } from './database.js';
import { generateDemoDataset } from './services/dataGenerator.js';
import { normalizeDataset } from './services/normalizer.js';
import { findCandidates } from './services/candidateFinder.js';
import { runDeterministicMatching } from './services/deterministicMatcher.js';
import { runAIMatching, aiStatus } from './services/aiMatcher.js';
import { buildThreeWayMatches } from './services/threeWayMatcher.js';
import { evaluateResults } from './services/evaluator.js';
import { processFile, SUPPORTED_EXTENSIONS } from './services/ingestion.js';
import { parse } from 'csv-parse/sync';
import multer from 'multer';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });
const uploadDocs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 12 },
});
const ENGINE_VERSION = '1.1.0';

app.use(cors());
app.use(express.json());

// Initialize database
initDatabase();

const VALID_STATUSES = ['MATCHED', 'PARTIAL_MATCH', 'EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING'];

// ===== Helpers =====

function loadSettings(db) {
  const settings = {
    auto_reconcile_threshold: 0.95,
    review_threshold: 0.80,
    date_tolerance_days: 3,
    amount_tolerance_percent: 2.0,
    enable_ai_matching: true,
  };
  const rows = db.prepare('SELECT key, value FROM config').all();
  for (const row of rows) {
    try { settings[row.key] = JSON.parse(row.value); }
    catch { settings[row.key] = row.value; }
  }
  // Guard: review threshold must stay below auto threshold
  if (settings.review_threshold >= settings.auto_reconcile_threshold) {
    settings.review_threshold = Math.max(0.01, settings.auto_reconcile_threshold - 0.01);
  }
  return settings;
}

// Runs the full reconciliation pipeline, emitting a step log as it goes.
// onStep(message, detail) is called for every completed stage with real data.
async function performReconciliation(db, onStep) {
  const startedAt = Date.now();
  const runLog = [];
  const step = (message, detail) => {
    runLog.push({ message, detail, ms: Date.now() - startedAt });
    if (onStep) onStep(message, detail);
  };

  // 1. Load data
  const invoices = db.prepare('SELECT * FROM invoices ORDER BY invoice_id').all();
  const payments = db.prepare('SELECT * FROM payments ORDER BY payment_id').all();
  const transactions = db.prepare('SELECT * FROM bank_transactions ORDER BY transaction_id').all();
  const groundTruth = db.prepare('SELECT * FROM ground_truth').all();
  step('Loaded data', `Loaded ${invoices.length} invoices, ${payments.length} payments, ${transactions.length} bank transactions`);

  if (invoices.length === 0) {
    throw new Error('No data to reconcile. Generate or upload data first.');
  }

  const settings = loadSettings(db);
  const ai = aiStatus();

  // 2. Normalize
  step('Normalized records', `Normalized ${invoices.length + payments.length + transactions.length} records (names, IDs, amounts, dates, descriptions)`);
  const normalized = normalizeDataset(invoices, payments, transactions);

  // 3. Candidates
  const candidates = findCandidates(normalized.invoices, normalized.payments, normalized.transactions);
  const candidatePairs = Object.values(candidates.invoiceToPaymentCandidates).reduce((a, c) => a + c.length, 0);
  step('Generated candidate matches', `${candidatePairs} candidate pairs across ${invoices.length} invoices (currency / amount / date / customer filters)`);

  // 4. Deterministic matching
  const deterministicResults = runDeterministicMatching(normalized.invoices, normalized.payments, normalized.transactions, candidates, settings);
  const pendingCount = deterministicResults.filter(r => r.status === 'PENDING_AI').length;
  const deterministicClassified = deterministicResults.length - pendingCount;
  step('Applied deterministic matching rules', `${deterministicClassified} records classified by rules, ${pendingCount} ambiguous cases passed to AI stage`);

  // 5. AI matching
  const unresolvedForAI = deterministicResults.filter(r => r.status === 'PENDING_AI');
  let aiResults = [];
  if (unresolvedForAI.length > 0) {
    aiResults = await runAIMatching(unresolvedForAI, normalized.invoices, normalized.payments, normalized.transactions, candidates, settings);
    step(
      'Applied AI-assisted matching',
      settings.enable_ai_matching
        ? `${aiResults.length} ambiguous records analyzed via ${ai.mode === 'LLM' ? `LLM (${ai.model})` : 'deterministic fallback (no LLM key configured)'}`
        : `AI matching disabled in settings — ${aiResults.length} records flagged for human review`
    );
  } else {
    step('Applied AI-assisted matching', 'No ambiguous records required AI analysis');
  }

  // 6. Merge + three-way reconciliation
  const allResults = deterministicResults.map(r => {
    if (r.status === 'PENDING_AI') {
      const aiResult = aiResults.find(a => a.invoice_id === r.invoice_id);
      if (aiResult) return aiResult;
      return {
        ...r,
        status: 'UNRESOLVED',
        confidence: 0.2,
        match_type: 'DETERMINISTIC',
        reason: 'No AI decision available',
        exception_category: 'low_confidence',
      };
    }
    return r;
  });

  const threeWayResults = buildThreeWayMatches(allResults, normalized.payments, normalized.transactions);
  const threeWayCount = threeWayResults.filter(r => r.status === 'MATCHED' && r.transaction_id).length;
  step('Built three-way reconciliation', `Invoice → Payment → Bank Transaction links confirmed for ${threeWayCount} records`);

  const matchedCount = threeWayResults.filter(r => r.status === 'MATCHED').length;
  const meanConfidence = threeWayResults.reduce((a, r) => a + (r.confidence || 0), 0) / (threeWayResults.length || 1);
  step('Calculated confidence scores', `Confidence scored for all ${threeWayResults.length} records (mean ${(meanConfidence * 100).toFixed(1)}%) — auto-reconcile at ≥${(settings.auto_reconcile_threshold * 100).toFixed(0)}%, review at ≥${(settings.review_threshold * 100).toFixed(0)}%`);

  // 7. Evaluate against ground truth
  const evaluation = evaluateResults(threeWayResults, groundTruth);
  step('Evaluated against ground truth', `Accuracy ${(evaluation.accuracy * 100).toFixed(1)}%, Precision ${(evaluation.precision * 100).toFixed(1)}%, Recall ${(evaluation.recall * 100).toFixed(1)}%, F1 ${(evaluation.f1 * 100).toFixed(1)}%`);

  // 8. Persist results + audit
  // Remove only prior reconciliation DECISION rows (their `action` stores the status).
  // Keep ingestion events (DOCUMENT_PROCESSED / RECORDS_LOADED) and manual-resolution
  // history so the audit trail stays complete across runs.
  db.exec("DELETE FROM reconciliation_results; DELETE FROM audit_log WHERE action IN ('MATCHED', 'PARTIAL_MATCH', 'EXCEPTION', 'DUPLICATE', 'MISSING', 'UNRESOLVED');");
  const insertResult = db.prepare(`INSERT INTO reconciliation_results 
    (invoice_id, payment_id, transaction_id, status, confidence, match_type, evidence_json, reason, processing_time_ms, exception_category, ai_used, ai_mode, candidate_ids, rules_triggered)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const insertAudit = db.prepare(`INSERT INTO audit_log 
    (timestamp, invoice_id, action, candidate_ids, rules_triggered, ai_decision, confidence, evidence_json, status, method, ai_used, ai_mode, exception_category, reason_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const now = new Date().toISOString();
  for (const result of threeWayResults) {
    const method = result.match_type === 'AI_ASSISTED' ? 'AI_ASSISTED'
      : result.match_type === 'THREE_WAY_DETERMINISTIC' ? 'DETERMINISTIC_THREE_WAY'
      : result.status === 'PENDING_AI' || result.match_type === 'PENDING' ? 'DETERMINISTIC'
      : result.match_type || 'DETERMINISTIC';
    insertResult.run(
      result.invoice_id,
      result.payment_id || null,
      result.transaction_id || null,
      result.status,
      result.confidence,
      result.match_type,
      JSON.stringify(result.evidence),
      result.reason || null,
      result.processing_time_ms || 0,
      result.exception_category || null,
      result.ai_used || 0,
      result.ai_mode || null,
      JSON.stringify(result.candidate_ids || []),
      JSON.stringify(result.rules_triggered || [])
    );

    insertAudit.run(
      now,
      result.invoice_id,
      result.status,
      JSON.stringify(result.candidate_ids || []),
      JSON.stringify(result.rules_triggered || []),
      result.ai_used ? 'AI_MATCH' : 'DETERMINISTIC',
      result.confidence,
      JSON.stringify(result.evidence),
      result.status,
      method,
      result.ai_used || 0,
      result.ai_mode || null,
      result.exception_category || null,
      reasonCodeOf(result)
    );
  }
  step('Wrote audit records', `${threeWayResults.length} audit entries written — every decision traceable`);

  // 9. Final report
  const totalTime = Date.now() - startedAt;
  const throughput = totalTime > 0 ? threeWayResults.length / (totalTime / 1000) : 0;
  const report = {
    success: true,
    results: threeWayResults,
    evaluation: { ...evaluation, processing_time_ms: totalTime, throughput: round2(throughput), run_at: now, ai_mode: ai.mode },
    totalProcessed: threeWayResults.length,
    runLog,
    processingTimeMs: totalTime,
    throughput: round2(throughput),
    settings,
    ai: aiStatus(),
  };

  // Persist run stats
  db.prepare(`INSERT INTO reconciliation_runs 
    (run_at, processing_time_ms, total_processed, matched, partial_match, review_queue, unresolved, precision, recall, f1, accuracy, throughput, ai_mode, engine_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      now,
      totalTime,
      threeWayResults.length,
      evaluation.matched,
      evaluation.partial_match,
      evaluation.review_queue,
      evaluation.unresolved,
      evaluation.precision,
      evaluation.recall,
      evaluation.f1,
      evaluation.accuracy,
      round2(throughput),
      ai.mode,
      ENGINE_VERSION
    );

  step('Generated report', `${threeWayResults.length} records processed in ${(totalTime / 1000).toFixed(1)}s — ${round2(throughput)} records/sec`);
  return report;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---- Canonical decision semantics -----------------------------------
// STATUS (what happened to the record): MATCHED / PARTIAL_MATCH /
// EXCEPTION / DUPLICATE / MISSING / UNRESOLVED
// REVIEW STATE (who decided): AUTO_RESOLVED / AWAITING_REVIEW /
// MANUALLY_RESOLVED  — orthogonal to status, never double counted.

const REVIEW_FLAGGED = new Set(['EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING']);
const CATEGORY_REASON_CODES = {
  amount_mismatch: 'AMOUNT_MISMATCH',
  date_mismatch: 'DATE_MISMATCH',
  missing_payment: 'MISSING_PAYMENT',
  missing_invoice: 'MISSING_INVOICE',
  duplicate: 'DUPLICATE_PAYMENT',
  multiple_candidates: 'MULTIPLE_CANDIDATES',
  low_confidence: 'LOW_CONFIDENCE',
};

function reviewStateOf(r) {
  if (r.resolved === 1) return 'MANUALLY_RESOLVED';
  return REVIEW_FLAGGED.has(r.status) ? 'AWAITING_REVIEW' : 'AUTO_RESOLVED';
}

function reasonCodeOf(r) {
  const cat = r.exception_category;
  if (cat && CATEGORY_REASON_CODES[cat]) return CATEGORY_REASON_CODES[cat];
  if (r.status === 'DUPLICATE') return 'DUPLICATE_PAYMENT';
  let rules = r.rules_triggered;
  if (typeof rules === 'string') { try { rules = JSON.parse(rules || '[]'); } catch { rules = []; } }
  if (Array.isArray(rules) && rules.includes('INVOICE_REF_FOUND')) return 'MATCH_EXACT_REFERENCE';
  if (r.status === 'MATCHED' || r.status === 'PARTIAL_MATCH') {
    if (Array.isArray(rules) && (rules.includes('EXACT_AMOUNT') || rules.includes('AMOUNT_MATCH'))) return 'MATCH_AMOUNT_DATE';
    return 'MATCH_EXACT_REFERENCE';
  }
  if (r.status === 'UNRESOLVED') return 'LOW_CONFIDENCE';
  if (r.status === 'MISSING') return 'MISSING_PAYMENT';
  if (Array.isArray(rules) && rules.length) return rules[0];
  return null;
}

// Normalize a DB result row into the API shape used by the frontend
// (DB stores evidence/candidates/rules as JSON strings)
function mapResultRow(r) {
  let evidence = r.evidence_json;
  try { evidence = JSON.parse(evidence); } catch { /* keep raw */ }
  let candidateIds = r.candidate_ids;
  try { candidateIds = JSON.parse(candidateIds || '[]'); } catch { candidateIds = []; }
  let rules = r.rules_triggered;
  try { rules = JSON.parse(rules || '[]'); } catch { rules = []; }
  return { ...r, evidence, candidate_ids: candidateIds, rules_triggered: rules, review_state: reviewStateOf(r), reason_code: reasonCodeOf({ ...r, rules_triggered: rules }) };
}

// ===== API Routes =====

// Get current dataset
// ===== Document ingestion =====

// Current source IDs (for duplicate detection during ingestion)
function currentExistingIds(db) {
  const ids = {};
  for (const row of db.prepare('SELECT invoice_id FROM invoices').all()) ids[row.invoice_id] = 1;
  for (const row of db.prepare('SELECT payment_id FROM payments').all()) ids[row.payment_id] = 1;
  for (const row of db.prepare('SELECT transaction_id FROM bank_transactions').all()) ids[row.transaction_id] = 1;
  return ids;
}

// Ingest uploaded financial documents (CSV/TXT/PDF/images)
app.post('/api/ingest', uploadDocs.array('files', 12), async (req, res) => {
  try {
    const db = getDb();
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No files received' });

    let typesRaw = req.body.types || '[]';
    if (typeof typesRaw === 'string') {
      try { typesRaw = JSON.parse(typesRaw); } catch { typesRaw = []; }
    }
    const existingIds = currentExistingIds(db);
    const insertUpload = db.prepare(`INSERT INTO document_uploads
      (original_name, file_name, file_size, file_type, source_type, extraction_method, extraction_confidence, status, message, foreign_currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertRecord = db.prepare(`INSERT INTO extracted_records
      (upload_id, record_type, entity_name, doc_date, amount, currency, reference_id, invoice_id, payment_id, bank_transaction_id, description, extraction_method, extraction_confidence, validation_status, warnings_json, foreign_currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertAuditDoc = db.prepare(`INSERT INTO audit_log
      (timestamp, invoice_id, action, candidate_ids, rules_triggered, ai_decision, confidence, evidence_json, status, method, ai_used, ai_mode, resolution_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const results = [];
    let allRecords = [];
    const summary = { uploaded: files.length, processed: 0, requiresReview: 0, recordsExtracted: 0, validationErrors: 0, duplicatesDetected: 0, recordsByType: { invoice: 0, payment: 0, bank_transaction: 0, other: 0 } };
    const addByType = (byType) => {
      for (const k of Object.keys(summary.recordsByType)) summary.recordsByType[k] += (byType && byType[k]) || 0;
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const override = (typesRaw[i] && String(typesRaw[i]) !== 'AUTO') ? String(typesRaw[i]).toUpperCase() : 'AUTO';
      let processed;
      try {
        const out = await processFile({
          buffer: file.buffer,
          originalName: file.originalname,
          mime: file.mimetype,
          docTypeOverride: override,
          existingIds,
        });
        if (out.error) {
          processed = {
            fileName: file.originalname,
            fileType: out.fileType || 'UNKNOWN',
            fileSize: file.size,
            status: 'error',
            message: out.error,
            method: out.method || null,
          };
          insertUpload.run(file.originalname, out.fileName || file.originalname, file.size, processed.fileType, out.sourceType || null, processed.method, null, 'error', out.error, null);
        } else {
          const uploadInfo = insertUpload.run(
            file.originalname,
            out.fileName,
            file.size,
            out.fileType,
            out.sourceType,
            out.method,
            out.extractionConfidence,
            'processed',
            out.message,
            out.foreignCurrency
          );
          const uploadId = uploadInfo.lastInsertRowid;
          const stored = out.records.map((r) => {
            const info = insertRecord.run(
              uploadId, r.recordType, r.entityName, r.date, r.amount, r.currency, r.referenceId,
              r.invoiceId, r.paymentId, r.bankTransactionId, r.description, r.extractionMethod,
              r.extractionConfidence, r.validationStatus, JSON.stringify(r.warnings || []), r.foreignCurrency
            );
            return { ...r, recordId: Number(info.lastInsertRowid), uploadId: Number(uploadId) };
          });
          const errors = stored.filter(r => r.validationStatus === 'error').length;
          const review = stored.filter(r => r.validationStatus !== 'valid').length;
          const dupCount = stored.filter(r => (r.warnings || []).some(w => /^Duplicate:/.test(w))).length;
          summary.processed++;
          summary.recordsExtracted += stored.length;
          summary.requiresReview += review;
          summary.validationErrors += errors;
          summary.duplicatesDetected += dupCount;
          addByType(out.recordsByType);

          processed = {
            fileName: out.fileName,
            fileType: out.fileType,
            fileSize: file.size,
            status: 'processed',
            message: out.message,
            method: out.method,
            sourceType: out.sourceType,
            extractionConfidence: out.extractionConfidence,
            foreignCurrency: out.foreignCurrency,
            uploadId: Number(uploadId),
            recordCount: stored.length,
            pagesScanned: out.pagesScanned ?? null,
            tablesDetected: out.tablesDetected ?? null,
            tableDetail: out.tableDetail ?? null,
            recordsByType: out.recordsByType ?? null,
            duplicatesDetected: dupCount,
            recordsValid: stored.filter(r => r.validationStatus === 'valid').length,
          };
          allRecords = allRecords.concat(stored);

          // Audit the ingestion event (requirement: file ingestion in the audit log)
          const ref = stored.find(r => r.invoiceId || r.paymentId || r.bankTransactionId);
          insertAuditDoc.run(
            new Date().toISOString(),
            ref ? (ref.invoiceId || ref.paymentId || ref.bankTransactionId) : out.fileName,
            'DOCUMENT_PROCESSED',
            JSON.stringify(stored.slice(0, 20).map(r => r.invoiceId || r.paymentId || r.bankTransactionId || `rec-${r.recordId}`)),
            JSON.stringify(['FILE_TYPE_DETECTION', 'EXTRACTION', 'NORMALIZATION', 'VALIDATION']),
            'INGESTION',
            out.extractionConfidence || null,
            JSON.stringify({ fileName: out.fileName, method: out.method, sourceType: out.sourceType, recordsExtracted: stored.length, extractionConfidence: out.extractionConfidence, foreignCurrency: out.foreignCurrency || null, pagesScanned: out.pagesScanned ?? null, tablesDetected: out.tablesDetected ?? null, recordsByType: out.recordsByType ?? null, duplicatesDetected: dupCount }),
            stored.length > 0 ? 'PROCESSED' : 'NO_RECORDS',
            out.method,
            0,
            null,
            out.message
          );
        }
      } catch (err) {
        processed = {
          fileName: file.originalname,
          fileType: 'UNKNOWN',
          fileSize: file.size,
          status: 'error',
          message: err.message || 'Processing failed',
        };
        insertUpload.run(file.originalname, sanitizeForDb(file.originalname), file.size, 'UNKNOWN', null, null, null, 'error', processed.message, null);
      }
      results.push(processed);
    }

    res.json({ success: true, summary, files: results, records: allRecords });
  } catch (err) {
    console.error('Ingestion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Previous uploads + their extracted records
app.get('/api/ingest/files', (req, res) => {
  const db = getDb();
  const uploads = db.prepare('SELECT * FROM document_uploads ORDER BY id DESC LIMIT 20').all();
  const records = db.prepare('SELECT * FROM extracted_records ORDER BY id DESC LIMIT 200').all();
  res.json({ uploads, records });
});

// Accept extracted records into the source tables used by the reconciliation engine
app.post('/api/ingest/accept', (req, res) => {
  try {
    const db = getDb();
    const items = Array.isArray(req.body.records) ? req.body.records : [];
    if (!items.length) return res.status(400).json({ error: 'No records to load' });

    const invoices = db.prepare('SELECT invoice_id FROM invoices').all().map(r => r.invoice_id);
    const payments = db.prepare('SELECT payment_id FROM payments').all().map(r => r.payment_id);
    const transactions = db.prepare('SELECT transaction_id FROM bank_transactions').all().map(r => r.transaction_id);

    const insertInvoice = db.prepare('INSERT OR IGNORE INTO invoices (invoice_id, customer, invoice_date, due_date, amount, currency, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertPayment = db.prepare('INSERT OR IGNORE INTO payments (payment_id, customer, payment_date, amount, currency, description, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertTx = db.prepare('INSERT OR IGNORE INTO bank_transactions (transaction_id, transaction_date, amount, currency, description, account_id) VALUES (?, ?, ?, ?, ?, ?)');

    let loaded = 0;
    const duplicates = [];
    const counts = { invoices: 0, payments: 0, bank_transactions: 0, other: 0 };
    const loadDate = new Date().toISOString();

    for (const item of items) {
      const recordId = Number(item.recordId);
      const type = item.recordType;
      const entity = (item.entityName || '').trim() || 'Unnamed customer';
      const date = item.date || null;
      const amount = Number(item.amount);
      const currency = String(item.currency || 'INR').toUpperCase();
      const description = item.description || item.entityName || '';

      if (!isFinite(amount) || !type) continue;

      if (type === 'invoice') {
        let invId = (item.invoiceId || '').trim();
        if (!invId) invId = nextSourceId(db, invoices, 'INV', 'invoices', 'invoice_id', 'INV-');
        invoices.push(invId);
        const prev = insertInvoice.run(invId, entity, date, date, amount, currency, 'INGESTED');
        if (prev.changes) { loaded++; counts.invoices++; } else duplicates.push(invId);
      } else if (type === 'payment') {
        let payId = (item.paymentId || '').trim();
        if (!payId) payId = nextSourceId(db, payments, 'PAY', 'payments', 'payment_id', 'PAY-');
        payments.push(payId);
        const desc = (item.description || '') || `Payment ${payId}`;
        const prev = insertPayment.run(payId, entity, date, amount, currency, desc, 'INGESTED');
        if (prev.changes) { loaded++; counts.payments++; } else duplicates.push(payId);
      } else if (type === 'bank_transaction') {
        let txId = (item.bankTransactionId || '').trim();
        if (!txId) txId = nextSourceId(db, transactions, 'TX', 'bank_transactions', 'transaction_id', 'TX-');
        transactions.push(txId);
        const desc = (item.description || '') || (item.referenceId || `Bank transaction ${txId}`);
        const prev = insertTx.run(txId, date, amount, currency, desc, 'INGESTED');
        if (prev.changes) { loaded++; counts.bank_transactions++; } else duplicates.push(txId);
      } else {
        counts.other++;
        continue;
      }

      if (recordId && isFinite(recordId)) {
        db.prepare('UPDATE extracted_records SET accepted = 1, loaded_at = ? WHERE id = ?').run(loadDate, recordId);
      }
    }

    if (loaded > 0) {
      db.prepare(`INSERT INTO audit_log
        (timestamp, invoice_id, action, candidate_ids, rules_triggered, ai_decision, confidence, evidence_json, status, method, ai_used, ai_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(loadDate, null, 'RECORDS_LOADED', JSON.stringify(items.slice(0, 50).map(r => r.invoiceId || r.paymentId || r.bankTransactionId || `rec-${r.recordId}`)),
          JSON.stringify(['INGESTION_ACCEPT']), 'INGESTION', null,
          JSON.stringify({ recordsLoaded: loaded, counts }), 'LOADED', 'INGESTION', 0, null);
    }

    res.json({ success: true, loaded, duplicates, counts });
  } catch (err) {
    console.error('Accept error:', err);
    res.status(500).json({ error: err.message });
  }
});

function nextSourceId(db, existingList, prefix, table, col, idPrefix) {
  let maxNum = 0;
  for (const id of existingList) {
    const m = /(\d+)$/.exec(id || '');
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  let candidate = '';
  let n = maxNum;
  while (true) {
    n += 1;
    candidate = `${idPrefix}${String(n).padStart(4, '0')}`;
    if (!existingList.includes(candidate) && !db.prepare(`SELECT ${col} FROM ${table} WHERE ${col} = ?`).get(candidate)) break;
  }
  return candidate;
}

function sanitizeForDb(name) {
  return String(name || 'document').replace(/[\u0000-\u001f]/g, '').slice(0, 120);
}

app.get('/api/dataset', (req, res) => {
  const db = getDb();
  const invoices = db.prepare('SELECT * FROM invoices ORDER BY invoice_id').all();
  const payments = db.prepare('SELECT * FROM payments ORDER BY payment_id').all();
  const transactions = db.prepare('SELECT * FROM bank_transactions ORDER BY transaction_id').all();
  const groundTruth = db.prepare('SELECT * FROM ground_truth').all();
  res.json({
    invoices,
    payments,
    transactions,
    groundTruth,
    hasDataset: invoices.length > 0,
    hasGroundTruth: groundTruth.length > 0,
    groundTruthCount: groundTruth.length,
  });
});

// Generate demo dataset
app.post('/api/generate-demo', (req, res) => {
  try {
    const db = getDb();
    db.exec('DELETE FROM invoices; DELETE FROM payments; DELETE FROM bank_transactions; DELETE FROM ground_truth; DELETE FROM reconciliation_results; DELETE FROM audit_log; DELETE FROM reconciliation_runs; DELETE FROM document_uploads; DELETE FROM extracted_records;');
    
    const { invoices, payments, transactions, groundTruth } = generateDemoDataset();
    
    const insertInvoice = db.prepare('INSERT INTO invoices (invoice_id, customer, invoice_date, due_date, amount, currency, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertPayment = db.prepare('INSERT INTO payments (payment_id, customer, payment_date, amount, currency, description, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertTransaction = db.prepare('INSERT INTO bank_transactions (transaction_id, transaction_date, amount, currency, description, account_id) VALUES (?, ?, ?, ?, ?, ?)');
    const insertGT = db.prepare('INSERT INTO ground_truth (invoice_id, payment_id, transaction_id, match_type, category) VALUES (?, ?, ?, ?, ?)');
    
    const insertAll = db.transaction(() => {
      for (const inv of invoices) {
        insertInvoice.run(inv.invoice_id, inv.customer, inv.invoice_date, inv.due_date, inv.amount, inv.currency, inv.account_id);
      }
      for (const pay of payments) {
        insertPayment.run(pay.payment_id, pay.customer, pay.payment_date, pay.amount, pay.currency, pay.description, pay.account_id);
      }
      for (const tx of transactions) {
        insertTransaction.run(tx.transaction_id, tx.transaction_date, tx.amount, tx.currency, tx.description, tx.account_id);
      }
      for (const gt of groundTruth) {
        insertGT.run(gt.invoice_id, gt.payment_id || null, gt.transaction_id || null, gt.match_type, gt.category);
      }
    });
    
    insertAll();
    
    res.json({ 
      success: true, 
      message: `Generated ${invoices.length} invoices, ${payments.length} payments, ${transactions.length} transactions with ground truth`,
      counts: { invoices: invoices.length, payments: payments.length, transactions: transactions.length, groundTruth: groundTruth.length },
      hasGroundTruth: true,
    });
  } catch (err) {
    console.error('Error generating demo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload CSV files
app.post('/api/upload/:type', upload.single('file'), (req, res) => {
  try {
    const { type } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const csv = req.file.buffer.toString('utf-8');
    const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
    
    const db = getDb();
    
    if (type === 'invoices') {
      db.exec('DELETE FROM invoices');
      const stmt = db.prepare('INSERT INTO invoices (invoice_id, customer, invoice_date, due_date, amount, currency, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const r of records) {
        stmt.run(r.invoice_id, r.customer, r.invoice_date, r.due_date, parseFloat(r.amount), r.currency || 'INR', r.account_id || '');
      }
    } else if (type === 'payments') {
      db.exec('DELETE FROM payments');
      const stmt = db.prepare('INSERT INTO payments (payment_id, customer, payment_date, amount, currency, description, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const r of records) {
        stmt.run(r.payment_id, r.customer, r.payment_date, parseFloat(r.amount), r.currency || 'INR', r.description || '', r.account_id || '');
      }
    } else if (type === 'transactions') {
      db.exec('DELETE FROM bank_transactions');
      const stmt = db.prepare('INSERT INTO bank_transactions (transaction_id, transaction_date, amount, currency, description, account_id) VALUES (?, ?, ?, ?, ?, ?)');
      for (const r of records) {
        stmt.run(r.transaction_id, r.transaction_date, parseFloat(r.amount), r.currency || 'INR', r.description || '', r.account_id || '');
      }
    }
    
    res.json({ success: true, count: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run reconciliation (streaming progress events)
app.post('/api/reconcile/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const report = await performReconciliation(getDb(), (message, detail) => {
      send({ type: 'step', message, detail });
    });
    send({ type: 'done', payload: report });
  } catch (err) {
    console.error('Reconciliation error:', err);
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// Run reconciliation (single response, for API consumers)
app.post('/api/reconcile', async (req, res) => {
  try {
    const report = await performReconciliation(getDb());
    res.json(report);
  } catch (err) {
    console.error('Reconciliation error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Get reconciliation results
app.get('/api/results', (req, res) => {
  const db = getDb();
  const results = db.prepare('SELECT * FROM reconciliation_results ORDER BY invoice_id').all().map(mapResultRow);
  const groundTruth = db.prepare('SELECT * FROM ground_truth').all();
  const lastRun = db.prepare('SELECT * FROM reconciliation_runs ORDER BY id DESC LIMIT 1').get();
  let evaluation = null;
  // Status/queue metrics are always real. Precision/Recall/F1/Accuracy are
  // null when there is no hidden ground truth (uploaded documents) rather than
  // being shown as misleading 0%.
  if (results.length > 0) {
    evaluation = evaluateResults(results, groundTruth);
    if (lastRun) {
      evaluation.processing_time_ms = lastRun.processing_time_ms;
      evaluation.throughput = lastRun.throughput;
      evaluation.run_at = lastRun.run_at;
      evaluation.ai_mode = lastRun.ai_mode;
    }
  }
  res.json({ results, evaluation, lastRun });
});

// Get audit log
app.get('/api/audit', (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC').all();
  res.json({ logs });
});

// Get exception results (active exceptions only — resolved items excluded)
app.get('/api/exceptions', (req, res) => {
  const db = getDb();
  const active = db.prepare(
    "SELECT * FROM reconciliation_results WHERE status IN ('EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING') AND resolved = 0 ORDER BY confidence ASC"
  ).all().map(mapResultRow);
  const resolved = db.prepare(
    "SELECT * FROM reconciliation_results WHERE status IN ('EXCEPTION', 'UNRESOLVED', 'DUPLICATE', 'MISSING') AND resolved = 1 ORDER BY resolved_at DESC"
  ).all().map(mapResultRow);
  res.json({ exceptions: active, resolved });
});

// Manually resolve an exception (human resolution workflow)
app.post('/api/exceptions/resolve', (req, res) => {
  try {
    const { invoice_id, action, payment_id, note } = req.body;
    if (!invoice_id || !['MANUAL_MATCH', 'MARK_RESOLVED', 'DISMISS'].includes(action)) {
      return res.status(400).json({ error: 'invoice_id and a valid action are required' });
    }
    const db = getDb();
    const result = db.prepare('SELECT * FROM reconciliation_results WHERE invoice_id = ?').get(invoice_id);
    if (!result) return res.status(404).json({ error: 'Record not found' });

    const now = new Date().toISOString();
    let newStatus = result.status;
    let newPaymentId = result.payment_id;
    let newTransactionId = result.transaction_id;
    let newMatchType = result.match_type;
    let newConfidence = result.confidence;
    let newReason = result.reason;
    let actionLabel = action === 'MANUAL_MATCH' ? 'MANUAL_MATCH' : action === 'DISMISS' ? 'DISMISSED' : 'MANUAL_RESOLUTION';

    if (action === 'MANUAL_MATCH') {
      if (!payment_id) return res.status(400).json({ error: 'payment_id required for manual match' });
      const pay = db.prepare('SELECT * FROM payments WHERE payment_id = ?').get(payment_id);
      if (!pay) return res.status(404).json({ error: 'Payment not found' });

      newStatus = 'MATCHED';
      newPaymentId = payment_id;
      newMatchType = 'MANUAL';
      newConfidence = 0.99;
      newReason = note ? `Manually matched to ${payment_id} by human reviewer — ${note}` : `Manually matched to ${payment_id} by human reviewer`;

      // Try to link a bank transaction
      try {
        const payments = db.prepare('SELECT * FROM payments').all();
        const transactions = db.prepare('SELECT * FROM bank_transactions').all();
        const normalized = normalizeDataset([], payments, transactions);
        const candidates = findCandidates([], normalized.payments, normalized.transactions);
        const txCandidates = candidates.paymentToTransactionCandidates[payment_id] || [];
        if (txCandidates.length > 0 && txCandidates[0].score >= 15) {
          newTransactionId = txCandidates[0].transaction_id;
        }
      } catch { /* transaction linking is best-effort */ }
    }

    db.prepare(`UPDATE reconciliation_results SET
        payment_id = ?, transaction_id = ?, status = ?, confidence = ?, match_type = ?, reason = ?,
        resolved = 1, resolution_action = ?, resolution_note = ?, resolved_by = ?, resolved_at = ?
      WHERE invoice_id = ?`)
      .run(
        newPaymentId, newTransactionId, newStatus, newConfidence, newMatchType, newReason,
        actionLabel, note || null, 'Human Reviewer', now, invoice_id
      );

    // Audit the human intervention
    db.prepare(`INSERT INTO audit_log 
      (timestamp, invoice_id, action, candidate_ids, rules_triggered, ai_decision, confidence, evidence_json, status, method, ai_used, ai_mode, resolution_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        now,
        invoice_id,
        actionLabel,
        JSON.stringify(result.candidate_ids ? JSON.parse(result.candidate_ids) : []),
        JSON.stringify(['HUMAN_REVIEW']),
        'HUMAN_REVIEW',
        newConfidence,
        JSON.stringify({ resolution: { action: actionLabel, previous_status: result.status, note: note || null, reviewer: 'Human Reviewer', resolved_at: now } }),
        newStatus,
        'MANUAL',
        0,
        null,
        note || null
      );

    res.json({ success: true, status: newStatus, previousStatus: result.status, action: actionLabel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get settings
app.get('/api/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM config').all();
  const settings = {};
  for (const row of rows) {
    try { settings[row.key] = JSON.parse(row.value); } 
    catch { settings[row.key] = row.value; }
  }
  res.json({ settings });
});

// Update settings
app.post('/api/settings', (req, res) => {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(req.body)) {
    stmt.run(key, JSON.stringify(value));
  }
  res.json({ success: true });
});

// AI configuration status (never exposes key values)
app.get('/api/ai-status', (req, res) => {
  res.json(aiStatus());
});

// Developer / admin consistency check
app.get('/api/consistency-check', (req, res) => {
  const db = getDb();
  const results = db.prepare('SELECT * FROM reconciliation_results').all();
  const groundTruth = db.prepare('SELECT * FROM ground_truth').all();
  const errors = [];
  const warnings = [];

  if (results.length === 0) {
    return res.json({ ok: true, checked: false, errors: [], message: 'No reconciliation results to check' });
  }

  // 1. Every result has a valid status
  const invalid = results.filter(r => !VALID_STATUSES.includes(r.status));
  if (invalid.length > 0) errors.push(`Invalid statuses: ${invalid.map(r => `${r.invoice_id}=${r.status}`).join(', ')}`);

  // 2. Status counts sum to total
  const evalRes = evaluateResults(results, groundTruth);
  const sum = evalRes.matched + evalRes.partial_match + evalRes.exceptions + evalRes.unresolved + evalRes.duplicates + evalRes.missing;
  if (sum !== evalRes.total_records) {
    errors.push(`Status counts sum to ${sum} but total processed is ${evalRes.total_records}`);
  }

  // 3. Confusion matrix math is internally consistent (only when hidden ground
  //    truth exists — uploaded records have no ground truth, so metrics are null)
  if (evalRes.has_ground_truth) {
    const { correct_matches: TP, false_positives: FP, false_negatives: FN } = evalRes;
    const expPrecision = TP + FP > 0 ? TP / (TP + FP) : 0;
    const expRecall = TP + FN > 0 ? TP / (TP + FN) : 0;
    const expF1 = expPrecision + expRecall > 0 ? 2 * expPrecision * expRecall / (expPrecision + expRecall) : 0;
    if (Math.abs(expPrecision - evalRes.precision) > 0.0001) errors.push(`Precision (${evalRes.precision}) does not match recomputed value (${expPrecision})`);
    if (Math.abs(expRecall - evalRes.recall) > 0.0001) errors.push(`Recall (${evalRes.recall}) does not match recomputed value (${expRecall})`);
    if (Math.abs(expF1 - evalRes.f1) > 0.0001) errors.push(`F1 (${evalRes.f1}) does not match recomputed value (${expF1})`);
  }

  // 4. Match rate is consistent with matched count
  const expMatchRate = evalRes.total_records > 0 ? evalRes.matched / evalRes.total_records : 0;
  if (Math.abs(expMatchRate - evalRes.match_rate) > 0.0001) errors.push('Match rate does not equal matched / total processed');

  // 5. Review queue matches the exception endpoint
  //    Invariants: review_queue === active + resolved; active === /api/exceptions count
  const activeExceptions = db.prepare(
    "SELECT COUNT(*) AS c FROM reconciliation_results WHERE status IN ('EXCEPTION','UNRESOLVED','DUPLICATE','MISSING') AND resolved = 0"
  ).get().c;
  const resolvedExceptionsCount = db.prepare(
    "SELECT COUNT(*) AS c FROM reconciliation_results WHERE status IN ('EXCEPTION','UNRESOLVED','DUPLICATE','MISSING') AND resolved = 1"
  ).get().c;
  if (activeExceptions !== evalRes.active_queue) {
    errors.push(`Active review queue mismatch: dashboard says ${evalRes.active_queue}, exception endpoint returns ${activeExceptions}`);
  }
  if (evalRes.review_queue !== activeExceptions + resolvedExceptionsCount) {
    errors.push(`Review queue mismatch: ${evalRes.review_queue} flagged !== ${activeExceptions} active + ${resolvedExceptionsCount} resolved`);
  }

  // 6. Audit log covers every decision
  const auditCount = db.prepare('SELECT COUNT(*) AS c FROM audit_log').get().c;
  const automatedAudits = db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE method != 'MANUAL'").get().c;
  if (automatedAudits < results.length) {
    errors.push(`Audit log has ${automatedAudits} automated entries but ${results.length} decisions were made`);
  }
  if (auditCount < results.length) warnings.push(`Audit log has ${auditCount} entries for ${results.length} decisions`);

  res.json({
    ok: errors.length === 0,
    checked: true,
    errors,
    warnings,
    metrics: {
      total: evalRes.total_records,
      sum,
      matched: evalRes.matched,
      review_queue: evalRes.review_queue,
      active_queue: evalRes.active_queue,
      resolved_queue_count: evalRes.resolved_queue_count,
      precision: evalRes.precision,
      recall: evalRes.recall,
      f1: evalRes.f1,
      accuracy: evalRes.accuracy,
      match_rate: evalRes.match_rate,
      correct_matches: evalRes.correct_matches,
      false_positives: evalRes.false_positives,
      false_negatives: evalRes.false_negatives,
      has_ground_truth: evalRes.has_ground_truth,
    },
  });
});

// Export results as CSV
app.get('/api/export/results', (req, res) => {
  const db = getDb();
  const results = db.prepare('SELECT * FROM reconciliation_results ORDER BY invoice_id').all();
  
  const headers = ['invoice_id', 'payment_id', 'transaction_id', 'status', 'confidence', 'match_type', 'reason', 'exception_category'];
  const csvRows = [headers.join(',')];
  
  for (const r of results) {
    csvRows.push(headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','));
  }
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=reconai_results.csv');
  res.send(csvRows.join('\n'));
});

// Health check
app.get('/api/health', (req, res) => {
  const db = getDb();
  const invoiceCount = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count;
  const resultCount = db.prepare('SELECT COUNT(*) as count FROM reconciliation_results').get().count;
  res.json({ status: 'ok', invoices: invoiceCount, results: resultCount });
});

// Serve static frontend in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ReconAI backend running on http://localhost:${PORT}`);
});