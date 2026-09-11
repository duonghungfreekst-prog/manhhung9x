@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ================================================
echo    DMH_Tools - Cài Driver Camera Nội Soi
echo    (USB Video Class / UVC / Generic Camera)
echo ================================================
echo.

:: ── Kiểm tra quyền Admin ─────────────────────────
net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo [LỖI] Cần quyền Administrator để cài driver!
    echo.
    echo Đang yêu cầu quyền Admin và chạy lại...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b 1
)

echo [OK] Đang chạy với quyền Administrator
echo.

:: ── Bước 1: Scan hardware để Windows nhận thiết bị mới ──
echo [1/5] Quét phần cứng mới (Scan for hardware changes)...
pnputil /scan-devices >nul 2>&1
powershell -NonInteractive -NoProfile -Command "Invoke-Expression 'rundll32 devmgr.dll,DevManager_Execute'" >nul 2>&1
echo [OK] Đã quét phần cứng.
echo.

:: ── Bước 2: Cài driver UVC built-in Windows ─────
echo [2/5] Cài driver USB Video Class (UVC) built-in...
set "USBVIDEO_INF=%SystemRoot%\INF\usbvideo.inf"
if exist "%USBVIDEO_INF%" (
    pnputil /add-driver "%USBVIDEO_INF%" /install >nul 2>&1
    echo [OK] Đã cài usbvideo.inf (driver UVC chuẩn)
) else (
    echo [WARN] Không tìm thấy usbvideo.inf - thử phương án khác...
)
echo.

:: ── Bước 3: Enable tất cả camera bị Disabled ───
echo [3/5] Kích hoạt camera bị tắt (Enable disabled cameras)...
powershell -NonInteractive -NoProfile -Command ^
  "Get-PnpDevice -Class Camera | Where-Object {$_.Status -eq 'Error' -or $_.Status -eq 'Unknown'} | Enable-PnpDevice -Confirm:$false" >nul 2>&1
powershell -NonInteractive -NoProfile -Command ^
  "Get-PnpDevice -Class USB | Where-Object {$_.FriendlyName -like '*camera*' -or $_.FriendlyName -like '*DV20*'} | Enable-PnpDevice -Confirm:$false" >nul 2>&1
echo [OK] Đã kích hoạt (nếu có thiết bị bị tắt).
echo.

:: ── Bước 4: Update driver cho thiết bị Unknown ─
echo [4/5] Cập nhật driver cho thiết bị chưa nhận...
powershell -NonInteractive -NoProfile -Command ^
  "$devs = Get-WmiObject Win32_PnPEntity | Where-Object {$_.ConfigManagerErrorCode -ne 0}; $devs | ForEach-Object { Write-Host ('  -> ' + $_.Name + ' [Error ' + $_.ConfigManagerErrorCode + ']') }"
echo.

:: Thử update driver qua Windows Update / local driver store
powershell -NonInteractive -NoProfile -Command ^
  "$devs = Get-PnpDevice | Where-Object {$_.Status -eq 'Unknown'}; foreach ($d in $devs) { Write-Host ('Updating: ' + $d.FriendlyName); Update-PnpDevice -InstanceId $d.InstanceId -Confirm:$false 2>$null }" 2>nul
echo [OK] Bước update driver hoàn tất.
echo.

:: ── Bước 5: Quét lại và liệt kê camera ─────────
echo [5/5] Kiểm tra kết quả...
pnputil /scan-devices >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo ─── Camera hiện tại sau khi cài driver ───────
powershell -NonInteractive -NoProfile -Command ^
  "Get-PnpDevice -Class Camera | Select-Object Status, FriendlyName | Format-Table -AutoSize"

echo ─── Thiết bị USB Video ───────────────────────
powershell -NonInteractive -NoProfile -Command ^
  "Get-PnpDevice | Where-Object {$_.FriendlyName -like '*video*' -or $_.FriendlyName -like '*capture*' -or $_.FriendlyName -like '*DV20*'} | Select-Object Status, FriendlyName | Format-Table -AutoSize"

echo.
echo ================================================
echo  Nếu camera vẫn hiện "Unknown":
echo  → Cắm lại cổng USB khác (USB 3.0 xanh)
echo  → Khởi động lại máy tính
echo  → Liên hệ nhà cung cấp thiết bị DV20
echo ================================================
echo.

:: Ghi kết quả ra file log
set "LOGFILE=%TEMP%\dmh_cam_install.log"
echo [DMH_Tools Camera Driver Install - %DATE% %TIME%] > "%LOGFILE%"
powershell -NonInteractive -NoProfile -Command "Get-PnpDevice -Class Camera | Select-Object Status, FriendlyName | Out-File -Append '%LOGFILE%' -Encoding UTF8"
echo LOG >> "%LOGFILE%"
echo Saved to: %LOGFILE%
echo.

:: Xuất exit code = 0 nếu tìm thấy ít nhất 1 camera OK
powershell -NonInteractive -NoProfile -Command ^
  "exit ((Get-PnpDevice -Class Camera | Where-Object {$_.Status -eq 'OK'}).Count -gt 0 ? 0 : 1)"
set CAMERA_OK=%errorlevel%

if %CAMERA_OK% EQU 0 (
    echo [SUCCESS] Đã phát hiện camera hoạt động tốt!
    exit /b 0
) else (
    echo [INFO] Chưa phát hiện camera. Vui lòng cắm lại hoặc khởi động lại.
    exit /b 2
)
