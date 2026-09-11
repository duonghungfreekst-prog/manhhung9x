@echo off
:: =============================================================================
:: DMH_Tools - Build TOÀN BỘ: Python Core + Electron Installer
:: Chạy 1 lần duy nhất → ra file .exe cài đặt
:: =============================================================================
setlocal

echo.
echo ===============================================================
echo   DMH_Tools v6.0.1 - Full Build Pipeline
echo   Bước 1: Python Core  →  Bước 2: Electron Installer
echo ===============================================================
echo.

:: Bước 1: Build Python core
echo [BUOC 1/2] Dang dong goi Python Core...
call build_python_core.bat
if errorlevel 1 (
    echo [LOI] Build Python Core that bai. Dung lai.
    exit /b 1
)

:: Bước 2: Build Electron
echo [BUOC 2/2] Dang build Electron installer...
call npm run electron:build
if errorlevel 1 (
    echo [LOI] Build Electron that bai.
    exit /b 1
)

echo.
echo ===============================================================
echo  BUILD HOAN THANH!
echo  File installer: release\DMH_Tools Setup*.exe
echo ===============================================================
echo.
