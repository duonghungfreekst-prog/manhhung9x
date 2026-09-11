# 📦 DMH_Tools v4.6 — Release Notes
**Ngày phát hành:** 11/05/2026  
**File installer:** `release\DMH_Tools Setup 4.6.0.exe` (289 MB)  
**Build:** Thành công ✅ | Exit code: 0

---

## 🆕 Thay đổi trong v4.6

### 🔧 Tab Chấm Công Bác Sĩ — 2 fix UI quan trọng

#### Fix 1: Dropdown chọn cột hiển thị đầy đủ tên trường (Ô số 1)
- **Trước (v4.5):** Preview bị cắt ngắn sau 35 ký tự → mất thông tin quan trọng
- **Sau (v4.6):** Tăng giới hạn lên **60 ký tự** — hiển thị đầy đủ tên trường như:
  - `Họ tên bệnh nhân — NGUYỄN THỊ NGA`
  - `Triệu chứng — Bệnh nhân mệt mỏi, ăn uống kém, tê...`
  - `Cách giải quyết/Chuyển (đánh dấu x vào ô tương ứng...`
- Các option trong dropdown đọc được rõ ràng, không bị cắt giữa chừng

#### Fix 2: Header lưới chấm công hiển thị cả ngày lẫn tháng (Ô số 2)
- **Trước (v4.5):** Chỉ hiển thị số ngày thuần: `1 2 3 4 ... 30`
- **Sau (v4.6):** Mỗi ô header hiển thị **2 dòng**:
  - Dòng trên: số ngày (đậm, màu theo thứ)
  - Dòng dưới: `/tháng` nhỏ hơn — ví dụ `/4`
- Cuối tuần (T7, CN) vẫn giữ màu đỏ
- Header xuất Excel cũng cập nhật: `01/04`, `02/04`... thay vì `01`, `02`...

---

## ✅ Kiểm tra kỹ thuật

| Hạng mục | Kết quả |
|---|---|
| TypeScript compile | ✅ Không lỗi |
| Vite build (1778 modules) | ✅ 1.61s |
| Electron packaging win32 x64 | ✅ |
| NSIS installer ký số | ✅ |
| File output | ✅ `DMH_Tools Setup 4.6.0.exe` (289 MB) |

---

## 🐛 Bugs đã fix trong v4.6

| # | Bug | Tab | Trạng thái |
|---|---|---|---|
| 1 | Dropdown cột bị cắt ngắn tên trường sau 35 ký tự | Chấm Công | ✅ Fixed |
| 2 | Header lưới chỉ hiển thị số ngày, thiếu tháng | Chấm Công | ✅ Fixed |

---

## 📜 Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung chính |
|---|---|---|
| v4.6.0 | 11/05/2026 | Fix dropdown + header lưới chấm công |
| v4.5.0 | 11/05/2026 | Fix tên cột thực, xuất Excel đúng thứ tự, logo vuông |

---

> **Lưu ý:** Chạy `npm run electron:build` để tạo installer. Sau khi build xong cập nhật bảng kích thước file.
