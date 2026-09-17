const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { logAudit } = require('../security/auditLogger.cjs');

const isDev = app ? !app.isPackaged : true;

// DMH Session Token bảo vệ cổng Python IPC chống Malware local
const DMH_SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

// Port cấu hình cho các dịch vụ Python
const ENDOSCOPY_PORT = 27182;
const XML3176_PORT   = 27183;
const COMPARE_PORT   = 27185;

let _pythonProc    = null;
let _serverStatus  = 'stopped';

let _xml3176Proc   = null;
let _xml3176Status = 'stopped';

let _compareProc   = null;
let _compareStatus = 'stopped';

function resolveAssetPath(relPath) {
  const dir = path.join(app.getPath('userData'), 'dmh_modules');
  const directPath = path.join(dir, relPath);
  if (fs.existsSync(directPath)) return directPath;

  try {
    const subdirs = fs.readdirSync(dir, { withFileTypes: true });
    for (const sub of subdirs) {
      if (sub.isDirectory()) {
        const subPath = path.join(dir, sub.name, relPath);
        if (fs.existsSync(subPath)) return subPath;
      }
    }
  } catch {}

  if (!isDev && process.resourcesPath) {
    const inRes = path.join(process.resourcesPath, relPath);
    if (fs.existsSync(inRes)) return inRes;
  }

  const inDev = path.join(__dirname, '../..', relPath);
  if (fs.existsSync(inDev)) return inDev;

  return directPath;
}

function getBundledPythonExe() {
  const modExe = resolveAssetPath('python_embed/python.exe');
  if (fs.existsSync(modExe)) return modExe;

  if (!isDev) {
    const resPath = path.join(process.resourcesPath, 'python_embed', 'python.exe');
    if (fs.existsSync(resPath)) return resPath;
  } else {
    const devPath = path.join(__dirname, '../../python_embed/python.exe');
    if (fs.existsSync(devPath)) return devPath;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

// ── Endoscopy Server (27182) ──────────────────────────────────────────────────
function getEndoscopyCommand() {
  const modExe = resolveAssetPath('python_core/endoscopy_server/endoscopy_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [String(ENDOSCOPY_PORT)], cwd: path.dirname(modExe) };
  }
  if (!isDev) {
    const bundledExe = path.join(process.resourcesPath, 'python_core', 'endoscopy_server', 'endoscopy_server.exe');
    if (fs.existsSync(bundledExe)) return { exe: bundledExe, args: [String(ENDOSCOPY_PORT)], cwd: path.dirname(bundledExe) };
  }
  const pyExe = process.platform === 'win32' ? 'python' : 'python3';
  const script = path.join(__dirname, '../../python_core/endoscopy_server.py');
  return { exe: pyExe, args: [script, String(ENDOSCOPY_PORT)], cwd: path.dirname(script) };
}

function startPythonServer() {
  if (_pythonProc && !_pythonProc.killed) {
    return Promise.resolve({ ok: true, status: _serverStatus });
  }

  return new Promise((resolve) => {
    _serverStatus = 'starting';
    const { exe, args, cwd } = getEndoscopyCommand();
    _pythonProc = spawn(exe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
      env: { ...process.env, DMH_SESSION_TOKEN }
    });

    let resolved = false;
    _pythonProc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && (msg.includes('khởi động') || msg.includes('IPC Server'))) {
        _serverStatus = 'running';
        resolved = true;
        logAudit('python', 'START_ENDOSCOPY_SERVER', `port:${ENDOSCOPY_PORT}`, 'SUCCESS');
        resolve({ ok: true, status: 'running', port: ENDOSCOPY_PORT });
      }
    });

    _pythonProc.on('exit', () => { _serverStatus = 'stopped'; _pythonProc = null; });
    _pythonProc.on('error', (err) => {
      _serverStatus = 'error'; _pythonProc = null;
      if (!resolved) { resolved = true; resolve({ ok: false, status: 'error', error: err.message }); }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (_serverStatus === 'starting') {
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
      if (_pythonProc && !_pythonProc.killed) _pythonProc.kill('SIGKILL');
      _serverStatus = 'stopped';
      _pythonProc = null;
      resolve({ ok: true });
    }, 2000);
  });
}

// ── XML3176 Server (27183) ────────────────────────────────────────────────────
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
  const script = path.join(__dirname, '../../python_core/xml3176_server.py');
  return { exe: pyExe, args: [script, String(XML3176_PORT)], cwd: path.dirname(script) };
}

function startXml3176Server() {
  if (_xml3176Proc && !_xml3176Proc.killed) return Promise.resolve({ ok: true, status: _xml3176Status });
  return new Promise((resolve) => {
    _xml3176Status = 'starting';
    const { exe, args, cwd } = getXml3176Command();
    _xml3176Proc = spawn(exe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
      env: { ...process.env, DMH_SESSION_TOKEN }
    });
    let resolved = false;
    _xml3176Proc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && (msg.includes('khởi động') || msg.includes('HTTP Server'))) {
        _xml3176Status = 'running';
        resolved = true;
        logAudit('python', 'START_XML3176_SERVER', `port:${XML3176_PORT}`, 'SUCCESS');
        resolve({ ok: true, status: 'running', port: XML3176_PORT });
      }
    });
    _xml3176Proc.on('exit', () => { _xml3176Status = 'stopped'; _xml3176Proc = null; });
    _xml3176Proc.on('error', (err) => {
      _xml3176Status = 'error'; _xml3176Proc = null;
      if (!resolved) { resolved = true; resolve({ ok: false, status: 'error', error: err.message }); }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (_xml3176Status === 'starting') {
          _xml3176Status = 'running';
          resolve({ ok: true, status: 'running', port: XML3176_PORT });
        }
      }
    }, 15000);
  });
}

function stopXml3176Server() {
  return new Promise((resolve) => {
    if (!_xml3176Proc || _xml3176Proc.killed) { _xml3176Status = 'stopped'; resolve({ ok: true }); return; }
    _xml3176Proc.kill('SIGTERM');
    setTimeout(() => {
      if (_xml3176Proc && !_xml3176Proc.killed) _xml3176Proc.kill('SIGKILL');
      _xml3176Status = 'stopped';
      _xml3176Proc = null;
      resolve({ ok: true });
    }, 2000);
  });
}

// ── Compare Server (27185) ────────────────────────────────────────────────────
function getCompareCommand() {
  const modExe = resolveAssetPath('python_core/compare_server/compare_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [], cwd: path.dirname(modExe) };
  }
  if (!isDev) {
    const exePath = path.join(process.resourcesPath, 'python_core', 'compare_server', 'compare_server.exe');
    return { exe: exePath, args: [], cwd: path.dirname(exePath) };
  } else {
    const pyExe = getBundledPythonExe();
    const script = path.join(__dirname, '../../python_core/compare_server.py');
    return { exe: pyExe, args: [script], cwd: path.dirname(script) };
  }
}

async function startCompareServer() {
  if (_compareProc && !_compareProc.killed) return { ok: true, status: _compareStatus, port: COMPARE_PORT };

  try {
    await new Promise(r => {
      const req = http.get(`http://127.0.0.1:${COMPARE_PORT}/quit`, () => r());
      req.on('error', () => r());
      req.setTimeout(1000, () => { req.destroy(); r(); });
    });
    await new Promise(r => setTimeout(r, 500));
  } catch (e) {}

  _compareStatus = 'starting';
  const { exe, args, cwd } = getCompareCommand();
  _compareProc = spawn(exe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd,
    env: { ...process.env, DMH_SESSION_TOKEN }
  });

  return new Promise((resolve) => {
    let resolved = false;
    _compareProc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && (msg.includes('27185') || msg.includes('compare') || msg.includes('health'))) {
        _compareStatus = 'running';
        resolved = true;
        logAudit('python', 'START_COMPARE_SERVER', `port:${COMPARE_PORT}`, 'SUCCESS');
        resolve({ ok: true, status: 'running', port: COMPARE_PORT });
      }
    });
    _compareProc.on('exit', () => { _compareStatus = 'stopped'; _compareProc = null; });
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
    try {
      const req = http.get(`http://127.0.0.1:${COMPARE_PORT}/quit`, () => {});
      req.on('error', () => {});
      req.setTimeout(1000, () => { req.destroy(); });
    } catch (e) {}
    setTimeout(() => {
      if (_compareProc && !_compareProc.killed) { _compareProc.kill('SIGKILL'); }
      _compareStatus = 'stopped'; _compareProc = null; resolve({ ok: true });
    }, 500);
  });
}

async function stopAllPythonServers() {
  await Promise.allSettled([
    stopPythonServer(),
    stopXml3176Server(),
    stopCompareServer(),
  ]);
}

/**
 * registerPythonIPC - Đăng ký toàn bộ IPC liên quan đến Python Servers
 */
function registerPythonIPC() {
  ipcMain.handle('endoscopy:start-server', async () => startPythonServer());
  ipcMain.handle('endoscopy:stop-server', async () => stopPythonServer());
  ipcMain.handle('endoscopy:server-status', async () => ({ status: _serverStatus, port: ENDOSCOPY_PORT }));

  ipcMain.handle('xml3176:start-server', async () => startXml3176Server());
  ipcMain.handle('xml3176:stop-server', async () => stopXml3176Server());
  ipcMain.handle('xml3176:server-status', async () => ({ status: _xml3176Status, port: XML3176_PORT }));

  ipcMain.handle('compare:start-server', async () => startCompareServer());
  ipcMain.handle('compare:stop-server', async () => stopCompareServer());
  ipcMain.handle('compare:server-status', async () => ({ status: _compareStatus, port: COMPARE_PORT }));

  // Hàm kiểm tra tệp hợp lệ cho phân hệ đối chiếu hồ sơ (Chống Path Traversal & DoS)
  function isAllowedCompareFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    if (!fs.existsSync(filePath)) return false;
    const ext = path.extname(filePath).toLowerCase();
    const allowed = ['.xml', '.xlsx', '.xls', '.csv', '.json'];
    if (!allowed.includes(ext)) return false;
    try {
      const stat = fs.statSync(filePath);
      return stat.size <= 200 * 1024 * 1024; // Tối đa 200MB
    } catch {
      return false;
    }
  }

  ipcMain.handle('compare:compare-files', async (_event, { portalPath, internalPath }) => {
    try {
      if (!isAllowedCompareFile(portalPath)) {
        return { ok: false, error: 'Tệp cổng giám định không hợp lệ hoặc vượt quá dung lượng 200MB' };
      }
      if (!isAllowedCompareFile(internalPath)) {
        return { ok: false, error: 'Tệp nội bộ bệnh viện không hợp lệ hoặc vượt quá dung lượng 200MB' };
      }

      await startCompareServer();
      await new Promise(r => setTimeout(r, 800));
      const portalB64 = fs.readFileSync(portalPath).toString('base64');
      const internalB64 = fs.readFileSync(internalPath).toString('base64');
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
        req.setTimeout(120000, () => {
          req.destroy(new Error('Quá thời gian đối chiếu hồ sơ (Timeout 120s)'));
        });
        req.on('error', reject);
        req.write(body); req.end();
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('compare:compare-b64', async (_event, portalB64, internalB64) => {
    try {
      if (!portalB64 || !internalB64) {
        return { ok: false, error: 'Thiếu dữ liệu tệp Base64 cần đối chiếu' };
      }
      await startCompareServer();
      await new Promise((res) => {
        let elapsed = 0;
        const check = () => {
          const req = http.get(`http://127.0.0.1:${COMPARE_PORT}/health`, (r) => {
            r.resume();
            if (r.statusCode < 500) return res(true);
            elapsed += 100;
            if (elapsed >= 6000) return res(false);
            setTimeout(check, 100);
          });
          req.on('error', () => {
            elapsed += 100;
            if (elapsed >= 6000) return res(false);
            setTimeout(check, 100);
          });
          req.setTimeout(90, () => { req.destroy(); });
        };
        check();
      });
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
        req.setTimeout(120000, () => {
          req.destroy(new Error('Quá thời gian đối chiếu hồ sơ (Timeout 120s)'));
        });
        req.on('error', reject);
        req.write(body); req.end();
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = {
  registerPythonIPC,
  startPythonServer,
  stopPythonServer,
  startXml3176Server,
  stopXml3176Server,
  startCompareServer,
  stopCompareServer,
  stopAllPythonServers,
};
