/**
 * electron/repositories/endoscopy.repository.cjs
 * Tầng truy cập dữ liệu (Repository Pattern) cho phân hệ Nội Soi AI 4K DMH_Tools v7
 * Thay thế hoàn toàn JSON.parse / writeFileSync bằng SQLite nhúng chuẩn ACID
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSqliteDb } = require('../database/sqliteClient.cjs');

class EndoscopyRepository {
  constructor() {
    this.db = getSqliteDb();
  }

  /**
   * Tự động chuyển đổi dữ liệu từ endoscopy_db.json cũ sang SQLite
   */
  migrateFromJson(jsonPath) {
    if (!fs.existsSync(jsonPath)) return;

    try {
      // Kiểm tra xem SQLite đã có dữ liệu bệnh nhân chưa
      const countRow = this.db.prepare('SELECT COUNT(*) as count FROM patients').get();
      if (countRow && countRow.count > 0) {
        return; // Đã có dữ liệu, không cần nạp lại
      }

      const raw = fs.readFileSync(jsonPath, 'utf8');
      if (!raw || raw.trim().length === 0) return;

      const oldData = JSON.parse(raw);
      if (!oldData || !Array.isArray(oldData.patients)) return;

      console.log(`[MIGRATION] Bắt đầu chuyển đổi ${oldData.patients.length} bệnh nhân từ JSON sang SQLite...`);
      
      this.db.exec('BEGIN TRANSACTION;');

      const insertPt = this.db.prepare(`
        INSERT INTO patients (id, patient_code, full_name, birth_year, gender, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const p of oldData.patients) {
        insertPt.run(
          p.id,
          p.patient_code || ('BN' + String(p.id).padStart(5, '0')),
          p.full_name || 'Chưa đặt tên',
          p.birth_year || '',
          p.gender || 'Nam',
          p.phone || '',
          p.created_at || new Date().toISOString()
        );
      }

      if (Array.isArray(oldData.sessions)) {
        const insertSess = this.db.prepare(`
          INSERT INTO sessions (id, patient_id, exam_type, doctor_name, exam_date, folder_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of oldData.sessions) {
          insertSess.run(
            s.id,
            s.patient_id,
            s.exam_type || 'Nội soi',
            s.doctor_name || '',
            s.exam_date || '',
            s.folder_path || '',
            s.created_at || new Date().toISOString()
          );
        }
      }

      if (Array.isArray(oldData.images)) {
        const insertImg = this.db.prepare(`
          INSERT INTO images (id, session_id, original_path, processed_path, thumbnail_path, file_size_kb, resolution, trigger_type, is_favorite, captured_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const img of oldData.images) {
          insertImg.run(
            img.id,
            img.session_id,
            img.original_path || '',
            img.processed_path || '',
            img.thumbnail_path || '',
            img.file_size_kb || 0,
            img.resolution || '1920x1080',
            img.trigger_type || 'Software',
            img.is_favorite ? 1 : 0,
            img.captured_at || '',
            new Date().toISOString()
          );
        }
      }

      this.db.exec('COMMIT;');
      console.log('[MIGRATION] Chuyển đổi dữ liệu sang SQLite hoàn tất thành công!');

      // Đổi tên file cũ để đánh dấu hoàn tất an toàn
      try {
        fs.renameSync(jsonPath, jsonPath + '.migrated');
      } catch {}
    } catch (e) {
      this.db.exec('ROLLBACK;');
      console.error('[MIGRATION] Lỗi khi chuyển đổi dữ liệu:', e.message);
    }
  }

  getStats() {
    const ptRow = this.db.prepare('SELECT COUNT(*) as count FROM patients').get();
    const sessRow = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get();
    const imgRow = this.db.prepare('SELECT COUNT(*) as count, SUM(file_size_kb) as total_kb FROM images').get();

    const totalKb = (imgRow && imgRow.total_kb) ? Number(imgRow.total_kb) : 0;

    return {
      total_patients: ptRow ? ptRow.count : 0,
      total_sessions: sessRow ? sessRow.count : 0,
      total_images: imgRow ? imgRow.count : 0,
      total_size_mb: Math.round(totalKb / 1024)
    };
  }

  getPatients(query) {
    if (query && query.trim().length > 0) {
      const q = `%${query.trim().toLowerCase()}%`;
      const stmt = this.db.prepare(`
        SELECT * FROM patients
        WHERE LOWER(full_name) LIKE ? OR LOWER(patient_code) LIKE ? OR phone LIKE ?
        ORDER BY id DESC
      `);
      return stmt.all(q, q, q);
    }
    const stmt = this.db.prepare('SELECT * FROM patients ORDER BY id DESC');
    return stmt.all();
  }

  addPatient(data) {
    // Sinh mã bệnh nhân tự động nếu chưa có
    const lastRow = this.db.prepare('SELECT MAX(id) as max_id FROM patients').get();
    const nextSeq = (lastRow && lastRow.max_id ? Number(lastRow.max_id) : 0) + 1;
    const patientCode = data.patient_code || ('BN' + String(nextSeq).padStart(5, '0'));

    const stmt = this.db.prepare(`
      INSERT INTO patients (patient_code, full_name, birth_year, gender, phone, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);

    const result = stmt.run(
      patientCode,
      data.full_name || 'Bệnh nhân mới',
      data.birth_year || '',
      data.gender || 'Nam',
      data.phone || ''
    );

    const insertedId = Number(result.lastInsertRowid);
    return this.db.prepare('SELECT * FROM patients WHERE id = ?').get(insertedId);
  }

  getSessions(patientId) {
    const stmt = this.db.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM images i WHERE i.session_id = s.id) as image_count
      FROM sessions s
      WHERE s.patient_id = ?
      ORDER BY s.id DESC
    `);
    return stmt.all(patientId);
  }

  createSession(data, imgRoot) {
    const pt = this.db.prepare('SELECT * FROM patients WHERE id = ?').get(data.patient_id);
    if (!pt) throw new Error('Không tìm thấy bệnh nhân');

    const sDate = new Date();
    const dateStr = sDate.toLocaleDateString('vi-VN');
    const sanitizedName = (pt.full_name || 'BenhNhan')
      .trim()
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ');
    const folderName = `${pt.patient_code}_${sanitizedName}_${sDate.getTime()}`;
    const folderPath = path.join(imgRoot, folderName);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const stmt = this.db.prepare(`
      INSERT INTO sessions (patient_id, exam_type, doctor_name, exam_date, folder_path, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);

    const result = stmt.run(
      data.patient_id,
      data.exam_type || 'Nội soi Tai Mũi Họng',
      data.doctor_name || '',
      dateStr,
      folderPath
    );

    const sessId = Number(result.lastInsertRowid);
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessId);
  }

  getImages(sessionId) {
    const stmt = this.db.prepare('SELECT * FROM images WHERE session_id = ? ORDER BY id ASC');
    return stmt.all(sessionId);
  }

  toggleFavorite(imageId) {
    const img = this.db.prepare('SELECT is_favorite FROM images WHERE id = ?').get(imageId);
    if (!img) return false;

    const newFav = img.is_favorite ? 0 : 1;
    this.db.prepare('UPDATE images SET is_favorite = ? WHERE id = ?').run(newFav, imageId);
    return newFav === 1;
  }

  saveCapture(sessionId, base64Data, resolution) {
    const sess = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!sess) throw new Error('Phiên khám không tồn tại');

    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    
    // Tính checksum SHA-256 xác thực toàn vẹn ảnh y tế
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    const fileName = `IMG_${Date.now()}_${checksum.substring(0, 8)}.jpg`;
    const filePath = path.join(sess.folder_path, fileName);

    fs.writeFileSync(filePath, buffer);
    const sizeKb = Math.round(buffer.length / 1024);

    const stmt = this.db.prepare(`
      INSERT INTO images (
        session_id, original_path, processed_path, thumbnail_path,
        file_size_kb, checksum_sha256, resolution, trigger_type, is_favorite, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const capturedAt = new Date().toLocaleTimeString('vi-VN');
    const result = stmt.run(
      sessionId,
      filePath,
      filePath,
      filePath,
      sizeKb,
      checksum,
      resolution || '1920x1080',
      'Software',
      0,
      capturedAt
    );

    const imgId = Number(result.lastInsertRowid);
    return this.db.prepare('SELECT * FROM images WHERE id = ?').get(imgId);
  }
}

let repoInstance = null;
function getEndoscopyRepository() {
  if (!repoInstance) {
    repoInstance = new EndoscopyRepository();
  }
  return repoInstance;
}

module.exports = {
  getEndoscopyRepository
};
