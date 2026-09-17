/**
 * electron/security/auditLogger.cjs
 * Hệ thống ghi nhật ký kiểm toán (Audit Logging) chuẩn Doanh nghiệp / Bệnh viện
 * - Chống tấn công chèn log (CRLF Injection Attack Mitigation)
 * - Ghi log xoay vòng theo ngày vào userData/logs/audit-YYYY-MM-DD.log
 * - Format chuẩn: [TIMESTAMP] [USER] [MODULE] [ACTION] [TARGET] [RESULT] [DETAILS]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

let logDir = null;

function getLogDirectory() {
  if (logDir) return logDir;
  const userData = app ? app.getPath('userData') : process.cwd();
  logDir = path.join(userData, 'logs');
  if (!fs.existsSync(logDir)) {
    try { fs.mkdirSync(logDir, { recursive: true }); } catch (_e) { /* intentional: safe fallback */ }
  }
  return logDir;
}

/**
 * Lọc sạch các ký tự xuống dòng nguy hiểm (\r, \n) để chống CRLF Injection
 */
function sanitize(input) {
  if (input === null || input === undefined) return '';
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return str.replace(/[\r\n\t]/g, ' ').trim();
}

/**
 * Ghi bản ghi kiểm toán bảo mật
 * @param {string} module - Tên phân hệ (printer, his, endoscopy, biometric, license, system)
 * @param {string} action - Hành động (REPAIR_SPOOLER, UPDATE_PATIENT, CLEAR_LOGS, VERIFY_LICENSE)
 * @param {string} target - Đối tượng tác động (IP máy, Tên máy in, Mã bệnh nhân)
 * @param {'SUCCESS'|'FAILED'|'DENIED'} result - Kết quả thực hiện
 * @param {object|string} [details] - Thông tin chi tiết bổ sung
 */
function logAudit(module, action, target, result, details = {}) {
  try {
    const dir = getLogDirectory();
    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(dir, `audit-${today}.log`);

    const timestamp = new Date().toISOString();
    const user = sanitize(os.userInfo().username || 'SYSTEM_USER');
    const cleanMod = sanitize(module).toUpperCase();
    const cleanAct = sanitize(action).toUpperCase();
    const cleanTarget = sanitize(target);
    const cleanRes = sanitize(result).toUpperCase();
    const cleanDetails = sanitize(typeof details === 'object' ? JSON.stringify(details) : details);

    const logEntry = `[${timestamp}] [USER:${user}] [MOD:${cleanMod}] [ACT:${cleanAct}] [TARGET:${cleanTarget}] [RES:${cleanRes}] ${cleanDetails}\n`;

    fs.appendFileSync(logFilePath, logEntry, 'utf8');

    // Đồng thời in log nhẹ ra console ở môi trường phát triển
    if (result === 'FAILED' || result === 'DENIED') {
      console.warn(`[AUDIT_WARN] ${logEntry.trim()}`);
    }
  } catch (err) {
    console.error('[AUDIT_ERROR] Không thể ghi audit log:', err.message);
  }
}

module.exports = {
  logAudit,
  sanitize
};
