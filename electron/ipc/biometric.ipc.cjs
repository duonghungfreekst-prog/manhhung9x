const { ipcMain } = require('electron');
const biometricService = require('../biometricNetworkService.cjs');
const { logAudit } = require('../security/auditLogger.cjs');

/**
 * Kiểm tra tính hợp lệ của địa chỉ IP mạng nội bộ (Chống SSRF / Arbitrary Remote IP)
 * Chỉ chấp nhận các dải IP theo RFC 1918, Loopback và Link-Local
 */
function isValidLanIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  const nums = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
    nums.push(num);
  }

  const [a, b] = nums;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (RFC 1918 Class A)
  if (a === 10) return true;
  // 172.16.0.0/12 (RFC 1918 Class B: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (RFC 1918 Class C)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-Local APIPA)
  if (a === 169 && b === 254) return true;

  return false;
}

function isValidLanSubnet(subnet) {
  if (!subnet || typeof subnet !== 'string') return false;
  const parts = subnet.trim().split('.');
  if (parts.length !== 3) return false;
  const nums = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
    nums.push(num);
  }
  const [a, b] = nums;
  if (a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * biometric.ipc.cjs - Module IPC Máy Chấm Công (ZKTeco / Ronald Jack qua mạng LAN)
 * - Tích hợp ghi nhật ký kiểm toán bảo mật (Audit Log)
 * - Kiểm tra địa chỉ IPv4 LAN hợp lệ
 */
function registerBiometricIPC() {
  ipcMain.handle('biometric:get-local-ip', async () => {
    try {
      return biometricService.getLocalNetworkInfo();
    } catch (e) {
      return { primaryIp: '192.168.1.1', defaultSubnet: '192.168.1', subnets: [] };
    }
  });

  ipcMain.handle('biometric:scan-lan', async (_event, subnet, port) => {
    if (!isValidLanSubnet(subnet)) {
      return { ok: false, error: 'Dải mạng quét không hợp lệ hoặc không thuộc dải LAN riêng tư (RFC 1918)', count: 0, devices: [] };
    }
    try {
      return await biometricService.scanLanBiometricDevices(subnet, port);
    } catch (e) {
      return { ok: false, error: e.message, count: 0, devices: [] };
    }
  });

  ipcMain.handle('biometric:test-connection', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      return await biometricService.testBiometricConnection(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:pull-logs', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      const res = await biometricService.pullBiometricAttendanceLogs(ip, port, timeoutMs);
      logAudit('biometric', 'PULL_LOGS', ip, 'SUCCESS', { count: res?.logs?.length || 0 });
      return res;
    } catch (e) {
      logAudit('biometric', 'PULL_LOGS', ip, 'FAILED', e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:get-device-status', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      return await biometricService.getDeviceFullStatus(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:sync-time', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      const res = await biometricService.syncDeviceTime(ip, port, timeoutMs);
      logAudit('biometric', 'SYNC_TIME', ip, 'SUCCESS');
      return res;
    } catch (e) {
      logAudit('biometric', 'SYNC_TIME', ip, 'FAILED', e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:test-voice', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      return await biometricService.testDeviceVoice(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Thao tác đặc quyền: Reboot máy chấm công ──────────────────────────────
  ipcMain.handle('biometric:reboot', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      const res = await biometricService.rebootDevice(ip, port, timeoutMs);
      logAudit('biometric', 'REBOOT_DEVICE', ip, 'SUCCESS');
      return res;
    } catch (e) {
      logAudit('biometric', 'REBOOT_DEVICE', ip, 'FAILED', e.message);
      return { ok: false, error: e.message };
    }
  });

  // ── Thao tác đặc quyền: Xóa quyền Admin ────────────────────────────────────
  ipcMain.handle('biometric:clear-admin', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      const res = await biometricService.clearDeviceAdmin(ip, port, timeoutMs);
      logAudit('biometric', 'CLEAR_ADMIN', ip, 'SUCCESS');
      return res;
    } catch (e) {
      logAudit('biometric', 'CLEAR_ADMIN', ip, 'FAILED', e.message);
      return { ok: false, error: e.message };
    }
  });

  // ── Thao tác đặc quyền: Mở khóa cửa kiểm soát ra vào ──────────────────────
  ipcMain.handle('biometric:unlock-door', async (_event, ip, port, durationSeconds, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      const res = await biometricService.unlockDeviceDoor(ip, port, durationSeconds, timeoutMs);
      logAudit('biometric', 'UNLOCK_DOOR', ip, 'SUCCESS', { durationSeconds });
      return res;
    } catch (e) {
      logAudit('biometric', 'UNLOCK_DOOR', ip, 'FAILED', e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:get-users', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      return await biometricService.getDeviceUsersList(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message, users: [] };
    }
  });

  // ── Thao tác đặc quyền: Xóa người dùng trên máy ───────────────────────────
  ipcMain.handle('biometric:delete-user', async (_event, ip, port, uid, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      const res = await biometricService.deleteDeviceUser(ip, port, uid, timeoutMs);
      logAudit('biometric', 'DELETE_USER', ip, 'SUCCESS', { uid });
      return res;
    } catch (e) {
      logAudit('biometric', 'DELETE_USER', ip, 'FAILED', e.message);
      return { ok: false, error: e.message };
    }
  });

  // ── Thao tác đặc quyền: Xóa toàn bộ lịch sử điểm danh ─────────────────────
  ipcMain.handle('biometric:clear-logs', async (_event, ip, port, timeoutMs) => {
    if (!isValidLanIp(ip)) return { ok: false, error: 'Địa chỉ IP không hợp lệ' };
    try {
      const res = await biometricService.clearDeviceAttendanceLogs(ip, port, timeoutMs);
      logAudit('biometric', 'CLEAR_ATTENDANCE_LOGS', ip, 'SUCCESS');
      return res;
    } catch (e) {
      logAudit('biometric', 'CLEAR_ATTENDANCE_LOGS', ip, 'FAILED', e.message);
      return { ok: false, error: e.message };
    }
  });
}

module.exports = {
  registerBiometricIPC,
};
