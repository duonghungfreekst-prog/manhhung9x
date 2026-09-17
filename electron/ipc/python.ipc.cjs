const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { logAudit } = require('../security/auditLogger.cjs');

const isDev = app ? !app.isPackaged : true;

const net = require('net');

// DMH Session Token bảo vệ cổng Python IPC chống Malware local
const DMH_SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

// Hàm tìm cổng rảnh tự động (Dynamic Port Allocation)
function getAvailablePort(preferredPort) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(preferredPort || 0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => {
      const fallbackSrv = net.createServer();
      fallbackSrv.listen(0, '127.0.0.1', () => {
        const altPort = fallbackSrv.address().port;
        fallbackSrv.close(() => resolve(altPort));
      });
    });
  });
}

// Cổng được cấp phát động cho từng phiên chạy
let _endoscopyPort = null;
let _xml3176Port   = null;
let _comparePort   = null;

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

// ── Endoscopy Server (Dynamic Port) ──────────────────────────────────────────
function getEndoscopyCommand(port) {
  const targetPort = port || _endoscopyPort || 27182;
  const modExe = resolveAssetPath('python_core/endoscopy_server/endoscopy_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [String(targetPort)], cwd: path.dirname(modExe) };
  }
  if (!isDev) {
    const bundledExe = path.join(process.resourcesPath, 'python_core', 'endoscopy_server', 'endoscopy_server.exe');
    if (fs.existsSync(bundledExe)) return { exe: bundledExe, args: [String(targetPort)], cwd: path.dirname(bundledExe) };
  }
  const pyExe = process.platform === 'win32' ? 'python' : 'python3';
  const script = path.join(__dirname, '../../python_core/endoscopy_server.py');
  return { exe: pyExe, args: [script, String(targetPort)], cwd: path.dirname(script) };
}

async function startPythonServer() {
  if (_pythonProc && !_pythonProc.killed) {
    return { ok: true, status: _serverStatus, port: _endoscopyPort };
  }

  if (!_endoscopyPort) {
    _endoscopyPort = await getAvailablePort(27182);
  }

  return new Promise((resolve) => {
    _serverStatus = 'starting';
    const { exe, args, cwd } = getEndoscopyCommand(_endoscopyPort);
    _pythonProc = spawn(exe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
      env: { ...process.env, DMH_SESSION_TOKEN }
    });

    let resolved = false;
    _pythonProc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && (msg.includes('khởi động') || msg.includes('IPC Server') || msg.includes('http://'))) {
        _serverStatus = 'running';
        resolved = true;
        logAudit('python', 'START_ENDOSCOPY_SERVER', `port:${_endoscopyPort}`, 'SUCCESS');
        resolve({ ok: true, status: 'running', port: _endoscopyPort });
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
          resolve({ ok: true, status: 'running', port: _endoscopyPort });
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

// ── XML3176 Server (Dynamic Port) ────────────────────────────────────────────
function getXml3176Command(port) {
  const targetPort = port || _xml3176Port || 27183;
  const modExe = resolveAssetPath('python_core/xml3176_server/xml3176_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [String(targetPort)], cwd: path.dirname(modExe) };
  }
  if (!isDev) {
    const bundledExe = path.join(process.resourcesPath, 'python_core', 'xml3176_server', 'xml3176_server.exe');
    if (fs.existsSync(bundledExe)) return { exe: bundledExe, args: [String(targetPort)], cwd: path.dirname(bundledExe) };
  }
  const pyExe = process.platform === 'win32' ? 'python' : 'python3';
  const script = path.join(__dirname, '../../python_core/xml3176_server.py');
  return { exe: pyExe, args: [script, String(targetPort)], cwd: path.dirname(script) };
}

async function startXml3176Server() {
  if (_xml3176Proc && !_xml3176Proc.killed) return { ok: true, status: _xml3176Status, port: _xml3176Port };

  if (!_xml3176Port) {
    _xml3176Port = await getAvailablePort(27183);
  }

  return new Promise((resolve) => {
    _xml3176Status = 'starting';
    const { exe, args, cwd } = getXml3176Command(_xml3176Port);
    _xml3176Proc = spawn(exe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
      env: { ...process.env, DMH_SESSION_TOKEN }
    });
    let resolved = false;
    _xml3176Proc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && (msg.includes('khởi động') || msg.includes('HTTP Server') || msg.includes('http://'))) {
        _xml3176Status = 'running';
        resolved = true;
        logAudit('python', 'START_XML3176_SERVER', `port:${_xml3176Port}`, 'SUCCESS');
        resolve({ ok: true, status: 'running', port: _xml3176Port });
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
          resolve({ ok: true, status: 'running', port: _xml3176Port });
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

// ── Compare Server (Dynamic Port) ────────────────────────────────────────────
function getCompareCommand(port) {
  const targetPort = port || _comparePort || 27185;
  const modExe = resolveAssetPath('python_core/compare_server/compare_server.exe');
  if (fs.existsSync(modExe)) {
    return { exe: modExe, args: [String(targetPort)], cwd: path.dirname(modExe) };
  }
  if (!isDev) {
    const exePath = path.join(process.resourcesPath, 'python_core', 'compare_server', 'compare_server.exe');
    return { exe: exePath, args: [String(targetPort)], cwd: path.dirname(exePath) };
  } else {
    const pyExe = getBundledPythonExe();
    const script = path.join(__dirname, '../../python_core/compare_server.py');
    return { exe: pyExe, args: [script, String(targetPort)], cwd: path.dirname(script) };
  }
}

async function startCompareServer() {
  if (_compareProc && !_compareProc.killed) return { ok: true, status: _compareStatus, port: _comparePort };

  if (!_comparePort) {
    _comparePort = await getAvailablePort(27185);
  }

  try {
    await new Promise(r => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: _comparePort,
        path: '/quit',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${DMH_SESSION_TOKEN}` }
      }, () => r());
      req.on('error', () => r());
      req.setTimeout(1000, () => { req.destroy(); r(); });
      req.end();
    });
    await new Promise(r => setTimeout(r, 500));
  } catch (e) {}

  _compareStatus = 'starting';
  const { exe, args, cwd } = getCompareCommand(_comparePort);
  _compareProc = spawn(exe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd,
    env: { ...process.env, DMH_SESSION_TOKEN }
  });

  return new Promise((resolve) => {
    let resolved = false;
    _compareProc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && (msg.includes('Khởi động') || msg.includes('compare') || msg.includes('health') || msg.includes('http://'))) {
        _compareStatus = 'running';
        resolved = true;
        logAudit('python', 'START_COMPARE_SERVER', `port:${_comparePort}`, 'SUCCESS');
        resolve({ ok: true, status: 'running', port: _comparePort });
      }
    });
    _compareProc.on('exit', () => { _compareStatus = 'stopped'; _compareProc = null; });
    _compareProc.on('error', (err) => {
      _compareStatus = 'error'; _compareProc = null;
      if (!resolved) { resolved = true; resolve({ ok: false, error: err.message }); }
    });
    setTimeout(() => {
      if (!resolved) { resolved = true; _compareStatus = 'running'; resolve({ ok: true, status: 'running', port: _comparePort }); }
    }, 5000);
  });
}

function stopCompareServer() {
  return new Promise((resolve) => {
    if (!_compareProc || _compareProc.killed) { _compareStatus = 'stopped'; resolve({ ok: true }); return; }
    try {
      const req = http.request({
        hostname: '127.0.0.1',
        port: _comparePort || 27185,
        path: '/quit',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${DMH_SESSION_TOKEN}` }
      }, () => {});
      req.on('error', () => {});
      req.setTimeout(1000, () => { req.destroy(); });
      req.end();
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
  ipcMain.handle('endoscopy:server-status', async () => ({ status: _serverStatus, port: _endoscopyPort || 27182 }));

  ipcMain.handle('xml3176:start-server', async () => startXml3176Server());
  ipcMain.handle('xml3176:stop-server', async () => stopXml3176Server());
  ipcMain.handle('xml3176:server-status', async () => ({ status: _xml3176Status, port: _xml3176Port || 27183 }));

  ipcMain.handle('compare:start-server', async () => startCompareServer());
  ipcMain.handle('compare:stop-server', async () => stopCompareServer());
  ipcMain.handle('compare:server-status', async () => ({ status: _compareStatus, port: _comparePort || 27185 }));

  // Hàm kiểm tra tệp hợp lệ cho phân hệ đối chiếu hồ sơ (Chống Path Traversal & DoS)
  function isAllowedCompareFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    if (!fs.existsSync(filePath)) return false;
    const ext = path.extname(filePath).toLowerCase();
    const allowed = ['.xml', '.xlsx', '.xls', '.csv', '.json'];
    if (!allowed.includes(ext)) return false;
    try {
      const stat = fs.statSync(filePath);
      return stat.size <= 100 * 1024 * 1024; // Tối đa 100MB
    } catch {
      return false;
    }
  }

  ipcMain.handle('compare:compare-files', async (_event, { portalPath, internalPath }) => {
    try {
      if (!isAllowedCompareFile(portalPath)) {
        return { ok: false, error: 'Tệp cổng giám định không hợp lệ hoặc vượt quá dung lượng 100MB' };
      }
      if (!isAllowedCompareFile(internalPath)) {
        return { ok: false, error: 'Tệp nội bộ bệnh viện không hợp lệ hoặc vượt quá dung lượng 100MB' };
      }

      await startCompareServer();
      await new Promise(r => setTimeout(r, 800));

      // Truyền đường dẫn tệp trực tiếp cho Python đọc nhị phân - tránh tạo Base64 khổng lồ gây OOM RAM
      const body = JSON.stringify({ portalPath, internalPath });
      return await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1', port: _comparePort || 27185, path: '/compare',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DMH_SESSION_TOKEN}`,
            'Content-Length': Buffer.byteLength(body)
          },
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
      if (typeof portalB64 !== 'string' || typeof internalB64 !== 'string') {
        return { ok: false, error: 'Định dạng dữ liệu Base64 không hợp lệ' };
      }
      // Bảo vệ RAM chống nổ V8 Heap OOM: tối đa ~50MB file
      if (portalB64.length > 70 * 1024 * 1024 || internalB64.length > 70 * 1024 * 1024) {
        return { ok: false, error: 'Kích thước dữ liệu vượt quá ngưỡng an toàn RAM (50MB). Hãy sử dụng phương thức chọn tệp trực tiếp.' };
      }
      await startCompareServer();
      await new Promise((res) => {
        let elapsed = 0;
        const check = () => {
          const req = http.request({
            hostname: '127.0.0.1',
            port: _comparePort || 27185,
            path: '/health',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${DMH_SESSION_TOKEN}` }
          }, (r) => {
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
          req.end();
        };
        check();
      });
      const body = JSON.stringify({ portalFile: portalB64, internalFile: internalB64 });
      return await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1', port: _comparePort || 27185, path: '/compare',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DMH_SESSION_TOKEN}`,
            'Content-Length': Buffer.byteLength(body)
          },
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
