import * as XLSX from 'xlsx';
import type { PatientRow, ClinicalPatientRecord, ComparedResult, DiffDetail, MatchStatus, ColumnMapping } from '../types';
import { bhytRuleEngine } from '../rules/RuleEngine';

// ─── Chuẩn hóa & helpers ────────────────────────────────────────────────────

/** Dùng để khớp bệnh nhân / tìm cột — KHÔNG phân biệt hoa/thường */
export function normalize(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/[\n\r]/g, ' ')   // Header Excel có wrap dòng → thay bằng space
    .replace(/_+/g, '_')        // Collapse multiple underscores (so__ngay__ → so_ngay_)
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();
}

/** Dùng để SO SÁNH GIÁ TRỊ — GIỮ NGUYÊN hoa/thường để phát hiện lỗi như "M10" vs "m10" */
function normalizeForCompare(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

/** Chuẩn hóa giới tính: nam/1/m → 'nam', nữ/2/f → 'nữ' */
function normalizeGender(val: unknown): string {
  const s = normalize(val);
  if (!s) return '';
  if (['1', 'nam', 'male', 'm'].includes(s)) return 'nam';
  if (['2', 'nữ', 'female', 'f'].includes(s)) return 'nữ';
  return s;
}

export function formatCurrency(amount: number): string {
  if (!amount) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
}

function formatDate(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) {
    const d = val.getUTCDate().toString().padStart(2, '0');
    const m = (val.getUTCMonth() + 1).toString().padStart(2, '0');
    const y = val.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }
  
  const str = String(val).trim();
  
  // Format YYYYMMDD or YYYYMMDDHHmm or YYYYMMDDHHmmss
  if (/^\d{8}$/.test(str) || /^\d{12}$/.test(str) || /^\d{14}$/.test(str)) {
    const y = str.substring(0, 4);
    const m = str.substring(4, 6);
    const d = str.substring(6, 8);
    return `${d}/${m}/${y}`;
  }

  // Format DD/MM/YYYY or D/M/YYYY
  const dmYMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmYMatch) {
    return `${dmYMatch[1].padStart(2, '0')}/${dmYMatch[2].padStart(2, '0')}/${dmYMatch[3]}`;
  }

  // Format YYYY/MM/DD or YYYY-MM-DD
  const yMDMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (yMDMatch) {
    return `${yMDMatch[3].padStart(2, '0')}/${yMDMatch[2].padStart(2, '0')}/${yMDMatch[1]}`;
  }

  // Fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && str.length > 5) {
    const d = parsed.getDate().toString().padStart(2, '0');
    const m = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }
  
  return str;
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).trim();
  
  // Xử lý định dạng hàng nghìn kiểu VN (VD: 415.421 -> 415421, 1.234.567 -> 1234567)
  if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, '');
  } 
  // Xử lý định dạng hàng nghìn kiểu US (VD: 415,421 -> 415421)
  else if (/^-?\d{1,3}(,\d{3})+$/.test(str)) {
    str = str.replace(/,/g, '');
  }
  // Nếu có phẩy mà không có chấm, có thể là thập phân kiểu VN (VD: 10,5 -> 10.5)
  else if (str.includes(',') && !str.includes('.')) {
    str = str.replace(/,/g, '.');
  }

  return Number(str) || 0;
}

/**
 * Phát hiện lỗi không đồng nhất dấu phẩy/chấm trong cùng 1 file.
 * VD: cột "totalCost" có dòng dùng "128.780" (VN nghìn), dòng khác dùng "128,78" (VN thập phân).
 * Trả về danh sách cột bị nghi lỗi.
 */
export function detectDecimalMismatch(rows: Record<string, unknown>[]): string[] {
  if (rows.length < 2) return [];
  const suspectCols: string[] = [];
  const cols = Object.keys(rows[0] || {});

  for (const col of cols) {
    let hasDotDecimal = false;  // dùng dấu chấm làm thập phân: "128.78"
    let hasCommaDecimal = false; // dùng dấu phẩy làm thập phân: "128,78"

    for (const row of rows) {
      const raw = String(row[col] ?? '').trim();
      if (!raw || typeof row[col] === 'number') continue;

      // Dấu chấm thập phân: số.số cuối không đủ 3 chữ số (không phải hàng nghìn VN)
      // VD: "128.78", "1.5" (chấm thập phân) -- nhưng "1.234" (hàng nghìn VN)
      if (/^\d+\.\d{1,2}$/.test(raw) || /^\d{1,3}\.\d{1,2}$/.test(raw)) {
        hasDotDecimal = true;
      }
      // Dấu phẩy thập phân: "128,78", "1,5"
      if (/^\d+,\d{1,2}$/.test(raw) && !/^\d{1,3}(,\d{3})+$/.test(raw)) {
        hasCommaDecimal = true;
      }

      if (hasDotDecimal && hasCommaDecimal) break;
    }

    if (hasDotDecimal && hasCommaDecimal) {
      suspectCols.push(col);
    }
  }
  return suspectCols;
}

function parseDateToTime(dStr: string): number {
  if (!dStr) return 0;
  const dmYMatch = dStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmYMatch) {
    return new Date(Number(dmYMatch[3]), Number(dmYMatch[2]) - 1, Number(dmYMatch[1])).getTime();
  }
  return new Date(dStr).getTime();
}

// ─── Column Mapping mặc định ─────────────────────────────────────────────────

export const DEFAULT_PORTAL_MAPPING: ColumnMapping = {
  name:            ['họ tên', 'họ và tên', 'tên bệnh nhân', 'ho ten', 'ten_bn', 'hoten', 'ho_ten', 'hovaten', 'tên bn', 'ten'],
  insuranceCode:   ['mã thẻ', 'mã thẻ bhyt', 'số thẻ', 'thẻ bhyt', 'mã bhyt', 'ma the', 'ma_the', 'sothe', 'the_bhyt', 'số bhyt', 'mã số bhxh', 'maso bhxh', 'mathe', 'ma_the_bhyt'],
  dob:             ['ngày sinh', 'ngay sinh', 'sinh', 'dob', 'ngaysinh', 'ngay_sinh', 'năm sinh', 'nam sinh'],
  gender:          ['giới tính', 'gioi tinh', 'gt', 'gioitinh', 'sex', 'gioi_tinh'],
  dateIn:          ['ngày vào', 'ngay vao', 'ngày nhập', 'vào viện', 'ngayvaovien', 'ngay_vao', 'ngày khám', 'ngay kham'],
  dateOut:         ['ngày ra', 'ngay ra', 'ngày xuất', 'ra viện', 'ngayravien', 'ngay_ra', 'ngày thanh toán'],
  totalCost:       ['tổng chi', 'tổng chi phí', 'tong chi', 'tổng cp', 'tongchiphi', 'total', 'tổng', 'total cost'],
  bhytPay:         ['bảo hiểm tt', 'bao hiem tt', 'bhyt chi trả', 'bhyt trả', 'bhyt thanh toán', 'quy_bhyt', 'quybhyt'],
  patientPay:      ['bệnh nhân tt', 'benh nhan tt', 'bệnh nhân trả', 'bệnh nhân cct', 'bn trả', 'nguoi_benh', 'bn'],
  bhytPercent:     ['tỷ lệ', 'ty le', 'tylebhyt', 'ty_le', '%bhyt', 'muc_huong'],
  diagnosis:       ['chẩn đoán', 'chan doan', 'mã chẩn đoán', 'mã bệnh', 'icd', 'chandoan', 'ma_cd', 'ma_benh'],
  diagnosisName:   ['tên chẩn đoán', 'ten chan doan', 'tên bệnh', 'ten_chandoan', 'ten_benh'],
  deptName:        ['khoa', 'phòng', 'makhoa', 'ma_khoa'],
  treatmentType:   ['loại hs', 'loai hs', 'mã loại kcb', 'loại hình', 'loaihinh', 'loai_dieu_tri', 'ma_loai_kcb'],
  hospitalCode:    ['mã cơ sở', 'mã bv', 'macskcb', 'ma_cskcb'],
  admissionNumber: ['mã liên kết', 'ma lien ket', 'số lần', 'lan_vao', 'solankham'],
  objectCode:      ['mã đối tượng', 'mã hưởng', 'mã quyền lợi', 'ma_doi_tuong', 'muc_huong_bhyt'],
  serviceCode:     ['mã dịch vụ', 'mã dvkt', 'ma_dvkt', 'mã dv'],
  medicineCode:    ['mã thuốc', 'ma_thuoc'],
  medicineCost:    ['chi phí thuốc', 't_thuoc', 'tien_thuoc', 'tiền thuốc'],
  materialCost:    ['vật tư y tế', 't_vtyt', 'tien_vtyt', 'vtyt'],
  benefitCode:     ['mã quyền lợi', 'ma_quyen_loi', 'benefit_code', 'ma_huong'],
  paymentDate:     ['ngày tt', 'ngay tt', 'ngày quyết định', 'ngay_quyet_dinh', 'payment_date', 'ngay_qd'],
  paymentDecisionNo: ['số quyết định', 'so_quyet_dinh', 'payment_decision_no', 'so_qd'],
  diseaseCategory: ['trạng thái hs', 'trang thai hs', 'phân loại bệnh', 'phan_loai_benh'],
  regionCode:      ['mã khu vực', 'ma_khu_vuc', 'region_code'],
  yearVisitCount:  ['số lần khám năm', 'so_lan_nam', 'year_visit_count', 'solankham_nam'],
  stayDays:        ['số ngày', 'ngày điều trị', 'so_ngay_dtri', 'số ngày đt', 'số ngày điều trị'],
};

export const DEFAULT_INTERNAL_MAPPING: ColumnMapping = {
  name:            ['ho_ten', 'họ tên', 'họ và tên', 'tên', 'name', 'hovaten', 'tên bệnh nhân', 'tên bn'],
  insuranceCode:   ['ma_the_bhyt', 'mã thẻ bhyt', 'ma_the', 'mã thẻ', 'số thẻ', 'thẻ', 'mã bhyt', 'mathe', 'mã số bhxh', 'maso bhxh', 'thẻ bhyt', 'the bhyt'],
  dob:             ['ngay_sinh', 'ngày sinh', 'sinh', 'dob', 'năm sinh'],
  gender:          ['gioi_tinh', 'giới tính', 'gt', 'gioitinh'],
  dateIn:          ['ngay_vao', 'ngay_vao_noi_tru', 'ngày vào', 'vào', 'nhập viện', 'ngày nhập', 'ngayvao'],
  dateOut:         ['ngay_ra', 'ngày ra', 'ra viện', 'xuất viện', 'ngày xuất', 'ngayra'],
  totalCost:       ['t_tong_chi_bv', 't_tongchi_bv', 't_tong_chi', 'tổng chi phí', 'tổng', 'total cost', 'tongchiphi', 'tong_chi_bv', 'tổng chi'],
  bhytPay:         ['t_bhtt', 'tong_chi_bh', 't_tongchi_bh', 't_bhyt', 'bảo hiểm', 'insurance', 'quybhyt', 'bhyt chi trả'],
  patientPay:      ['t_bncct', 't_bntt', 't_nguoi_benh', 'bệnh nhân', 'bn', 'patient', 'nguoibenh'],
  bhytPercent:     ['muc_huong', 'tỷ lệ', 'tylebhyt', '%', '%bhyt'],
  diagnosis:       ['ma_benh_chinh', 'ma benh _chinh', 'ma_benh chinh', 'ma_benh', 'mã bệnh', 'mã cd', 'icd', 'mã chẩn đoán', 'macd', 'ma benh chinh'],
  diagnosisName:   ['ten_benh', 'tên bệnh', 'tên chẩn đoán', 'tên cd'],
  deptName:        ['ma_khoa', 'khoa', 'makhoa', 'department'],
  treatmentType:   ['ma_loai_kcb', 'ma__loai__kcb', 'mã loại kcb', 'loại hình', 'loai', 'loại hs'],
  hospitalCode:    ['ma_cskcb', 'mã cơ sở', 'mabv', 'macskcb'],
  admissionNumber: ['so_lan', 'số lần', 'lan'],
  objectCode:      ['ma_doi_tuong', 'mã đối tượng', 'muc_huong', 'mã hưởng'],
  serviceCode:     ['ma_dvkt', 'mã dịch vụ', 'mã dvkt'],
  medicineCode:    ['ma_thuoc', 'mã thuốc'],
  medicineCost:    ['t_thuoc', 'tiền thuốc', 'chi phí thuốc'],
  materialCost:    ['t_vtyt', 'vật tư y tế', 'vtyt'],
  benefitCode:     ['ma_quyen_loi', 'mã quyền lợi'],
  paymentDate:     ['ngay_quyet_dinh', 'ngày quyết định'],
  paymentDecisionNo: ['so_quyet_dinh', 'số quyết định'],
  diseaseCategory: ['phan_loai_benh', 'phân loại bệnh'],
  regionCode:      ['ma_khu_vuc', 'mã khu vực'],
  yearVisitCount:  ['so_lan_nam', 'số lần khám năm'],
  stayDays:        ['so_ngay_dtri', 'so__ngay__dtri', 'số ngày', 'ngày điều trị', 'số ngày đt', 'số ngày điều trị'],
};

// ─── Column Mapping logic ───────────────────────────────────────────────────

export function guessMapping(cols: string[], defaultMapping: ColumnMapping): ColumnMapping {
  const result: Record<string, string[]> = { ...(defaultMapping as unknown as Record<string, string[]>) };
  for (const [key, cands] of Object.entries(defaultMapping)) {
    const candidates = cands as string[];
    let found = cols.find(c => candidates.some((cand: string) => normalize(c) === normalize(cand)));
    if (!found) {
      found = cols.find(c => candidates.some((cand: string) => normalize(c).includes(normalize(cand))));
    }
    result[key] = found ? [found] : candidates;
  }
  return result as unknown as ColumnMapping;
}

function findCol(raw: Record<string, unknown>, mapping: ColumnMapping, field: keyof ColumnMapping): unknown {
  const keys = Object.keys(raw);
  const candidates = mapping[field];
  
  if (!Array.isArray(candidates)) return '';

  // 1. Ưu tiên khớp chính xác tuyệt đối (exact match)
  for (const c of candidates) {
    const found = keys.find(k => normalize(k) === normalize(c));
    if (found && raw[found] !== '' && raw[found] !== null && raw[found] !== undefined) {
      return raw[found];
    }
  }

  // 2. Khớp tương đối (contains) nếu không tìm thấy exact
  for (const c of candidates) {
    const found = keys.find(k => normalize(k).includes(normalize(c)));
    if (found && raw[found] !== '' && raw[found] !== null && raw[found] !== undefined) {
      return raw[found];
    }
  }
  return '';
}

export function mapRow(raw: Record<string, unknown>, mapping: ColumnMapping): ClinicalPatientRecord {
  const get = (field: keyof ColumnMapping) => findCol(raw, mapping, field);
  return {
    id:              String(get('admissionNumber') || ''),
    name:            String(get('name') || ''),
    insuranceCode:   String(get('insuranceCode') || ''),
    dob:             formatDate(get('dob')),
    gender:          String(get('gender') || ''),
    dateIn:          formatDate(get('dateIn')),
    dateOut:         formatDate(get('dateOut')),
    stayDays:        (() => {
      const rawStayDays = get('stayDays');
      if (rawStayDays !== '' && rawStayDays !== null && rawStayDays !== undefined) {
        return parseNumber(rawStayDays);
      }
      const d1 = formatDate(get('dateIn'));
      const d2 = formatDate(get('dateOut'));
      if (d1 && d2) {
        const t1 = parseDateToTime(d1);
        const t2 = parseDateToTime(d2);
        if (!isNaN(t1) && !isNaN(t2)) {
          const diff = Math.round((t2 - t1) / 86400000);
          return diff >= 0 ? diff : 0;
        }
      }
      return 0;
    })(),
    totalCost:       parseNumber(get('totalCost')),
    bhytPay:         parseNumber(get('bhytPay')),
    patientPay:      parseNumber(get('patientPay')),
    bhytPercent:     parseNumber(get('bhytPercent')),
    diagnosis:       String(get('diagnosis') || ''),
    diagnosisName:   (() => {
      const name = String(get('diagnosisName') || '');
      const code = String(get('diagnosis') || '');
      // Nếu diagnosisName bị map nhầm vào cùng cột với diagnosis thì xóa trống
      return normalize(name) === normalize(code) ? '' : name;
    })(),
    deptName:        String(get('deptName') || ''),
    treatmentType:   String(get('treatmentType') || ''),
    hospitalCode:    String(get('hospitalCode') || ''),
    admissionNumber: String(get('admissionNumber') || ''),
    objectCode:      String(get('objectCode') || ''),
    serviceCode:     String(get('serviceCode') || ''),
    medicineCode:    String(get('medicineCode') || ''),
    medicineCost:    parseNumber(get('medicineCost')),
    materialCost:    parseNumber(get('materialCost')),
    benefitCode:     String(get('benefitCode') || ''),
    paymentDate:     formatDate(get('paymentDate')),
    paymentDecisionNo: String(get('paymentDecisionNo') || ''),
    diseaseCategory: String(get('diseaseCategory') || ''),
    regionCode:      String(get('regionCode') || ''),
    yearVisitCount:  parseNumber(get('yearVisitCount')),
    medicines:       (raw.medicines as any) || [],
    services:        (raw.services as any) || [],
    subclinical:     (raw.subclinical as any) || [],
    evolutions:      (raw.evolutions as any) || [],
    _rawStrings: {
      totalCost: String(get('totalCost') || ''),
      bhytPay: String(get('bhytPay') || ''),
      patientPay: String(get('patientPay') || ''),
      bhytPercent: String(get('bhytPercent') || ''),
      medicineCost: String(get('medicineCost') || ''),
      materialCost: String(get('materialCost') || ''),
      yearVisitCount: String(get('yearVisitCount') || ''),
    }
  } as ClinicalPatientRecord;
}

// ─── Đọc EXCEL ────────────────────────────────────────────────────────────────

function findHeaderRowIndex(worksheet: XLSX.WorkSheet): number {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  let headerRowIdx = 0;
  let maxScore = 0;
  const knownKeywords = [
    'ma_the', 'ho_ten', 'ngay_sinh', 'gioi_tinh', 'tong_chi', 'ma_benh',
    'mã thẻ', 'họ tên', 'ngày sinh', 'giới tính', 'stt', 'mã bệnh',
    'ma_lk', 'mã liên kết', 'ngay_vao', 'ngày vào'
  ];

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    let score = 0;
    let colCount = 0;
    for (const cell of row) {
      if (typeof cell === 'string' && cell.trim() !== '') {
        colCount++;
        const lower = cell.toLowerCase().replace(/\s+/g, '');
        if (knownKeywords.some(kw => lower.includes(kw.replace(/\s+/g, '')))) {
          score += 10;
        }
      } else if (cell !== null && cell !== undefined && cell !== '') {
        colCount++; // Count numbers, dates, etc.
      }
    }
    // Prefer row with more columns even if keywords are not matched
    score += colCount;

    if (score > maxScore) {
      maxScore = score;
      headerRowIdx = i;
    }
  }

  return headerRowIdx;
}

export async function readExcelFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const headerRowIdx = findHeaderRowIndex(worksheet);
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', range: headerRowIdx }) as Record<string, unknown>[];
        resolve(jsonData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Đọc CSV ─────────────────────────────────────────────────────────────────

export async function readCsvFile(file: File): Promise<Record<string, unknown>[]> {
  /**
   * Auto-detect encoding: thử UTF-8 trước, nếu phát hiện replacement char (\uFFFD)
   * hoặc header/data trông không hợp lệ thì thử lại với Windows-1252 (ANSI).
   * Nhiều file 01/BH xuất từ HIS dùng ANSI nên cần hỗ trợ.
   */
  const tryParse = (text: string): Record<string, unknown>[] => {
    const workbook = XLSX.read(text, { type: 'string', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const headerRowIdx = findHeaderRowIndex(worksheet);
    return XLSX.utils.sheet_to_json(worksheet, { defval: '', range: headerRowIdx }) as Record<string, unknown>[];
  };

  const readAs = (encoding: string): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target?.result as string);
      r.onerror = rej;
      r.readAsText(file, encoding);
    });

  // 1. Thử UTF-8
  const utf8Text = await readAs('utf-8');
  // Nếu không có ký tự lỗi (\uFFFD) thì dùng UTF-8
  if (!utf8Text.includes('\uFFFD')) {
    return tryParse(utf8Text);
  }

  // 2. Thử Windows-1252 (ANSI — phổ biến trong HIS Việt Nam)
  try {
    const ansiText = await readAs('windows-1252');
    return tryParse(ansiText);
  } catch {
    // Fallback về kết quả UTF-8 dù có ký tự lỗi
    return tryParse(utf8Text);
  }
}

// ─── Đọc XML ─────────────────────────────────────────────────────────────────

/**
 * Đọc file XML dạng Cổng Giám Định BHXH (hoặc XML tổng quát)
 * Hỗ trợ nhiều cấu trúc XML khác nhau
 */
export async function readXmlFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        // Kiểm tra parse error
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
          reject(new Error('File XML không hợp lệ: ' + parseError.textContent));
          return;
        }

        const rows = parseXmlToRows(xmlDoc);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

function parseXmlList(parentElement: Element, itemTag: string): Record<string, unknown>[] {
  const items = parentElement.querySelectorAll(itemTag);
  const result: Record<string, unknown>[] = [];
  for (const item of Array.from(items)) {
    const row: Record<string, unknown> = {};
    for (const child of Array.from(item.children)) {
      row[child.tagName] = child.textContent?.trim() || '';
    }
    result.push(row);
  }
  return result;
}

/**
 * Parse XML document sang array of records
 * Hỗ trợ: <DSBenhNhan>, <BenhNhan>, <row>, <record>, <item>
 */
function parseXmlToRows(xmlDoc: Document): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  // Thử các tag phổ biến cho dữ liệu BHYT
  const rowTagCandidates = [
    'BenhNhan', 'BENHNHAN', 'benhnhan',
    'HoSo', 'HOSO', 'hoso',
    'ThanhToan', 'THANHTOAN',
    'Record', 'record', 'Row', 'row',
    'Item', 'item', 'Entry', 'entry',
    'patient', 'Patient',
  ];

  let rowElements: NodeListOf<Element> | null = null;

  for (const tag of rowTagCandidates) {
    const found = xmlDoc.querySelectorAll(tag);
    if (found.length > 0) {
      rowElements = found;
      break;
    }
  }

  // Nếu không tìm thấy tag nào, thử lấy children của root
  if (!rowElements || rowElements.length === 0) {
    const root = xmlDoc.documentElement;
    if (root?.children?.length > 0) {
      const firstChild = root.children[0];
      const childTag = firstChild.tagName;
      rowElements = xmlDoc.querySelectorAll(childTag);
    }
  }

  if (!rowElements || rowElements.length === 0) {
    return [];
  }

  for (const el of Array.from(rowElements)) {
    const row: Record<string, unknown> = {};

    // Thu thập attributes của element
    for (const attr of Array.from(el.attributes)) {
      row[attr.name] = attr.value;
    }

    // Thu thập child elements (nested tags)
    for (const child of Array.from(el.children)) {
      const key = child.tagName;
      const value = child.textContent?.trim() || '';

      // Nếu có children nữa thì flatten (trừ các bảng chi tiết)
      if (child.children.length > 0 && !child.tagName.startsWith('DS_')) {
        for (const grandchild of Array.from(child.children)) {
          row[`${key}_${grandchild.tagName}`] = grandchild.textContent?.trim() || '';
        }
      } else if (child.children.length === 0) {
        row[key] = value;
      }
    }

    // Trích xuất chi tiết (Hỗ trợ XML 4210, 130, 3170)
    // Các thẻ thường dùng: CHI_TIET_THUOC, CHI_TIET_DVKT, CHI_TIET_CLS, CHI_TIET_DIEN_BIEN
    let meds = parseXmlList(el, 'CHI_TIET_THUOC');
    if (meds.length === 0) meds = parseXmlList(el, 'Thuoc'); // Fallback tên khác
    row['medicines'] = meds;
    
    let svcs = parseXmlList(el, 'CHI_TIET_DVKT');
    if (svcs.length === 0) svcs = parseXmlList(el, 'DVKT'); // Fallback
    row['services'] = svcs;

    row['subclinical'] = parseXmlList(el, 'CHI_TIET_CLS');
    row['evolutions'] = parseXmlList(el, 'CHI_TIET_DIEN_BIEN');

    // Chỉ thêm nếu có dữ liệu tổng hợp (ít nhất có mã bệnh nhân hoặc mã thẻ)
    if (Object.keys(row).length > 0) {
      results.push(row);
    }
  }

  return results;
}

// ─── Universal file reader ────────────────────────────────────────────────────

export async function readAnyFile(file: File): Promise<{ data: Record<string, unknown>[]; format: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const name = file.name.toLowerCase();

  if (ext === 'xml' || name.endsWith('.xml')) {
    const data = await readXmlFile(file);
    return { data, format: 'XML' };
  } else if (ext === 'csv') {
    const data = await readCsvFile(file);
    return { data, format: 'CSV' };
  } else {
    const data = await readExcelFile(file);
    return { data, format: 'Excel' };
  }
}

// ─── So sánh ─────────────────────────────────────────────────────────────────

function compareRows(portal: PatientRow, internal: PatientRow): DiffDetail[] {
  const diffs: DiffDetail[] = [];

  const fields: { field: keyof PatientRow; label: string; isNum?: boolean; severity: DiffDetail['severity'] }[] = [
    { field: 'name',            label: 'Họ và tên bệnh nhân',    severity: 'medium' },
    // insuranceCode không so sánh lại — đã là key khớp bệnh nhân
    { field: 'dob',             label: 'Ngày sinh',              severity: 'medium' },
    { field: 'gender',          label: 'Giới tính',              severity: 'low'    },
    { field: 'dateIn',          label: 'Ngày vào viện',          severity: 'medium' },
    { field: 'dateOut',         label: 'Ngày ra viện',           severity: 'medium' },
    { field: 'stayDays',        label: 'Số ngày nằm viện',       isNum: true, severity: 'medium' },
    { field: 'totalCost',       label: 'Tổng chi phí',           isNum: true, severity: 'high' },
    { field: 'bhytPay',         label: 'BHYT chi trả',           isNum: true, severity: 'high' },
    { field: 'patientPay',      label: 'Bệnh nhân chi trả',      isNum: true, severity: 'high' },
    { field: 'bhytPercent',     label: 'Tỷ lệ BHYT (%)',         isNum: true, severity: 'medium' },
    { field: 'diagnosis',       label: 'Mã chẩn đoán (ICD)',     severity: 'high' },
    { field: 'diagnosisName',   label: 'Tên chẩn đoán',          severity: 'low' },
    { field: 'deptName',        label: 'Khoa điều trị',          severity: 'low' },
    { field: 'treatmentType',   label: 'Loại hình điều trị',     severity: 'medium' },
    { field: 'objectCode',      label: 'Mã đối tượng BHYT',      severity: 'high' },
    { field: 'serviceCode',     label: 'Mã dịch vụ kỹ thuật',    severity: 'high' },
    { field: 'medicineCode',    label: 'Mã thuốc',               severity: 'high' },
    { field: 'medicineCost',    label: 'Chi phí thuốc',          isNum: true, severity: 'high' },
    { field: 'materialCost',    label: 'Chi phí VTYT',           isNum: true, severity: 'high' },
    { field: 'benefitCode',     label: 'Mã quyền lợi',           severity: 'medium' },
    { field: 'paymentDate',     label: 'Ngày quyết định',        severity: 'low' },
    { field: 'paymentDecisionNo', label: 'Số quyết định',        severity: 'low' },
    { field: 'diseaseCategory', label: 'Phân loại bệnh',         severity: 'medium' },
    { field: 'regionCode',      label: 'Mã khu vực',             severity: 'medium' },
    { field: 'yearVisitCount',  label: 'Số lần khám trong năm',  isNum: true, severity: 'low' },
  ];

  // ── Kiểm tra hợp lý thời gian vào/ra (có giờ) ────────────────────────────────────────
  if (portal.dateIn && portal.dateOut) {
    const parseDateTime = (str:string)=>{
      // hỗ trợ dd/MM/yyyy HH:mm hoặc yyyy-MM-dd HH:mm
      const dmY = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})[\sT](\d{2}):(\d{2})/);
      if (dmY) {
        const [_, d,m,y,h,min] = dmY;
        return new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(min)).getTime();
      }
      const yMD = str.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})[\sT](\d{2}):(\d{2})/);
      if (yMD) {
        const [_, y,m,d,h,min] = yMD;
        return new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(min)).getTime();
      }
      return 0; // không có thời gian
    };
    const tIn = parseDateTime(portal.dateIn);
    const tOut = parseDateTime(portal.dateOut);
    if (tIn && tOut && tIn > tOut) {
      diffs.push({
        field: 'Thời gian vào/ra',
        portalValue: portal.dateIn,
        internalValue: internal.dateOut,
        severity: 'high',
        note: '⚠ Ngày/giờ vào > ngày/giờ ra',
      });
    }
  }

  // ── Kiểm tra hợp lý mã bệnh ICD ───────────────────────────────────────────
  if (portal.diagnosis) {
    const icd = portal.diagnosis.trim().toUpperCase();

    // 1. Kiểm tra định dạng ICD-10 hợp lệ: chữ cái + 2-4 số (VD: A09, K29.1, Z00)
    const icdFmt = /^[A-Z]\d{2,4}(\.\d{1,2})?$/.test(icd);
    if (!icdFmt) {
      diffs.push({
        field: 'Mã chẩn đoán (ICD)',
        portalValue: portal.diagnosis,
        internalValue: internal.diagnosis,
        severity: 'high',
        note: '⚠ Mã ICD không đúng định dạng chuẩn (VD hợp lệ: A09, K29.1)',
      });
    }

    // 2. Bệnh mãn tính không nên nằm viện quá ngắn (< 1 ngày) cho nội trú
    const chronicPrefixes = [
      'I10','I11','I12','I13','I20','I21','I25',  // Tim mạch, NMCT, Mạch vành
      'E10','E11','E12','E13','E14',              // Đái tháo đường
      'J44','J45','J46',                          // COPD, Hen phế quản
      'N18','N19',                                // Suy thận mạn
      'K70','K71','K72','K73','K74',              // Xơ gan, bệnh gan mạn
      'C','D0','D1','D2','D3','D4',               // Ung thư, u tân sinh
      'B18',                                      // Viêm gan virus mạn tính
      'F20','F21','F22','F23','F24','F25',        // Tâm thần phân liệt
      'F31','F32','F33',                          // Rối loạn cảm xúc, trầm cảm
      'G40',                                      // Động kinh
      'M05','M06',                                // Viêm khớp dạng thấp
      'M15','M16','M17','M18','M19',              // Thoái hóa khớp (đa khớp, háng, gối...)
      'M81',                                      // Loãng xương
      'E03','E04','E05','E06',                    // Bệnh lý tuyến giáp (suy giáp, bướu cổ, cường giáp)
      'D56',                                      // Thalassemia (tan máu bẩm sinh)
    ];
    const isChronic = chronicPrefixes.some(p => icd.startsWith(p));
    const treatType = (portal.treatmentType || '').toLowerCase();
    const isInpatient = treatType.includes('nội trú') || treatType.includes('2') || treatType === '';
    if (icdFmt && isChronic && isInpatient && portal.stayDays === 0) {
      diffs.push({
        field: 'Số ngày nằm viện (bệnh mãn tính)',
        portalValue: String(portal.stayDays),
        internalValue: String(internal.stayDays),
        severity: 'medium',
        note: `⚠ Mã ${icd} (bệnh mãn tính) — nội trú nhưng số ngày = 0`,
      });
    }

    // 3. Mã ngoại trú không nên có stayDays > 0
    const outpatientTreats = ['ngoại trú', '1', 'ngoai tru'];
    const isOutpatient = outpatientTreats.some(t => treatType.includes(t));
    if (icdFmt && isOutpatient && portal.stayDays > 0) {
      diffs.push({
        field: 'Số ngày nằm viện (ngoại trú)',
        portalValue: String(portal.stayDays) + ' ngày',
        internalValue: '0 ngày (ngoại trú)',
        severity: 'medium',
        note: '⚠ Ngoại trú nhưng số ngày nằm viện > 0',
      });
    }

    // 4. Mã bệnh hai bên (cổng vs nội bộ) phải khớp nhau
    if (internal.diagnosis) {
      const icdInternal = internal.diagnosis.trim().toUpperCase();
      // So sánh mã gốc (3-4 ký tự đầu, trước dấu chấm)
      const basePortal   = icd.split('.')[0];
      const baseInternal = icdInternal.split('.')[0];
      if (basePortal !== baseInternal) {
        diffs.push({
          field: 'Mã chẩn đoán (ICD) – không khớp',
          portalValue: portal.diagnosis,
          internalValue: internal.diagnosis,
          severity: 'high',
          note: '⚠ Mã bệnh Cổng Giám Định ≠ nội bộ 01/BH',
        });
      }
    }
  }

  for (const { field, label, isNum, severity } of fields) {
    const pVal = portal[field];
    const iVal = internal[field];

    if (isNum) {
      const pNum = Number(pVal) || 0;
      const iNum = Number(iVal) || 0;
      // Bỏ qua nếu cả hai đều bằng 0
      if (pNum === 0 && iNum === 0) continue;
      if (Math.abs(pNum - iNum) > 1) {
        const fmtFn = (field === 'bhytPercent' || field === 'stayDays')
          ? (v: number) => String(v)
          : formatCurrency;
        
        let note: string | undefined;
        // Bắt lỗi: một bên dùng dấu phẩy, một bên dùng dấu chấm (VD: 128.780,4 vs 128780.4)
        const pRaw = String((portal as any)._rawStrings?.[field] || pVal);
        const iRaw = String((internal as any)._rawStrings?.[field] || iVal);
        
        const pClean = pRaw.replace(/[.,\sđđVNĐ]/gi, '');
        const iClean = iRaw.replace(/[.,\sđđVNĐ]/gi, '');
        
        if (pClean === iClean && pClean !== '') {
          note = '⚠ Lỗi định dạng: Một bên dùng dấu phẩy, một bên dùng dấu chấm thập phân';
        }

        diffs.push({ field: label, portalValue: fmtFn(pNum), internalValue: fmtFn(iNum), severity, note });
      }
    } else if (field === 'gender') {
      // Chuẩn hóa giới tính trước khi so sánh (Nữ=2, Nam=1)
      const pG = normalizeGender(pVal);
      const iG = normalizeGender(iVal);
      if (!pG || !iG) continue;
      if (pG !== iG) {
        diffs.push({ field: label, portalValue: String(pVal || '—'), internalValue: String(iVal || '—'), severity });
      }
    } else {
      const pRaw = normalizeForCompare(pVal);
      const iRaw = normalizeForCompare(iVal);
      // Chỉ so sánh khi CẢ HAI đều có giá trị. Nếu 1 bên trống => bỏ qua.
      if (!pRaw || !iRaw) continue;
      if (pRaw !== iRaw) {
        // Kiểm tra xem lỗi có phải chỉ do hoa/thường không
        const isCaseOnly = normalize(pRaw) === normalize(iRaw);
        diffs.push({
          field: label,
          portalValue: pRaw,
          internalValue: iRaw,
          severity: isCaseOnly ? 'low' : severity,
          note: isCaseOnly ? '⚠ Chỉ khác hoa/thường' : undefined,
        });
      }
    }
  }

  return diffs;
}

// ─── Hàm chính đối chiếu ─────────────────────────────────────────────────────

export function compareData(
  portalRows: Record<string, unknown>[],
  internalRows: Record<string, unknown>[],
  portalMapping = DEFAULT_PORTAL_MAPPING,
  internalMapping = DEFAULT_INTERNAL_MAPPING,
): ComparedResult[] {
  const portalMapped = portalRows.map(r => mapRow(r, portalMapping));
  const internalMapped = internalRows.map(r => mapRow(r, internalMapping));

  const generateKey = (row: PatientRow) => {
    // Xóa mọi khoảng trắng trong mã thẻ/tên để so khớp không bị lệch
    const code = (normalize(row.insuranceCode) || normalize(row.name)).replace(/\s/g, '');
    // Chỉ lấy NĂM SINH (4 chữ số) để tránh lỗi lệch định dạng (VD: '1954' vs '10/10/1954')
    const rawDob = normalize(row.dob);
    const dobMatch = rawDob.match(/\d{4}/);
    const dobYear = dobMatch ? dobMatch[0] : rawDob;
    // KHÔNG dùng dateIn vào key:
    // - File 01BH ghi ngày giờ tiếp nhận thực tế (VD: 01/07 07:51)
    // - File Cổng GĐ ghi ngày gửi/xử lý hệ thống (VD: 02/07 09:24)
    // → Cùng bệnh nhân nhưng ngày vào luôn lệch nhau → key không bao giờ khớp
    // Mã thẻ BHYT + Năm sinh là đủ unique trong 1 đợt thanh toán
    return `${code}_${dobYear}`;
  };



  const internalMap = new Map<string, ClinicalPatientRecord>();
  for (const row of internalMapped) {
    const key = generateKey(row);
    if (key && key !== '_') internalMap.set(key, row);
  }

  // ── DEBUG: in ra 5 key đầu để so sánh ───────────────────────────────────────
  console.group('[DMH Debug] So sánh KEY giữa 2 file:');
  const portalSample = portalMapped.slice(0, 5).map(r => ({
    name: r.name,
    insuranceCode: r.insuranceCode,
    dob: r.dob,
    dateIn: r.dateIn,
    key: generateKey(r),
  }));
  const internalSample = internalMapped.slice(0, 5).map(r => ({
    name: r.name,
    insuranceCode: r.insuranceCode,
    dob: r.dob,
    dateIn: r.dateIn,
    key: generateKey(r),
  }));
  console.log('▶ PORTAL (Cổng Giám Định) - 5 hồ sơ đầu:', portalSample);
  console.log('▶ INTERNAL (01/BH) - 5 hồ sơ đầu:', internalSample);
  console.log('▶ Portal keys (5 đầu):', portalSample.map(x => x.key));
  console.log('▶ Internal keys (5 đầu):', internalSample.map(x => x.key));
  console.groupEnd();
  // ────────────────────────────────────────────────────────────────────────────

  const portalKeys = new Set<string>();
  const results: ComparedResult[] = [];

  for (const p of portalMapped) {
    const key = generateKey(p);
    if (key && key !== '_') portalKeys.add(key);
    const internal = internalMap.get(key);
    const timeRange = [p.dateIn, p.dateOut].filter(Boolean).join(' → ') || '—';

    if (!internal) {
      results.push({
        id: key || p.name,
        name: p.name || '(Không rõ tên)',
        insuranceCode: p.insuranceCode,
        timeRange,
        status: 'KHÔNG THẤY',
        portalRow: p,
        differences: [{
          field: 'Trạng thái',
          portalValue: 'Có trong Cổng Giám Định',
          internalValue: 'Không có trong 01/BH',
          severity: 'high',
        }],
      });
    } else {
      let diffs = compareRows(p, internal);
      
      // Execute BHYT rules on the internal record
      const ruleDiffs = bhytRuleEngine.executeAll(internal);
      diffs = diffs.concat(ruleDiffs);

      const status: MatchStatus = diffs.length === 0 ? 'KHỚP' : 'LỆCH';
      results.push({
        id: key || p.name,
        name: p.name || internal.name || '(Không rõ tên)',
        insuranceCode: p.insuranceCode,
        timeRange,
        status,
        portalRow: p,
        internalRow: internal,
        differences: diffs,
      });
    }
  }

  for (const [key, i] of internalMap.entries()) {
    if (!portalKeys.has(key)) {
      results.push({
        id: key || i.name,
        name: i.name || '(Không rõ tên)',
        insuranceCode: i.insuranceCode,
        timeRange: [i.dateIn, i.dateOut].filter(Boolean).join(' → ') || '—',
        status: 'KHÔNG THẤY',
        internalRow: i,
        differences: [{
          field: 'Trạng thái',
          portalValue: 'Không có trong Cổng Giám Định',
          internalValue: 'Có trong 01/BH',
          severity: 'high',
        }, ...bhytRuleEngine.executeAll(i)],
      });
    }
  }

  const order: Record<MatchStatus, number> = { 'LỆCH': 0, 'KHÔNG THẤY': 1, 'KHỚP': 2 };
  results.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    // Secondary sort: high severity first
    const aHigh = a.differences.filter(d => d.severity === 'high').length;
    const bHigh = b.differences.filter(d => d.severity === 'high').length;
    return bHigh - aHigh;
  });

  return results;
}

// ─── Xuất báo cáo ─────────────────────────────────────────────────────────────

export function exportToExcel(results: ComparedResult[], filename = 'KetQuaDoiChieu.xlsx') {
  const rows = results.map((r: ComparedResult) => ({
    'Trạng thái': r.status,
    'Họ và tên': r.name,
    'Mã thẻ BHYT': r.insuranceCode,
    'Thời gian KCB': r.timeRange,
    'Số lệch': r.differences.length,
    'Lệch nghiêm trọng': r.differences.filter(d => d.severity === 'high').length,
    'Chi tiết sai lệch': r.differences.map(d =>
      `${d.field}: Cổng [${d.portalValue}] | 01/BH [${d.internalValue}]`
    ).join('\n') || 'Khớp hoàn toàn',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Style header
  ws['!cols'] = [
    { wch: 12 }, { wch: 25 }, { wch: 20 },
    { wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 80 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kết quả đối chiếu');

  // Sheet 2: chỉ hồ sơ lệch
  const lecRows = results.filter(r => r.status !== 'KHỚP').map((r: ComparedResult) => ({
    'Trạng thái': r.status,
    'Họ và tên': r.name,
    'Mã thẻ BHYT': r.insuranceCode,
    'Thời gian KCB': r.timeRange,
    'Trường lệch': r.differences.map(d => d.field).join(', '),
    'Giá trị Cổng': r.differences.map(d => d.portalValue).join(' | '),
    'Giá trị 01/BH': r.differences.map(d => d.internalValue).join(' | '),
  }));
  if (lecRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(lecRows);
    ws2['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 24 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Hồ sơ lệch & không thấy');
  }

  XLSX.writeFile(wb, filename);
}

// ─── Lịch sử ─────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'bhyt_history';

/**
 * Bảo mật #4.10: Strip dữ liệu bệnh nhân nhạy cảm trước khi lưu localStorage.
 * Chỉ giữ: id, name, insuranceCode, timeRange, status, differences.
 * Loại bỏ: portalRow, internalRow (chứa đầy đủ thông tin lâm sàng + tài chính)
 */
function sanitizeForHistory(results: ComparedResult[]): import('../types').HistorySafeResult[] {
  return results.map(r => ({
    id: r.id,
    name: r.name,
    insuranceCode: r.insuranceCode,
    timeRange: r.timeRange,
    status: r.status,
    differences: r.differences,
    // portalRow và internalRow được loại bỏ cố ý ở đây
  }));
}

export function saveHistory(entry: import('../types').HistoryEntry) {
  try {
    const existing = loadHistory();
    // Bảo mật #4.10: sanitize trước khi lưu — chỉ giữ metadata, không lưu raw patient rows
    const safeEntry = {
      ...entry,
      results: sanitizeForHistory(entry.results as ComparedResult[]),
    };
    // Giữ tối đa 20 lần gần nhất
    const updated = [safeEntry, ...existing].slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch { /* ignore storage errors */ }
}

export function loadHistory(): import('../types').HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
