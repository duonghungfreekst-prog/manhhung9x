const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

/**
 * powerShellExecutor - Bộ thực thi PowerShell nội bộ chuẩn hóa, an toàn
 * Toàn bộ script đều được mã hóa hoặc ghi ra tệp tạm với encoding UTF-8 / UTF-16LE
 * Không bao giờ nhận raw script từ client/renderer.
 */

// Chạy PowerShell script mã hóa UTF-16LE an toàn với UTF-8 console output
const runPSToolScript = (psScript, timeoutMs = 60000) => {
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
    ], { windowsHide: true, maxBuffer: 25 * 1024 * 1024, encoding: 'utf8', timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: err.message || String(stderr) });
      } else {
        resolve({ ok: true, output: (stdout || '').trim() });
      }
    });
  });
};

// Kiểm tra quyền Administrator thực tế của tiến trình
const isProcessElevated = () => {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Chạy PowerShell script với quyền Administrator (tự động kích hoạt UAC nếu cần)
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

// Chạy file script PowerShell tạm thời (dùng cho ký số XML / CA)
const runPsScriptFile = (scriptContent, timeoutMs = 45000) => {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `dmh_ps_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
    fs.writeFileSync(tmpFile, '\ufeff' + scriptContent, { encoding: 'utf8' });
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
      { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch {}
        if (err) {
          return reject(new Error(stderr || stdout || err.message));
        }
        resolve((stdout || '').trim());
      }
    );
  });
};

module.exports = {
  runPSToolScript,
  isProcessElevated,
  runElevatedPSToolScript,
  runPsScriptFile,
};
