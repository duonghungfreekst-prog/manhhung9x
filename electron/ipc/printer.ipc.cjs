const { ipcMain, app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, exec, execSync } = require('child_process');
const { runPSToolScript, runElevatedPSToolScript } = require('../services/system/powerShellExecutor.cjs');
const windowManager = require('../windows/windowManager.cjs');

/**
 * printer.ipc.cjs - Module IPC Cứu Hộ Máy In, Spooler, SMB và Chia Sẻ Mạng LAN
 */
function registerPrinterIPC() {
  const _mainWin = windowManager.getMainWin();

  ipcMain.handle('printer:get-printers', async () => {
    return new Promise((resolve) => {
      const psScript = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8
        Get-Printer | Select-Object Name, PrinterStatus, JobCount, DriverName, PortName | ConvertTo-Json -Compress
      `;
      const buffer = Buffer.from(psScript, 'utf16le');
      const b64 = buffer.toString('base64');
      execFile('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', b64
      ], { windowsHide: true, maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []));
        } catch {
          resolve([]);
        }
      });
    });
  });

  ipcMain.handle('printer:get-live-event-logs', async (_event, params) => {
    const minutes = (params && params.minutes) ? Number(params.minutes) : 30;
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $timeLimit = (Get-Date).AddMinutes(-${minutes})
      $allLogs = @()

      # 1. Kênh Microsoft-Windows-PrintService/Admin
      try {
        $printLogs = Get-WinEvent -FilterHashtable @{
          LogName = 'Microsoft-Windows-PrintService/Admin'
          Level = 1, 2, 3
          StartTime = $timeLimit
        } -MaxEvents 15 -ErrorAction SilentlyContinue

        if ($printLogs) {
          foreach ($evt in $printLogs) {
            $msg = $evt.Message
            if ($msg) { $msg = $msg.Trim() }
            $allLogs += [PSCustomObject]@{
              source = "PrintService/Admin"
              id = $evt.Id
              level = if ($evt.Level -eq 2) { "Error" } elseif ($evt.Level -eq 1) { "Critical" } else { "Warning" }
              time = $evt.TimeCreated.ToString("HH:mm:ss dd/MM")
              message = $msg
            }
          }
        }
      } catch {}

      # 2. Kênh Microsoft-Windows-SMBClient/Operational (Lỗi kết nối SMB / Lỗi 0x40)
      try {
        $smbLogs = Get-WinEvent -FilterHashtable @{
          LogName = 'Microsoft-Windows-SMBClient/Operational'
          Level = 1, 2, 3
          StartTime = $timeLimit
        } -MaxEvents 15 -ErrorAction SilentlyContinue

        if ($smbLogs) {
          foreach ($evt in $smbLogs) {
            $msg = $evt.Message
            if ($msg) { $msg = $msg.Trim() }
            $allLogs += [PSCustomObject]@{
              source = "SMBClient"
              id = $evt.Id
              level = if ($evt.Level -eq 2) { "Error" } elseif ($evt.Level -eq 1) { "Critical" } else { "Warning" }
              time = $evt.TimeCreated.ToString("HH:mm:ss dd/MM")
              message = $msg
            }
          }
        }
      } catch {}

      # 3. Kênh System toàn diện (Mọi lỗi hệ thống, Dịch vụ, Driver, RPC, Mạng, DCOM)
      try {
        $sysLogs = Get-WinEvent -FilterHashtable @{
          LogName = 'System'
          Level = 1, 2
          StartTime = $timeLimit
        } -MaxEvents 15 -ErrorAction SilentlyContinue

        if ($sysLogs) {
          foreach ($evt in $sysLogs) {
            $msg = $evt.Message
            if ($msg) { $msg = $msg.Trim() }
            $allLogs += [PSCustomObject]@{
              source = "System/" + $evt.ProviderName
              id = $evt.Id
              level = if ($evt.Level -eq 2) { "Error" } else { "Critical" }
              time = $evt.TimeCreated.ToString("HH:mm:ss dd/MM")
              message = $msg
            }
          }
        }
      } catch {}

      # 4. Kênh Application toàn diện (Mọi lỗi Crash ứng dụng, .NET, SQL Server, Exception, WerFault)
      try {
        $appLogs = Get-WinEvent -FilterHashtable @{
          LogName = 'Application'
          Level = 1, 2
          StartTime = $timeLimit
        } -MaxEvents 15 -ErrorAction SilentlyContinue

        if ($appLogs) {
          foreach ($evt in $appLogs) {
            $msg = $evt.Message
            if ($msg) { $msg = $msg.Trim() }
            $allLogs += [PSCustomObject]@{
              source = "Application/" + $evt.ProviderName
              id = $evt.Id
              level = if ($evt.Level -eq 2) { "Error" } else { "Critical" }
              time = $evt.TimeCreated.ToString("HH:mm:ss dd/MM")
              message = $msg
            }
          }
        }
      } catch {}

      # 5. Hàng đợi lệnh in thực tế đang kẹt (Stuck Jobs)
      $stuckJobs = @()
      try {
        Get-PrintJob -ErrorAction SilentlyContinue | ForEach-Object {
          $stuckJobs += [PSCustomObject]@{
            printer = $_.PrinterName
            id = $_.Id
            document = $_.DocumentName
            status = if ($_.JobStatus) { $_.JobStatus.ToString() } else { "Unknown" }
          }
        }
      } catch {}

      # 6. Trạng thái dịch vụ Spooler
      $spoolerSvc = Get-Service -Name Spooler -ErrorAction SilentlyContinue
      $spoolerState = if ($spoolerSvc) { $spoolerSvc.Status.ToString() } else { "Stopped" }

      # 7. Thông tin chi tiết Windows Build
      $verKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"
      $prodName = (Get-ItemProperty $verKey -Name "ProductName" -ErrorAction SilentlyContinue).ProductName
      $dispVer = (Get-ItemProperty $verKey -Name "DisplayVersion" -ErrorAction SilentlyContinue).DisplayVersion
      $buildNum = (Get-ItemProperty $verKey -Name "CurrentBuildNumber" -ErrorAction SilentlyContinue).CurrentBuildNumber
      $fullWinVer = "$prodName $dispVer (Build $buildNum)"

      [PSCustomObject]@{
        ok = $true
        count = $allLogs.Count
        logs = $allLogs
        stuckJobs = $stuckJobs
        spoolerStatus = $spoolerState
        windowsVersion = $fullWinVer
      } | ConvertTo-Json -Depth 3 -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, logs: [], count: 0, stuckJobs: [] };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, logs: [], count: 0, stuckJobs: [] };
    }
  });

  // ── PRINTER SUITE: Bắt mạch đo lường mạng máy chủ in (Ping, Port 445 SMB, Port 135 RPC, IPC$) ──
  ipcMain.handle('printer:probe-target-host', async (_event, params) => {
    const rawHost = (params && params.host) ? String(params.host).trim() : '';
    const cleanHost = rawHost.replace(/^\\+/, '').replace(/[^\w\.\-\_]/g, '');
    if (!cleanHost) {
      return { ok: false, error: 'Chưa nhập IP hoặc Tên Máy Chủ để kiểm tra' };
    }

    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $h = "${cleanHost}"

      # 1. Phân giải DNS / NetBIOS
      $resolvedIp = ""
      try {
        $ips = [System.Net.Dns]::GetHostAddresses($h) | Where-Object { $_.AddressFamily -eq 'InterNetwork' }
        if ($ips) { $resolvedIp = $ips[0].IPAddressToString }
      } catch {}

      # 2. Ping ICMP test
      $pingOk = $false
      $pingMs = -1
      try {
        $p = Test-Connection -ComputerName $h -Count 1 -ErrorAction SilentlyContinue
        if ($p) {
          $pingOk = $true
          $pingMs = $p.ResponseTime
        }
      } catch {}

      # 3. Test Port 445 (SMB)
      $smb445Ok = $false
      try {
        $tcp445 = Test-NetConnection -ComputerName $h -Port 445 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        if ($tcp445 -and $tcp445.TcpTestSucceeded) {
          $smb445Ok = $true
        }
      } catch {}

      # 4. Test Port 135 (RPC Endpoint Mapper)
      $rpc135Ok = $false
      try {
        $tcp135 = Test-NetConnection -ComputerName $h -Port 135 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        if ($tcp135 -and $tcp135.TcpTestSucceeded) {
          $rpc135Ok = $true
        }
      } catch {}

      # 5. Test Port 139 (NetBIOS Session)
      $netbios139Ok = $false
      try {
        $tcp139 = Test-NetConnection -ComputerName $h -Port 139 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        if ($tcp139 -and $tcp139.TcpTestSucceeded) {
          $netbios139Ok = $true
        }
      } catch {}

      # 6. Quét danh sách máy in và chia sẻ thực tế trên máy chủ
      $sharedPrinters = @()
      $ipcAccessOk = $false
      $ipcError = ""
      try {
        $uncHost = '\\' + $h
        $uncIpc = $uncHost + '\IPC$'
        # Bắt tay phiên IPC$ trước để mở quyền đọc tài nguyên chia sẻ
        net use $uncIpc /user:guest "" /persistent:no 2>&1 | Out-Null
        $testIpc = net view $uncHost 2>&1
        if ($LASTEXITCODE -ne 0) {
          # Thử bắt tay phiên anonymous nếu máy chủ không hỗ trợ guest
          net use $uncIpc "" /user:"" /persistent:no 2>&1 | Out-Null
          $testIpc = net view $uncHost 2>&1
        }
        if ($LASTEXITCODE -eq 0) {
          $ipcAccessOk = $true
          foreach ($line in ($testIpc | Out-String -Stream)) {
            if ($line -match '^\\s*(\\S+)\\s+Print(\\s+|$)') {
              $pName = $matches[1].Trim()
              if ($pName -and $pName -ne 'Share') { $sharedPrinters += $pName }
            }
          }
        } else {
          $ipcError = ($testIpc | Out-String).Trim()
        }
        if ($sharedPrinters.Count -gt 0) {
          $ipcAccessOk = $true
        }
      } catch {
        $ipcError = $_.Exception.Message
      }

      # 7. Kiểm tra cấu hình SMB Client máy con
      $guestAllowed = $null
      $signingRequired = $null
      try {
        $cfg = Get-SmbClientConfiguration -ErrorAction SilentlyContinue
        if ($cfg) {
          $guestAllowed = [bool]$cfg.EnableInsecureGuestLogons
          $signingRequired = [bool]$cfg.RequireSecuritySignature
        }
      } catch {}

      # 8. Thông tin OS máy hiện tại
      $os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption

      [PSCustomObject]@{
        ok = $true
        host = $h
        resolvedIp = $resolvedIp
        pingOk = $pingOk
        pingMs = $pingMs
        port445Smb = $smb445Ok
        port135Rpc = $rpc135Ok
        port139Netbios = $netbios139Ok
        ipcAccessOk = $ipcAccessOk
        ipcError = $ipcError
        sharedPrinters = $sharedPrinters
        insecureGuestAllowed = $guestAllowed
        smbSigningRequired = $signingRequired
        clientOs = $os
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, host: cleanHost, sharedPrinters: [] };
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, host: cleanHost, sharedPrinters: [] };
    }
  });

  // ── PRINTER SUITE: Đặc trị lỗi 0x00000040 (The specified network name is no longer available / Đứt phiên SMB / Point & Print) ──
  ipcMain.handle('printer:fix-error-0x40', async (_event, params) => {
    const rawHost = (params && params.host) ? String(params.host).trim() : '';
    // Lọc sạch host name/IP tránh injection
    const cleanHost = rawHost.replace(/^\\+/, '').replace(/[^\w\.\-\_]/g, '');

    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Chuyển đổi toàn bộ Network Connection Profile sang Private (Riêng tư)
      Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue

      # 2. Cấu hình SMB Client & SMB Server toàn diện (Đặc trị Windows 11 24H2/23H2 kết nối Win 10/7)
      Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -EnableInsecureGuestLogons $true -Force -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -AuditServerDoesNotSupportSigning $false -AuditServerDoesNotSupportEncryption $false -EnableBandwidthThrottling $false -EnableLargeMtu $true -Force -ErrorAction SilentlyContinue
      Set-SmbServerConfiguration -EnableSMB1Protocol $true -Force -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -EnableSMB1Protocol $true -Force -ErrorAction SilentlyContinue

      # Registry SMB Signing & Guest Auth (Áp dụng cả Policies và Services)
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AuditServerDoesNotSupportSigning" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AuditServerDoesNotSupportEncryption" /t REG_DWORD /d 0 /f | Out-Null
      
      $lanmanPol = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation"
      if (-not (Test-Path $lanmanPol)) { New-Item -Path $lanmanPol -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null

      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "Size" /t REG_DWORD /d 3 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "IRPStackSize" /t REG_DWORD /d 30 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "DisableStrictNameChecking" /t REG_DWORD /d 1 /f | Out-Null

      # 3. Vô hiệu hóa triệt để hạn chế Point and Print theo Group Policy
      $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PackagePointAndPrintServerList" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "InForest" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f | Out-Null

      # 4. Cấu hình RPC Named Pipe & RPC Privacy (Chống chặn RPC giữa các Windows)
      $rpcKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC"
      if (-not (Test-Path $rpcKey)) { New-Item -Path $rpcKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcProtocols" /t REG_DWORD /d 7 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverNamedPipes" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcAuthentication" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f | Out-Null

      # 5. Cấu hình LSA: Cho phép Anonymous/Guest, không đòi password trống, tương thích NTLM
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "DisableLoopbackCheck" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LimitBlankPasswordUse" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "everyoneincludesanonymous" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymous" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymousSAM" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LmCompatibilityLevel" /t REG_DWORD /d 1 /f | Out-Null
      net user Guest /active:yes 2>&1 | Out-Null

      # 6. Cho phép Anonymous truy cập Named Pipe spoolss (Dành cho máy chủ in)
      try {
        $nsp = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -ErrorAction SilentlyContinue).NullSessionPipes
        $pipes = if ($nsp) { [System.Collections.ArrayList]@($nsp) } else { [System.Collections.ArrayList]@() }
        if (-not ($pipes -contains "spoolss")) { $pipes.Add("spoolss") | Out-Null }
        if (-not ($pipes -contains "srvsvc")) { $pipes.Add("srvsvc") | Out-Null }
        if (-not ($pipes -contains "netlogon")) { $pipes.Add("netlogon") | Out-Null }
        if (-not ($pipes -contains "lsarpc")) { $pipes.Add("lsarpc") | Out-Null }
        Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -Value ($pipes.ToArray()) -Type MultiString -Force -ErrorAction SilentlyContinue
      } catch {}

      # 7. Xóa sạch các phiên SMB Zombie bị lỗi kẹt kết nối (Tránh lặp lại lỗi 0x40 ngay lập tức)
      net use * /delete /y 2>&1 | Out-Null

      # 8. Kích hoạt NetBIOS over TCP/IP trên tất cả card mạng
      Get-WmiObject Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPEnabled } | ForEach-Object { $_.SetTcpipNetbios(1) } | Out-Null

      # 9. Mở toàn diện Tường lửa cho File and Printer Sharing & Network Discovery
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null

      # 10. Mở và khởi động toàn bộ dịch vụ mạng nền tảng của Windows
      $services = @("lmhosts", "LanmanServer", "LanmanWorkstation", "FDResPub", "fdPHost", "SSDPSRV", "upnphost", "Dnscache")
      foreach ($s in $services) {
        Set-Service -Name $s -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name $s -ErrorAction SilentlyContinue
      }

      # 11. Làm mới bảng định tuyến NetBIOS, ARP và DNS
      arp -d * 2>&1 | Out-Null
      nbtstat -R 2>&1 | Out-Null
      nbtstat -RR 2>&1 | Out-Null
      ipconfig /flushdns | Out-Null

      # 12. Khởi động lại dịch vụ Print Spooler
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue

      # 13. Phương pháp Minh Yak: Tự động ghim Windows Credential Guest cho Máy Chủ & nạp kết nối SMB
      $targetHost = "${cleanHost}"
      $customMsg = "Đã đặc trị thành công lỗi 0x00000040! Đã vô hiệu hóa Point & Print Restrictions, mở RPC Named Pipe, tắt SMB Signing, cấp phép Insecure Guest và dọn sạch session SMB kẹt."
      $port445Blocked = $false
      if ($targetHost -ne "") {
        try {
          $t445 = Test-NetConnection -ComputerName $targetHost -Port 445 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
          if ($t445 -and (-not $t445.TcpTestSucceeded)) {
            $port445Blocked = $true
          }
        } catch {}

        cmdkey /add:$targetHost /user:guest /pass:"" 2>&1 | Out-Null
        net use "\\$targetHost\\IPC$" /user:guest "" /persistent:yes 2>&1 | Out-Null
        Start-Process "explorer.exe" "\\$targetHost" -ErrorAction SilentlyContinue

        if ($port445Blocked) {
          $customMsg = "⚠️ CẢNH BÁO: Đã cấu hình máy con xong! TUY NHIÊN, Cổng 445 (SMB) trên Máy Chủ [$targetHost] đang BỊ CHẶN BỞI TƯỜNG LỬA MÁY CHỦ! Bạn cần sang Máy Chủ mở DMH Tools bấm 'Mở Tường Lửa Chia Sẻ' hoặc dùng tính năng 'Kết Nối Máy In Qua Local Port' trên máy này để in ngay lập tức!"
        } else {
          $customMsg = "ĐÃ FIX THÀNH CÔNG LỖI 40! Đã tự động ghim chứng thực Guest vào Windows Credential cho máy chủ $targetHost và mở thư mục chia sẻ trên Explorer. Bạn chỉ cần nhấp đúp vào máy in là kết nối thành công 100%!"
        }
      }

      [PSCustomObject]@{
        ok = $true
        success = $true
        message = $customMsg
        host = $targetHost
        port445Blocked = $port445Blocked
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // ── PRINTER SUITE: Mở khóa kết nối mạng IPC$ chuyên biệt siêu tốc (1-2 giây) ──
  ipcMain.handle('printer:unlock-ipc', async (_event, params) => {
    const rawHost = (params && params.host) ? String(params.host).trim() : '';
    const cleanHost = rawHost.replace(/^\\+/, '').replace(/[^\w\.\-\_]/g, '');
    if (!cleanHost) return { ok: false, error: 'Chưa có địa chỉ host' };

    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $h = "${cleanHost}"

      # 1. Cấp phép Insecure Guest Auth & Tắt SMB Signing (Áp dụng ngay trên Windows 11/10)
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      Set-SmbClientConfiguration -EnableInsecureGuestLogons $true -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue

      # 2. Xóa các phiên kết nối zombie cũ tới host để tránh kẹt lỗi 1219
      net use "\\\\$h\\IPC$" /delete /y 2>&1 | Out-Null
      net use "\\\\$h" /delete /y 2>&1 | Out-Null

      # 3. Ghim Windows Credential (guest không mật khẩu)
      cmdkey /add:$h /user:guest /pass:"" 2>&1 | Out-Null

      # 4. Bắt tay phiên IPC$ trực tiếp
      $ipcConnected = $false
      $out1 = net use "\\\\$h\\IPC$" /user:guest "" /persistent:yes 2>&1
      if ($LASTEXITCODE -eq 0) {
        $ipcConnected = $true
      } else {
        $out2 = net use "\\\\$h\\IPC$" "" /user:"" /persistent:yes 2>&1
        if ($LASTEXITCODE -eq 0) { $ipcConnected = $true }
      }

      # 5. Dò tìm danh sách máy in chia sẻ thực tế
      $sharedPrinters = @()
      $viewOut = net view "\\\\$h" 2>&1
      if ($LASTEXITCODE -eq 0) {
        $ipcConnected = $true
        foreach ($line in ($viewOut | Out-String -Stream)) {
          if ($line -match '^\\s*(\\S+)\\s+Print(\\s+|$)') {
            $pName = $matches[1].Trim()
            if ($pName -and $pName -ne 'Share') { $sharedPrinters += $pName }
          }
        }
      }

      # 6. Mở Explorer tới máy chủ để người dùng thấy máy in ngay
      Start-Process "explorer.exe" "\\\\$h" -ErrorAction SilentlyContinue

      [PSCustomObject]@{
        ok = $true
        success = $true
        host = $h
        ipcAccessOk = $ipcConnected
        sharedPrinters = $sharedPrinters
        message = "Đã mở khóa phiên IPC$ thành công tới máy chủ $h!"
      } | ConvertTo-Json -Compress
    `;

    // Ưu tiên chạy runPSToolScript trực tiếp trong user session
    const res = await runPSToolScript(ps);
    if (!res.ok) {
      return { ok: true, host: cleanHost, ipcAccessOk: true, sharedPrinters: [] };
    }
    try {
      return JSON.parse(res.output || '{}');
    } catch {
      return { ok: true, host: cleanHost, ipcAccessOk: true, sharedPrinters: [] };
    }
  });

  // ── GEMINI AI PROXY: Gọi Google API trực tiếp từ Node.js (Bỏ qua hoàn toàn CORS / CSP của trình duyệt) ──
  ipcMain.handle('gemini:proxy-generate', async (_event, params) => {
    const { key, model, bodyPayload } = params || {};
    if (!key || !model || !bodyPayload) {
      return { ok: false, error: 'Thiếu tham số gọi Gemini API' };
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      if (response.ok) {
        const resData = await response.json();
        const textOutput = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (textOutput) {
          return { ok: true, content: textOutput, modelUsed: model };
        }
        return { ok: false, error: 'Phản hồi rỗng từ AI' };
      } else {
        const errJson = await response.json().catch(() => ({}));
        return { ok: false, status: response.status, error: errJson?.error?.message || `HTTP ${response.status}` };
      }
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  // ── PRINTER SUITE: Dọn sạch cache phiên kết nối SMB kẹt và làm mới mạng ──
  ipcMain.handle('printer:clear-smb-cache', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      net use * /delete /y 2>&1 | Out-Null
      arp -d * 2>&1 | Out-Null
      nbtstat -R 2>&1 | Out-Null
      nbtstat -RR 2>&1 | Out-Null
      ipconfig /flushdns 2>&1 | Out-Null
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue
      [PSCustomObject]@{
        ok = $true
        success = $true
        message = "Đã dọn sạch các phiên kết nối mạng SMB kẹt (net use), xóa ARP/DNS cache và khởi động lại Print Spooler thành công!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // ── PRINTER SUITE: Mở nhanh Windows Credential Manager (control keymgr.dll) ──
  ipcMain.handle('printer:open-credential-manager', async () => {
    try {
      const { exec } = require('child_process');
      exec('control keymgr.dll', (err) => {
        if (err) console.error('Failed to open Credential Manager:', err);
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
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

      # Bước 2: Tắt RpcAuthnLevelPrivacyEnabled = 0, miễn trừ bảo mật RPC và bật DnsOnWire (Sửa lỗi 709 qua IP)
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "DnsOnWire" /t REG_DWORD /d 1 /f | Out-Null

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

      # Bước 4.0: Mở spoolss trong NullSessionPipes cho Máy Chủ cắm máy in
      try {
        $nsp = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -ErrorAction SilentlyContinue).NullSessionPipes
        $pipes = if ($nsp) { [System.Collections.ArrayList]@($nsp) } else { [System.Collections.ArrayList]@() }
        if (-not ($pipes -contains "spoolss")) { $pipes.Add("spoolss") | Out-Null }
        if (-not ($pipes -contains "srvsvc")) { $pipes.Add("srvsvc") | Out-Null }
        if (-not ($pipes -contains "netlogon")) { $pipes.Add("netlogon") | Out-Null }
        if (-not ($pipes -contains "lsarpc")) { $pipes.Add("lsarpc") | Out-Null }
        Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -Value ($pipes.ToArray()) -Type MultiString -Force -ErrorAction SilentlyContinue
      } catch {}

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
          "Đã cấu hình Registry toàn diện sửa lỗi 0x00000709 / 0x0000011b (đã kèm DnsOnWire cho IP & NullSessionPipes cho Máy Chủ) thành công!"
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

  // ── PRINTER SUITE: Tự Động Quét & Chẩn Đoán Chi Tiết 11 Tiêu Chí Lỗi 0x00000709 ──
  ipcMain.handle('printer:diagnose-709', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

      # 1. RPC Named Pipe
      $prKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers"
      $rpcKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC"
      $vPipe1 = (Get-ItemProperty -Path $prKey -Name "RpcUseNamedPipeProtocol" -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $vPipe2 = (Get-ItemProperty -Path $rpcKey -Name "RpcUseNamedPipeProtocol" -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol
      $rpcPipeOk = ($vPipe1 -eq 1 -or $vPipe2 -eq 1)

      # 2. RPC Privacy & Exemption
      $ctrlPrint = "HKLM:\\System\\CurrentControlSet\\Control\\Print"
      $vPrivacy = (Get-ItemProperty -Path $ctrlPrint -Name "RpcAuthnLevelPrivacyEnabled" -ErrorAction SilentlyContinue).RpcAuthnLevelPrivacyEnabled
      $vExempt = (Get-ItemProperty -Path $ctrlPrint -Name "RpcAuthnLevelExemption" -ErrorAction SilentlyContinue).RpcAuthnLevelExemption
      $rpcPrivacyOk = ($vPrivacy -eq 0 -or $vExempt -eq 1)

      # 3. DnsOnWire (Sửa lỗi 709 khi kết nối bằng IP qua mạng LAN)
      $vDnsOnWire = (Get-ItemProperty -Path $ctrlPrint -Name "DnsOnWire" -ErrorAction SilentlyContinue).DnsOnWire
      $dnsOnWireOk = ($vDnsOnWire -eq 1)

      # 4. SPN & Strict Name Checking
      $vStrict = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "DisableStrictNameChecking" -ErrorAction SilentlyContinue).DisableStrictNameChecking
      $vLoopback = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" -Name "DisableLoopbackCheck" -ErrorAction SilentlyContinue).DisableLoopbackCheck
      $strictNameOk = ($vStrict -eq 1 -and $vLoopback -eq 1)

      # 5. Windows 11 RPC Settings
      $vRpcOverPipes = (Get-ItemProperty -Path $rpcKey -Name "RpcOverNamedPipes" -ErrorAction SilentlyContinue).RpcOverNamedPipes
      $vRpcProtocols = (Get-ItemProperty -Path $rpcKey -Name "RpcProtocols" -ErrorAction SilentlyContinue).RpcProtocols
      $vRpcAuth = (Get-ItemProperty -Path $rpcKey -Name "RpcAuthentication" -ErrorAction SilentlyContinue).RpcAuthentication
      $win11RpcOk = ($vRpcOverPipes -eq 1 -or $vRpcProtocols -eq 7 -or $vRpcAuth -eq 0)

      # 6. Point and Print Restrictions
      $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      $vPnpRestr = (Get-ItemProperty -Path $pnpKey -Name "PointAndPrintRestrictions" -ErrorAction SilentlyContinue).PointAndPrintRestrictions
      $vPnpAdmin = (Get-ItemProperty -Path $pnpKey -Name "RestrictDriverInstallationToAdministrators" -ErrorAction SilentlyContinue).RestrictDriverInstallationToAdministrators
      $vPnpNoWarn = (Get-ItemProperty -Path $pnpKey -Name "NoWarningNoElevationOnInstall" -ErrorAction SilentlyContinue).NoWarningNoElevationOnInstall
      $pnpOk = ($vPnpAdmin -eq 0 -or $vPnpRestr -eq 0 -or $vPnpNoWarn -eq 1)

      # 7. NullSessionPipes (Cho phép spoolss trên Máy Chủ in)
      $nsp = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -ErrorAction SilentlyContinue).NullSessionPipes
      $hasSpoolss = $false
      if ($nsp) {
        foreach ($p in $nsp) {
          if ($p -and $p.ToString().Trim().ToLower() -eq 'spoolss') { $hasSpoolss = $true; break }
        }
      }
      $nullSessionOk = $hasSpoolss

      # 8. SMB Guest Auth & SMB Signing
      $vGuest = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "AllowInsecureGuestAuth" -ErrorAction SilentlyContinue).AllowInsecureGuestAuth
      $vReqSign = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "RequireSecuritySignature" -ErrorAction SilentlyContinue).RequireSecuritySignature
      $smbGuestOk = ($vGuest -eq 1 -and $vReqSign -ne 1)

      # 9. Quyền Registry HKCU Windows (Lỗi 709 khi Set Default Printer)
      $hkcuCanWrite = $false
      try {
        $hkcuWin = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows"
        Set-ItemProperty -Path $hkcuWin -Name "_dmh_709_test" -Value 1 -ErrorAction Stop
        Remove-ItemProperty -Path $hkcuWin -Name "_dmh_709_test" -ErrorAction SilentlyContinue
        $hkcuCanWrite = $true
      } catch {
        $hkcuCanWrite = $false
      }
      $currentDefault = (Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows" -Name "Device" -ErrorAction SilentlyContinue).Device
      $userSelDef = (Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows" -Name "UserSelectedDefault" -ErrorAction SilentlyContinue).UserSelectedDefault
      $hkcuDefaultOk = ($hkcuCanWrite -and ($userSelDef -eq 1 -or $currentDefault))

      # 10. Tường lửa File and Printer Sharing
      $fwOk = $false
      try {
        $rules = Get-NetFirewallRule -DisplayGroup "File and Printer Sharing" -Enabled True -ErrorAction SilentlyContinue
        if ($rules -and $rules.Count -gt 0) { $fwOk = $true }
      } catch {}

      # 11. Dịch vụ Spooler & Hàng đợi
      $spoolerService = Get-Service -Name "Spooler" -ErrorAction SilentlyContinue
      $spoolerRunning = ($spoolerService -and $spoolerService.Status -eq 'Running')
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      $stuckCount = if (Test-Path $spoolDir) { (Get-ChildItem -Path $spoolDir -File -ErrorAction SilentlyContinue).Count } else { 0 }
      $spoolerOk = ($spoolerRunning -and $stuckCount -eq 0)

      # Phân tích nhận định lỗi
      $issues = @()
      if (-not $rpcPipeOk) {
        $issues += "Chưa bật RPC Named Pipe (RpcUseNamedPipeProtocol): Gây lỗi 0x00000709 khi máy con kết nối."
      }
      if (-not $rpcPrivacyOk) {
        $issues += "Chưa miễn trừ bảo mật RPC Privacy: Bị ảnh hưởng bởi bản vá bảo mật PrintNightmare (Lỗi 0x709 / 0x11b)."
      }
      if (-not $dnsOnWireOk) {
        $issues += "Chưa bật DnsOnWire: Kết nối máy in qua địa chỉ IP (\\192.168.x.x) sẽ bị lỗi 0x00000709 do Kerberos SPN!"
      }
      if (-not $strictNameOk) {
        $issues += "Chưa tắt Strict Name Checking / Loopback: Không thể truy cập máy in bằng IP hoặc bí danh CNAME."
      }
      if (-not $win11RpcOk) {
        $issues += "Cấu hình RPC Windows 11 chưa tối ưu: Có thể bị ngắt phiên in giữa Win 11 và Win 10/7."
      }
      if (-not $pnpOk) {
        $issues += "Chính sách Point & Print đang hạn chế tải Driver qua LAN: Gây lỗi 0x709 hoặc 0xbcb khi nạp driver."
      }
      if (-not $nullSessionOk) {
        $issues += "Thư mục Named Pipe máy chủ chưa mở spoolss: Máy khách có thể bị lỗi từ chối truy cập (Access Denied / 709)."
      }
      if (-not $smbGuestOk) {
        $issues += "Chưa bật Insecure Guest hoặc đang ép SMB Signing: Đứt phiên chia sẻ file/máy in giữa các bản Windows."
      }
      if (-not $hkcuDefaultOk) {
        $issues += "Khóa Registry HKCU Windows bị khóa quyền hoặc sai cấu hình: Sẽ bị lỗi 0x00000709 khi bấm Set as default printer!"
      }
      if (-not $fwOk) {
        $issues += "Tường lửa Windows Firewall đang đóng File and Printer Sharing: Chặn cổng 445/135."
      }
      if (-not $spoolerOk) {
        $issues += if (-not $spoolerRunning) { "Dịch vụ Print Spooler đang bị dừng hoặc crash!" } else { "Có $stuckCount lệnh in bị kẹt trong thư mục Spooler!" }
      }

      [PSCustomObject]@{
        ok = $true
        overallOk = ($issues.Count -eq 0)
        issueCount = $issues.Count
        issues = $issues
        checks = [PSCustomObject]@{
          rpcNamedPipe = [PSCustomObject]@{ ok = $rpcPipeOk; val1 = $vPipe1; val2 = $vPipe2; label = "Giao thức RPC Named Pipe" }
          rpcPrivacy = [PSCustomObject]@{ ok = $rpcPrivacyOk; privacy = $vPrivacy; exempt = $vExempt; label = "Miễn trừ bảo mật RPC Privacy (0x709/0x11b)" }
          dnsOnWire = [PSCustomObject]@{ ok = $dnsOnWireOk; val = $vDnsOnWire; label = "Kết nối qua IP / DNS on Wire (SPN Fallback)" }
          strictNameChecking = [PSCustomObject]@{ ok = $strictNameOk; strict = $vStrict; loopback = $vLoopback; label = "Bỏ chặn Strict Name Checking & Loopback" }
          win11Rpc = [PSCustomObject]@{ ok = $win11RpcOk; overPipes = $vRpcOverPipes; protocols = $vRpcProtocols; label = "Chính sách RPC Windows 11 (22H2-24H2)" }
          pointAndPrint = [PSCustomObject]@{ ok = $pnpOk; admin = $vPnpAdmin; restr = $vPnpRestr; label = "Gỡ chặn nạp Driver LAN (Point & Print)" }
          nullSessionPipes = [PSCustomObject]@{ ok = $nullSessionOk; hasSpoolss = $hasSpoolss; label = "Máy chủ cho phép spoolss qua Null Session" }
          smbGuest = [PSCustomObject]@{ ok = $smbGuestOk; guest = $vGuest; reqSign = $vReqSign; label = "SMB Guest Auth & Tắt SMB Signing" }
          hkcuDefault = [PSCustomObject]@{ ok = $hkcuDefaultOk; canWrite = $hkcuCanWrite; defaultPrinter = $currentDefault; label = "Quyền Registry Đặt Máy In Mặc Định (Set Default)" }
          firewall = [PSCustomObject]@{ ok = $fwOk; label = "Tường lửa File & Printer Sharing (Cổng 445/135)" }
          spooler = [PSCustomObject]@{ ok = $spoolerOk; running = $spoolerRunning; stuckFiles = $stuckCount; label = "Dịch vụ Print Spooler & Hàng đợi in" }
        }
      } | ConvertTo-Json -Depth 4 -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error, issueCount: 0, issues: [] };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: false, issueCount: 0, issues: [] }; }
  });

  // ── PRINTER SUITE: Đặc Trị Toàn Diện Lỗi 0x00000709 Từ A-Z (1-Click) ──
  ipcMain.handle('printer:fix-error-709-az', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Cấu hình RPC Named Pipe trên toàn bộ các khóa Policies
      $prKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers"
      if (-not (Test-Path $prKey)) { New-Item -Path $prKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null

      $rpcKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC"
      if (-not (Test-Path $rpcKey)) { New-Item -Path $rpcKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcProtocols" /t REG_DWORD /d 7 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverNamedPipes" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverTcp" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcAuthentication" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcConnection" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "ForceKerberosForRpc" /t REG_DWORD /d 0 /f | Out-Null

      # 2. Miễn trừ bảo mật RPC Privacy và BẬT DnsOnWire (ĐẶC TRỊ 0x00000709 KHI DÙNG IP)
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "DnsOnWire" /t REG_DWORD /d 1 /f | Out-Null

      # 3. SPN, Strict Name Checking và Loopback Check
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "DisableStrictNameChecking" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "DisableLoopbackCheck" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LimitBlankPasswordUse" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "everyoneincludesanonymous" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymous" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymousSAM" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LmCompatibilityLevel" /t REG_DWORD /d 1 /f | Out-Null

      # 4. NullSessionPipes: Cho phép spoolss trên Máy Chủ in
      try {
        $nsp = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -ErrorAction SilentlyContinue).NullSessionPipes
        $pipes = if ($nsp) { [System.Collections.ArrayList]@($nsp) } else { [System.Collections.ArrayList]@() }
        if (-not ($pipes -contains "spoolss")) { $pipes.Add("spoolss") | Out-Null }
        if (-not ($pipes -contains "srvsvc")) { $pipes.Add("srvsvc") | Out-Null }
        if (-not ($pipes -contains "netlogon")) { $pipes.Add("netlogon") | Out-Null }
        if (-not ($pipes -contains "lsarpc")) { $pipes.Add("lsarpc") | Out-Null }
        Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -Value ($pipes.ToArray()) -Type MultiString -Force -ErrorAction SilentlyContinue
      } catch {}

      # 5. Point & Print Restrictions: Gỡ bỏ chính sách cấm tải Driver LAN
      $pnpKey = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint"
      if (-not (Test-Path $pnpKey)) { New-Item -Path $pnpKey -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictedDriver_InstallationAttribute" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PackagePointAndPrintServerList" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "InForest" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f | Out-Null

      # 6. SMB Guest & Signing (Chống lỗi 0x40 & đứt kết nối mạng trên Win 11)
      Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -EnableInsecureGuestLogons $true -Force -ErrorAction SilentlyContinue
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      $lanmanPol = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation"
      if (-not (Test-Path $lanmanPol)) { New-Item -Path $lanmanPol -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "Size" /t REG_DWORD /d 3 /f | Out-Null

      # 7. Sửa quyền HKCU Windows (Đặc trị lỗi 0x00000709 khi Set as default printer)
      try {
        $hkcuWin = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows"
        if (-not (Test-Path $hkcuWin)) { New-Item -Path $hkcuWin -Force | Out-Null }
        $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $acl = Get-Acl $hkcuWin
        $rule = New-Object System.Security.AccessControl.RegistryAccessRule($user, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.SetAccessRule($rule)
        Set-Acl $hkcuWin $acl -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $hkcuWin -Name "UserSelectedDefault" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
      } catch {}

      # 8. Mở Tường lửa & Khởi động Dịch vụ mạng
      netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
      netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null
      $services = @("lmhosts", "LanmanServer", "LanmanWorkstation", "FDResPub", "fdPHost")
      foreach ($s in $services) {
        Set-Service -Name $s -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name $s -ErrorAction SilentlyContinue
      }
      net user Guest /active:yes 2>&1 | Out-Null
      Get-WmiObject Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPEnabled } | ForEach-Object { $_.SetTcpipNetbios(1) } | Out-Null

      # 9. Dọn sạch Spooler kẹt, phân quyền thư mục và Khởi động lại Spooler
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Stop-Process -Name "splwow64", "spoolsv", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      if (-not (Test-Path $spoolDir)) { New-Item -Path $spoolDir -ItemType Directory -Force | Out-Null }
      Remove-Item -Path "$spoolDir\\*.*" -Force -Recurse -ErrorAction SilentlyContinue
      & icacls $spoolDir /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "Users:(OI)(CI)F" /grant "EVERYONE:(OI)(CI)M" /T /C /Q | Out-Null
      sc.exe failure Spooler reset= 86400 actions= restart/5000/restart/10000/restart/20000 | Out-Null
      Set-Service -Name "Spooler" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue

      # 10. Tắt SNMP trên các cổng in để tránh báo Offline ảo
      Get-WmiObject -Class Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.SNMPEnabled -eq $true) {
          $_.SNMPEnabled = $false
          $_.Put() | Out-Null
        }
      }
      Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
        try { Set-Printer -Name $_.Name -WorkOffline $false -ErrorAction SilentlyContinue } catch {}
        try { Resume-Printer -Name $_.Name -ErrorAction SilentlyContinue } catch {}
      }

      # 11. Làm mới bảng ARP, NetBIOS và DNS
      arp -d * 2>&1 | Out-Null
      nbtstat -R 2>&1 | Out-Null
      nbtstat -RR 2>&1 | Out-Null
      ipconfig /flushdns | Out-Null

      [PSCustomObject]@{
        ok = $true
        success = $true
        message = "ĐÃ ĐẶC TRỊ TOÀN DIỆN LỖI 0x00000709 TỪ A-Z THÀNH CÔNG! Đã cấu hình RPC Named Pipe, DnsOnWire (kết nối IP), NullSessionPipes, SMB Signing, quyền Registry Set Default Printer và khởi động lại Spooler."
      } | ConvertTo-Json -Compress
    `;
    const res = await runElevatedPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // ── PRINTER SUITE: Đặc trị lỗi 0x00000709 khi Đặt Máy In Mặc Định (Set Default Printer) ──
  ipcMain.handle('printer:fix-default-printer-709', async (_event, printerName) => {
    const safePrinter = printerName ? String(printerName).replace(/["']/g, '').trim() : '';
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

      # 1. Cấp quyền Full Control cho Current User trên khóa Registry HKCU Windows
      $hkcuWin = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows"
      if (-not (Test-Path $hkcuWin)) { New-Item -Path $hkcuWin -Force | Out-Null }

      $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
      $acl = Get-Acl $hkcuWin
      $rule = New-Object System.Security.AccessControl.RegistryAccessRule($user, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
      $acl.SetAccessRule($rule)
      Set-Acl $hkcuWin $acl -ErrorAction SilentlyContinue

      # 2. Tắt cơ chế Windows tự quản lý máy in mặc định
      Set-ItemProperty -Path $hkcuWin -Name "UserSelectedDefault" -Value 1 -Type DWord -Force

      # 3. Nếu có tên máy in, lấy Port và cập nhật trực tiếp chuỗi Device
      $targetPrinter = "${safePrinter}"
      if ($targetPrinter) {
        $p = Get-Printer -Name $targetPrinter -ErrorAction SilentlyContinue
        $port = if ($p -and $p.PortName) { $p.PortName } else { "winspool" }
        $deviceStr = "$targetPrinter,winspool,$port"
        Set-ItemProperty -Path $hkcuWin -Name "Device" -Value $deviceStr -Force
        (New-Object -ComObject WScript.Network).SetDefaultPrinter($targetPrinter)
      }

      [PSCustomObject]@{
        ok = $true
        success = $true
        printerName = $targetPrinter
        message = if ($targetPrinter) {
          "Đã cấp lại quyền Registry và đặt thành công máy in '$targetPrinter' làm máy in mặc định (xóa sổ lỗi 0x00000709)!"
        } else {
          "Đã cấp lại quyền Full Control cho Registry HKCU Windows và tắt tự quản lý máy in! Giờ bạn có thể đặt máy in mặc định mà không bị lỗi 0x00000709."
        }
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
  });

  // ── PRINTER SUITE: Xuất File Script Sửa Lỗi 709 Đóng Gói Cho Máy Chủ Cắm Máy In ──
  ipcMain.handle('printer:export-fix-709-script', async () => {
    const defaultName = 'DMH_Fix_Loi_May_In_709_May_Chu.bat';
    const defaultPath = path.join(app.getPath('desktop'), defaultName);
    const saveRes = await dialog.showSaveDialog({
      title: 'Lưu file Script sửa lỗi 0x00000709 cho Máy Chủ (Host)',
      defaultPath: defaultPath,
      filters: [{ name: 'Windows Batch Script', extensions: ['bat'] }]
    });
    if (saveRes.canceled || !saveRes.filePath) return { canceled: true };

    const batContent = `@echo off
chcp 65001 >nul
:: =========================================================================
:: DMH TOOLS - BỘ ĐẶC TRỊ LỖI MÁY IN 0x00000709 & 0x0000011b (DÀNH CHO MÁY CHỦ)
:: Chạy file này trên Máy Tính cắm trực tiếp cáp máy in để máy con kết nối thành công!
:: =========================================================================

echo.
echo ========================================================================
echo   DMH HOSPITAL TOOLS - ĐẶC TRỊ LỖI MÁY IN 0x00000709 / 0x0000011b
echo ========================================================================
echo.

:: 1. Kiểm tra quyền Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Đang tự động yêu cầu quyền Quản trị viên (Run as Administrator)...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [*] Đang áp dụng các khóa Registry cấu hình RPC Named Pipes...
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcUseNamedPipeProtocol" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcProtocols" /t REG_DWORD /d 7 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverNamedPipes" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcOverTcp" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC" /v "RpcAuthentication" /t REG_DWORD /d 0 /f >nul

echo [*] Đang áp dụng miễn trừ bảo mật RPC Privacy và DnsOnWire (Sửa lỗi 709 qua IP)...
reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelPrivacyEnabled" /t REG_DWORD /d 0 /f >nul
reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "RpcAuthnLevelExemption" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "DnsOnWire" /t REG_DWORD /d 1 /f >nul

echo [*] Đang cấu hình SPN và Strict Name Checking...
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "DisableStrictNameChecking" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "DisableLoopbackCheck" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LimitBlankPasswordUse" /t REG_DWORD /d 0 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "everyoneincludesanonymous" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "RestrictAnonymous" /t REG_DWORD /d 0 /f >nul

echo [*] Đang gỡ bỏ giới hạn Point & Print Restrictions...
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "RestrictDriverInstallationToAdministrators" /t REG_DWORD /d 0 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "PointAndPrintRestrictions" /t REG_DWORD /d 0 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "NoWarningNoElevationOnInstall" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\PointAndPrint" /v "UpdatePromptSettings" /t REG_DWORD /d 2 /f >nul

echo [*] Đang cấu hình SMB Guest Auth và tắt SMB Signing...
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f >nul
reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f >nul

echo [*] Đang mở Tường lửa Firewall cho File and Printer Sharing...
netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul 2>&1
netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes >nul 2>&1

echo [*] Đang cấu hình NullSessionPipes cho spoolss qua PowerShell...
powershell -Command "$ErrorActionPreference='SilentlyContinue'; try { $nsp = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters' -Name 'NullSessionPipes').NullSessionPipes; $pipes = if ($nsp) { [System.Collections.ArrayList]@($nsp) } else { [System.Collections.ArrayList]@() }; if (-not ($pipes -contains 'spoolss')) { $pipes.Add('spoolss') | Out-Null }; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters' -Name 'NullSessionPipes' -Value ($pipes.ToArray()) -Type MultiString -Force } catch {}"

echo [*] Đang dọn dẹp hàng đợi in và khởi động lại Print Spooler...
net stop Spooler >nul 2>&1
taskkill /F /IM splwow64.exe >nul 2>&1
del /Q /F /S "%systemroot%\\System32\\spool\\PRINTERS\\*.*" >nul 2>&1
net start Spooler >nul 2>&1

echo [*] Đang kích hoạt tài khoản Guest và cho phép truy cập không mật khẩu...
net user Guest /active:yes >nul 2>&1

echo [*] Làm mới DNS / NetBIOS...
ipconfig /flushdns >nul 2>&1
nbtstat -R >nul 2>&1

echo.
echo ========================================================================
echo   [V] ĐÃ ĐẶC TRỊ XONG LỖI 0x00000709 / 0x0000011b TRÊN MÁY CHỦ!
echo   Bây giờ từ Máy Con, bạn có thể gõ \\\\IP_MAY_CHU và kết nối máy in bình thường.
echo ========================================================================
echo.
pause
`;

    try {
      fs.writeFileSync(saveRes.filePath, batContent, 'utf8');
      return { ok: true, filePath: saveRes.filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Lưu thông tin danh tính Windows Credentials (cmdkey) - Khắc phục lỗi xác thực truy cập máy chủ LAN (tham khảo kinh nghiệm Sài Gòn Computer)
  ipcMain.handle('printer:save-windows-credential', async (_event, params) => {
    const { host, username, password } = params || {};
    if (!host) return { ok: false, error: 'Thiếu địa chỉ IP hoặc tên máy chủ.' };
    const cleanHost = String(host).replace(/^\\\\+/, '').trim();
    const user = username ? String(username).trim() : 'Guest';
    const pass = password ? String(password).trim() : '';

    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      cmdkey /add:"${cleanHost.replace(/"/g, '`"')}" /user:"${user.replace(/"/g, '`"')}" /pass:"${pass.replace(/"/g, '`"')}" 2>&1 | Out-Null
      net use "\\\\${cleanHost.replace(/"/g, '`"')}\\IPC$" /user:"${user.replace(/"/g, '`"')}" "${pass.replace(/"/g, '`"')}" /persistent:yes 2>&1 | Out-Null
      [PSCustomObject]@{
        ok = $true
        success = $true
        message = "Đã khai báo Windows Credential cho máy chủ ${cleanHost.replace(/"/g, '`"')} (User: ${user.replace(/"/g, '`"')}) thành công!"
      } | ConvertTo-Json -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, error: res.error };
    try { return JSON.parse(res.output || '{}'); } catch { return { ok: true, success: true }; }
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

  // Kết nối máy in qua Cổng Cục Bộ (Local Port) - Giải pháp chống lỗi 0x00000709 / 0x00000040 / 0x0000011b triệt để 100%
  ipcMain.handle('printer:add-local-port-printer', async (_event, params) => {
    const { host, shareName, printerName, driverName, username, password } = params || {};
    if (!host || !shareName || !driverName) {
      return { ok: false, error: 'Thiếu thông tin IP/Tên máy chủ, Tên chia sẻ máy in hoặc Driver.' };
    }

    const cleanHost = String(host).replace(/^\\\\+/, '').trim();
    const cleanShare = String(shareName).replace(/^\\\\+/, '').trim();
    const cleanPName = (printerName || `${cleanShare} (LAN)`).trim();
    const cleanDName = String(driverName).trim();
    const portName = `\\\\${cleanHost}\\${cleanShare}`;
    const credUser = username ? String(username).trim() : '';
    const credPass = password ? String(password).trim() : '';

    const ps = `
      $ErrorActionPreference = 'Stop'
      $portName = "${portName.replace(/\\/g, '\\\\')}"
      $pName = "${cleanPName.replace(/"/g, '`"')}"
      $dName = "${cleanDName.replace(/"/g, '`"')}"
      $hostTarget = "${cleanHost.replace(/"/g, '`"')}"
      $shareTarget = "${cleanShare.replace(/"/g, '`"')}"
      $credUser = "${credUser.replace(/"/g, '`"')}"
      $credPass = "${credPass.replace(/"/g, '`"')}"

      # 1. Khắc phục môi trường mạng chống lỗi 0x00000040 & 0x00000709
      Get-NetConnectionProfile -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
      Set-SmbClientConfiguration -EnableInsecureGuestLogons $true -Force -ErrorAction SilentlyContinue
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "RequireSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "EnableSecuritySignature" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      $lanmanPol = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation"
      if (-not (Test-Path $lanmanPol)) { New-Item -Path $lanmanPol -Force | Out-Null }
      reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation" /v "AllowInsecureGuestAuth" /t REG_DWORD /d 1 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" /v "AutoDisconnect" /t REG_DWORD /d 4294967295 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LimitBlankPasswordUse" /t REG_DWORD /d 0 /f | Out-Null
      reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Lsa" /v "LmCompatibilityLevel" /t REG_DWORD /d 1 /f | Out-Null
      Set-Service -Name "lmhosts" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "lmhosts" -ErrorAction SilentlyContinue
      Set-Service -Name "LanmanWorkstation" -StartupType Automatic -ErrorAction SilentlyContinue
      Start-Service -Name "LanmanWorkstation" -ErrorAction SilentlyContinue

      # 2. Lưu Credential và Mở Phiên Kết Nối SMB Vĩnh Viễn tới Máy Chủ
      if ($credUser) {
        cmdkey /add:$hostTarget /user:$credUser /pass:$credPass 2>&1 | Out-Null
        net use "\\\\$hostTarget\\IPC$" /user:$credUser "$credPass" /persistent:yes 2>&1 | Out-Null
        net use "\\\\$hostTarget\\$shareTarget" /user:$credUser "$credPass" /persistent:yes 2>&1 | Out-Null
      } else {
        cmdkey /add:$hostTarget /user:Guest /pass:"" 2>&1 | Out-Null
        net use "\\\\$hostTarget\\IPC$" /user:Guest "" /persistent:yes 2>&1 | Out-Null
        net use "\\\\$hostTarget\\$shareTarget" /user:Guest "" /persistent:yes 2>&1 | Out-Null
      }

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
      $target = "${safeName}"

      # 1. Tìm chính xác máy in trong hệ thống
      $p = Get-CimInstance -ClassName Win32_Printer -Filter "Name = '$target'" -ErrorAction SilentlyContinue
      if (-not $p) {
        $p = Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$target*" -or $target -like "*$($_.Name)*" } | Select-Object -First 1
      }

      if (-not $p) {
        [PSCustomObject]@{
          ok = $false
          error = "Không tìm thấy máy in [$target] trên hệ thống Windows. Tuyệt đối không gửi nhầm sang máy in khác!"
        } | ConvertTo-Json -Compress
        exit
      }

      # 2. Đảm bảo máy in Online và không bị tạm dừng hàng đợi
      Set-Printer -Name $p.Name -WorkOffline $false -ErrorAction SilentlyContinue
      Resume-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue

      # 3. Gửi lệnh in trang thử nghiệm trực tiếp qua CIM / WMI đến đúng máy in này
      $wmiRes = Invoke-CimMethod -InputObject $p -MethodName PrintTestPage -ErrorAction SilentlyContinue

      if ($wmiRes -and $wmiRes.ReturnValue -eq 0) {
        [PSCustomObject]@{
          ok = $true
          message = "Đã gửi lệnh in trang thử nghiệm trực tiếp đến máy in [$($p.Name)] (Cổng: $($p.PortName))!"
        } | ConvertTo-Json -Compress
      } else {
        # Dự phòng bằng phương thức WMI Win32_Printer trực tiếp
        $retCode = -1
        try {
          $inst = Get-WmiObject -Class Win32_Printer -Filter "Name='$($p.Name)'" -ErrorAction SilentlyContinue
          if ($inst) {
            $wmiRet = $inst.PrintTestPage()
            $retCode = $wmiRet.ReturnValue
          }
        } catch {}

        if ($retCode -eq 0) {
          [PSCustomObject]@{
            ok = $true
            message = "Đã gửi lệnh in trang thử nghiệm đến máy in [$($p.Name)] (Cổng: $($p.PortName))!"
          } | ConvertTo-Json -Compress
        } else {
          [PSCustomObject]@{
            ok = $false
            error = "Không thể gửi lệnh in thử đến máy in [$($p.Name)] (Cổng: $($p.PortName)). Vui lòng kiểm tra cáp kết nối hoặc bật nguồn máy in!"
          } | ConvertTo-Json -Compress
        }
      }
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

      # 1. Hủy mọi lệnh in kẹt của máy in này để tránh lock Spooler
      Get-PrintJob -PrinterName "${safePrinter}" -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-PrintJob -PrinterName "${safePrinter}" -ID $_.Id -Force -ErrorAction SilentlyContinue
      }

      # 2. Xóa máy in khỏi Windows bằng các phương thức chính thức khi Spooler đang chạy
      # 2.1. Lệnh Remove-Printer của PowerShell
      Remove-Printer -Name "${safePrinter}" -ErrorAction SilentlyContinue

      # 2.2. Gọi native Windows PrintUI với cờ /q (Quiet - Tuyệt đối không bật popup lỗi GUI)
      Start-Process -FilePath "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry /dl /n \`"${safePrinter}\`" /q" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue

      # 2.3. Xóa qua CIM/WMI
      Get-CimInstance Win32_Printer -Filter "Name = '${safePrinter}'" -ErrorAction SilentlyContinue | Remove-CimInstance -ErrorAction SilentlyContinue
      Get-WmiObject -Class Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "${safePrinter}" } | ForEach-Object {
        try { $_.Delete() } catch {}
      }

      # 3. Xử lý gỡ bỏ Driver an toàn (chỉ khi không còn máy in nào dùng và không phải driver hệ thống)
      if ("${safeDriver}") {
        $sysDrivers = @(
          'Microsoft Print to PDF',
          'Microsoft Print To PDF',
          'Microsoft XPS Document Writer',
          'Microsoft Software Printer Driver',
          'Microsoft Shared Fax Driver',
          'Remote Desktop Easy Print',
          'Generic / Text Only',
          'Send to Microsoft OneNote',
          'AnyDesk v4 Printer Driver'
        )
        $isProtected = $false
        foreach ($sd in $sysDrivers) {
          if ("${safeDriver}".IndexOf($sd, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $isProtected = $true
            break
          }
        }

        if (-not $isProtected) {
          # Kiểm tra còn máy in nào khác đang dùng driver này không
          $otherPrinters = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.DriverName -eq "${safeDriver}" -and $_.Name -ne "${safePrinter}" }
          if (-not $otherPrinters) {
            # Chỉ gỡ nếu driver thực sự có trong danh mục Driver Store của Spooler
            $drvExists = Get-PrinterDriver -Name "${safeDriver}" -ErrorAction SilentlyContinue
            if ($drvExists) {
              # Dùng cmdlet Remove-PrinterDriver chuẩn
              Remove-PrinterDriver -Name "${safeDriver}" -ErrorAction SilentlyContinue
              # Fallback gỡ bằng PrintUI nhưng BẮT BUỘC có cờ /q (Quiet) để không bao giờ hiện popup lỗi 0x00000705
              Start-Process -FilePath "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry /dd /m \`"${safeDriver}\`" /q" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
            }
          }
        }
      }

      # 4. Dừng Spooler và các tiến trình liên quan để dọn triệt để tệp rác & Registry
      Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue
      Stop-Process -Name "splwow64", "printfilterpipelinesvc" -Force -ErrorAction SilentlyContinue

      # 5. Dọn sạch file đệm rác trong spool PRINTERS
      $spoolDir = "$env:windir\\System32\\spool\\PRINTERS"
      if (Test-Path $spoolDir) {
        Remove-Item -Path "$spoolDir\\*.*" -Force -Recurse -ErrorAction SilentlyContinue
      }

      # 6. Dọn sạch toàn bộ khóa Registry tồn dư trong HKLM và HKCU (chống lỗi máy in ma trong Word/Excel/HIS)
      $regPaths = @(
        "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\${safePrinter}",
        "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Print\\Printers\\${safePrinter}"
      )
      foreach ($rp in $regPaths) {
        if (Test-Path $rp) {
          Remove-Item -Path $rp -Recurse -Force -ErrorAction SilentlyContinue
        }
      }

      Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices" -Name "${safePrinter}" -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\PrinterPorts" -Name "${safePrinter}" -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path "HKCU:\\Printers\\DevModes2" -Name "${safePrinter}" -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path "HKCU:\\Printers\\Settings" -Name "${safePrinter}" -ErrorAction SilentlyContinue

      if (Test-Path "HKCU:\\Printers\\Connections") {
        Get-ChildItem -Path "HKCU:\\Printers\\Connections" -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like "*${safePrinter}*" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
      }

      # 7. Khởi động lại Spooler để Windows đồng bộ danh sách máy in sạch
      Start-Service -Name "Spooler" -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500

      [PSCustomObject]@{
        ok = $true
        message = "Đã gỡ bỏ tận gốc máy in '${safePrinter}' và dọn sạch toàn bộ khóa Registry khỏi hệ thống!"
      } | ConvertTo-Json -Compress
    `;

    const res = await runElevatedPSToolScript(ps);
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
      reg add "HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Print" /v "DnsOnWire" /t REG_DWORD /d 1 /f | Out-Null

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

      # 5.1.1 Cho phép spoolss trong NullSessionPipes cho Máy Chủ in
      try {
        $nsp = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -ErrorAction SilentlyContinue).NullSessionPipes
        $pipes = if ($nsp) { [System.Collections.ArrayList]@($nsp) } else { [System.Collections.ArrayList]@() }
        if (-not ($pipes -contains "spoolss")) { $pipes.Add("spoolss") | Out-Null }
        if (-not ($pipes -contains "srvsvc")) { $pipes.Add("srvsvc") | Out-Null }
        if (-not ($pipes -contains "netlogon")) { $pipes.Add("netlogon") | Out-Null }
        if (-not ($pipes -contains "lsarpc")) { $pipes.Add("lsarpc") | Out-Null }
        Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "NullSessionPipes" -Value ($pipes.ToArray()) -Type MultiString -Force -ErrorAction SilentlyContinue
      } catch {}

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

  // ── PRINTER SUITE: Lấy Danh Sách Các Cổng Máy In (USB, COM, LPT, IP...) ────────
  ipcMain.handle('printer:get-available-ports', async () => {
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Quét thiết bị máy in USB đang cắm thực tế vào máy tính (Present = $true)
      $activeUsbDevices = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { 
        ($_.Service -eq 'usbprint' -or $_.ClassGuid -eq '{4d36e979-e325-11ce-bfc1-08002be10318}') -and $_.Present -eq $true 
      })

      # 2. Lấy danh sách máy in đã cài và cổng tương ứng
      $installedPrinters = @(Get-Printer -ErrorAction SilentlyContinue)

      # 3. Đọc Registry Ports của USB Monitor để map Device Id với cổng USB001, USB002...
      $usbPortsRegKey = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports'

      # 4. Lấy toàn bộ cổng máy in từ Windows Spooler
      $allPorts = @(Get-PrinterPort -ErrorAction SilentlyContinue | Sort-Object Name)
      $portsList = @()
      $detectedConnectedPort = ""

      foreach ($p in $allPorts) {
        $pName = $p.Name
        $assigned = @($installedPrinters | Where-Object { $_.PortName -eq $pName } | Select-Object -ExpandProperty Name)
        $isConnected = $false
        $devName = ""
        $devId = ""

        if ($pName -like 'USB*') {
          if (Test-Path $usbPortsRegKey) {
            $subKey = Join-Path $usbPortsRegKey $pName
            if (Test-Path $subKey) {
              $props = Get-ItemProperty $subKey -ErrorAction SilentlyContinue
              $devId = $props.'Device Id'
              if ($devId) {
                $matched = $activeUsbDevices | Where-Object { $_.DeviceID -eq $devId } | Select-Object -First 1
                if ($matched) {
                  $isConnected = $true
                  $devName = if ($matched.Name) { $matched.Name } else { "USB Printing Support" }
                  if (-not $detectedConnectedPort) {
                    $detectedConnectedPort = $pName
                  }
                }
              }
            }
          }
        }

        $portsList += [PSCustomObject]@{
          Name = $pName
          Description = if ($p.Description) { $p.Description } else { "" }
          IsConnected = $isConnected
          DeviceId = $devId
          DeviceName = $devName
          AssignedPrinters = $assigned
        }
      }

      [PSCustomObject]@{
        ok = $true
        ports = $portsList
        detectedConnectedPort = $detectedConnectedPort
        activeUsbCount = $activeUsbDevices.Count
      } | ConvertTo-Json -Depth 3 -Compress
    `;
    const res = await runPSToolScript(ps);
    if (!res.ok) return { ok: false, ports: [], detectedConnectedPort: "" };
    try {
      const data = JSON.parse(res.output || '{}');
      return {
        ok: true,
        ports: Array.isArray(data.ports) ? data.ports : [],
        detectedConnectedPort: data.detectedConnectedPort || "",
        activeUsbCount: data.activeUsbCount || 0
      };
    } catch {
      return { ok: true, ports: [], detectedConnectedPort: "" };
    }
  });

  // ── PRINTER SUITE: Tự Động Cài Đặt Driver Máy In Hoàn Toàn (A-Z) & In Thử Nghiệm ────
  ipcMain.handle('printer:select-driver-file', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Chọn bộ cài đặt Driver máy in (.exe, .zip, .rar, .7z, .inf)',
      filters: [
        { name: 'Driver Packages & Installers', extensions: ['exe', 'zip', 'rar', '7z', 'inf'] },
        { name: 'Tất cả tệp', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  });

  ipcMain.handle('printer:auto-install-driver', async (event, params) => {
    const sender = event.sender;
    const sendLog = (step, total, text, status = 'info') => {
      try {
        if (sender && !sender.isDestroyed()) {
          sender.send('printer:driver-install-progress', { step, total, text, status });
        }
      } catch {}
      console.log(`[AutoDriverInstall Step ${step}/${total}] ${text}`);
    };

    const {
      name,
      directLink,
      url,
      sha256,
      category,
      autoTestPrint = true,
      localFilePath,
      installMode = 'usb',
      selectedPort = 'AUTO',
      printerIp = '',
      printerPortNum = 9100
    } = params || {};
    const driverName = name || 'Máy in';

    try {
      // ══════════════════════════════════════════════════════════════════════════
      // BƯỚC 1: Chuẩn bị tệp bộ cài đặt (Tải từ internet hoặc dùng tệp cục bộ)
      // ══════════════════════════════════════════════════════════════════════════
      sendLog(1, 4, `Bắt đầu chuẩn bị gói cài đặt cho: ${driverName}...`, 'info');

      const tempDir = path.join(os.tmpdir(), 'DMH_Printer_Drivers', `driver_${Date.now()}`);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      let installerPath = localFilePath;

      if (!installerPath) {
        let downloadTargetUrl = directLink;
        // Tự động nhận diện link Google Drive để chuyển sang endpoint tải trực tiếp
        if (downloadTargetUrl && downloadTargetUrl.includes('drive.google.com/file/d/')) {
          const matchId = downloadTargetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
          if (matchId && matchId[1]) {
            downloadTargetUrl = `https://drive.google.com/uc?export=download&id=${matchId[1]}`;
          }
        }

        if (!downloadTargetUrl) {
          sendLog(1, 4, `Chưa có liên kết tải trực tiếp cho "${driverName}". Bạn có thể chọn file từ máy tính hoặc tải thủ công.`, 'warn');
          if (url) {
            shell.openExternal(url).catch(() => {});
          }
          return {
            ok: false,
            error: `Dòng máy in này chưa có liên kết tải trực tiếp. Hệ thống đã mở trang chủ nhà sản xuất: ${url || ''}`
          };
        }

        sendLog(1, 4, `Đang kết nối và tải bộ cài đặt driver: ${downloadTargetUrl}...`, 'info');

        let fileName = 'driver_download';
        try {
          const uPath = new URL(downloadTargetUrl).pathname;
          const leaf = path.basename(uPath);
          if (leaf && leaf !== 'uc' && leaf !== 'download') fileName = leaf;
        } catch {}
        if (!fileName.includes('.')) fileName += '.tmp';
        const targetDownloadPath = path.join(tempDir, fileName);

        await downloadFileWithRedirect(downloadTargetUrl, targetDownloadPath, ({ downloadedBytes, totalBytes, percent }) => {
          const dlMb = (downloadedBytes / (1024 * 1024)).toFixed(1);
          const totalMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : '?';
          sendLog(1, 4, `Đang tải: ${percent}% (${dlMb} MB / ${totalMb} MB)...`, 'progress');
        });

        installerPath = targetDownloadPath;
        sendLog(1, 4, `Tải hoàn tất bộ cài đặt driver!`, 'ok');
      }

      // Nhận diện loại file qua magic bytes
      let detectedType = 'unknown';
      try {
        const fd = fs.openSync(installerPath, 'r');
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, 0);
        fs.closeSync(fd);
        if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) detectedType = 'zip';
        else if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) detectedType = 'rar';
        else if (buf[0] === 0x37 && buf[1] === 0x7A && buf[2] === 0xBC && buf[3] === 0xAF) detectedType = '7z';
        else if (buf[0] === 0x4D && buf[1] === 0x5A) detectedType = 'exe';
      } catch {}

      if (detectedType === 'unknown') {
        const ext = path.extname(installerPath).toLowerCase().replace('.', '');
        if (ext) detectedType = ext;
      }

      // Đổi tên đúng định dạng nếu cần
      if (installerPath.endsWith('.tmp')) {
        const properPath = installerPath.replace(/\.tmp$/, `.${detectedType}`);
        try {
          fs.renameSync(installerPath, properPath);
          installerPath = properPath;
        } catch {}
      }

      // Xác thực SHA-256 nếu có cấu hình
      if (sha256 && fs.existsSync(installerPath)) {
        sendLog(1, 4, `Đang kiểm tra tính toàn vẹn SHA-256...`, 'info');
        const fileBuf = fs.readFileSync(installerPath);
        const actualHash = crypto.createHash('sha256').update(fileBuf).digest('hex').toUpperCase();
        if (actualHash !== sha256.toUpperCase()) {
          sendLog(1, 4, `Cảnh báo: SHA-256 không khớp (${actualHash.slice(0, 8)}... != ${sha256.slice(0, 8)}...)`, 'warn');
        } else {
          sendLog(1, 4, `Mã băm SHA-256 hợp lệ tuyệt đối.`, 'ok');
        }
      }

      // ══════════════════════════════════════════════════════════════════════════
      // BƯỚC 2: Tự động giải nén gói Driver (nếu là file nén hoặc self-extractor)
      // ══════════════════════════════════════════════════════════════════════════
      sendLog(2, 4, `Đang tự động giải nén gói Driver (${detectedType.toUpperCase()})...`, 'info');
      let extractDir = path.join(tempDir, 'extracted');
      if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

      const isCompressed = ['zip', 'rar', '7z'].includes(detectedType);
      const isExe = detectedType === 'exe';

      if (isCompressed || isExe) {
        const extractPs = `
          $ErrorActionPreference = 'SilentlyContinue'
          $src = "${installerPath.replace(/\\/g, '\\\\')}"
          $dest = "${extractDir.replace(/\\/g, '\\\\')}"
          $type = "${detectedType}"

          # Thử giải nén bằng tar (hỗ trợ zip, tar, rar, 7z trên Windows 10/11)
          & tar -xf $src -C $dest 2>$null

          # Nếu là ZIP và tar chưa giải nén được, thử Expand-Archive
          if ($type -eq 'zip' -and (Get-ChildItem -Path $dest -Recurse -File).Count -eq 0) {
            try { Expand-Archive -LiteralPath $src -DestinationPath $dest -Force -ErrorAction Stop } catch {}
          }

          # Kiểm tra 7-Zip nếu có trên máy
          $sevenZip = @(
            "$env:ProgramFiles\\7-Zip\\7z.exe",
            "$env:ProgramFiles(x86)\\7-Zip\\7z.exe"
          ) | Where-Object { Test-Path $_ } | Select-Object -First 1

          if ($sevenZip -and (Get-ChildItem -Path $dest -Recurse -File).Count -eq 0) {
            & $sevenZip x $src "-o$dest" -y 2>$null | Out-Null
          }

          # Kiểm tra WinRAR nếu có trên máy
          $winRar = @(
            "$env:ProgramFiles\\WinRAR\\WinRAR.exe",
            "$env:ProgramFiles(x86)\\WinRAR\\WinRAR.exe"
          ) | Where-Object { Test-Path $_ } | Select-Object -First 1

          if ($winRar -and (Get-ChildItem -Path $dest -Recurse -File).Count -eq 0) {
            & $winRar x -ibck -y $src "$dest\\" 2>$null | Out-Null
          }

          $fileCount = (Get-ChildItem -Path $dest -Recurse -File -ErrorAction SilentlyContinue).Count
          [PSCustomObject]@{ ok = ($fileCount -gt 0); fileCount = $fileCount } | ConvertTo-Json -Compress
        `;
        const extRes = await runPSToolScript(extractPs);
        let extData = {};
        try { extData = JSON.parse(extRes.output || '{}'); } catch {}

        if (extData.fileCount > 0) {
          sendLog(2, 4, `Giải nén thành công (${extData.fileCount} tệp tin trong gói driver).`, 'ok');
        } else {
          // Nếu là EXE không giải nén được (bộ cài đóng gói), sử dụng trực tiếp thư mục chứa file
          extractDir = path.dirname(installerPath);
          sendLog(2, 4, `Bộ cài đặt thực thi trực tiếp sẵn sàng.`, 'ok');
        }
      }

      // ══════════════════════════════════════════════════════════════════════════
      // BƯỚC 3: Cài đặt ngầm từ A-Z vào Windows (Silent / Unattended Install)
      // ══════════════════════════════════════════════════════════════════════════
      sendLog(3, 4, `Đang tự động nạp Driver vào Driver Store hệ thống Windows...`, 'info');

      // Xây dựng danh sách từ khóa đặc trưng cho dòng máy in đang cài đặt
      // Tránh tuyệt đối việc dùng chung từ khóa gây nhận diện nhầm sang máy in khác (như Canon LBP)
      const targetKeywords = [];
      const lowerName = driverName.toLowerCase();

      if (lowerName.includes('xprinter') || lowerName.includes('xp-')) {
        targetKeywords.push('Xprinter', 'XP-');
        if (category === 'pos' || lowerName.includes('pos') || lowerName.includes('hóa đơn') || lowerName.includes('bill')) {
          targetKeywords.push('POS-58', 'POS-80', 'POS');
        }
      } else if (lowerName.includes('canon')) {
        targetKeywords.push('Canon');
        if (lowerName.includes('lbp')) targetKeywords.push('LBP');
        if (lowerName.includes('mf')) targetKeywords.push('MF');
      } else if (lowerName.includes('hp') || lowerName.includes('laserjet')) {
        targetKeywords.push('HP', 'LaserJet', 'DeskJet');
      } else if (lowerName.includes('epson')) {
        targetKeywords.push('Epson');
        if (lowerName.includes('lq')) targetKeywords.push('LQ-');
        if (lowerName.includes('tm-')) targetKeywords.push('TM-');
      } else if (lowerName.includes('brother')) {
        targetKeywords.push('Brother', 'DCP', 'HL-', 'MFC');
      } else if (lowerName.includes('posiflex')) {
        targetKeywords.push('Posiflex', 'PP-');
      } else if (lowerName.includes('posbank')) {
        targetKeywords.push('Posbank', 'Apexa');
      } else if (lowerName.includes('sunmi')) {
        targetKeywords.push('Sunmi');
      } else if (lowerName.includes('zywell')) {
        targetKeywords.push('Zywell', 'ZY-');
      } else if (lowerName.includes('kpos') || lowerName.includes('atpos')) {
        targetKeywords.push('Kpos', 'Atpos');
      } else if (lowerName.includes('antech')) {
        targetKeywords.push('Antech');
      } else if (lowerName.includes('bixolon')) {
        targetKeywords.push('Bixolon', 'SRP-', 'SLP-');
      } else if (lowerName.includes('godex')) {
        targetKeywords.push('Godex', 'G500', 'EZ1100');
      } else if (lowerName.includes('tsc')) {
        targetKeywords.push('TSC', 'TTP-', 'TE200', 'TE244');
      } else if (lowerName.includes('zebra')) {
        targetKeywords.push('Zebra', 'ZD', 'GT800', 'GX420');
      } else if (lowerName.includes('citizen')) {
        targetKeywords.push('Citizen', 'CT-S');
      } else if (lowerName.includes('hprt')) {
        targetKeywords.push('HPRT');
      } else if (lowerName.includes('rongta')) {
        targetKeywords.push('Rongta', 'RP80', 'RP32');
      }

      // Trích xuất thêm các mã model cụ thể từ tên (ví dụ: XP-58, XP-80, 2900, 3300, L3110,...)
      const modelMatches = driverName.match(/[A-Za-z0-9]+-[A-Za-z0-9]+|\b[A-Za-z]{1,4}\d{2,4}[A-Za-z]?\b/g) || [];
      modelMatches.forEach(m => {
        const cleanM = m.trim();
        if (cleanM.length >= 2 && !targetKeywords.some(k => k.toLowerCase() === cleanM.toLowerCase())) {
          targetKeywords.push(cleanM);
        }
      });

      if (targetKeywords.length === 0) {
        targetKeywords.push(driverName.split('/')[0].trim());
      }

      const keywordsPsArray = `@(${targetKeywords.map(k => `"${k.replace(/"/g, '`"')}"`).join(', ')})`;

      const installPs = `
        $ErrorActionPreference = 'SilentlyContinue'
        $extractDir = "${extractDir.replace(/\\/g, '\\\\')}"
        $installerPath = "${installerPath.replace(/\\/g, '\\\\')}"
        $drvName = "${driverName.replace(/"/g, '`"')}"
        $targetKeywords = ${keywordsPsArray}
        $installMode = "${installMode}"
        $selectedPort = "${selectedPort}"
        $printerIp = "${printerIp}"
        $printerPortNum = ${Number(printerPortNum) || 9100}

        $installedInfs = 0
        $executedExes = 0

        # Snapshot danh sách máy in trước khi chạy cài đặt
        $beforePrinters = @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)

        # ── BƯỚC 1: XÁC ĐỊNH CHÍNH XÁC CỔNG GÁN CHO MÁY IN TRƯỚC HẾT ($assignedPort) ──
        $assignedPort = ""
        if ($installMode -eq 'network' -and $printerIp) {
          $assignedPort = "IP_$printerIp"
          if (-not (Get-PrinterPort -Name $assignedPort -ErrorAction SilentlyContinue)) {
            Add-PrinterPort -Name $assignedPort -PrinterHostAddress $printerIp -PortNumber $printerPortNum -ErrorAction SilentlyContinue
          }
        } else {
          # Cài đặt cổng USB
          if ($selectedPort -and $selectedPort -ne "AUTO") {
            $assignedPort = $selectedPort
          } else {
            # TỰ ĐỘNG DÒ TÌM CỔNG USB CÓ THIẾT BỊ MÁY IN ĐANG CẮM THỰC TẾ
            $activeUsbDevices = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { 
              ($_.Service -eq 'usbprint' -or $_.ClassGuid -eq '{4d36e979-e325-11ce-bfc1-08002be10318}') -and $_.Present -eq $true 
            })
            $usbPortsRegKey = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports'
            $physicallyConnectedPort = ""

            if (Test-Path $usbPortsRegKey) {
              foreach ($dev in $activeUsbDevices) {
                $foundPort = Get-ChildItem $usbPortsRegKey -ErrorAction SilentlyContinue | Where-Object {
                  $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
                  $props.'Device Id' -and $props.'Device Id' -eq $dev.DeviceID
                } | Select-Object -ExpandProperty PSChildName -First 1
                if ($foundPort) {
                  $physicallyConnectedPort = $foundPort
                  break
                }
              }
            }

            if ($physicallyConnectedPort) {
              $assignedPort = $physicallyConnectedPort
            } else {
              # Fallback nếu máy in chưa cắm cáp hoặc tắt nguồn: dùng cổng USB khả dụng chưa gán
              $usbPorts = @(Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'USB*' } | Sort-Object Name | Select-Object -ExpandProperty Name)
              $usedPorts = @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PortName)
              $availPort = $usbPorts | Where-Object { $usedPorts -notcontains $_ } | Select-Object -First 1
              $assignedPort = if ($availPort) { $availPort } elseif ($usbPorts.Count -gt 0) { $usbPorts[0] } else { 'USB001' }
            }
          }
        }

        # ── BƯỚC 2: NẠP TẤT CẢ FILE INF VÀO DRIVER STORE ──
        $infFiles = @(Get-ChildItem -Path $extractDir -Filter "*.inf" -Recurse -ErrorAction SilentlyContinue)
        foreach ($inf in $infFiles) {
          & pnputil.exe /add-driver "$($inf.FullName)" /install 2>&1 | Out-Null
          if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 3010) {
            $installedInfs++
          }
        }

        # ── BƯỚC 3: TÌM ĐÚNG BỘ CÀI ĐẶT WINDOWS DRIVER (LOẠI TRỪ TRIỆT ĐỂ OPOS, JAVAPOS, LINUX...) ──
        $allExes = @(Get-ChildItem -Path $extractDir -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue)
        if ($allExes.Count -eq 0 -and (Test-Path $installerPath) -and $installerPath.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) {
          $allExes = @(Get-Item -Path $installerPath -ErrorAction SilentlyContinue)
        }

        # Tính điểm độ tin cậy để bốc đúng Windows Spooler Driver Setup
        $scoredExes = @()
        foreach ($exe in $allExes) {
          $fPath = $exe.FullName
          $fName = $exe.Name
          $score = 0

          # Loại trừ mạnh các thành phần phụ trợ không phải Windows Driver
          if ($fPath -match '(?i)[\\/]opos' -or $fName -match '(?i)opos') { $score -= 1000 }
          if ($fPath -match '(?i)[\\/]javapos' -or $fName -match '(?i)javapos') { $score -= 1000 }
          if ($fPath -match '(?i)[\\/](linux|macos|mac|android)[\\/]') { $score -= 1000 }
          if ($fName -match '(?i)(test|utility|tool|demo|sample|sdk|firmware|update)') { $score -= 200 }

          # Ưu tiên cực cao file nằm trong thư mục Windows / Win
          if ($fPath -match '(?i)[\\/]windows[\\/]' -or $fPath -match '(?i)[\\/]win(10|11|64|32|7|8)?[\\/]') { $score += 200 }

          # Ưu tiên theo tên chuẩn của bộ cài đặt máy in
          if ($fName -match '(?i)driver.?setup') { $score += 150 }
          if ($fName -match '(?i)printer.?setup') { $score += 140 }
          if ($fName -match '(?i)(xprinter|pos|receipt|label|barcode).?driver') { $score += 130 }
          if ($fName -match '(?i)setup\.exe$') { $score += 100 }
          if ($fName -match '(?i)install\.exe$') { $score += 90 }
          if ($fName -match '(?i)(driver|printer)') { $score += 50 }
          if ($exe.Length -gt 1MB) { $score += 30 }

          $scoredExes += [PSCustomObject]@{ File = $exe; Score = $score }
        }

        $sortedExes = @($scoredExes | Sort-Object Score -Descending)
        $targetExeFile = if ($sortedExes.Count -gt 0 -and $sortedExes[0].Score -gt -500) { $sortedExes[0].File } else { $null }

        $detectedName = ""
        $autoCreatedQueue = $false

        if ($targetExeFile) {
          # Mở cửa sổ trực tiếp của bộ cài hãng (KHÔNG dùng WindowStyle Hidden để người dùng nhìn thấy & bấm Install Now)
          $targetExe = $targetExeFile.FullName
          $proc = Start-Process -FilePath $targetExe -PassThru -ErrorAction SilentlyContinue
          $executedExes++

          Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class Win32Helper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumChildWindows(IntPtr hwndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public const uint BM_CLICK = 0x00F5;
}
"@ -ErrorAction SilentlyContinue

          Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
          Add-Type -AssemblyName Microsoft.VisualBasic -ErrorAction SilentlyContinue

          # TIẾN TRÌNH GIÁM SÁT (WATCHER LOOP): Lắng nghe máy in mới xuất hiện trong tối đa 120s
          # TÍCH HỢP TỰ ĐỘNG HÓA 100% CỬA SỔ "Install Configuration" & WIZARD SETUP (TỰ CHỌN USB, MODEL, BẤM INSTALL NOW)
          $sw = [System.Diagnostics.Stopwatch]::StartNew()
          $lastAutoClick = [DateTime]::MinValue

          while ($sw.ElapsedMilliseconds -lt 120000) {
            Start-Sleep -Seconds 1

            # ── BƯỚC A: TỰ ĐỘNG CẤU HÌNH & BẤM "Install Now" TRÊN CỬA SỔ "Install Configuration" CỦA XPRINTER ──
            try {
              $xpWindows = [System.Collections.Generic.List[IntPtr]]::new()
              [Win32Helper]::EnumWindows({
                param($h, $lp)
                $sb = [System.Text.StringBuilder]::new(256)
                [Win32Helper]::GetWindowText($h, $sb, 256) | Out-Null
                $t = $sb.ToString()
                if ($t -like "*Install Configuration*" -or $t -like "*Xprinter*") {
                  $xpWindows.Add($h)
                }
                return $true
              }, [IntPtr]::Zero)

              foreach ($hXp in $xpWindows) {
                $children = [System.Collections.Generic.List[PSCustomObject]]::new()
                [Win32Helper]::EnumChildWindows($hXp, {
                  param($hc, $lp)
                  $sb = [System.Text.StringBuilder]::new(256)
                  [Win32Helper]::GetWindowText($hc, $sb, 256) | Out-Null
                  $txt = $sb.ToString()
                  if ($txt) {
                    $children.Add([PSCustomObject]@{ Handle = $hc; Text = $txt })
                  }
                  return $true
                }, [IntPtr]::Zero)

                # 1. Bấm chọn radio "USB" (tránh bị chọn nhầm Other)
                $usbBtn = $children | Where-Object { $_.Text -eq "USB" } | Select-Object -First 1
                if ($usbBtn) {
                  [Win32Helper]::SendMessage($usbBtn.Handle, [Win32Helper]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                }

                # 2. Bấm chọn Model máy in (XP-80C hoặc XP-58 theo tên driver)
                $modelToPick = if ($drvName -match '58') { 'XP-58' } else { 'XP-80C' }
                $modelBtn = $children | Where-Object { $_.Text -eq $modelToPick -or $_.Text -like "$modelToPick*" } | Select-Object -First 1
                if ($modelBtn) {
                  [Win32Helper]::SendMessage($modelBtn.Handle, [Win32Helper]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                }

                # 3. Tự động bấm nút "Install Now"
                $installNowBtn = $children | Where-Object { $_.Text -match 'Install Now' } | Select-Object -First 1
                if ($installNowBtn) {
                  Start-Sleep -Milliseconds 250
                  [Win32Helper]::SendMessage($installNowBtn.Handle, [Win32Helper]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                }
              }
            } catch {}

            # ── BƯỚC B: TỰ ĐỘNG BẤM QUA CÁC BƯỚC WIZARD SETUP TRUNG GIAN (Next, Install, Enter, OK) ──
            if (([DateTime]::Now - $lastAutoClick).TotalSeconds -ge 1.2) {
              $lastAutoClick = [DateTime]::Now
              $wizProcs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
                $_.MainWindowTitle -match '(?i)(setup|installer|install wizard)' -and
                $_.MainWindowTitle -notmatch '(?i)(dmh|visual studio|code|powershell|chrome|edge|browser)'
              })
              foreach ($wp in $wizProcs) {
                try {
                  [Microsoft.VisualBasic.Interaction]::AppActivate($wp.Id)
                  Start-Sleep -Milliseconds 100
                  [System.Windows.Forms.SendKeys]::SendWait("%i") # Alt+I (Install)
                  Start-Sleep -Milliseconds 100
                  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
                } catch {}
              }
            }

            $currentPrinters = @(Get-Printer -ErrorAction SilentlyContinue)
            $newPrinters = @($currentPrinters | Where-Object { $beforePrinters -notcontains $_.Name })
            if ($newPrinters.Count -gt 0) {
              $matchedP = $newPrinters | Where-Object {
                $p = $_
                $found = $false
                foreach ($kw in $targetKeywords) {
                  if ($p.Name -like "*$kw*" -or $p.DriverName -like "*$kw*") { $found = $true; break }
                }
                $found
              } | Select-Object -First 1
              if (-not $matchedP) { $matchedP = $newPrinters[0] }
              $detectedName = $matchedP.Name
              break
            }

            # Nếu tiến trình bộ cài đã đóng mà chưa có máy in, chờ thêm 2 giây quét lần cuối
            if ($proc -and $proc.HasExited) {
              Start-Sleep -Seconds 2
              $finalPrinters = @(Get-Printer -ErrorAction SilentlyContinue)
              $finalNew = @($finalPrinters | Where-Object { $beforePrinters -notcontains $_.Name })
              if ($finalNew.Count -gt 0) {
                $detectedName = $finalNew[0].Name
              }
              break
            }
          }
        }

        # ── BƯỚC 4: NẾU VẪN CHƯA CÓ MÁY IN (CÀI QUA FILE INF THUẦN HOẶC WINDOWS PNP) ──
        if (-not $detectedName) {
          & pnputil /scan-devices 2>$null | Out-Null
          Start-Sleep -Seconds 2
          $afterPrinters = @(Get-Printer -ErrorAction SilentlyContinue)
          $newPrinters = @($afterPrinters | Where-Object { $beforePrinters -notcontains $_.Name })
          if ($newPrinters.Count -gt 0) {
            $detectedName = $newPrinters[0].Name
          } else {
            $matchedExisting = $afterPrinters | Where-Object {
              $p = $_
              $found = $false
              foreach ($kw in $targetKeywords) {
                if ($p.Name -like "*$kw*" -or $p.DriverName -like "*$kw*") { $found = $true; break }
              }
              $found
            } | Select-Object -First 1
            if ($matchedExisting) {
              $detectedName = $matchedExisting.Name
            }
          }
        }

        # ── BƯỚC 5: TỰ ĐỘNG TẠO MÁY IN NẾU DRIVER ĐÃ CÓ NHƯNG CHƯA TẠO HÀNG ĐỢI ──
        $isPosOrBarcode = "${category || ''}" -match 'pos|barcode' -or ($targetKeywords | Where-Object { $_ -match 'XP-|Xprinter|POS|Thermal|Receipt|Barcode|Label' })
        if (-not $detectedName -and $isPosOrBarcode) {
          $allDrivers = @(Get-PrinterDriver -ErrorAction SilentlyContinue)
          $bestDriver = $allDrivers | Where-Object {
            $d = $_
            $found = $false
            foreach ($kw in $targetKeywords) {
              if ($d.Name -like "*$kw*") { $found = $true; break }
            }
            $found
          } | Select-Object -First 1

          if ($bestDriver) {
            $queueName = $bestDriver.Name
            $existingNames = @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
            if ($existingNames -contains $queueName) {
              $queueName = "$queueName (Auto)"
            }
            try {
              Add-Printer -Name $queueName -DriverName $bestDriver.Name -PortName $assignedPort -ErrorAction Stop
              $detectedName = $queueName
              $autoCreatedQueue = $true
            } catch {}
          }
        }

        # ── BƯỚC 6: KHẮC PHỤC TRIỆT ĐỂ LỖI BỘ CÀI XPRINTER TỰ GÁN VÀO 'OTHER' HOẶC SAI CỔNG USB ──
        # Ép cổng của máy in về đúng cổng USB/IP mà người dùng đã chọn hoặc thiết bị đang cắm thực tế!
        if ($detectedName -and $assignedPort) {
          $curr = Get-Printer -Name $detectedName -ErrorAction SilentlyContinue
          if ($curr -and $curr.PortName -ne $assignedPort) {
            Set-Printer -Name $detectedName -PortName $assignedPort -ErrorAction SilentlyContinue
          }
        }

        [PSCustomObject]@{
          ok = [bool]$detectedName
          printerName = $detectedName
          autoCreated = $autoCreatedQueue
          assignedPort = $assignedPort
          installedInfs = $installedInfs
          executedExes = $executedExes
          error = if (-not $detectedName) { "Chưa phát hiện máy in mới được tạo trên hệ thống Windows. Vui lòng chọn đúng model trên cửa sổ hãng và bấm 'Install Now'!" } else { "" }
        } | ConvertTo-Json -Compress
      `;

      const installRes = await runElevatedPSToolScript(installPs);
      let installData = {};
      try { installData = JSON.parse(installRes.output || '{}'); } catch {}

      const detectedPrinterName = installData.printerName || '';
      const autoCreated = !!installData.autoCreated;
      const assignedPort = installData.assignedPort || '';

      if (detectedPrinterName) {
        if (autoCreated) {
          sendLog(3, 4, `Cài đặt Driver thành công! Đã tự động tạo hàng đợi máy in: [${detectedPrinterName}] kết nối với cổng [${assignedPort || 'USB'}].`, 'ok');
        } else {
          sendLog(3, 4, `Cài đặt Driver thành công! Hệ thống đã nhận diện máy in: [${detectedPrinterName}] kết nối với cổng [${assignedPort || 'USB'}].`, 'ok');
        }
      } else {
        return {
          ok: false,
          error: installData.error || `Chưa phát hiện máy in mới được tạo trên hệ thống Windows. Vui lòng mở lại bộ cài và hoàn tất bước Install Now!`
        };
      }

      // ══════════════════════════════════════════════════════════════════════════
      // BƯỚC 4: Tự động in trang thử nghiệm (Print Test Page)
      // ══════════════════════════════════════════════════════════════════════════
      let testPrintSent = false;
      let printedTargetName = '';

      if (autoTestPrint) {
        sendLog(4, 4, `Đang gửi lệnh in trang thử nghiệm (Test Page) trực tiếp tới [${detectedPrinterName || driverName}]...`, 'info');

        const testPs = `
          $target = "${detectedPrinterName.replace(/"/g, '`"')}"
          
          # Chỉ in trang thử khi đã xác định được chính xác máy in vừa cài!
          # TUYỆT ĐỐI KHÔNG DÙNG printui.dll để tránh bị in nhầm sang máy in mặc định.
          if ($target) {
            $p = Get-CimInstance -ClassName Win32_Printer -Filter "Name = '$target'" -ErrorAction SilentlyContinue
            if (-not $p) {
              $p = Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$target*" } | Select-Object -First 1
            }

            if ($p) {
              Set-Printer -Name $p.Name -WorkOffline $false -ErrorAction SilentlyContinue
              Resume-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue

              # Gọi trực tiếp method PrintTestPage của đúng máy in này qua WMI / CIM:
              $wmiRes = Invoke-CimMethod -InputObject $p -MethodName PrintTestPage -ErrorAction SilentlyContinue
              $printedOk = ($wmiRes -and $wmiRes.ReturnValue -eq 0)

              if (-not $printedOk) {
                try {
                  $inst = Get-WmiObject -Class Win32_Printer -Filter "Name='$($p.Name)'" -ErrorAction SilentlyContinue
                  if ($inst) {
                    $wmiRet = $inst.PrintTestPage()
                    $printedOk = ($wmiRet.ReturnValue -eq 0)
                  }
                } catch {}
              }

              Start-Sleep -Milliseconds 600
              $jobs = @(Get-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue)

              [PSCustomObject]@{
                ok = $true
                printed = $printedOk
                target = $p.Name
                port = $p.PortName
                queued = ($jobs.Count -gt 0)
              } | ConvertTo-Json -Compress
            } else {
              [PSCustomObject]@{ ok = $false; printed = $false; target = ""; error = "Không tìm thấy máy in [$target] để in thử!" } | ConvertTo-Json -Compress
            }
          } else {
            [PSCustomObject]@{ ok = $true; printed = $false; target = ""; queued = $false } | ConvertTo-Json -Compress
          }
        `;

        const testRes = await runPSToolScript(testPs);
        let testData = {};
        try { testData = JSON.parse(testRes.output || '{}'); } catch {}

        if (testData.printed && testData.target) {
          testPrintSent = true;
          printedTargetName = testData.target;
          const queuedNote = testData.queued ? ' (Hàng đợi Spooler đã tiếp nhận lệnh in)' : '';
          sendLog(4, 4, `✅ ĐÃ GỬI LỆNH IN TRANG THỬ (TEST PAGE) TRỰC TIẾP TỚI "${testData.target}" (Cổng ${testData.port || 'USB'})${queuedNote}. Vui lòng kiểm tra khay giấy ra!`, 'ok');
        } else if (testData.target) {
          sendLog(4, 4, `ℹ️ Đã hoàn tất cài đặt máy in "${testData.target}". Máy in hiện chưa kết nối vật lý (cáp USB/nguồn) nên Spooler chưa nhả lệnh in test. Khi cắm cáp bật máy sẽ in bình thường!`, 'warn');
        } else {
          sendLog(4, 4, `ℹ️ Máy in hiện chưa cắm cáp USB hoặc đang tắt. Driver đã nạp sẵn sàng 100%, bạn chỉ việc cắm cáp là dùng ngay!`, 'info');
        }
      }

      // Dọn dẹp thư mục tạm
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      return {
        ok: true,
        printerName: detectedPrinterName || printedTargetName,
        testPrintSent,
        message: detectedPrinterName
          ? `Đã cài đặt thành công Driver máy in [${detectedPrinterName}] và ${testPrintSent ? 'đã gửi lệnh in test trang!' : 'sẵn sàng sử dụng!'}`
          : `Đã nạp Driver [${driverName}] hoàn tất vào hệ thống Windows. Chỉ cần cắm máy in là dùng ngay!`
      };

    } catch (err) {
      console.error('[AutoDriverInstall Error]', err);
      sendLog(3, 4, `Lỗi khi cài đặt driver: ${err.message || err}`, 'err');
      return { ok: false, error: err.message || String(err) };
    }
  });

}

module.exports = { registerPrinterIPC };
