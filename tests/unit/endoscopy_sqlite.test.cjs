const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Test 1: SQLite Endoscopy Repository
test('Endoscopy SQLite Repository operations', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');

  // Khởi tạo schema trong bộ nhớ
  db.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      birth_year TEXT DEFAULT '',
      gender TEXT DEFAULT 'Nam',
      phone TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      exam_type TEXT DEFAULT 'Nội soi',
      doctor_name TEXT DEFAULT '',
      exam_date TEXT DEFAULT '',
      folder_path TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE TABLE images (
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
  `);

  // Thêm bệnh nhân
  const insertPt = db.prepare(`
    INSERT INTO patients (patient_code, full_name, birth_year, gender, phone)
    VALUES (?, ?, ?, ?, ?)
  `);
  const ptRes = insertPt.run('BN00001', 'Nguyễn Văn A', '1985', 'Nam', '0912345678');
  assert.strictEqual(Number(ptRes.lastInsertRowid), 1);

  // Lấy bệnh nhân
  const pt = db.prepare('SELECT * FROM patients WHERE id = ?').get(1);
  assert.strictEqual(pt.full_name, 'Nguyễn Văn A');
  assert.strictEqual(pt.patient_code, 'BN00001');

  // Thêm phiên khám
  const insertSess = db.prepare(`
    INSERT INTO sessions (patient_id, exam_type, doctor_name, folder_path)
    VALUES (?, ?, ?, ?)
  `);
  const sessRes = insertSess.run(1, 'Nội soi tai mũi họng', 'BS. Hùng', 'D:\\DMH\\BN00001');
  assert.strictEqual(Number(sessRes.lastInsertRowid), 1);

  // Thêm ảnh kèm SHA-256 Checksum
  const insertImg = db.prepare(`
    INSERT INTO images (session_id, original_path, processed_path, thumbnail_path, file_size_kb, checksum_sha256, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const imgRes = insertImg.run(1, 'D:\\DMH\\BN00001\\img1.jpg', 'D:\\DMH\\BN00001\\img1.jpg', 'D:\\DMH\\BN00001\\img1.jpg', 250, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 0);
  assert.strictEqual(Number(imgRes.lastInsertRowid), 1);

  // Toggle favorite
  db.prepare('UPDATE images SET is_favorite = 1 WHERE id = 1').run();
  const img = db.prepare('SELECT is_favorite FROM images WHERE id = 1').get();
  assert.strictEqual(img.is_favorite, 1);
});

// Test 2: CRLF Sanitizer & Path Validator
test('Security guards: CRLF and Path Traversal', () => {
  const { sanitize } = require('../../electron/security/auditLogger.cjs');
  const rawInput = "Hacked\r\n[ADMIN] Login success\n";
  const cleaned = sanitize(rawInput);
  assert.strictEqual(cleaned.includes('\r'), false);
  assert.strictEqual(cleaned.includes('\n'), false);
  assert.strictEqual(cleaned, "Hacked  [ADMIN] Login success");

  const { isSafePath } = require('../../electron/security/pathValidator.cjs');
  assert.strictEqual(isSafePath('C:\\Windows\\System32\\cmd.exe'), false);
  assert.strictEqual(isSafePath('D:\\DMH_Endoscopy_Images\\patient1.jpg'), true);
});
