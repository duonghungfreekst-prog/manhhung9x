# 📘 HƯỚNG DẪN SỬ DỤNG DMH_TOOLS v4.8

DMH_Tools v4.8 là bộ công cụ chuyên dụng hỗ trợ xử lý dữ liệu hồ sơ, tích hợp AI y tế và quản lý hàng đợi phòng khám.

---

## 🔑 Hướng Dẫn Kích Hoạt Phần Mềm

1. Khi mở ứng dụng lần đầu, bạn sẽ thấy giao diện **Chưa Kích Hoạt**.
2. Yêu cầu Quản trị viên (Admin) mở file `DMH_KeyGen_ADMIN.html` để tạo mã.
3. Trong giao diện KeyGen, Admin sẽ chọn các phân hệ bạn được phép sử dụng.
4. Copy đoạn mã **License Key** do Admin cung cấp và dán vào ô **Nhập License Key**.
5. Nhấn **Xác Nhận**. Các tính năng được cấp phép sẽ tự động hiển thị ở **đầu danh sách** menu bên trái.

---

## 🔊 Cài Đặt Giọng Nói Tiếng Việt (TTS) — Chỉ Làm 1 Lần

> **Tính năng Gọi Bệnh Nhân** sử dụng giọng nữ tiếng Việt tự nhiên. Cần cài thêm module TTS trước khi dùng.

### Thứ Tự Ưu Tiên Giọng Nói:

| # | Giọng | Yêu cầu | Chất lượng |
|---|-------|---------|------------|
| 1 | **HoaiMy Neural** (edge-tts) | Python + Internet | ⭐⭐⭐⭐⭐ Tốt nhất |
| 2 | **Microsoft An** (SAPI) | Có sẵn Windows 10/11 | ⭐⭐⭐ Offline |
| 3 | **gTTS Google** | Python + Internet | ⭐⭐⭐ Dự phòng |
| 4 | **Web Speech API** | Chromium tích hợp | ⭐⭐ Fallback cuối |

### Cách Cài Đặt (Khuyến Nghị):

**Bước 1:** Cài Python 3.10+ từ https://www.python.org/downloads/
- ⚠️ Tick chọn **"Add Python to PATH"** trong lúc cài!

**Bước 2:** Sau khi cài DMH_Tools, tìm và chạy file:
```
C:\Program Files\DMH_Tools\resources\scripts\install_tts.bat
```
Hoặc trong thư mục cài đặt: `resources\scripts\install_tts.bat`

**Bước 3:** Khởi động lại DMH_Tools. Hệ thống tự động dùng giọng tốt nhất có sẵn.

> **Không muốn cài Python?** Phần mềm vẫn hoạt động với giọng **Microsoft An** tích hợp sẵn trong Windows 10/11 (không cần internet, không cần Python).

---

## 📢 1. GỌI BỆNH NHÂN HIS & MÀN CHỜ TV

*Tích hợp trực tiếp với CSDL Phòng Khám để tự động gọi tên bằng giọng nói (TTS) và hiển thị lên TV chờ.*

**Cấu hình kết nối với phần mềm HIS:**

1. **IP Máy Bảng Hàng Đợi:** Nhập đúng IP của máy cài 9router (Ví dụ: `192.168.3.249`).
2. **Port:** Port của 9router — mặc định DMH_Tools dùng **`98989`**.
3. **Mã Bảng Hiển Thị:** Mã hiển thị bảng LED (Ví dụ: `B01`).
4. **Mã Nơi Thực Hiện (Phòng):** Mã phòng để lọc danh sách BN (Ví dụ: `2` hoặc `2,3,5` nhiều phòng).
5. **Chuỗi kết nối SQL Server:** Kết nối tới Database HIS (VD: `Server=192.168.1.xxx;Database=Tên_DB;User Id=sa;Password=mat_khau;TrustServerCertificate=true;`).
6. **Logo Phòng Khám:** Bấm **[+ Chọn ảnh logo từ máy tính]**.
7. Bấm **[💾 Lưu & Áp Dụng]**, rồi bấm **[Test TCP]** và **[Test DB]** để kiểm tra kết nối.

**Sử dụng hàng ngày:**
1. Bấm **[📺 MỞ MÀN CHỜ (MÀN 2)]** để mở TV màn chờ trên màn hình phụ.
2. Bấm **[▶ GỌI TIẾP THEO]** — phần mềm đọc tên và cập nhật bảng LED + TV đồng thời.
3. Bấm **[🔔 GỌI LẠI]** nếu bệnh nhân chưa vào.

> **Lưu ý 9router:** Phần mềm tự động **retry 1 lần sau 1.5 giây** nếu lần gửi đầu thất bại. Xem trạng thái TCP trong ô **Nhật Ký**.

---

## 📷 2. NỘI SOI AI 4K

*Hỗ trợ bác sĩ nội soi chụp ảnh sắc nét, tăng cường ảnh bằng AI (Real-ESRGAN) và in báo cáo.*

1. **Kết nối Server:** Khi mở tab, phần mềm tự kết nối với lõi AI (chữ `Python: Đang chạy`).
2. **Khai báo Bệnh Nhân:** Điền thông tin BN, nhấn **[Lưu & Tạo Báo Cáo]**.
3. **Chụp Ảnh:** Bấm **[Bắt đầu Camera]** rồi **[📸 Chụp]** để lưu hình.
4. **Nâng Cấp AI:** Chọn ảnh, bấm **[✨ Nâng cấp 4K (AI)]**.
5. **Phóng To:** Nhấn biểu tượng kính lúp để xem toàn màn hình.

---

## 📊 3. CHẤM CÔNG BÁC SĨ

*Tự động đếm ngày đi làm của bác sĩ từ dữ liệu HIS.*

1. Nhấn **[Mở File (Excel/CSV)]** và chọn file lịch sử khám.
2. Hệ thống tính: nhiều giờ khám trong 1 ngày = **1 ngày công**.
3. Xem **Bảng Tóm Tắt** hoặc **Lưới Chấm Công Tháng** (Thứ 7/CN tô đỏ).
4. Nhấn **[Xuất Excel]** để lưu báo cáo.

---

## 📝 4. ĐỐI CHIẾU HỒ SƠ

1. Chọn **[Tải file Cột A]** (dữ liệu nội bộ).
2. Chọn **[Tải file Cột B]** (dữ liệu BHYT / XML).
3. Bấm **[Bắt Đầu Đối Chiếu]** để dò tìm bệnh nhân bị lệch thông tin.

---

## 📂 5. ĐỌC XML / CSV

1. Kéo thả file XML hoặc CSV vào vùng trống.
2. Dữ liệu hiển thị dạng bảng tính. Dùng thanh tìm kiếm để tìm nhanh.

---

## 🔄 6. CHUYỂN ĐỔI FILE

1. Tải lên file (.xml, .csv, .xlsx).
2. Chọn định dạng đầu ra.
3. Bấm **[Tải xuống tất cả]**.

---

## 🔍 7. LỌC DỮ LIỆU

1. Tải file lên, chọn trường cần kiểm tra lặp (ví dụ: `Ma_Benh_Nhan`, `CCCD`).
2. Phần mềm gom nhóm các dòng bị trùng và báo đỏ.

---

## 🖨 8. MÁY IN & CỨU HỘ IN MẠNG LAN

1. **Quản lý danh sách máy in:** Theo dõi trạng thái Online/Offline, hàng đợi lệnh in, driver và cổng in của từng máy in.
2. **Đặc trị Lỗi 40 (0x00000040 - The specified network name is no longer available):**
   - Thường gặp khi chia sẻ máy in giữa 2 phiên bản Windows khác nhau (Win 7/10 ↔ Win 10/11) do chính sách bảo mật **Point and Print Restrictions** và cơ chế RPC chặn nạp driver qua mạng, kết hợp cơ chế bắt buộc SMB Signing của Windows 11.
   - **Cách 1 - Sửa tự động 1-Click:** Bấm nút **[⚡ Sửa Tự Động 1-Click]** tại thẻ *Lỗi 40 (0x00000040)*. Phần mềm sẽ tự động vô hiệu hóa Point & Print Restrictions, cấu hình RPC Named Pipe, tắt SMB Signing và khởi động lại Print Spooler (hỗ trợ cả Windows Pro và Home).
   - **Cách 2 - Sửa thủ công qua Group Policy:**
     - Bước 1: Nhấn `Windows + R`, gõ `gpedit.msc` rồi Enter trên máy con bị lỗi.
     - Bước 2: Vào `Computer Configuration > Administrative Templates > Printers`.
     - Bước 3: Nhấp đúp vào `Point and Print Restrictions`, chọn `Disabled`, nhấn Apply và OK.
     - Bước 4: Nhấn `Windows + R`, gõ `services.msc` > tìm dịch vụ `Print Spooler` > chuột phải chọn `Restart`.
3. **Đặc trị Lỗi 0x00000709 & 0x0000011b:** Bấm nút **[⚡ Sửa Tự Động 1-Click]** hoặc dùng **[🌐 Kết Nối Bằng Local Port]** để tạo cổng in cục bộ qua mạng, in mượt mà 100% không lo lỗi RPC từ xa.
4. **Cứu hộ kẹt lệnh & Spooler:** Xóa sạch lệnh in kẹt, phân quyền thư mục Spooler và chuyển máy in về Online (tắt lỗi SNMP ảo).

---

## 🛠 9. SỬA FILE

*Dùng khi mở file Excel hoặc XML bị báo lỗi "Corrupted".*
1. Tải file bị lỗi vào.
2. Chọn thuật toán sửa chữa.
3. Bấm tải xuống file đã phục hồi.

---

## 🤖 10. SELF-BUILT 01 (Cấu trúc XML)

1. Tải 1 file XML lên để phần mềm vẽ cây cấu trúc thư mục (Tree View).
2. Chỉnh sửa trực tiếp từng thẻ (Tag) và lưu lại chuẩn format Bộ Y Tế.

---
*Phát triển bởi nhóm DMH Hospital Tools — Phiên bản v4.8.0 (2026).*
