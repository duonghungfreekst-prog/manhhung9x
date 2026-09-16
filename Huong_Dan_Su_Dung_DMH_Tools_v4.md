# 📘 HƯỚNG DẪN SỬ DỤNG DMH_TOOLS v6.9.4

DMH_Tools v6.9.4 là bộ công cụ chuyên dụng hỗ trợ xử lý dữ liệu hồ sơ, cứu hộ máy in toàn diện (đặc trị triệt để lỗi 0x00000709, 0x0000011b, 0x00000040), tích hợp AI y tế và quản lý hàng đợi phòng khám.

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

## 🖨 8. MÁY IN & CỨU HỘ IN MẠNG LAN (BẢN NÂNG CẤP V6.9.4 ĐẶC TRỊ 709 TỪ A-Z)

1. **Quản lý danh sách máy in:** Theo dõi trạng thái Online/Offline, hàng đợi lệnh in, driver và cổng in của từng máy in.
2. **Hệ Thống Tự Động Chẩn Đoán & Khắc Phục Lỗi 0x00000709 Thông Minh (11 Tiêu Chuẩn Kỹ Thuật):**
   - **Tự động quét & đánh giá:** Kiểm tra tự động 11 tiêu chí: Dịch vụ Print Spooler, Cấu hình RPC qua Named Pipes (`RpcAuthnLevelPrivacyEnabled`, `RpcOverTcp`, `RpcOverNamedPipe`), Khai báo danh sách Printer Remote RPC Pipes, Chính sách Point and Print (`RestrictDriverInstallationToAdministrators`), Phân quyền Registry nhánh Windows NT (`Devices`, `PrinterPorts`, `Windows`), Quyền quản lý máy in của Windows (`LegacyDefaultPrinterMode`), Trạng thái Firewall mở File & Printer Sharing (Cổng 445, 139, 135), Cấu hình SMB Guest Auth & Insecure Guest Logons, Trạng thái phân quyền thư mục spool `C:\Windows\System32\spool\PRINTERS`, Khai báo danh tính Windows Credentials với máy chủ.
   - **Bấm 1-Click Đặc Trị Toàn Diện:** Tự động sửa chữa và đồng bộ toàn bộ 11 tiêu chí, tự khởi động lại Spooler để áp dụng ngay mà không cần khởi động lại máy tính.
3. **Sửa Lỗi Đặt Máy In Mặc Định (Set as Default Printer Error 0x00000709):**
   - **Nguyên nhân:** Windows không ghi được tên máy in vào Registry khóa `HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Windows` do kẹt quyền sở hữu hoặc cấu hình tự quản lý máy in mặc định của Windows 10/11 (`LegacyDefaultPrinterMode`).
   - **Khắc phục 1-Click:** Phân quyền Full Control cho tài khoản người dùng hiện tại và Administrators, tắt cơ chế Windows tự đổi máy in mặc định, ghi thẳng giá trị `Device` chính xác.
4. **Khai Báo Danh Tính Windows Credentials (1-Click - Thực chiến Sài Gòn Computer):**
   - Khi kết nối máy in qua mạng LAN, nếu máy chủ yêu cầu xác thực hoặc ngắt phiên RPC, chỉ cần nhập IP máy chủ và bấm **[Lưu & Xác Thực 1-Click]**. DMH_Tools sẽ tự động nạp thông tin mạng qua `cmdkey` và thiết lập phiên `IPC$` tức thì.
5. **Cảnh Báo Về Việc Chép Đè File DLL Trôi Nổi (win32spl.dll):**
   - Tuyệt đối không tải các file `win32spl.dll` từ nguồn trôi nổi trên mạng để chép đè vào `System32`. Việc này gây xung đột làm crash liên tục dịch vụ Spooler (`spoolsv.exe`), gây lỗi màn hình xanh hoặc mất tác dụng ngay khi Windows Update. DMH_Tools áp dụng giải pháp chuẩn Registry kết hợp Local Port an toàn và ổn định vĩnh viễn 100%.
6. **Đặc trị Lỗi 40 (0x00000040 - The specified network name is no longer available):**
   - Cung cấp công cụ xuất file `.bat` cấu hình tự động cho máy chủ (kích hoạt tài khoản Guest, mở Private Network và Firewall cổng 445).
   - Trên máy con: Tự động dọn cache SMB, mở Guest Logons và cấu hình SMB Signing.
7. **Giải Pháp Local Port Bất Tử 100%:**
   - Khi mạng LAN bị giới hạn chính sách ngặt nghèo hoặc Windows Update chặn RPC, sử dụng công cụ tạo cổng cục bộ `\\IP\PrinterShare` để in trực tiếp, bỏ qua hoàn toàn các mã lỗi 0x00000709, 0x0000011b, 0x00000040.
8. **Cứu hộ kẹt lệnh & Spooler:** Xóa sạch lệnh in kẹt trong hàng đợi, phân quyền lại thư mục spool và chuyển máy in về Online (tắt lỗi SNMP ảo).

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
*Phát triển bởi nhóm DMH Hospital Tools — Phiên bản v6.9.4 (2026).*
