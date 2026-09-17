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

  // ── Endoscopy Local Database & Capture ────────────────────────────────────
  const ENDOSCOPY_DB_PATH = path.join(app.getPath('userData'), 'endoscopy_db.json');
  const ENDOSCOPY_IMG_ROOT = path.join(app.getPath('pictures'), 'DMH_Endoscopy_Images');

  function loadEndoDb() {
    try {
      if (fs.existsSync(ENDOSCOPY_DB_PATH)) {
        return JSON.parse(fs.readFileSync(ENDOSCOPY_DB_PATH, 'utf8'));
      }
    } catch (e) { console.error('Lỗi đọc Endoscopy DB:', e); }
    return { patients: [], sessions: [], images: [], seq: { patients: 0, sessions: 0, images: 0 } };
  }

  function saveEndoDb(db) {
    try { fs.writeFileSync(ENDOSCOPY_DB_PATH, JSON.stringify(db, null, 2)); }
    catch (e) { console.error('Lỗi ghi Endoscopy DB:', e); }
  }

  ipcMain.handle('endoscopy:db-stats', async () => {
    const db = loadEndoDb();
    let totalSize = 0;
    db.images.forEach(i => totalSize += (i.file_size_kb || 0));
    return {
      total_patients: db.patients.length,
      total_sessions: db.sessions.length,
      total_images: db.images.length,
      total_size_mb: Math.round(totalSize / 1024)
    };
  });

  ipcMain.handle('endoscopy:get-patients', async (_e, q) => {
    const db = loadEndoDb();
    let pts = db.patients;
    if (q) {
      const lowerQ = q.toLowerCase();
      pts = pts.filter(p => p.full_name.toLowerCase().includes(lowerQ) || (p.patient_code && p.patient_code.toLowerCase().includes(lowerQ)));
    }
    pts.sort((a, b) => b.id - a.id);
    return { patients: pts };
  });

  ipcMain.handle('endoscopy:add-patient', async (_e, data) => {
    const db = loadEndoDb();
    db.seq.patients++;
    const p = {
      id: db.seq.patients,
      full_name: data.full_name || '',
      birth_year: data.birth_year || '',
      gender: data.gender || 'Nam',
      patient_code: data.patient_code || ('BN' + String(db.seq.patients).padStart(5, '0')),
      phone: data.phone || '',
      created_at: new Date().toISOString()
    };
    db.patients.push(p);
    saveEndoDb(db);
    return { ok: true, patient: p };
  });

  ipcMain.handle('endoscopy:get-sessions', async (_e, patient_id) => {
    const db = loadEndoDb();
    const sessions = db.sessions.filter(s => s.patient_id === patient_id);
    sessions.sort((a, b) => b.id - a.id);
    sessions.forEach(s => {
      s.image_count = db.images.filter(i => i.session_id === s.id).length;
    });
    return { sessions };
  });

  ipcMain.handle('endoscopy:create-session', async (_e, data) => {
    const db = loadEndoDb();
    const pt = db.patients.find(p => p.id === data.patient_id);
    if (!pt) return { ok: false, error: 'Không tìm thấy bệnh nhân' };

    db.seq.sessions++;
    const sDate = new Date();
    const dateStr = sDate.toLocaleDateString('vi-VN');
    const folderName = `${pt.patient_code}_${pt.full_name.replace(/[^a-z0-9]/gi, '_')}_${sDate.getTime()}`;
    const folderPath = path.join(ENDOSCOPY_IMG_ROOT, folderName);
    
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const s = {
      id: db.seq.sessions,
      patient_id: data.patient_id,
      exam_type: data.exam_type || 'Nội soi',
      doctor_name: data.doctor_name || '',
      exam_date: dateStr,
      folder_path: folderPath,
      created_at: sDate.toISOString()
    };
    db.sessions.push(s);
    saveEndoDb(db);
    return { ok: true, session: s };
  });

  ipcMain.handle('endoscopy:get-images', async (_e, session_id) => {
    const db = loadEndoDb();
    const imgs = db.images.filter(i => i.session_id === session_id);
    imgs.sort((a, b) => a.id - b.id);
    return { images: imgs };
  });

  ipcMain.handle('endoscopy:toggle-fav', async (_e, image_id) => {
    const db = loadEndoDb();
    const img = db.images.find(i => i.id === image_id);
    if (!img) return { ok: false };
    img.is_favorite = img.is_favorite ? 0 : 1;
    saveEndoDb(db);
    return { ok: true, is_favorite: img.is_favorite === 1 };
  });

  ipcMain.handle('endoscopy:save-capture', async (_e, session_id, base64Data, resolution) => {
    const db = loadEndoDb();
    const sess = db.sessions.find(s => s.id === session_id);
    if (!sess) return { ok: false, error: 'Session không tồn tại' };

    db.seq.images++;
    const imgId = db.seq.images;
    const fileName = `IMG_${imgId}_${Date.now()}.jpg`;
    const filePath = path.join(sess.folder_path, fileName);
    
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, buffer);
    const sizeKb = Math.round(buffer.length / 1024);

    const img = {
      id: imgId,
      session_id: session_id,
      original_path: filePath,
      processed_path: filePath,
      thumbnail_path: filePath,
      file_size_kb: sizeKb,
      resolution: resolution || '1920x1080',
      trigger_type: 'Software',
      is_favorite: 0,
      captured_at: new Date().toLocaleTimeString('vi-VN')
    };
    db.images.push(img);
    saveEndoDb(db);
    return { ok: true, image: img };
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
        } catch {}
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
    exec('devmgmt.msc', { windowsHide: false });
    return { ok: true };
  });

  ipcMain.handle('endoscopy:open-camera-app', async () => {
    exec('start microsoft.windows.camera:', { shell: true, windowsHide: false });
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
    if (!resolved.startsWith(home)) return { ok: false, error: 'Đường dẫn không hợp lệ' };
    shell.openPath(resolved);
    return { ok: true };
  });

  ipcMain.handle('endoscopy:open-file', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return { ok: false };
    const home = os.homedir();
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(home)) return { ok: false, error: 'Đường dẫn không hợp lệ' };
    shell.openPath(resolved);
    return { ok: true };
  });
}

module.exports = {
  registerEndoscopyIPC,
};
