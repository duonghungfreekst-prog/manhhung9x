/**
 * DMH_Tools - Error Telemetry & Diagnostic History Service
 * Quản lý "Sổ tay bệnh án máy tính", lưu trữ lịch sử chẩn đoán lỗi in ấn,
 * kết quả phân tích của Gemini AI và hỗ trợ xuất dữ liệu phục vụ nghiên cứu & hoàn thiện phần mềm.
 */

export interface DiagnosticRecord {
  id: string;
  timestamp: string;
  category: string;
  title: string;
  issueCount: number;
  details: any;
  aiAnalysis?: string;
  resolved?: boolean;
  notes?: string;
}

export type TelemetryRecord = DiagnosticRecord;

const STORAGE_KEY_TELEMETRY = 'dmh_error_telemetry_history';
const MAX_RECORDS = 50; // Lưu tối đa 50 ca bệnh án gần nhất

export class ErrorTelemetryService {
  /**
   * Lấy toàn bộ danh sách bệnh án đã lưu
   */
  static getHistory(): DiagnosticRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TELEMETRY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * Alias tương thích ngược
   */
  static getRecords(): DiagnosticRecord[] {
    return this.getHistory();
  }

  /**
   * Lưu một bệnh án chẩn đoán mới
   */
  static saveRecord(record: Omit<DiagnosticRecord, 'id' | 'timestamp'>): DiagnosticRecord {
    const existing = this.getHistory();
    const newRecord: DiagnosticRecord = {
      ...record,
      id: `diag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString()
    };

    const updated = [newRecord, ...existing].slice(0, MAX_RECORDS);
    try {
      localStorage.setItem(STORAGE_KEY_TELEMETRY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[Telemetry] Không thể lưu vào LocalStorage:', e);
    }
    return newRecord;
  }

  /**
   * Xóa một bản ghi theo ID
   */
  static deleteRecord(id: string): void {
    const records = this.getHistory().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_TELEMETRY, JSON.stringify(records));
  }

  /**
   * Xóa toàn bộ lịch sử
   */
  static clearHistory(): void {
    localStorage.removeItem(STORAGE_KEY_TELEMETRY);
  }

  /**
   * Xuất toàn bộ lịch sử thành chuỗi JSON telemetry
   */
  static exportTelemetryJson(): string {
    const records = this.getHistory();
    const exportPackage = {
      app: 'DMH Tools',
      version: '6.9.13',
      exportedAt: new Date().toISOString(),
      totalRecords: records.length,
      history: records
    };
    return JSON.stringify(exportPackage, null, 2);
  }

  /**
   * Tải file JSON về máy tính
   */
  static downloadJsonFile(): void {
    const jsonStr = this.exportTelemetryJson();
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DMH_Telemetry_Report_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
