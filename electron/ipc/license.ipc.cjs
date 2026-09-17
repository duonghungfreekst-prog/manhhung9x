const { ipcMain, app } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, execFile } = require('child_process');
const licenseVault = require('../licenseVault.cjs');

let _cachedHwid = null;

/**
 * Lấy Hardware ID duy nhất của máy tính (Mainboard + CPU + UUID)
 * Có cơ chế cache vào Registry HKCU để không bị lag khi khởi động lại
 */
async function getSystemHwid() {
  if (_cachedHwid) return _cachedHwid;

  // Thử đọc từ Registry trước nếu đã từng lưu
  try {
    const regOut = execSync('reg query "HKCU\\Software\\DMH_Tools\\License" /v "HardwareID"', { stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 }).toString();
    const m = regOut.match(/HardwareID\s+REG_SZ\s+(.*)/i);
    if (m && m[1] && m[1].trim().length >= 16) {
      _cachedHwid = m[1].trim().toUpperCase();
      return _cachedHwid;
    }
  } catch (_e) { /* intentional: safe fallback */ }

  try {
    const script = `
      $board = (Get-CimInstance Win32_BaseBoard).SerialNumber
      $cpu = (Get-CimInstance Win32_Processor).ProcessorId
      $uuid = (Get-CimInstance Win32_ComputerSystemProduct).UUID
      Write-Output "$board-$cpu-$uuid"
    `;
    const result = await new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 12000, encoding: 'utf8' },
        (err, stdout) => {
          if (err) return reject(err);
          resolve(stdout.trim());
        }
      );
    });
    _cachedHwid = crypto.createHash('sha256').update(result).digest('hex').substring(0, 32).toUpperCase();

    // Lưu đệm vào Registry để máy lag lúc khởi động sau này không bao giờ bị timeout
    try {
      execSync(`reg add "HKCU\\Software\\DMH_Tools\\License" /v "HardwareID" /t REG_SZ /d "${_cachedHwid}" /f`, { stdio: 'ignore' });
    } catch (_e) { /* intentional: safe fallback */ }

    return _cachedHwid;
  } catch (e) {
    console.error('[HWID] Lỗi đọc phần cứng qua PowerShell:', e.message);
    const fallbackSeed = `${os.hostname()}-${os.userInfo().username}-${os.arch()}`;
    _cachedHwid = crypto.createHash('sha256').update(fallbackSeed).digest('hex').substring(0, 32).toUpperCase();
    return _cachedHwid;
  }
}

/**
 * registerLicenseIPC - Đăng ký toàn bộ IPC liên quan đến Bản quyền và HWID
 */
function registerLicenseIPC() {
  ipcMain.handle('system:get-hwid', async () => {
    return getSystemHwid();
  });

  // Xác minh bản quyền chuẩn Asymmetric Ed25519
  ipcMain.handle('license:verify', async (_event, rawKey) => {
    try {
      const hwid = await getSystemHwid();
      return licenseVault.verifyEd25519LicenseKey(rawKey, hwid);
    } catch (e) {
      console.error('[Vault] Lỗi verifyEd25519:', e);
      return { valid: false, error: e.message };
    }
  });

  // Quản lý Bản Quyền Bền Vững (Chống Kích Hoạt Lại Khi Xóa App)
  ipcMain.handle('license:check-revocation', async (_event, rawKey) => {
    try {
      return licenseVault.checkKeyRevocation(rawKey, app.getPath('userData'));
    } catch (e) {
      console.error('[Vault] Lỗi check-revocation:', e);
      return { revoked: false };
    }
  });

  ipcMain.handle('license:bind-key', async (_event, rawKey) => {
    try {
      return licenseVault.bindKeyToInstance(rawKey, app.getPath('userData'));
    } catch (e) {
      console.error('[Vault] Lỗi bind-key:', e);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('license:get-instance-id', async () => {
    try {
      return licenseVault.getAppInstanceId(app.getPath('userData'));
    } catch (e) {
      return 'UNKNOWN-INSTANCE';
    }
  });

  ipcMain.handle('license:save-backup-key', async (_event, rawKey) => {
    try {
      const hwid = await getSystemHwid();
      licenseVault.saveBackupKey(rawKey, hwid);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('license:get-backup-key', async () => {
    try {
      const hwid = await getSystemHwid();
      const key = licenseVault.getBackupKey(hwid);
      return { ok: true, key };
    } catch (e) {
      return { ok: false, error: e.message, key: null };
    }
  });

  ipcMain.handle('license:clear-backup-key', async () => {
    try {
      licenseVault.clearBackupKey();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('license:get-trial-init', async (_event, hwid) => {
    try {
      const targetHwid = hwid || await getSystemHwid();
      return licenseVault.getPersistentTrialInit(targetHwid);
    } catch (_e) { /* intentional: safe fallback */
      return 0;
    }
  });

  ipcMain.handle('license:save-trial-init', async (_event, sec, hwid) => {
    try {
      const targetHwid = hwid || await getSystemHwid();
      return licenseVault.savePersistentTrialInit(sec, targetHwid);
    } catch (_e) { /* intentional: safe fallback */
      return 0;
    }
  });

  ipcMain.handle('license:get-hwid-trial', async (_event, hwid) => {
    try {
      const targetHwid = hwid || await getSystemHwid();
      return licenseVault.getHWIDTrialRecord(targetHwid);
    } catch (e) {
      console.error('[Vault] Lỗi get-hwid-trial:', e);
      return { isTrialActive: false, daysLeft: 0, expired: true, error: e.message };
    }
  });
}

module.exports = {
  getSystemHwid,
  registerLicenseIPC,
};
