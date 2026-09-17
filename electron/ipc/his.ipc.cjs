const { ipcMain, dialog } = require('electron');
const { hisConnManager, sql } = require('../services/his/hisConnectionManager.cjs');
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
      const pool = await hisConnManager.getPool(connStr);

      const roomCodes = String(roomCode || '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
      const hasRoomFilter = roomCodes.length > 0;

      let query;
      const req = pool.request();

      if (hasRoomFilter) {
        const paramNames = roomCodes.map((_, i) => `@p${i}`).join(',');
        roomCodes.forEach((code, i) => req.input(`p${i}`, sql.Int, code));

        query = `
          DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
          DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

          SELECT 
            TRY_CAST(dk.sothutudk AS INT) AS SoThuTu, 
            dk.makcb      AS MaBenhNhan, 
            dk.hoten      AS TenBenhNhan,
            dk.maphong    AS MaPhong,
            CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
            CASE
              WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
              WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
              ELSE NULL
            END AS Tuoi,
            CASE
              WHEN kb.makcb IS NULL THEN 0
              WHEN kb.chuakham = 1  THEN 0
              ELSE 1
            END AS DaKham
          FROM dangky dk
          LEFT JOIN khambenh kb 
            ON kb.makcb = dk.makcb 
            AND kb.maphong = dk.maphong
            AND kb.ngay >= @StartOfDay AND kb.ngay < @StartOfNextDay
          WHERE dk.maphong IN (${paramNames})
            AND dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay

          UNION ALL

          SELECT 
            TRY_CAST(tt.thutu AS INT) AS SoThuTu,
            tt.makcb AS MaBenhNhan,
            dk.hoten AS TenBenhNhan,
            tt.manoithuchien AS MaPhong,
            CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
            CASE
              WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
              WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
              ELSE NULL
            END AS Tuoi,
            CASE WHEN tt.coketqua = 1 OR tt.coketqua = 'True' OR tt.maygoi = '1' OR tt.maygoi = 'True' THEN 1 ELSE 0 END AS DaKham
          FROM thutuchidinh tt
          JOIN dangky dk ON tt.makcb = dk.makcb
          WHERE tt.manoithuchien IN (${paramNames})
            AND tt.ngay >= @StartOfDay AND tt.ngay < @StartOfNextDay

          ORDER BY SoThuTu ASC, GioDangKy ASC
        `;
      } else {
        query = `
          DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
          DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

          SELECT 
            TRY_CAST(dk.sothutudk AS INT) AS SoThuTu, 
            dk.makcb      AS MaBenhNhan, 
            dk.hoten      AS TenBenhNhan,
            dk.maphong    AS MaPhong,
            CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
            CASE
              WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
              WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
              ELSE NULL
            END AS Tuoi,
            CASE
              WHEN kb.makcb IS NULL THEN 0
              WHEN kb.chuakham = 1  THEN 0
              ELSE 1
            END AS DaKham
          FROM dangky dk
          LEFT JOIN khambenh kb 
            ON kb.makcb = dk.makcb 
            AND kb.maphong = dk.maphong
            AND kb.ngay >= @StartOfDay AND kb.ngay < @StartOfNextDay
          WHERE dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay

          UNION ALL

          SELECT 
            TRY_CAST(tt.thutu AS INT) AS SoThuTu,
            tt.makcb AS MaBenhNhan,
            dk.hoten AS TenBenhNhan,
            tt.manoithuchien AS MaPhong,
            CONVERT(varchar(8), dk.ngaydk, 108) AS GioDangKy,
            CASE
              WHEN dk.ngaysinh IS NOT NULL THEN YEAR(GETDATE()) - YEAR(dk.ngaysinh)
              WHEN dk.tuoi IS NOT NULL THEN TRY_CAST(LEFT(dk.tuoi, 2) AS INT)
              ELSE NULL
            END AS Tuoi,
            CASE WHEN tt.coketqua = 1 OR tt.coketqua = 'True' OR tt.maygoi = '1' OR tt.maygoi = 'True' THEN 1 ELSE 0 END AS DaKham
          FROM thutuchidinh tt
          JOIN dangky dk ON tt.makcb = dk.makcb
          WHERE tt.ngay >= @StartOfDay AND tt.ngay < @StartOfNextDay

          ORDER BY SoThuTu ASC, GioDangKy ASC
        `;
      }

      const result = await req.query(query);
      return { ok: true, data: result.recordset };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Lấy danh sách phòng từ DB ──────────────────────────────────────────────
  ipcMain.handle('his-call:fetch-rooms', async (_event, connStr) => {
    try {
      const pool = await hisConnManager.getPool(connStr);
      const result = await pool.request().query(`
        DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
        DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

        SELECT DISTINCT dk.maphong,
          CONCAT(N'Phòng ', dk.maphong, N' (', COUNT(*) OVER (PARTITION BY dk.maphong), N' BN)') AS tenphong
        FROM dangky dk
        WHERE dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay
        ORDER BY dk.maphong
      `);
      return { ok: true, data: result.recordset };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Cập nhật trạng thái gọi bệnh nhân ──────────────────────────────────────
  ipcMain.handle('his-call:update-patient', async (_event, connStr, maBenhNhan) => {
    try {
      const pool = await hisConnManager.getPool(connStr);
      await pool.request()
        .input('makcb', sql.NVarChar, String(maBenhNhan))
        .query(`
          DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
          DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

          UPDATE khambenh
          SET chuakham = 0
          WHERE makcb = @makcb
            AND ngay >= @StartOfDay AND ngay < @StartOfNextDay
            AND chuakham = 1;

          IF NOT EXISTS (
            SELECT 1 FROM khambenh
            WHERE makcb = @makcb
              AND ngay >= @StartOfDay AND ngay < @StartOfNextDay
          )
          BEGIN
            INSERT INTO khambenh (makcb, maphong, ngay, chuakham)
            SELECT dk.makcb, dk.maphong, GETDATE(), 0
            FROM dangky dk
            WHERE dk.makcb = @makcb
              AND dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay;
          END;

          UPDATE thutuchidinh
          SET maygoi = '1'
          WHERE makcb = @makcb
            AND ngay >= @StartOfDay AND ngay < @StartOfNextDay;
        `);
      return { ok: true };
    } catch (e) {
      return { ok: true, rowsAffected: 0, warn: e.message };
    }
  });

  // ── Lấy bệnh nhân được gọi gần nhất từ khambenh (auto-sync TV) ──────────────
  ipcMain.handle('his-call:latest-called', async (_event, connStr, roomCode) => {
    try {
      const pool = await hisConnManager.getPool(connStr);
      const roomInt = parseInt(roomCode, 10);
      const hasRoom = !isNaN(roomInt) && roomInt > 0;
      const q = `
        DECLARE @StartOfDay DATETIME = DATEADD(day, DATEDIFF(day, 0, GETDATE()), 0);
        DECLARE @StartOfNextDay DATETIME = DATEADD(day, 1, @StartOfDay);

        SELECT TOP 1 kb.makcb AS MaBenhNhan, dk.hoten AS TenBenhNhan, dk.sothutudk AS SoThuTu, kb.ngay AS ThoiGian
        FROM khambenh kb
        JOIN dangky dk ON dk.makcb = kb.makcb AND dk.ngaydk >= @StartOfDay AND dk.ngaydk < @StartOfNextDay
        WHERE ${hasRoom ? 'kb.maphong = @p AND' : ''} kb.ngay >= @StartOfDay AND kb.ngay < @StartOfNextDay
        ORDER BY kb.ngay DESC
      `;
      const req = pool.request();
      if (hasRoom) req.input('p', sql.Int, roomInt);
      const result = await req.query(q);
      return { ok: true, data: result.recordset[0] || null };
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
