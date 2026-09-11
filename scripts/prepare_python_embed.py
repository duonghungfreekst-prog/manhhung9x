"""
prepare_python_embed.py
=======================
Chạy script này MỘT LẦN trước khi build installer:
  python scripts/prepare_python_embed.py

Script sẽ:
1. Tải Python 3.12 Embeddable (portable) từ python.org (~30MB)
2. Giải nén vào vendor/python-embed/
3. Cài pip vào embed environment
4. Cài edge-tts + gTTS vào embed environment
5. Tải Piper TTS exe (offline neural) vào vendor/piper/
6. Tải model tiếng Việt vi_VN-vivos vào vendor/piper/

Sau đó electron-builder sẽ đóng gói tất cả vào installer.
"""
import os
import sys
import zipfile
import urllib.request
import subprocess
import shutil
import io

# Fix encoding trên Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


PYTHON_VERSION = "3.12.10"
EMBED_URL    = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"
GET_PIP_URL  = "https://bootstrap.pypa.io/get-pip.py"

# Piper TTS - Windows x64 release
PIPER_RELEASE_URL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
# Model tiếng Việt (Hugging Face)
PIPER_MODEL_BASE  = "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vivos/x_low"
PIPER_MODEL_ONNX  = f"{PIPER_MODEL_BASE}/vi_VN-vivos-x_low.onnx"
PIPER_MODEL_JSON  = f"{PIPER_MODEL_BASE}/vi_VN-vivos-x_low.onnx.json"

# Thư mục đích
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
VENDOR_DIR   = os.path.join(PROJECT_ROOT, "vendor", "python-embed")
PIPER_DIR    = os.path.join(PROJECT_ROOT, "vendor", "piper")
PYTHON_EXE   = os.path.join(VENDOR_DIR, "python.exe")


def download(url: str, dest: str):
    print(f"  Downloading {os.path.basename(dest)} ...", end="", flush=True)
    def progress(count, block, total):
        pct = count * block * 100 // total if total > 0 else 0
        print(f"\r  Downloading {os.path.basename(dest)} ... {min(pct,100)}%", end="", flush=True)
    urllib.request.urlretrieve(url, dest, reporthook=progress)
    print(" OK")


def setup_python_embed():
    """Bước 1-4: Python embed + pip + TTS packages."""
    if os.path.exists(VENDOR_DIR):
        print(f"\n[INFO] Python embed đã tồn tại: {VENDOR_DIR}")
        answer = input("  Xóa và tải lại? (y/N): ").strip().lower()
        if answer == 'y':
            shutil.rmtree(VENDOR_DIR)
        else:
            print("[SKIP] Bỏ qua Python embed.")
            install_packages()
            return
    os.makedirs(VENDOR_DIR, exist_ok=True)

    print(f"\n[1/4] Tải Python {PYTHON_VERSION} Embeddable (x64)...")
    zip_path = os.path.join(VENDOR_DIR, "python-embed.zip")
    download(EMBED_URL, zip_path)

    print(f"\n[2/4] Giải nén Python embed...")
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(VENDOR_DIR)
    os.remove(zip_path)
    print("  OK Giải nén xong")

    print("\n[3/4] Cấu hình embed environment...")
    for f in os.listdir(VENDOR_DIR):
        if f.endswith("._pth"):
            pth_file = os.path.join(VENDOR_DIR, f)
            with open(pth_file, 'r') as fh:
                content = fh.read()
            content = content.replace("#import site", "import site")
            with open(pth_file, 'w') as fh:
                fh.write(content)
            print(f"  OK Đã bật 'import site' trong {f}")
            break

    print("\n[4/4] Cài pip vào embed environment...")
    pip_script = os.path.join(VENDOR_DIR, "get-pip.py")
    download(GET_PIP_URL, pip_script)
    subprocess.run([PYTHON_EXE, pip_script, "--quiet", "--no-warn-script-location"], check=True)
    os.remove(pip_script)
    print("  OK pip đã cài")

    install_packages()


def install_packages():
    """Cài edge-tts + gTTS vào Python embed."""
    pip_exe = os.path.join(VENDOR_DIR, "Scripts", "pip.exe")
    if not os.path.exists(pip_exe):
        for name in ["pip3.exe", "pip3.12.exe"]:
            alt = os.path.join(VENDOR_DIR, "Scripts", name)
            if os.path.exists(alt):
                pip_exe = alt
                break
        else:
            print("[ERROR] Không tìm thấy pip. Hãy chạy lại script.")
            return

    packages = [
        ("edge-tts", "Giong HoaiMy Neural (online)"),
        ("gtts",     "Google TTS (du phong online)"),
    ]
    print("\n[+] Cài TTS packages vào embed environment...")
    for pkg, desc in packages:
        print(f"  Cài {pkg} ({desc})...", end="", flush=True)
        r = subprocess.run(
            [pip_exe, "install", pkg, "--quiet", "--no-warn-script-location"],
            capture_output=True, text=True
        )
        print(" OK" if r.returncode == 0 else f" WARNING: {r.stderr.strip()[:80]}")


def setup_piper():
    """Bước 5-6: Tải Piper exe + model tiếng Việt."""
    print("\n" + "=" * 60)
    print("  [PIPER] Tải Piper TTS offline (neural, tiếng Việt)")
    print("=" * 60)

    os.makedirs(PIPER_DIR, exist_ok=True)
    piper_exe = os.path.join(PIPER_DIR, "piper.exe")

    # Tải Piper exe
    if os.path.exists(piper_exe):
        print(f"  [SKIP] Piper đã tồn tại: {piper_exe}")
    else:
        print("\n[5/6] Tải Piper TTS exe (~30MB)...")
        piper_zip = os.path.join(PIPER_DIR, "piper.zip")
        try:
            download(PIPER_RELEASE_URL, piper_zip)
            with zipfile.ZipFile(piper_zip, 'r') as z:
                # Piper zip chứa thư mục con "piper/"
                for member in z.namelist():
                    filename = os.path.basename(member)
                    if not filename:
                        continue
                    target = os.path.join(PIPER_DIR, filename)
                    with z.open(member) as src, open(target, 'wb') as dst:
                        dst.write(src.read())
            os.remove(piper_zip)
            print("  OK Piper đã giải nén")
        except Exception as e:
            print(f"  WARNING Không tải được Piper: {e}")
            print("  => Ứng dụng sẽ dùng edge-tts/SAPI thay thế.")
            return

    # Tải model tiếng Việt
    model_onnx = os.path.join(PIPER_DIR, "vi_VN-vivos-x_low.onnx")
    model_json = os.path.join(PIPER_DIR, "vi_VN-vivos-x_low.onnx.json")

    print("\n[6/6] Tải model tiếng Việt vi_VN-vivos-x_low (~60MB)...")
    if os.path.exists(model_onnx) and os.path.getsize(model_onnx) > 1000000:
        print("  [SKIP] Model .onnx đã tồn tại")
    else:
        try:
            download(PIPER_MODEL_ONNX, model_onnx)
        except Exception as e:
            print(f"  WARNING Không tải được model: {e}")

    if os.path.exists(model_json):
        print("  [SKIP] Model .json đã tồn tại")
    else:
        try:
            download(PIPER_MODEL_JSON, model_json)
        except Exception as e:
            print(f"  WARNING Không tải được model config: {e}")

    # Kiểm tra kết quả
    if os.path.exists(piper_exe) and os.path.exists(model_onnx):
        print(f"\n  OK Piper offline sẵn sàng!")
        print(f"     exe:   {piper_exe}")
        print(f"     model: {model_onnx}")
    else:
        print("\n  WARNING Piper chưa hoàn chỉnh. Kiểm tra lại kết nối mạng.")


def main():
    print("=" * 60)
    print("  DMH_Tools — Chuẩn bị TTS đầy đủ (offline + online)")
    print("=" * 60)

    # Bước 1-4: Python embed + TTS packages (online engines)
    setup_python_embed()

    # Bước 5-6: Piper TTS (offline neural engine)
    setup_piper()

    print("\n" + "=" * 60)
    print("  HOAN TAT!")
    print(f"  Python embed: {VENDOR_DIR}")
    print(f"  Piper TTS:    {PIPER_DIR}")
    print("\n  Thu tu gion noi:")
    print("    1. Piper offline (vi_VN-vivos) - KHONG can internet")
    print("    2. edge-tts HoaiMy Neural      - Can internet")
    print("    3. Microsoft An SAPI           - Offline Windows")
    print("    4. gTTS Google                 - Can internet")
    print("\n  Buoc tiep theo: npm run electron:build")
    print("=" * 60)


if __name__ == "__main__":
    main()
