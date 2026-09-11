/**
 * DMH_Tools - SQLite Database Engine
 * Native embedded SQLite using Node.js DatabaseSync (C++ Engine)
 * Phục vụ lưu trữ dữ liệu 4 phân hệ:
 * 1. Chấm Công (Attendance)
 * 2. Nội Soi 4K (Endoscopy)
 * 3. Đối Chiếu BHYT (Dcbhyt)
 * 4. Đọc & Giám Định XML (FileReader / BhytValidator)
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let db = null;
let dbPath = '';

function getDbFilePath(app) {
  let baseDir = '';
  if (app && typeof app.getPath === 'function') {
    try {
      baseDir = path.join(app.getPath('userData'), 'dmh_data');
    } catch {}
  }
  if (!baseDir) {
    baseDir = path.join(process.cwd(), 'data');
  }
  if (!fs.existsSync(baseDir)) {
    try { fs.mkdirSync(baseDir, { recursive: true }); } catch {}
  }
  return path.join(baseDir, 'dmh_storage.sqlite');
}

function initDatabase(app) {
  if (db) return db;
  try {
    dbPath = getDbFilePath(app);
    db = new DatabaseSync(dbPath);
    
    // Tối ưu hiệu năng: WAL mode (Write-Ahead Logging) cho tốc độ cao và đa luồng
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA foreign_keys = ON;');

    // ── Khởi tạo các bảng DDL (Auto Migration) ──
    initAttendanceTables();
    initEndoscopyTables();
    initDcbhytTables();
    initXmlTables();

    console.log('[SQLITE] Database initialized successfully at:', dbPath);
    return db;
  } catch (err) {
    console.error('[SQLITE] Failed to initialize database:', err);
    throw err;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. DDL: BẢNG PHÂN HỆ CHẤM CÔNG (ATTENDANCE)
// ════════════════════════════════════════════════════════════════════════════
function initAttendanceTables() {
  // Nhật ký quẹt thẻ (chống trùng lặp qua UNIQUE emp_id + punch_time)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id TEXT NOT NULL,
      emp_name TEXT,
      punch_time TEXT NOT NULL,
      punch_type TEXT DEFAULT 'UNKNOWN',
      device_id TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(emp_id, punch_time) ON CONFLICT IGNORE
    );
    CREATE INDEX IF NOT EXISTS idx_att_time ON attendance_logs(punch_time);
    CREATE INDEX IF NOT EXISTS idx_att_emp ON attendance_logs(emp_id);
  `);

  // Danh sách nhân sự trên máy chấm công
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_employees (
      uid INTEGER PRIMARY KEY,
      user_id TEXT UNIQUE,
      name TEXT,
      role TEXT DEFAULT 'USER',
      password TEXT,
      card_number TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Danh mục ca làm việc
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_shifts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      grace_late INTEGER DEFAULT 15,
      grace_early INTEGER DEFAULT 15,
      work_units REAL DEFAULT 1.0,
      color TEXT DEFAULT '#3b82f6',
      is_overnight INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Cấu hình lịch biểu & phân ca
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_schedules (
      key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Danh mục máy chấm công IP
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER DEFAULT 4370,
      last_connected TEXT
    );
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. DDL: BẢNG PHÂN HỆ NỘI SOI 4K (ENDOSCOPY)
// ════════════════════════════════════════════════════════════════════════════
function initEndoscopyTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS endoscopy_cases (
      id TEXT PRIMARY KEY,
      patient_name TEXT NOT NULL,
      patient_dob TEXT,
      patient_gender TEXT,
      patient_address TEXT,
      patient_bhyt TEXT,
      doctor_name TEXT,
      exam_date TEXT NOT NULL,
      diagnosis TEXT,
      technique TEXT,
      findings TEXT,
      conclusion TEXT,
      recommendations TEXT,
      images_json TEXT,
      video_path TEXT,
      status TEXT DEFAULT 'COMPLETED',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_endo_date ON endoscopy_cases(exam_date);
    CREATE INDEX IF NOT EXISTS idx_endo_name ON endoscopy_cases(patient_name);
  `);

  // Bảng bệnh nhân nội soi
  db.exec(`
    CREATE TABLE IF NOT EXISTS endoscopy_patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      birth_year TEXT,
      gender TEXT DEFAULT 'Nam',
      patient_code TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_endo_pt_name ON endoscopy_patients(full_name);
    CREATE INDEX IF NOT EXISTS idx_endo_pt_code ON endoscopy_patients(patient_code);
  `);

  // Bảng ca/phiên khám nội soi
  db.exec(`
    CREATE TABLE IF NOT EXISTS endoscopy_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      exam_date TEXT DEFAULT (datetime('now', 'localtime')),
      exam_type TEXT DEFAULT 'Nội soi Tai Mũi Họng',
      doctor_name TEXT,
      diagnosis TEXT,
      note TEXT,
      folder_path TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(patient_id) REFERENCES endoscopy_patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_endo_sess_pt ON endoscopy_sessions(patient_id);
  `);

  // Bảng ảnh chụp nội soi
  db.exec(`
    CREATE TABLE IF NOT EXISTS endoscopy_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      original_path TEXT,
      processed_path TEXT,
      thumbnail_path TEXT,
      file_size_kb INTEGER DEFAULT 0,
      resolution TEXT,
      trigger_type TEXT DEFAULT 'MANUAL',
      is_favorite INTEGER DEFAULT 0,
      captured_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(session_id) REFERENCES endoscopy_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_endo_img_sess ON endoscopy_images(session_id);
  `);

  // Mẫu mô tả kết luận mẫu
  db.exec(`
    CREATE TABLE IF NOT EXISTS endoscopy_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      technique TEXT,
      findings TEXT,
      conclusion TEXT,
      recommendations TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Cấu hình máy soi & buồng khám
  db.exec(`
    CREATE TABLE IF NOT EXISTS endoscopy_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. DDL: BẢNG PHÂN HỆ ĐỐI CHIẾU BHYT (DCBHYT)
// ════════════════════════════════════════════════════════════════════════════
function initDcbhytTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dcbhyt_sessions (
      id TEXT PRIMARY KEY,
      session_name TEXT NOT NULL,
      month INTEGER,
      year INTEGER,
      total_records INTEGER DEFAULT 0,
      matched_records INTEGER DEFAULT 0,
      mismatched_records INTEGER DEFAULT 0,
      total_diff_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dcbhyt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      ma_lk TEXT,
      ma_bn TEXT,
      ho_ten TEXT,
      ngay_vao TEXT,
      ngay_ra TEXT,
      tien_his REAL DEFAULT 0,
      tien_bhyt REAL DEFAULT 0,
      tien_lech REAL DEFAULT 0,
      ly_do_lech TEXT,
      trang_thai TEXT,
      FOREIGN KEY(session_id) REFERENCES dcbhyt_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dcbhyt_sess ON dcbhyt_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_dcbhyt_malk ON dcbhyt_items(ma_lk);
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. DDL: BẢNG PHÂN HỆ ĐỌC & GIÁM ĐỊNH XML
// ════════════════════════════════════════════════════════════════════════════
function initXmlTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS xml_files_history (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      ma_lk TEXT,
      ma_bn TEXT,
      ho_ten TEXT,
      so_ngay_dtri INTEGER DEFAULT 0,
      tien_tong REAL DEFAULT 0,
      tien_bhtt REAL DEFAULT 0,
      tien_bntt REAL DEFAULT 0,
      check_status TEXT DEFAULT 'HOP_LE',
      error_count INTEGER DEFAULT 0,
      errors_json TEXT,
      summary_json TEXT,
      imported_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_xml_malk ON xml_files_history(ma_lk);
    CREATE INDEX IF NOT EXISTS idx_xml_date ON xml_files_history(imported_at);
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// CRUD: PHÂN HỆ CHẤM CÔNG (ATTENDANCE)
// ════════════════════════════════════════════════════════════════════════════
const attendance = {
  // Lưu hàng loạt lượt quẹt thẻ (Bulk Insert an toàn)
  savePunchLogs(logs) {
    if (!logs || !logs.length) return { ok: true, count: 0 };
    initDatabase();
    
    db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO attendance_logs (emp_id, emp_name, punch_time, punch_type, device_id)
        VALUES (?, ?, ?, ?, ?)
      `);

      let insertedCount = 0;
      for (const log of logs) {
        const timeStr = typeof log.timestamp === 'string'
          ? log.timestamp
          : (log.timestamp instanceof Date ? log.timestamp.toISOString() : new Date(log.timestamp).toISOString());
        const info = stmt.run(
          String(log.empId || '').trim(),
          String(log.empName || '').trim(),
          timeStr,
          String(log.punchType || 'UNKNOWN'),
          String(log.deviceId || '')
        );
        if (info.changes > 0) insertedCount++;
      }
      db.exec('COMMIT;');
      return { ok: true, count: insertedCount, totalProcessed: logs.length };
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  // Lấy nhật ký quẹt thẻ theo tháng/năm
  getPunchLogs(filter = {}) {
    initDatabase();
    let query = 'SELECT * FROM attendance_logs WHERE 1=1';
    const params = [];

    if (filter.month && filter.year) {
      const mStr = String(filter.month).padStart(2, '0');
      const yStr = String(filter.year);
      query += " AND (punch_time LIKE ? OR punch_time LIKE ?)";
      params.push(`${yStr}-${mStr}%`, `%${mStr}/${yStr}%`);
    }
    if (filter.empId) {
      query += ' AND emp_id = ?';
      params.push(String(filter.empId).trim());
    }

    query += ' ORDER BY punch_time ASC';
    const rows = db.prepare(query).all(...params);
    return { ok: true, logs: rows };
  },

  // Xóa toàn bộ logs
  clearPunchLogs() {
    initDatabase();
    db.exec('DELETE FROM attendance_logs;');
    return { ok: true };
  },

  // Lưu danh sách nhân viên từ máy chấm công
  saveEmployees(employees) {
    if (!employees || !employees.length) return { ok: true, count: 0 };
    initDatabase();
    db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = db.prepare(`
        INSERT INTO attendance_employees (uid, user_id, name, role, password, card_number, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(uid) DO UPDATE SET
          user_id = excluded.user_id,
          name = excluded.name,
          role = excluded.role,
          password = excluded.password,
          card_number = excluded.card_number,
          updated_at = datetime('now', 'localtime')
      `);
      let count = 0;
      for (const emp of employees) {
        stmt.run(
          emp.uid,
          String(emp.userId || emp.empId || emp.uid),
          String(emp.name || ''),
          String(emp.role || 'USER'),
          String(emp.password || ''),
          String(emp.cardNumber || '')
        );
        count++;
      }
      db.exec('COMMIT;');
      return { ok: true, count };
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  getEmployees() {
    initDatabase();
    const rows = db.prepare('SELECT * FROM attendance_employees ORDER BY uid ASC').all();
    return { ok: true, employees: rows };
  },

  deleteEmployee(uid) {
    initDatabase();
    db.prepare('DELETE FROM attendance_employees WHERE uid = ?').run(uid);
    return { ok: true };
  },

  // Quản lý Ca làm việc
  saveShifts(shifts) {
    if (!shifts) return { ok: true };
    initDatabase();
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec('DELETE FROM attendance_shifts;');
      const stmt = db.prepare(`
        INSERT INTO attendance_shifts (id, name, start_time, end_time, grace_late, grace_early, work_units, color, is_overnight, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `);
      for (const s of shifts) {
        stmt.run(
          s.id,
          s.name,
          s.startTime,
          s.endTime,
          s.graceLateMinutes || 15,
          s.graceEarlyMinutes || 15,
          s.workUnitsEarned || 1.0,
          s.color || '#3b82f6',
          s.isOvernight ? 1 : 0
        );
      }
      db.exec('COMMIT;');
      return { ok: true };
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  getShifts() {
    initDatabase();
    const rows = db.prepare('SELECT * FROM attendance_shifts ORDER BY start_time ASC').all();
    return { ok: true, shifts: rows };
  },

  // Quản lý Lịch phân ca
  saveScheduleConfig(key, data) {
    initDatabase();
    const dataJson = JSON.stringify(data);
    db.prepare(`
      INSERT INTO attendance_schedules (key, data_json, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = datetime('now', 'localtime')
    `).run(key, dataJson);
    return { ok: true };
  },

  getScheduleConfig(key) {
    initDatabase();
    const row = db.prepare('SELECT data_json FROM attendance_schedules WHERE key = ?').get(key);
    return { ok: true, data: row ? JSON.parse(row.data_json) : null };
  },

  // Quản lý Máy chấm công IP
  saveDevices(devices) {
    initDatabase();
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec('DELETE FROM attendance_devices;');
      const stmt = db.prepare('INSERT INTO attendance_devices (id, name, ip, port, last_connected) VALUES (?, ?, ?, ?, ?)');
      for (const d of devices) {
        stmt.run(d.id, d.name, d.ip, d.port || 4370, d.lastConnected || null);
      }
      db.exec('COMMIT;');
      return { ok: true };
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  getDevices() {
    initDatabase();
    const rows = db.prepare('SELECT * FROM attendance_devices').all();
    return { ok: true, devices: rows };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// CRUD: PHÂN HỆ NỘI SOI 4K (ENDOSCOPY)
// ════════════════════════════════════════════════════════════════════════════
const endoscopy = {
  saveCase(c) {
    initDatabase();
    const id = c.id || ('endo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    const stmt = db.prepare(`
      INSERT INTO endoscopy_cases (
        id, patient_name, patient_dob, patient_gender, patient_address, patient_bhyt,
        doctor_name, exam_date, diagnosis, technique, findings, conclusion, recommendations,
        images_json, video_path, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        patient_name = excluded.patient_name,
        patient_dob = excluded.patient_dob,
        patient_gender = excluded.patient_gender,
        patient_address = excluded.patient_address,
        patient_bhyt = excluded.patient_bhyt,
        doctor_name = excluded.doctor_name,
        exam_date = excluded.exam_date,
        diagnosis = excluded.diagnosis,
        technique = excluded.technique,
        findings = excluded.findings,
        conclusion = excluded.conclusion,
        recommendations = excluded.recommendations,
        images_json = excluded.images_json,
        video_path = excluded.video_path,
        status = excluded.status
    `);
    stmt.run(
      id,
      c.patientName || '',
      c.patientDob || '',
      c.patientGender || '',
      c.patientAddress || '',
      c.patientBhyt || '',
      c.doctorName || '',
      c.examDate || new Date().toISOString().split('T')[0],
      c.diagnosis || '',
      c.technique || '',
      c.findings || '',
      c.conclusion || '',
      c.recommendations || '',
      typeof c.images === 'string' ? c.images : JSON.stringify(c.images || []),
      c.videoPath || '',
      c.status || 'COMPLETED'
    );
    return { ok: true, id };
  },

  getCases(filter = {}) {
    initDatabase();
    let query = 'SELECT * FROM endoscopy_cases WHERE 1=1';
    const params = [];
    if (filter.search) {
      query += ' AND (patient_name LIKE ? OR patient_bhyt LIKE ? OR diagnosis LIKE ?)';
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.date) {
      query += ' AND exam_date = ?';
      params.push(filter.date);
    }
    query += ' ORDER BY exam_date DESC, created_at DESC';
    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }
    const rows = db.prepare(query).all(...params);
    return { ok: true, cases: rows };
  },

  getCaseById(id) {
    initDatabase();
    const row = db.prepare('SELECT * FROM endoscopy_cases WHERE id = ?').get(id);
    return { ok: true, caseData: row };
  },

  deleteCase(id) {
    initDatabase();
    db.prepare('DELETE FROM endoscopy_cases WHERE id = ?').run(id);
    return { ok: true };
  },

  // Templates
  saveTemplate(t) {
    initDatabase();
    const id = t.id || ('tpl_' + Date.now());
    db.prepare(`
      INSERT INTO endoscopy_templates (id, title, category, technique, findings, conclusion, recommendations, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        technique = excluded.technique,
        findings = excluded.findings,
        conclusion = excluded.conclusion,
        recommendations = excluded.recommendations,
        updated_at = datetime('now', 'localtime')
    `).run(
      id,
      t.title || '',
      t.category || 'CHUNG',
      t.technique || '',
      t.findings || '',
      t.conclusion || '',
      t.recommendations || ''
    );
    return { ok: true, id };
  },

  getTemplates(category) {
    initDatabase();
    let query = 'SELECT * FROM endoscopy_templates';
    const params = [];
    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }
    query += ' ORDER BY title ASC';
    const rows = db.prepare(query).all(...params);
    return { ok: true, templates: rows };
  },

  deleteTemplate(id) {
    initDatabase();
    db.prepare('DELETE FROM endoscopy_templates WHERE id = ?').run(id);
    return { ok: true };
  },

  getDbStats() {
    initDatabase();
    const ptCount = db.prepare('SELECT COUNT(*) AS count FROM endoscopy_patients').get().count;
    const sessCount = db.prepare('SELECT COUNT(*) AS count FROM endoscopy_sessions').get().count;
    const imgCount = db.prepare('SELECT COUNT(*) AS count FROM endoscopy_images').get().count;
    return {
      total_patients: ptCount,
      total_sessions: sessCount,
      total_images: imgCount,
      total_size_mb: 0
    };
  },

  getPatients(q) {
    initDatabase();
    let query = 'SELECT * FROM endoscopy_patients';
    const params = [];
    if (q) {
      query += ' WHERE full_name LIKE ? OR patient_code LIKE ? OR phone LIKE ?';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  },

  addPatient(d) {
    initDatabase();
    const stmt = db.prepare(`
      INSERT INTO endoscopy_patients (full_name, birth_year, gender, patient_code, phone, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);
    const code = d.patient_code || ('BN' + Date.now().toString().slice(-6));
    const info = stmt.run(
      d.full_name || 'Bệnh nhân mới',
      d.birth_year || '',
      d.gender || 'Nam',
      code,
      d.phone || ''
    );
    return { id: Number(info.lastInsertRowid), full_name: d.full_name, patient_code: code };
  },

  getSessions(patient_id) {
    initDatabase();
    let query = `
      SELECT s.*, p.full_name, p.patient_code,
        (SELECT COUNT(*) FROM endoscopy_images i WHERE i.session_id = s.id) AS image_count
      FROM endoscopy_sessions s
      JOIN endoscopy_patients p ON s.patient_id = p.id
    `;
    const params = [];
    if (patient_id) {
      query += ' WHERE s.patient_id = ?';
      params.push(patient_id);
    }
    query += ' ORDER BY s.exam_date DESC, s.created_at DESC';
    return db.prepare(query).all(...params);
  },

  createSession(d) {
    initDatabase();
    const stmt = db.prepare(`
      INSERT INTO endoscopy_sessions (patient_id, exam_date, exam_type, doctor_name, diagnosis, note, created_at)
      VALUES (?, datetime('now', 'localtime'), ?, ?, '', '', datetime('now', 'localtime'))
    `);
    const info = stmt.run(
      d.patient_id,
      d.exam_type || 'Nội soi Tai Mũi Họng',
      d.doctor_name || ''
    );
    return { id: Number(info.lastInsertRowid), ...d };
  },

  getImages(session_id) {
    initDatabase();
    const rows = db.prepare(`
      SELECT * FROM endoscopy_images WHERE session_id = ? ORDER BY captured_at DESC
    `).all(session_id);
    return rows;
  },

  toggleFav(image_id) {
    initDatabase();
    const cur = db.prepare('SELECT is_favorite FROM endoscopy_images WHERE id = ?').get(image_id);
    const newVal = cur && cur.is_favorite === 1 ? 0 : 1;
    db.prepare('UPDATE endoscopy_images SET is_favorite = ? WHERE id = ?').run(newVal, image_id);
    return { id: image_id, is_favorite: newVal };
  },

  saveCapture(session_id, b64, res) {
    initDatabase();
    const capturesDir = path.join(path.dirname(dbPath), 'captures');
    if (!fs.existsSync(capturesDir)) {
      try { fs.mkdirSync(capturesDir, { recursive: true }); } catch {}
    }
    const fileName = `cap_${session_id}_${Date.now()}.jpg`;
    const fullPath = path.join(capturesDir, fileName);
    const base64Data = (b64 || '').replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));

    const sizeKb = Math.round(fs.statSync(fullPath).size / 1024);
    const stmt = db.prepare(`
      INSERT INTO endoscopy_images (session_id, original_path, processed_path, thumbnail_path, file_size_kb, resolution, trigger_type, is_favorite, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', 0, datetime('now', 'localtime'))
    `);
    const info = stmt.run(session_id, fullPath, fullPath, fullPath, sizeKb, res || '1080p');
    return {
      id: Number(info.lastInsertRowid),
      session_id,
      original_path: fullPath,
      thumbnail_path: fullPath,
      file_size_kb: sizeKb
    };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// CRUD: PHÂN HỆ ĐỐI CHIẾU BHYT (DCBHYT)
// ════════════════════════════════════════════════════════════════════════════
const dcbhyt = {
  saveSession(sessionData, items) {
    initDatabase();
    const id = sessionData.id || ('dcbhyt_' + Date.now());
    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        INSERT INTO dcbhyt_sessions (
          id, session_name, month, year, total_records, matched_records, mismatched_records, total_diff_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(
        id,
        sessionData.name || ('Đợt đối chiếu ' + new Date().toLocaleDateString('vi-VN')),
        sessionData.month || (new Date().getMonth() + 1),
        sessionData.year || new Date().getFullYear(),
        sessionData.totalRecords || (items ? items.length : 0),
        sessionData.matchedRecords || 0,
        sessionData.mismatchedRecords || 0,
        sessionData.totalDiffAmount || 0
      );

      if (items && items.length) {
        const itemStmt = db.prepare(`
          INSERT INTO dcbhyt_items (
            session_id, ma_lk, ma_bn, ho_ten, ngay_vao, ngay_ra, tien_his, tien_bhyt, tien_lech, ly_do_lech, trang_thai
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const it of items) {
          itemStmt.run(
            id,
            it.maLk || it.ma_lk || '',
            it.maBn || it.ma_bn || '',
            it.hoTen || it.ho_ten || '',
            it.ngayVao || it.ngay_vao || '',
            it.ngayRa || it.ngay_ra || '',
            it.tienHis || it.tien_his || 0,
            it.tienBhyt || it.tien_bhyt || 0,
            it.tienLech || it.tien_lech || 0,
            it.lyDo || it.ly_do_lech || '',
            it.trangThai || it.trang_thai || 'LECH'
          );
        }
      }
      db.exec('COMMIT;');
      return { ok: true, id };
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  },

  getSessions() {
    initDatabase();
    const rows = db.prepare('SELECT * FROM dcbhyt_sessions ORDER BY created_at DESC').all();
    return { ok: true, sessions: rows };
  },

  getSessionItems(sessionId) {
    initDatabase();
    const rows = db.prepare('SELECT * FROM dcbhyt_items WHERE session_id = ?').all(sessionId);
    return { ok: true, items: rows };
  },

  deleteSession(sessionId) {
    initDatabase();
    db.prepare('DELETE FROM dcbhyt_sessions WHERE id = ?').run(sessionId);
    return { ok: true };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// CRUD: PHÂN HỆ ĐỌC & GIÁM ĐỊNH XML
// ════════════════════════════════════════════════════════════════════════════
const xmlStorage = {
  saveXmlRecord(rec) {
    initDatabase();
    const id = rec.id || ('xml_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));
    db.prepare(`
      INSERT INTO xml_files_history (
        id, file_name, file_size, ma_lk, ma_bn, ho_ten, so_ngay_dtri,
        tien_tong, tien_bhtt, tien_bntt, check_status, error_count, errors_json, summary_json, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        file_name = excluded.file_name,
        check_status = excluded.check_status,
        error_count = excluded.error_count,
        errors_json = excluded.errors_json,
        summary_json = excluded.summary_json
    `).run(
      id,
      rec.fileName || '',
      rec.fileSize || 0,
      rec.maLk || '',
      rec.maBn || '',
      rec.hoTen || '',
      rec.soNgayDtri || 0,
      rec.tienTong || 0,
      rec.tienBhtt || 0,
      rec.tienBntt || 0,
      rec.checkStatus || 'HOP_LE',
      rec.errorCount || 0,
      typeof rec.errors === 'string' ? rec.errors : JSON.stringify(rec.errors || []),
      typeof rec.summary === 'string' ? rec.summary : JSON.stringify(rec.summary || {})
    );
    return { ok: true, id };
  },

  getXmlHistory(filter = {}) {
    initDatabase();
    let query = 'SELECT * FROM xml_files_history WHERE 1=1';
    const params = [];
    if (filter.search) {
      query += ' AND (ma_lk LIKE ? OR ho_ten LIKE ? OR file_name LIKE ?)';
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.status) {
      query += ' AND check_status = ?';
      params.push(filter.status);
    }
    query += ' ORDER BY imported_at DESC';
    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }
    const rows = db.prepare(query).all(...params);
    return { ok: true, records: rows };
  },

  deleteXmlRecord(id) {
    initDatabase();
    db.prepare('DELETE FROM xml_files_history WHERE id = ?').run(id);
    return { ok: true };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// HỆ THỐNG: THỐNG KÊ & DỌN DẸP DATABASE
// ════════════════════════════════════════════════════════════════════════════
function getDatabaseStats() {
  initDatabase();
  let fileSize = 0;
  try {
    const stat = fs.statSync(dbPath);
    fileSize = stat.size;
  } catch {}

  const attCount = db.prepare('SELECT COUNT(*) AS count FROM attendance_logs').get().count;
  const empCount = db.prepare('SELECT COUNT(*) AS count FROM attendance_employees').get().count;
  const endoCount = db.prepare('SELECT COUNT(*) AS count FROM endoscopy_cases').get().count;
  const dcbhytCount = db.prepare('SELECT COUNT(*) AS count FROM dcbhyt_sessions').get().count;
  const xmlCount = db.prepare('SELECT COUNT(*) AS count FROM xml_files_history').get().count;

  return {
    ok: true,
    dbPath,
    fileSize,
    fileSizeHuman: (fileSize / (1024 * 1024)).toFixed(2) + ' MB',
    counts: {
      attendanceLogs: attCount,
      employees: empCount,
      endoscopyCases: endoCount,
      dcbhytSessions: dcbhytCount,
      xmlHistory: xmlCount
    }
  };
}

function vacuumDatabase() {
  initDatabase();
  db.exec('VACUUM;');
  return { ok: true };
}

module.exports = {
  initDatabase,
  attendance,
  endoscopy,
  dcbhyt,
  xmlStorage,
  getDatabaseStats,
  vacuumDatabase
};
