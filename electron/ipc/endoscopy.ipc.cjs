const { ipcMain, app, desktopCapturer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn, exec } = require('child_process');

const isDev = app ? !app.isPackaged : true;

function getCameraDriverScript() {
  if (!isDev) {
    return path.join(process.resourcesPath, 'scripts', 'install_camera_driver.ps1');
  }
  return path.join(__dirname, '../../scripts/install_camera_driver.ps1');
}

/**
 * endoscopy.ipc.cjs - Module IPC Nội Soi AI 4K, Quản lý ảnh, OCR và Camera DirectShow
 */
function registerEndoscopyIPC() {
  // ── Liệt kê USB Camera qua PowerShell/WMI ─────────────────────────────────
  ipcMain.handle('endoscopy:list-cameras', async () => {
    try {
      const script = `
        $cameras = @()
        $idx = 0
        Get-PnpDevice -Class Camera -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
          $cameras += [PSCustomObject]@{ index=$idx; name=$_.FriendlyName; deviceId=$_.InstanceId }
          $idx++
        }
        Get-PnpDevice -Class Image -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
          if ($_.FriendlyName -match 'cam|video|usb|capture|nội soi|endoscopy') {
            $cameras += [PSCustomObject]@{ index=$idx; name=$_.FriendlyName; deviceId=$_.InstanceId }
            $idx++
          }
        }
        $wmiCams = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -match 'cam|video capture|usb video|webcam|uvc' }
        $wmiCams | ForEach-Object {
          $alreadyIn = $cameras | Where-Object { $_.name -eq $_.Name }
          if (-not $alreadyIn) {
            $cameras += [PSCustomObject]@{ index=$idx; name=$_.Name; deviceId=$_.DeviceID }
            $idx++
          }
        }
        if ($cameras.Count -eq 0) {
          Write-Output '[]'
        } else {
          $cameras | ConvertTo-Json -Compress
        }
      `;
      const result = await new Promise((resolve, reject) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
          { timeout: 10000, encoding: 'utf8' },
          (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout.trim());
          }
        );
      });
      const raw = JSON.parse(result || '[]');
      const list = Array.isArray(raw) ? raw : [raw];
      return { ok: true, cameras: list.map((c, i) => ({ index: i, name: c.name || `Camera ${i}`, deviceId: c.deviceId || '' })) };
    } catch (e) {
      return { ok: false, cameras: [], error: e.message };
    }
  });

  // ── Lấy nguồn quay màn hình / cửa sổ ───────────────────────────────────────
  ipcMain.handle('endoscopy:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 150, height: 150 },
        fetchWindowIcons: true
      });
      return {
        ok: true,
        sources: sources.map(s => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail.toDataURL(),
          appIcon: s.appIcon ? s.appIcon.toDataURL() : null
        }))
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Endoscopy SQLite Database & Image Storage ──────────────────────────────
  const { getEndoscopyRepository } = require('../repositories/endoscopy.repository.cjs');
  const { createEndoscopyBackup, restoreEndoscopyBackup } = require('../services/endoscopy/endoscopyBackup.cjs');
  const ENDOSCOPY_DB_PATH = path.join(app.getPath('userData'), 'endoscopy_db.json');

  // Tự động phát hiện ổ dữ liệu (D:, E:, F:) để tránh ghi đầy ổ C hệ thống (Quy tắc 1.4)
  function getEndoscopyImageRoot() {
    const driveCandidates = ['D:', 'E:', 'F:'];
    for (const drive of driveCandidates) {
      try {
        const rootPath = `${drive}\\`;
        if (fs.existsSync(rootPath)) {
          const dataFolder = path.join(rootPath, 'DMH_Endoscopy_Images');
          if (!fs.existsSync(dataFolder)) {
            try { fs.mkdirSync(dataFolder, { recursive: true }); } catch (_e) { /* intentional: safe fallback */ }
          }
          if (fs.existsSync(dataFolder)) {
            console.log(`[EndoStorage] Đã chọn ổ lưu trữ dữ liệu ảnh nội soi: ${dataFolder}`);
            return dataFolder;
          }
        }
      } catch (_e) { /* intentional: safe fallback */ }
    }
    const fallback = path.join(app.getPath('pictures'), 'DMH_Endoscopy_Images');
    if (!fs.existsSync(fallback)) {
      try { fs.mkdirSync(fallback, { recursive: true }); } catch (_e) { /* intentional: safe fallback */ }
    }
    return fallback;
  }

  const ENDOSCOPY_IMG_ROOT = getEndoscopyImageRoot();
  const repo = getEndoscopyRepository();

  // Tự động chuyển đổi dữ liệu cũ từ endoscopy_db.json sang SQLite (nếu có)
  try {
    repo.migrateFromJson(ENDOSCOPY_DB_PATH);
  } catch (migErr) {
    console.warn('[EndoDB] Migration check:', migErr.message);
  }

  ipcMain.handle('endoscopy:db-stats', async () => {
    try {
      return repo.getStats();
    } catch (e) {
      return { total_patients: 0, total_sessions: 0, total_images: 0, total_size_mb: 0 };
    }
  });

  ipcMain.handle('endoscopy:get-patients', async (_e, q) => {
    try {
      const pts = repo.getPatients(q);
      return { patients: pts };
    } catch (e) {
      console.error('[EndoDB] Lỗi lấy danh sách bệnh nhân:', e);
      return { patients: [] };
    }
  });

  ipcMain.handle('endoscopy:add-patient', async (_e, data) => {
    try {
      const p = repo.addPatient(data);
      return { ok: true, patient: p };
    } catch (e) {
      console.error('[EndoDB] Lỗi thêm bệnh nhân:', e);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('endoscopy:get-sessions', async (_e, patient_id) => {
    try {
      const sessions = repo.getSessions(patient_id);
      return { sessions };
    } catch (e) {
      console.error('[EndoDB] Lỗi lấy phiên khám:', e);
      return { sessions: [] };
    }
  });

  ipcMain.handle('endoscopy:create-session', async (_e, data) => {
    try {
      const s = repo.createSession(data, ENDOSCOPY_IMG_ROOT);
      return { ok: true, session: s };
    } catch (e) {
      console.error('[EndoDB] Lỗi tạo phiên khám:', e);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('endoscopy:get-images', async (_e, session_id) => {
    try {
      const imgs = repo.getImages(session_id);
      return { images: imgs };
    } catch (e) {
      console.error('[EndoDB] Lỗi lấy ảnh phiên khám:', e);
      return { images: [] };
    }
  });

  ipcMain.handle('endoscopy:toggle-fav', async (_e, image_id) => {
    try {
      const isFav = repo.toggleFavorite(image_id);
      return { ok: true, is_favorite: isFav };
    } catch (e) {
      return { ok: false };
    }
  });

  ipcMain.handle('endoscopy:save-capture', async (_e, session_id, base64Data, resolution) => {
    try {
      const img = repo.saveCapture(session_id, base64Data, resolution);
      return { ok: true, image: img };
    } catch (e) {
      console.error('[EndoDB] Lỗi lưu ảnh chụp:', e);
      return { ok: false, error: e.message };
    }
  });

  // ── Backup & Restore Endoscopy Data ───────────────────────────────────────
  ipcMain.handle('endoscopy:backup', async (_e, targetZipPath) => {
    return await createEndoscopyBackup(targetZipPath);
  });

  ipcMain.handle('endoscopy:restore', async (_e, sourceZipPath) => {
    return await restoreEndoscopyBackup(sourceZipPath);
  });

  // ── OCR AI Nhận diện vùng nội soi ─────────────────────────────────────────
  ipcMain.handle('endoscopy:recognize-image', async (_e, base64Data) => {
    try {
      const { createWorker } = require('tesseract.js');
      const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const worker = await createWorker('vie+eng', 1, { logger: () => {} });
      const { data } = await worker.recognize(buffer);
      await worker.terminate();
      return {
        ok: true,
        text: data.text.trim(),
        confidence: data.confidence,
        words: (data.words || []).map(w => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox,
        })),
      };
    } catch (e) {
      console.error('[OCR] Lỗi nhận diện:', e);
      return { ok: false, error: e.message, text: '' };
    }
  });

  // ── Cài đặt Camera Driver ─────────────────────────────────────────────────
  ipcMain.handle('endoscopy:install-camera-driver', async (event) => {
    const scriptPath = getCameraDriverScript();
    if (!fs.existsSync(scriptPath)) {
      return { ok: false, error: 'Script không tồn tại: ' + scriptPath };
    }

    return new Promise((resolve) => {
      const sender = event.sender;
      const sendLog = (line) => {
        try {
          if (!sender.isDestroyed()) sender.send('endoscopy:driver-log', line);
        } catch (_e) { /* intentional: safe fallback */ }
      };

      const tmpScript = path.join(os.tmpdir(), 'dmh_cam_install.ps1');
      try {
        fs.copyFileSync(scriptPath, tmpScript);
      } catch (copyErr) {
        sendLog(`ERR:Không copy được script: ${copyErr.message}`);
        return resolve({ ok: false, error: copyErr.message });
      }

      const psArgs = ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScript];
      const proc = spawn('powershell', psArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });

      let outputLines = [];
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (data) => {
        const lines = data.split(/\r?\n/).filter(l => l.trim());
        for (const line of lines) {
          outputLines.push(line);
          sendLog(line);
        }
      });

      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (data) => {
        const lines = data.split(/\r?\n/).filter(l => l.trim());
        for (const line of lines) {
          outputLines.push('ERR:' + line);
          sendLog('ERR:' + line);
        }
      });

      proc.on('exit', (code) => {
        const exitCode = code !== null && code !== undefined ? code : 0;
        sendLog(`EXIT:${exitCode}`);
        resolve({
          ok: exitCode === 0,
          exitCode,
          lines: outputLines,
          message: exitCode === 0 ? 'Cài driver thành công! Nhấn Rescan để tìm camera.' : 'Lỗi cài driver.',
        });
      });

      proc.on('error', (err) => {
        sendLog(`ERR:${err.message}`);
        resolve({ ok: false, error: err.message, lines: outputLines });
      });

      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
          sendLog('ERR:Timeout 60s');
          resolve({ ok: false, error: 'Timeout', lines: outputLines });
        }
      }, 60000);
    });
  });

  ipcMain.handle('endoscopy:open-device-manager', async () => {
    execFile('mmc.exe', ['devmgmt.msc'], { windowsHide: false }, (err) => {
      if (err) console.error('[ENDOSCOPY] open-device-manager error:', err.message);
    });
    return { ok: true };
  });

  ipcMain.handle('endoscopy:open-camera-app', async () => {
    shell.openExternal('microsoft.windows.camera:');
    return { ok: true };
  });

  ipcMain.handle('endoscopy:open-driver-url', async (_event, url) => {
    const safeUrl = typeof url === 'string' && url.startsWith('http') ? url : 'https://www.magewell.com/downloads/usb-capture';
    shell.openExternal(safeUrl);
    return { ok: true };
  });

  ipcMain.handle('endoscopy:open-folder', async (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') return { ok: false };
    const home = os.homedir();
    const resolved = path.resolve(folderPath);
    if (!resolved.startsWith(home) && !resolved.startsWith(ENDOSCOPY_IMG_ROOT)) {
      return { ok: false, error: 'Đường dẫn không hợp lệ (Chặn truy cập ngoài phạm vi)' };
    }
    shell.openPath(resolved);
    return { ok: true };
  });

  ipcMain.handle('endoscopy:open-file', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return { ok: false };
    const home = os.homedir();
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(home) && !resolved.startsWith(ENDOSCOPY_IMG_ROOT)) {
      return { ok: false, error: 'Đường dẫn không hợp lệ (Chặn truy cập ngoài phạm vi)' };
    }
    shell.openPath(resolved);
    return { ok: true };
  });
}

module.exports = {
  registerEndoscopyIPC,
};
