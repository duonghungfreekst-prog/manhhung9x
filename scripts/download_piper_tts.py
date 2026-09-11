"""
Script tai Piper TTS Windows binary + model tieng Viet vi_VN-vais1000-medium
Chay: python scripts/download_piper_tts.py
"""
import os
import sys
import io

# Fix encoding tren Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import zipfile
import shutil
import urllib.request

PIPER_DIR = os.path.join(os.path.dirname(__file__), '..', 'bin', 'piper')
PIPER_EXE = os.path.join(PIPER_DIR, 'piper.exe')
MODEL_ONNX = os.path.join(PIPER_DIR, 'vi_VN-vais1000-medium.onnx')
MODEL_JSON = os.path.join(PIPER_DIR, 'vi_VN-vais1000-medium.onnx.json')

PIPER_ZIP_URL = (
    'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/'
    'piper_windows_amd64.zip'
)
MODEL_ONNX_URL = (
    'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/'
    'vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx'
)
MODEL_JSON_URL = (
    'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/'
    'vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx.json'
)


def dl(url, dest, label):
    print(f'[↓] Đang tải {label}...')
    print(f'    URL: {url}')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
            total = int(r.headers.get('Content-Length', 0))
            downloaded = 0
            chunk = 1024 * 64
            while True:
                buf = r.read(chunk)
                if not buf:
                    break
                f.write(buf)
                downloaded += len(buf)
                if total:
                    pct = downloaded * 100 // total
                    print(f'\r    {pct}% ({downloaded//1024}KB / {total//1024}KB)   ', end='')
            print()
        print(f'    ✓ Xong: {dest}')
        return True
    except Exception as e:
        print(f'    ✗ Lỗi: {e}')
        return False


def main():
    os.makedirs(PIPER_DIR, exist_ok=True)

    # 1. Download + extract piper.exe nếu chưa có
    if os.path.exists(PIPER_EXE):
        print(f'[✓] piper.exe đã tồn tại: {PIPER_EXE}')
    else:
        zip_path = os.path.join(PIPER_DIR, 'piper_windows_amd64.zip')
        ok = dl(PIPER_ZIP_URL, zip_path, 'Piper Windows binary')
        if not ok:
            print('THẤT BẠI: Không thể tải piper binary.')
            sys.exit(1)
        print('[i] Giai nen...')
        with zipfile.ZipFile(zip_path, 'r') as z:
            # Cac file trong zip nam trong thu muc "piper/"
            for member in z.namelist():
                filename = os.path.basename(member)
                if not filename:
                    continue
                with z.open(member) as src:
                    dest = os.path.join(PIPER_DIR, filename)
                    with open(dest, 'wb') as out:
                        shutil.copyfileobj(src, out)
        # Dong handle truoc khi xoa
        import gc; gc.collect()
        try:
            os.remove(zip_path)
        except Exception as e:
            print(f'    (Bo qua loi xoa zip: {e})')
        print(f'    OK Giai nen xong: {PIPER_DIR}')

    # 2. Download model tiếng Việt
    if os.path.exists(MODEL_ONNX):
        print(f'[✓] Model ONNX đã tồn tại: {MODEL_ONNX}')
    else:
        ok = dl(MODEL_ONNX_URL, MODEL_ONNX, 'Model vi_VN-vais1000-medium.onnx (~70MB)')
        if not ok:
            print('THẤT BẠI: Không thể tải model ONNX.')
            sys.exit(1)

    if os.path.exists(MODEL_JSON):
        print(f'[✓] Model JSON đã tồn tại: {MODEL_JSON}')
    else:
        ok = dl(MODEL_JSON_URL, MODEL_JSON, 'Model config JSON')
        if not ok:
            print('THẤT BẠI: Không thể tải model JSON.')
            sys.exit(1)

    print()
    print('═' * 60)
    print('✅ Cài đặt Piper TTS tiếng Việt hoàn tất!')
    print(f'   Thư mục: {os.path.abspath(PIPER_DIR)}')
    print()

    # 3. Test nhanh
    print('[i] Kiểm tra nhanh...')
    import subprocess
    proc = subprocess.run(
        [PIPER_EXE, '--version'],
        capture_output=True, text=True, timeout=10
    )
    if proc.returncode == 0 or proc.stdout:
        print(f'    ✓ Piper version: {proc.stdout.strip() or proc.stderr.strip()}')
    else:
        print('    ⚠ piper.exe chạy nhưng không có output version (bình thường)')

    print()
    print('💡 Khởi động lại DMH_Tools để áp dụng giọng Piper TTS tiếng Việt.')
    print('═' * 60)


if __name__ == '__main__':
    main()
