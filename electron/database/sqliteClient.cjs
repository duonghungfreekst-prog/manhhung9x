/**
 * electron/database/sqliteClient.cjs
 * Quản trị kết nối cơ sở dữ liệu SQLite nhúng (node:sqlite) cho DMH_Tools v7
 * - WAL mode (Write-Ahead Logging) cho hiệu năng I/O song song cực đại
 * - Foreign key constraints bảo toàn toàn vẹn dữ liệu y tế
 * - Tự động khởi tạo schema chuẩn khi lần đầu khởi động
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let dbInstance = null;

function getDbPath() {
  const userData = app ? app.getPath('userData') : process.cwd();
  const dbDir = path.join(userData, 'database');
  if (!fs.existsSync(dbDir)) {
    try { fs.mkdirSync(dbDir, { recursive: true }); } catch (_e) { /* intentional: safe fallback */ }
  }
  return path.join(dbDir, 'dmh_endoscopy.db');
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      birth_year TEXT DEFAULT '',
      gender TEXT DEFAULT 'Nam',
      phone TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(patient_code);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      exam_type TEXT DEFAULT 'Nội soi',
      doctor_name TEXT DEFAULT '',
      exam_date TEXT DEFAULT '',
      folder_path TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id);

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      original_path TEXT NOT NULL,
      processed_path TEXT NOT NULL,
      thumbnail_path TEXT NOT NULL,
      file_size_kb INTEGER DEFAULT 0,
      checksum_sha256 TEXT DEFAULT '',
      resolution TEXT DEFAULT '1920x1080',
      trigger_type TEXT DEFAULT 'Software',
      is_favorite INTEGER DEFAULT 0,
      captured_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_images_session ON images(session_id);
    CREATE INDEX IF NOT EXISTS idx_images_favorite ON images(is_favorite);
  `);
}

function getSqliteDb() {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  dbInstance = new DatabaseSync(dbPath);

  // Cấu hình tối ưu I/O cho CSDL y tế
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA synchronous = NORMAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');

  initSchema(dbInstance);
  console.log(`[SQLITE] Đã khởi tạo CSDL SQLite thành công tại: ${dbPath}`);
  return dbInstance;
}

function closeSqliteDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
      console.log('[SQLITE] Đã đóng kết nối SQLite an toàn.');
    } catch (e) {
      console.error('[SQLITE] Lỗi khi đóng SQLite:', e.message);
    }
    dbInstance = null;
  }
}

module.exports = {
  getSqliteDb,
  getDbPath,
  closeSqliteDb
};
