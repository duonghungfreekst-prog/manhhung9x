/**
 * electron/security/pathValidator.cjs
 * Bộ lọc kiểm tra an toàn đường dẫn tệp tin (Path Traversal Guard)
 * Ngăn chặn tuyệt đối kỹ thuật tấn công ../../../ hoặc truy cập ngoài vùng cho phép
 */

const path = require('path');
const { app } = require('electron');

function getAllowedDirectories() {
  const dirs = [];
  if (app) {
    try { dirs.push(path.resolve(app.getPath('userData'))); } catch {}
    try { dirs.push(path.resolve(app.getPath('pictures'))); } catch {}
    try { dirs.push(path.resolve(app.getPath('documents'))); } catch {}
    try { dirs.push(path.resolve(app.getPath('desktop'))); } catch {}
    try { dirs.push(path.resolve(app.getPath('downloads'))); } catch {}
  }
  // Cho phép các thư mục dự án / dữ liệu nội soi tại các ổ đĩa D:, E:, F:
  ['D:\\', 'E:\\', 'F:\\'].forEach(drive => {
    dirs.push(path.resolve(drive));
  });
  return dirs;
}

/**
 * Kiểm tra xem filePath có nằm trong danh sách thư mục được phép hay không
 */
function isSafePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;

  // Chuẩn hóa đường dẫn
  const resolved = path.resolve(targetPath);

  // Chặn tuyệt đối đường dẫn nguy hiểm tới thư mục hệ thống Windows nhạy cảm
  const lower = resolved.toLowerCase();
  if (lower.includes('\\windows\\system32') || lower.includes('\\windows\\syswow64')) {
    return false;
  }

  const allowed = getAllowedDirectories();
  return allowed.some(base => resolved.startsWith(base));
}

module.exports = {
  isSafePath,
  getAllowedDirectories
};
