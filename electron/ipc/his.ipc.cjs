const { ipcMain, dialog } = require('electron');
const { hisRepository } = require('../repositories/his.repository.cjs');
const { logAudit } = require('../security/auditLogger.cjs');
const windowManager = require('../windows/windowManager.cjs');

/**
 * his.ipc.cjs - Module quản lý IPC Gọi Bệnh Nhân & Hàng Đợi HIS
 * - Tái sử dụng SQL Server Connection Pool qua hisConnManager
 * - Truy vấn Sargable tối ưu B-Tree Index trên SQL Server bệnh viện
 * - Điều khiển màn hình TV hàng chờ và Widget điều khiển mini nổi
 */
function registerHisIPC(speakWithPiper) {
  // ── Lấy danh sách bệnh nhân chờ khám từ SQL Server (Tối ưu Sargable Index) ──
  ipcMain.handle('his-call:fetch-patients', async (_event, connStr, roomCode) => {
    try {
      const data = await hisRepository.fetchPatients(connStr, roomCode);
      return { ok: true, data };
    } catch (e) {
      console.error('[HIS_IPC] Lỗi lấy danh sách bệnh nhân:', e);
      return { ok: false, error: e.message };
    }
  });

  // ── Lấy danh sách phòng từ DB ──────────────────────────────────────────────
  ipcMain.handle('his-call:fetch-rooms', async (_event, connStr) => {
    try {
      const data = await hisRepository.fetchRooms(connStr);
      return { ok: true, data };
    } catch (e) {
      console.error('[HIS_IPC] Lỗi lấy danh sách phòng:', e);
      return { ok: false, error: e.message };
    }
  });

  // ── Cập nhật trạng thái gọi bệnh nhân ──────────────────────────────────────
  ipcMain.handle('his-call:update-patient', async (_event, connStr, maBenhNhan) => {
    try {
      await hisRepository.updatePatientCalled(connStr, maBenhNhan);
      logAudit('his', 'UPDATE_PATIENT_CALLED', String(maBenhNhan), 'SUCCESS');
      return { ok: true };
    } catch (e) {
      logAudit('his', 'UPDATE_PATIENT_CALLED', String(maBenhNhan), 'FAILED', e.message);
      return { ok: true, rowsAffected: 0, warn: e.message };
    }
  });

  // ── Lấy bệnh nhân được gọi gần nhất từ khambenh (auto-sync TV) ──────────────
  ipcMain.handle('his-call:latest-called', async (_event, connStr, roomCode) => {
    try {
      const data = await hisRepository.getLatestCalled(connStr, roomCode);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Chọn logo phòng khám ───────────────────────────────────────────────────
  ipcMain.handle('his-call:select-logo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'gif', 'bmp', 'webp'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return { ok: true, path: result.filePaths[0] };
    }
    return { ok: false };
  });

  // ── Piper TTS ──────────────────────────────────────────────────────────────
  ipcMain.handle('queue:speak-piper', async (_event, text, voice = 'default') => {
    if (!text || typeof text !== 'string') return false;
    const safeText = text.slice(0, 300);
    if (typeof speakWithPiper === 'function') {
      return speakWithPiper(safeText, voice);
    }
    return false;
  });

  // ── Queue Display Window Controls ──────────────────────────────────────────
  ipcMain.handle('queue:open-display', async (_event, options) => {
    return windowManager.openQueueDisplay(options);
  });
  ipcMain.handle('queue:close-display', async () => {
    return windowManager.closeQueueDisplay();
  });
  ipcMain.handle('queue:is-open', async () => {
    return windowManager.isQueueDisplayOpen();
  });
  ipcMain.handle('queue:update-display', async (_event, data) => {
    return windowManager.updateQueueDisplay(data);
  });

  // ── Float Control Window Controls ──────────────────────────────────────────
  ipcMain.handle('float:open', async () => {
    return windowManager.createFloatWindow();
  });
  ipcMain.handle('float:close', async () => {
    const fw = windowManager.getFloatWin();
    if (fw && !fw.isDestroyed()) {
      fw.close();
      windowManager.setFloatWin(null);
    }
    const mw = windowManager.getMainWin();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('float:status-changed', false);
    }
    return { ok: true };
  });
  ipcMain.handle('float:minimize', async () => {
    const fw = windowManager.getFloatWin();
    if (fw && !fw.isDestroyed()) fw.minimize();
    return { ok: true };
  });
  ipcMain.handle('float:resize', async (_event, w, h) => {
    const fw = windowManager.getFloatWin();
    if (fw && !fw.isDestroyed()) {
      fw.setMinimumSize(10, 10);
      fw.setSize(Math.round(w), Math.round(h));
    }
    return { ok: true };
  });
  ipcMain.handle('float:is-open', async () => {
    const fw = windowManager.getFloatWin();
    return { open: !!(fw && !fw.isDestroyed()) };
  });
  ipcMain.on('float:action', (_event, action) => {
    const mw = windowManager.getMainWin();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('float:action', action);
    }
  });
  ipcMain.handle('float:push-state', async (_event, data) => {
    const fw = windowManager.getFloatWin();
    if (fw && !fw.isDestroyed()) {
      fw.webContents.send('float:state-update', data);
      return { ok: true };
    }
    return { ok: false };
  });

  // ── HIS Call (TCP LAN) ───────────────────────────────────────────────────
  ipcMain.handle('his-call:send-tcp', async (_event, ip, port, message) => {
    return new Promise((resolve) => {
      if (!ip || !port || !message) {
        return resolve({ ok: false, error: 'Thiếu tham số (ip, port, message)' });
      }
      const net = require('net');
      const client = new net.Socket();
      client.setTimeout(3000);

      client.connect(port, ip, () => {
        try {
          const data = Buffer.from(message, 'utf8');
          client.write(data);
          resolve({ ok: true, msg: 'Đã gửi lệnh' });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        } finally {
          client.end();
        }
      });

      client.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });

      client.on('timeout', () => {
        client.destroy();
        resolve({ ok: false, error: 'Kết nối quá thời gian chờ (timeout)' });
      });
    });
  });
}

module.exports = {
  registerHisIPC,
};
