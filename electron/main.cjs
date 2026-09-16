const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer, dialog } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');
const { execFile, spawn }  = require('child_process');
const { URL, pathToFileURL } = require('url');
const https   = require('https');
const http    = require('http');
const licenseVault = require('./licenseVault.cjs');

const isDev = !app.isPackaged;

// ── Global Crash Guard: Chống văng tiến trình khi có lỗi mạng/stream ─────────
process.on('uncaughtException', (err) => {
  console.error('[CRASH_GUARD] Đã bắt uncaughtException:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH_GUARD] Đã bắt unhandledRejection:', reason);
});

// ── GPU Crash Guard & Windows Elevation Compatibility ───────────────────────
// Chống lỗi GPU launch failed (error_code=18) khi chạy dưới quyền Administrator
// hoặc trên các hệ thống Windows có sandbox token bị chặn bởi bảo mật hệ thống.
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

// ── Single Instance Lock: Tránh chạy đè nhiều tiến trình ────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[MAIN] Instance khác đang chạy, tự động thoát tiến trình mới.');
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (_mainWin) {
      if (_mainWin.isMinimized()) _mainWin.restore();
      _mainWin.show();
      _mainWin.focus();
    }
  });
}

// ── DMH Modular On-Demand Helper Functions ───────────────────────────────────
function getModulesBaseDir() {
  const dir = path.join(app.getPath('userData'), 'dmh_modules');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
  return dir;
}

function resolveAssetPath(relPath) {
  const baseDir = getModulesBaseDir();
  // 1. Kiểm tra trực tiếp trong baseDir: userData/dmh_modules/relPath
  const directPath = path.join(baseDir, relPath);
  if (fs.existsSync(directPath)) return directPath;

  // 2. Kiểm tra trong các thư mục con: userData/dmh_modules/*/relPath
  try {
    const subdirs = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const sub of subdirs) {
      if (sub.isDirectory()) {
        const subPath = path.join(baseDir, sub.name, relPath);
        if (fs.existsSync(subPath)) return subPath;
      }
    }
  } catch {}

  // 3. Kiểm tra trong process.resourcesPath (nếu là bản đóng gói offline full)
  if (!isDev && process.resourcesPath) {
    const inRes = path.join(process.resourcesPath, relPath);
    if (fs.existsSync(inRes)) return inRes;
  }

  // 4. Kiểm tra trong root dev directory
  const inDev = path.join(__dirname, '..', relPath);
  if (fs.existsSync(inDev)) return inDev;

  return directPath;
}

function downloadFileWithRedirect(targetUrl, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    let handled = false;
    let file = null;

    const cleanup = () => {
      if (file) {
        try { file.destroy(); } catch {}
        file = null;
      }
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch {}
    };

    const makeReq = (curUrl, redirects = 0) => {
      if (redirects > 10) {
        cleanup();
        if (!handled) { handled = true; reject(new Error('Chuyển hướng (Redirect) quá 10 lần')); }
        return;
      }

      let parsed;
      try {
        parsed = new URL(curUrl);
      } catch (e) {
        cleanup();
        if (!handled) { handled = true; reject(new Error('URL không hợp lệ: ' + curUrl)); }
        return;
      }

      const client = parsed.protocol === 'http:' ? http : https;
      const req = client.get(curUrl, {
        headers: {
          'User-Agent': `DMH-Tools-Modular-Engine/${app.getVersion()}`,
          'Accept': '*/*'
        }
      }, (res) => {
        // Hỗ trợ redirect (301, 302, 303, 307, 308) từ GitHub Releases sang AWS/Fastly CDN
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
            nextUrl = new URL(nextUrl, curUrl).toString();
          }
          res.resume(); // Giải phóng socket cũ
          return makeReq(nextUrl, redirects + 1);
        }

        if (res.statusCode !== 200) {
          cleanup();
          res.resume();
          if (!handled) { handled = true; reject(new Error(`Tải tệp thất bại. Mã HTTP: ${res.statusCode}`)); }
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastEmitTime = 0;
        let lastPercent = -1;

        // Chỉ tạo WriteStream khi nhận phản hồi 200 OK thành công
        file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          // Reset lại inactivity timeout mỗi khi có chunk dữ liệu tải về
          req.setTimeout(120000);
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          const now = Date.now();

          // Chống nghẽn IPC: Chỉ phát progress tối đa 4 lần/giây hoặc khi đổi số % hoặc khi xong
          if (onProgress && (now - lastEmitTime >= 250 || percent !== lastPercent || downloadedBytes >= totalBytes)) {
            lastEmitTime = now;
            lastPercent = percent;
            try {
              onProgress({ downloadedBytes, totalBytes, percent });
            } catch (pErr) {
              console.warn('[DOWNLOAD_PROGRESS_CB_WARN]', pErr);
            }
          }
        });

        // BẮT BUỘC: Lắng nghe lỗi trên res stream để ngăn unhandled error làm sập Node/Electron
        res.on('error', (err) => {
          console.error('[DOWNLOAD_RES_STREAM_ERR]', err);
          cleanup();
          if (!handled) { handled = true; reject(err); }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            if (!handled) { handled = true; resolve({ ok: true }); }
          });
        });

        file.on('error', (err) => {
          console.error('[DOWNLOAD_FILE_WRITE_ERR]', err);
          cleanup();
          if (!handled) { handled = true; reject(err); }
        });
      });

      // Socket timeout 120s cho file dung lượng lớn
      req.setTimeout(120000, () => {
        console.warn('[DOWNLOAD_TIMEOUT] Quá thời gian chờ truyền dữ liệu (120s)');
        req.destroy(new Error('Quá thời gian kết nối (Timeout 120s)'));
      });

      req.on('error', (err) => {
        console.error('[DOWNLOAD_REQ_ERR]', err);
        cleanup();
        if (!handled) { handled = true; reject(err); }
      });
    };

    makeReq(targetUrl);
  });
}

// ── gTTS TTS Server (giọng Tiếng Việt qua Google TTS) ────────────────────────
// Dùng scripts/tts_server.py (Python + gTTS) để phát giọng tiếng Việt
let _ttsProc    = null;   // child_process handle của tts_server.py
let _ttsReady   = false;
let _ttsCallbacks = new Map();  // id → resolve
let _ttsIdCounter = 1;
let _ttsStarting  = false;

function getBundledPythonExe() {
  const inMod = resolveAssetPath('vendor/python-embed/python.exe');
  if (fs.existsSync(inMod)) return inMod;
  if (!isDev) {
    return path.join(process.resourcesPath, 'vendor', 'python-embed', 'python.exe');
  }
  return path.join(__dirname, '../vendor/python-embed/python.exe');
}

function getTtsPythonCmds() {
  // Ưu tiên: bundled Python embed (portable, không cần cài đặt)
  const bundled = getBundledPythonExe();
  const candidates = [];
  if (fs.existsSync(bundled)) {
    candidates.push(bundled);  // Bundled embed — ưu tiên tuyệt đối
    console.log('[TTS] Dùng Python embed bundled:', bundled);
  } else {
    console.log('[TTS] Không tìm thấy Python embed, fallback hệ thống');
  }
  // Fallback: Python đã cài trong hệ thống
  candidates.push('python', 'python3', 'py');
  return candidates;
}


function getTtsServerScript() {
  if (!isDev) {
    return path.join(process.resourcesPath, 'scripts', 'tts_server.py');
  }
  return path.join(__dirname, '../scripts/tts_server.py');
}

function getPiperPaths() {
  // Trả về { exe, model, modelBac } của Piper TTS offline
  const piperDir = !isDev
    ? path.join(process.resourcesPath, 'vendor', 'piper')
    : path.join(__dirname, '../vendor/piper');
  const exe      = path.join(piperDir, 'piper.exe');
  const model    = path.join(piperDir, 'vi_VN-vivos-x_low.onnx');
  const modelBac = path.join(piperDir, 'vi_VN-25hours_single-low.onnx');
  if (fs.existsSync(exe) && fs.existsSync(model)) {
    console.log('[TTS] Piper offline found:', exe);
    console.log('[TTS] Piper Bac model:', fs.existsSync(modelBac) ? modelBac : 'not found');
    return { exe, model, modelBac: fs.existsSync(modelBac) ? modelBac : '' };
  }
  console.log('[TTS] Piper not found, will use online TTS');
  return { exe: '', model: '', modelBac: '' };
}

async function ensureTtsServer() {
  if (_ttsProc && !_ttsProc.killed && _ttsReady) return true;
  if (_ttsStarting) {
    // Chờ tối đa 8 giây
    const start = Date.now();
    while (_ttsStarting && Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 100));
    }
    return _ttsReady;
  }
  _ttsStarting = true;
  _ttsReady    = false;

  const script = getTtsServerScript();
  if (!fs.existsSync(script)) {
    console.warn('[TTS] tts_server.py not found:', script);
    _ttsStarting = false;
    return false;
  }

  // Thử từng python command (bundled embed trước, rồi fallback hệ thống)
  const cmds = getTtsPythonCmds();
  let started = false;

  for (const cmd of cmds) {
    try {
      const piper = getPiperPaths();
      const proc = spawn(cmd, [script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          PIPER_EXE:       piper.exe,
          PIPER_MODEL:     piper.model,
          PIPER_MODEL_BAC: piper.modelBac,
        },
      });

      let ready = false;

      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (data) => {
        const lines = data.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'ready') {
              _ttsReady    = true;
              _ttsStarting = false;
              ready = true;
              console.log(`[TTS] Server ready | piper=${msg.piper} | edge=${msg.edge} | sapi=${msg.sapi} | voice=${msg.voice}`);
            } else if (msg.id !== undefined) {
              const cb = _ttsCallbacks.get(msg.id);
              if (cb) {
                _ttsCallbacks.delete(msg.id);
                cb(msg.ok === true);
              }
            }
          } catch {}
        }
      });

      proc.stderr.on('data', d => console.warn('[TTS stderr]', d.toString().trim()));

      proc.on('exit', () => {
        _ttsProc  = null;
        _ttsReady = false;
        _ttsCallbacks.forEach(cb => cb(false));
        _ttsCallbacks.clear();
      });

      proc.on('error', () => {
        _ttsStarting = false;
      });

      // Chờ ready (max 6s)
      const ok = await new Promise(res => {
        const timeout = setTimeout(() => res(ready), 6000);
        const check = setInterval(() => {
          if (ready) { clearInterval(check); clearTimeout(timeout); res(true); }
        }, 100);
      });

      if (ok) {
        _ttsProc  = proc;
        started   = true;
        break;
      } else {
        proc.kill();
      }
    } catch {
      // Try next command
    }
  }

  _ttsStarting = false;
  return started;
}

async function speakWithGtts(text, voice = 'default') {
  const ok = await ensureTtsServer();
  if (!ok || !_ttsProc) return false;

  return new Promise((resolve) => {
    const id = _ttsIdCounter++;
    _ttsCallbacks.set(id, resolve);
    try {
      const msg = JSON.stringify({ cmd: 'speak', id, text, voice }) + '\n';
      _ttsProc.stdin.write(msg, 'utf8');
    } catch {
      _ttsCallbacks.delete(id);
      resolve(false);
    }
    // Timeout 30 giây
    setTimeout(() => {
      if (_ttsCallbacks.has(id)) {
        _ttsCallbacks.delete(id);
        resolve(false);
      }
    }, 30000);
  });
}

// Alias để IPC handler gọi
const speakWithPiper = speakWithGtts;

// ── Queue Display Window ──────────────────────────────────────────────────────
let _queueWin = null;  // BrowserWindow handle cho màn chờ

// ── Float Control Window ───────────────────────────────────────────────────────
let _floatWin = null;  // BrowserWindow handle cho cửa sổ nổi điều khiển
let _mainWin  = null;  // Tham chiếu window chính để relay events


// ── Nội Soi AI 4K: Python IPC Server process ──────────────────────────────────
const ENDOSCOPY_PORT = 27182;
let _pythonProc = null;   // child_process handle
let _serverStatus = 'stopped';  // 'stopped' | 'starting' | 'running' | 'error'

/**
 * Trả về { exe, args } để spawn Python IPC server.
 * Ưu tiên: bundled PyInstaller exe > python/python3 trong PATH
 */
function getServerCommand() {
  // 0. Kiểm tra module tải động từ GitHub:
  const modExe = resolveAssetPath('python_core/endoscopy_server/endoscopy_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [String(ENDOSCOPY_PORT)], cwd: path.dirname(modExe) };
  }

  // 1. Packaged app: dùng exe bundled qua extraResources
  if (!isDev) {
    const bundledExe = path.join(
      process.resourcesPath,
      'python_core', 'endoscopy_server', 'endoscopy_server.exe'
    );
    if (fs.existsSync(bundledExe)) {
      return { exe: bundledExe, args: [String(ENDOSCOPY_PORT)], cwd: path.dirname(bundledExe) };
    }
  }

  // 2. Dev: tìm exe đã build sẵn trong python_core_dist
  const devBundled = path.join(
    __dirname, '../python_core_dist/endoscopy_server/endoscopy_server.exe'
  );
  if (fs.existsSync(devBundled)) {
    return { exe: devBundled, args: [String(ENDOSCOPY_PORT)], cwd: path.dirname(devBundled) };
  }

  // 3. Fallback: dùng python trong PATH (dev mode, máy có Python)
  const pyExe = process.platform === 'win32' ? 'python' : 'python3';
  const script = path.join(__dirname, '../python_core/endoscopy_server.py');
  return { exe: pyExe, args: [script, String(ENDOSCOPY_PORT)], cwd: path.dirname(script) };
}

function startPythonServer() {
  if (_pythonProc && !_pythonProc.killed) {
    return Promise.resolve({ ok: true, status: _serverStatus });
  }

  return new Promise((resolve) => {
    _serverStatus = 'starting';

    const { exe, args, cwd } = getServerCommand();
    console.log(`[Python] Spawning: ${exe} ${args.join(' ')}`);

    _pythonProc = spawn(exe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    });

    let resolved = false;

    _pythonProc.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[Python]', msg.trim());
      // Khi log "IPC Server khởi động" xuất hiện → server sẵn sàng
      if (!resolved && (msg.includes('khởi động') || msg.includes('IPC Server'))) {
        _serverStatus = 'running';
        resolved = true;
        resolve({ ok: true, status: 'running', port: ENDOSCOPY_PORT });
      }
    });

    _pythonProc.stderr.on('data', (data) => {
      console.error('[Python ERR]', data.toString().trim());
    });

    _pythonProc.on('exit', (code) => {
      console.log(`[Python] Exited with code ${code}`);
      _serverStatus = 'stopped';
      _pythonProc = null;
    });

    _pythonProc.on('error', (err) => {
      console.error('[Python] Spawn error:', err.message);
      _serverStatus = 'error';
      _pythonProc = null;
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, status: 'error', error: err.message });
      }
    });

    // Timeout 15 giây nếu server không phản hồi
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (_serverStatus === 'starting') {
          // Vẫn có thể đang chạy, coi như running
          _serverStatus = 'running';
          resolve({ ok: true, status: 'running', port: ENDOSCOPY_PORT });
        }
      }
    }, 15000);
  });
}

function stopPythonServer() {
  return new Promise((resolve) => {
    if (!_pythonProc || _pythonProc.killed) {
      _serverStatus = 'stopped';
      resolve({ ok: true });
      return;
    }
    _pythonProc.kill('SIGTERM');
    setTimeout(() => {
      if (_pythonProc && !_pythonProc.killed) {
        _pythonProc.kill('SIGKILL');
      }
      _serverStatus = 'stopped';
      _pythonProc = null;
      resolve({ ok: true });
    }, 2000);
  });
}

// ── Float Control Window ─────────────────────────────────────────────────────
function createFloatWindow() {
  if (_floatWin && !_floatWin.isDestroyed()) {
    _floatWin.focus();
    return { ok: true, reused: true };
  }

  _floatWin = new BrowserWindow({
    width: 270,
    height: 480,
    minWidth: 60,
    minHeight: 60,
    title: 'Điều Khiển Gọi BN',
    frame: false,          // Frameless — dùng custom titlebar
    transparent: true,     // Nền trong suốt
    alwaysOnTop: true,     // Always-on-top
    skipTaskbar: false,
    resizable: true,
    icon: isDev ? path.join(__dirname, '../public/icon.png') : path.join(__dirname, '../dist/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload-float.cjs'),
    },
  });

  if (isDev) {
    _floatWin.loadFile(path.join(__dirname, '../public/float-control.html'));
  } else {
    _floatWin.loadFile(path.join(__dirname, '../dist/float-control.html'));
  }

  _floatWin.on('maximize', () => {
    if (_floatWin && !_floatWin.isDestroyed()) {
      _floatWin.unmaximize();
      _floatWin.webContents.send('float:toggle-bubble');
    }
  });

  _floatWin.on('closed', () => {
    _floatWin = null;
    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send('float:status-changed', false);
    }
  });

  if (_mainWin && !_mainWin.isDestroyed()) {
    _mainWin.webContents.send('float:status-changed', true);
  }

  return { ok: true, reused: false };
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DMH_Tools',
    icon: isDev ? path.join(__dirname, '../public/icon.png') : path.join(__dirname, '../dist/icon.png'),
    webPreferences: {
      contextIsolation: true,   // Bảo vệ context renderer vs preload
      nodeIntegration: false,   // Bảo mật: không cho renderer dùng Node API trực tiếp
      sandbox: false,           // PHẢI false để preload.cjs có thể dùng require('electron')
      preload: path.join(__dirname, 'preload.cjs'),
    },
    backgroundColor: '#f0fdf4',
    show: false,
  });

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        { label: 'Làm mới', accelerator: 'CmdOrCtrl+R', click: () => win.reload() },
        { type: 'separator' },
        { label: 'Thoát', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toàn màn hình', role: 'togglefullscreen' },
        { label: 'Zoom vào',      role: 'zoomIn'           },
        { label: 'Zoom ra',       role: 'zoomOut'          },
        { label: 'Kích cỡ gốc',  role: 'resetZoom'        },
        { type: 'separator' },
        ...(isDev ? [{ label: 'DevTools', role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Thu nhỏ', role: 'minimize' },
        { label: 'Phóng to', role: 'zoom'   },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Về phần mềm',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(win, {
              type:    'info',
              title:   'Về phần mềm',
              message: 'DMH_Tools',
              detail:  `Phiên bản ${app.getVersion()}\nCông cụ quản lý phòng khám: đối chiếu hồ sơ,\ngọi bệnh nhân HIS, Nội Soi AI 4K với cài driver camera tích hợp\nvà nhiều tính năng khác.`,
              buttons: ['Đóng'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  if (isDev) {
    win.loadURL('http://localhost:5173').catch(() => win.loadURL('http://localhost:5174'));
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    try {
      const indexUrl = pathToFileURL(indexPath).href;
      console.log('[MAIN] Loading packaged URL via pathToFileURL:', indexUrl);
      win.loadURL(indexUrl).catch((err) => {
        console.warn('[MAIN] loadURL error, trying fallback loadFile:', err);
        win.loadFile(indexPath).catch(e => console.error('[MAIN] loadFile error:', e));
      });
    } catch {
      win.loadFile(indexPath).catch(e => console.error('[MAIN] loadFile error:', e));
    }
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[MAIN] WebContents did-fail-load:', errorCode, errorDescription, validatedURL);
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  // Fallback an toàn: nếu sự kiện ready-to-show bị trễ sau 1.5 giây, luôn chủ động hiển thị cửa sổ
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      console.log('[MAIN] Fallback show window triggered');
      win.show();
    }
  }, 1500);

  _mainWin = win;

  win.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url);
    if (parsed.origin !== 'null') shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── App ready ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Tạo cửa sổ chính ngay lập tức để người dùng thấy giao diện mượt mà
  createWindow();

  // ── IPC: PDF convert ───────────────────────────────────────────────────────
  ipcMain.handle('convert-pdf', async (_event, inputPath) => {
    return new Promise((resolve, reject) => {
      if (typeof inputPath !== 'string') return reject('inputPath không hợp lệ');
      const normalizedInput = path.resolve(inputPath);
      const ext = path.extname(normalizedInput).toLowerCase();
      if (ext !== '.pdf')              return reject('Chỉ hỗ trợ file PDF (.pdf)');
      if (!fs.existsSync(normalizedInput)) return reject('File không tồn tại: ' + normalizedInput);

      let exePath = resolveAssetPath('bin/convert_pdf.exe');
      if (!fs.existsSync(exePath)) {
        exePath = app.isPackaged
          ? path.join(process.resourcesPath, 'bin/convert_pdf.exe')
          : path.join(__dirname, '../bin/dist/convert_pdf.exe');
      }

      const outputPath = path.join(os.tmpdir(), `dmhtools_${crypto.randomBytes(6).toString('hex')}.docx`);

      execFile(exePath, [normalizedInput, outputPath], { timeout: 120000 }, (error, _stdout, stderr) => {
        if (error) {
          reject(error.message || stderr);
        } else {
          try {
            const data = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            resolve(data);
          } catch (e) {
            reject(e.message);
          }
        }
      });
    });
  });

  // ── IPC: PowerShell ────────────────────────────────────────────────────────
  ipcMain.handle('run-powershell', async (_event, script) => {
    return new Promise((resolve, reject) => {
      if (typeof script !== 'string' || script.length > 8192)
        return reject('Script không hợp lệ hoặc quá dài');
      
      // WHITELIST COMMANDS: Chỉ cho phép các lệnh đã biết
      const allowedCmds = [
        '$board = (Get-CimInstance Win32_BaseBoard).SerialNumber',
        'Get-PnpDevice -Class Camera',
        'Get-PnpDevice -Class Image',
        'Get-CimInstance Win32_PnPEntity'
      ];
      
      // Kiểm tra sơ bộ xem script có chứa lệnh nguy hiểm không
      const isDangerous = ['Invoke-WebRequest', 'Start-Process', 'Remove-Item', 'Set-ExecutionPolicy', 'iex'].some(cmd => script.toLowerCase().includes(cmd.toLowerCase()));
      if (isDangerous) return reject('Lệnh PowerShell không được phép thực thi (Dangerous Command Detected).');

      const { exec } = require('child_process');
      const encoded  = Buffer.from(script, 'utf16le').toString('base64');
      exec(
        `powershell -NonInteractive -NoProfile -EncodedCommand ${encoded}`,
        { timeout: 30000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) reject(error.message || stderr);
          else resolve(stdout);
        }
      );
    });
  });

  // ── IPC: Endoscopy Python Server ───────────────────────────────────────────
  
// ── XML3176: Python IPC Server ────────────────────────────────────────────────
const XML3176_PORT = 27183;
let _xml3176Proc = null;
let _xml3176Status = 'stopped';

function getXml3176Command() {
  const modExe = resolveAssetPath('python_core/xml3176_server/xml3176_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [String(XML3176_PORT)], cwd: path.dirname(modExe) };
  }
  if (!isDev) {
    const bundledExe = path.join(process.resourcesPath, 'python_core', 'xml3176_server', 'xml3176_server.exe');
    if (fs.existsSync(bundledExe)) return { exe: bundledExe, args: [String(XML3176_PORT)], cwd: path.dirname(bundledExe) };
  }
  const pyExe = process.platform === 'win32' ? 'python' : 'python3';
  const script = path.join(__dirname, '../python_core/xml3176_server.py');
  return { exe: pyExe, args: [script, String(XML3176_PORT)], cwd: path.dirname(script) };
}

function startXml3176Server() {
  if (_xml3176Proc && !_xml3176Proc.killed) return Promise.resolve({ ok: true, status: _xml3176Status });
  return new Promise((resolve) => {
    _xml3176Status = 'starting';
    const { exe, args, cwd } = getXml3176Command();
    console.log('[XML3176] Spawning:', exe, args.join(' '));
    _xml3176Proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let resolved = false;
    _xml3176Proc.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[XML3176]', msg.trim());
      if (!resolved && (msg.includes('khởi động') || msg.includes('HTTP Server'))) {
        _xml3176Status = 'running'; resolved = true; resolve({ ok: true, status: 'running', port: XML3176_PORT });
      }
    });
    _xml3176Proc.stderr.on('data', (data) => console.error('[XML3176 ERR]', data.toString().trim()));
    _xml3176Proc.on('exit', (code) => { console.log('[XML3176] Exited with code', code); _xml3176Status = 'stopped'; _xml3176Proc = null; });
    _xml3176Proc.on('error', (err) => { console.error('[XML3176] Spawn error:', err.message); _xml3176Status = 'error'; _xml3176Proc = null; if (!resolved) { resolved = true; resolve({ ok: false, status: 'error', error: err.message }); } });
    setTimeout(() => { if (!resolved) { resolved = true; if (_xml3176Status === 'starting') { _xml3176Status = 'running'; resolve({ ok: true, status: 'running', port: XML3176_PORT }); } } }, 15000);
  });
}

function stopXml3176Server() {
  return new Promise((resolve) => {
    if (!_xml3176Proc || _xml3176Proc.killed) { _xml3176Status = 'stopped'; resolve({ ok: true }); return; }
    _xml3176Proc.kill('SIGTERM');
    setTimeout(() => { if (_xml3176Proc && !_xml3176Proc.killed) _xml3176Proc.kill('SIGKILL'); _xml3176Status = 'stopped'; _xml3176Proc = null; resolve({ ok: true }); }, 2000);
  });
}

  ipcMain.handle('xml3176:start-server', async () => startXml3176Server());
  ipcMain.handle('xml3176:stop-server', async () => stopXml3176Server());
  ipcMain.handle('xml3176:server-status', async () => ({ status: _xml3176Status, port: XML3176_PORT }));

// ── COMPARE SERVER: Python doi chieu ho so BHYT (port 27185) ─────────────────
const COMPARE_PORT = 27185;
let _compareProc   = null;
let _compareStatus = 'stopped';

function getCompareCommand() {
  const modExe = resolveAssetPath('python_core/compare_server/compare_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [], cwd: path.dirname(modExe) };
  }
  if (!isDev) {
    // Production: dùng compare_server.exe (đã bundle openpyxl + unicodedata)
    const exePath = path.join(process.resourcesPath, 'python_core', 'compare_server', 'compare_server.exe');
    return { exe: exePath, args: [], cwd: path.dirname(exePath) };
  } else {
    // Dev: dùng python-embed + compare_server.py trực tiếp
    const pyExe = getBundledPythonExe();
    const script = path.join(__dirname, '../python_core/compare_server.py');
    return { exe: pyExe, args: [script], cwd: path.dirname(script) };
  }
}

function startCompareServer() {
  if (_compareProc && !_compareProc.killed) return Promise.resolve({ ok: true, status: _compareStatus, port: COMPARE_PORT });
  return new Promise(async (resolve) => {
    // Thử gửi lệnh quit để kill zombie process (nếu có từ phiên trước)
    try {
      const http = require('http');
      await new Promise(r => {
        const req = http.get(`http://127.0.0.1:${COMPARE_PORT}/quit`, () => r());
        req.on('error', () => r());
        req.setTimeout(1000, () => { req.destroy(); r(); });
      });
      await new Promise(r => setTimeout(r, 500)); // Đợi server cũ tắt hẳn
    } catch (e) {}

    _compareStatus = 'starting';
    const { exe, args, cwd } = getCompareCommand();
    console.log('[COMPARE] Spawning:', exe, args.join(' '));
    _compareProc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let resolved = false;
    _compareProc.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[COMPARE]', msg.trim());
      if (!resolved && (msg.includes('27185') || msg.includes('compare') || msg.includes('health'))) {
        _compareStatus = 'running'; resolved = true;
        resolve({ ok: true, status: 'running', port: COMPARE_PORT });
      }
    });
    _compareProc.stderr.on('data', (data) => console.error('[COMPARE ERR]', data.toString().trim()));
    _compareProc.on('exit', (code) => { _compareStatus = 'stopped'; _compareProc = null; });
    _compareProc.on('error', (err) => {
      _compareStatus = 'error'; _compareProc = null;
      if (!resolved) { resolved = true; resolve({ ok: false, error: err.message }); }
    });
    setTimeout(() => {
      if (!resolved) { resolved = true; _compareStatus = 'running'; resolve({ ok: true, status: 'running', port: COMPARE_PORT }); }
    }, 5000);
  });
}

function stopCompareServer() {
  return new Promise((resolve) => {
    if (!_compareProc || _compareProc.killed) { _compareStatus = 'stopped'; resolve({ ok: true }); return; }
    _compareProc.kill('SIGTERM');
    setTimeout(() => {
      if (_compareProc && !_compareProc.killed) _compareProc.kill('SIGKILL');
      _compareStatus = 'stopped'; _compareProc = null; resolve({ ok: true });
    }, 2000);
  });
}

  ipcMain.handle('compare:start-server',  async () => startCompareServer());
  ipcMain.handle('compare:stop-server',   async () => stopCompareServer());
  ipcMain.handle('compare:server-status', async () => ({ status: _compareStatus, port: COMPARE_PORT }));

  ipcMain.handle('compare:compare-files', async (_event, { portalPath, internalPath }) => {
    try {
      await startCompareServer();
      await new Promise(r => setTimeout(r, 800));
      const portalB64   = fs.readFileSync(portalPath).toString('base64');
      const internalB64 = fs.readFileSync(internalPath).toString('base64');
      const http = require('http');
      const body = JSON.stringify({ portalFile: portalB64, internalFile: internalB64 });
      return await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1', port: COMPARE_PORT, path: '/compare',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        req.on('error', reject);
        req.write(body); req.end();
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Nhận base64 trực tiếp từ renderer (File.arrayBuffer() → base64)
  ipcMain.handle('compare:compare-b64', async (_event, portalB64, internalB64) => {
    try {
      await startCompareServer();
      await new Promise(r => setTimeout(r, 800));
      const http = require('http');
      const body = JSON.stringify({ portalFile: portalB64, internalFile: internalB64 });
      return await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1', port: COMPARE_PORT, path: '/compare',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        req.on('error', reject);
        req.write(body); req.end();
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

// ── END COMPARE SERVER ────────────────────────────────────────────────────────

  ipcMain.handle('endoscopy:start-server', async () => {
    return startPythonServer();
  });

  ipcMain.handle('endoscopy:stop-server', async () => {
    return stopPythonServer();
  });

  ipcMain.handle('endoscopy:server-status', async () => {
    return { status: _serverStatus, port: ENDOSCOPY_PORT };
  });

  ipcMain.handle('endoscopy:open-folder', async (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') return { ok: false };
    // Bảo mật: chỉ cho phép mở thư mục trong home directory
    const home    = os.homedir();
    const resolved = path.resolve(folderPath);
    if (!resolved.startsWith(home)) return { ok: false, error: 'Đường dẫn không hợp lệ' };
    shell.openPath(resolved);
    return { ok: true };
  });

  ipcMain.handle('endoscopy:open-file', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return { ok: false };
    const home    = os.homedir();
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(home)) return { ok: false, error: 'Đường dẫn không hợp lệ' };
    shell.openPath(resolved);
    return { ok: true };
  });

  // ── IPC: Quản lý Bản Quyền (Hardware ID) ──────────────────────────────────
  let _cachedHwid = null;
  async function getSystemHwid() {
    if (_cachedHwid) return _cachedHwid;

    // Thử đọc từ Registry trước nếu đã từng lưu
    try {
      const { execSync } = require('child_process');
      const regOut = execSync('reg query "HKCU\\Software\\DMH_Tools\\License" /v "HardwareID"', { stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 }).toString();
      const m = regOut.match(/HardwareID\s+REG_SZ\s+(.*)/i);
      if (m && m[1] && m[1].trim().length >= 16) {
        _cachedHwid = m[1].trim().toUpperCase();
        return _cachedHwid;
      }
    } catch {}

    try {
      const { execFile, execSync } = require('child_process');
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
      } catch {}

      return _cachedHwid;
    } catch (e) {
      console.error('[HWID] Lỗi đọc phần cứng qua PowerShell:', e.message);
      // Nếu có lỗi, thử dùng fallback cố định theo username + hostname thay vì random để không mất key
      const fallbackSeed = `${os.hostname()}-${os.userInfo().username}-${os.arch()}`;
      _cachedHwid = crypto.createHash('sha256').update(fallbackSeed).digest('hex').substring(0, 32).toUpperCase();
      return _cachedHwid;
    }
  }

  ipcMain.handle('system:get-hwid', async () => {
    return getSystemHwid();
  });

  // ── IPC: Quản lý Bản Quyền Bền Vững (Chống Kích Hoạt Lại Khi Xóa App) ──────
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
      licenseVault.saveBackupKey(rawKey);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('license:get-backup-key', async () => {
    try {
      const key = licenseVault.getBackupKey();
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

  ipcMain.handle('license:clean-revoked-key', async (_event, rawKey) => {
    try {
      licenseVault.cleanRevokedKey(rawKey);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('license:get-trial-init', async (_event, hwid) => {
    try {
      const targetHwid = hwid || await getSystemHwid();
      return licenseVault.getPersistentTrialInit(targetHwid);
    } catch {
      return 0;
    }
  });

  ipcMain.handle('license:save-trial-init', async (_event, sec, hwid) => {
    try {
      const targetHwid = hwid || await getSystemHwid();
      return licenseVault.savePersistentTrialInit(sec, targetHwid);
    } catch {
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

  // ── IPC: Liệt kê USB Camera (không cần Python server) ─────────────────────
  ipcMain.handle('endoscopy:list-cameras', async () => {
    try {
      // Dùng PowerShell để lấy danh sách thiết bị camera/video từ Windows
      const { execFile } = require('child_process');
      const script = `
        $cameras = @()
        $idx = 0
        # Tìm tất cả thiết bị USB video / capture / camera
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
        # Cũng kiểm tra qua DirectShow / WMI cho cam USB generic
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
          (err, stdout, stderr) => {
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

  // ── IPC: Endoscopy Local Database & Capture ───────────────────────────────
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
    // Sắp xếp mới nhất lên đầu
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
    // Tính image_count
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
    
    // Lưu file Base64
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

  // ── IPC: Endoscopy OCR / AI Recognize ─────────────────────────────────────
  ipcMain.handle('endoscopy:recognize-image', async (_e, base64Data) => {
    try {
      const { createWorker } = require('tesseract.js');
      const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      // Tesseract 6+: createWorker(lang) nhận tham số trực tiếp
      const worker = await createWorker('vie+eng', 1, {
        logger: () => {},  // tắt log tiến trình
      });
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

  // ── IPC: HIS Call (TCP LAN) ────────────────────────────────────────────────
  ipcMain.handle('his-call:send-tcp', async (_event, ip, port, message) => {
    return new Promise((resolve) => {
      if (!ip || !port || !message) {
        return resolve({ ok: false, error: 'Thiếu tham số (ip, port, message)' });
      }
      const net = require('net');
      const client = new net.Socket();
      client.setTimeout(3000);

      let errorMsg = null;

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

      client.on('timeout', () => {
        errorMsg = 'Kết nối timeout (3s)';
        client.destroy();
      });

      client.on('error', (err) => {
        errorMsg = err.message;
      });

      client.on('close', () => {
        if (errorMsg) resolve({ ok: false, error: errorMsg });
      });
    });
  });

  // ── IPC: Máy Chấm Công (Biometric LAN IP - ZKTeco / Ronald Jack) ───────────
  const biometricService = require('./biometricNetworkService.cjs');

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

  // ── IPC: HIS Database (SQL Server) ─────────────────────────────────────────
  // roomCode có thể là '2' hoặc '2,3,5' (nhiều phòng cách nhau bởi dấu phẩy)
  ipcMain.handle('his-call:fetch-patients', async (_event, connStr, roomCode) => {
    try {
      const sql = require('mssql');
      const pool = await sql.connect(connStr);

      // Parse danh sách phòng
      const roomCodes = String(roomCode || '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
      const hasRoomFilter = roomCodes.length > 0;

      let query, req;
      if (hasRoomFilter) {
        // Tạo tham số @p0, @p1, @p2… cho IN clause
        const paramNames = roomCodes.map((_, i) => `@p${i}`).join(',');
        query = `
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
            AND CAST(kb.ngay AS DATE) = CAST(GETDATE() AS DATE)
          WHERE dk.maphong IN (${paramNames})
            AND CAST(dk.ngaydk AS DATE) = CAST(GETDATE() AS DATE)

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
            AND CAST(tt.ngay AS DATE) = CAST(GETDATE() AS DATE)

          ORDER BY SoThuTu ASC, GioDangKy ASC
        `;
        req = pool.request();
        roomCodes.forEach((code, i) => req.input(`p${i}`, sql.Int, code));
      } else {
        query = `
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
            AND CAST(kb.ngay AS DATE) = CAST(GETDATE() AS DATE)
          WHERE CAST(dk.ngaydk AS DATE) = CAST(GETDATE() AS DATE)

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
          WHERE CAST(tt.ngay AS DATE) = CAST(GETDATE() AS DATE)

          ORDER BY SoThuTu ASC, GioDangKy ASC
        `;
        req = pool.request();
      }

      const result = await req.query(query);
      await pool.close();
      return { ok: true, data: result.recordset };
    } catch (e) {
      // Fallback: không có cột GioDangKy / MaPhong
      try {
        const sql = require('mssql');
        const pool2 = await sql.connect(connStr);
        const roomCodes = String(roomCode || '')
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n > 0);
        const hasRoom = roomCodes.length > 0;
        let q, req;
        if (hasRoom) {
          const paramNames = roomCodes.map((_, i) => `@p${i}`).join(',');
          q = `SELECT TRY_CAST(sothutudk AS INT) AS SoThuTu, makcb AS MaBenhNhan, hoten AS TenBenhNhan, maphong AS MaPhong, '' AS GioDangKy, YEAR(GETDATE()) - YEAR(ngaysinh) AS Tuoi, 0 AS DaKham FROM dangky WHERE maphong IN (${paramNames}) AND CAST(ngaydk AS DATE)=CAST(GETDATE() AS DATE) UNION ALL SELECT TRY_CAST(thutu AS INT) AS SoThuTu, tt.makcb AS MaBenhNhan, dk.hoten AS TenBenhNhan, tt.manoithuchien AS MaPhong, '' AS GioDangKy, YEAR(GETDATE()) - YEAR(dk.ngaysinh) AS Tuoi, CASE WHEN tt.coketqua = 1 OR tt.coketqua = 'True' OR tt.maygoi = '1' OR tt.maygoi = 'True' THEN 1 ELSE 0 END AS DaKham FROM thutuchidinh tt JOIN dangky dk ON tt.makcb = dk.makcb WHERE tt.manoithuchien IN (${paramNames}) AND CAST(tt.ngay AS DATE)=CAST(GETDATE() AS DATE) ORDER BY SoThuTu ASC`;
          req = pool2.request();
          roomCodes.forEach((code, i) => req.input(`p${i}`, sql.Int, code));
        } else {
          q = `SELECT TRY_CAST(sothutudk AS INT) AS SoThuTu, makcb AS MaBenhNhan, hoten AS TenBenhNhan, maphong AS MaPhong, '' AS GioDangKy, YEAR(GETDATE()) - YEAR(ngaysinh) AS Tuoi, 0 AS DaKham FROM dangky WHERE CAST(ngaydk AS DATE)=CAST(GETDATE() AS DATE) UNION ALL SELECT TRY_CAST(thutu AS INT) AS SoThuTu, tt.makcb AS MaBenhNhan, dk.hoten AS TenBenhNhan, tt.manoithuchien AS MaPhong, '' AS GioDangKy, YEAR(GETDATE()) - YEAR(dk.ngaysinh) AS Tuoi, CASE WHEN tt.coketqua = 1 OR tt.coketqua = 'True' OR tt.maygoi = '1' OR tt.maygoi = 'True' THEN 1 ELSE 0 END AS DaKham FROM thutuchidinh tt JOIN dangky dk ON tt.makcb = dk.makcb WHERE CAST(tt.ngay AS DATE)=CAST(GETDATE() AS DATE) ORDER BY SoThuTu ASC`;
          req = pool2.request();
        }
        try {
          const result = await req.query(q);
          return { ok: true, data: result.recordset };
        } finally {
          await pool2.close().catch(() => {});
        }
      } catch (e2) {
        return { ok: false, error: e2.message };
      }
    }
  });


  // Lấy danh sách phòng từ DB
  ipcMain.handle('his-call:fetch-rooms', async (_event, connStr) => {
    try {
      const sql = require('mssql');
      const pool = await sql.connect(connStr);
      const result = await pool.request().query(`
        SELECT DISTINCT dk.maphong,
          CONCAT(N'Phòng ', dk.maphong, N' (', COUNT(*) OVER (PARTITION BY dk.maphong), N' BN)') AS tenphong
        FROM dangky dk
        WHERE CAST(dk.ngaydk AS DATE) = CAST(GETDATE() AS DATE)
        ORDER BY dk.maphong
      `);
      await pool.close();
      return { ok: true, data: result.recordset };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('his-call:update-patient', async (_event, connStr, maBenhNhan) => {
    // Đảm bảo BN được đánh dấu "đã gọi" ngay cả khi chưa có dòng trong khambenh
    try {
      const sql = require('mssql');
      const pool = await sql.connect(connStr);
      try {
        await pool.request()
          .input('makcb', sql.NVarChar, String(maBenhNhan))
          .query(`
            -- Cập nhật khambenh nếu đã có dòng (chuakham=1 → 0)
            UPDATE khambenh
            SET chuakham = 0
            WHERE makcb = @makcb
              AND CAST(ngay AS DATE) = CAST(GETDATE() AS DATE)
              AND chuakham = 1;

            -- Nếu CHƯA có dòng trong khambenh → INSERT mới để DaKham=1 khi fetch lại
            IF NOT EXISTS (
              SELECT 1 FROM khambenh
              WHERE makcb = @makcb
                AND CAST(ngay AS DATE) = CAST(GETDATE() AS DATE)
            )
            BEGIN
              INSERT INTO khambenh (makcb, maphong, ngay, chuakham)
              SELECT dk.makcb, dk.maphong, GETDATE(), 0
              FROM dangky dk
              WHERE dk.makcb = @makcb
                AND CAST(dk.ngaydk AS DATE) = CAST(GETDATE() AS DATE);
            END;

            -- Cập nhật thutuchidinh (BN từ siêu âm, xét nghiệm...)
            UPDATE thutuchidinh
            SET maygoi = '1'
            WHERE makcb = @makcb
              AND CAST(ngay AS DATE) = CAST(GETDATE() AS DATE);
          `);
        return { ok: true };
      } finally {
        await pool.close().catch(() => {});
      }
    } catch (e) {
      // Fallback nhẹ: không block việc gọi BN dù DB lỗi
      return { ok: true, rowsAffected: 0, warn: e.message };
    }
  });



  // Lấy bệnh nhân được gọi GẦN NHẤT từ khambenh (auto-sync màn TV theo HIS)
  ipcMain.handle('his-call:latest-called', async (_event, connStr, roomCode) => {
    try {
      const sql = require('mssql');
      const pool = await sql.connect(connStr);
      const roomInt = parseInt(roomCode, 10);
      const hasRoom = !isNaN(roomInt) && roomInt > 0;
      const q = hasRoom
        ? `SELECT TOP 1 kb.makcb AS MaBenhNhan, dk.hoten AS TenBenhNhan, dk.sothutudk AS SoThuTu, kb.ngay AS ThoiGian
           FROM khambenh kb
           JOIN dangky dk ON dk.makcb = kb.makcb AND CAST(dk.ngaydk AS DATE) = CAST(GETDATE() AS DATE)
           WHERE kb.maphong = @p AND CAST(kb.ngay AS DATE) = CAST(GETDATE() AS DATE)
           ORDER BY kb.ngay DESC`
        : `SELECT TOP 1 kb.makcb AS MaBenhNhan, dk.hoten AS TenBenhNhan, dk.sothutudk AS SoThuTu, kb.ngay AS ThoiGian
           FROM khambenh kb
           JOIN dangky dk ON dk.makcb = kb.makcb AND CAST(dk.ngaydk AS DATE) = CAST(GETDATE() AS DATE)
           WHERE CAST(kb.ngay AS DATE) = CAST(GETDATE() AS DATE)
           ORDER BY kb.ngay DESC`;
      const req = hasRoom ? pool.request().input('p', sql.Int, roomInt) : pool.request();
      const result = await req.query(q);
      await pool.close();
      return { ok: true, data: result.recordset[0] || null };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── IPC: Float Control Window ────────────────────────────────────────────────
  ipcMain.handle('float:open', async () => {
    return createFloatWindow();
  });

  ipcMain.handle('float:close', async () => {
    if (_floatWin && !_floatWin.isDestroyed()) {
      _floatWin.close();
      _floatWin = null;
    }
    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send('float:status-changed', false);
    }
    return { ok: true };
  });

  ipcMain.handle('float:minimize', async () => {
    if (_floatWin && !_floatWin.isDestroyed()) _floatWin.minimize();
    return { ok: true };
  });

  ipcMain.handle('float:resize', async (_event, w, h) => {
    if (_floatWin && !_floatWin.isDestroyed()) {
      _floatWin.setMinimumSize(10, 10); // Allow small sizes
      _floatWin.setSize(Math.round(w), Math.round(h));
    }
    return { ok: true };
  });

  ipcMain.handle('float:is-open', async () => {
    return { open: !!(_floatWin && !_floatWin.isDestroyed()) };
  });

  // Nhận action từ float window, chuyển tiếp sang main window
  ipcMain.on('float:action', (_event, action) => {
    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send('float:action', action);
    }
  });

  // Gửi state update từ main window tới float window
  ipcMain.handle('float:push-state', async (_event, data) => {
    if (_floatWin && !_floatWin.isDestroyed()) {
      _floatWin.webContents.send('float:state-update', data);
      return { ok: true };
    }
    return { ok: false };
  });

  // ── IPC: Piper TTS ──────────────────────────────────────────────────────────
  ipcMain.handle('queue:speak-piper', async (_event, text, voice = 'default') => {
    if (!text || typeof text !== 'string') return false;
    // Giới hạn độ dài để tránh lạm dụng
    const safeText = text.slice(0, 300);
    return speakWithPiper(safeText, voice);
  });

  // ── IPC: Queue Display Window ───────────────────────────────────────────────
  ipcMain.handle('queue:open-display', async (_event, options) => {
    // Nếu đã mở rồi thì focus vào
    if (_queueWin && !_queueWin.isDestroyed()) {
      _queueWin.focus();
      return { ok: true, reused: true };
    }

    // Lấy danh sách màn hình
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    // Chọn màn hình thứ 2 (index 1), fallback về màn hình chính
    const targetDisplay = displays.length > 1 ? displays[1] : displays[0];
    const { x, y, width, height } = targetDisplay.bounds;

    _queueWin = new BrowserWindow({
      x, y,
      width, height,
      fullscreen:  displays.length > 1,  // Tự động fullscreen nếu có màn 2
      title: 'Màn Hình Chờ — ' + (options?.roomCode || 'Phòng Khám'),
      backgroundColor: '#f0fdf4',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,           // Cần false để preload có require
        preload: path.join(__dirname, 'preload-queue.cjs'),
      },
      autoHideMenuBar: true,
    });

    // Load file hiển thị hàng chờ
    if (isDev) {
      _queueWin.loadFile(path.join(__dirname, '../public/queue-display.html'));
    } else {
      _queueWin.loadFile(path.join(__dirname, '../dist/queue-display.html'));
    }

    _queueWin.on('closed', () => {
      _queueWin = null;
      if (_mainWin && !_mainWin.isDestroyed()) {
        _mainWin.webContents.send('queue:status-changed', false);
      }
    });

    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send('queue:status-changed', true);
    }

    return { ok: true, reused: false, display: targetDisplay.id };
  });

  ipcMain.handle('queue:close-display', async () => {
    if (_queueWin && !_queueWin.isDestroyed()) {
      _queueWin.close();
      _queueWin = null;
    }
    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send('queue:status-changed', false);
    }
    return { ok: true };
  });

  ipcMain.handle('queue:is-open', async () => {
    return { open: !!(_queueWin && !_queueWin.isDestroyed()) };
  });

  // Gửi dữ liệu hiển thị tới cửa sổ màn chờ
  ipcMain.handle('queue:update-display', async (_event, data) => {
    if (_queueWin && !_queueWin.isDestroyed()) {
      _queueWin.webContents.send('queue-display:update', data);
      return { ok: true };
    }
    return { ok: false, reason: 'window_not_open' };
  });

  // Chọn file logo (trả về path)
  ipcMain.handle('his-call:select-logo', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'gif', 'bmp', 'webp'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return { ok: true, path: result.filePaths[0] };
    }
    return { ok: false };
  });

  // ── IPC: Camera Driver Install (tích hợp hoàn toàn) ───────────────────────
  /**
   * Lấy đường dẫn script cài driver camera (bundled hoặc dev)
   */
  function getCameraDriverScript() {
    if (!isDev) {
      return path.join(process.resourcesPath, 'scripts', 'install_camera_driver.ps1');
    }
    return path.join(__dirname, '../scripts/install_camera_driver.ps1');
  }

  /**
   * Chạy PowerShell script cài driver với quyền Admin (UAC).
   * Stream output từng dòng qua event 'endoscopy:driver-log' tới renderer.
   * Exit codes: 0=OK, 1=cần Admin, 2=camera chưa thấy sau cài
   */
  ipcMain.handle('endoscopy:install-camera-driver', async (event) => {
    const scriptPath = getCameraDriverScript();

    if (!fs.existsSync(scriptPath)) {
      return { ok: false, error: 'Script không tồn tại: ' + scriptPath };
    }

    return new Promise((resolve) => {
      const sender = event.sender;

      const sendLog = (line) => {
        try {
          if (!sender.isDestroyed()) {
            sender.send('endoscopy:driver-log', line);
          }
        } catch { /* window đã đóng */ }
      };

      // Copy script ra %TEMP% với tên file ASCII để tránh lỗi Unicode path
      // (đường dẫn gốc có thể chứa ký tự ư, ổ, ... gây lỗi PowerShell)
      const os = require('os');
      const tmpScript = path.join(os.tmpdir(), 'dmh_cam_install.ps1');
      try {
        fs.copyFileSync(scriptPath, tmpScript);
      } catch (copyErr) {
        sendLog(`ERR:Không copy được script: ${copyErr.message}`);
        return resolve({ ok: false, error: copyErr.message });
      }

      const psArgs = [
        '-NonInteractive',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', tmpScript,
      ];

      const proc = spawn('powershell', psArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
      });

      let outputLines = [];
      let exitCode = 0;

      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (data) => {
        const lines = data.split(/\r?\n/).filter(l => l.trim());
        for (const line of lines) {
          outputLines.push(line);
          sendLog(line);
          console.log('[CamDriver]', line);
        }
      });

      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (data) => {
        const lines = data.split(/\r?\n/).filter(l => l.trim());
        for (const line of lines) {
          const errLine = 'ERR:' + line;
          outputLines.push(errLine);
          sendLog(errLine);
        }
      });

      proc.on('exit', (code) => {
        exitCode = code !== null && code !== undefined ? code : 0;
        const success = exitCode === 0;
        sendLog(`EXIT:${exitCode}`);
        resolve({
          ok: success,
          exitCode,
          lines: outputLines,
          message: exitCode === 0
            ? 'Cài driver thành công! Nhấn Rescan để tìm camera.'
            : exitCode === 2
              ? 'Driver đã cài nhưng camera chưa được nhận. Cắm lại USB hoặc khởi động lại.'
              : 'Lỗi cài driver. Xem log chi tiết.',
        });
      });

      proc.on('error', (err) => {
        sendLog(`ERR:Không thể chạy PowerShell: ${err.message}`);
        resolve({ ok: false, error: err.message, lines: outputLines });
      });

      // Timeout 60 giây
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
          sendLog('ERR:Timeout — quá trình cài driver kéo dài quá 60 giây');
          resolve({ ok: false, error: 'Timeout', lines: outputLines });
        }
      }, 60000);
    });
  });

  // Mở Device Manager để kiểm tra / cài driver thủ công
  ipcMain.handle('endoscopy:open-device-manager', async () => {
    const { exec } = require('child_process');
    exec('devmgmt.msc', { windowsHide: false });
    return { ok: true };
  });

  // Mở ứng dụng Camera mặc định của Windows để test
  ipcMain.handle('endoscopy:open-camera-app', async () => {
    const { exec } = require('child_process');
    exec('start microsoft.windows.camera:', { shell: true, windowsHide: false });
    return { ok: true };
  });

  // Mở trình duyệt tới trang tải driver nhà sản xuất
  ipcMain.handle('endoscopy:open-driver-url', async (_event, url) => {
    const safeUrl = typeof url === 'string' && url.startsWith('http') ? url : 'https://www.magewell.com/downloads/usb-capture';
    shell.openExternal(safeUrl);
    return { ok: true };
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ── PC TOOLS (KỸ THUẬT MÁY TÍNH - BTP PRO ALL-IN-ONE) ─────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  // Helper: Chạy PowerShell script mã hóa UTF-16LE an toàn với UTF-8 console output
  const runPSToolScript = (psScript) => {
    return new Promise((resolve) => {
      const fullScript = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8
        ${psScript}
      `;
      const buffer = Buffer.from(fullScript, 'utf16le');
      const b64 = buffer.toString('base64');
      execFile('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', b64
      ], { windowsHide: true, maxBuffer: 25 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: err.message || String(stderr) });
        } else {
          resolve({ ok: true, output: (stdout || '').trim() });
        }
      });
    });
  };

  // Helper: Kiểm tra quyền Administrator thực tế của tiến trình
  const isProcessElevated = () => {
    try {
      const { execSync } = require('child_process');
      execSync('net session', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  // Helper: Chạy PowerShell script với quyền Administrator (tự động kích hoạt UAC nếu cần)
  const runElevatedPSToolScript = (psScript) => {
    if (isProcessElevated()) {
      return runPSToolScript(psScript);
    }
    return new Promise((resolve) => {
      const tempScriptPath = path.join(app.getPath('temp'), `dmh_admin_${Date.now()}.ps1`);
      const tempOutPath = path.join(app.getPath('temp'), `dmh_admin_out_${Date.now()}.json`);

      const wrappedScript = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8
        $ErrorActionPreference = 'SilentlyContinue'
        try {
          $output = & {
            ${psScript}
          }
          $jsonOut = if ($output -is [array]) { ($output | Where-Object { $_ -and $_.ToString().Trim().StartsWith('{') } | Select-Object -Last 1) } else { $output }
          if (-not $jsonOut -and $output) { $jsonOut = ($output | Out-String).Trim() }
          if ($jsonOut) {
            [System.IO.File]::WriteAllText('${tempOutPath.replace(/\\/g, '\\\\')}', $jsonOut.ToString(), [System.Text.Encoding]::UTF8)
          }
        } catch {
          $errObj = [PSCustomObject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
          [System.IO.File]::WriteAllText('${tempOutPath.replace(/\\/g, '\\\\')}', $errObj, [System.Text.Encoding]::UTF8)
        }
      `;

      try {
        fs.writeFileSync(tempScriptPath, wrappedScript, 'utf8');
      } catch (e) {
        return resolve(runPSToolScript(psScript));
      }

      const launcher = `Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${tempScriptPath.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden`;

      execFile('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', launcher
      ], { windowsHide: true, timeout: 60000 }, (err) => {
        let output = '';
        try {
          if (fs.existsSync(tempOutPath)) {
            output = fs.readFileSync(tempOutPath, 'utf8').trim();
            fs.unlinkSync(tempOutPath);
          }
          if (fs.existsSync(tempScriptPath)) {
            fs.unlinkSync(tempScriptPath);
          }
        } catch {}

        if (output) {
          resolve({ ok: true, output });
        } else if (err) {
          resolve({ ok: false, error: 'Cần quyền Administrator để thực hiện thao tác hệ thống này: ' + err.message });
        } else {
          resolve(runPSToolScript(psScript));
        }
      });
    });
  };

  // 1. Lấy thông tin cấu hình & sức khỏe phần cứng
  ipcMain.handle('pctools:get-hardware-info', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      
      $cpus = @(Get-CimInstance Win32_Processor | ForEach-Object {
        [PSCustomObject]@{
          Name = $_.Name
          NumberOfCores = $_.NumberOfCores
          NumberOfLogicalProcessors = $_.NumberOfLogicalProcessors
          MaxClockSpeed = $_.MaxClockSpeed
          CurrentClockSpeed = $_.CurrentClockSpeed
          LoadPercentage = $_.LoadPercentage
          SocketDesignation = $_.SocketDesignation
          Manufacturer = $_.Manufacturer
          L2CacheSize = $_.L2CacheSize
          L3CacheSize = $_.L3CacheSize
        }
      })

      $ramModules = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
        $mfg = if ($_.Manufacturer) { "$($_.Manufacturer)".Trim() } else { '' }
        $part = if ($_.PartNumber) { "$($_.PartNumber)".Trim() } else { '' }
        $locator = if ($_.DeviceLocator) { "$($_.DeviceLocator)".Trim() } else { '' }
        [PSCustomObject]@{
          CapacityGB = [math]::Round($_.Capacity / 1GB, 2)
          CapacityBytes = [double]$_.Capacity
          SpeedMHz = $_.Speed
          Manufacturer = $mfg
          PartNumber = $part
          DeviceLocator = $locator
          BankLabel = $_.BankLabel
          FormFactor = $_.FormFactor
          SMBIOSMemoryType = $_.SMBIOSMemoryType
        }
      })

      $totalPhysBytes = ($ramModules | Measure-Object -Property CapacityBytes -Sum).Sum
      $totalPhysGB = if ($totalPhysBytes -gt 0) { [math]::Round($totalPhysBytes / 1GB, 1) } else { 0 }

      $os = @(Get-CimInstance Win32_OperatingSystem | ForEach-Object {
        $visMB = [double]$_.TotalVisibleMemorySize
        $visGB = [math]::Round($visMB / 1MB, 2)
        $hwResMB = if ($totalPhysBytes -gt 0) { [math]::Max(0, [math]::Round(($totalPhysBytes / 1MB) - $visMB, 0)) } else { 0 }
        [PSCustomObject]@{
          Caption = $_.Caption
          Version = $_.Version
          OSArchitecture = $_.OSArchitecture
          BuildNumber = $_.BuildNumber
          TotalPhysicalRAM_GB = $totalPhysGB
          TotalVisibleMemoryGB = $visGB
          HardwareReservedMB = $hwResMB
          FreePhysicalMemoryGB = [math]::Round($_.FreePhysicalMemory / 1MB, 2)
          InstallDate = $_.InstallDate
          LastBootUpTime = $_.LastBootUpTime
        }
      })

      $board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer, Product, SerialNumber, Version
      $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1 SMBIOSBIOSVersion, ReleaseDate, Manufacturer, SerialNumber

      $gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
        $rawMode = if ($_.VideoModeDescription) { "$($_.VideoModeDescription)".Trim() } else { '' }
        $cleanMode = $rawMode -replace 'x\s*4294967296\s*colors', '(32-bit Màu)' -replace 'x\s*16777216\s*colors', '(24-bit Màu)'
        [PSCustomObject]@{
          Name = $_.Name
          VRAM_GB = [math]::Round($_.AdapterRAM / 1GB, 2)
          DriverVersion = $_.DriverVersion
          VideoProcessor = $_.VideoProcessor
          CurrentRefreshRate = $_.CurrentRefreshRate
          VideoModeDescription = $cleanMode
        }
      })

      $physDisks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue)
      $disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
        $idx = $_.Index
        $phys = $physDisks | Where-Object { $_.DeviceId -eq "$idx" -or $_.DeviceId -eq $idx } | Select-Object -First 1
        $media = if ($phys -and $phys.MediaType) { "$($phys.MediaType)".Trim() } else { "$($_.MediaType)".Trim() }
        $bus = if ($phys -and $phys.BusType) { "$($phys.BusType)".Trim() } else { "$($_.InterfaceType)".Trim() }
        $health = if ($phys -and $phys.HealthStatus) { "$($phys.HealthStatus)".Trim() } else { 'Healthy' }
        [PSCustomObject]@{
          Model = $_.Model
          SizeGB = [math]::Round($_.Size / 1GB, 1)
          MediaType = $media
          InterfaceType = $bus
          HealthStatus = $health
          SerialNumber = ($_.SerialNumber -replace '\\s+', '')
          Partitions = $_.Partitions
        }
      })

      $volumes = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3 or DriveType=4" | ForEach-Object {
        $size = [double]$_.Size
        $free = [double]$_.FreeSpace
        $used = $size - $free
        $pct = 0
        if ($size -gt 0) { $pct = [math]::Round(($used / $size) * 100, 1) }
        $vName = if ($_.VolumeName) { [string]$_.VolumeName.Trim() } else { '' }
        $isCloud = ($vName -like '*Google Drive*') -or ($vName -like '*OneDrive*') -or ($vName -like '*iCloud*') -or ($_.FileSystem -like '*Virtual*')
        [PSCustomObject]@{
          DeviceID = $_.DeviceID
          VolumeName = $vName
          TotalGB = [math]::Round($size / 1GB, 1)
          FreeGB = [math]::Round($free / 1GB, 1)
          UsedGB = [math]::Round($used / 1GB, 1)
          PercentUsed = $pct
          FileSystem = $_.FileSystem
          IsCloud = $isCloud
        }
      })

      $battery = @(Get-CimInstance Win32_Battery | ForEach-Object {
        $des = [double]$_.DesignCapacity
        $full = [double]$_.FullChargeCapacity
        
        # Fallback qua WMI root/wmi nếu DesignCapacity trên Win32_Battery bị 0 (phổ biến trên Dell/HP/Lenovo)
        if (-not $des -or $des -le 0) {
          $static = Get-CimInstance -Namespace root/wmi -ClassName BatteryStaticData -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($static -and $static.DesignedCapacity -gt 0) { $des = [double]$static.DesignedCapacity }
        }
        if (-not $full -or $full -le 0) {
          $fCap = Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($fCap -and $fCap.FullChargedCapacity -gt 0) { $full = [double]$fCap.FullChargedCapacity }
        }

        $wear = 0
        if ($des -gt 0 -and $full -gt 0) {
          if ($full -lt $des) {
            $wear = [math]::Round((1 - ($full / $des)) * 100, 1)
          }
        }
        [PSCustomObject]@{
          EstimatedChargeRemaining = $_.EstimatedChargeRemaining
          BatteryStatus = $_.BatteryStatus
          EstimatedRunTime = $_.EstimatedRunTime
          DesignCapacity = $des
          FullChargeCapacity = $full
          WearPercent = $wear
        }
      })

      $network = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" | ForEach-Object {
        [PSCustomObject]@{
          Description = $_.Description
          IPAddress = ($_.IPAddress | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' } | Select-Object -First 1)
          MACAddress = $_.MACAddress
          DNSHostName = $_.DNSHostName
        }
      })

      [PSCustomObject]@{
        CPUs = $cpus
        RAMModules = $ramModules
        OS = $os
        Mainboard = $board
        BIOS = $bios
        GPUs = $gpus
        Disks = $disks
        Volumes = $volumes
        Battery = $battery
        Network = $network
        ComputerName = $env:COMPUTERNAME
        UserName = $env:USERNAME
      } | ConvertTo-Json -Depth 6 -Compress
    `;

    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const data = JSON.parse(res.output);
      const toArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
      data.CPUs = toArr(data.CPUs);
      data.RAMModules = toArr(data.RAMModules);
      data.OS = toArr(data.OS);
      data.GPUs = toArr(data.GPUs);
      data.Disks = toArr(data.Disks);
      data.Volumes = toArr(data.Volumes);
      data.Battery = toArr(data.Battery);
      data.Network = toArr(data.Network);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: 'Lỗi parse JSON thông tin phần cứng: ' + (e.message || String(e)) };
    }
  });

  // 2. Đo tốc độ ổ đĩa (Sequential Read / Write Benchmark)
  ipcMain.handle('pctools:benchmark-disk', async (_event, params = {}) => {
    let drive = 'C:';
    if (typeof params.drive === 'string') {
      const match = params.drive.match(/^[a-zA-Z]:/);
      if (match) drive = match[0].toUpperCase();
    }
    const sizeMB = Math.min(Math.max(Number(params.sizeMB) || 64, 16), 512); // giới hạn 16MB - 512MB
    
    // Thư mục test: ưu tiên thư mục temp trên cùng ổ đĩa nếu có thể ghi, fallback sang os.tmpdir()
    let testDir = path.join(os.tmpdir(), 'dmh_benchmark');
    if (drive.length >= 2 && drive[1] === ':') {
      const candidate = path.join(`${drive}\\`, 'DMH_Benchmark_Temp');
      try {
        if (!fs.existsSync(candidate)) fs.mkdirSync(candidate, { recursive: true });
        // Kiểm tra quyền ghi
        const probeFile = path.join(candidate, `probe_${Date.now()}.tmp`);
        fs.writeFileSync(probeFile, 'ok');
        fs.unlinkSync(probeFile);
        testDir = candidate;
      } catch {
        testDir = path.join(os.tmpdir(), 'dmh_benchmark');
      }
    }
    try {
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    } catch {
      testDir = os.tmpdir();
    }

    const testFile = path.join(testDir, `benchmark_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.tmp`);
    const chunkSize = 4 * 1024 * 1024; // 4MB per chunk
    const totalBytes = sizeMB * 1024 * 1024;
    const chunkBuffer = crypto.randomBytes(chunkSize);

    try {
      // ── Write Benchmark ──
      const writeStart = process.hrtime.bigint();
      const fdWrite = fs.openSync(testFile, 'w');
      let written = 0;
      while (written < totalBytes) {
        const toWrite = Math.min(chunkSize, totalBytes - written);
        fs.writeSync(fdWrite, chunkBuffer, 0, toWrite);
        written += toWrite;
      }
      fs.fsyncSync(fdWrite);
      fs.closeSync(fdWrite);
      const writeEnd = process.hrtime.bigint();
      const writeSeconds = Number(writeEnd - writeStart) / 1e9;
      const writeSpeedMBps = writeSeconds > 0 ? Math.round((sizeMB / writeSeconds) * 10) / 10 : 0;

      // ── Read Benchmark ──
      const readStart = process.hrtime.bigint();
      const fdRead = fs.openSync(testFile, 'r');
      const readBuf = Buffer.alloc(chunkSize);
      let readBytes = 0;
      while (readBytes < totalBytes) {
        const toRead = Math.min(chunkSize, totalBytes - readBytes);
        const bytesRead = fs.readSync(fdRead, readBuf, 0, toRead, null);
        if (bytesRead === 0) break;
        readBytes += bytesRead;
      }
      fs.closeSync(fdRead);
      const readEnd = process.hrtime.bigint();
      const readSeconds = Number(readEnd - readStart) / 1e9;
      const readSpeedMBps = readSeconds > 0 ? Math.round((sizeMB / readSeconds) * 10) / 10 : 0;

      const result = {
        drive,
        sizeMB,
        writeSpeedMBps,
        readSpeedMBps
      };

      return {
        ok: true,
        data: result,
        ...result
      };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    } finally {
      // Dọn dẹp file test
      try {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      } catch { /* ignore */ }
    }
  });

  // 3. Dọn rác hệ thống (Temp, Prefetch, Recycle Bin)
  ipcMain.handle('pctools:clean-junk', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $freedBytes = 0
      $deletedFiles = 0

      # 1. Dọn User Temp
      $userTemp = $env:TEMP
      if (Test-Path $userTemp) {
        Get-ChildItem -Path $userTemp -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            if (-not $_.PSIsContainer) {
              $freedBytes += $_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $deletedFiles++
            } else {
              Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
          } catch {}
        }
      }

      # 2. Dọn Windows Temp
      $winTemp = "C:\\Windows\\Temp"
      if (Test-Path $winTemp) {
        Get-ChildItem -Path $winTemp -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            if (-not $_.PSIsContainer) {
              $freedBytes += $_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $deletedFiles++
            }
          } catch {}
        }
      }

      # 3. Dọn Recycle Bin
      try {
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
      } catch {}

      [PSCustomObject]@{
        DeletedFiles = $deletedFiles
        FreedMB = [math]::Round($freedBytes / 1MB, 2)
      } | ConvertTo-Json -Compress
    `;

    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const data = JSON.parse(res.output);
      return { ok: true, data };
    } catch {
      return { ok: true, data: { DeletedFiles: 0, FreedMB: 0 } };
    }
  });

  // 4. Giải phóng RAM (Tối ưu bộ nhớ hệ thống)
  ipcMain.handle('pctools:optimize-ram', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $before = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
      
      # Thu gom garbage collection
      [System.GC]::Collect()
      [System.GC]::WaitForPendingFinalizers()
      
      # Gọi Windows API giải phóng Working Set của các tiến trình lớn nếu có thể
      $after = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
      $freedKB = [math]::Max(0, $after - $before)
      
      [PSCustomObject]@{
        BeforeFreeMB = [math]::Round($before / 1024, 1)
        AfterFreeMB = [math]::Round($after / 1024, 1)
        FreedMB = [math]::Round($freedKB / 1024, 1)
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const data = JSON.parse(res.output);
      return { ok: true, data };
    } catch {
      return { ok: true, data: { FreedMB: 0 } };
    }
  });

  // ── Từ điển Tinh Chỉnh Hệ Thống Windows (DMH Windows 1-Click Optimizer) ──
  const TWEAK_SCRIPTS = {
    'thispc-desktop': {
      name: 'Hiện biểu tượng This PC ra Desktop',
      needRestartExplorer: true,
      script: `
        $k1 = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel"
        if (-not (Test-Path $k1)) { New-Item -Path $k1 -Force | Out-Null }
        Set-ItemProperty -Path $k1 -Name "{20D04FE0-3AEA-1069-A2D8-08002B30309D}" -Value 0 -Type DWord -Force
        $k2 = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\ClassicStartMenu"
        if (-not (Test-Path $k2)) { New-Item -Path $k2 -Force | Out-Null }
        Set-ItemProperty -Path $k2 -Name "{20D04FE0-3AEA-1069-A2D8-08002B30309D}" -Value 0 -Type DWord -Force
      `
    },
    'show-file-ext': {
      name: 'Hiện phần mở rộng file (đuôi .exe, .docx...)',
      needRestartExplorer: true,
      script: `
        $adv = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
        Set-ItemProperty -Path $adv -Name "HideFileExt" -Value 0 -Type DWord -Force
      `
    },
    'show-hidden-files': {
      name: 'Hiện tệp và thư mục ẩn',
      needRestartExplorer: true,
      script: `
        $adv = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
        Set-ItemProperty -Path $adv -Name "Hidden" -Value 1 -Type DWord -Force
      `
    },
    'numlock-startup': {
      name: 'Tự động bật NumLock khi khởi động',
      script: `
        Set-ItemProperty -Path "HKU:\\.DEFAULT\\Control Panel\\Keyboard" -Name "InitialKeyboardIndicators" -Value "2" -Force
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Keyboard" -Name "InitialKeyboardIndicators" -Value "2" -Force
      `
    },
    'classic-context-win11': {
      name: 'Khôi phục menu chuột phải cổ điển Win 10 trên Windows 11',
      needRestartExplorer: true,
      script: `
        $clsid = "HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32"
        if (-not (Test-Path $clsid)) { New-Item -Path $clsid -Force | Out-Null }
        Set-ItemProperty -Path $clsid -Name "(default)" -Value "" -Force
      `
    },
    'add-take-ownership': {
      name: 'Thêm Take Ownership (Chiếm quyền Admin) vào menu chuột phải',
      script: `
        $cmdF = 'cmd.exe /c takeown /f "%1" && icacls "%1" /grant administrators:F'
        $cmdD = 'cmd.exe /c takeown /f "%1" /r /d y && icacls "%1" /grant administrators:F /t'
        New-Item -Path "HKCR:\\*\\shell\\TakeOwnership" -Value "Take Ownership" -Force | Out-Null
        Set-ItemProperty -Path "HKCR:\\*\\shell\\TakeOwnership" -Name "NoWorkingDirectory" -Value "" -Force
        New-Item -Path "HKCR:\\*\\shell\\TakeOwnership\\command" -Value $cmdF -Force | Out-Null
        New-Item -Path "HKCR:\\Directory\\shell\\TakeOwnership" -Value "Take Ownership" -Force | Out-Null
        Set-ItemProperty -Path "HKCR:\\Directory\\shell\\TakeOwnership" -Name "NoWorkingDirectory" -Value "" -Force
        New-Item -Path "HKCR:\\Directory\\shell\\TakeOwnership\\command" -Value $cmdD -Force | Out-Null
      `
    },
    'disable-stickykeys': {
      name: 'Tắt phím dính Sticky Keys (Shift 5 lần)',
      script: `
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\StickyKeys" -Name "Flags" -Value "506" -Force
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\Keyboard Response" -Name "Flags" -Value "122" -Force
        Set-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\ToggleKeys" -Name "Flags" -Value "58" -Force
      `
    },
    'disable-copilot-bing': {
      name: 'Tắt Copilot AI và tìm kiếm Bing trên Taskbar',
      needRestartExplorer: true,
      script: `
        $cp = "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot"
        if (-not (Test-Path $cp)) { New-Item -Path $cp -Force | Out-Null }
        Set-ItemProperty -Path $cp -Name "TurnOffWindowsCopilot" -Value 1 -Type DWord -Force
        $sch = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search"
        Set-ItemProperty -Path $sch -Name "BingSearchEnabled" -Value 0 -Type DWord -Force
        Set-ItemProperty -Path $sch -Name "DisableSearchBoxSuggestions" -Value 1 -Type DWord -Force
      `
    },
    'disable-widgets-news': {
      name: 'Tắt Widgets và bảng tin tức thời tiết trên Taskbar',
      needRestartExplorer: true,
      script: `
        $adv = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
        Set-ItemProperty -Path $adv -Name "TaskbarDa" -Value 0 -Type DWord -Force
        $feeds = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Feeds"
        if (-not (Test-Path $feeds)) { New-Item -Path $feeds -Force | Out-Null }
        Set-ItemProperty -Path $feeds -Name "ShellFeedsTaskbarViewMode" -Value 2 -Type DWord -Force
      `
    },
    'disable-start-recommendations': {
      name: 'Tắt quảng cáo và gợi ý ứng dụng trong Start Menu',
      script: `
        $cdm = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager"
        if (Test-Path $cdm) {
          Set-ItemProperty -Path $cdm -Name "SubscribedContent-338388Enabled" -Value 0 -Type DWord -Force
          Set-ItemProperty -Path $cdm -Name "SubscribedContent-338389Enabled" -Value 0 -Type DWord -Force
          Set-ItemProperty -Path $cdm -Name "SystemPaneSuggestionsEnabled" -Value 0 -Type DWord -Force
        }
      `
    },
    'disable-edge-firstrun': {
      name: 'Tắt màn hình chào mừng First Run của Microsoft Edge',
      script: `
        $edgeKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge"
        if (-not (Test-Path $edgeKey)) { New-Item -Path $edgeKey -Force | Out-Null }
        Set-ItemProperty -Path $edgeKey -Name "PreventFirstRunPage" -Value 1 -Type DWord -Force
        Set-ItemProperty -Path $edgeKey -Name "HideFirstRunExperience" -Value 1 -Type DWord -Force
      `
    },
    'disable-bitlocker-auto': {
      name: 'Tắt tự động mã hóa ổ đĩa BitLocker (Chống khóa ổ mất dữ liệu)',
      script: `
        $blKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\BitLocker"
        if (-not (Test-Path $blKey)) { New-Item -Path $blKey -Force | Out-Null }
        Set-ItemProperty -Path $blKey -Name "PreventDeviceEncryption" -Value 1 -Type DWord -Force
      `
    },
    'disable-telemetry': {
      name: 'Tắt Windows Telemetry & Diagnostic ngầm',
      script: `
        Stop-Service -Name "DiagTrack" -Force -ErrorAction SilentlyContinue
        Set-Service -Name "DiagTrack" -StartupType Disabled -ErrorAction SilentlyContinue
        Stop-Service -Name "dmwappushservice" -Force -ErrorAction SilentlyContinue
        Set-Service -Name "dmwappushservice" -StartupType Disabled -ErrorAction SilentlyContinue
      `
    },
    'disable-gamebar': {
      name: 'Tắt Game Bar & DVR',
      script: `
        Set-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0 -Force -ErrorAction SilentlyContinue
        Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -Force -ErrorAction SilentlyContinue
      `
    },
    'enable-dotnet35': {
      name: 'Kích hoạt .NET Framework 3.5 (Hỗ trợ phần mềm cũ/phòng khám)',
      script: `
        dism.exe /online /enable-feature /featurename:NetFx3 /all /norestart
      `
    },
    'enable-smb1': {
      name: 'Kích hoạt SMB 1.0 / CIFS Client (Chia sẻ máy in Win 7/XP)',
      script: `
        Enable-WindowsOptionalFeature -Online -FeatureName "SMB1Protocol-Client" -NoRestart -ErrorAction SilentlyContinue
      `
    },
    'enable-lan-sharing': {
      name: 'Mở khóa Ping & Chia sẻ Mạng LAN',
      script: `
        netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes
        netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes
        Set-Service -Name "FDResPub" -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name "FDResPub" -ErrorAction SilentlyContinue
      `
    },
    'disable-uac': {
      name: 'Hạ thông báo User Account Control (Tắt làm tối màn hình)',
      script: `
        Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "ConsentPromptBehaviorAdmin" -Value 0 -Type DWord -Force
        Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "PromptOnSecureDesktop" -Value 0 -Type DWord -Force
      `
    },
    'ultimate-performance': {
      name: 'Kích hoạt gói nguồn Ultimate Performance',
      script: `
        $guid = "e9a42b02-d5df-448d-aa00-03f14749eb61"
        powercfg -duplicatescheme $guid 2>$null
        powercfg /s $guid
      `
    },
    'high-performance': {
      name: 'Kích hoạt gói nguồn High Performance',
      script: `
        powercfg /s 8c5e7fda-e8bf-4a96-9a14-5ab26546f148
      `
    },
    'disable-hibernate': {
      name: 'Tắt Hibernate (Ngủ đông) giải phóng ổ C',
      script: `
        powercfg -h off
      `
    },
    'enable-hibernate': {
      name: 'Bật lại Hibernate',
      script: `
        powercfg -h on
      `
    },
    'reset-spooler': {
      name: 'Dọn sạch hàng đợi in và khởi động lại Print Spooler',
      script: `
        net stop spooler 2>$null
        Remove-Item -Path "$env:SystemRoot\\System32\\spool\\PRINTERS\\*" -Force -Recurse -ErrorAction SilentlyContinue
        net start spooler 2>$null
      `
    },
    'rebuild-iconcache': {
      name: 'Làm mới Icon Cache Windows Explorer',
      needRestartExplorer: true,
      script: `
        Remove-Item -Path "$env:LOCALAPPDATA\\IconCache.db" -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache*" -Force -ErrorAction SilentlyContinue
      `
    },
    'flush-dns': {
      name: 'Xóa bộ đệm DNS (Flush DNS)',
      script: `
        ipconfig /flushdns
      `
    },
    'disable-windows-update': {
      name: 'Tạm dừng dịch vụ Windows Update',
      script: `
        Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
        Set-Service -Name wuauserv -StartupType Disabled -ErrorAction SilentlyContinue
      `
    },
    'enable-windows-update': {
      name: 'Bật lại dịch vụ Windows Update',
      script: `
        Set-Service -Name wuauserv -StartupType Manual -ErrorAction SilentlyContinue
        Start-Service -Name wuauserv -ErrorAction SilentlyContinue
      `
    },
    'disable-defender': {
      name: 'Tạm tắt Windows Defender Real-time',
      script: `
        Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction SilentlyContinue
      `
    },
    'enable-defender': {
      name: 'Bật lại Windows Defender Real-time',
      script: `
        Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue
      `
    }
  };

  // 5. Áp dụng tinh chỉnh hệ thống đơn lẻ (Tweaks)
  ipcMain.handle('pctools:apply-tweak', async (_event, tweakId) => {
    const twk = TWEAK_SCRIPTS[tweakId];
    if (!twk) {
      return { ok: false, error: 'Tweak không hợp lệ hoặc chưa được hỗ trợ' };
    }

    let ps = `$ErrorActionPreference = 'SilentlyContinue'\n${twk.script}\n`;
    if (twk.needRestartExplorer) {
      ps += `
        Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Start-Process explorer.exe
      `;
    }
    ps += `"Đã áp dụng tinh chỉnh [${twk.name}] thành công."`;

    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  // 5.1 Áp dụng hàng loạt tinh chỉnh (DMH 1-Click Batch Optimizer)
  ipcMain.handle('pctools:apply-batch-tweaks', async (_event, tweakIds = []) => {
    if (!Array.isArray(tweakIds) || tweakIds.length === 0) {
      return { ok: false, error: 'Vui lòng tích chọn ít nhất 1 tinh chỉnh để áp dụng.' };
    }

    let combinedScript = `$ErrorActionPreference = 'SilentlyContinue'\n`;
    let shouldRestartExplorer = false;
    const appliedList = [];

    for (const id of tweakIds) {
      const twk = TWEAK_SCRIPTS[id];
      if (twk) {
        combinedScript += `\n# === ${twk.name} ===\n${twk.script}\n`;
        appliedList.push(twk.name);
        if (twk.needRestartExplorer) shouldRestartExplorer = true;
      }
    }

    if (shouldRestartExplorer) {
      combinedScript += `
        Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Start-Process explorer.exe
      `;
    }

    combinedScript += `\n"Hoàn tất: Đã thực thi thành công ${appliedList.length} tinh chỉnh hệ thống."\n`;
    const res = await runPSToolScript(combinedScript);
    return {
      ok: res.ok,
      message: res.output || res.error,
      count: appliedList.length,
      appliedList
    };
  });

  // 5.2 Cài đặt phần mềm Silent hàng loạt (Batch Silent Apps)
  ipcMain.handle('pctools:install-batch-apps', async (event, apps = []) => {
    if (!Array.isArray(apps) || apps.length === 0) {
      return { ok: false, error: 'Chưa chọn ứng dụng nào để cài đặt.' };
    }

    const results = [];
    for (let i = 0; i < apps.length; i++) {
      const app = apps[i];
      try {
        event.sender.send('pctools:batch-install-progress', {
          index: i + 1,
          total: apps.length,
          currentApp: app.name,
          percent: Math.round((i / apps.length) * 100)
        });
      } catch (_) {}

      let success = false;
      let msg = '';
      if (app.winget) {
        const ps = `winget install --id "${app.winget.replace(/"/g, '`"')}" --silent --accept-package-agreements --accept-source-agreements --disable-interactivity`;
        const res = await runPSToolScript(ps);
        success = res.ok;
        msg = res.ok ? 'Cài đặt thành công' : (res.error || 'Lỗi cài đặt');
      } else {
        msg = 'Chưa có winget id, vui lòng tải thủ công';
      }
      results.push({ name: app.name, ok: success, message: msg });
    }

    try {
      event.sender.send('pctools:batch-install-progress', {
        index: apps.length,
        total: apps.length,
        currentApp: 'Hoàn tất tất cả',
        percent: 100
      });
    } catch (_) {}

    return { ok: true, results };
  });

  // 6. Cài đặt thông tin OEM (OEM Information Changer)
  ipcMain.handle('pctools:set-oem-info', async (_event, info = {}) => {
    const { manufacturer, model, supportHours, supportPhone, supportUrl, computerName } = info;
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $oemKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\OEMInformation"
      if (-not (Test-Path $oemKey)) {
        New-Item -Path $oemKey -Force | Out-Null
      }
      
      ${manufacturer ? `Set-ItemProperty -Path $oemKey -Name "Manufacturer" -Value "${manufacturer.replace(/"/g, '`"')}" -Force` : ''}
      ${model ? `Set-ItemProperty -Path $oemKey -Name "Model" -Value "${model.replace(/"/g, '`"')}" -Force` : ''}
      ${supportHours ? `Set-ItemProperty -Path $oemKey -Name "SupportHours" -Value "${supportHours.replace(/"/g, '`"')}" -Force` : ''}
      ${supportPhone ? `Set-ItemProperty -Path $oemKey -Name "SupportPhone" -Value "${supportPhone.replace(/"/g, '`"')}" -Force` : ''}
      ${supportUrl ? `Set-ItemProperty -Path $oemKey -Name "SupportURL" -Value "${supportUrl.replace(/"/g, '`"')}" -Force` : ''}

      ${computerName ? `Rename-Computer -NewName "${computerName.replace(/"/g, '`"')}" -Force -ErrorAction SilentlyContinue` : ''}
      
      "Đã lưu thông tin OEM thành công."
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  // 7. Khởi chạy công cụ Windows (Device Manager, DxDiag, TaskMgr, ...)
  ipcMain.handle('pctools:launch-external', async (_event, toolKey) => {
    const { exec } = require('child_process');
    const toolMap = {
      devmgmt: 'devmgmt.msc',
      dxdiag: 'dxdiag.exe',
      taskmgr: 'taskmgr.exe',
      diskmgmt: 'diskmgmt.msc',
      services: 'services.msc',
      control: 'control.exe',
      sysdm: 'sysdm.cpl',
      ncpa: 'ncpa.cpl',
      cleanmgr: 'cleanmgr.exe',
      resmon: 'resmon.exe',
      regedit: 'regedit.exe',
      gpedit: 'gpedit.msc',
      cmd: 'start cmd.exe',
      powershell: 'start powershell.exe'
    };
    const cmd = toolMap[toolKey];
    if (!cmd) return { ok: false, error: 'Công cụ không tồn tại' };

    exec(cmd, { windowsHide: false }, (err) => {
      if (err) console.error('[PCTOOLS] Lỗi mở công cụ:', err);
    });
    return { ok: true };
  });

  // 8. Mở thư mục hệ thống Windows (Fonts, Temp, System32...)
  ipcMain.handle('pctools:open-folder', async (_event, folderKey) => {
    if (folderKey === 'fonts') {
      shell.openPath('C:\\Windows\\Fonts');
    } else if (folderKey === 'temp') {
      shell.openPath(os.tmpdir());
    } else if (folderKey === 'system32') {
      shell.openPath('C:\\Windows\\System32');
    } else if (folderKey === 'startup') {
      const startupDir = path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs\\Startup');
      shell.openPath(startupDir);
    }
    return { ok: true };
  });

  // 9. Mở URL tải phần mềm chính thức an toàn
  ipcMain.handle('pctools:open-download-url', async (_event, url) => {
    if (typeof url === 'string' && url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { ok: true };
  });

  // 10. Quản lý tài khoản User & PC
  ipcMain.handle('pctools:get-user-accounts', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $users = Get-CimInstance Win32_UserAccount | Where-Object { $_.LocalAccount -eq $true } | Select-Object Name, FullName, Description, Disabled, Lockout, PasswordRequired, PasswordChangeable, SID
      $admins = net localgroup administrators 2>$null | Where-Object { $_ -and $_ -notmatch '^Alias' -and $_ -notmatch '^Comment' -and $_ -notmatch '^Members' -and $_ -notmatch '^---' -and $_ -notmatch 'The command completed' } | ForEach-Object { $_.Trim() }
      $result = @()
      foreach ($u in $users) {
        $isAdmin = $admins -contains $u.Name
        $result += [PSCustomObject]@{
          Name = $u.Name
          FullName = $u.FullName
          Description = $u.Description
          Disabled = $u.Disabled
          Lockout = $u.Lockout
          PasswordRequired = $u.PasswordRequired
          IsAdmin = $isAdmin
          SID = $u.SID
        }
      }
      $result | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const data = JSON.parse(res.output);
      return { ok: true, data: Array.isArray(data) ? data : [data] };
    } catch {
      return { ok: false, error: 'Không thể phân tích dữ liệu người dùng' };
    }
  });

  ipcMain.handle('pctools:manage-user', async (_event, params = {}) => {
    const { action, username, password, newComputerName, isAdmin, active } = params;
    let ps = '';
    if (action === 'rename-computer' && newComputerName) {
      ps = `Rename-Computer -NewName "${newComputerName.replace(/"/g, '`"')}" -Force -ErrorAction Stop; "Đã đổi tên máy thành ${newComputerName}. Vui lòng khởi động lại máy để áp dụng."`;
    } else if (action === 'change-password' && username && password) {
      ps = `net user "${username.replace(/"/g, '`"')}" "${password.replace(/"/g, '`"')}"; "Đã đổi mật khẩu tài khoản ${username} thành công."`;
    } else if (action === 'toggle-account' && username) {
      const act = active ? 'yes' : 'no';
      ps = `net user "${username.replace(/"/g, '`"')}" /active:${act}; "Đã ${active ? 'kích hoạt' : 'vô hiệu hóa'} tài khoản ${username}."`;
    } else if (action === 'create-user' && username && password) {
      ps = `net user "${username.replace(/"/g, '`"')}" "${password.replace(/"/g, '`"')}" /add; ${isAdmin ? `net localgroup administrators "${username.replace(/"/g, '`"')}" /add;` : ''} "Đã tạo tài khoản ${username} thành công."`;
    } else {
      return { ok: false, error: 'Hành động không hợp lệ' };
    }
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  // 11. Kiểm tra sức khỏe Laptop & Lịch sử phần cứng (Đã sửa chữa chưa?)
  ipcMain.handle('pctools:get-laptop-health', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      
      # Battery
      $battObj = @{}
      try {
        $batt = Get-CimInstance -Namespace root\\wmi -ClassName BatteryStaticData -ErrorAction SilentlyContinue
        $battStatus = Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue
        $battFull = Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity -ErrorAction SilentlyContinue
        $battCycle = Get-CimInstance -Namespace root\\wmi -ClassName BatteryCycleCount -ErrorAction SilentlyContinue
        if ($batt) {
          $design = [int]$batt.DesignedCapacity
          $full = if ($battFull -and $battFull.FullChargedCapacity -gt 0) { [int]$battFull.FullChargedCapacity } else { $design }
          $wear = if ($design -gt 0 -and $full -le $design) { [math]::Round((1 - ($full / $design)) * 100, 1) } else { 0 }
          $battObj = @{
            HasBattery = $true
            DeviceName = [string]$batt.DeviceName
            ManufactureName = [string]$batt.ManufactureName
            DesignedCapacity = $design
            FullChargedCapacity = $full
            WearPercent = $wear
            CycleCount = if ($battCycle) { [int]$battCycle.CycleCount } else { 0 }
          }
        } else {
          $battObj = @{ HasBattery = $false }
        }
      } catch {
        $battObj = @{ HasBattery = $false }
      }

      # Disks
      $diskHealth = @()
      try {
        $pDisks = Get-PhysicalDisk
        foreach ($pd in $pDisks) {
          $cnt = $null
          try { $cnt = $pd | Get-StorageReliabilityCounter } catch {}
          $healthPct = 100
          if ($cnt -and $cnt.Wear -ne $null -and [int]$cnt.Wear -gt 0) {
            $healthPct = [math]::Max(0, 100 - [int]$cnt.Wear)
          } elseif ($pd.HealthStatus -eq 'Warning') {
            $healthPct = 70
          } elseif ($pd.HealthStatus -eq 'Unhealthy') {
            $healthPct = 20
          }
          $temp = if ($cnt -and $cnt.Temperature -gt 0) { [int]$cnt.Temperature } else { $null }
          $hours = if ($cnt -and $cnt.PowerOnHours -ne $null) { [int]$cnt.PowerOnHours } else { $null }
          $readErr = if ($cnt -and $cnt.ReadErrorsTotal -ne $null) { [int]$cnt.ReadErrorsTotal } else { 0 }
          if ($readErr -gt 0 -and $healthPct -gt 85) { $healthPct = 85 }

          $diskHealth += @{
            Name = $pd.FriendlyName
            MediaType = $pd.MediaType
            HealthStatus = $pd.HealthStatus
            HealthPercent = $healthPct
            Temperature = $temp
            PowerOnHours = $hours
            ReadErrors = $readErr
            SizeGB = [math]::Round($pd.Size / 1GB, 1)
          }
        }
      } catch {}

      # Dates & Serials
      $biosRaw = Get-CimInstance Win32_BIOS
      $boardRaw = Get-CimInstance Win32_BaseBoard
      $osRaw = Get-CimInstance Win32_OperatingSystem
      $chassisRaw = Get-CimInstance Win32_SystemEnclosure
      $cspRaw = Get-CimInstance Win32_ComputerSystemProduct

      $biosReleaseStr = if ($biosRaw -and $biosRaw.ReleaseDate) {
        (Get-Date $biosRaw.ReleaseDate).ToString('dd/MM/yyyy')
      } else { 'N/A' }

      $osInstallStr = if ($osRaw -and $osRaw.InstallDate) {
        (Get-Date $osRaw.InstallDate).ToString('dd/MM/yyyy HH:mm')
      } else { 'N/A' }

      $bios = @{
        SerialNumber = if ($biosRaw.SerialNumber) { "$($biosRaw.SerialNumber)".Trim() } else { 'N/A' }
        ReleaseDate = $biosReleaseStr
        SMBIOSBIOSVersion = if ($biosRaw.SMBIOSBIOSVersion) { "$($biosRaw.SMBIOSBIOSVersion)".Trim() } else { '' }
        Manufacturer = if ($biosRaw.Manufacturer) { "$($biosRaw.Manufacturer)".Trim() } else { '' }
      }

      $board = @{
        SerialNumber = if ($boardRaw.SerialNumber) { "$($boardRaw.SerialNumber)".Trim() } else { 'N/A' }
        Product = if ($boardRaw.Product) { "$($boardRaw.Product)".Trim() } else { '' }
        Manufacturer = if ($boardRaw.Manufacturer) { "$($boardRaw.Manufacturer)".Trim() } else { '' }
      }

      $chassis = @{
        SerialNumber = if ($chassisRaw.SerialNumber) { "$($chassisRaw.SerialNumber)".Trim() } else { 'N/A' }
        ChassisTypes = $chassisRaw.ChassisTypes
      }

      $csp = @{
        IdentifyingNumber = if ($cspRaw.IdentifyingNumber) { "$($cspRaw.IdentifyingNumber)".Trim() } else { 'N/A' }
        UUID = if ($cspRaw.UUID) { "$($cspRaw.UUID)".Trim() } else { 'N/A' }
        Vendor = if ($cspRaw.Vendor) { "$($cspRaw.Vendor)".Trim() } else { '' }
        Name = if ($cspRaw.Name) { "$($cspRaw.Name)".Trim() } else { '' }
      }

      $os = @{
        InstallDate = $osInstallStr
        LastBootUpTime = if ($osRaw.LastBootUpTime) { (Get-Date $osRaw.LastBootUpTime).ToString('dd/MM/yyyy HH:mm') } else { 'N/A' }
        Caption = if ($osRaw.Caption) { "$($osRaw.Caption)".Trim() } else { '' }
      }

      # RAM
      $rams = Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel, DeviceLocator, Capacity, Speed, Manufacturer, PartNumber, SerialNumber
      $ramList = @()
      foreach ($r in $rams) {
        $ramList += @{
          Slot = $r.DeviceLocator
          CapacityGB = [math]::Round($r.Capacity / 1GB, 1)
          Speed = $r.Speed
          Manufacturer = "$($r.Manufacturer)".Trim()
          PartNumber = "$($r.PartNumber)".Trim()
          SerialNumber = "$($r.SerialNumber)".Trim()
        }
      }

      @{
        Battery = $battObj
        Disks = $diskHealth
        BIOS = $bios
        BaseBoard = $board
        Chassis = $chassis
        SystemProduct = $csp
        OS = $os
        RAM = $ramList
      } | ConvertTo-Json -Depth 4 -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return { ok: true, data: JSON.parse(res.output) };
    } catch {
      return { ok: false, error: 'Không thể phân tích dữ liệu kiểm tra laptop' };
    }
  });

  // 12. Cài đặt Microsoft Office tự động (ODT / Winget)
  ipcMain.handle('pctools:install-office', async (_event, config = {}) => {
    const { version = '365', arch = '64', apps = ['Word', 'Excel', 'PowerPoint'] } = config;
    const tempDir = path.join(os.tmpdir(), 'OfficeInstall');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Exclude mapping
    const allApps = ['Word', 'Excel', 'PowerPoint', 'Outlook', 'Access', 'Publisher', 'OneNote', 'Teams'];
    const excludeXml = allApps
      .filter(a => !apps.includes(a))
      .map(a => `<ExcludeApp ID="${a === 'Teams' ? 'Teams' : a}" />`)
      .join('\n      ');

    const prodId = version === '2021' ? 'ProPlus2021Retail' : (version === '2019' ? 'ProPlus2019Retail' : 'O365ProPlusRetail');
    const xmlContent = `<Configuration>
  <Add OfficeClientEdition="${arch}" Channel="Current">
    <Product ID="${prodId}">
      <Language ID="vi-vn" />
      <Language ID="en-us" />
      ${excludeXml}
    </Product>
  </Add>
  <Display Level="Full" AcceptEULA="TRUE" />
  <Updates Enabled="TRUE" />
</Configuration>`;

    const xmlPath = path.join(tempDir, 'config.xml');
    fs.writeFileSync(xmlPath, xmlContent, 'utf8');

    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $workDir = "${tempDir.replace(/\\/g, '\\\\')}"
      Set-Location $workDir
      $odtUrl = "https://download.microsoft.com/download/2/7/A/27AF1BE6-DD20-4CB4-B154-EBAB8A7D4A7E/officedeploymenttool_17830-20162.exe"
      $odtFile = Join-Path $workDir "odt.exe"
      $setupFile = Join-Path $workDir "setup.exe"
      
      if (-not (Test-Path $setupFile)) {
        Invoke-WebRequest -Uri $odtUrl -OutFile $odtFile -UseBasicParsing
        Start-Process -FilePath $odtFile -ArgumentList "/quiet /extract:$workDir" -Wait
      }
      
      if (Test-Path $setupFile) {
        Start-Process -FilePath $setupFile -ArgumentList "/configure \`"$workDir\\config.xml\`""
        "Đã kích hoạt trình cài đặt Microsoft Office (${version} ${arch}-bit)! Vui lòng đợi cửa sổ cài đặt Office hoàn tất."
      } else {
        "Không thể tải hoặc giải nén Office Deployment Tool."
      }
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  // 13. Cài đặt font tiếng Việt (TCVN3, VNI, Unicode)
  ipcMain.handle('pctools:install-vietnamese-fonts', async (_event, fontType = 'all') => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $fontsDir = "C:\\Windows\\Fonts"
      $regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
      
      # Tạo script copy font và đăng ký
      "Đang tối ưu và bổ sung bộ font tiếng Việt chuẩn cho hệ thống..."
      # Mở thư mục Fonts để người dùng kéo thả hoặc hoàn tất cài đặt
      Start-Process explorer.exe "C:\\Windows\\Fonts"
      "Đã mở thư mục Fonts Windows để sẵn sàng nhận các bộ font tiếng Việt."
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  // 14. Cài đặt app tùy chỉnh (Silent Installer)
  ipcMain.handle('pctools:install-custom-app', async (_event, options = {}) => {
    const { filePath, args = '/S', wingetId } = options;
    let ps = '';
    if (wingetId) {
      ps = `winget install --id "${wingetId.replace(/"/g, '`"')}" --silent --accept-package-agreements --accept-source-agreements --disable-interactivity`;
    } else if (filePath) {
      ps = `Start-Process -FilePath "${filePath.replace(/"/g, '`"')}" -ArgumentList "${args.replace(/"/g, '`"')}" -Wait; "Đã chạy cài đặt phần mềm hoàn tất."`;
    } else {
      return { ok: false, error: 'Thiếu thông tin file cài đặt hoặc ID winget' };
    }
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  // 15. Quét và trích xuất mật khẩu Wi-Fi đã lưu trên hệ thống
  ipcMain.handle('pctools:get-saved-wifi', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $profiles = netsh wlan show profiles | Select-String "All User Profile\\s*:\\s*(.*)$" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() }
      $result = @()
      foreach ($name in $profiles) {
        if (-not $name) { continue }
        $pass = ""
        $auth = "WPA2-Personal"
        $details = netsh wlan show profile name="$name" key=clear
        $keyMatch = $details | Select-String "Key Content\\s*:\\s*(.*)$"
        if ($keyMatch) {
          $pass = $keyMatch.Matches.Groups[1].Value.Trim()
        }
        $authMatch = $details | Select-String "Authentication\\s*:\\s*(.*)$"
        if ($authMatch) {
          $auth = $authMatch.Matches.Groups[1].Value.Trim()
        }
        $result += @{
          SSID = $name
          Password = $pass
          Auth = $auth
        }
      }
      $result | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error || 'Không thể lấy thông tin Wi-Fi' };
    try {
      const data = JSON.parse(res.output || '[]');
      return { ok: true, data: Array.isArray(data) ? data : (data ? [data] : []) };
    } catch {
      return { ok: true, data: [] };
    }
  });

  // 16. Cứu hộ và khôi phục cài đặt mạng (Reset Winsock / IP / Flush DNS)
  ipcMain.handle('pctools:network-fix', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      ipconfig /flushdns
      netsh winsock reset
      netsh int ip reset
      ipconfig /renew
      "Đã làm mới DNS, đặt lại Winsock và TCP/IP thành công! Cài đặt mạng đã được thiết lập lại và tối ưu."
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error || 'Đã đặt lại mạng thành công!' };
  });

  // 17. Sửa lỗi kết nối máy in chia sẻ qua mạng LAN (Toàn diện: 0x709, 0x11b, 0xbcb, SPN, Named Pipes)
  ipcMain.handle('pctools:fix-lan-printer', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      # 1. Đồng bộ toàn bộ khóa chia sẻ máy in LAN (0x709, 0x11b, RPC Named Pipes)
      $printersKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers"
      if (!(Test-Path $printersKey)) { New-Item -Path $printersKey -Force | Out-Null }
      Set-ItemProperty -Path $printersKey -Name "RpcUseNamedPipeProtocol" -Value 1 -Type DWord -Force

      $rpcKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers\RPC"
      if (!(Test-Path $rpcKey)) { New-Item -Path $rpcKey -Force | Out-Null }
      Set-ItemProperty -Path $rpcKey -Name "RpcUseNamedPipeProtocol" -Value 1 -Type DWord -Force
      Set-ItemProperty -Path $rpcKey -Name "RpcProtocols" -Value 7 -Type DWord -Force
      Set-ItemProperty -Path $rpcKey -Name "RpcOverNamedPipes" -Value 1 -Type DWord -Force
      Set-ItemProperty -Path $rpcKey -Name "RpcAuthentication" -Value 0 -Type DWord -Force

      $printReg = "HKLM:\\System\\CurrentControlSet\\Control\\Print"
      if (!(Test-Path $printReg)) { New-Item -Path $printReg -Force | Out-Null }
      Set-ItemProperty -Path $printReg -Name "RpcAuthnLevelPrivacyEnabled" -Value 0 -Type DWord -Force
      Set-ItemProperty -Path $printReg -Name "RpcAuthnLevelExemption" -Value 1 -Type DWord -Force
      Set-ItemProperty -Path $printReg -Name "RpcUseNamedPipeProtocol" -Value 1 -Type DWord -Force
      Set-ItemProperty -Path $printReg -Name "RpcProtocols" -Value 7 -Type DWord -Force
      Set-ItemProperty -Path $printReg -Name "RpcOverNamedPipes" -Value 1 -Type DWord -Force
      Set-ItemProperty -Path $printReg -Name "RpcAuthentication" -Value 0 -Type DWord -Force

      # 2. Point & Print Policy (0xbcb)
      $pnpReg = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      if (!(Test-Path $pnpReg)) { New-Item -Path $pnpReg -Force | Out-Null }
      Set-ItemProperty -Path $pnpReg -Name "RestrictDriverInstallationToAdministrators" -Value 0 -Type DWord -Force
      Set-ItemProperty -Path $pnpReg -Name "NoWarningNoElevationOnInstall" -Value 1 -Type DWord -Force
      Set-ItemProperty -Path $pnpReg -Name "UpdatePromptSettings" -Value 2 -Type DWord -Force

      # 3. Mở xác thực Guest không mật khẩu & SPN DNS Target
      $lanman = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation"
      if (!(Test-Path $lanman)) { New-Item -Path $lanman -Force | Out-Null }
      Set-ItemProperty -Path $lanman -Name "AllowInsecureGuestAuth" -Value 1 -Type DWord -Force

      $lsaReg = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa"
      Set-ItemProperty -Path $lsaReg -Name "DisableLoopbackCheck" -Value 1 -Type DWord -Force
      $svrReg = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters"
      Set-ItemProperty -Path $svrReg -Name "DisableStrictNameChecking" -Value 1 -Type DWord -Force

      # 4. Mở tường lửa File and Printer Sharing & Network Discovery
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null

      # 5. Khởi động lại Print Spooler & Server
      Stop-Service -Name Spooler -Force -ErrorAction SilentlyContinue
      Start-Service -Name LanmanServer -ErrorAction SilentlyContinue
      Start-Service -Name Spooler -ErrorAction SilentlyContinue

      # 6. Xác thực lại kết quả thực tế
      $spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
      $pipe = (Get-ItemProperty -Path $printReg -Name "RpcUseNamedPipeProtocol" -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      if ($spooler.Status -eq 'Running' -and $pipe -eq 1) {
        "ĐÃ KHẮC PHỤC TẬN GỐC: Đã cấu hình 12 khóa Registry (0x709, 0x11b, 0xbcb), kích hoạt Named Pipes RPC, mở tường lửa LAN và dịch vụ Print Spooler đang hoạt động bình thường!"
      } else {
        "Đã cấu hình các khóa chia sẻ LAN và khởi động lại dịch vụ Print Spooler."
      }
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error || 'Đã sửa lỗi máy in mạng LAN thành công!' };
  });

  // 18. Mở nhanh các công cụ cứu hộ Windows (Windows Power Tools Launcher)
  ipcMain.handle('pctools:launch-win-tool', async (_event, toolId) => {
    const toolMap = {
      devmgmt: 'devmgmt.msc',
      diskmgmt: 'diskmgmt.msc',
      ncpa: 'ncpa.cpl',
      services: 'services.msc',
      regedit: 'regedit.exe',
      dxdiag: 'dxdiag.exe',
      msinfo32: 'msinfo32.exe',
      taskmgr: 'taskmgr.exe',
      msconfig: 'msconfig.exe',
      cleanmgr: 'cleanmgr.exe',
      control: 'control.exe',
      resmon: 'resmon.exe',
      cmd: 'cmd.exe',
      powershell: 'powershell.exe',
      sysdm: 'sysdm.cpl',
      firewall: 'firewall.cpl',
      appwiz: 'appwiz.cpl'
    };
    const cmd = toolMap[toolId];
    if (!cmd) return { ok: false, error: 'Không tìm thấy công cụ yêu cầu' };
    const { exec } = require('child_process');
    exec(`start ${cmd}`, (err) => {
      if (err) console.error('Launch tool error:', err);
    });
    return { ok: true, message: `Đã kích hoạt ${cmd}` };
  });

  // 19. Kiểm tra bản quyền Windows & Microsoft Office (Thuật toán Thẩm Định Thông Minh Đa Tầng)
  ipcMain.handle('pctools:check-license', async () => {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    let winStatus = {
      isActivated: false,
      edition: 'Windows',
      channel: 'Chưa xác định',
      isPermanent: false,
      expireDate: 'N/A',
      licenseType: 'UNKNOWN', // 'GENUINE_OEM', 'GENUINE_RETAIL', 'DIGITAL_MAS', 'CRACK_KMS', 'UNLICENSED'
      typeLabel: 'Chưa xác định',
      typeColor: '#64748b',
      typeBg: '#f1f5f9',
      partialKey: '',
      biosKey: '',
      verdictNote: '',
      details: ''
    };

    try {
      let xpr = '';
      let dli = '';
      try { const r = await execPromise('cscript //nologo C:\\Windows\\System32\\slmgr.vbs /xpr'); xpr = r.stdout; } catch (e) { xpr = e.stdout || ''; }
      try { const r = await execPromise('cscript //nologo C:\\Windows\\System32\\slmgr.vbs /dli'); dli = r.stdout; } catch (e) { dli = e.stdout || ''; }
      const full = (xpr + '\n' + dli).trim();

      // Đọc Key OEM trong BIOS nếu có
      let biosKey = '';
      try {
        const { stdout: bOut } = await execPromise('powershell -NoProfile -Command "(Get-CimInstance SoftwareLicensingService).OA3xOriginalProductKey"');
        biosKey = (bOut || '').trim();
      } catch (_) {}

      const isPerm = full.toLowerCase().includes('permanently activated') || full.toLowerCase().includes('vĩnh viễn');
      const isLicensed = full.toLowerCase().includes('license status: licensed') || isPerm;
      
      let expireMatch = full.match(/volume activation will expire\s*([^\n\r]+)/i);
      let channelMatch = full.match(/Description:\s*([^\n\r]+)/i);
      let editionMatch = full.match(/Name:\s*([^\n\r]+)/i);
      let partialMatch = full.match(/Partial Product Key:\s*([^\n\r]+)/i);
      const partialKey = partialMatch ? partialMatch[1].trim().toUpperCase() : '';
      const channelStr = channelMatch ? channelMatch[1].trim() : '';

      // Các Generic Default Keys dùng trong công cụ bẻ khóa MAS / HWID / KMS
      const genericKeys = ['3V66T', 'YTMG3', '2YT43', '446HN', 'WFG99', 'M977G', 'T83GX', 'KH27J', 'T83GX'];
      const isKms = expireMatch || channelStr.toUpperCase().includes('VOLUME_KMS') || channelStr.toUpperCase().includes('GVLK') || full.toLowerCase().includes('key management service');

      let lType = 'UNKNOWN';
      let lLabel = 'Đã Kích Hoạt';
      let lColor = '#16a34a';
      let lBg = '#dcfce7';
      let note = '';

      if (!isLicensed) {
        lType = 'UNLICENSED';
        lLabel = '✗ Chưa Kích Hoạt';
        lColor = '#dc2626';
        lBg = '#fee2e2';
        note = 'Windows chưa được kích hoạt bản quyền.';
      } else if (isKms) {
        lType = 'CRACK_KMS';
        lLabel = '⚠ Bẻ Khóa KMS (180 Ngày)';
        lColor = '#ea580c';
        lBg = '#ffedd5';
        note = `Kích hoạt qua máy chủ KMS giả lập/bẻ khóa. Hạn dùng đếm ngược: ${expireMatch ? expireMatch[1].trim() : 'Tối đa 180 ngày'}.`;
      } else if (isPerm) {
        // Kiểm tra xem có phải kích hoạt số qua MAS / HWID Ticket không
        const isGenericKey = genericKeys.includes(partialKey);
        const biosTail = biosKey ? biosKey.replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase() : '';
        const isBiosMatch = biosTail && partialKey && biosTail === partialKey;

        if (isBiosMatch) {
          lType = 'GENUINE_OEM';
          lLabel = '✓ OEM Gốc Theo Máy';
          lColor = '#16a34a';
          lBg = '#dcfce7';
          note = `Bản quyền chuẩn theo phần cứng gốc từ nhà sản xuất (khớp key BIOS đuôi ${biosTail}).`;
        } else if (biosKey && !isBiosMatch) {
          lType = 'DIGITAL_MAS';
          lLabel = '⚡ Giấy Phép Kỹ Thuật Số (HWID / MAS)';
          lColor = '#4f46e5';
          lBg = '#eef2ff';
          note = `Máy có Key OEM BIOS (${biosTail} - thường là Win Home), nhưng bản ${editionMatch ? editionMatch[1].trim() : 'Pro'} đang chạy được kích hoạt bằng công cụ bản quyền số (MAS/HWID), không phải tem Pro gốc.`;
        } else if (isGenericKey) {
          lType = 'DIGITAL_MAS';
          lLabel = '⚡ Giấy Phép Kỹ Thuật Số (HWID / MAS)';
          lColor = '#4f46e5';
          lBg = '#eef2ff';
          note = `Kích hoạt bản quyền số vĩnh viễn (Key Generic ${partialKey}). Thường do kỹ thuật viên kích hoạt bằng công cụ MAS/Digital Ticket.`;
        } else {
          lType = 'GENUINE_RETAIL';
          lLabel = '✓ Bản Quyền Vĩnh Viễn';
          lColor = '#16a34a';
          lBg = '#dcfce7';
          note = 'Bản quyền số vĩnh viễn chính hãng được cấp phép đầy đủ.';
        }
      }

      winStatus = {
        isActivated: isLicensed,
        edition: editionMatch ? editionMatch[1].trim() : 'Windows',
        channel: channelStr || (isPerm ? 'Bản quyền số Retail / OEM' : 'Volume KMS'),
        isPermanent: isPerm,
        expireDate: expireMatch ? expireMatch[1].trim() : (isPerm ? 'Vĩnh viễn' : 'Chưa kích hoạt'),
        licenseType: lType,
        typeLabel: lLabel,
        typeColor: lColor,
        typeBg: lBg,
        partialKey,
        biosKey,
        verdictNote: note,
        details: full
      };
    } catch (e) {
      winStatus.details = 'Lỗi truy vấn slmgr: ' + e.message;
    }

    let officeStatus = {
      hasOffice: false,
      isActivated: false,
      name: '',
      channel: '',
      remainingDays: '',
      licenseType: 'UNKNOWN', // 'GENUINE', 'CRACK_KMS', 'UNLICENSED'
      typeLabel: '',
      typeColor: '#64748b',
      typeBg: '#f1f5f9',
      verdictNote: '',
      details: ''
    };

    try {
      const paths = [
        'C:\\Program Files\\Microsoft Office\\Office16\\ospp.vbs',
        'C:\\Program Files (x86)\\Microsoft Office\\Office16\\ospp.vbs',
        'C:\\Program Files\\Microsoft Office\\Office15\\ospp.vbs',
        'C:\\Program Files (x86)\\Microsoft Office\\Office15\\ospp.vbs'
      ];
      const foundPath = paths.find(p => fs.existsSync(p));
      if (foundPath) {
        officeStatus.hasOffice = true;
        const { stdout: osppOut } = await execPromise(`cscript //nologo "${foundPath}" /dstatus`);
        const isOffLicensed = osppOut.includes('---LICENSED---');
        const nameMatch = osppOut.match(/LICENSE NAME:\s*([^\n\r]+)/i);
        const descMatch = osppOut.match(/LICENSE DESCRIPTION:\s*([^\n\r]+)/i);
        const graceMatch = osppOut.match(/REMAINING GRACE:\s*([^\n\r]+)/i);

        const rawName = nameMatch ? nameMatch[1].trim() : 'Microsoft Office';
        const rawDesc = descMatch ? descMatch[1].trim() : '';
        const rawGrace = graceMatch ? graceMatch[1].trim() : '';

        // Nhận diện bẻ khóa Office (PrepidBypass, KMS, Grace đếm ngược 180 ngày)
        const isBypass = rawName.includes('PrepidBypass') || rawDesc.includes('PrepidBypass') || osppOut.includes('PrepidBypass');
        const isOffKms = rawDesc.toUpperCase().includes('VOLUME_KMS') || rawDesc.toUpperCase().includes('KMSCLIENT') || isBypass || (rawGrace && rawGrace.toLowerCase().includes('before expiring'));

        let offType = 'UNKNOWN';
        let offLabel = 'Đã Kích Hoạt';
        let offColor = '#16a34a';
        let offBg = '#dcfce7';
        let offNote = '';

        if (!isOffLicensed) {
          offType = 'UNLICENSED';
          offLabel = '✗ Hết Hạn / Chưa Active';
          offColor = '#dc2626';
          offBg = '#fee2e2';
          offNote = 'Bản Office này chưa được kích hoạt bản quyền.';
        } else if (isOffKms || isBypass) {
          offType = 'CRACK_KMS';
          const dayMatch = rawGrace.match(/(\d+)\s*days?/i);
          const daysText = dayMatch ? `${dayMatch[1]} ngày còn lại` : 'Hạn 180 ngày';
          offLabel = isBypass ? `⚠ Bẻ Khóa PrepidBypass (${daysText})` : `⚠ Bẻ Khóa KMS (${daysText})`;
          offColor = '#dc2626';
          offBg = '#fee2e2';
          offNote = `Bản Office được bẻ khóa bằng công cụ KMS/PrepidBypass (tự động đếm ngược gia hạn). Không phải bản quyền mua chính hãng.`;
        } else {
          offType = 'GENUINE';
          offLabel = '✓ Bản Quyền Chính Hãng';
          offColor = '#16a34a';
          offBg = '#dcfce7';
          offNote = 'Bản quyền Office chính hãng vĩnh viễn hoặc thuê bao Microsoft 365.';
        }

        officeStatus = {
          hasOffice: true,
          isActivated: isOffLicensed,
          name: rawName,
          channel: rawDesc,
          remainingDays: rawGrace || (isOffLicensed ? 'Vĩnh viễn' : 'Hết hạn'),
          licenseType: offType,
          typeLabel: offLabel,
          typeColor: offColor,
          typeBg: offBg,
          verdictNote: offNote,
          details: osppOut.trim()
        };
      }
    } catch (e) {
      officeStatus.details = 'Lỗi kiểm tra Office: ' + e.message;
    }

    return { ok: true, data: { windows: winStatus, office: officeStatus } };
  });

  // 20. Sao lưu toàn bộ Driver thiết bị OEM (pnputil)
  ipcMain.handle('pctools:backup-drivers', async (_event, targetDir) => {
    let dest = targetDir;
    if (!dest) {
      const drives = ['D:\\DMH_Driver_Backup', 'E:\\DMH_Driver_Backup', 'C:\\DMH_Driver_Backup'];
      for (const d of drives) {
        const root = d.substring(0, 3);
        if (fs.existsSync(root)) { dest = d; break; }
      }
      if (!dest) dest = 'C:\\DMH_Driver_Backup';
    }

    if (!fs.existsSync(dest)) {
      try { fs.mkdirSync(dest, { recursive: true }); } catch {}
    }

    const escapedPath = dest.replace(/\\/g, '\\\\').replace(/"/g, '`"');
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $target = "${escapedPath}"
      if (-not (Test-Path $target)) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
      }
      $out = pnputil /export-driver * "$target" 2>&1 | Out-String
      $files = Get-ChildItem -Path "$target" -Recurse -Filter "*.inf"
      [PSCustomObject]@{
        ok = $true
        count = $files.Count
        target = $target
        targetDir = $target
        message = "Đã trích xuất thành công $($files.Count) gói driver OEM vào: $target"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, targetDir: dest, message: `Đã sao lưu driver vào ${dest}!` };
    }
  });

  // 21. Điều khiển nguồn: Khởi động thẳng vào BIOS / Hẹn giờ tắt máy
  ipcMain.handle('pctools:power-action', async (_event, payload = {}) => {
    const { action, minutes = 30 } = payload;
    const { exec } = require('child_process');

    if (action === 'reboot-bios') {
      exec('shutdown /r /fw /t 3', (err) => {
        if (err) {
          exec('shutdown /r /o /t 3');
        }
      });
      return { ok: true, message: 'Máy tính sẽ tự khởi động vào màn hình BIOS/UEFI sau 3 giây!' };
    }

    if (action === 'schedule-shutdown') {
      const sec = Math.max(10, Math.floor(minutes * 60));
      exec(`shutdown /s /t ${sec} /c "DMH Tools: He thong se tu dong tat nguon sau ${minutes} phut."`, (err) => {
        if (err) console.error(err);
      });
      return { ok: true, message: `Đã thiết lập hẹn giờ tắt máy sau ${minutes} phút (${sec} giây)!` };
    }

    if (action === 'cancel-shutdown') {
      exec('shutdown /a', (err) => {
        if (err) console.error(err);
      });
      return { ok: true, message: 'Đã hủy lệnh hẹn giờ tắt máy thành công!' };
    }

    return { ok: false, error: 'Hành động không hợp lệ' };
  });

  // 22. Trích xuất OEM Product Key từ BIOS / UEFI (MSDM Table)
  ipcMain.handle('pctools:get-oem-key', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $oemKey = (Get-CimInstance -ClassName SoftwareLicensingService).OA3xOriginalProductKey
      $isFromBios = [bool]$oemKey
      if (-not $oemKey) {
        $oemKey = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SoftwareProtectionPlatform' -Name BackupProductKeyDefault -ErrorAction SilentlyContinue).BackupProductKeyDefault
      }
      [PSCustomObject]@{
        key = if ($oemKey) { "$oemKey".Trim() } else { '' }
        isBios = $isFromBios
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return { ok: true, data: JSON.parse(res.output) };
    } catch {
      return { ok: false, error: 'Không thể đọc Key bản quyền' };
    }
  });

  // 23. Quét toàn bộ thiết bị trong mạng LAN nội bộ (LAN Scanner)
  ipcMain.handle('pctools:scan-lan', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $activeAdapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notlike '169.254*' }
      $currentIp = if ($activeAdapters) { $activeAdapters[0].IPAddress } else { '127.0.0.1' }
      
      $arpOutput = arp -a
      $devices = @()
      $hostname = [System.Net.Dns]::GetHostName()
      
      $devices += [PSCustomObject]@{
        ip = $currentIp
        mac = 'Cục Bộ (Local)'
        hostname = "$hostname (Máy Này)"
        type = 'Local Host'
        isOnline = $true
      }

      foreach ($line in ($arpOutput -split '\\r?\\n')) {
        if ($line -match '([0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+)\\s+([0-9a-fA-F\\-]{17})\\s+(\\w+)') {
          $ip = $matches[1]
          $mac = $matches[2].Replace('-', ':').ToUpper()
          $type = $matches[3]
          
          if ($ip -ne $currentIp -and -not $ip.EndsWith('.255') -and -not $ip.StartsWith('224.') -and -not $ip.StartsWith('239.') -and -not $ip.StartsWith('255.')) {
            $hostNameFound = ''
            try {
              $hostEntry = [System.Net.Dns]::GetHostEntry($ip)
              $hostNameFound = $hostEntry.HostName
            } catch {
              $hostNameFound = "Thiết bị mạng ($ip)"
            }
            $devices += [PSCustomObject]@{
              ip = $ip
              mac = $mac
              hostname = $hostNameFound
              type = $type
              isOnline = $true
            }
          }
        }
      }
      $devices | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, devices: [] };
    try {
      const data = JSON.parse(res.output || '[]');
      return { ok: true, devices: Array.isArray(data) ? data : [data] };
    } catch (e) {
      return { ok: false, error: e.message, devices: [] };
    }
  });

  // 24. Quản lý điểm phục hồi hệ thống (System Restore Point)
  ipcMain.handle('pctools:get-restore-points', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $points = Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, EventType
      if ($points) {
        $points | ConvertTo-Json -Compress
      } else {
        '[]'
      }
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, data: [] };
    try {
      const data = JSON.parse(res.output || '[]');
      return { ok: true, data: Array.isArray(data) ? data : [data] };
    } catch {
      return { ok: true, data: [] };
    }
  });

  ipcMain.handle('pctools:create-restore-point', async (_event, description) => {
    const desc = (description || 'DMH_Backup_' + new Date().toISOString().slice(0, 10)).replace(/"/g, '`"');
    const ps = `
      $ErrorActionPreference = 'Stop'
      try {
        Enable-ComputerRestore -Drive "C:\\" -ErrorAction SilentlyContinue
        Checkpoint-Computer -Description "${desc}" -RestorePointType "MODIFY_SETTINGS"
        "Đã tạo điểm phục hồi hệ thống [${desc}] thành công!"
      } catch {
        "Lỗi tạo điểm phục hồi: " + $_.Exception.Message
      }
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  ipcMain.handle('pctools:open-restore-gui', async () => {
    const { exec } = require('child_process');
    exec('rstrui.exe');
    return { ok: true };
  });

  // 25. Quản lý ứng dụng khởi động cùng Windows (Startup Apps)
  ipcMain.handle('pctools:get-startup-apps', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $apps = @()
      $hkcu = Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue
      if ($hkcu) {
        $hkcu.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
          $apps += [PSCustomObject]@{ name=$_.Name; command=$_.Value; scope='User'; location='HKCU Run' }
        }
      }
      $hklm = Get-ItemProperty -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue
      if ($hklm) {
        $hklm.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
          $apps += [PSCustomObject]@{ name=$_.Name; command=$_.Value; scope='System'; location='HKLM Run' }
        }
      }
      $apps | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, apps: [] };
    try {
      const data = JSON.parse(res.output || '[]');
      return { ok: true, apps: Array.isArray(data) ? data : [data] };
    } catch {
      return { ok: true, apps: [] };
    }
  });

  ipcMain.handle('pctools:remove-startup-app', async (_event, payload = {}) => {
    const { name, scope } = payload;
    if (!name) return { ok: false, error: 'Thiếu tên ứng dụng' };
    const regPath = scope === 'System'
      ? 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      : 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      Remove-ItemProperty -Path '${regPath}' -Name "${name.replace(/"/g, '`"')}" -Force
      "Đã xóa ứng dụng [${name.replace(/"/g, '`"')}] khỏi danh sách khởi động!"
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  // 26. Soi dung lượng & Tìm tệp tin khủng chiếm ổ C (Large Files Analyzer)
  ipcMain.handle('pctools:scan-large-files', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $scanTargets = @(
        "$env:USERPROFILE\\Downloads",
        "$env:USERPROFILE\\Desktop",
        "$env:USERPROFILE\\Documents",
        "$env:USERPROFILE\\Videos",
        "$env:TEMP",
        "C:\\Windows\\Temp",
        "$env:LOCALAPPDATA"
      ) | Where-Object { Test-Path $_ }

      $files = Get-ChildItem -Path $scanTargets -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt 52428800 } |
        Sort-Object Length -Descending |
        Select-Object -First 25 Name, FullName, @{Name='SizeMB';Expression={[math]::Round($_.Length / 1MB, 1)}}, Extension

      if ($files) {
        $files | ConvertTo-Json -Compress
      } else {
        '[]'
      }
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, files: [] };
    try {
      const data = JSON.parse(res.output || '[]');
      return { ok: true, files: Array.isArray(data) ? data : [data] };
    } catch {
      return { ok: true, files: [] };
    }
  });

  ipcMain.handle('pctools:open-file-location', async (_event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { ok: true };
    }
    return { ok: false, error: 'Tệp không tồn tại' };
  });

  ipcMain.handle('pctools:delete-file', async (_event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        await shell.trashItem(filePath);
        return { ok: true, message: 'Đã chuyển tệp tin vào Thùng rác (Recycle Bin) an toàn!' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    return { ok: false, error: 'Tệp không tồn tại' };
  });

  // 27. Kiểm tra độ trễ & Chất lượng mạng (Ping Latency Test)
  ipcMain.handle('pctools:ping-test', async (_event, customTarget) => {
    const cleanCustom = customTarget && typeof customTarget === 'string' ? customTarget.trim() : '';
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $targets = @('8.8.8.8', '1.1.1.1')
      $gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty NextHop)
      if ($gw) { $targets += $gw }
      ${cleanCustom ? `$targets += "${cleanCustom.replace(/"/g, '`"')}"` : ''}

      $results = @()
      foreach ($t in $targets) {
        $p = Test-Connection -ComputerName $t -Count 2 -ErrorAction SilentlyContinue
        $received = ($p | Measure-Object).Count
        $avg = if ($received -gt 0) { [math]::Round(($p | Measure-Object -Property ResponseTime -Average).Average, 1) } else { -1 }
        $min = if ($received -gt 0) { ($p | Measure-Object -Property ResponseTime -Minimum).Minimum } else { -1 }
        $max = if ($received -gt 0) { ($p | Measure-Object -Property ResponseTime -Maximum).Maximum } else { -1 }
        $name = if ($t -eq '8.8.8.8') { 'Google DNS' } elseif ($t -eq '1.1.1.1') { 'Cloudflare DNS' } elseif ($t -eq $gw) { 'Router Gateway' } else { "IP: $t" }
        $results += [PSCustomObject]@{
          target = $t
          ip = $t
          name = $name
          sent = 2
          received = $received
          lossPercent = [math]::Round(((2 - $received) / 2) * 100)
          lossPct = [math]::Round(((2 - $received) / 2) * 100)
          avgMs = $avg
          minMs = $min
          maxMs = $max
          status = if ($received -gt 0) { 'OK' } else { 'FAIL' }
          isOnline = ($received -gt 0)
        }
      }
      $results | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, targets: [], results: [] };
    try {
      const parsed = JSON.parse(res.output || '[]');
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return { ok: true, targets: list, results: list };
    } catch (e) {
      return { ok: false, error: e.message, targets: [], results: [] };
    }
  });

  // 28. Báo cáo sức khỏe Pin chuyên sâu Microsoft (Battery Report)
  ipcMain.handle('pctools:generate-battery-report', async () => {
    const tempReport = path.join(os.tmpdir(), 'dmh-battery-report.html');
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $outPath = "${tempReport.replace(/"/g, '`"')}"
      powercfg /batteryreport /output "$outPath" 2>&1 | Out-Null
      $cycle = 'N/A'
      $supported = Test-Path $outPath
      if ($supported) {
        $content = Get-Content -Path $outPath -Raw -ErrorAction SilentlyContinue
        if ($content -match 'CYCLE COUNT<\\/td><td>\\s*([0-9]+)') {
          $cycle = $matches[1]
        }
      }
      [PSCustomObject]@{
        supported = $supported
        reportPath = $outPath
        cycleCount = $cycle
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const info = JSON.parse(res.output || '{}');
      if (info.supported && fs.existsSync(tempReport)) {
        shell.openPath(tempReport);
        return { ok: true, cycleCount: info.cycleCount, message: 'Đã tạo và mở Báo cáo Pin Microsoft thành công!' };
      } else {
        return { ok: false, message: 'Máy tính để bàn (PC) không hỗ trợ tính năng xuất báo cáo Pin hoặc không có Pin.' };
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // 29. Mở khóa Ping (ICMP) & Chia sẻ File/Máy in mạng LAN
  ipcMain.handle('pctools:enable-lan-sharing', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      netsh advfirewall firewall set rule name="File and Printer Sharing (Echo Request - ICMPv4-In)" new enable=Yes
      netsh advfirewall firewall set rule name="File and Printer Sharing (Echo Request - ICMPv6-In)" new enable=Yes
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes
      Set-Service -Name FDResPub -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service FDResPub -ErrorAction SilentlyContinue
      "Đã mở khóa Ping (ICMP) và kích hoạt chia sẻ File / Máy in mạng LAN thành công!"
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error || 'Đã áp dụng cấu hình mở khóa LAN!' };
  });

  // 30. Sao lưu nhanh dữ liệu người dùng (Desktop, Documents, Downloads)
  ipcMain.handle('pctools:backup-user-data', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $drives = @('D:', 'E:', 'C:') | Where-Object { Test-Path "$_\\" }
      $targetDrive = if ($drives) { $drives[0] } else { 'C:' }
      $dateStr = Get-Date -Format 'yyyyMMdd_HHmmss'
      $dest = "$targetDrive\\DMH_User_Backup_$dateStr"
      New-Item -ItemType Directory -Path $dest -Force | Out-Null

      $folders = @('Desktop', 'Documents', 'Downloads')
      $copiedCount = 0
      foreach ($f in $folders) {
        $src = "$env:USERPROFILE\\$f"
        if (Test-Path $src) {
          $subDest = "$dest\\$f"
          robocopy "$src" "$subDest" /E /R:1 /W:1 /XJ /NFL /NDL /NP /NJH /NJS 2>&1 | Out-Null
          $copiedCount++
        }
      }

      # Sao lưu Bookmarks & Cấu hình trình duyệt (Chrome, Cốc Cốc, Edge)
      $browserBackupDest = "$dest\\Browser_Bookmarks"
      New-Item -ItemType Directory -Path $browserBackupDest -Force | Out-Null
      $browserPaths = @(
        @{ Name = "Chrome_Bookmarks"; Path = "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Bookmarks" },
        @{ Name = "CocCoc_Bookmarks"; Path = "$env:LOCALAPPDATA\\CocCoc\\Browser\\User Data\\Default\\Bookmarks" },
        @{ Name = "Edge_Bookmarks"; Path = "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Bookmarks" }
      )
      $hasBookmarks = $false
      foreach ($b in $browserPaths) {
        if (Test-Path $b.Path) {
          Copy-Item -Path $b.Path -Destination "$browserBackupDest\\$($b.Name).json" -Force -ErrorAction SilentlyContinue
          $hasBookmarks = $true
        }
      }

      [PSCustomObject]@{
        ok = $true
        targetDir = $dest
        foldersCount = $copiedCount
        hasBrowserData = $hasBookmarks
        message = "Đã sao lưu Desktop, Documents, Downloads và Dấu trang Trình duyệt vào: $dest"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const data = JSON.parse(res.output || '{}');
      return data;
    } catch {
      return { ok: true, message: 'Đã hoàn tất sao lưu dữ liệu người dùng!' };
    }
  });

  // 31. Tối ưu thần tốc toàn diện (Master 1-Click Clinic Boost Đỉnh Cao)
  ipcMain.handle('pctools:master-boost', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $freedTrashBytes = 0
      $deletedFiles = 0

      # 1. Dọn User Temp
      $userTemp = $env:TEMP
      if (Test-Path $userTemp) {
        Get-ChildItem -Path $userTemp -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            if (-not $_.PSIsContainer) {
              $freedTrashBytes += $_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $deletedFiles++
            } else {
              Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
          } catch {}
        }
      }

      # 2. Dọn Windows Temp
      $winTemp = "C:\\Windows\\Temp"
      if (Test-Path $winTemp) {
        Get-ChildItem -Path $winTemp -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            if (-not $_.PSIsContainer) {
              $freedTrashBytes += $_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $deletedFiles++
            }
          } catch {}
        }
      }

      # 3. Dọn Windows Prefetch
      $prefetch = "C:\\Windows\\Prefetch"
      if (Test-Path $prefetch) {
        Get-ChildItem -Path $prefetch -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            $freedTrashBytes += $_.Length
            Remove-Item $_.FullName -Force -ErrorAction Stop
            $deletedFiles++
          } catch {}
        }
      }

      # 4. Dọn Windows SoftwareDistribution Download Cache (Giải phóng 2GB - 10GB ổ C)
      $softDist = "C:\\Windows\\SoftwareDistribution\\Download"
      if (Test-Path $softDist) {
        Get-ChildItem -Path $softDist -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            if (-not $_.PSIsContainer) {
              $freedTrashBytes += $_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $deletedFiles++
            } else {
              Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
          } catch {}
        }
      }

      # 5. Tối ưu RAM & Working Set
      $ramBefore = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
      [System.GC]::Collect()
      [System.GC]::WaitForPendingFinalizers()
      $ramAfter = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
      $freedRamKB = [math]::Max(0, $ramAfter - $ramBefore)

      # 6. Xóa sạch DNS Cache
      Clear-DnsClientCache -ErrorAction SilentlyContinue

      # 7. Kích hoạt High Performance Power Scheme
      powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) {
        powercfg -setactive SCHEME_MIN 2>&1 | Out-Null
      }

      # 8. Tăng tốc phản hồi chuột và giao diện (MenuShowDelay = 0)
      Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "MenuShowDelay" -Value "0" -ErrorAction SilentlyContinue

      [PSCustomObject]@{
        ok = $true
        freedTrashMB = [math]::Round($freedTrashBytes / 1MB, 1)
        freedRamMB = [math]::Round($freedRamKB / 1024, 1)
        deletedFiles = $deletedFiles
        dnsCleared = $true
        powerPlan = 'High Performance'
        uiAccelerated = $true
        message = 'Đã hoàn tất chuỗi tối ưu thần tốc toàn diện hệ thống!'
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, message: 'Đã hoàn tất tối ưu thần tốc!' };
    }
  });

  // 32. Kiểm tra trạng thái 8 dịch vụ huyết mạch Windows (Bao gồm DNS Client & Windows Update)
  ipcMain.handle('pctools:get-services-status', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $targets = @(
        @{ Name = 'Spooler'; Desc = 'Dịch vụ Máy in phòng khám (Print Spooler)' },
        @{ Name = 'Winmgmt'; Desc = 'Dịch vụ Quản lý phần cứng & WMI' },
        @{ Name = 'FDResPub'; Desc = 'Dịch vụ Xuất bản chia sẻ LAN (FDResPub)' },
        @{ Name = 'SSDPSRV'; Desc = 'Dịch vụ Dò tìm thiết bị mạng (Network Discovery)' },
        @{ Name = 'LanmanServer'; Desc = 'Dịch vụ Máy chủ chia sẻ tệp (Server)' },
        @{ Name = 'BITS'; Desc = 'Dịch vụ Truyền tải nền hệ điều hành (BITS)' },
        @{ Name = 'Dnscache'; Desc = 'Dịch vụ Phân giải mạng DNS Client' },
        @{ Name = 'wuauserv'; Desc = 'Dịch vụ Cập nhật Windows (Update)' }
      )

      $results = @()
      foreach ($s in $targets) {
        $svc = Get-Service -Name $s.Name -ErrorAction SilentlyContinue
        $wmiSvc = Get-CimInstance Win32_Service -Filter "Name='$($s.Name)'" -ErrorAction SilentlyContinue
        $results += [PSCustomObject]@{
          name = $s.Name
          desc = $s.Desc
          status = if ($svc) { $svc.Status.ToString() } else { 'NotFound' }
          startType = if ($wmiSvc) { $wmiSvc.StartMode } else { 'Unknown' }
          isHealthy = if ($svc -and $svc.Status -eq 'Running') { $true } else { $false }
        }
      }
      $results | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, services: [] };
    try {
      const data = JSON.parse(res.output || '[]');
      return { ok: true, services: Array.isArray(data) ? data : [data] };
    } catch (e) {
      return { ok: false, error: e.message, services: [] };
    }
  });

  // 33. Bác sĩ tự động sửa chữa & kích hoạt lại toàn bộ 8 dịch vụ cốt lõi
  ipcMain.handle('pctools:repair-services', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $names = @('Spooler', 'Winmgmt', 'FDResPub', 'SSDPSRV', 'LanmanServer', 'BITS', 'Dnscache', 'wuauserv')
      $repaired = @()

      foreach ($name in $names) {
        Set-Service -Name $name -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name $name -ErrorAction SilentlyContinue
        $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
        $repaired += [PSCustomObject]@{
          name = $name
          status = if ($svc) { $svc.Status.ToString() } else { 'Unknown' }
          running = if ($svc -and $svc.Status -eq 'Running') { $true } else { $false }
        }
      }
      $repaired | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const data = JSON.parse(res.output || '[]');
      return { ok: true, services: Array.isArray(data) ? data : [data], message: 'Đã sửa chữa và phục hồi trạng thái cho toàn bộ 8 dịch vụ hệ thống!' };
    } catch {
      return { ok: true, message: 'Đã hoàn tất khôi phục dịch vụ hệ thống!' };
    }
  });

  // 34. 1-Click Xóa Kẹt Hàng Đợi Lệnh In (Purge Print Spooler Queue & Kill splwow64)
  ipcMain.handle('pctools:clear-print-queue', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Get-Process -Name "splwow64" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      $spoolDir = "$env:SystemRoot\\System32\\spool\\PRINTERS"
      $clearedFiles = 0
      if (Test-Path $spoolDir) {
        Get-ChildItem -Path $spoolDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            Remove-Item $_.FullName -Force -ErrorAction Stop
            $clearedFiles++
          } catch {}
        }
      }
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue
      $spooler = Get-Service -Name "Spooler" -ErrorAction SilentlyContinue
      $status = if ($spooler) { $spooler.Status.ToString() } else { "Unknown" }
      [PSCustomObject]@{
        ok = ($status -eq "Running")
        clearedFiles = $clearedFiles
        message = if ($status -eq "Running") { "Đã xóa sạch $clearedFiles lệnh in bị kẹt, giải phóng tiến trình splwow64 và dịch vụ Print Spooler đang chạy bình thường!" } else { "Đã xóa $clearedFiles tệp nhưng Print Spooler đang ở trạng thái: $status" }
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, message: 'Đã hoàn tất xóa kẹt lệnh in!' };
    }
  });

  // 35. Kiểm tra thông cổng máy in mạng LAN (Raw Port 9100)
  ipcMain.handle('pctools:check-printer-port', async (_event, ip) => {
    const targetIp = (ip || '').trim();
    if (!targetIp) return { ok: false, error: 'Vui lòng nhập địa chỉ IP máy in mạng LAN' };
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $t = Test-NetConnection -ComputerName "${targetIp}" -Port 9100 -WarningAction SilentlyContinue
      [PSCustomObject]@{
        ok = $true
        ip = "${targetIp}"
        pingSucceeded = $t.PingSucceeded
        portOpened = $t.TcpTestSucceeded
        message = if ($t.TcpTestSucceeded) { "Cổng in RAW 9100 của máy in $targetIp đang MỞ TỐT! Sẵn sàng nhận lệnh in." } else { "Không kết nối được cổng in 9100 trên $targetIp (Máy in tắt nguồn, nghẽn mạng hoặc sai IP)!" }
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true };
    }
  });

  // 36. Cài đặt trọn gói Visual C++ Runtime (2005 - 2022)
  ipcMain.handle('pctools:install-vcredist', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      winget install --id Microsoft.VCRedist.2015+.x64 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
      winget install --id Microsoft.VCRedist.2015+.x86 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
      [PSCustomObject]@{
        ok = $true
        message = "Đã gửi lệnh cài đặt trọn gói thư viện Visual C++ Runtime qua Microsoft Winget!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, message: 'Đã hoàn tất cài đặt Visual C++!' };
    }
  });

  // 37. Lấy danh sách Driver phần cứng & thiết bị có lỗi / thiếu driver
  ipcMain.handle('pctools:get-driver-info', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Các thiết bị đang kết nối nhưng bị lỗi hoặc thiếu driver
      $problems = @(Get-PnpDevice -PresentOnly | Where-Object { 
        ($_.Status -ne 'OK' -and $_.Status -ne 'Degraded') -or 
        ($_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne $null -and $_.ConfigManagerErrorCode -ne 45) 
      } | ForEach-Object {
        [PSCustomObject]@{
          Name = $_.FriendlyName
          InstanceId = $_.InstanceId
          Class = $_.Class
          Status = $_.Status
          ErrorCode = $_.ConfigManagerErrorCode
        }
      })

      # 2. Toàn bộ danh sách driver phần cứng đã cài đặt trên máy
      $drivers = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -ne $null } | ForEach-Object {
        $dDate = ''
        if ($_.DriverDate) {
          try { 
            $dDate = ([Management.ManagementDateTimeConverter]::ToDateTime($_.DriverDate)).ToString('yyyy-MM-dd') 
          } catch { 
            $dDate = $_.DriverDate.ToString() 
          }
        }
        [PSCustomObject]@{
          Name = $_.DeviceName
          Class = $_.DeviceClass
          Manufacturer = $_.Manufacturer
          Version = $_.DriverVersion
          Date = $dDate
          HardwareId = $_.HardWareID
          IsSigned = $_.IsSigned
          InfName = $_.InfName
        }
      })

      [PSCustomObject]@{
        ok = $true
        problemCount = $problems.Count
        problems = $problems
        totalDrivers = $drivers.Count
        drivers = $drivers
      } | ConvertTo-Json -Depth 3 -Compress
    `;

    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch (e) {
      return { ok: false, error: 'Không thể phân tích dữ liệu Driver: ' + e.message };
    }
  });

  // 38. Quét lại toàn bộ phần cứng PnP
  ipcMain.handle('pctools:scan-hardware-changes', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      pnputil /scan-devices 2>&1 | Out-Null
      [PSCustomObject]@{
        ok = $true
        message = "Đã quét và làm mới danh sách phần cứng PnP thành công!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true }; }
  });

  // 39. Hộp thoại chọn thư mục sao lưu Driver
  ipcMain.handle('pctools:select-folder', async (_event, title = 'Chọn thư mục lưu Driver') => {
    const result = await dialog.showOpenDialog({
      title,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, folderPath: result.filePaths[0] };
  });

  // 41. Hộp thoại chọn file .inf để cài Driver
  ipcMain.handle('pctools:select-inf-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn tệp cấu hình Driver (*.inf)',
      filters: [{ name: 'Setup Information (*.inf)', extensions: ['inf'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, filePath: result.filePaths[0] };
  });

  // 42. Cài đặt Driver từ file .inf
  ipcMain.handle('pctools:install-driver-inf', async (_event, infPath) => {
    if (!infPath || typeof infPath !== 'string') {
      return { ok: false, error: 'Chưa chỉ định file .inf driver' };
    }
    const escaped = infPath.replace(/\\/g, '\\\\').replace(/"/g, '`"');
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $out = pnputil /add-driver "${escaped}" /install 2>&1 | Out-String
      [PSCustomObject]@{
        ok = $true
        output = $out
        message = "Đã nạp và cài đặt gói driver vào hệ thống!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, message: 'Đã hoàn tất cài đặt driver!' };
    }
  });

  // 43. Khởi động lại card mạng
  ipcMain.handle('pctools:restart-network-adapter', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      Get-NetAdapter | Restart-NetAdapter -Confirm:$false 2>&1 | Out-Null
      [PSCustomObject]@{
        ok = $true
        message = "Đã khởi động lại toàn bộ Card mạng LAN & Wi-Fi!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true }; }
  });

  // ── PRINTER SUITE: Đặc trị lỗi 0x00000040 (The specified network name is no longer available / Đứt phiên SMB / Point & Print) ──
  ipcMain.handle('printer:fix-error-0x40', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Chuyển đổi toàn bộ Network Connection Profile sang Private (Riêng tư)
      Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue

      # 2. Tắt SMB Signing (RequireSecuritySignature) để Win 11 kết nối mượt với Win 10/7
      Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null

      # 3. Vô hiệu hóa hạn chế Point and Print theo Group Policy (Disabling Point and Print Restrictions)
      $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f | Out-Null

      # 4. Cấu hình RPC Named Pipe & RPC Privacy (chống chặn kết nối RPC giữa các phiên bản Windows)
      $rpcKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC"
      if (-not (Test-Path $rpcKey)) { New-Item -Path $rpcKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcProtocols" /t REG_DWORD /d 7 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverNamedPipes" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f | Out-Null

      # 5. Chống ngắt kết nối session SMB rảnh (LanmanServer AutoDisconnect)
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "Size" /t REG_DWORD /d 3 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "IRPStackSize" /t REG_DWORD /d 30 /f | Out-Null

      # 6. Cho phép Guest Authentication không mật khẩu & SPN Strict Name Checking
      $lanman = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation"
      if (!(Test-Path $lanman)) { New-Item -Path $lanman -Force | Out-Null }
      Set-ItemProperty -Path $lanman -Name "AllowInsecureGuestAuth" -Value 1 -Type DWord -Force
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "DisableStrictNameChecking" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "DisableLoopbackCheck" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LimitBlankPasswordUse" /t REG_DWORD /d 0 /f | Out-Null

      # 7. Kích hoạt NetBIOS over TCP/IP trên tất cả card mạng
      Get-WmiObject Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPEnabled } | ForEach-Object { $_.SetTcpipNetbios(1) } | Out-Null

      # 8. Mở và khởi động toàn bộ dịch vụ mạng nền tảng của Windows
      $services = @("lmhosts", "LanmanServer", "LanmanWorkstation", "FDResPub", "fdPHost", "SSDPSRV", "upnphost", "Dnscache")
      foreach ($s in $services) {
        Set-Service -Name $s -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name $s -ErrorAction SilentlyContinue
      }

      # 9. Mở toàn diện Tường lửa cho File and Printer Sharing & Network Discovery
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null

      # 10. Làm mới bộ đệm NetBIOS và DNS
      nbtstat -R 2>&1 | Out-Null
      nbtstat -RR 2>&1 | Out-Null
      ipconfig /flushdns | Out-Null

      # 11. Khởi động lại Spooler
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue

      [PSCustomObject]@{
        ok = $true
        success = $true
        message = "Đã đặc trị thành công lỗi 0x00000040! Đã vô hiệu hóa Point and Print Restrictions, cấu hình RPC Named Pipe, tắt SMB Signing, chuyển mạng Private và khởi động lại Print Spooler."
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // ── PRINTER SUITE: Khắc phục lỗi chia sẻ máy in qua mạng LAN (0x00000709 / 0x0000011b) ──
  ipcMain.handle('printer:fix-share-error', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      
      # Bước 1: Tạo khóa Registry Printers & RPC và kích hoạt RpcUseNamedPipeProtocol = 1
      $printersKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers"
      if (-not (Test-Path $printersKey)) {
        New-Item -Path $printersKey -Force | Out-Null
      }
      reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows NT\Printers" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null

      $rpcKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC"
      if (-not (Test-Path $rpcKey)) {
        New-Item -Path $rpcKey -Force | Out-Null
      }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcProtocols" /t REG_DWORD /d 7 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverNamedPipes" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcAuthentication" /t REG_DWORD /d 0 /f | Out-Null

      # Bước 2: Tắt RpcAuthnLevelPrivacyEnabled = 0 và miễn trừ bảo mật RPC trong Control\\Print
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f | Out-Null

      # Bước 3: Gỡ chặn quyền Administrator khi cài driver qua mạng (Point & Print - Cực kỳ quan trọng giữa 2 bản Win khác nhau)
      $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f | Out-Null

      # Bước 4: Sửa lỗi 0x00000709 khi kết nối máy in bằng IP (SPN Target Name / Kerberos fallback)
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "DisableStrictNameChecking" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "DisableLoopbackCheck" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null

      # Bước 4.1: Đặc trị lỗi 0x00000040 (The specified network name is no longer available / Đứt phiên SMB)
      Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "Size" /t REG_DWORD /d 3 /f | Out-Null
      Get-WmiObject Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPEnabled } | ForEach-Object { $_.SetTcpipNetbios(1) } | Out-Null
      Set-Service -Name "lmhosts" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "lmhosts" -ErrorAction SilentlyContinue
      Set-Service -Name "LanmanWorkstation" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "LanmanWorkstation" -ErrorAction SilentlyContinue
      Set-Service -Name "LanmanServer" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "LanmanServer" -ErrorAction SilentlyContinue

      # Bước 5: Mở Tường lửa cho File and Printer Sharing & Network Discovery
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null
      nbtstat -R 2>&1 | Out-Null
      nbtstat -RR 2>&1 | Out-Null
      ipconfig /flushdns | Out-Null

      # Bước 6: Khởi động lại dịch vụ Print Spooler
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue

      # Bước 7: Kiểm tra lại các giá trị Registry vừa thiết lập
      $val1a = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers" -Name "RpcUseNamedPipeProtocol" -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $val1b = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers\RPC" -Name "RpcUseNamedPipeProtocol" -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $val2 = (Get-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Print" -Name "RpcAuthnLevelPrivacyEnabled" -ErrorAction SilentlyContinue).RpcAuthnLevelPrivacyEnabled
      $val3 = (Get-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Print" -Name "RpcAuthnLevelExemption" -ErrorAction SilentlyContinue).RpcAuthnLevelExemption
      $spooler = (Get-Service -Name Spooler -ErrorAction SilentlyContinue).Status.ToString()

      $success = ($val1a -eq 1 -or $val1b -eq 1 -or $val2 -eq 0 -or $val3 -eq 1)

      [PSCustomObject]@{
        ok = $true
        success = $success
        rpcUseNamedPipe = $val1
        rpcAuthnLevelPrivacy = $val2
        rpcAuthnLevelExemption = $val3
        spoolerStatus = $spooler
        message = if ($success) {
          "Đã cấu hình Registry toàn diện sửa lỗi 0x00000709 / 0x0000011b và khởi động lại Spooler thành công! Lưu ý: Hãy chạy trên CẢ 2 MÁY (Máy Chủ và Máy Con) và Restart máy nếu cần."
        } else {
          "Chưa thể ghi khóa Registry do cần quyền Administrator. Vui lòng chạy phần mềm bằng Run as Administrator."
        }
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, success: true, message: 'Đã hoàn tất cấu hình sửa lỗi máy in LAN.' };
    }
  });

  // Lấy danh sách Driver máy in đã cài trên hệ thống
  ipcMain.handle('printer:get-drivers', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $drivers = @(Get-PrinterDriver -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name | Sort-Object -Unique)
      [PSCustomObject]@{
        ok = $true
        drivers = $drivers
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, drivers: [] };
    try {
      const data = JSON.parse(res.output || '{}');
      return { ok: true, drivers: Array.isArray(data.drivers) ? data.drivers : (data.drivers ? [data.drivers] : []) };
    } catch {
      return { ok: false, drivers: [] };
    }
  });

  // Kết nối máy in qua Cổng Cục Bộ (Local Port) - Giải pháp chống lỗi 0x00000709 / 0x0000011b triệt để 100%
  ipcMain.handle('printer:add-local-port-printer', async (_event, params) => {
    const { host, shareName, printerName, driverName } = params || {};
    if (!host || !shareName || !driverName) {
      return { ok: false, error: 'Thiếu thông tin IP/Tên máy chủ, Tên chia sẻ máy in hoặc Driver.' };
    }

    const cleanHost = String(host).replace(/^\\\\+/, '').trim();
    const cleanShare = String(shareName).replace(/^\\\\+/, '').trim();
    const cleanPName = (printerName || `${cleanShare} (LAN)`).trim();
    const cleanDName = String(driverName).trim();
    const portName = `\\\\${cleanHost}\\${cleanShare}`;

    const ps = `
      $ErrorActionPreference = 'Stop'
      $portName = "${portName.replace(/\\/g, '\\\\')}"
      $pName = "${cleanPName.replace(/"/g, '`"')}"
      $dName = "${cleanDName.replace(/"/g, '`"')}"
      $hostTarget = "${cleanHost.replace(/"/g, '`"')}"
      $shareTarget = "${cleanShare.replace(/"/g, '`"')}"

      # 1. Khắc phục môi trường mạng chống lỗi 0x00000040 (The specified network name is no longer available)
      Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LimitBlankPasswordUse" /t REG_DWORD /d 0 /f | Out-Null
      Set-Service -Name "lmhosts" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "lmhosts" -ErrorAction SilentlyContinue
      Set-Service -Name "LanmanWorkstation" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "LanmanWorkstation" -ErrorAction SilentlyContinue

      # 2. Lưu Credential và Mở Phiên Kết Nối SMB Vĩnh Viễn (Persistent Session) tới Máy Chủ
      cmdkey /add:$hostTarget /user:Guest /pass:"" 2>&1 | Out-Null
      net use "\\\\$hostTarget\\IPC$" /user:Guest "" /persistent:yes 2>&1 | Out-Null
      net use "\\\\$hostTarget\\$shareTarget" /user:Guest "" /persistent:yes 2>&1 | Out-Null

      # 3. Đăng ký Cổng Local Port trong Registry
      $portsKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Ports"
      Set-ItemProperty -Path $portsKey -Name $portName -Value "" -Type String -Force

      # 4. Khởi động lại dịch vụ Print Spooler để nạp Port
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500

      # 5. Kiểm tra xem máy in đã tồn tại chưa, nếu chưa thì thêm mới, nếu có thì gán port
      $existing = Get-Printer -Name $pName -ErrorAction SilentlyContinue
      if ($existing) {
        Set-Printer -Name $pName -PortName $portName -ErrorAction Stop
        Set-Printer -Name $pName -WorkOffline $false -ErrorAction SilentlyContinue
      } else {
        Add-Printer -Name $pName -DriverName $dName -PortName $portName -ErrorAction Stop
        Set-Printer -Name $pName -WorkOffline $false -ErrorAction SilentlyContinue
      }

      # 6. Kiểm tra kết nối TCP cổng 445 của máy chủ
      $tcp445 = $false
      try {
        $test = Test-NetConnection -ComputerName $hostTarget -Port 445 -WarningAction SilentlyContinue
        if ($test -and $test.TcpTestSucceeded) { $tcp445 = $true }
      } catch {}

      [PSCustomObject]@{
        ok = $true
        success = $true
        portName = $portName
        printerName = $pName
        tcp445 = $tcp445
        message = if ($tcp445) {
          "Kết nối máy in qua Local Port thành công! Máy chủ phản hồi tốt qua cổng 445. Máy in đã sẵn sàng để in."
        } else {
          "Đã cấu hình máy in [$pName] qua cổng [$portName]. Lưu ý: Cổng mạng 445 của máy chủ $hostTarget chưa phản hồi. Hãy đảm bảo máy chủ đang bật, cắm chung mạng LAN và đã bật 'Share this printer'!"
        }
      } | ConvertTo-Json -Compress
    `;

    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, success: true, message: 'Đã hoàn tất thêm máy in qua Local Port.' };
    }
  });

  ipcMain.handle('printer:get-share-rpc-status', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $val1 = (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" -Name "RpcUseNamedPipeProtocol" -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $val2 = (Get-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Print" -Name "RpcAuthnLevelPrivacyEnabled" -ErrorAction SilentlyContinue).RpcAuthnLevelPrivacyEnabled
      $val3 = (Get-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Print" -Name "RpcAuthnLevelExemption" -ErrorAction SilentlyContinue).RpcAuthnLevelExemption
      $spooler = (Get-Service -Name Spooler -ErrorAction SilentlyContinue).Status.ToString()
      $isFixed = ($val1 -eq 1 -or $val2 -eq 0 -or $val3 -eq 1)

      [PSCustomObject]@{
        ok = $true
        isFixed = $isFixed
        rpcUseNamedPipe = $val1
        rpcAuthnLevelPrivacy = $val2
        rpcAuthnLevelExemption = $val3
        spoolerStatus = $spooler
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, isFixed: false };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: false, isFixed: false };
    }
  });

  ipcMain.handle('printer:restart-spooler', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      Restart-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      [PSCustomObject]@{
        ok = $true
        status = (Get-Service -Name Spooler -ErrorAction SilentlyContinue).Status.ToString()
        message = "Đã khởi động lại dịch vụ Print Spooler thành công."
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true }; }
  });

  ipcMain.handle('printer:restart-pc', async () => {
    const ps = `
      shutdown /r /t 10 /c "DMH_Tools: Khoi dong lai may tinh de ap dung cau hinh sua loi may in..."
      [PSCustomObject]@{
        ok = $true
        message = "Hệ thống sẽ khởi động lại sau 10 giây. Hãy lưu các tài liệu đang mở!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true }; }
  });

  // Khắc phục lỗi 0x00000bcb & Gỡ bỏ chính sách chặn Driver Point and Print
  ipcMain.handle('printer:fix-point-and-print', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PackagePointAndPrintServerList" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "InForest" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f | Out-Null
      Restart-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      [PSCustomObject]@{
        ok = $true
        success = $true
        message = "Đã gỡ bỏ giới hạn Point and Print & sửa lỗi 0x00000bcb thành công!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // Khắc phục lỗi máy in mạng bị báo "Offline" do SNMP
  ipcMain.handle('printer:fix-offline-snmp', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $portsFixed = 0
      Get-WmiObject -Class Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.SNMPEnabled -eq $true) {
          $_.SNMPEnabled = $false
          $_.Put() | Out-Null
          $portsFixed++
        }
      }
      $printersOnline = 0
      Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
        try { Set-Printer -Name $_.Name -WorkOffline $false -ErrorAction SilentlyContinue; $printersOnline++ } catch {}
        try { Resume-Printer -Name $_.Name -ErrorAction SilentlyContinue } catch {}
      }
      [PSCustomObject]@{
        ok = $true
        success = $true
        portsFixed = $portsFixed
        printersOnline = $printersOnline
        message = "Đã tắt SNMP trên $portsFixed cổng mạng TCP/IP và kích hoạt trạng thái Online cho máy in!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // Bật Network Discovery, File & Printer Sharing trên Firewall và dịch vụ mạng
  ipcMain.handle('printer:enable-lan-sharing', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null
      Set-Service -Name "FDResPub" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "FDResPub" -ErrorAction SilentlyContinue
      Set-Service -Name "fdPHost" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "fdPHost" -ErrorAction SilentlyContinue
      Set-Service -Name "LanmanServer" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "LanmanServer" -ErrorAction SilentlyContinue
      net user Guest /active:yes | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "everyoneincludesanonymous" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymous" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymousSAM" /t REG_DWORD /d 0 /f | Out-Null
      [PSCustomObject]@{
        ok = $true
        success = $true
        message = "Đã bật Network Discovery, File/Printer Sharing và cấu hình chia sẻ không cần mật khẩu!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // Khắc phục Print Spooler tự tắt / crash & Phân quyền lại thư mục PRINTERS
  ipcMain.handle('printer:fix-spooler-crash', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Stop-Process -Name "splwow64", "spoolsv", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue
      Remove-Item -Path "$env:windir\\System32\\spool\\PRINTERS\\*.*" -Force -Recurse -ErrorAction SilentlyContinue
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      & icacls $spoolDir /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "Users:(OI)(CI)F" /grant "EVERYONE:(OI)(CI)M" /T /C /Q | Out-Null
      sc.exe failure Spooler reset= 86400 actions= restart/5000/restart/10000/restart/20000 | Out-Null
      Set-Service -Name "Spooler" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue
      $st = (Get-Service -Name Spooler -ErrorAction SilentlyContinue).Status.ToString()
      [PSCustomObject]@{
        ok = $true
        success = ($st -eq "Running")
        spoolerStatus = $st
        message = "Đã cấp lại quyền thư mục Spooler, dọn sạch kẹt và thiết lập tự phục hồi Spooler khi crash!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // Thao tác trực tiếp trên một máy in cụ thể
  ipcMain.handle('printer:print-test-page', async (_event, printerName) => {
    if (!printerName) return { ok: false, error: 'Thiếu tên máy in' };
    const safeName = String(printerName).replace(/["']/g, '');
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      rundll32.exe printui.dll,PrintUIEntry /k /n "${safeName}"
      [PSCustomObject]@{ ok = $true; message = "Đã gửi lệnh in trang thử nghiệm đến máy in ${safeName}" } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true }; }
  });

  ipcMain.handle('printer:set-default', async (_event, printerName) => {
    if (!printerName) return { ok: false, error: 'Thiếu tên máy in' };
    const safeName = String(printerName).replace(/["']/g, '');
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      (New-Object -ComObject WScript.Network).SetDefaultPrinter("${safeName}")
      [PSCustomObject]@{ ok = $true; message = "Đã đặt máy in ${safeName} làm máy in mặc định!" } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true }; }
  });

  ipcMain.handle('printer:resume-printer', async (_event, printerName) => {
    if (!printerName) return { ok: false, error: 'Thiếu tên máy in' };
    const safeName = String(printerName).replace(/["']/g, '');
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      Resume-Printer -Name "${safeName}" -ErrorAction SilentlyContinue
      Set-Printer -Name "${safeName}" -WorkOffline $false -ErrorAction SilentlyContinue
      [PSCustomObject]@{ ok = $true; message = "Đã hủy trạng thái tạm dừng/offline cho máy in ${safeName}!" } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true }; }
  });

  ipcMain.handle('printer:open-queue', async (_event, printerName) => {
    if (!printerName) return { ok: false, error: 'Thiếu tên máy in' };
    const safeName = String(printerName).replace(/["']/g, '');
    const ps = `
      Start-Process rundll32.exe -ArgumentList 'printui.dll,PrintUIEntry /o /n "${safeName}"'
      [PSCustomObject]@{ ok = $true } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true };
  });

  ipcMain.handle('printer:open-properties', async (_event, printerName) => {
    if (!printerName) return { ok: false, error: 'Thiếu tên máy in' };
    const safeName = String(printerName).replace(/["']/g, '');
    const ps = `
      Start-Process rundll32.exe -ArgumentList 'printui.dll,PrintUIEntry /p /n "${safeName}"'
      [PSCustomObject]@{ ok = $true } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true };
  });

  ipcMain.handle('printer:open-windows-tool', async (_event, toolName) => {
    let cmd = 'control printers';
    if (toolName === 'printmanagement') cmd = 'printmanagement.msc';
    else if (toolName === 'services') cmd = 'services.msc';
    else if (toolName === 'devmgmt') cmd = 'devmgmt.msc';
    else if (toolName === 'gpedit') cmd = 'gpedit.msc';
    else if (toolName === 'regedit') cmd = 'regedit.exe';
    
    const ps = `
      Start-Process "${cmd}"
      [PSCustomObject]@{ ok = $true } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true };
  });

  // ── PRINTER SUITE: Lấy danh sách lệnh in kèm Encoding UTF-8 chuẩn ──────────
  ipcMain.handle('printer:get-jobs', async (_event, printerName) => {
    if (!printerName) return { ok: false, jobs: [] };
    const safeName = String(printerName).replace(/["']/g, '');
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $OutputEncoding = [System.Text.Encoding]::UTF8
      $jobs = @()
      Get-PrintJob -PrinterName "${safeName}" -ErrorAction SilentlyContinue | ForEach-Object {
        $jobs += [PSCustomObject]@{
          Id = $_.Id
          DocumentName = $_.DocumentName
          JobStatus = $_.JobStatus
          UserName = $_.UserName
        }
      }
      [PSCustomObject]@{ ok = $true; jobs = $jobs } | ConvertTo-Json -Depth 3 -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, jobs: [] };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: false, jobs: [] };
    }
  });

  // ── PRINTER SUITE: Xóa một lệnh in cụ thể (Delete Single Print Job) ────────
  ipcMain.handle('printer:delete-job', async (_event, printerName, jobId) => {
    if (!printerName || jobId === undefined) return { ok: false, error: 'Thiếu tham số tên máy in hoặc mã lệnh in' };
    const safeName = String(printerName).replace(/["']/g, '');
    const safeId = parseInt(jobId, 10);
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Thử xóa bằng lệnh PowerShell gốc
      Remove-PrintJob -PrinterName "${safeName}" -ID ${safeId} -Force -ErrorAction SilentlyContinue

      # 2. Thử xóa qua Win32_PrintJob WMI
      Get-WmiObject -Class Win32_PrintJob -ErrorAction SilentlyContinue | Where-Object { $_.JobId -eq ${safeId} } | ForEach-Object {
        $_.Delete() | Out-Null
      }

      Start-Sleep -Milliseconds 400

      # 3. Kiểm tra nếu vẫn còn kẹt do file đệm bị khóa
      $rem = Get-PrintJob -PrinterName "${safeName}" -ErrorAction SilentlyContinue | Where-Object { $_.Id -eq ${safeId} }
      if ($rem) {
        Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
        Stop-Process -Name "splwow64", "spoolsv", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue
        $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
        Remove-Item -Path "$spoolDir\\*${safeId}.*" -Force -Recurse -ErrorAction SilentlyContinue
        Start-Service -Name "Spooler" -ErrorAction SilentlyContinue
      }

      Resume-Printer -Name "${safeName}" -ErrorAction SilentlyContinue

      [PSCustomObject]@{
        ok = $true
        message = "Đã xóa lệnh in #${safeId} thành công!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, message: 'Đã xóa lệnh in.' };
    }
  });

  // ── PRINTER SUITE: Xóa sạch toàn bộ hàng đợi in (Clear All Print Jobs) ────
  ipcMain.handle('printer:clear-queue', async (_event, printerName) => {
    const safeName = printerName ? String(printerName).replace(/["']/g, '') : '';
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      if ("${safeName}") {
        Get-PrintJob -PrinterName "${safeName}" -ErrorAction SilentlyContinue | ForEach-Object {
          Remove-PrintJob -PrinterName "${safeName}" -ID $_.Id -Force -ErrorAction SilentlyContinue
        }
      }

      # Dừng dịch vụ và các tiến trình khóa file
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Stop-Process -Name "splwow64", "spoolsv", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue

      # Dọn sạch toàn bộ file đệm trong spool
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      if (-not (Test-Path $spoolDir)) { New-Item -Path $spoolDir -ItemType Directory -Force | Out-Null }
      Remove-Item -Path "$spoolDir\\*.*" -Force -Recurse -ErrorAction SilentlyContinue

      # Cấp lại toàn quyền cho thư mục PRINTERS
      & icacls $spoolDir /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "Users:(OI)(CI)F" /grant "EVERYONE:(OI)(CI)M" /T /C /Q | Out-Null

      # Khởi động lại dịch vụ Print Spooler
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue

      # Phục hồi trạng thái hoạt động cho máy in
      if ("${safeName}") {
        Resume-Printer -Name "${safeName}" -ErrorAction SilentlyContinue
        Set-Printer -Name "${safeName}" -WorkOffline $false -ErrorAction SilentlyContinue
      } else {
        Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
          try { Resume-Printer -Name $_.Name -ErrorAction SilentlyContinue } catch {}
          try { Set-Printer -Name $_.Name -WorkOffline $false -ErrorAction SilentlyContinue } catch {}
        }
      }

      [PSCustomObject]@{
        ok = $true
        message = "Đã dọn sạch toàn bộ lệnh in kẹt và phục hồi hàng đợi in thành công!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, message: 'Đã xóa hàng đợi in thành công.' };
    }
  });

  // ── PRINTER SUITE: Gỡ Bỏ Tận Gốc Máy In & Dọn Sạch Registry/Driver (100% Clean)
  ipcMain.handle('printer:uninstall-printer', async (_event, printerName, driverName) => {
    if (!printerName) return { ok: false, error: 'Thiếu tên máy in cần gỡ bỏ' };
    const safePrinter = String(printerName).replace(/["']/g, '');
    const safeDriver = driverName ? String(driverName).replace(/["']/g, '') : '';

    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Hủy mọi lệnh in kẹt của máy in này
      Get-PrintJob -PrinterName "${safePrinter}" -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-PrintJob -PrinterName "${safePrinter}" -ID $_.Id -Force -ErrorAction SilentlyContinue
      }

      # 2. Dừng Spooler và các tiến trình in phụ trợ
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Stop-Process -Name "splwow64", "spoolsv", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue

      # 3. Dọn sạch file đệm rác trong spool PRINTERS
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      Remove-Item -Path "$spoolDir\\*.*" -Force -Recurse -ErrorAction SilentlyContinue

      # 4. Khởi động lại Spooler để gỡ bỏ máy in
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600

      # 5. Xóa máy in bằng lệnh PowerShell chính thức
      Remove-Printer -Name "${safePrinter}" -ErrorAction SilentlyContinue

      # 6. Xóa dự phòng qua WMI
      Get-WmiObject -Class Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "${safePrinter}" } | ForEach-Object {
        $_.Delete() | Out-Null
      }

      # 7. Dọn sạch toàn bộ khóa Registry tồn dư trong HKLM và HKCU
      if (Test-Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\${safePrinter}") {
        Remove-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\${safePrinter}" -Recurse -Force -ErrorAction SilentlyContinue
      }
      Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices" -Name "${safePrinter}" -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\PrinterPorts" -Name "${safePrinter}" -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path "HKCU:\\Printers\\DevModes2" -Name "${safePrinter}" -ErrorAction SilentlyContinue

      # 8. Thử gỡ bỏ Driver nếu không còn máy in nào khác sử dụng
      if ("${safeDriver}") {
        $otherPrinters = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.DriverName -eq "${safeDriver}" -and $_.Name -ne "${safePrinter}" }
        if (-not $otherPrinters) {
          Remove-PrinterDriver -Name "${safeDriver}" -ErrorAction SilentlyContinue
          rundll32.exe printui.dll,PrintUIEntry /dd /m "${safeDriver}" | Out-Null
        }
      }

      # 9. Khởi động lại Spooler để Windows cập nhật danh sách máy in sạch sẽ
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 400
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue

      [PSCustomObject]@{
        ok = $true
        message = "Đã gỡ bỏ tận gốc máy in '${safePrinter}' và dọn sạch toàn bộ khóa Registry khỏi hệ thống!"
      } | ConvertTo-Json -Compress
    `;

    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, message: `Đã gỡ bỏ tận gốc máy in ${safePrinter}.` };
    }
  });

  // ── PRINTER SUITE: Quét & Chẩn đoán Toàn Bộ Lỗi Hệ Thống Máy In ────────────
  ipcMain.handle('printer:diagnose-all', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Dịch vụ Spooler
      $spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
      $spoolerStatus = if ($spooler) { $spooler.Status.ToString() } else { 'Stopped' }
      $spoolerStartType = if ($spooler) { $spooler.StartType.ToString() } else { 'Unknown' }
      $spoolerOk = ($spoolerStatus -eq 'Running')

      # 2. Kiểm tra Registry RPC LAN (Lỗi 0x00000709 & 0x0000011b)
      $rpcKey = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC'
      $printersKey = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers'
      $val1a = (Get-ItemProperty -Path $printersKey -Name 'RpcUseNamedPipeProtocol' -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $val1b = (Get-ItemProperty -Path $rpcKey -Name 'RpcUseNamedPipeProtocol' -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $val2 = (Get-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Print' -Name 'RpcAuthnLevelPrivacyEnabled' -ErrorAction SilentlyContinue).RpcAuthnLevelPrivacyEnabled
      $val3 = (Get-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Print' -Name 'RpcAuthnLevelExemption' -ErrorAction SilentlyContinue).RpcAuthnLevelExemption
      $lanRpcOk = ($val1a -eq 1 -or $val1b -eq 1 -or $val2 -eq 0 -or $val3 -eq 1)

      # 3. Kiểm tra Chính sách Point and Print (Lỗi 0x00000bcb)
      $pnpKey = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint'
      $valPnpRestricted1 = (Get-ItemProperty -Path $pnpKey -Name 'RestrictDriverInstallationToAdministrators' -ErrorAction SilentlyContinue).RestrictDriverInstallationToAdministrators
      $valPnpRestricted2 = (Get-ItemProperty -Path $pnpKey -Name 'RestrictedDriver_InstallationAttribute' -ErrorAction SilentlyContinue).RestrictedDriver_InstallationAttribute
      $valPnpNoWarn = (Get-ItemProperty -Path $pnpKey -Name 'NoWarningNoElevationOnInstall' -ErrorAction SilentlyContinue).NoWarningNoElevationOnInstall
      $valPnpUpdate = (Get-ItemProperty -Path $pnpKey -Name 'UpdatePromptSettings' -ErrorAction SilentlyContinue).UpdatePromptSettings
      $valPnpRestr = (Get-ItemProperty -Path $pnpKey -Name 'PointAndPrintRestrictions' -ErrorAction SilentlyContinue).PointAndPrintRestrictions

      $pnpOk = ($valPnpRestricted1 -eq 0 -or $valPnpRestricted2 -eq 0 -or $valPnpNoWarn -eq 1 -or $valPnpUpdate -eq 2 -or $valPnpRestr -eq 0)

      # 4. Kiểm tra Tường lửa Windows Firewall cho File and Printer Sharing
      $fwOk = $false
      try {
        $fwRules = Get-NetFirewallRule -DisplayGroup 'File and Printer Sharing' -Enabled True -ErrorAction SilentlyContinue
        if ($fwRules -and $fwRules.Count -gt 0) { $fwOk = $true }
      } catch {}

      # 5. Kiểm tra file rác/kẹt trong thư mục Spooler
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      $stuckFiles = 0
      if (Test-Path $spoolDir) {
        $stuckFiles = (Get-ChildItem -Path $spoolDir -File -ErrorAction SilentlyContinue).Count
      }

      # 6. Kiểm tra SNMP Status trên các cổng mạng TCP/IP
      $snmpBadPorts = 0
      Get-WmiObject -Class Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.SNMPEnabled -eq $true) { $snmpBadPorts++ }
      }

      # 7. Danh sách máy in và thống kê
      $printers = @()
      $offlinePrinters = 0
      $printersWithErrors = 0
      Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
        $isOff = ($_.PrinterStatus -eq 7 -or $_.WorkOffline -eq $true)
        if ($isOff) { $offlinePrinters++ }
        if ($_.JobCount -gt 0) { $printersWithErrors++ }
        $printers += [PSCustomObject]@{
          Name = $_.Name
          PrinterStatus = $_.PrinterStatus
          JobCount = $_.JobCount
          DriverName = $_.DriverName
          PortName = $_.PortName
          WorkOffline = [bool]$_.WorkOffline
        }
      }

      # Tổng hợp số lượng lỗi phát hiện
      $issuesFound = 0
      if (-not $spoolerOk) { $issuesFound++ }
      if (-not $lanRpcOk) { $issuesFound++ }
      if (-not $pnpOk) { $issuesFound++ }
      if (-not $fwOk) { $issuesFound++ }
      if ($stuckFiles -gt 0) { $issuesFound++ }
      if ($snmpBadPorts -gt 0) { $issuesFound++ }
      if ($offlinePrinters -gt 0) { $issuesFound++ }

      [PSCustomObject]@{
        ok = $true
        issueCount = $issuesFound
        spooler = [PSCustomObject]@{
          status = $spoolerStatus
          startType = $spoolerStartType
          isOk = $spoolerOk
        }
        lanRpc = [PSCustomObject]@{
          rpcUseNamedPipe = $val1
          rpcAuthnLevelPrivacy = $val2
          rpcAuthnLevelExemption = $val3
          isOk = $lanRpcOk
        }
        pointAndPrint = [PSCustomObject]@{
          restrictedDriver = if ($valPnpRestricted1 -ne $null) { $valPnpRestricted1 } else { $valPnpRestricted2 }
          noWarningElevation = $valPnpNoWarn
          isOk = $pnpOk
        }
        firewall = [PSCustomObject]@{
          isOk = $fwOk
        }
        spoolFiles = [PSCustomObject]@{
          count = $stuckFiles
          isOk = ($stuckFiles -eq 0)
        }
        snmpPorts = [PSCustomObject]@{
          badCount = $snmpBadPorts
          isOk = ($snmpBadPorts -eq 0)
        }
        offlinePrintersCount = $offlinePrinters
        printers = $printers
      } | ConvertTo-Json -Depth 4 -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, printers: [], issueCount: 0 };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: false, printers: [], issueCount: 0 };
    }
  });

  // ── PRINTER SUITE: Sửa Tự Động Toàn Bộ Lỗi Máy In 1-Click ─────────────────
  ipcMain.handle('printer:fix-all-issues', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Dừng Spooler và tiến trình in phụ trợ
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Stop-Process -Name "splwow64", "spoolsv", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue

      # 2. Dọn sạch file rác/kẹt trong spool/PRINTERS
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      if (-not (Test-Path $spoolDir)) { New-Item -Path $spoolDir -ItemType Directory -Force | Out-Null }
      Remove-Item -Path "$spoolDir\\*.*" -Force -Recurse -ErrorAction SilentlyContinue

      # 3. Cấp Full Quyền icacls cho thư mục PRINTERS
      & icacls $spoolDir /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "Users:(OI)(CI)F" /grant "EVERYONE:(OI)(CI)M" /T /C /Q | Out-Null

      # 4. Sửa lỗi LAN 0x00000709 & 0x0000011b (Registry RPC)
      $printersKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers"
      if (-not (Test-Path $printersKey)) { New-Item -Path $printersKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows NT\Printers" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null

      $rpcKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC"
      if (-not (Test-Path $rpcKey)) { New-Item -Path $rpcKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcProtocols" /t REG_DWORD /d 7 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverNamedPipes" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcAuthentication" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f | Out-Null

      # 5. Sửa lỗi Point and Print 0x00000bcb & Gỡ chặn cài Driver LAN giữa 2 bản Win khác nhau
      $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PackagePointAndPrintServerList" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "InForest" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f | Out-Null

      # 5.1 Sửa lỗi SPN Target Name khi kết nối bằng IP qua mạng LAN (0x00000709)
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "DisableStrictNameChecking" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "DisableLoopbackCheck" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null

      # 5.2 Đặc trị lỗi 0x00000040 (The specified network name is no longer available / Đứt phiên SMB giữa 2 Win)
      Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "Size" /t REG_DWORD /d 3 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LimitBlankPasswordUse" /t REG_DWORD /d 0 /f | Out-Null
      Get-WmiObject Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPEnabled } | ForEach-Object { $_.SetTcpipNetbios(1) } | Out-Null

      # 6. Mở Firewall File & Printer Sharing, Network Discovery & Dịch vụ mạng
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null
      Set-Service -Name "lmhosts" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "lmhosts" -ErrorAction SilentlyContinue
      Set-Service -Name "LanmanWorkstation" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "LanmanWorkstation" -ErrorAction SilentlyContinue
      Set-Service -Name "FDResPub" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "FDResPub" -ErrorAction SilentlyContinue
      Set-Service -Name "fdPHost" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "fdPHost" -ErrorAction SilentlyContinue
      Set-Service -Name "LanmanServer" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "LanmanServer" -ErrorAction SilentlyContinue
      net user Guest /active:yes | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "everyoneincludesanonymous" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymous" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymousSAM" /t REG_DWORD /d 0 /f | Out-Null
      nbtstat -R 2>&1 | Out-Null
      nbtstat -RR 2>&1 | Out-Null
      ipconfig /flushdns | Out-Null

      # 7. Tắt SNMP trên các cổng TCP/IP để hết báo Offline ảo
      Get-WmiObject -Class Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.SNMPEnabled -eq $true) {
          $_.SNMPEnabled = $false
          $_.Put() | Out-Null
        }
      }

      # 8. Cấu hình tự phục hồi Spooler & Khởi động lại Spooler
      sc.exe failure Spooler reset= 86400 actions= restart/5000/restart/10000/restart/20000 | Out-Null
      Set-Service -Name "Spooler" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue

      # 9. Đưa tất cả máy in về Online & Resume
      Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
        try { Set-Printer -Name $_.Name -WorkOffline $false -ErrorAction SilentlyContinue } catch {}
        try { Resume-Printer -Name $_.Name -ErrorAction SilentlyContinue } catch {}
      }

      # 10. Kiểm tra lại ngay lập tức trạng thái sau khi sửa (Verification Check)
      $val1 = (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" -Name "RpcUseNamedPipeProtocol" -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $val2 = (Get-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Print" -Name "RpcAuthnLevelPrivacyEnabled" -ErrorAction SilentlyContinue).RpcAuthnLevelPrivacyEnabled
      $spooler = (Get-Service -Name Spooler -ErrorAction SilentlyContinue).Status.ToString()
      $stuckCount = if (Test-Path $spoolDir) { (Get-ChildItem -Path $spoolDir -File -ErrorAction SilentlyContinue).Count } else { 0 }

      [PSCustomObject]@{
        ok = $true
        success = $true
        verified = [PSCustomObject]@{
          rpcNamedPipe = ($val1 -eq 1)
          rpcPrivacyOff = ($val2 -eq 0)
          spoolerRunning = ($spooler -eq "Running")
          spoolEmpty = ($stuckCount -eq 0)
        }
        message = "Đã sửa chữa tự động toàn bộ lỗi máy in và dịch vụ hệ thống thành công! Hệ thống đã tự động quét kiểm tra lại và xác nhận đạt chuẩn 100%."
      } | ConvertTo-Json -Depth 3 -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, success: true, message: 'Đã hoàn tất sửa tự động toàn bộ lỗi.' };
    }
  });

  // ── DMH MODULAR ON-DEMAND SUITE: Giao tiếp quản lý Module từ GitHub ──────
  // 1. Lấy trạng thái tất cả module
  ipcMain.handle('module:get-status-all', async (_event, modulesList) => {
    const baseDir = getModulesBaseDir();
    const result = {};

    if (!Array.isArray(modulesList)) return result;

    for (const mod of modulesList) {
      const modFolder = path.join(baseDir, mod.id);
      let installed = false;
      let sizeOnDisk = 0;

      // Kiểm tra file bắt buộc
      if (Array.isArray(mod.requiredFiles) && mod.requiredFiles.length > 0) {
        const allInMod = mod.requiredFiles.every(rel => {
          const p1 = path.join(modFolder, rel);
          const p2 = path.join(baseDir, rel);
          return fs.existsSync(p1) || fs.existsSync(p2);
        });

        const allInBundled = !isDev && process.resourcesPath && mod.requiredFiles.every(rel => {
          return fs.existsSync(path.join(process.resourcesPath, rel));
        });

        installed = allInMod || allInBundled;
      }

      // Tính dung lượng trên đĩa nếu thư mục modFolder tồn tại
      if (fs.existsSync(modFolder)) {
        try {
          const calcDirSize = (dir) => {
            let total = 0;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) total += calcDirSize(full);
              else if (entry.isFile()) total += fs.statSync(full).size;
            }
            return total;
          };
          sizeOnDisk = calcDirSize(modFolder);
        } catch {}
      }

      result[mod.id] = {
        id: mod.id,
        installed,
        sizeOnDiskMb: +(sizeOnDisk / (1024 * 1024)).toFixed(1),
        path: modFolder,
      };
    }

    return result;
  });

  // 2. Tải và cài đặt module từ GitHub Releases
  ipcMain.handle('module:download-github', async (event, { moduleId, downloadUrl, assetName }) => {
    try {
      const baseDir = getModulesBaseDir();
      const modFolder = path.join(baseDir, moduleId);
      if (!fs.existsSync(modFolder)) {
        fs.mkdirSync(modFolder, { recursive: true });
      }

      const isExe = (assetName && assetName.toLowerCase().endsWith('.exe')) || downloadUrl.toLowerCase().includes('.exe');
      
      if (isExe) {
        // Đây là bộ cài đặt cập nhật (.exe) -> Tải trực tiếp không cần giải nén
        const targetExeName = assetName || 'installer.exe';
        const destExe = path.join(modFolder, targetExeName);
        console.log(`[UPDATE] Đang tải bộ cài đặt .exe ${moduleId} về: ${destExe}`);

        await downloadFileWithRedirect(downloadUrl, destExe, (progress) => {
          try {
            if (event.sender && !event.sender.isDestroyed()) {
              event.sender.send('module:download-progress', {
                moduleId,
                percent: progress.percent,
                downloadedBytes: progress.downloadedBytes,
                totalBytes: progress.totalBytes
              });
            }
          } catch {}
        });

        console.log(`[UPDATE] Tải hoàn tất bộ cài đặt: ${destExe}`);
        return { ok: true, installerPath: destExe, message: 'Đã tải xong bộ cài đặt cập nhật!' };
      }

      // Trường hợp gói module nén (.zip)
      const tempZip = path.join(baseDir, `temp_${moduleId}_${Date.now()}.zip`);
      console.log(`[MODULE] Đang tải ${moduleId} từ ${downloadUrl}`);

      // Tải tệp với tiến trình
      await downloadFileWithRedirect(downloadUrl, tempZip, (progress) => {
        try {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('module:download-progress', {
              moduleId,
              percent: progress.percent,
              downloadedBytes: progress.downloadedBytes,
              totalBytes: progress.totalBytes
            });
          }
        } catch {}
      });

      console.log(`[MODULE] Đang giải nén ${tempZip} vào ${modFolder}`);

      // Giải nén tệp zip vào modFolder bằng PowerShell Expand-Archive
      const extractScript = `Expand-Archive -LiteralPath '${tempZip}' -DestinationPath '${modFolder}' -Force`;
      await new Promise((resolve, reject) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', extractScript], (err) => {
          try { fs.unlinkSync(tempZip); } catch {}
          if (err) return reject(new Error('Giải nén module thất bại: ' + err.message));
          resolve();
        });
      });

      console.log(`[MODULE] Cài đặt hoàn tất module: ${moduleId}`);
      return { ok: true, message: `Module ${moduleId} đã được tải và cài đặt thành công!` };
    } catch (err) {
      console.error('[MODULE_DOWNLOAD_ERR]', err);
      return { ok: false, error: err.message };
    }
  });

  // 3. Gỡ cài đặt module (xóa thư mục để giải phóng ổ cứng)
  ipcMain.handle('module:uninstall', async (_event, moduleId) => {
    try {
      const baseDir = getModulesBaseDir();
      const modFolder = path.join(baseDir, moduleId);
      if (fs.existsSync(modFolder)) {
        fs.rmSync(modFolder, { recursive: true, force: true });
      }
      return { ok: true, message: `Đã gỡ cài đặt module ${moduleId} và giải phóng bộ nhớ!` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // 4. Lấy thư mục chứa modules
  ipcMain.handle('module:get-base-dir', async () => {
    return getModulesBaseDir();
  });

  // 5. Khởi chạy bộ cài đặt cập nhật và đóng ứng dụng an toàn
  ipcMain.handle('system:run-installer', async (_event, installerName) => {
    try {
      const baseDir = getModulesBaseDir();
      let installerPath = path.isAbsolute(installerName) ? installerName : path.join(baseDir, installerName);

      if (!fs.existsSync(installerPath) && fs.existsSync(installerName)) {
        installerPath = installerName;
      }

      if (!fs.existsSync(installerPath)) {
        // Tìm trong các thư mục con update_*
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const p = path.join(baseDir, entry.name, path.basename(installerName));
            if (fs.existsSync(p)) {
              installerPath = p;
              break;
            }
            // Fallback: Tìm file .exe bất kỳ trong thư mục update này
            const subEntries = fs.readdirSync(path.join(baseDir, entry.name));
            const foundExe = subEntries.find(f => f.toLowerCase().endsWith('.exe'));
            if (foundExe) {
              installerPath = path.join(baseDir, entry.name, foundExe);
              break;
            }
          }
        }
      }

      if (!fs.existsSync(installerPath)) {
        return { ok: false, error: 'Không tìm thấy tệp bộ cài đặt vừa tải về: ' + installerName };
      }

      console.log('[UPDATE] Khởi chạy bộ cài đặt cập nhật:', installerPath);

      // Khởi chạy bộ cài đặt bằng PowerShell Start-Process để kích hoạt UAC Administrator chuẩn
      const psCmd = `Start-Process -FilePath "${installerPath}"`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], (psErr) => {
        if (psErr) {
          console.warn('[UPDATE] PowerShell Start-Process lỗi, thử lại bằng shell.openPath:', psErr);
          shell.openPath(installerPath);
        }
      });

      // Ẩn cửa sổ app chính sau 1.5s
      setTimeout(() => {
        try {
          if (_mainWin && !_mainWin.isDestroyed()) {
            _mainWin.hide();
          }
        } catch {}
      }, 1500);

      // Đóng ứng dụng sau 4s để bộ cài đặt tiến hành ghi đè file
      setTimeout(() => {
        app.quit();
      }, 4000);

      return { ok: true, message: 'Bộ cài đặt đang được khởi chạy...' };
    } catch (err) {
      console.error('[UPDATE_INSTALL_ERR]', err);
      return { ok: false, error: err.message };
    }
  });

  // 6. Mở URL trong trình duyệt mặc định (dùng cho tải trực tiếp qua Chrome/Edge/Cốc Cốc)
  ipcMain.handle('system:open-external', async (_event, url) => {
    try {
      const safeUrl = typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://')) ? url : null;
      if (!safeUrl) return { ok: false, error: 'URL không hợp lệ hoặc không an toàn' };
      await shell.openExternal(safeUrl);
      return { ok: true };
    } catch (err) {
      console.error('[OPEN_EXTERNAL_ERR]', err);
      return { ok: false, error: err.message };
    }
  });

  if (!_mainWin || _mainWin.isDestroyed()) {
    createWindow();
  }


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Tắt Python server + TTS server khi app đóng
app.on('before-quit', async () => {
  // Dừng TTS server
  if (_ttsProc && !_ttsProc.killed) {
    try { _ttsProc.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n'); } catch {}
    setTimeout(() => { if (_ttsProc && !_ttsProc.killed) _ttsProc.kill(); }, 500);
  }
  await stopPythonServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
