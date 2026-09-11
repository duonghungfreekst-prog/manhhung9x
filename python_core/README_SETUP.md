# DMH_Tools - Nội Soi AI 4K: Hướng Dẫn Cài Đặt & Sử Dụng

---

## ⚡ Build Tích Hợp (Không Cần Python Trên Máy Đích)

```
QUY TRÌNH BUILD (CHỈ 2 BƯỚC):

Bước 1 — Trên máy developer (có Python):
  DoubleClick: build_python_core.bat
  → Đóng gói Python + tất cả thư viện → python_core_dist\endoscopy_server.exe

Bước 2 — Build Electron installer:
  npm run electron:build
  → Nhúng exe Python vào installer → release\DMH_Tools Setup*.exe

Hoặc dùng 1 lệnh:
  build_full.bat
```

> **Người dùng cuối chỉ cần chạy file installer** — không cần cài Python, không cần cài pip, không cần internet.

---

## Cấu Trúc Sau Khi Build

```
python_core_dist/
└── endoscopy_server/          ← Thư mục này được nhúng vào installer
    ├── endoscopy_server.exe   ← Python runtime + tất cả thư viện
    ├── cv2/                   ← OpenCV
    ├── numpy/                 ← NumPy
    ├── templates/             ← Template Word báo cáo
    └── weights/               ← Model AI Real-ESRGAN (nếu có)
```

---


## Cấu Trúc Thư Mục

```
python_core/
├── endoscopy_core.py      # Main: Tích hợp tất cả module, 3-thread
├── database.py            # Module D: SQLite, cấu trúc thư mục
├── trigger_system.py      # Module B: B1/B2/B3/B4 trigger
├── ai_pipeline.py         # Module C: Real-ESRGAN, CLAHE, Denoise
├── report_generator.py    # Module D-Report: Xuất Word/PDF
├── requirements.txt       # Danh sách thư viện
├── weights/               # Đặt model weights AI vào đây
│   └── RealESRGAN_x4plus.pth
└── templates/
    └── report_template.docx  # Template Word (tự sinh khi chạy lần đầu)
```

---

## Giai Đoạn 1: Cài Đặt Môi Trường

### 1.1 Cài Python 3.9+
Tải tại: https://www.python.org/downloads/

### 1.2 Cài thư viện cốt lõi
```bash
pip install opencv-python numpy
```

### 1.3 Cài PyQt6 (nếu muốn build giao diện Python riêng)
```bash
pip install PyQt6
```

### 1.4 Cài toàn bộ từ requirements.txt
```bash
pip install -r requirements.txt
```

> **Lưu ý**: PyTorch cần cài riêng theo phiên bản CUDA của bạn:
> - CUDA 11.8: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118`
> - CUDA 12.1: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121`
> - CPU only: `pip install torch torchvision`

---

## Giai Đoạn 2: Tải Model AI Real-ESRGAN

### 2.1 Tải weights
Truy cập: https://github.com/xinntao/Real-ESRGAN/releases

Tải file: `RealESRGAN_x4plus.pth` (~65MB)

### 2.2 Đặt vào thư mục
```
python_core/weights/RealESRGAN_x4plus.pth
```

### 2.3 Kiểm tra GPU
```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

---

## Giai Đoạn 3: Thiết Lập Phần Cứng

### USB Capture Card
1. Cắm USB Capture Card vào máy tính
2. Kết nối đầu ra video máy nội soi vào Capture Card
3. Kiểm tra Camera index:
```python
from endoscopy_core import EndoscopyCore
print(EndoscopyCore.list_cameras())
```

### Bàn đạp USB (Pedal)
- Bàn đạp giả lập phím: cắm vào USB, không cần driver
- Mặc định lắng nghe F12, F10, Space
- Thay đổi phím tắt trong `trigger_system.py` → `KeyboardTrigger(trigger_keys=['f12'])`

### Cổng COM (Serial)
```python
from trigger_system import SerialTrigger
print(SerialTrigger.list_com_ports())
# Cập nhật port trong endoscopy_core.py
```

### Microphone USB Capture
```python
from trigger_system import AudioTrigger
print(AudioTrigger.list_audio_devices())
# Chọn index đúng của USB Capture Card
```

---

## Giai Đoạn 4: Chạy Phần Mềm

### Chạy Python Core độc lập
```bash
cd python_core
python endoscopy_core.py
```

### Chạy DMH_Tools (Electron + React, Tab Nội Soi)
```bash
# Trong thư mục gốc DMH_Tools_v3.2
npm run electron:dev

# Đồng thời chạy Python Core (terminal khác)
python python_core/endoscopy_core.py
```

---

## Giai Đoạn 5: Cấu Hình Trigger

Trong file `endoscopy_core.py`, hàm `configure_triggers`:
```python
core.configure_triggers(
    keyboard=True,
    image=True,
    audio=True,
    serial=False,
    audio_freq=1000.0,  # Tần số tiếng bíp của máy nội soi (Hz)
    serial_port="COM3",
    template_path="path/to/camera_icon.png"  # Icon máy ảnh để nhận diện
)
```

### Hiệu chỉnh tần số tiếng bíp
1. Ghi âm tiếng bíp của máy nội soi
2. Phân tích tần số bằng Audacity hoặc:
```python
import sounddevice as sd; import numpy as np
from scipy.fft import rfft, rfftfreq
# Đo và tìm peak frequency
```

---

## Giai Đoạn 6: Đóng Gói .exe (PyInstaller)

```bash
pip install pyinstaller

# Đóng gói
pyinstaller --onedir --windowed \
  --add-data "weights;weights" \
  --add-data "templates;templates" \
  --name "DMH_NoiSoi_Core" \
  endoscopy_core.py
```

Kết quả: thư mục `dist/DMH_NoiSoi_Core/` có thể copy sang máy phòng khám.

---

## Dữ Liệu Lưu Trữ

```
~/DMH_NoiSoi_Data/
├── patients.db          # SQLite database
├── logs/                # Log file theo ngày
└── 2026/
    └── 05/
        └── 11/
            └── BN001_NguyenVanA/
                ├── originals/       # Ảnh gốc 1080p
                ├── processed_4k/   # Ảnh AI 4K
                ├── thumbnails/      # Thumbnail Gallery
                └── reports/         # File Word/PDF
```

---

## Yêu Cầu Phần Cứng Tối Thiểu

| Thành phần | Tối thiểu | Khuyến nghị |
|-----------|-----------|-------------|
| OS | Windows 10 64-bit | Windows 11 64-bit |
| CPU | Core i5-10400 | Core i7-12700 |
| RAM | 16 GB | 32 GB |
| GPU | NVIDIA GTX 1650 (4GB VRAM) | RTX 3060 (12GB VRAM) |
| Storage | SSD 256GB | SSD 512GB+ |

> ⚠️ **Bắt buộc phải có GPU NVIDIA** để Real-ESRGAN chạy < 1 giây/ảnh.
> Nếu chạy CPU, mỗi ảnh mất 30-120 giây.
