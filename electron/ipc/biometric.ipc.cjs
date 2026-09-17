const { ipcMain } = require('electron');
const biometricService = require('../biometricNetworkService.cjs');

/**
 * biometric.ipc.cjs - Module IPC Máy Chấm Công (ZKTeco / Ronald Jack qua mạng LAN)
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
    try {
      return await biometricService.scanLanBiometricDevices(subnet, port);
    } catch (e) {
      return { ok: false, error: e.message, count: 0, devices: [] };
    }
  });

  ipcMain.handle('biometric:test-connection', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.testBiometricConnection(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:pull-logs', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.pullBiometricAttendanceLogs(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:get-device-status', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.getDeviceFullStatus(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:sync-time', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.syncDeviceTime(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:test-voice', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.testDeviceVoice(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:reboot', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.rebootDevice(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:clear-admin', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.clearDeviceAdmin(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:unlock-door', async (_event, ip, port, durationSeconds, timeoutMs) => {
    try {
      return await biometricService.unlockDeviceDoor(ip, port, durationSeconds, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:get-users', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.getDeviceUsersList(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message, users: [] };
    }
  });

  ipcMain.handle('biometric:delete-user', async (_event, ip, port, uid, timeoutMs) => {
    try {
      return await biometricService.deleteDeviceUser(ip, port, uid, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('biometric:clear-logs', async (_event, ip, port, timeoutMs) => {
    try {
      return await biometricService.clearDeviceAttendanceLogs(ip, port, timeoutMs);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = {
  registerBiometricIPC,
};
