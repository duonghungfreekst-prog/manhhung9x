const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const isDev = app ? !app.isPackaged : true;

let _mainWin = null;
let _queueWin = null;
let _floatWin = null;

function getMainWin() { return _mainWin; }
function setMainWin(w) { _mainWin = w; }
function getQueueWin() { return _queueWin; }
function setQueueWin(w) { _queueWin = w; }
function getFloatWin() { return _floatWin; }
function setFloatWin(w) { _floatWin = w; }

// ── Cửa sổ ứng dụng chính (Main Window) ──────────────────────────────────────
function createMainWindow() {
  if (_mainWin && !_mainWin.isDestroyed()) {
    if (_mainWin.isMinimized()) _mainWin.restore();
    _mainWin.show();
    _mainWin.focus();
    return _mainWin;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DMH_Tools',
    icon: isDev ? path.join(__dirname, '../../public/icon.png') : path.join(__dirname, '../../dist/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload.cjs'),
    },
    backgroundColor: '#f0fdf4',
    show: false,
  });

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Làm mới thông minh',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('app:trigger-smart-refresh');
            }
          },
        },
        {
          label: 'Tải lại toàn bộ (Hard Reload)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => win.reload(),
        },
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
        { label: 'Kích cỡ gốc',   role: 'resetZoom'        },
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
    const indexPath = path.join(__dirname, '../../dist/index.html');
    try {
      const indexUrl = pathToFileURL(indexPath).href;
      console.log('[MAIN] Loading packaged URL via pathToFileURL:', indexUrl);
      win.loadURL(indexUrl).catch((err) => {
        console.warn('[MAIN] loadURL error, trying fallback loadFile:', err);
        win.loadFile(indexPath).catch(e => console.error('[MAIN] loadFile error:', e));
      });
    } catch (_e) { /* intentional: safe fallback */
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

  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      console.log('[MAIN] Fallback show window triggered');
      win.show();
    }
  }, 1500);

  _mainWin = win;

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.origin !== 'null') shell.openExternal(url);
    } catch (_e) { /* intentional: safe fallback */ }
    return { action: 'deny' };
  });

  return win;
}

// ── Cửa sổ mini nổi (Float Control Window) ──────────────────────────────────
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
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    icon: isDev ? path.join(__dirname, '../../public/icon.png') : path.join(__dirname, '../../dist/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload-float.cjs'),
    },
  });

  if (isDev) {
    _floatWin.loadFile(path.join(__dirname, '../../public/float-control.html'));
  } else {
    _floatWin.loadFile(path.join(__dirname, '../../dist/float-control.html'));
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

// ── Cửa sổ màn chờ TV (Queue Display Window) ────────────────────────────────
function openQueueDisplay(options) {
  if (_queueWin && !_queueWin.isDestroyed()) {
    _queueWin.focus();
    return { ok: true, reused: true };
  }

  const displays = screen.getAllDisplays();
  const targetDisplay = displays.length > 1 ? displays[1] : displays[0];
  const { x, y, width, height } = targetDisplay.bounds;

  _queueWin = new BrowserWindow({
    x, y,
    width, height,
    fullscreen: displays.length > 1,
    title: 'Màn Hình Chờ — ' + (options?.roomCode || 'Phòng Khám'),
    backgroundColor: '#f0fdf4',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload-queue.cjs'),
    },
    autoHideMenuBar: true,
  });

  if (isDev) {
    _queueWin.loadFile(path.join(__dirname, '../../public/queue-display.html'));
  } else {
    _queueWin.loadFile(path.join(__dirname, '../../dist/queue-display.html'));
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
}

function closeQueueDisplay() {
  if (_queueWin && !_queueWin.isDestroyed()) {
    _queueWin.close();
    _queueWin = null;
  }
  if (_mainWin && !_mainWin.isDestroyed()) {
    _mainWin.webContents.send('queue:status-changed', false);
  }
  return { ok: true };
}

function isQueueDisplayOpen() {
  return { open: !!(_queueWin && !_queueWin.isDestroyed()) };
}

function updateQueueDisplay(data) {
  if (_queueWin && !_queueWin.isDestroyed()) {
    _queueWin.webContents.send('queue-display:update', data);
    return { ok: true };
  }
  return { ok: false, reason: 'window_not_open' };
}

module.exports = {
  getMainWin,
  setMainWin,
  getQueueWin,
  setQueueWin,
  getFloatWin,
  setFloatWin,
  createMainWindow,
  createFloatWindow,
  openQueueDisplay,
  closeQueueDisplay,
  isQueueDisplayOpen,
  updateQueueDisplay,
};
