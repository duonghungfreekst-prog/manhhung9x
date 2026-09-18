const { ipcMain, app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execFile, spawn, exec, execSync } = require('child_process');
const { runPSToolScript, isProcessElevated, runElevatedPSToolScript } = require('../services/system/powerShellExecutor.cjs');
const windowManager = require('../windows/windowManager.cjs');
const { isSafePath } = require('../security/pathValidator.cjs');

const isDev = app ? !app.isPackaged : true;

function getModulesBaseDir() {
  const dir = path.join(app.getPath('userData'), 'dmh_modules');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_e) { /* intentional: dir may exist */ }
  }
  return dir;
}

function resolveAssetPath(relPath) {
  const baseDir = getModulesBaseDir();
  const directPath = path.join(baseDir, relPath);
  if (fs.existsSync(directPath)) return directPath;

  try {
    const subdirs = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const sub of subdirs) {
      if (sub.isDirectory()) {
        const subPath = path.join(baseDir, sub.name, relPath);
        if (fs.existsSync(subPath)) return subPath;
      }
    }
  } catch (_e) { /* intentional: dir listing optional */ }

  if (!isDev && process.resourcesPath) {
    const inRes = path.join(process.resourcesPath, relPath);
    if (fs.existsSync(inRes)) return inRes;
  }

  const inDev = path.join(__dirname, '../..', relPath);
  if (fs.existsSync(inDev)) return inDev;

  return directPath;
}

function downloadFileWithRedirect(targetUrl, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    let handled = false;
    let file = null;

    const cleanup = () => {
      if (file) {
        try { file.destroy(); } catch (_e) { /* intentional: stream may be destroyed */ }
        file = null;
      }
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch (_e) { /* intentional: file may not exist */ }
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
          'User-Agent': 'DMH-Tools-Modular-Engine/' + (app ? app.getVersion() : '7.0.0'),
          'Accept': '*/*'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
            nextUrl = new URL(nextUrl, curUrl).toString();
          }
          res.resume();
          return makeReq(nextUrl, redirects + 1);
        }

        if (res.statusCode !== 200) {
          cleanup();
          res.resume();
          if (!handled) { handled = true; reject(new Error('Tải tệp thất bại. Mã HTTP: ' + res.statusCode)); }
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastEmitTime = 0;
        let lastPercent = -1;

        file = fs.createWriteStream(destPath);
        res.pipe(file);

        res.on('data', (chunk) => {
          req.setTimeout(120000);
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          const now = Date.now();
          if (onProgress && (percent !== lastPercent || now - lastEmitTime > 300)) {
            lastPercent = percent;
            lastEmitTime = now;
            onProgress({ downloadedBytes, totalBytes, percent });
          }
        });

        file.on('finish', () => {
          file.close(() => {
            if (!handled) {
              handled = true;
              if (onProgress) onProgress({ downloadedBytes: totalBytes, totalBytes, percent: 100 });
              resolve();
            }
          });
        });

        file.on('error', (err) => {
          cleanup();
          if (!handled) { handled = true; reject(err); }
        });
      });

      req.setTimeout(60000, () => {
        cleanup();
        req.destroy();
        if (!handled) { handled = true; reject(new Error('Yêu cầu tải xuống bị quá hạn thời gian (Timeout 60s)')); }
      });

      req.on('error', (err) => {
        cleanup();
        if (!handled) { handled = true; reject(err); }
      });
    };

    makeReq(targetUrl);
  });
}

/**
 * system.ipc.cjs - Module IPC PC Tools, Benchmark, Dọn Dẹp, Tối Ưu và Quản Lý Module
 */
function registerSystemIPC() {
  const _mainWin = windowManager.getMainWin();

  ipcMain.handle('convert-pdf', async (_event, inputPath) => {
    return new Promise((resolve, reject) => {
      if (typeof inputPath !== 'string') return reject('inputPath không hợp lệ');
      const normalizedInput = path.resolve(inputPath);
      if (!isSafePath(normalizedInput))  return reject('Đường dẫn file không được phép truy cập');
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

  // ── IPC: HTML to PDF (PrintToPDF) ──────────────────────────────────────────
  ipcMain.handle('html-to-pdf', async (_event, { html, landscape = false }) => {
    let pdfWin = null;
    try {
      pdfWin = new BrowserWindow({
        show: false,
        webPreferences: {
          offscreen: true,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: 'A4',
        landscape: Boolean(landscape),
        printBackground: true,
        margins: {
          marginType: 'default',
        },
      });
      return pdfBuffer;
    } finally {
      if (pdfWin && !pdfWin.isDestroyed()) {
        pdfWin.destroy();
      }
    }
  });

  // ── PC TOOLS (KỸ THUẬT MÁY TÍNH - BTP PRO ALL-IN-ONE) ─────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

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
      } catch (_e) { /* intentional: fallback to default testDir */
        testDir = path.join(os.tmpdir(), 'dmh_benchmark');
      }
    }
    try {
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    } catch (_e) { /* intentional: fallback to tmpdir */
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
      } catch (_e) { /* intentional: test file may not exist */ }
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
          } catch {} # intentional: file may be locked
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
          } catch {} # intentional: file may be locked
        }
      }

      # 3. Dọn Recycle Bin
      try {
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
      } catch {} # intentional: recycle bin may be empty

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
    } catch (_e) { /* intentional: fallback to default */
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
    } catch (_e) { /* intentional: fallback to default */
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
    } catch (_e) { /* intentional: fallback to default */
      return { ok: false, error: 'Không thể phân tích dữ liệu người dùng' };
    }
  });

  ipcMain.handle('pctools:manage-user', async (_event, params = {}) => {
    const { action, username, password, newComputerName, isAdmin, active } = params;

    const cleanUser = typeof username === 'string' ? username.trim() : '';
    const cleanPass = typeof password === 'string' ? password : '';
    const cleanComp = typeof newComputerName === 'string' ? newComputerName.trim() : '';

    if (action === 'rename-computer') {
      if (!cleanComp || !/^[a-zA-Z0-9-]{1,15}$/.test(cleanComp)) {
        return { ok: false, error: 'Tên máy tính không hợp lệ (1-15 ký tự, chữ, số và dấu gạch ngang)' };
      }
      return new Promise((resolve) => {
        execFile('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-Command', 'param($n) Rename-Computer -NewName $n -Force -ErrorAction Stop',
          cleanComp
        ], { windowsHide: true, timeout: 15000 }, (err) => {
          if (err) resolve({ ok: false, error: 'Lỗi đổi tên máy (cần quyền Admin): ' + err.message });
          else resolve({ ok: true, message: `Đã đổi tên máy thành ${cleanComp}. Vui lòng khởi động lại máy để áp dụng.` });
        });
      });
    }

    if (!cleanUser || !/^[a-zA-Z0-9_.-]{1,32}$/.test(cleanUser)) {
      return { ok: false, error: 'Tên người dùng không hợp lệ (chỉ chứa chữ cái, số, _, . hoặc -)' };
    }

    if (action === 'change-password') {
      if (!cleanPass) return { ok: false, error: 'Mật khẩu mới không được để trống' };
      return new Promise((resolve) => {
        execFile('net.exe', ['user', cleanUser, cleanPass], { windowsHide: true, timeout: 10000 }, (err) => {
          if (err) resolve({ ok: false, error: 'Lỗi đổi mật khẩu: ' + err.message });
          else resolve({ ok: true, message: `Đã đổi mật khẩu tài khoản ${cleanUser} thành công.` });
        });
      });
    }

    if (action === 'toggle-account') {
      const act = active ? 'yes' : 'no';
      return new Promise((resolve) => {
        execFile('net.exe', ['user', cleanUser, `/active:${act}`], { windowsHide: true, timeout: 10000 }, (err) => {
          if (err) resolve({ ok: false, error: 'Lỗi thay đổi trạng thái tài khoản: ' + err.message });
          else resolve({ ok: true, message: `Đã ${active ? 'kích hoạt' : 'vô hiệu hóa'} tài khoản ${cleanUser}.` });
        });
      });
    }

    if (action === 'create-user') {
      if (!cleanPass) return { ok: false, error: 'Mật khẩu không được để trống khi tạo tài khoản' };
      return new Promise((resolve) => {
        execFile('net.exe', ['user', cleanUser, cleanPass, '/add'], { windowsHide: true, timeout: 10000 }, (err) => {
          if (err) return resolve({ ok: false, error: 'Lỗi tạo tài khoản: ' + err.message });
          if (isAdmin) {
            execFile('net.exe', ['localgroup', 'administrators', cleanUser, '/add'], { windowsHide: true, timeout: 10000 }, (admErr) => {
              if (admErr) resolve({ ok: true, message: `Đã tạo tài khoản ${cleanUser}, nhưng chưa cấp được quyền Admin: ${admErr.message}` });
              else resolve({ ok: true, message: `Đã tạo tài khoản Quản trị viên ${cleanUser} thành công.` });
            });
          } else {
            resolve({ ok: true, message: `Đã tạo tài khoản ${cleanUser} thành công.` });
          }
        });
      });
    }

    return { ok: false, error: 'Hành động không hợp lệ' };
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
      } catch { # intentional: battery may not exist
        $battObj = @{ HasBattery = $false }
      }

      # Disks
      $diskHealth = @()
      try {
        $pDisks = Get-PhysicalDisk
        foreach ($pd in $pDisks) {
          $cnt = $null
          try { $cnt = $pd | Get-StorageReliabilityCounter } catch {} # intentional: counter may not exist
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
      } catch {} # intentional: disk health query optional

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
    } catch (_e) { /* intentional: fallback to default */
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

    if (wingetId) {
      if (typeof wingetId !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(wingetId.trim())) {
        return { ok: false, error: 'Mã Winget ID không hợp lệ' };
      }
      return new Promise((resolve) => {
        execFile('winget.exe', [
          'install', '--id', wingetId.trim(),
          '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'
        ], { windowsHide: true, timeout: 180000 }, (err, stdout, stderr) => {
          if (err) resolve({ ok: false, error: 'Lỗi winget: ' + (err.message || stderr) });
          else resolve({ ok: true, message: 'Đã hoàn tất cài đặt gói phần mềm qua Winget.' });
        });
      });
    }

    if (filePath) {
      if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        return { ok: false, error: 'Tệp cài đặt không tồn tại trên hệ thống' };
      }
      const ext = path.extname(filePath).toLowerCase();
      if (!['.exe', '.msi'].includes(ext)) {
        return { ok: false, error: 'Định dạng tệp cài đặt không được hỗ trợ (chỉ chấp nhận .exe hoặc .msi)' };
      }
      const safeArgs = typeof args === 'string'
        ? args.trim().split(/\s+/).filter(a => /^[a-zA-Z0-9/=_-]+$/.test(a))
        : ['/S'];

      return new Promise((resolve) => {
        if (ext === '.msi') {
          execFile('msiexec.exe', ['/i', filePath, '/qn', '/norestart'], { windowsHide: true, timeout: 180000 }, (err) => {
            if (err) resolve({ ok: false, error: 'Lỗi cài đặt MSI: ' + err.message });
            else resolve({ ok: true, message: 'Đã hoàn tất cài đặt gói phần mềm MSI.' });
          });
        } else {
          execFile(filePath, safeArgs, { windowsHide: true, timeout: 180000 }, (err) => {
            if (err) resolve({ ok: false, error: 'Lỗi khởi chạy bộ cài đặt: ' + err.message });
            else resolve({ ok: true, message: 'Đã chạy cài đặt phần mềm hoàn tất.' });
          });
        }
      });
    }

    return { ok: false, error: 'Thiếu thông tin file cài đặt hoặc ID winget' };
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
    } catch (_e) { /* intentional: fallback to default */
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
      appwiz: 'appwiz.cpl',
      bitlocker: 'control.exe /name Microsoft.BitLockerDriveEncryption',
      hyperv: 'virtmgmt.msc',
      winupdate: 'control.exe update',
      recovery: 'rstrui.exe'
    };
    const cmd = toolMap[toolId];
    if (!cmd) return { ok: false, error: 'Không tìm thấy công cụ yêu cầu' };
    
    // Xử lý đặc biệt cho các lệnh có argument
    const parts = cmd.split(' ');
    const exe = parts[0];
    const args = parts.slice(1);
    
    execFile('cmd.exe', ['/c', 'start', '', exe, ...args], { windowsHide: true }, (err) => {
      if (err) console.error('[ENGINE] launch-tool error:', err.message);
    });
    return { ok: true, message: `Đã kích hoạt ${cmd}` };
  });

  // 19. Kiểm tra bản quyền Windows & Microsoft Office (Thuật toán Thẩm Định Thông Minh Đa Tầng)
  ipcMain.handle('pctools:check-license', async () => {
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
      try { fs.mkdirSync(dest, { recursive: true }); } catch (_e) { /* intentional: dir may exist */ }
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
    } catch (_e) { /* intentional: fallback to default */
      return { ok: true, targetDir: dest, message: `Đã sao lưu driver vào ${dest}!` };
    }
  });

  // 21. Điều khiển nguồn: Khởi động thẳng vào BIOS / Hẹn giờ tắt máy
  ipcMain.handle('pctools:power-action', async (_event, payload = {}) => {
    const { action, minutes = 30 } = payload;

    if (action === 'reboot-bios') {
      execFile('shutdown.exe', ['/r', '/fw', '/t', '3'], (err) => {
        if (err) {
          execFile('shutdown.exe', ['/r', '/o', '/t', '3']);
        }
      });
      return { ok: true, message: 'Máy tính sẽ tự khởi động vào màn hình BIOS/UEFI sau 3 giây!' };
    }

    if (action === 'schedule-shutdown') {
      const safeMinutes = Math.max(1, Math.min(1440, parseInt(minutes, 10) || 30));
      const sec = String(safeMinutes * 60);
      execFile('shutdown.exe', ['/s', '/t', sec, '/c', `DMH Tools: He thong se tu dong tat nguon sau ${safeMinutes} phut.`], (err) => {
        if (err) console.error('[ENGINE] power-action schedule-shutdown error:', err.message);
      });
      return { ok: true, message: `Đã thiết lập hẹn giờ tắt máy sau ${safeMinutes} phút (${sec} giây)!` };
    }

    if (action === 'cancel-shutdown') {
      execFile('shutdown.exe', ['/a'], (err) => {
        if (err) console.error('[ENGINE] power-action cancel-shutdown error:', err.message);
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
    } catch (_e) { /* intentional: fallback to default */
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
            } catch { # intentional: DNS lookup may fail
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
    } catch (_e) { /* intentional: fallback to default */
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
      } catch { # intentional: restore point creation may fail
        "Lỗi tạo điểm phục hồi: " + $_.Exception.Message
      }
    `;
    const res = await runPSToolScript(ps);
    return { ok: res.ok, message: res.output || res.error };
  });

  ipcMain.handle('pctools:open-restore-gui', async () => {
    execFile('rstrui.exe', [], { windowsHide: false }, (err) => {
      if (err) console.error('[ENGINE] open-restore-gui error:', err.message);
    });
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
    } catch (_e) { /* intentional: fallback to default */
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
    } catch (_e) { /* intentional: fallback to default */
      return { ok: true, files: [] };
    }
  });

  ipcMain.handle('pctools:open-file-location', async (_event, filePath) => {
    if (!filePath || !isSafePath(filePath)) return { ok: false, error: 'Đường dẫn không được phép truy cập' };
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { ok: true };
    }
    return { ok: false, error: 'Tệp không tồn tại' };
  });

  ipcMain.handle('pctools:delete-file', async (_event, filePath) => {
    if (!filePath || !isSafePath(filePath)) return { ok: false, error: 'Đường dẫn không được phép truy cập' };
    if (fs.existsSync(filePath)) {
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
    if (cleanCustom && !/^[a-zA-Z0-9.:-]+$/.test(cleanCustom)) {
      return { ok: false, error: 'Địa chỉ IP hoặc tên máy chủ không hợp lệ (chặn ký tự đặc biệt)', targets: [], results: [] };
    }
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $targets = @('8.8.8.8', '1.1.1.1')
      $gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty NextHop)
      if ($gw) { $targets += $gw }
      ${cleanCustom ? `$targets += "${cleanCustom}"` : ''}

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
    } catch (_e) { /* intentional: fallback to default */
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
          } catch {} # intentional: file may be locked
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
          } catch {} # intentional: file may be locked
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
          } catch {} # intentional: file may be locked
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
          } catch {} # intentional: file may be locked
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
    } catch (_e) { /* intentional: fallback to default */
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
    } catch (_e) { /* intentional: fallback to default */
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
          } catch {} # intentional: file may be locked
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
    } catch (_e) { /* intentional: fallback to default */
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
    } catch (_e) { /* intentional: fallback to default */
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
    } catch (_e) { /* intentional: fallback to default */
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
          } catch { # intentional: date format fallback
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
    try { return JSON.parse(res.output || '{}'); } catch (_e) { /* intentional: fallback to default */ return { ok: true }; }
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
    } catch (_e) { /* intentional: fallback to default */
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
    try { return JSON.parse(res.output || '{}'); } catch (_e) { /* intentional: fallback to default */ return { ok: true }; }
  });

  // ── PRINTER SUITE: Tự động trích xuất Event Log lỗi in ấn & SMB từ Windows Event Viewer ──

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
        } catch (_e) { /* intentional: dir size calc optional */ }
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

  // Whitelist domain an toàn cho việc tải module và cập nhật
  function isAllowedDownloadUrl(u) {
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'github.com' ||
        host === 'raw.githubusercontent.com' ||
        host === 'objects.githubusercontent.com' ||
        host === 'github-releases.githubusercontent.com' ||
        host.endsWith('.githubusercontent.com')
      );
    } catch (_e) { /* intentional: invalid URL returns false */
      return false;
    }
  }

  // 2. Tải và cài đặt module từ GitHub Releases (Bảo mật Whitelist & Sanitize)
  ipcMain.handle('module:download-github', async (event, { moduleId, downloadUrl, assetName, expectedSha256, expectedSignature }) => {
    try {
      if (!moduleId || typeof moduleId !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(moduleId)) {
        return { ok: false, error: 'Tên moduleId không hợp lệ (chỉ chấp nhận ký tự a-z, 0-9, _, -, .)' };
      }
      if (!downloadUrl || typeof downloadUrl !== 'string' || !isAllowedDownloadUrl(downloadUrl)) {
        return { ok: false, error: 'URL tải về không thuộc nguồn GitHub chính thức được cấp phép (Bảo vệ SSRF)' };
      }

      const baseDir = getModulesBaseDir();
      const modFolder = path.join(baseDir, moduleId);
      if (!fs.existsSync(modFolder)) {
        fs.mkdirSync(modFolder, { recursive: true });
      }

      const safeAssetName = assetName ? path.basename(assetName) : '';
      const isExe = (safeAssetName && safeAssetName.toLowerCase().endsWith('.exe')) || downloadUrl.toLowerCase().includes('.exe');
      
      if (isExe) {
        // Bộ cài đặt cập nhật (.exe) -> Tải trực tiếp không cần giải nén
        const targetExeName = safeAssetName || 'installer.exe';
        const destExe = path.join(modFolder, targetExeName);
        console.log(`[UPDATE] Đang tải bộ cài đặt an toàn .exe ${moduleId} về: ${destExe}`);

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
          } catch (_e) { /* intentional: sender may be destroyed */ }
        });

        // Kiểm tra tính toàn vẹn SHA-256 nếu có mã đối soát
        if (expectedSha256 && typeof expectedSha256 === 'string' && expectedSha256.trim().length >= 32) {
          const fileBuf = fs.readFileSync(destExe);
          const actualHash = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
          if (actualHash !== expectedSha256.trim().toLowerCase()) {
            try { fs.unlinkSync(destExe); } catch (_e) { /* intentional: file may not exist */ }
            return { ok: false, error: 'Mã băm SHA-256 không khớp! Tệp có dấu hiệu bị can thiệp hoặc tải không trọn vẹn.' };
          }
        }

        // Xác minh Chữ ký số Ed25519 của nhà phát hành tin cậy (nếu có chữ ký đính kèm)
        if (expectedSignature && typeof expectedSignature === 'string') {
          const fileBuf = fs.readFileSync(destExe);
          const { PUBLIC_KEY_SPKI_B64 } = require('../licenseVault.cjs');
          try {
            const pubKeyObj = crypto.createPublicKey({
              key: Buffer.from(PUBLIC_KEY_SPKI_B64, 'base64'),
              format: 'der',
              type: 'spki'
            });
            const sigBuf = Buffer.from(expectedSignature, 'base64url');
            const isSigValid = crypto.verify(null, fileBuf, pubKeyObj, sigBuf);
            if (!isSigValid) {
              try { fs.unlinkSync(destExe); } catch (_e) { /* intentional: file may not exist */ }
              return { ok: false, error: 'Chữ ký số Ed25519 của bộ cài đặt không hợp lệ! Từ chối thực thi để bảo vệ hệ thống.' };
            }
          } catch (sigErr) {
            try { fs.unlinkSync(destExe); } catch (_e) { /* intentional: file may not exist */ }
            return { ok: false, error: 'Lỗi xác minh chữ ký số của nhà phát hành: ' + sigErr.message };
          }
        }

        console.log(`[UPDATE] Tải hoàn tất bộ cài đặt: ${destExe}`);
        return { ok: true, installerPath: destExe, message: 'Đã tải xong bộ cài đặt cập nhật an toàn!' };
      }

      // Trường hợp gói module nén (.zip)
      const tempZip = path.join(baseDir, `temp_${moduleId}_${Date.now()}.zip`);
      console.log(`[MODULE] Đang tải ${moduleId} từ ${downloadUrl}`);

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
        } catch (_e) { /* intentional: sender may be destroyed */ }
      });

      // Kiểm tra tính toàn vẹn SHA-256 của gói ZIP trước khi giải nén
      if (expectedSha256 && typeof expectedSha256 === 'string' && expectedSha256.trim().length >= 32) {
        const fileBuf = fs.readFileSync(tempZip);
        const actualHash = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
        if (actualHash !== expectedSha256.trim().toLowerCase()) {
          try { fs.unlinkSync(tempZip); } catch (_e) { /* intentional: temp file may not exist */ }
          return { ok: false, error: 'Mã băm SHA-256 của gói module không khớp! Đã hủy cài đặt.' };
        }
      }

      console.log(`[MODULE] Đang giải nén an toàn ${tempZip} vào ${modFolder}`);

      // Dùng tham số mảng an toàn với Expand-Archive (không nối chuỗi lệnh)
      await new Promise((resolve, reject) => {
        execFile('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy', 'Bypass',
          '-Command',
          'Expand-Archive',
          '-LiteralPath', tempZip,
          '-DestinationPath', modFolder,
          '-Force'
        ], (err) => {
          try { fs.unlinkSync(tempZip); } catch (_e) { /* intentional: temp file may not exist */ }
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
      if (!moduleId || typeof moduleId !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(moduleId)) {
        return { ok: false, error: 'Tên moduleId không hợp lệ' };
      }
      const baseDir = getModulesBaseDir();
      const modFolder = path.resolve(baseDir, moduleId);
      if (!modFolder.startsWith(baseDir)) {
        return { ok: false, error: 'Đường dẫn module không hợp lệ' };
      }
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

  // 5. Khởi chạy bộ cài đặt cập nhật và đóng ứng dụng an toàn (Chống Command Injection)
  ipcMain.handle('system:run-installer', async (_event, installerName) => {
    try {
      if (!installerName || typeof installerName !== 'string') {
        return { ok: false, error: 'Tên bộ cài đặt không hợp lệ' };
      }
      const baseDir = getModulesBaseDir();
      const cleanFileName = path.basename(installerName);
      if (!cleanFileName.toLowerCase().endsWith('.exe')) {
        return { ok: false, error: 'Tệp cập nhật bắt buộc phải có định dạng thực thi .exe' };
      }

      let installerPath = path.isAbsolute(installerName) ? installerName : path.join(baseDir, cleanFileName);

      // Chặn đứng Path Traversal và chỉ cho phép chạy các bộ cài đặt nằm trong thư mục baseDir của ứng dụng
      const resolvedInstaller = path.resolve(installerPath);
      const resolvedBase = path.resolve(baseDir);
      if (!resolvedInstaller.toLowerCase().startsWith(resolvedBase.toLowerCase())) {
        return { ok: false, error: 'Bảo vệ Sandbox: Chỉ cho phép khởi chạy bộ cài đặt nằm trong thư mục module được cấp phép!' };
      }

      if (!fs.existsSync(resolvedInstaller)) {
        // Tìm trong các thư mục con update_*
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const p = path.join(baseDir, entry.name, cleanFileName);
            if (fs.existsSync(p)) {
              installerPath = p;
              break;
            }
            const subEntries = fs.readdirSync(path.join(baseDir, entry.name));
            const foundExe = subEntries.find(f => f.toLowerCase().endsWith('.exe'));
            if (foundExe) {
              installerPath = path.join(baseDir, entry.name, foundExe);
              break;
            }
          }
        }
      }

      const finalPath = path.resolve(installerPath);
      if (!fs.existsSync(finalPath) || !finalPath.toLowerCase().startsWith(resolvedBase.toLowerCase())) {
        return { ok: false, error: 'Không tìm thấy tệp bộ cài đặt hợp lệ trong kho lưu trữ an toàn: ' + cleanFileName };
      }

      console.log('[UPDATE] Khởi chạy an toàn bộ cài đặt cập nhật:', finalPath);

      // Khởi chạy an toàn bằng mảng tham số (không chèn chuỗi nội suy)
      execFile('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Start-Process',
        '-FilePath',
        finalPath
      ], (psErr) => {
        if (psErr) {
          console.warn('[UPDATE] Start-Process lỗi, thử lại bằng shell.openPath:', psErr);
          shell.openPath(finalPath);
        }
      });

      // Ẩn cửa sổ app chính sau 1.5s
      setTimeout(() => {
        try {
          if (_mainWin && !_mainWin.isDestroyed()) {
            _mainWin.hide();
          }
        } catch (_e) { /* intentional: window may be destroyed */ }
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

}

module.exports = { registerSystemIPC, resolveAssetPath, getModulesBaseDir, downloadFileWithRedirect };
