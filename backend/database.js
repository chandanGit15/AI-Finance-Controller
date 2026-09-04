import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DB_DIR, 'reconai.db');

let db = null;

export function getDb() {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function ensureColumn(db, table, column, definition) {
  const cols = db.pragma(`table_info(${table})`);
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase() {
  const db = getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      invoice_id TEXT PRIMARY KEY,
      customer TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      due_date TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      account_id TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      payment_id TEXT PRIMARY KEY,
      customer TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      description TEXT,
      account_id TEXT
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      transaction_id TEXT PRIMARY KEY,
      transaction_date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      description TEXT,
      account_id TEXT
    );

    CREATE TABLE IF NOT EXISTS ground_truth (
      invoice_id TEXT PRIMARY KEY,
      payment_id TEXT,
      transaction_id TEXT,
      match_type TEXT,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS reconciliation_results (
      invoice_id TEXT PRIMARY KEY,
      payment_id TEXT,
      transaction_id TEXT,
      status TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      match_type TEXT,
      evidence_json TEXT,
      reason TEXT,
      processing_time_ms REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      invoice_id TEXT,
      action TEXT,
      candidate_ids TEXT,
      rules_triggered TEXT,
      ai_decision TEXT,
      confidence REAL,
      evidence_json TEXT,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS document_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_type TEXT,
      source_type TEXT,
      extraction_method TEXT,
      extraction_confidence REAL,
      status TEXT,
      message TEXT,
      foreign_currency TEXT,
      uploaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS extracted_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id INTEGER,
      record_type TEXT,
      entity_name TEXT,
      doc_date TEXT,
      amount REAL,
      currency TEXT,
      reference_id TEXT,
      invoice_id TEXT,
      payment_id TEXT,
      bank_transaction_id TEXT,
      description TEXT,
      extraction_method TEXT,
      extraction_confidence REAL,
      validation_status TEXT,
      warnings_json TEXT,
      foreign_currency TEXT,
      accepted INTEGER DEFAULT 0,
      loaded_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reconciliation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT NOT NULL,
      processing_time_ms REAL,
      total_processed INTEGER,
      matched INTEGER,
      partial_match INTEGER,
      review_queue INTEGER,
      unresolved INTEGER,
      precision REAL,
      recall REAL,
      f1 REAL,
      accuracy REAL,
      throughput REAL,
      ai_mode TEXT,
      engine_version TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrations for existing databases
  ensureColumn(db, 'reconciliation_results', 'exception_category', 'TEXT');
  ensureColumn(db, 'reconciliation_results', 'candidate_ids', 'TEXT');
  ensureColumn(db, 'reconciliation_results', 'rules_triggered', 'TEXT');
  ensureColumn(db, 'reconciliation_results', 'ai_used', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'reconciliation_results', 'ai_mode', 'TEXT');
  ensureColumn(db, 'reconciliation_results', 'resolved', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'reconciliation_results', 'resolution_action', 'TEXT');
  ensureColumn(db, 'reconciliation_results', 'resolution_note', 'TEXT');
  ensureColumn(db, 'reconciliation_results', 'resolved_by', 'TEXT');
  ensureColumn(db, 'reconciliation_results', 'resolved_at', 'TEXT');

  ensureColumn(db, 'audit_log', 'method', 'TEXT');
  ensureColumn(db, 'audit_log', 'ai_used', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'audit_log', 'ai_mode', 'TEXT');
  ensureColumn(db, 'audit_log', 'resolution_note', 'TEXT');
  ensureColumn(db, 'audit_log', 'exception_category', 'TEXT');
  ensureColumn(db, 'audit_log', 'reason_code', 'TEXT');

  // Default config
  const defaultConfig = {
    auto_reconcile_threshold: 0.95,
    review_threshold: 0.80,
    date_tolerance_days: 3,
    amount_tolerance_percent: 2.0,
    enable_ai_matching: true,
  };
  
  const upsertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultConfig)) {
    upsertConfig.run(key, JSON.stringify(value));
  }
  
  return db;
}