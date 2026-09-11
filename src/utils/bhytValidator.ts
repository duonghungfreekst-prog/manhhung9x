/**
 * BHYT Validator — Kiểm tra tự động theo các văn bản pháp lý:
 *   - TT 35/2019/TT-BYT: Định dạng mã thẻ BHYT (15 ký tự)
 *   - TT 25/2023/TT-BYT: Mức hưởng BHYT theo đối tượng
 *   - TT 01/2023/TT-BYT: Quy định khám chữa bệnh BHYT
 *   - QĐ 4469/QĐ-BYT: Danh mục ICD-10 (mã chẩn đoán)
 *   - TT 13/2023/TT-BYT: Giới hạn số ngày điều trị
 */

import type { PatientRow } from '../types';

export interface BhytIssue {
  code: string;          // Mã quy tắc, VD: 'CARD_FORMAT'
  severity: 'critical' | 'warning' | 'info';
  field: string;         // Trường liên quan
  message: string;       // Mô tả lỗi
  reference: string;     // Căn cứ pháp lý
  value?: string;        // Giá trị thực tế
  expected?: string;     // Giá trị mong đợi
}

export interface BhytValidationResult {
  patientId: string;
  patientName: string;
  insuranceCode: string;
  issues: BhytIssue[];
  score: number;         // 0–100, 100 = hoàn toàn hợp lệ
  riskLevel: 'OK' | 'THẤP' | 'TRUNG BÌNH' | 'CAO' | 'RẤT CAO';
}

export interface BhytSummary {
  total: number;
  ok: number;
  lowRisk: number;
  medRisk: number;
  highRisk: number;
  veryHighRisk: number;
  totalIssues: number;
  criticalIssues: number;
  results: BhytValidationResult[];
}

/** 12 Bảng XML Chuẩn Quyết Định 130/QĐ-BYT Bộ Y Tế */
export interface Xml130TableDefinition {
  code: string;
  name: string;
  description: string;
  requiredFields: string[];
}

export const QD130_XML_TABLES: Xml130TableDefinition[] = [
  { code: 'XML1', name: 'Tổng hợp thông tin KCB', description: 'Chứa thông tin hành chính bệnh nhân, mã CSKCB, tổng chi phí', requiredFields: ['MA_LK', 'MA_THE_BHYT', 'HO_TEN', 'NGAY_VAO', 'NGAY_RA', 'MA_BENH'] },
  { code: 'XML2', name: 'Chi tiết thuốc thanh toán BHYT', description: 'Danh mục thuốc, hàm lượng, số lượng, đơn giá BHYT', requiredFields: ['MA_LK', 'MA_THUOC', 'TEN_THUOC', 'SO_LUONG', 'DON_GIA', 'THANH_TIEN'] },
  { code: 'XML3', name: 'Chi tiết DVKT và Vật tư y tế', description: 'Dịch vụ kỹ thuật, thủ thuật, phẫu thuật, VTYT', requiredFields: ['MA_LK', 'MA_DICH_VU', 'TEN_DICH_VU', 'SO_LUONG', 'DON_GIA', 'THANH_TIEN'] },
  { code: 'XML4', name: 'Chi tiết kết quả cận lâm sàng', description: 'Kết quả xét nghiệm, chẩn đoán hình ảnh, giải phẫu bệnh', requiredFields: ['MA_LK', 'MA_DICH_VU', 'KET_QUA', 'NGAY_KQ'] },
  { code: 'XML5', name: 'Chi tiết diễn biến lâm sàng', description: 'Ghi nhận tình trạng bệnh nhân, giai đoạn bệnh án', requiredFields: ['MA_LK', 'DIEN_BIEN', 'HOI_CHAN', 'NGAY_YL'] },
  { code: 'XML6', name: 'Giấy chứng sinh', description: 'Dữ liệu trẻ sơ sinh, cân nặng, tình trạng mẹ', requiredFields: ['MA_LK', 'MA_THE_BHYT_ME', 'NGAY_SINH_CON'] },
  { code: 'XML7', name: 'Giấy báo tử', description: 'Thông tin tử vong, nguyên nhân tử vong', requiredFields: ['MA_LK', 'NGAY_CHET', 'NGUYEN_NHAN'] },
  { code: 'XML8', name: 'Tóm tắt hồ sơ bệnh án', description: 'Hồ sơ chuyển viện, kết luận ra viện', requiredFields: ['MA_LK', 'TOM_TAT_BENH_AN'] },
  { code: 'XML9', name: 'Giấy chứng nhận nghỉ việc hưởng BHXH', description: 'Số ngày nghỉ việc, kỳ nghỉ ốm/thai sản', requiredFields: ['MA_LK', 'SO_NGAY_NGHI', 'TU_NGAY', 'DEN_NGAY'] },
  { code: 'XML10', name: 'Giấy chuyển tuyến KCB BHYT', description: 'Nơi chuyển đến, lý do chuyển tuyến kỹ thuật', requiredFields: ['MA_LK', 'MA_CSKCB_CHUYEN_DEN', 'LY_DO_CHUYEN'] },
  { code: 'XML11', name: 'Giấy hẹn khám lại', description: 'Thời hạn hẹn tái khám định kỳ', requiredFields: ['MA_LK', 'NGAY_HEN_KHAM'] },
  { code: 'XML12', name: 'Giấy nghỉ dưỡng thai', description: 'Chứng nhận sức khỏe dưỡng thai theo quy định', requiredFields: ['MA_LK', 'SO_NGAY_NGHI_DUONG_THAI'] },
];

// ─── Bảng prefix mã thẻ hợp lệ (TT35/2019) ─────────────────────────────────

/** 2 ký tự đầu = mã đối tượng tham gia BHYT */
const VALID_OBJECT_CODES = new Set([
  // Nhóm do người lao động & NSDLĐ đóng
  'HC', 'ĐH', 'DN', 'CH', 'NN', 'TK',
  // Nhóm do tổ chức BHXH đóng
  'HN', 'HX', 'TB', 'CB', 'TC', 'HT', 'TN', 'MS', 'NO', 'XB',
  // Nhóm do NSNN đóng
  'TE', 'HY', 'XK', 'SK', 'PV', 'LT',
  'LS', 'TG', 'ĐK', 'HS', 'TH', 'DT',
  'XD', 'BT', 'CS', 'CT', 'QN', 'CA', 'CY', 'XN', 'CK', 'KC', 'HD', 'TS', 'QQ', 'TA', 'TY', 'AK', 'TQ',
  // Nhóm tham gia theo hộ gia đình
  'KT', 'KK', 'KV', 'KC', 'KB', 'GD', 'GB', 'HG',
  'K1', 'K2', 'K3', 'K4', 'K5',
  // Nhóm khác
  'CC', 'VB', 'CN', 'SV', 'TP', 'VQ',
]);

/** Mức hưởng theo mã đối tượng 2 ký tự (TT25/2023) */
const BENEFIT_RATE_MAP: Record<string, number> = {
  // 100%
  'TE': 100, 'HY': 100, 'CB': 100, 'TB': 100, 'LT': 100,
  'LS': 100, 'TG': 100, 'ĐK': 100, 'BT': 100, 'CS': 100,
  'CC': 100, 'VB': 100, 'TK': 100, 'CT': 100,
  // 95%
  'HC': 95, 'ĐH': 95, 'HN': 95, 'HX': 95, 'TC': 95,
  'QN': 95, 'DT': 95, 'XD': 95,
  // 80%
  'K1': 80, 'KT': 80, 'HS': 80, 'HT': 80, 'TH': 80, 'NN': 80,
  // 70%
  'K2': 70, 'K3': 70, 'K4': 70, 'K5': 70,
  'KK': 70, 'KV': 70, 'KC': 70, 'KB': 70,
  // Đặc biệt
  'XK': 100, 'SK': 95, 'PV': 100, 'TN': 100,
};

// ─── Giới hạn ngày điều trị theo nhóm bệnh (TT01/2023, điều 28) ─────────────
const MAX_STAY_DAYS_DEFAULT = 180; // mặc định
const MAX_STAY_DAYS_CHRONIC = 365; // bệnh mạn tính dài ngày

// ICD prefix của bệnh mạn tính được nằm dài hơn
const CHRONIC_ICD_PREFIXES = [
  'F', 'G35', 'G40', 'I50', 'J44', 'K50', 'K51', 'L40',
  'M05', 'M06', 'N18', 'E10', 'E11',
];

// ─── Validators ──────────────────────────────────────────────────────────────

/** 1. Kiểm tra định dạng mã thẻ BHYT — TT35/2019 Điều 3 */
function validateCardFormat(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const code = (row.insuranceCode || '').trim().toUpperCase();

  if (!code) {
    issues.push({
      code: 'CARD_MISSING',
      severity: 'critical',
      field: 'Mã thẻ BHYT',
      message: 'Thiếu mã thẻ BHYT',
      reference: 'TT 35/2019/TT-BYT Điều 3',
    });
    return issues;
  }

  // Đúng 15 ký tự
  if (code.length !== 15) {
    issues.push({
      code: 'CARD_LENGTH',
      severity: 'critical',
      field: 'Mã thẻ BHYT',
      message: `Mã thẻ phải đúng 15 ký tự (hiện có ${code.length} ký tự)`,
      reference: 'TT 35/2019/TT-BYT Điều 3 khoản 1',
      value: code,
      expected: '15 ký tự',
    });
  }

  if (code.length >= 2) {
    const objCode = code.substring(0, 2);
    const isAlphabet = /^[A-ZĐ]{2}$/.test(objCode); // Hỗ trợ cả chữ Đ
    
    if (!isAlphabet) {
      issues.push({
        code: 'CARD_PREFIX',
        severity: 'critical',
        field: 'Mã thẻ BHYT',
        message: `Mã đối tượng "${objCode}" không hợp lệ (phải là 2 chữ cái)`,
        reference: 'TT 35/2019/TT-BYT',
        value: objCode,
        expected: '2 chữ cái in hoa',
      });
    } else if (!VALID_OBJECT_CODES.has(objCode)) {
      issues.push({
        code: 'CARD_PREFIX_UNKNOWN',
        severity: 'warning',
        field: 'Mã thẻ BHYT',
        message: `Mã đối tượng "${objCode}" ít gặp hoặc mới bổ sung. Cần kiểm tra lại.`,
        reference: 'Danh mục BHYT',
        value: objCode,
      });
    }
  }

  // Kiểm tra ký tự số ở vị trí 3–15
  if (code.length === 15) {
    const numPart = code.substring(2);
    if (!/^\d{13}$/.test(numPart)) {
      issues.push({
        code: 'CARD_NUMERIC',
        severity: 'warning',
        field: 'Mã thẻ BHYT',
        message: `13 ký tự cuối phải là chữ số (phát hiện: "${numPart}")`,
        reference: 'TT 35/2019/TT-BYT Điều 3 khoản 2',
        value: numPart,
        expected: '13 chữ số',
      });
    }
  }

  return issues;
}

/** 2. Kiểm tra mức hưởng BHYT — TT25/2023 */
function validateBenefitRate(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const code = (row.insuranceCode || '').trim().toUpperCase();
  if (code.length < 2) return issues;

  let expectedRate: number | undefined = undefined;
  
  // Ưu tiên xác định mức hưởng theo ký tự thứ 3 (mã quyền lợi 1-5 theo QĐ 595)
  if (code.length >= 3) {
    const rateChar = code.charAt(2);
    if (rateChar === '1' || rateChar === '2' || rateChar === '5') expectedRate = 100;
    else if (rateChar === '3') expectedRate = 95;
    else if (rateChar === '4') expectedRate = 80;
  }

  const objCode = code.substring(0, 2);
  // Dự phòng dùng bảng map nếu không có ký tự thứ 3 hợp lệ
  if (expectedRate === undefined) {
    expectedRate = BENEFIT_RATE_MAP[objCode];
  }

  if (expectedRate === undefined) return issues; // không rõ đối tượng

  const actualRate = row.bhytPercent || 0;
  if (actualRate === 0) return issues; // không có dữ liệu

  const tolerance = 1; // ±1% dung sai
  if (Math.abs(actualRate - expectedRate) > tolerance) {
    issues.push({
      code: 'BENEFIT_RATE_MISMATCH',
      severity: 'critical',
      field: 'Tỷ lệ BHYT (%)',
      message: `Mức hưởng ${actualRate}% không đúng với mã quyền lợi/đối tượng "${code.length >= 3 ? code.substring(0,3) : objCode}" (phải là ${expectedRate}%)`,
      reference: 'TT 25/2023/TT-BYT Điều 22',
      value: `${actualRate}%`,
      expected: `${expectedRate}%`,
    });
  }

  return issues;
}

/** 3. Kiểm tra tổng tiền: BHYT + BN = Tổng (±5000đ) */
function validateCostBalance(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const total = row.totalCost || 0;
  const bhyt = row.bhytPay || 0;
  const patient = row.patientPay || 0;

  if (total === 0) return issues;
  if (bhyt === 0 && patient === 0) return issues;

  const sum = bhyt + patient;
  const diff = Math.abs(total - sum);

  if (diff > 5000) {
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';
    issues.push({
      code: 'COST_IMBALANCE',
      severity: 'critical',
      field: 'Tổng chi phí',
      message: `Tổng chi phí lệch: ${fmt(total)} ≠ BHYT(${fmt(bhyt)}) + BN(${fmt(patient)}) = ${fmt(sum)} (chênh ${fmt(diff)})`,
      reference: 'TT 01/2023/TT-BYT Điều 14',
      value: fmt(sum),
      expected: fmt(total),
    });
  }

  return issues;
}

/** 4. Kiểm tra số ngày nằm viện hợp lý — TT01/2023 Điều 28 */
function validateStayDays(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const days = row.stayDays || 0;
  if (days <= 0) return issues;

  const icd = (row.diagnosis || '').toUpperCase();
  const isChronic = CHRONIC_ICD_PREFIXES.some(p => icd.startsWith(p));
  const maxDays = isChronic ? MAX_STAY_DAYS_CHRONIC : MAX_STAY_DAYS_DEFAULT;

  if (days > maxDays) {
    issues.push({
      code: 'STAY_DAYS_EXCEEDED',
      severity: 'warning',
      field: 'Số ngày nằm viện',
      message: `${days} ngày vượt giới hạn ${maxDays} ngày cho nhóm bệnh ${isChronic ? 'mạn tính' : 'thông thường'}`,
      reference: 'TT 01/2023/TT-BYT Điều 28',
      value: `${days} ngày`,
      expected: `≤ ${maxDays} ngày`,
    });
  }

  // Cảnh báo nếu > 60 ngày mà không phải bệnh mạn tính
  if (!isChronic && days > 60) {
    issues.push({
      code: 'STAY_DAYS_LONG',
      severity: 'info',
      field: 'Số ngày nằm viện',
      message: `${days} ngày nằm viện kéo dài — cần kiểm tra hồ sơ bệnh án`,
      reference: 'TT 01/2023/TT-BYT',
      value: `${days} ngày`,
    });
  }

  return issues;
}

/** 5. Kiểm tra mã ICD-10 hợp lệ — QĐ 4469/QĐ-BYT */
function validateICD(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const icd = (row.diagnosis || '').trim().toUpperCase();
  if (!icd) return issues;

  // Định dạng ICD-10: 1 chữ cái + 2 số (+ tùy chọn .X)
  // VD: A01, B24, J44.1, Z00
  const validPattern = /^[A-Z]\d{2}(\.\d{1,2})?$/;
  if (!validPattern.test(icd)) {
    issues.push({
      code: 'ICD_FORMAT',
      severity: 'warning',
      field: 'Mã chẩn đoán ICD-10',
      message: `Mã ICD-10 "${icd}" sai định dạng (phải là: chữ cái + 2 số, VD: J44.1)`,
      reference: 'QĐ 4469/QĐ-BYT Danh mục ICD-10',
      value: icd,
      expected: 'VD: A00, J44, J44.1',
    });
  }

  // Phát hiện một số mã không dùng cho BHYT
  const EXCLUDED_ICD = ['Z00', 'Z01', 'Z02', 'Z03'];
  if (EXCLUDED_ICD.includes(icd.split('.')[0])) {
    issues.push({
      code: 'ICD_EXCLUDED',
      severity: 'info',
      field: 'Mã chẩn đoán ICD-10',
      message: `Mã "${icd}" thường không được BHYT thanh toán (khám sàng lọc/tầm soát)`,
      reference: 'TT 01/2023/TT-BYT Điều 21',
      value: icd,
    });
  }

  return issues;
}

/** 6. Phát hiện trùng lần khám — cùng mã thẻ, cùng ngày vào viện */
function detectDuplicates(rows: PatientRow[]): Map<string, BhytIssue[]> {
  const result = new Map<string, BhytIssue[]>();
  // Map: "mã_thẻ|ngày_vào" → danh sách id
  const seen = new Map<string, string[]>();

  for (const row of rows) {
    const card = (row.insuranceCode || '').trim();
    const date = row.dateIn || '';
    const room = row.deptName || row.diagnosis || ''; // Thêm yếu tố phòng/khoa để phân biệt
    const key = `${card}|${date}|${room}`;
    if (!card || !date) continue;
    const list = seen.get(key) || [];
    list.push(row.id);
    seen.set(key, list);
  }

  for (const [key, ids] of seen.entries()) {
    if (ids.length <= 1) continue;
    const [card, date] = key.split('|');

    for (const id of ids) {
      const existing = result.get(id) || [];
      existing.push({
        code: 'DUPLICATE_VISIT',
        severity: 'critical',
        field: 'Trùng lần khám',
        message: `Mã thẻ ${card} có ${ids.length} lần khám cùng ngày ${date} — nguy cơ trùng hồ sơ`,
        reference: 'TT 01/2023/TT-BYT Điều 4; BHXH VN Công văn chống gian lận',
        value: `${ids.length} hồ sơ`,
        expected: '1 lần khám/ngày/thẻ',
      });
      result.set(id, existing);
    }
  }

  return result;
}

/** 7. Kiểm tra BHYT chi trả không vượt tổng chi phí */
function validateBhytPayNotExceedTotal(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  if (!row.totalCost || !row.bhytPay) return issues;
  if (row.bhytPay > row.totalCost + 1000) {
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';
    issues.push({
      code: 'BHYT_EXCEED_TOTAL',
      severity: 'critical',
      field: 'BHYT chi trả',
      message: `BHYT chi trả (${fmt(row.bhytPay)}) > Tổng chi phí (${fmt(row.totalCost)}) — không hợp lệ`,
      reference: 'TT 01/2023/TT-BYT',
      value: fmt(row.bhytPay),
      expected: `≤ ${fmt(row.totalCost)}`,
    });
  }
  return issues;
}

/** 8. Kiểm tra ngày vào/ra hợp lý */
function validateDateRange(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  if (!row.dateIn || !row.dateOut) return issues;

  // Parse DD/MM/YYYY
  const parseVN = (s: string) => {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  };

  const dIn = parseVN(row.dateIn);
  const dOut = parseVN(row.dateOut);
  if (!dIn || !dOut) return issues;

  if (dOut < dIn) {
    issues.push({
      code: 'DATE_ORDER',
      severity: 'critical',
      field: 'Ngày vào/ra viện',
      message: `Ngày ra (${row.dateOut}) trước ngày vào (${row.dateIn})`,
      reference: 'TT 01/2023/TT-BYT',
      value: `Ra: ${row.dateOut}`,
      expected: `Sau ngày vào: ${row.dateIn}`,
    });
  }

  // Kiểm tra trong tương lai
  const now = new Date();
  if (dIn > now) {
    issues.push({
      code: 'DATE_FUTURE',
      severity: 'warning',
      field: 'Ngày vào viện',
      message: `Ngày vào viện ${row.dateIn} là ngày trong tương lai`,
      reference: 'TT 01/2023/TT-BYT',
      value: row.dateIn,
    });
  }

  return issues;
}

/** 9. Kiểm tra danh mục chỉ định phẫu thuật / thủ thuật theo QĐ 130/QĐ-BYT */
function validateSurgeryAndProcedures(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const r = row as any;
  const surgeryFee = Number(r.surgeryFee || r.chiPhiPhauThuat || 0);
  // Nếu có chi phí phẫu thuật/thủ thuật lớn mà không có mã bệnh ngoại khoa tương ứng
  if (surgeryFee > 2000000) {
    const icd = (row.diagnosis || '').trim().toUpperCase();
    if (!icd || icd.startsWith('Z') || icd.startsWith('R')) {
      issues.push({
        code: 'SURGERY_INDICATION_RISK',
        severity: 'critical',
        field: 'Chi phí Phẫu thuật / Thủ thuật',
        message: `Phát sinh chi phí PT/TT lớn (${new Intl.NumberFormat('vi-VN').format(surgeryFee)}đ) nhưng mã ICD-10 (${icd || 'Trống'}) là triệu chứng/khám chung`,
        reference: 'QĐ 130/QĐ-BYT Bảng XML3; TT 39/2018/TT-BYT',
        value: `${new Intl.NumberFormat('vi-VN').format(surgeryFee)}đ`,
        expected: 'Mã bệnh ngoại khoa/chuyên khoa chỉ định can thiệp',
      });
    }
  }
  return issues;
}

/** 10. Kiểm tra tiền ngày giường theo định mức chuyên khoa — QĐ 130 & TT 22/2023 */
function validateBedFeePolicy(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const r = row as any;
  const bedFee = Number(r.bedFee || r.tienGiuong || 0);
  const days = row.stayDays || 0;

  // Nếu có tiền giường nhưng số ngày nằm viện = 0 (khám ngoại trú tính tiền giường nội trú)
  if (bedFee > 0 && days === 0) {
    issues.push({
      code: 'BED_FEE_OUTPATIENT',
      severity: 'critical',
      field: 'Tiền giường bệnh',
      message: `Bệnh nhân ngoại trú (0 ngày nằm viện) nhưng kê khai tiền giường (${new Intl.NumberFormat('vi-VN').format(bedFee)}đ) — nguy cơ xuất toán 100%`,
      reference: 'TT 22/2023/TT-BYT Định mức giường bệnh; QĐ 130/QĐ-BYT',
      value: `${new Intl.NumberFormat('vi-VN').format(bedFee)}đ`,
      expected: 'Chỉ áp dụng giường lưu hoặc điều trị nội trú',
    });
  } else if (days > 0 && bedFee > 0) {
    // Kiểm tra đơn giá ngày giường bình quân có vượt trần (Giường Hồi sức tích cực / Ngoại khoa tối đa ~1.2 tr/ngày)
    const avgBedDaily = bedFee / days;
    if (avgBedDaily > 1500000) {
      issues.push({
        code: 'BED_FEE_OVERLIMIT',
        severity: 'warning',
        field: 'Tiền giường bình quân/ngày',
        message: `Đơn giá giường bình quân (${new Intl.NumberFormat('vi-VN').format(Math.round(avgBedDaily))}đ/ngày) vượt trần giường hồi sức chuyên sâu`,
        reference: 'TT 22/2023/TT-BYT Biểu giá giường BHYT',
        value: `${new Intl.NumberFormat('vi-VN').format(Math.round(avgBedDaily))}đ/ngày`,
        expected: '≤ 1.200.000đ/ngày',
      });
    }
  }
  return issues;
}

/** 11. Kiểm tra chỉ định thuốc và tương thích mã chẩn đoán — QĐ 130 & TT 20/2022 */
function validateMedicationIndication(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const r = row as any;
  const drugFee = Number(r.drugFee || r.tienThuoc || 0);
  const total = row.totalCost || 0;

  // Chi phí thuốc chiếm > 85% tổng chi phí của một đợt điều trị nội trú
  if (total > 1000000 && drugFee / total > 0.85 && (row.stayDays || 0) > 3) {
    issues.push({
      code: 'DRUG_RATIO_ABNORMAL',
      severity: 'info',
      field: 'Tỷ lệ chi phí thuốc',
      message: `Chi phí thuốc chiếm ${Math.round((drugFee / total) * 100)}% tổng đợt điều trị — BHXH thường giám định trọng điểm hồ sơ này`,
      reference: 'Quy trình Giám định BHYT QĐ 3618/QĐ-BHXH',
      value: `${Math.round((drugFee / total) * 100)}%`,
      expected: 'Phù hợp cơ cấu chi phí theo mô hình bệnh tật',
    });
  }
  return issues;
}

// ─── 12. Danh mục & Kiểm tra Tương tác thuốc lâm sàng nguy cơ cao (High-Alert DDI) ───
interface DrugInteractionRule {
  drug1Keywords: string[];
  drug2Keywords: string[];
  riskName: string;
  mechanism: string;
  severity: 'critical' | 'warning';
  reference: string;
}

const HIGH_ALERT_DDI_RULES: DrugInteractionRule[] = [
  {
    drug1Keywords: ['ciprofloxacin', 'levofloxacin', 'moxifloxacin'],
    drug2Keywords: ['amiodarone', 'sotalol', 'quinidine'],
    riskName: 'Nguy cơ kéo dài khoảng QT tim và xoắn đỉnh (Torsades de Pointes)',
    mechanism: 'Hiệp đồng tác dụng ức chế kênh kali tim gây loạn nhịp thất đe dọa tính mạng',
    severity: 'critical',
    reference: 'Dược thư Quốc gia Việt Nam & Cảnh giác dược BYT',
  },
  {
    drug1Keywords: ['clopidogrel', 'plavix'],
    drug2Keywords: ['omeprazole', 'esomeprazole'],
    riskName: 'Giảm tác dụng chống kết tập tiểu cầu của Clopidogrel',
    mechanism: 'Ức chế enzym CYP2C19 ngăn chuyển hóa Clopidogrel sang dạng có hoạt tính',
    severity: 'warning',
    reference: 'Khuyến cáo FDA & Hội Tim mạch học Việt Nam',
  },
  {
    drug1Keywords: ['warfarin', 'sintrom', 'acenocoumarol', 'rivaroxaban', 'apixaban'],
    drug2Keywords: ['meloxicam', 'diclofenac', 'celecoxib', 'ibuprofen', 'piroxicam', 'ketoprofen'],
    riskName: 'Tăng nguy cơ xuất huyết tiêu hóa nghiêm trọng',
    mechanism: 'NSAID ức chế ngưng tập tiểu cầu và làm loét niêm mạc dạ dày trên bệnh nhân dùng chống đông',
    severity: 'critical',
    reference: 'Hướng dẫn Sử dụng Thuốc Kháng đông Bộ Y Tế',
  },
  {
    drug1Keywords: ['enalapril', 'perindopril', 'captopril', 'lisinopril', 'losartan', 'valsartan'],
    drug2Keywords: ['spironolactone', 'aldactone', 'triamterene'],
    riskName: 'Tăng Kali máu đe dọa tính mạng (Hyperkalemia)',
    mechanism: 'Hiệp đồng giữ Kali giữa thuốc ức chế hệ RAA và thuốc lợi tiểu kháng aldosterone',
    severity: 'warning',
    reference: 'Dược thư Quốc gia & Hướng dẫn Điều trị Tăng Huyết Áp BYT',
  },
  {
    drug1Keywords: ['simvastatin', 'atorvastatin'],
    drug2Keywords: ['clarithromycin', 'erythromycin', 'itraconazole', 'ketoconazole'],
    riskName: 'Nguy cơ tiêu cơ vân cấp và suy thận cấp (Rhabdomyolysis)',
    mechanism: 'Thuốc ức chế mạnh enzym CYP3A4 làm tăng vọt nồng độ statin trong huyết tương',
    severity: 'critical',
    reference: 'Cảnh báo an toàn Dược phẩm Cục Quản lý Dược BYT',
  },
];

/** 12. Kiểm tra tương tác thuốc nguy cơ cao — Dược thư Quốc gia & Hướng dẫn BYT */
function validateDrugInteractions(row: PatientRow): BhytIssue[] {
  const issues: BhytIssue[] = [];
  const r = row as any;
  // Chuỗi tổng hợp các thuốc chỉ định cho bệnh nhân (từ mã thuốc, tên thuốc, hoặc chi tiết đơn thuốc)
  const fullMedStr = [
    r.medicineCode || '',
    r.medicineList || '',
    r.tenThuoc || '',
    r.maThuoc || '',
    r.donThuoc || '',
    r.prescription || '',
  ].join(' ').toLowerCase();

  if (!fullMedStr || fullMedStr.trim().length < 4) return issues;

  for (const rule of HIGH_ALERT_DDI_RULES) {
    const hasD1 = rule.drug1Keywords.some(kw => fullMedStr.includes(kw));
    const hasD2 = rule.drug2Keywords.some(kw => fullMedStr.includes(kw));

    if (hasD1 && hasD2) {
      const d1Match = rule.drug1Keywords.find(kw => fullMedStr.includes(kw));
      const d2Match = rule.drug2Keywords.find(kw => fullMedStr.includes(kw));
      issues.push({
        code: 'DRUG_INTERACTION_ALERT',
        severity: rule.severity,
        field: 'Tương tác thuốc điều trị',
        message: `Phát hiện cặp thuốc tương tác nguy cơ cao: [${d1Match?.toUpperCase()}] và [${d2Match?.toUpperCase()}]. ${rule.riskName} (${rule.mechanism})`,
        reference: rule.reference,
        value: `${d1Match} + ${d2Match}`,
        expected: 'Tránh phối hợp đồng thời hoặc thay thế bằng thuốc tương đương an toàn',
      });
    }
  }

  return issues;
}

// ─── Tính điểm và mức rủi ro ─────────────────────────────────────────────────

function calcRisk(issues: BhytIssue[]): { score: number; riskLevel: BhytValidationResult['riskLevel'] } {
  if (issues.length === 0) return { score: 100, riskLevel: 'OK' };

  let deduction = 0;
  for (const iss of issues) {
    if (iss.severity === 'critical') deduction += 25;
    else if (iss.severity === 'warning') deduction += 10;
    else deduction += 3;
  }

  const score = Math.max(0, 100 - deduction);

  let riskLevel: BhytValidationResult['riskLevel'];
  if (score >= 90) riskLevel = 'THẤP';
  else if (score >= 70) riskLevel = 'TRUNG BÌNH';
  else if (score >= 40) riskLevel = 'CAO';
  else riskLevel = 'RẤT CAO';

  return { score, riskLevel };
}

// ─── Hàm chính ───────────────────────────────────────────────────────────────

/** Chạy toàn bộ kiểm tra BHYT cho 1 danh sách bệnh nhân */
export function validateBhyt(rows: PatientRow[]): BhytSummary {
  // Chạy duplicate detector trước (cần toàn bộ dataset)
  const dupIssues = detectDuplicates(rows);

  const results: BhytValidationResult[] = rows.map(row => {
    const issues: BhytIssue[] = [
      ...validateCardFormat(row),
      ...validateBenefitRate(row),
      ...validateCostBalance(row),
      ...validateStayDays(row),
      ...validateICD(row),
      ...validateBhytPayNotExceedTotal(row),
      ...validateDateRange(row),
      ...validateSurgeryAndProcedures(row),
      ...validateBedFeePolicy(row),
      ...validateMedicationIndication(row),
      ...validateDrugInteractions(row),
      ...(dupIssues.get(row.id) || []),
    ];

    const { score, riskLevel } = calcRisk(issues);

    return {
      patientId: row.id,
      patientName: row.name,
      insuranceCode: row.insuranceCode,
      issues,
      score,
      riskLevel: issues.length === 0 ? 'OK' : riskLevel,
    };
  });

  const ok         = results.filter(r => r.riskLevel === 'OK').length;
  const lowRisk    = results.filter(r => r.riskLevel === 'THẤP').length;
  const medRisk    = results.filter(r => r.riskLevel === 'TRUNG BÌNH').length;
  const highRisk   = results.filter(r => r.riskLevel === 'CAO').length;
  const veryHighRisk = results.filter(r => r.riskLevel === 'RẤT CAO').length;
  const allIssues  = results.flatMap(r => r.issues);

  return {
    total: results.length,
    ok,
    lowRisk,
    medRisk,
    highRisk,
    veryHighRisk,
    totalIssues:    allIssues.length,
    criticalIssues: allIssues.filter(i => i.severity === 'critical').length,
    results,
  };
}

/** Export kết quả ra Excel */
export function exportBhytValidation(summary: BhytSummary, filename: string): void {
  // Flatten về dạng bảng
  const rows: Record<string, unknown>[] = [];
  for (const r of summary.results) {
    if (r.issues.length === 0) {
      rows.push({
        'Mã thẻ BHYT': r.insuranceCode,
        'Tên BN': r.patientName,
        'Điểm': r.score,
        'Mức rủi ro': r.riskLevel,
        'Mã quy tắc': '',
        'Mức độ': '',
        'Trường': '',
        'Lỗi/Cảnh báo': 'Hợp lệ',
        'Căn cứ pháp lý': '',
        'Giá trị thực': '',
        'Giá trị đúng': '',
      });
    } else {
      for (const iss of r.issues) {
        rows.push({
          'Mã thẻ BHYT': r.insuranceCode,
          'Tên BN': r.patientName,
          'Điểm': r.score,
          'Mức rủi ro': r.riskLevel,
          'Mã quy tắc': iss.code,
          'Mức độ': iss.severity === 'critical' ? '🔴 Nghiêm trọng' : iss.severity === 'warning' ? '🟡 Cảnh báo' : '🔵 Lưu ý',
          'Trường': iss.field,
          'Lỗi/Cảnh báo': iss.message,
          'Căn cứ pháp lý': iss.reference,
          'Giá trị thực': iss.value || '',
          'Giá trị đúng': iss.expected || '',
        });
      }
    }
  }

  import('xlsx').then(XLSX => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 }, { wch: 25 }, { wch: 8 }, { wch: 14 },
      { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 60 },
      { wch: 30 }, { wch: 20 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Kiểm tra BHYT');
    XLSX.writeFile(wb, filename);
  });
}
