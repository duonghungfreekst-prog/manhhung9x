declare const __APP_VERSION__: string;

export type MatchStatus = 'KHỚP' | 'LỆCH' | 'KHÔNG THẤY';
export type FileFormat = 'excel' | 'xml' | 'csv';

export interface PatientRow {
  id: string;
  name: string;
  insuranceCode: string;     // Mã thẻ BHYT
  dob: string;               // Ngày sinh
  gender: string;            // Giới tính
  dateIn: string;            // Ngày vào viện
  dateOut: string;           // Ngày ra viện
  stayDays: number;          // Số ngày nằm viện
  totalCost: number;         // Tổng chi phí
  bhytPay: number;           // BHYT chi trả
  patientPay: number;        // Bệnh nhân chi trả
  bhytPercent: number;       // Tỷ lệ BHYT (%)
  diagnosis: string;         // Chẩn đoán chính (ICD)
  diagnosisName: string;     // Tên chẩn đoán
  deptName: string;          // Khoa
  treatmentType: string;     // Loại hình điều trị
  hospitalCode: string;      // Mã cơ sở KCB
  admissionNumber: string;   // Số lần vào viện
  objectCode: string;        // Mã đối tượng BHYT
  serviceCode: string;       // Mã dịch vụ kỹ thuật
  medicineCode: string;      // Mã thuốc
  medicineCost: number;      // Chi phí thuốc
  materialCost: number;      // Chi phí VTYT
  benefitCode: string;       // Mã quyền lợi (tỷ lệ đặc thù)
  paymentDate: string;       // Ngày quyết định thanh toán
  paymentDecisionNo: string; // Số quyết định BHYT
  diseaseCategory: string;   // Phân loại bệnh (thường / hiểm nghèo)
  regionCode: string;        // Mã khu vực
  yearVisitCount: number;    // Số lần khám trong năm
}

export interface ComparedResult {
  id: string;
  name: string;
  insuranceCode: string;
  timeRange: string;
  status: MatchStatus;
  portalRow?: Partial<PatientRow>;
  internalRow?: Partial<PatientRow>;
  differences: DiffDetail[];
}

export interface DiffDetail {
  field: string;
  portalValue: string;
  internalValue: string;
  severity: 'high' | 'medium' | 'low'; // high=tiền, medium=ngày, low=text
  note?: string;                         // Ghi chú thêm, VD: "⚠ Chỉ khác hoa/thường"
}

export interface Stats {
  total: number;
  khop: number;
  lech: number;
  khongThay: number;
  totalDiffs: number;
  highSeverityDiffs: number;
}

// Bảo mật #4.10: HistorySafeResult - chỉ lưu dữ liệu tổng hợp, không lưu raw patient data
export interface HistorySafeResult {
  id: string;
  name: string;                  // Họ tên (giữ để search lại)
  insuranceCode: string;         // Mã thẻ (giữ để tra cứu)
  timeRange: string;
  status: MatchStatus;
  differences: DiffDetail[];     // Chi tiết lệch (không có giá trị tài chính cụ thể)
  // KHÔNG lưu: portalRow, internalRow (chứa đầy đủ dữ liệu bệnh nhân)
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  portalFileName: string;
  internalFileName: string;
  stats: Stats;
  results: HistorySafeResult[];  // Dùng HistorySafeResult thay vì ComparedResult
}

export interface ColumnMapping {
  name: string[];
  insuranceCode: string[];
  dob: string[];
  gender: string[];
  dateIn: string[];
  dateOut: string[];
  totalCost: string[];
  bhytPay: string[];
  patientPay: string[];
  bhytPercent: string[];
  diagnosis: string[];
  diagnosisName: string[];
  deptName: string[];
  treatmentType: string[];
  hospitalCode: string[];
  admissionNumber: string[];
  objectCode: string[];
  serviceCode: string[];
  medicineCode: string[];
  medicineCost: string[];
  materialCost: string[];
  benefitCode: string[];
  paymentDate: string[];
  paymentDecisionNo: string[];
  diseaseCategory: string[];
  regionCode: string[];
  yearVisitCount: string[];
  stayDays: string[];
}

export interface MedicineDetail {
  ma_thuoc: string;
  ten_thuoc: string;
  don_vi_tinh: string;
  ham_luong: string;
  duong_dung: string;
  lieu_dung: string;
  so_dang_ky: string;
  so_luong: number;
  don_gia: number;
  thanh_tien: number;
  muc_huong: number;
  ngay_yl: string;
}

export interface ServiceDetail {
  ma_dvkt: string;
  ten_dvkt: string;
  don_vi_tinh: string;
  so_luong: number;
  don_gia: number;
  thanh_tien: number;
  muc_huong: number;
  ngay_yl: string;
  ngay_kq: string;
}

export interface SubclinicalDetail {
  ma_dich_vu: string;
  ten_dich_vu: string;
  ket_qua: string;
  chi_so_binh_thuong: string;
}

export interface ClinicalEvolution {
  dien_bien: string;
  hoi_chan: string;
  ngay_yl: string;
}

export interface ClinicalPatientRecord extends PatientRow {
  medicines: MedicineDetail[]; // Bảng 2
  services: ServiceDetail[];   // Bảng 3
  subclinical: SubclinicalDetail[]; // Bảng 4
  evolutions: ClinicalEvolution[]; // Bảng 5
}

export interface AppraisalRule {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  execute(patient: ClinicalPatientRecord): DiffDetail[];
}
