/**
 * electron/security/pathValidator.cjs
 * Bộ lọc kiểm tra an toàn đường dẫn tệp tin (Path Traversal Guard)
 * Ngăn chặn kỹ thuật tấn công ../../../ hoặc truy cập ngoài vùng cho phép
 */

const path = require('path');
const { app } = require('electron');

function getAllowedDirectories() {
  const dirs = [];
  if (app) {
    try { dirs.push(path.resolve(app.getPath('userData'))); } catch (e) { /* app chưa ready */ }
    try { dirs.push(path.resolve(app.getPath('pictures'))); } catch (e) { /* N/A */ }
    try { dirs.push(path.resolve(app.getPath('documents'))); } catch (e) { /* N/A */ }
    try { dirs.push(path.resolve(app.getPath('desktop'))); } catch (e) { /* N/A */ }
    try { dirs.push(path.resolve(app.getPath('downloads'))); } catch (e) { /* N/A */ }
    try { dirs.push(path.resolve(app.getPath('temp'))); } catch (e) { /* N/A */ }
  }
  // Thêm ProgramData cho license vault
  if (process.env.ProgramData) {
    dirs.push(path.resolve(process.env.ProgramData, 'DMH_Tools'));
  }
  return dirs;
}

/**
 * Kiểm tra xem filePath có nằm trong danh sách thư mục được phép hay không.
 * Sử dụng so sánh chính xác kèm path.sep để chống prefix bypass.
 */
function isSafePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;

  // Chặn null byte injection
  if (targetPath.includes('\0')) return false;

  // Chuẩn hóa đường dẫn
  const resolved = path.resolve(targetPath);

  // Chặn đường dẫn nguy hiểm tới thư mục hệ thống Windows nhạy cảm
  const lower = resolved.toLowerCase();
  if (lower.includes('\\windows\\system32') || lower.includes('\\windows\\syswow64')) {
    return false;
  }
  // Chặn truy cập Registry hive files
  if (lower.endsWith('\\ntuser.dat') || lower.endsWith('\\sam') || lower.endsWith('\\security')) {
    return false;
  }

  const allowed = getAllowedDirectories();
  // Fix: dùng path.sep để tránh prefix bypass (D:\data vs D:\data_evil)
  return allowed.some(base => resolved === base || resolved.startsWith(base + path.sep));
}

module.exports = {
  isSafePath,
  getAllowedDirectories
};

