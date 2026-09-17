const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isDev = app ? !app.isPackaged : true;

let _ttsProc      = null;   // child_process handle của tts_server.py
let _ttsReady     = false;
let _ttsCallbacks = new Map();  // id → resolve
let _ttsIdCounter = 1;
let _ttsStarting  = false;

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
  } catch (_e) { /* intentional: safe fallback */ }

  if (!isDev && process.resourcesPath) {
    const inRes = path.join(process.resourcesPath, relPath);
    if (fs.existsSync(inRes)) return inRes;
  }

  const inDev = path.join(__dirname, '../../', relPath);
  if (fs.existsSync(inDev)) return inDev;

  return directPath;
}

function getBundledPythonExe() {
  const inMod = resolveAssetPath('vendor/python-embed/python.exe');
  if (fs.existsSync(inMod)) return inMod;
  if (!isDev && process.resourcesPath) {
    return path.join(process.resourcesPath, 'vendor', 'python-embed', 'python.exe');
  }
  return path.join(__dirname, '../../vendor/python-embed/python.exe');
}

function getTtsPythonCmds() {
  const bundled = getBundledPythonExe();
  const candidates = [];
  if (fs.existsSync(bundled)) {
    candidates.push(bundled);
    console.log('[TTS] Dùng Python embed bundled:', bundled);
  } else {
    console.log('[TTS] Không tìm thấy Python embed, fallback hệ thống');
  }
  candidates.push('python', 'python3', 'py');
  return candidates;
}

function getTtsServerScript() {
  if (!isDev && process.resourcesPath) {
    return path.join(process.resourcesPath, 'scripts', 'tts_server.py');
  }
  return path.join(__dirname, '../../scripts/tts_server.py');
}

function getPiperPaths() {
  const piperDir = (!isDev && process.resourcesPath)
    ? path.join(process.resourcesPath, 'vendor', 'piper')
    : path.join(__dirname, '../../vendor/piper');
  const exe      = path.join(piperDir, 'piper.exe');
  const model    = path.join(piperDir, 'vi_VN-vivos-x_low.onnx');
  const modelBac = path.join(piperDir, 'vi_VN-25hours_single-low.onnx');
  if (fs.existsSync(exe) && fs.existsSync(model)) {
    console.log('[TTS] Piper offline found:', exe);
    return { exe, model, modelBac: fs.existsSync(modelBac) ? modelBac : '' };
  }
  console.log('[TTS] Piper not found, will use online TTS');
  return { exe: '', model: '', modelBac: '' };
}

async function ensureTtsServer() {
  if (_ttsProc && !_ttsProc.killed && _ttsReady) return true;
  if (_ttsStarting) {
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
          } catch (_e) { /* intentional: safe fallback */ }
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
    } catch (_e) { /* intentional: safe fallback */
      // Thử tiếp lệnh tiếp theo
    }
  }

  _ttsStarting = false;
  return started;
}

async function speakWithPiper(text, voice = 'default') {
  const ok = await ensureTtsServer();
  if (!ok || !_ttsProc) return false;

  return new Promise((resolve) => {
    const id = _ttsIdCounter++;
    _ttsCallbacks.set(id, resolve);
    try {
      const msg = JSON.stringify({ cmd: 'speak', id, text, voice }) + '\n';
      _ttsProc.stdin.write(msg, 'utf8');
    } catch (_e) { /* intentional: safe fallback */
      _ttsCallbacks.delete(id);
      resolve(false);
    }
    setTimeout(() => {
      if (_ttsCallbacks.has(id)) {
        _ttsCallbacks.delete(id);
        resolve(false);
      }
    }, 30000);
  });
}

function stopTtsServer() {
  if (_ttsProc && !_ttsProc.killed) {
    try { _ttsProc.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n'); } catch (_e) { /* intentional: safe fallback */ }
    setTimeout(() => { if (_ttsProc && !_ttsProc.killed) _ttsProc.kill(); }, 500);
  }
}

module.exports = {
  speakWithPiper,
  speakWithGtts: speakWithPiper,
  stopTtsServer,
  ensureTtsServer,
};
