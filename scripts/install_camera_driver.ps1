# DMH_Tools Universal Medical Camera & Capture Card Driver Installer v2.0
# Tự động nhận diện, sửa lỗi và nạp Driver UVC/DirectShow cho thiết bị nội soi y tế
# Exit: 0=OK, 1=need-admin, 2=not-found

$ErrorActionPreference = 'SilentlyContinue'

function Log($msg) { Write-Host $msg; try { [Console]::Out.Flush() } catch {} }

Log "STEP:1:6:Kiem tra quyen Camera trong Windows Privacy Settings..."
try {
    # Bat quyen truy cap camera toan he thong
    $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam"
    if (Test-Path $regPath) {
        Set-ItemProperty -Path $regPath -Name "Value" -Value "Allow" -ErrorAction SilentlyContinue
    }
    $regGlobal = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam"
    if (Test-Path $regGlobal) {
        Set-ItemProperty -Path $regGlobal -Name "Value" -Value "Allow" -ErrorAction SilentlyContinue
    }
    Log "LOG:OK: Quyen truy cap Camera trong Windows Privacy da duoc mo"
} catch {
    Log "LOG:INFO: Khong the cap nhat Registry Privacy (co the can quyen Admin)"
}

Log "STEP:2:6:Quet phan cung va cong USB (PnP Hardware Scan)..."
try {
    & pnputil /scan-devices 2>$null | Out-Null
    Log "LOG:OK: Quet phan cung PnP thanh cong"
} catch {
    Log "LOG:WARN: pnputil scan chua san sang"
}
Start-Sleep -Milliseconds 800

Log "STEP:3:6:Nhan dien Camera Noi Soi & Card Bat Hinh (Capture Card)..."
# Danh sach cac dong thiet bi y te va capture card thong dung
$keywords = @(
    '*VID_4C4A*', '*DV20*', '*Endoscope*', '*Noi Soi*', '*Otoscope*',
    '*VID_534D*', '*MS2109*', '*MS2130*', '*USB Video*', '*Capture*',
    '*AverMedia*', '*Elgato*', '*Cam Link*', '*Magewell*', '*EasyCap*',
    '*UVC*', '*HD Camera*', '*Webcam*'
)

$foundDevices = @()
foreach ($kw in $keywords) {
    $devs = Get-PnpDevice | Where-Object { $_.InstanceId -like $kw -or $_.FriendlyName -like $kw }
    if ($devs) {
        foreach ($d in $devs) {
            if (-not ($foundDevices | Where-Object { $_.InstanceId -eq $d.InstanceId })) {
                $foundDevices += $d
                Log "LOG:INFO: Phat hien thiet bi: $($d.FriendlyName) [$($d.Status)]"
            }
        }
    }
}

if ($foundDevices.Count -eq 0) {
    Log "LOG:INFO: Chua phat hien camera theo ten rieng, se kiem tra toan bo thiet bi USB Image"
}

Log "STEP:4:6:Nap goi Driver UVC DirectShow Chuan Y Te..."
$infList = @(
    "$env:SystemRoot\INF\usbvideo.inf",
    "$env:SystemRoot\INF\kscaptur.inf",
    "$env:SystemRoot\INF\image.inf"
)

foreach ($inf in $infList) {
    if (Test-Path $inf) {
        & pnputil /add-driver "$inf" /install 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 3010) {
            Log "LOG:OK: Da cai dat va nap driver: $(Split-Path $inf -Leaf)"
        }
    }
}

# Kich hoat cac thiet bi bi loi Unknown hoac Error
$unknown = Get-PnpDevice | Where-Object {
    ($_.Status -eq 'Unknown' -or $_.Status -eq 'Error' -or $_.Status -eq 'Degraded') -and
    ($_.InstanceId -like 'USB*' -or $_.Class -eq 'Camera' -or $_.Class -eq 'Image')
}
if ($unknown) {
    foreach ($d in $unknown) {
        $n = if ($d.FriendlyName) { $d.FriendlyName } else { $d.InstanceId }
        Log "LOG:INFO: Dang sua loi va kich hoat thiet bi: $n"
        try { Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop; Log "LOG:OK: Da kich hoat: $n" } catch {}
        try { & pnputil /update-driver $d.InstanceId 2>$null | Out-Null } catch {}
    }
}

Log "STEP:5:6:Khoi dong lai Camera Subsystem (Stack Reset)..."
try { & pnputil /scan-devices 2>$null | Out-Null } catch {}
Start-Sleep -Milliseconds 1200

# Reset cac thiet bi camera de cap nhat DirectShow stream
$cams = Get-PnpDevice | Where-Object { $_.Class -eq 'Camera' -or $_.Class -eq 'Image' }
foreach ($d in $cams) {
    $n = if ($d.FriendlyName) { $d.FriendlyName } else { $d.InstanceId }
    try {
        Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop
        Start-Sleep -Milliseconds 400
        Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop
        Log "LOG:OK: Reset thiet bi hoan tat: $n"
    } catch {
        Log "LOG:INFO: Thiet bi dang chay san sang: $n"
    }
}
Start-Sleep -Milliseconds 1000

Log "STEP:6:6:Kiem tra ket qua san sang cua Driver..."
$ok = @(Get-PnpDevice -Class Camera -Status OK -ErrorAction SilentlyContinue)
$ok += @(Get-PnpDevice -Class Image -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'video|cam|capture|usb' })

foreach ($d in $ok) {
    Log "LOG:OK: Driver san sang: $($d.FriendlyName)"
}

$total = $ok.Count
if ($total -gt 0) {
    Log "DONE:SUCCESS:Da ket noi va san sang $total thiet bi Camera/Capture Card!"
    exit 0
} else {
    Log "DONE:NOTFOUND:Khong tim thay camera hoac capture card dang cam vao may. Vui long kiem tra lai day USB."
    exit 2
}