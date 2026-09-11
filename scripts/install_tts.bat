@echo off
chcp 65001 >nul
echo ╔══════════════════════════════════════════════════════════╗
echo ║    DMH_Tools - Cài Đặt Giọng Nói Tiếng Việt (TTS)      ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

:: Kiểm tra Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [LỖI] Không tìm thấy Python!
    echo.
    echo Vui lòng tải Python 3.10+ từ: https://www.python.org/downloads/
    echo Chú ý: Tick chọn "Add Python to PATH" khi cài!
    echo.
    pause
    exit /b 1
)

echo [OK] Đã tìm thấy Python:
python --version
echo.

echo [1/3] Cập nhật pip...
python -m pip install --upgrade pip --quiet

echo [2/3] Cài đặt edge-tts (giọng HoaiMy Neural - giọng nữ tiếng Việt đẹp nhất)...
python -m pip install edge-tts --upgrade --quiet
if errorlevel 1 (
    echo [CẢNH BÁO] Không cài được edge-tts. Thử cài gTTS dự phòng...
    python -m pip install gtts --upgrade --quiet
) else (
    echo [OK] Đã cài edge-tts thành công!
)

echo [3/3] Cài thêm gTTS (dự phòng khi mất mạng)...
python -m pip install gtts --upgrade --quiet
echo [OK] Đã cài gTTS!

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  ✅ Hoàn tất! Khởi động lại DMH_Tools để dùng giọng nói.║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo Thứ tự ưu tiên giọng nói:
echo   1. HoaiMy Neural (edge-tts) - Giọng nữ đẹp, cần internet
echo   2. Microsoft An (offline)   - Tích hợp sẵn Windows
echo   3. gTTS Google              - Dự phòng, cần internet
echo.
pause
