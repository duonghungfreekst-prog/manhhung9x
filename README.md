# DMH_Tools v7 Enterprise
### Hệ Thống Trợ Lý Kỹ Thuật Số, Chẩn Đoán Y Tế & Cứu Hộ Máy Tính Chuyên Sâu

[![Version](https://img.shields.io/badge/version-7.0.0-blue.svg)](https://github.com/duonghungfreekst-prog/manhhung9x)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011%20%7C%20Server-lightgrey.svg)](https://github.com/duonghungfreekst-prog/manhhung9x)
[![Electron](https://img.shields.io/badge/Electron-42.0.1-brightgreen.svg)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2.5-cyan.svg)](https://react.dev/)
[![License](https://img.shields.io/badge/Security-Ed25519%20Signed-orange.svg)](https://github.com/duonghungfreekst-prog/manhhung9x)

---

## 1. Tổng Quan Dự Án

**DMH_Tools** là giải pháp phần mềm máy tính chuyên dụng được thiết kế cho môi trường y tế, phòng khám đa khoa, bệnh viện và các kỹ thuật viên IT. Ứng dụng giải quyết bài toán phức hợp giữa **quản lý dữ liệu khám chữa bệnh (HIS/BHYT)**, **nội soi can thiệp hình ảnh y tế chuẩn 4K**, **điều khiển tự động thiết bị phần cứng (Máy in mã vạch, máy chấm công, camera DirectShow)** và **bộ công cụ cứu hộ hệ điều hành Windows**.

Phiên bản **v7 Enterprise** đánh dấu bước chuyển mình quan trọng về mặt kiến trúc: xóa bỏ hoàn toàn các god-files, module hóa 100% IPC, chuyển đổi cơ sở dữ liệu nội soi sang SQLite chuẩn ACID và áp dụng chữ ký số bất đối xứng Ed25519.

---

## 2. Bản Đồ Kiến Trúc Hệ Thống (Architecture Blueprint)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           REACT 19 UI LAYER                             │
│       Vite • TypeScript • TailwindCSS • Lucide Icons • Code-Splitting   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  Typed Contract (electronAPI.*)
┌────────────────────────────────────▼────────────────────────────────────┐
│                    ELECTRON PRELOAD & IPC GATEWAY                       │
│     Typed Namespaces: his • endoscopy • printer • biometric • license    │
└──────────────────┬──────────────────┬──────────────────┬────────────────┘
                   │                  │                  │
         ┌─────────▼────────┐ ┌───────▼────────┐ ┌───────▼────────┐
         │ SERVICES LAYER   │ │ REPOSITORIES   │ │ SECURITY GUARD │
         │ • PrinterRepair  │ │ • EndoscopyRepo│ │ • AuditLogger  │
         │ • TtsService     │ │   (SQLite WAL) │ │   (CRLF safe)  │
         │ • PythonManager  │ │ • HisRepo      │ │ • PSSandbox    │
         │ • BiometricNet   │ │   (MSSQL Pool) │ │ • PathValidator│
         └─────────┬────────┘ └───────┬────────┘ └───────┬────────┘
                   │                  │                  │
┌──────────────────▼──────────────────▼──────────────────▼────────────────┐
│                           CORE OS & ENGINES                             │
│   Windows API • SQLite 3 • SQL Server HIS • Python Core • ZKTeco UDP    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Danh Mục 15 Phân Hệ Cốt Lõi

| # | Phân Hệ | Mô Tả & Năng Lực Kỹ Thuật |
|:---|:---|:---|
| 1 | **Đối Chiếu Hồ Sơ BHYT** | Đối chiếu tự động hồ sơ XML (3176, 4210) với dữ liệu xuất từ phần mềm HIS; phát hiện sai lệch chi phí, thuốc, VTYT, ngày giường với độ chính xác tuyệt đối. |
| 2 | **Nội Soi AI 4K** | Bắt hình camera y tế UVC/DirectShow độ phân giải tới 4K. CSDL nhúng **SQLite WAL Mode** quản lý bệnh nhân, phiên khám, hình ảnh kèm mã băm SHA-256 bảo vệ toàn vẹn. Hỗ trợ sao lưu/khôi phục tệp nén `.dmhbk`. |
| 3 | **Gọi Bệnh Nhân HIS & TV** | Kết nối trực tiếp SQL Server bệnh viện qua Connection Pool tối ưu B-Tree Index (`WHERE ngaydk >= @start AND ngaydk < @end`). Tích hợp đọc loa giọng Việt tự nhiên (Piper TTS Offline) và xuất màn hình chờ TV. |
| 4 | **Máy In & Spooler** | Chẩn đoán lỗi in ấn 3 cấp độ (Diagnostic -> Safe Fix -> Advanced Fix). Tự động cấu hình cài đặt máy in nhiệt Xprinter, sửa lỗi chia sẻ mạng `0x0000011b`, dọn dẹp hàng đợi kẹt và sao lưu Registry trước khi can thiệp. |
| 5 | **Máy Chấm Công & Phân Ca**| Giao tiếp thiết bị sinh trắc ZKTeco / Ronald Jack qua giao thức UDP/TCP mạng LAN. Quản lý tải log điểm danh, đồng bộ giờ, kiểm soát cửa ra vào có whitelist IP và ghi nhật ký kiểm toán. |
| 6 | **Ký Số XML BHYT** | Ký số USB Token (Viettel, VNPT, FPT, BKAV) chuẩn XML-DSig trực tiếp lên gói dữ liệu hồ sơ khám chữa bệnh bảo hiểm y tế. |
| 7 | **Kỹ Thuật Máy Tính & Cứu Hộ**| Bộ công cụ tối ưu Windows, sửa lỗi mạng, tắt update ép buộc, quản lý tường lửa, quét cấu hình phần cứng có kiểm soát quyền UAC và Sandbox ngăn chặn mã độc. |
| 8 | **Đọc XML / CSV** | Trình đọc và phân tích cấu trúc cây dữ liệu hồ sơ y tế chuyên dụng. |
| 9 | **Chuyển Đổi File** | Chuyển đổi hai chiều giữa Excel, CSV, JSON, XML tốc độ cao. |
| 10 | **Lọc Dữ Liệu Chuyên Sâu** | Bộ lọc dữ liệu bảng nhiều điều kiện, hỗ trợ xuất báo cáo chuẩn ngành y tế. |
| 11 | **Sửa File Dữ Liệu** | Khôi phục cấu trúc các tệp Excel, XML bị hỏng hoặc lỗi định dạng UTF-8 / XML encoding. |
| 12 | **Self-Built 01** | Công cụ đối chiếu tổng hợp dữ liệu bảo hiểm y tế nội bộ. |
| 13 | **Kiểm Tra BHYT** | Tra cứu và xác thực thẻ bảo hiểm y tế trực tuyến. |
| 14 | **Đối Chiếu 01BH** | Khớp dữ liệu thanh toán viện phí theo mẫu 01/BV của Bộ Y Tế. |
| 15 | **Công Thức Office** | Thư viện tra cứu và sinh tự động công thức tính toán chuyên sâu cho Excel y tế. |

---

## 4. Bảo Mật & Tiêu Chuẩn Kỹ Thuật Doanh Nghiệp

### 4.1. Cơ Chế Bản Quyền Chữ Ký Bất Đối Xứng Ed25519
- **Public-Key Cryptography (RFC 8410)**: Ứng dụng Client (`DMH_Tools`) chỉ chứa **Public Key** dùng để xác minh tính hợp lệ của giấy phép. Không chứa bất kỳ Secret hay Private Key nào.
- **Private Key Isolation**: Khóa bí mật ký số chỉ được lưu trữ an toàn tại máy chủ phát hành / công cụ Quản Trị Admin (`scripts/generate_license.cjs`). Kẻ tấn công dù dịch ngược toàn bộ mã nguồn cũng không thể giả mạo chữ ký bản quyền.
- **HWID Locking**: Khóa bản quyền được gắn chặt với Hardware Fingerprint (Mainboard Serial, CPU ID, UUID).
- **Lưu trữ Cục Bộ An Toàn**: Chuỗi bản quyền dự phòng được tự động mã hóa bằng **AES-256-GCM** với khóa dẫn xuất trực tiếp từ HWID máy trạm.

### 4.2. Cơ Sở Dữ Liệu SQLite Chuẩn ACID (Native Zero-Dependency)
- **Engine**: Sử dụng module tích hợp chuẩn nhân Node.js core **`node:sqlite` (DatabaseSync)**, không phụ thuộc package nhị phân bên ngoài (như `better-sqlite3` hay `sqlite3`), loại bỏ hoàn toàn rủi ro lỗi biên dịch `node-gyp` trên Windows.
- **WAL Mode (Write-Ahead Logging)**: Hỗ trợ đọc ghi đồng thời cực đại, chống nghẽn I/O khi lưu trữ hàng nghìn khung hình y tế.
- **Foreign Key Constraints**: Bảo đảm toàn vẹn tham chiếu bệnh nhân - phiên khám - hình ảnh y tế.

### 4.3. Preload An Toàn Tuyệt Đối & Chromium Sandbox
- **Zero-Backdoor IPC**: Đã loại bỏ 100% hàm generic `electronAPI.invoke()`. Toàn bộ 15 phân hệ đều bắt buộc giao tiếp qua **Typed Namespace** (`electronAPI.his.*`, `electronAPI.endoscopy.*`, `electronAPI.printer.*`, `electronAPI.pctools.*`, v.v.).
- **Chromium Sandbox Kích Hoạt**: Tất cả các cửa sổ `BrowserWindow` đều thiết lập `sandbox: true`, ngăn chặn mọi mã độc nếu có từ renderer thoát ra hệ điều hành.

### 4.4. Bảo Vệ Python IPC với Dynamic Port & Session Token Bearer Auth
- **Cổng Động (Dynamic Port Allocation)**: Thay vì cố định cổng (27182, 27183, 27185), ứng dụng tự động cấp phát cổng rảnh ngẫu nhiên khi khởi chạy.
- **Session Token**: Mã phiên ngẫu nhiên `DMH_SESSION_TOKEN` (32 bytes crypto) được sinh mới mỗi lần mở app. Mọi request HTTP từ Electron sang Python bắt buộc phải có header `Authorization: Bearer <token>`, từ chối 401 với mọi truy cập trái phép.

### 4.5. Xác Thực Chuỗi Tin Cậy (Trust Manifest) Khi Tải Module
- Mọi gói module tải về hoặc bản cập nhật `.exe` / `.zip` đều được kiểm tra mã băm SHA-256 đối soát và xác thực chữ ký số Ed25519 của nhà phát hành trước khi thực thi hoặc giải nén.

### 4.6. Nhật Ký Kiểm Toán (Audit Logging)
- Toàn bộ thao tác nhạy cảm (Sửa Registry, Khởi động lại máy chấm công, Cập nhật trạng thái khám bệnh, Nạp License) đều được tự động ghi nhận vào `userData/logs/audit-YYYY-MM-DD.log`.
- Tự động lọc sạch ký tự `\r`, `\n` để ngăn chặn triệt để tấn công **Log Injection (CRLF)**.

---

## 5. Cài Đặt & Phát Triển (Development Guide)

### Yêu Cầu Môi Trường
- **Hệ điều hành**: Windows 10 / 11 / Server 2016+ (64-bit).
- **Node.js**: Phiên bản `>= 22.0.0` (Khuyến nghị Node.js LTS v24.x).
- **Python**: Phiên bản `3.10+` (Đã tích hợp sẵn Python Embed trong bản phân phối).

### Khởi Động Môi Trường Phát Triển
```powershell
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Khởi động giao diện phát triển (Vite HMR + Electron)
npm run electron:dev
```

### Kiểm Tra & Biên Dịch Mã Nguồn
```powershell
# Kiểm tra lỗi kiểu dữ liệu TypeScript và build Vite
npm run build

# Chạy linting kiểm tra quy chuẩn mã nguồn
npm run lint
```

---

## 6. Hướng Dẫn Đóng Gói Ứng Dụng (Build & Release)

Dự án cung cấp nhiều chế độ đóng gói phù hợp cho các mục đích phát hành khác nhau:

```powershell
# Đóng gói bản cài đặt tiêu chuẩn (Kèm Python Embed & Tools)
npm run electron:build

# Đóng gói bản rút gọn siêu nhẹ Slim (Tự động tải module khi cần)
npm run electron:build:slim

# Đóng gói ra thư mục Portable thực thi không cần cài đặt
npm run electron:build:dir
```

Tệp cài đặt đầu ra sẽ được lưu trữ tại thư mục: `release/` (Ví dụ: `release/DMH_Tools Setup 7.0.0.exe`).

---

## 7. Giấy Phép & Bản Quyền

Bản quyền phần mềm thuộc về **DMH_Tools Development Team**. Mọi hành vi sao chép, chỉnh sửa hoặc dịch ngược trái phép khi chưa được cấp quyền đều vi phạm pháp luật sở hữu trí tuệ.
