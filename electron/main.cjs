/**
 * DMH_Tools - Electron Main Entry Point (Architecture v7 Clean Bootstrap)
 * Bóc tách hoàn toàn từ God-file 7.800 dòng thành kiến trúc module hóa:
 * - electron/windows/    : Quản lý vòng đời BrowserWindow (Main, Queue Display, Mini Floating Controller)
 * - electron/ipc/        : Các kênh IPC phân quyền chuyên biệt (HIS, Biometric, CA, Endoscopy, Python, System, Printer, License)
 * - electron/services/   : Quản lý SQL Server Connection Pool, PowerShell Sandbox, TTS Engine
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

// ── Global Crash Guard: Chống văng tiến trình khi có lỗi stream hoặc unhandled promise ──
process.on('uncaughtException', (err) => {
  console.error('[CRASH_GUARD] Đã bắt uncaughtException:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH_GUARD] Đã bắt unhandledRejection:', reason);
});

// ── GPU Crash Guard & Windows Elevation Compatibility ───────────────────────
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

// ── Single Instance Lock: Ngăn chặn chạy đè nhiều bản sao ứng dụng ─────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[MAIN] Tiến trình DMH_Tools khác đang chạy, tự động thoát.');
  app.quit();
  process.exit(0);
}

// ── Import Windows & Services ────────────────────────────────────────────────
const windowManager = require('./windows/windowManager.cjs');
const { hisConnManager } = require('./services/his/hisConnectionManager.cjs');
const { speakWithPiper, stopTtsServer } = require('./services/tts/ttsService.cjs');

// ── Import Modular IPC Handlers ──────────────────────────────────────────────
const { registerSystemIPC }    = require('./ipc/system.ipc.cjs');
const { registerPrinterIPC }   = require('./ipc/printer.ipc.cjs');
const { registerHisIPC }       = require('./ipc/his.ipc.cjs');
const { registerEndoscopyIPC } = require('./ipc/endoscopy.ipc.cjs');
const { registerCaIPC }        = require('./ipc/ca.ipc.cjs');
const { registerBiometricIPC } = require('./ipc/biometric.ipc.cjs');
const { registerLicenseIPC }   = require('./ipc/license.ipc.cjs');
const { registerPythonIPC, stopAllPythonServers } = require('./ipc/python.ipc.cjs');

// ── Khi có instance thứ 2 được mở ────────────────────────────────────────────
app.on('second-instance', () => {
  const mw = windowManager.getMainWin();
  if (mw) {
    if (mw.isMinimized()) mw.restore();
    mw.show();
    mw.focus();
  }
});

// ── App Ready: Khởi động giao diện và gắn các cổng kết nối IPC ───────────────
app.whenReady().then(() => {
  console.log('[MAIN] DMH_Tools v7 Bootstrap Starting...');

  // 1. Khởi tạo cửa sổ chính
  windowManager.createMainWindow();

  // 2. Đăng ký toàn bộ các phân hệ IPC (171 handlers đã được phân cụm)
  registerSystemIPC();
  registerPrinterIPC();
  registerHisIPC(speakWithPiper);
  registerEndoscopyIPC();
  registerCaIPC();
  registerBiometricIPC();
  registerLicenseIPC();
  registerPythonIPC();

  console.log('[MAIN] All IPC Modules successfully registered.');

  // 3. Xử lý kích hoạt trên macOS (Dock click)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow();
    }
  });
});

// ── App Shutdown & Resource Cleanup ──────────────────────────────────────────
app.on('before-quit', async () => {
  console.log('[MAIN] Đang dọn dẹp tài nguyên trước khi thoát...');
  try {
    const { closeSqliteDb } = require('./database/sqliteClient.cjs');
    closeSqliteDb();
    stopTtsServer();
    await stopAllPythonServers();
    await hisConnManager.closeAll();
  } catch (err) {
    console.error('[MAIN] Lỗi khi dọn dẹp tài nguyên:', err);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
