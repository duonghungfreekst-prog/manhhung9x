@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ===============================================================
echo  DMH_Tools - Build Python Core
echo ===============================================================

python --version >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Python
    pause & exit /b 1
)

python -m pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    python -m pip install pyinstaller --quiet
)

python -m pip install opencv-python numpy python-docx Pillow openpyxl requests lxml --quiet

if exist "python_core\dist_py" rmdir /s /q "python_core\dist_py"
if exist "python_core\build_py" rmdir /s /q "python_core\build_py"

cd python_core
python -m PyInstaller --noconfirm --clean --distpath "dist_py" --workpath "build_py" endoscopy_server.spec
if errorlevel 1 (
    echo [LOI] PyInstaller endoscopy_server that bai!
    cd ..
    pause & exit /b 1
)

python -m PyInstaller --noconfirm --clean --distpath "dist_py" --workpath "build_py" xml3176_server.spec
if errorlevel 1 (
    echo [LOI] PyInstaller xml3176_server that bai!
    cd ..
    pause & exit /b 1
)

python -m PyInstaller --noconfirm --clean --distpath "dist_py" --workpath "build_py" compare_server.spec
if errorlevel 1 (
    echo [LOI] PyInstaller compare_server that bai!
    cd ..
    pause & exit /b 1
)
cd ..

if exist "python_core\weights" (
    if not exist "python_core\dist_py\endoscopy_server\weights" mkdir "python_core\dist_py\endoscopy_server\weights"
    xcopy /e /y /q "python_core\weights\*" "python_core\dist_py\endoscopy_server\weights\"
)

if not exist "python_core_dist" mkdir "python_core_dist"
if exist "python_core_dist\endoscopy_server" rmdir /s /q "python_core_dist\endoscopy_server"
xcopy /e /i /y /q "python_core\dist_py\endoscopy_server" "python_core_dist\endoscopy_server"

if exist "python_core_dist\xml3176_server" rmdir /s /q "python_core_dist\xml3176_server"
xcopy /e /i /y /q "python_core\dist_py\xml3176_server" "python_core_dist\xml3176_server"

if exist "python_core_dist\compare_server" rmdir /s /q "python_core_dist\compare_server"
xcopy /e /i /y /q "python_core\dist_py\compare_server" "python_core_dist\compare_server"

if exist "python_core_dist\endoscopy_server\endoscopy_server.exe" (
    if exist "python_core_dist\compare_server\compare_server.exe" (
        echo BUILD THANH CONG!
    ) else (
        echo [LOI] Khong tim thay compare_server.exe
        pause & exit /b 1
    )
) else (
    echo [LOI] Khong tim thay endoscopy_server.exe
    pause & exit /b 1
)

echo.
pause
