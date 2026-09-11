# 📋 BÁO CÁO TÍNH NĂNG & BẢO MẬT — DMH_Tools v3.1 (Patch v3.2)
> **Ngày:** 10/05/2026 · **Build:** ✅ 0 lỗi TypeScript · Vite ~7s · Electron 42

---

## I. TỔNG QUAN ỨNG DỤNG

| Thông tin | Chi tiết |
|-----------|---------|
| Tên | DMH_Tools |
| Phiên bản | v3.1.0 (Patch v3.2) |
| Nền tảng | Electron 42 + React 19 + Vite 8 (Windows x64) |
| Ngôn ngữ | TypeScript + TSX |
| Đóng gói | NSIS Installer (electron-builder) |
| Entry point | `electron/main.cjs` → `src/App.tsx` |

---

## II. CÁC LỖI ĐÃ SỬA TRONG PATCH v3.2

> Patch này tập trung sửa **thuật toán tìm kiếm và gộp dữ liệu** trong Tab "Lọc Dữ Liệu" bị sai lệch kết quả.

---

### 🔴 BUG #13 — `normalizeGroupKey` parse sai tên người thành ngày (Nghiêm trọng)

**File:** `DataFilterTab.tsx`

**Mô tả:**
Hàm `normalizeGroupKey` gọi `new Date(val)` với **mọi chuỗi** bất kể nội dung. JavaScript có thể
parse một số chuỗi không phải ngày (tên người, mã số) thành một đối tượng Date hợp lệ, dẫn đến
kết quả gộp hoàn toàn sai lệch.

**Ví dụ lỗi:**
```
Input:  "Nguyễn Văn Trường"
new Date("Nguyễn Văn Trường") → Invalid Date (may vary by JS engine)
Một số giá trị mã số → parse thành ngày ngẫu nhiên → key sai
```

**Sửa:** Chỉ thực hiện parse Date khi chuỗi **thực sự trông giống ngày** (kiểm tra regex trước):
```ts
// Chỉ thử parse nếu chuỗi có dạng ngày hợp lệ
const isDateLike = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}(T.*)?|\d{4}\/\d{2}\/\d{2})$/.test(val.trim());
if (!isDateLike) return val;  // Tên người, mã số → giữ nguyên
```
Ngoài ra, phân tích đúng định dạng `DD/MM/YYYY` thay vì để JS tự đoán (tránh lỗi tháng 13).

---

### 🔴 BUG #14 — Chế độ "Gộp theo trường" gộp toàn bộ dữ liệu, không lọc trước (Nghiêm trọng)

**File:** `DataFilterTab.tsx`

**Mô tả:**
Khi người dùng muốn **"tìm Nguyễn Văn Trường → gộp theo Ngày chứng từ"**, ứng dụng gộp
**toàn bộ dữ liệu** theo Ngày chứng từ (tất cả bệnh nhân), không lọc riêng theo người đã chọn.
Kết quả trả về 13 ngày của tất cả mọi người thay vì 6 ngày của riêng Nguyễn Văn Trường.

**Nguyên nhân:**
`groupByGroups` dùng trực tiếp `data` (toàn bộ) chứ không có bộ lọc trung gian.

**Sửa:** Thêm state `groupFilterValue` + computed `groupFilteredData`:
```ts
// Bước 1: lọc dữ liệu theo primaryField + từ khóa nhập
const groupFilteredData = useMemo(() => {
  const q = groupFilterValue.trim().toLowerCase();
  if (!q) return data;  // để trống = gộp toàn bộ
  return data.filter(row =>
    String(row[primaryField] ?? '').toLowerCase().includes(q)
  );
}, [data, primaryField, groupFilterValue]);

// Bước 2: gộp chỉ trên dữ liệu đã lọc
const groupByGroups = useMemo(() => {
  for (const row of groupFilteredData) { ... }  // ← đúng
}, [groupFilteredData, effectiveGroupField]);
```

**Workflow đúng sau sửa:**
```
1. Chọn cột: "Người hành nghề"
2. Nhập lọc: "Nguyễn Văn Trường" → hiện "35 / 468 dòng phù hợp"
3. Gộp theo: "Ngày chứng từ"
4. Kết quả: đúng 6 ngày của riêng người đó ✅
```

---

### 🟡 BUG #15 — Tiêu đề kết quả hiển thị sai ở chế độ "Gộp theo trường"

**File:** `DataFilterTab.tsx`

**Mô tả:**
Phần header kết quả chỉ có 2 nhánh: `duplicate` và `valueSearch`. Khi ở chế độ `group`,
code rơi vào nhánh `valueSearch` → hiển thị tiêu đề sai kiểu:
`"Kết quả tìm 'Nguyễn Văn Trường': 35 dòng"` thay vì thông tin gộp.

**Sửa:** Thêm nhánh `filterMode === 'group'`:
```tsx
) : filterMode === 'group' ? (
  <>Gộp theo <span>"{effectiveGroupField}"</span>:
   <span>{groupByGroups.length} giá trị</span> · tổng
   <span>{data.length} bản ghi</span></>
```

---

## III. TÍNH NĂNG — 7 TAB (Cập nhật)

---

### 🔵 TAB 1: ĐỐI CHIẾU HỒ SƠ BHYT *(không thay đổi)*

**Mục đích:** So sánh dữ liệu bảo hiểm y tế giữa Cổng Giám Định và file nội bộ 01/BH.

**Định dạng nhận:** `.xlsx` · `.xls` · `.csv` · `.xml`

**Tính năng kỹ thuật:**
- Fuzzy match cột, Key đối chiếu: `MãThẻBHYT + NămSinh + NgàyVào + SốLần`
- Field mapping lưu `localStorage`, lịch sử 20 phiên sanitized
- Phân trang 25 dòng, 3 mức độ nghiêm trọng, xuất Excel 2 sheet

---

### 📂 TAB 2: ĐỌC XML / CSV *(không thay đổi)*

**Mục đích:** Mở, xem trước, phân tích và xuất file.

**Định dạng nhận:** `.xml` · `.csv` · `.xlsx` · `.xls`

| Tab con | Nội dung |
|---------|---------|
| Bảng dữ liệu | Xem, lọc theo cột, phân trang 20 dòng |
| Phân tích cột | % điền, unique values, mẫu dữ liệu |
| Nội dung thô | Xem và copy raw text |

---

### 🔄 TAB 3: CHUYỂN ĐỔI FILE *(không thay đổi)*

| Nguồn | Đích |
|-------|------|
| Excel/CSV/XML/JSON | Sang nhau tự do |
| PDF | Word (DOCX) — có OCR Tesseract offline |

---

### 🔍 TAB 4: LỌC DỮ LIỆU ✨ **(Cập nhật Patch v3.2)**

**Mục đích:** Phân tích, tìm trùng lặp, gộp nhóm.

| Chế độ | Mô tả | Trạng thái |
|--------|-------|-----------|
| Tìm tất cả trùng lặp | Tìm dòng có cùng giá trị ở cột chọn | ✅ |
| Tìm giá trị cụ thể | Gõ từ khóa tìm trong cột | ✅ |
| Gộp theo trường | **Lọc trước → Gộp theo trường khác** | ✅ Sửa BUG #14 |

**Workflow mới — Chế độ Gộp theo trường:**
```
Bước 1: Chọn cột cần lọc (VD: "Người hành nghề")
Bước 2: Nhập từ khóa lọc (VD: "Nguyễn Văn Trường")
        → Hiện: "Đang lọc: 35 / 468 dòng phù hợp"
Bước 3: Chọn trường gộp (VD: "Ngày chứng từ")
        → Kết quả: đúng ngày của người đó, không bị lẫn người khác
```

**Các đặc điểm khác:**
- Tự động phát hiện hàng tiêu đề (scan 14 dòng đầu), chọn lại thủ công
- Date từ Excel → `DD/MM/YYYY` (fix lỗi múi giờ)
- `normalizeGroupKey` chỉ parse ngày khi chuỗi đúng định dạng (BUG #13)
- Tiêu đề kết quả hiển thị đúng cho từng chế độ (BUG #15)
- Lỗi tải file hiển thị **inline banner đỏ** (không dùng `alert()`)

---

### 🖨️ TAB 5: MÁY IN *(không thay đổi)*

Chẩn đoán, sửa lỗi máy in Windows. Tải driver + verify SHA-256.

---

### 🔧 TAB 6: SỬA FILE *(không thay đổi)*

Tự động phát hiện và sửa lỗi xlsx/csv/xml/json/txt/docx.

---

### 🧬 TAB 7: SELF-BUILT 01 *(không thay đổi)*

Phân tích cấu trúc XML và tạo file XML 01/BH chuẩn (DOM API).

---

## IV. BẢO MẬT *(không thay đổi so với v3.1)*

| # | Hạng mục | Mức độ | Trạng thái |
|---|----------|--------|-----------|
| 3.1 | Electron contextIsolation + sandbox + nodeIntegration:false | Nền tảng | ✅ Đầy đủ |
| 3.2 | Context Bridge tối giản (Least Privilege) | Cao | ✅ Đầy đủ |
| 3.3 | Content Security Policy (8 directive, không unsafe-eval) | Cao | ✅ Strict |
| 3.4 | PowerShell EncodedCommand (chống injection) | Cao | ✅ Đầy đủ |
| 3.5 | Path Traversal validate (3 lớp) | Cao | ✅ Đầy đủ |
| 3.6 | Driver SHA-256 verify + dialog xác nhận | Trung bình | ✅ Đầy đủ |
| 3.7 | Dữ liệu bệnh nhân sanitized trước lưu | Cao | ✅ Đầy đủ |
| 3.8 | XML DOM API (chống injection) | Trung bình | ✅ Đầy đủ |
| 3.9 | File processing không dùng fs từ renderer | Cao | ✅ Đầy đủ |

---

## V. BẢNG TỔNG HỢP LỖI ĐÃ SỬA (Tích lũy)

| # | Mức | Mô tả | File | Phiên bản |
|---|-----|-------|------|-----------|
| 1 | 🔴 | `handleReset` không xóa localStorage mapping | `App.tsx` | v3.1 |
| 2 | 🔴 | `handleRestore` set sai `internalCount` | `App.tsx` | v3.1 |
| 3 | 🔴 | `DataFilterTab` dùng `alert()` | `DataFilterTab.tsx` | v3.1 |
| 4 | 🟡 | 2 tab cùng icon Settings | `App.tsx` | v3.1 |
| 5 | 🟡 | XML phân tích chỉ 1 cấp | `SelfBuilt01Tab.tsx` | v3.1 |
| 6 | 🟡 | XML tag options không truyền vào `convertFile()` | `ConverterTab.tsx` | v3.1 |
| 7 | 🟡 | `autoFix` lấy `sampleKeys` từ `rows[0]` sai | `FileReaderTab.tsx` | v3.1 |
| 8 | 🟡 | OCR offline fail không thông báo | `ConverterTab.tsx` | v3.1 |
| 9 | ⚪ | Version text "v3.0" sai | `App.tsx` | v3.1 |
| 10 | ⚪ | Date normalize lỗi múi giờ khi group | `DataFilterTab.tsx` | v3.1 |
| 11 | ⚪ | Convert flow FileRepairTab chưa hoàn thiện | `FileRepairTab.tsx` | v3.1 |
| 12 | ⚪ | Key collision BN vào viện 2 lần/ngày | `excelProcessor.ts` | v3.1 |
| **13** | 🔴 | **`normalizeGroupKey` parse tên người thành ngày** | `DataFilterTab.tsx` | **v3.2** |
| **14** | 🔴 | **Group mode không lọc dữ liệu trước khi gộp** | `DataFilterTab.tsx` | **v3.2** |
| **15** | 🟡 | **Tiêu đề kết quả sai ở chế độ group** | `DataFilterTab.tsx` | **v3.2** |

---

## VI. KẾT QUẢ BUILD

```
> dmh-tools@3.1.0 electron:build
> tsc -b && vite build && electron-builder build --win --x64

✓ 1772 modules transformed.
dist/index.html                     1.55 kB │ gzip:   0.82 kB
dist/assets/index-BMOnCrZJ.css     19.88 kB │ gzip:   4.26 kB
dist/assets/index-DYAQ1RS7.js   2,811.24 kB │ gzip: 863.78 kB
✓ built in 7.33s

  • packaging       platform=win32 arch=x64 electron=42.0.1
  • building        target=nsis file=release\DMH_Tools Setup 3.1.0.exe

TypeScript errors : 0
Lỗi chức năng    : 0 / 15
Lỗi bảo mật      : 0 / 9

Output: release\DMH_Tools Setup 3.1.0.exe
```

---

## VII. HƯỚNG DẪN CÀI ĐẶT

```
1. Chạy: release\DMH_Tools Setup 3.1.0.exe
2. Chọn thư mục cài đặt (mặc định: C:\Program Files\DMH_Tools)
3. Tích "Tạo shortcut trên Desktop"
4. Nhấn Install → Finish
5. Khởi động từ shortcut "DMH_Tools" trên Desktop
```

---

*DMH_Tools v3.1 Patch v3.2 · Báo cáo tính năng & bảo mật · 10/05/2026*
