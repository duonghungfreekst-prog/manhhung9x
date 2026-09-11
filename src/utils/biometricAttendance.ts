import * as XLSX from 'xlsx';

// ── Cấu trúc dữ liệu Ca làm việc & Lịch biểu ─────────────────────────────────

export interface ShiftPreset {
  id: string;
  code: string; // Mã viết tắt hiển thị trên lưới: HC, S, C, T, 24H...
  name: string; // Tên ca: Ca Hành Chính, Ca Sáng, Ca Chiều...
  startTime: string; // '07:30' (HH:mm)
  endTime: string; // '17:00' (HH:mm)
  breakStart?: string; // '11:30'
  breakEnd?: string; // '13:00'
  workUnits: number; // 1.0, 0.5, 1.5, 2.0 công
  graceLateMinutes: number; // Phút cho phép đi muộn (mặc định 15)
  graceEarlyMinutes: number; // Phút cho phép về sớm (mặc định 15)
  checkInWindowStart?: string; // Bắt đầu nhận quẹt vào (ví dụ '06:00')
  checkInWindowEnd?: string; // Hết giờ nhận quẹt vào (ví dụ '09:30')
  checkOutWindowStart?: string; // Bắt đầu nhận quẹt ra (ví dụ '16:00')
  checkOutWindowEnd?: string; // Hết giờ nhận quẹt ra (ví dụ '21:00')
  overtimeThresholdMinutes: number; // Số phút ngoài ca để bắt đầu tính OT (mặc định 30)
  isOvernight?: boolean; // Ca trực qua đêm
  color: string; // Màu huy hiệu hiển thị trên lưới
}

export interface WeeklyScheduleTemplate {
  // 0: Chủ Nhật, 1: Thứ 2, 2: Thứ 3, ..., 6: Thứ 7
  [dayOfWeek: number]: string; // Shift ID hoặc 'OFF' (Nghỉ) hoặc 'AUTO' (Tự động)
}

export interface EmployeeRoster {
  empId: string;
  empName: string;
  department?: string;
  defaultShiftId?: string; // 'AUTO' hoặc Shift ID
  customShifts?: Record<string, string>; // 'YYYY-MM-DD' -> Shift ID hoặc 'OFF'
}

export interface ScheduleConfig {
  weeklyTemplate: WeeklyScheduleTemplate;
  employeeRosters: Record<string, EmployeeRoster>;
}

// ── Dữ liệu quẹt thẻ thô & Kết quả phân tích ────────────────────────────────

export interface RawPunchLog {
  empId: string;
  empName: string;
  timestamp: Date;
  punchType?: 'IN' | 'OUT' | 'UNKNOWN';
  deviceId?: string;
}

export type AttendanceStatus =
  | 'OK'          // Đúng giờ
  | 'LATE'        // Đi muộn
  | 'EARLY'       // Về sớm
  | 'LATE_EARLY'  // Vừa đi muộn vừa về sớm
  | 'MISSING_OUT' // Quên quẹt ra
  | 'MISSING_IN'  // Quên quẹt vào
  | 'ABSENT'      // Vắng mặt
  | 'OFF';        // Ngày nghỉ

export interface DailyAttendanceRecord {
  empId: string;
  empName: string;
  dateKey: string; // 'YYYY-MM-DD'
  dateDisplay: string; // 'DD/MM/YYYY'
  dayOfWeek: number; // 0..6
  assignedShift?: ShiftPreset;
  firstIn: string | null; // 'HH:mm:ss'
  lastOut: string | null; // 'HH:mm:ss'
  allPunches: string[]; // ['07:25:10', '17:05:32']
  lateMinutes: number;
  earlyMinutes: number;
  workHours: number;
  overtimeHours: number;
  workUnitsEarned: number;
  status: AttendanceStatus;
  notes: string[];
}

export interface EmployeeMonthlySummary {
  empId: string;
  empName: string;
  department?: string;
  totalWorkDays: number;
  totalWorkUnits: number;
  totalWorkHours: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  totalLateCount: number;
  totalEarlyCount: number;
  totalMissingCount: number;
  totalOtHours: number;
  days: Record<number, DailyAttendanceRecord>; // 1..31 -> record
}

// ── Danh mục Ca làm việc chuẩn mặc định ─────────────────────────────────────

export const DEFAULT_SHIFTS: ShiftPreset[] = [
  {
    id: 'shift_hc',
    code: 'HC',
    name: 'Ca Hành Chính',
    startTime: '07:30',
    endTime: '17:00',
    breakStart: '11:30',
    breakEnd: '13:00',
    workUnits: 1.0,
    graceLateMinutes: 15,
    graceEarlyMinutes: 15,
    checkInWindowStart: '06:00',
    checkInWindowEnd: '09:30',
    checkOutWindowStart: '16:00',
    checkOutWindowEnd: '21:00',
    overtimeThresholdMinutes: 30,
    color: '#3b82f6',
  },
  {
    id: 'shift_sang',
    code: 'S',
    name: 'Ca Sáng',
    startTime: '07:00',
    endTime: '11:30',
    workUnits: 0.5,
    graceLateMinutes: 15,
    graceEarlyMinutes: 15,
    checkInWindowStart: '06:00',
    checkInWindowEnd: '09:00',
    checkOutWindowStart: '11:00',
    checkOutWindowEnd: '13:30',
    overtimeThresholdMinutes: 30,
    color: '#10b981',
  },
  {
    id: 'shift_chieu',
    code: 'C',
    name: 'Ca Chiều',
    startTime: '13:00',
    endTime: '17:30',
    workUnits: 0.5,
    graceLateMinutes: 15,
    graceEarlyMinutes: 15,
    checkInWindowStart: '12:00',
    checkInWindowEnd: '14:30',
    checkOutWindowStart: '17:00',
    checkOutWindowEnd: '20:00',
    overtimeThresholdMinutes: 30,
    color: '#f59e0b',
  },
  {
    id: 'shift_toi',
    code: 'T',
    name: 'Ca Tối / Trực Đêm',
    startTime: '18:00',
    endTime: '06:00',
    workUnits: 1.5,
    graceLateMinutes: 15,
    graceEarlyMinutes: 15,
    checkInWindowStart: '17:00',
    checkInWindowEnd: '20:00',
    checkOutWindowStart: '05:30',
    checkOutWindowEnd: '08:30',
    overtimeThresholdMinutes: 30,
    isOvernight: true,
    color: '#8b5cf6',
  },
  {
    id: 'shift_truc24',
    code: '24H',
    name: 'Ca Trực 24 Giờ',
    startTime: '07:30',
    endTime: '07:30',
    workUnits: 2.0,
    graceLateMinutes: 15,
    graceEarlyMinutes: 15,
    checkInWindowStart: '06:30',
    checkInWindowEnd: '09:00',
    checkOutWindowStart: '07:00',
    checkOutWindowEnd: '09:30',
    overtimeThresholdMinutes: 60,
    isOvernight: true,
    color: '#ec4899',
  },
];

export const DEFAULT_WEEKLY_TEMPLATE: WeeklyScheduleTemplate = {
  1: 'shift_hc', // Thứ 2: Ca HC
  2: 'shift_hc', // Thứ 3: Ca HC
  3: 'shift_hc', // Thứ 4: Ca HC
  4: 'shift_hc', // Thứ 5: Ca HC
  5: 'shift_hc', // Thứ 6: Ca HC
  6: 'shift_sang', // Thứ 7: Ca Sáng
  0: 'OFF',        // Chủ Nhật: Nghỉ
};

// ── Hàm tiện ích xử lý thời gian ───────────────────────────────────────────

export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

export function formatTimeHM(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatTimeHMS(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

export function parseAnyDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
  }
  if (typeof val === 'string') {
    const str = val.trim();
    // YYYY-MM-DD HH:mm:ss or YYYY/MM/DD
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    // DD/MM/YYYY HH:mm:ss or DD-MM-YYYY
    const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (match) {
      const [, dd, mm, yyyy, h = '0', m = '0', s = '0'] = match;
      d = new Date(+yyyy, +mm - 1, +dd, +h, +m, +s);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// ── Bộ phân tích file máy chấm công đa định dạng ────────────────────────────

export interface ParsedAttendanceResult {
  punchLogs: RawPunchLog[];
  employees: { id: string; name: string }[];
  fileFormat: 'EXCEL_LOG' | 'EXCEL_MATRIX' | 'USB_TEXT' | 'CSV_LOG';
  totalRows: number;
}

/**
 * Đọc file Text / DAT xuất trực tiếp từ máy chấm công qua USB (chuẩn Ronald Jack, ZKTeco)
 * Định dạng phổ biến:
 * 1\t2026-09-11 07:28:15\t1\t0\t1\t0
 * Hoặc: 101   2026-09-11 07:30:12   0
 */
export function parseBiometricTextOrDat(text: string): ParsedAttendanceResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const punchLogs: RawPunchLog[] = [];
  const empMap = new Map<string, string>();

  // Biểu thức chính quy bắt ngày giờ: YYYY-MM-DD HH:mm:ss hoặc YYYY/MM/DD HH:mm:ss
  const dateRegex = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?)/;

  for (const line of lines) {
    const match = line.match(dateRegex);
    if (!match) continue;

    const dateStr = match[1];
    const timestamp = parseAnyDate(dateStr);
    if (!timestamp) continue;

    // Lấy phần phía trước ngày giờ làm Mã NV
    const beforeDate = line.substring(0, match.index).trim();
    const partsBefore = beforeDate.split(/[\t\s,;]+/);
    const empId = partsBefore[partsBefore.length - 1] || partsBefore[0] || 'NV_UNKNOWN';

    // Trạng thái quẹt (nếu có sau ngày giờ)
    const afterDate = line.substring((match.index ?? 0) + dateStr.length).trim();
    const partsAfter = afterDate.split(/[\t\s,;]+/);
    let punchType: 'IN' | 'OUT' | 'UNKNOWN' = 'UNKNOWN';
    if (partsAfter[0] === '0' || partsAfter[0]?.toLowerCase() === 'in') {
      punchType = 'IN';
    } else if (partsAfter[0] === '1' || partsAfter[0]?.toLowerCase() === 'out') {
      punchType = 'OUT';
    }

    punchLogs.push({
      empId,
      empName: `NV ${empId}`,
      timestamp,
      punchType,
    });

    if (!empMap.has(empId)) {
      empMap.set(empId, `NV ${empId}`);
    }
  }

  return {
    punchLogs,
    employees: Array.from(empMap.entries()).map(([id, name]) => ({ id, name })),
    fileFormat: 'USB_TEXT',
    totalRows: lines.length,
  };
}

/**
 * Tự động tìm hàng header thực tế trong 15 dòng đầu của sheet Excel
 */
function findHeaderRow(rawArr: unknown[][]): { headerIdx: number; headers: string[] } {
  let headerIdx = 0;
  let maxScore = -1;

  rawArr.slice(0, 15).forEach((row, idx) => {
    let score = 0;
    const cells = (row as unknown[]).map(c => String(c ?? '').trim().toLowerCase());
    cells.forEach(cell => {
      if (cell) score += 1;
      if (/mã|tên|nhân viên|họ|user|id|thời gian|ngày|giờ|time|date|vào|ra|check/i.test(cell)) {
        score += 5;
      }
    });
    if (score > maxScore) {
      maxScore = score;
      headerIdx = idx;
    }
  });

  const rawHeader = (rawArr[headerIdx] || []) as unknown[];
  const colLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const headers = rawHeader.map((h, i) => {
    const raw = String(h ?? '').trim();
    return raw || `Cột ${i < 26 ? colLetters[i] : i + 1}`;
  });

  return { headerIdx, headers };
}

/**
 * Đọc file Excel (.xlsx, .xls) hoặc CSV máy chấm công
 */
export function parseBiometricExcelOrCsv(fileBuffer: ArrayBuffer): ParsedAttendanceResult {
  const wb = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheetName];

  const rawArr: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (!rawArr.length) {
    throw new Error('Tệp không chứa dữ liệu!');
  }

  const { headerIdx, headers } = findHeaderRow(rawArr);
  const dataRows = rawArr.slice(headerIdx + 1);

  // Nhận diện loại cấu trúc file: Ma trận ngày (Vào 1, Ra 1...) hay Log sự kiện
  const inOutCols: { colName: string; index: number; type: 'IN' | 'OUT' }[] = [];
  headers.forEach((h, idx) => {
    if (/vào\s*\d*|check\s*in\s*\d*|in\s*\d+/i.test(h)) {
      inOutCols.push({ colName: h, index: idx, type: 'IN' });
    } else if (/ra\s*\d*|check\s*out\s*\d*|out\s*\d+/i.test(h)) {
      inOutCols.push({ colName: h, index: idx, type: 'OUT' });
    }
  });

  const isMatrix = inOutCols.length >= 2;

  // Cột Mã NV, Tên NV, Ngày
  const empIdColIdx = headers.findIndex(h => /mã\s*(nv|nhân viên|chấm công|số|cc|id)|user\s*id|ac-no|pin/i.test(h));
  const empNameColIdx = headers.findIndex(h => /tên\s*(nv|nhân viên|bác sĩ|cbcnv)|họ\s*(và\s*)?tên|name|staff/i.test(h));
  const dateColIdx = headers.findIndex(h => /ngày\s*chấm|ngày\s*làm|date|ngày/i.test(h));
  const timeColIdx = headers.findIndex(h => /thời\s*gian|ngày\s*giờ|date\s*time|quẹt|giờ/i.test(h));
  const statusColIdx = headers.findIndex(h => /trạng\s*thái|kiểu\s*quẹt|state|type|vào\s*ra/i.test(h));

  const punchLogs: RawPunchLog[] = [];
  const empMap = new Map<string, string>();

  if (isMatrix) {
    // ── XỬ LÝ ĐỊNH DẠNG MA TRẬN NGÀY (CỘT VÀO 1, RA 1, VÀO 2, RA 2...) ──
    for (const row of dataRows) {
      const rowArr = row as unknown[];
      const empId = String(rowArr[empIdColIdx >= 0 ? empIdColIdx : 0] ?? '').trim();
      const empName = empNameColIdx >= 0 ? String(rowArr[empNameColIdx] ?? '').trim() : `NV ${empId}`;
      const baseDate = parseAnyDate(rowArr[dateColIdx >= 0 ? dateColIdx : 1]);

      if (!empId && !empName) continue;
      const validEmpId = empId || empName;
      if (!empMap.has(validEmpId)) empMap.set(validEmpId, empName || validEmpId);

      for (const col of inOutCols) {
        const val = rowArr[col.index];
        if (!val) continue;

        let punchDate: Date | null = null;
        if (val instanceof Date) {
          punchDate = val;
        } else if (typeof val === 'number') {
          // Time serial in Excel
          if (baseDate) {
            const timeCode = XLSX.SSF.parse_date_code(val);
            if (timeCode) {
              punchDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), timeCode.H, timeCode.M, timeCode.S);
            }
          } else {
            punchDate = parseAnyDate(val);
          }
        } else if (typeof val === 'string') {
          const timeStr = val.trim();
          if (baseDate && /^\d{1,2}:\d{1,2}(?::\d{1,2})?$/.test(timeStr)) {
            const [h, m, s = 0] = timeStr.split(':').map(Number);
            punchDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m, s);
          } else {
            punchDate = parseAnyDate(timeStr);
          }
        }

        if (punchDate && !isNaN(punchDate.getTime())) {
          punchLogs.push({
            empId: validEmpId,
            empName: empName || validEmpId,
            timestamp: punchDate,
            punchType: col.type,
          });
        }
      }
    }

    return {
      punchLogs,
      employees: Array.from(empMap.entries()).map(([id, name]) => ({ id, name })),
      fileFormat: 'EXCEL_MATRIX',
      totalRows: dataRows.length,
    };
  }

  // ── XỬ LÝ ĐỊNH DẠNG EVENT LOG (MỖI DÒNG LÀ 1 LẦN QUẸT) ──
  const finalTimeIdx = timeColIdx >= 0 ? timeColIdx : (dateColIdx >= 0 ? dateColIdx : 2);
  const finalIdIdx = empIdColIdx >= 0 ? empIdColIdx : (empNameColIdx >= 0 ? empNameColIdx : 0);
  const finalNameIdx = empNameColIdx >= 0 ? empNameColIdx : finalIdIdx;

  for (const row of dataRows) {
    const rowArr = row as unknown[];
    const rawId = String(rowArr[finalIdIdx] ?? '').trim();
    const rawName = String(rowArr[finalNameIdx] ?? '').trim();
    const rawTime = rowArr[finalTimeIdx];

    if (!rawId && !rawName) continue;
    const empId = rawId || rawName;
    const empName = rawName || `NV ${empId}`;

    const timestamp = parseAnyDate(rawTime);
    if (!timestamp) continue;

    let punchType: 'IN' | 'OUT' | 'UNKNOWN' = 'UNKNOWN';
    if (statusColIdx >= 0) {
      const st = String(rowArr[statusColIdx] ?? '').trim().toLowerCase();
      if (/vào|in|check\s*in|0/i.test(st)) punchType = 'IN';
      else if (/ra|out|check\s*out|1/i.test(st)) punchType = 'OUT';
    }

    punchLogs.push({
      empId,
      empName,
      timestamp,
      punchType,
    });

    if (!empMap.has(empId)) {
      empMap.set(empId, empName);
    }
  }

  return {
    punchLogs,
    employees: Array.from(empMap.entries()).map(([id, name]) => ({ id, name })),
    fileFormat: 'EXCEL_LOG',
    totalRows: dataRows.length,
  };
}

// ── Shift Engine: Tự động ghép ca & Tính toán công ──────────────────────────

/**
 * Thuật toán tìm Ca làm việc phù hợp nhất dựa trên thời gian quẹt vào thực tế
 */
export function matchBestShift(
  firstInTimeStr: string,
  shifts: ShiftPreset[],
  dayOfWeek: number,
  weeklyTemplate?: WeeklyScheduleTemplate
): ShiftPreset | undefined {
  if (!shifts.length) return undefined;

  // 1. Kiểm tra cấu hình lịch tuần nếu có ca chỉ định
  if (weeklyTemplate && weeklyTemplate[dayOfWeek]) {
    const scheduledShiftId = weeklyTemplate[dayOfWeek];
    if (scheduledShiftId === 'OFF') return undefined;
    if (scheduledShiftId !== 'AUTO') {
      const found = shifts.find(s => s.id === scheduledShiftId);
      if (found) return found;
    }
  }

  // 2. Tự động so khớp: tính độ sai lệch giữa giờ quẹt và giờ bắt đầu ca
  const punchMinutes = timeStringToMinutes(firstInTimeStr);
  let bestShift: ShiftPreset = shifts[0];
  let minDiff = Infinity;

  for (const shift of shifts) {
    const shiftStartMinutes = timeStringToMinutes(shift.startTime);
    let diff = Math.abs(punchMinutes - shiftStartMinutes);
    // Nếu quẹt trong khoảng nhận diện ca (Window) thì ưu tiên tuyệt đối
    if (shift.checkInWindowStart && shift.checkInWindowEnd) {
      const winStart = timeStringToMinutes(shift.checkInWindowStart);
      const winEnd = timeStringToMinutes(shift.checkInWindowEnd);
      if (punchMinutes >= winStart && punchMinutes <= winEnd) {
        diff -= 60; // Thưởng điểm ưu tiên
      }
    }
    if (diff < minDiff) {
      minDiff = diff;
      bestShift = shift;
    }
  }

  return bestShift;
}

/**
 * Đánh giá chấm công cho 1 ngày làm việc của nhân viên
 */
export function evaluateDailyAttendance(
  empId: string,
  empName: string,
  date: Date,
  punches: Date[],
  shifts: ShiftPreset[],
  scheduleConfig: ScheduleConfig
): DailyAttendanceRecord {
  const dateKey = formatDateKey(date);
  const dateDisplay = formatDateDisplay(date);
  const dayOfWeek = date.getDay();

  // Sắp xếp các lần quẹt theo thứ tự thời gian tăng dần
  const sortedPunches = [...punches].sort((a, b) => a.getTime() - b.getTime());
  const allPunchStrings = sortedPunches.map(formatTimeHMS);

  // Xác định Ca làm việc áp dụng
  const roster = scheduleConfig.employeeRosters[empId];
  let assignedShift: ShiftPreset | undefined;

  if (roster?.customShifts?.[dateKey]) {
    const customId = roster.customShifts[dateKey];
    if (customId === 'OFF') {
      return {
        empId, empName, dateKey, dateDisplay, dayOfWeek,
        firstIn: null, lastOut: null, allPunches: allPunchStrings,
        lateMinutes: 0, earlyMinutes: 0, workHours: 0, overtimeHours: 0,
        workUnitsEarned: 0, status: 'OFF', notes: ['Nghỉ phép theo lịch phân ca'],
      };
    }
    assignedShift = shifts.find(s => s.id === customId);
  } else if (roster?.defaultShiftId && roster.defaultShiftId !== 'AUTO') {
    assignedShift = shifts.find(s => s.id === roster.defaultShiftId);
  } else {
    // Dùng lịch tuần mẫu hoặc tự động so khớp
    const firstPunchStr = sortedPunches.length > 0 ? formatTimeHM(sortedPunches[0]) : '';
    if (firstPunchStr) {
      assignedShift = matchBestShift(firstPunchStr, shifts, dayOfWeek, scheduleConfig.weeklyTemplate);
    } else if (scheduleConfig.weeklyTemplate[dayOfWeek] && scheduleConfig.weeklyTemplate[dayOfWeek] !== 'OFF' && scheduleConfig.weeklyTemplate[dayOfWeek] !== 'AUTO') {
      assignedShift = shifts.find(s => s.id === scheduleConfig.weeklyTemplate[dayOfWeek]);
    }
  }

  // Nếu không có lần quẹt nào
  if (sortedPunches.length === 0) {
    const isScheduledOff = scheduleConfig.weeklyTemplate[dayOfWeek] === 'OFF';
    return {
      empId, empName, dateKey, dateDisplay, dayOfWeek, assignedShift,
      firstIn: null, lastOut: null, allPunches: [],
      lateMinutes: 0, earlyMinutes: 0, workHours: 0, overtimeHours: 0,
      workUnitsEarned: 0,
      status: isScheduledOff ? 'OFF' : 'ABSENT',
      notes: isScheduledOff ? ['Nghỉ theo lịch'] : ['Vắng mặt không quẹt thẻ'],
    };
  }

  // Có dữ liệu quẹt thẻ
  const firstPunch = sortedPunches[0];
  const lastPunch = sortedPunches.length > 1 ? sortedPunches[sortedPunches.length - 1] : null;
  const firstInStr = formatTimeHM(firstPunch);
  const lastOutStr = lastPunch ? formatTimeHM(lastPunch) : null;

  if (!assignedShift) {
    // Không xác định được ca cụ thể -> tính theo giờ làm việc thô
    const workHours = lastPunch ? Math.max(0, (lastPunch.getTime() - firstPunch.getTime()) / (1000 * 60 * 60)) : 0;
    return {
      empId, empName, dateKey, dateDisplay, dayOfWeek,
      firstIn: firstInStr, lastOut: lastOutStr, allPunches: allPunchStrings,
      lateMinutes: 0, earlyMinutes: 0,
      workHours: Number(workHours.toFixed(2)),
      overtimeHours: 0,
      workUnitsEarned: lastPunch ? 1.0 : 0.5,
      status: lastPunch ? 'OK' : 'MISSING_OUT',
      notes: [lastPunch ? 'Không có ca mẫu, tính 1 công' : 'Chỉ có 1 lần quẹt, thiếu quẹt ra'],
    };
  }

  // ── Tính toán chi tiết dựa trên Ca làm việc ──
  const shiftStartMin = timeStringToMinutes(assignedShift.startTime);
  const shiftEndMin = timeStringToMinutes(assignedShift.endTime);
  const actualInMin = timeStringToMinutes(firstInStr);
  const notes: string[] = [];

  // Đi muộn: sau khi trừ thời gian ân hạn (grace period)
  let lateMinutes = 0;
  const inDiff = actualInMin - shiftStartMin;
  if (inDiff > assignedShift.graceLateMinutes) {
    lateMinutes = inDiff;
    notes.push(`Đi muộn ${lateMinutes} phút`);
  }

  // Về sớm & Tăng ca
  let earlyMinutes = 0;
  let overtimeHours = 0;
  let workHours = 0;

  if (lastPunch) {
    const actualOutMin = timeStringToMinutes(lastOutStr!);
    // Xử lý ca qua đêm
    const effectiveShiftEndMin = assignedShift.isOvernight && shiftEndMin < shiftStartMin
      ? shiftEndMin + 24 * 60
      : shiftEndMin;
    const effectiveActualOutMin = assignedShift.isOvernight && actualOutMin < actualInMin
      ? actualOutMin + 24 * 60
      : actualOutMin;

    const outDiff = effectiveShiftEndMin - effectiveActualOutMin;
    if (outDiff > assignedShift.graceEarlyMinutes) {
      earlyMinutes = outDiff;
      notes.push(`Về sớm ${earlyMinutes} phút`);
    } else if (effectiveActualOutMin > effectiveShiftEndMin) {
      const extraMinutes = effectiveActualOutMin - effectiveShiftEndMin;
      if (extraMinutes >= assignedShift.overtimeThresholdMinutes) {
        overtimeHours = Number((extraMinutes / 60).toFixed(2));
        notes.push(`Tăng ca ${overtimeHours} giờ`);
      }
    }

    // Tính tổng giờ làm việc thực tế (trừ giờ nghỉ trưa nếu có)
    let totalMinutes = effectiveActualOutMin - actualInMin;
    if (assignedShift.breakStart && assignedShift.breakEnd) {
      const breakStartMin = timeStringToMinutes(assignedShift.breakStart);
      const breakEndMin = timeStringToMinutes(assignedShift.breakEnd);
      if (actualInMin <= breakStartMin && effectiveActualOutMin >= breakEndMin) {
        totalMinutes -= (breakEndMin - breakStartMin);
      }
    }
    workHours = Number((Math.max(0, totalMinutes) / 60).toFixed(2));
  } else {
    notes.push('Chỉ quẹt 1 lần - Thiếu giờ quẹt ra');
  }

  // Xác định trạng thái
  let status: AttendanceStatus = 'OK';
  if (!lastPunch) {
    status = 'MISSING_OUT';
  } else if (lateMinutes > 0 && earlyMinutes > 0) {
    status = 'LATE_EARLY';
  } else if (lateMinutes > 0) {
    status = 'LATE';
  } else if (earlyMinutes > 0) {
    status = 'EARLY';
  }

  // Tính số công thực nhận
  let workUnitsEarned = assignedShift.workUnits;
  if (!lastPunch) {
    // Quên quẹt ra -> tính 50% công ca làm việc
    workUnitsEarned = Number((assignedShift.workUnits * 0.5).toFixed(2));
  } else if (lateMinutes > 120 || earlyMinutes > 120) {
    // Đi muộn hoặc về sớm quá 2 tiếng -> tính nửa công
    workUnitsEarned = Number((assignedShift.workUnits * 0.5).toFixed(2));
  }

  return {
    empId,
    empName,
    dateKey,
    dateDisplay,
    dayOfWeek,
    assignedShift,
    firstIn: firstInStr,
    lastOut: lastOutStr,
    allPunches: allPunchStrings,
    lateMinutes,
    earlyMinutes,
    workHours,
    overtimeHours,
    workUnitsEarned,
    status,
    notes,
  };
}

/**
 * Đánh giá tổng hợp toàn bộ tháng cho danh sách nhân viên
 */
export function evaluateMonthlyAttendance(
  punchLogs: RawPunchLog[],
  shifts: ShiftPreset[],
  scheduleConfig: ScheduleConfig,
  month: number, // 1..12
  year: number
): EmployeeMonthlySummary[] {
  // Lập danh mục tất cả nhân viên từ log và từ cấu hình
  const empMap = new Map<string, { id: string; name: string }>();
  punchLogs.forEach(p => {
    if (!empMap.has(p.empId)) empMap.set(p.empId, { id: p.empId, name: p.empName });
  });
  Object.values(scheduleConfig.employeeRosters).forEach(r => {
    if (!empMap.has(r.empId)) empMap.set(r.empId, { id: r.empId, name: r.empName });
  });

  // Gom nhóm lần quẹt theo: empId -> dateKey -> Date[]
  const punchesByEmpDate = new Map<string, Map<string, Date[]>>();
  for (const log of punchLogs) {
    const logDate = log.timestamp;
    if (logDate.getMonth() + 1 !== month || logDate.getFullYear() !== year) continue;
    const dateKey = formatDateKey(logDate);

    if (!punchesByEmpDate.has(log.empId)) punchesByEmpDate.set(log.empId, new Map());
    const empDates = punchesByEmpDate.get(log.empId)!;
    if (!empDates.has(dateKey)) empDates.set(dateKey, []);
    empDates.get(dateKey)!.push(logDate);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const summaries: EmployeeMonthlySummary[] = [];

  for (const [empId, { name }] of empMap.entries()) {
    const empPunches = punchesByEmpDate.get(empId);
    const daysRecord: Record<number, DailyAttendanceRecord> = {};

    let totalWorkDays = 0;
    let totalWorkUnits = 0;
    let totalWorkHours = 0;
    let totalLateMinutes = 0;
    let totalEarlyMinutes = 0;
    let totalLateCount = 0;
    let totalEarlyCount = 0;
    let totalMissingCount = 0;
    let totalOtHours = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(year, month - 1, day);
      const dateKey = formatDateKey(curDate);
      const dayPunches = empPunches?.get(dateKey) || [];

      const record = evaluateDailyAttendance(
        empId,
        name,
        curDate,
        dayPunches,
        shifts,
        scheduleConfig
      );

      daysRecord[day] = record;

      if (record.workUnitsEarned > 0) {
        totalWorkDays += 1;
        totalWorkUnits += record.workUnitsEarned;
        totalWorkHours += record.workHours;
      }
      if (record.lateMinutes > 0) {
        totalLateMinutes += record.lateMinutes;
        totalLateCount += 1;
      }
      if (record.earlyMinutes > 0) {
        totalEarlyMinutes += record.earlyMinutes;
        totalEarlyCount += 1;
      }
      if (record.status === 'MISSING_OUT' || record.status === 'MISSING_IN') {
        totalMissingCount += 1;
      }
      if (record.overtimeHours > 0) {
        totalOtHours += record.overtimeHours;
      }
    }

    summaries.push({
      empId,
      empName: name,
      department: scheduleConfig.employeeRosters[empId]?.department || '',
      totalWorkDays,
      totalWorkUnits: Number(totalWorkUnits.toFixed(2)),
      totalWorkHours: Number(totalWorkHours.toFixed(2)),
      totalLateMinutes,
      totalEarlyMinutes,
      totalLateCount,
      totalEarlyCount,
      totalMissingCount,
      totalOtHours: Number(totalOtHours.toFixed(2)),
      days: daysRecord,
    });
  }

  return summaries.sort((a, b) => a.empName.localeCompare(b.empName, 'vi'));
}

// ── Xuất Báo Cáo Excel Chuẩn Nhân Sự Việt Nam ───────────────────────────────

/**
 * Xuất Bảng chấm công tổng hợp tháng dạng lưới (Grid 1..31)
 */
export function exportMonthlyTimesheetExcel(
  summaries: EmployeeMonthlySummary[],
  month: number,
  year: number
): void {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Header 1: Thông tin & Ngày trong tháng
  const header = [
    'Mã NV',
    'Họ và Tên',
    'Bộ Phận',
    ...dayNumbers.map(d => `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}`),
    'Tổng Ngày Công',
    'Tổng Giờ Làm',
    'Số Lần Muộn',
    'Tổng Phút Muộn',
    'Số Lần Về Sớm',
    'Số Lần Quên Quẹt',
    'Giờ Tăng Ca (OT)',
  ];

  const dataRows = summaries.map(s => {
    const dayCells = dayNumbers.map(d => {
      const rec = s.days[d];
      if (!rec) return '';
      if (rec.status === 'OFF') return 'Nghỉ';
      if (rec.status === 'ABSENT') return 'V';
      if (rec.workUnitsEarned > 0) {
        return rec.assignedShift ? `${rec.assignedShift.code} (${rec.workUnitsEarned})` : `${rec.workUnitsEarned}`;
      }
      return '';
    });

    return [
      s.empId,
      s.empName,
      s.department || '',
      ...dayCells,
      s.totalWorkUnits,
      s.totalWorkHours,
      s.totalLateCount,
      s.totalLateMinutes,
      s.totalEarlyCount,
      s.totalMissingCount,
      s.totalOtHours,
    ];
  });

  const aoa = [
    [`BẢNG CHẤM CÔNG THÁNG ${month} NĂM ${year}`],
    [`Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')} | Tổng số nhân sự: ${summaries.length}`],
    [],
    header,
    ...dataRows,
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto set column widths
  const colWidths = [
    { wch: 12 }, // Mã NV
    { wch: 24 }, // Họ tên
    { wch: 16 }, // Bộ phận
    ...dayNumbers.map(() => ({ wch: 7 })), // Ngày 1..31
    { wch: 14 }, // Tổng ngày công
    { wch: 13 }, // Tổng giờ làm
    { wch: 12 }, // Số lần muộn
    { wch: 14 }, // Tổng phút muộn
    { wch: 13 }, // Số lần về sớm
    { wch: 15 }, // Số lần quên quẹt
    { wch: 15 }, // Giờ tăng ca
  ];
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, `BangCong_T${month}_${year}`);
  XLSX.writeFile(wb, `Bang_Cham_Cong_Thang_${month}_${year}.xlsx`);
}

/**
 * Xuất Bảng chi tiết từng lượt quẹt thẻ & vi phạm đi trễ / về sớm
 */
export function exportDetailedPunchLogsExcel(
  summaries: EmployeeMonthlySummary[],
  month: number,
  year: number
): void {
  const header = [
    'Mã NV',
    'Họ và Tên',
    'Bộ Phận',
    'Ngày',
    'Thứ',
    'Ca Làm Việc',
    'Giờ Vào Q.Định',
    'Giờ Ra Q.Định',
    'Giờ Vào Thực Tế',
    'Giờ Ra Thực Tế',
    'Đi Muộn (Phút)',
    'Về Sớm (Phút)',
    'Giờ Làm Thực Tế',
    'Tăng Ca (Giờ)',
    'Số Công Nhận',
    'Trạng Thái',
    'Ghi Chú',
    'Nhật Ký Quẹt Thẻ',
  ];

  const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dataRows: (string | number)[][] = [];

  for (const s of summaries) {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const rec = s.days[d];
      if (!rec || (rec.status === 'OFF' && rec.allPunches.length === 0)) continue;

      let statusText = 'Đúng giờ';
      if (rec.status === 'LATE') statusText = 'Đi muộn';
      else if (rec.status === 'EARLY') statusText = 'Về sớm';
      else if (rec.status === 'LATE_EARLY') statusText = 'Muộn & Về sớm';
      else if (rec.status === 'MISSING_OUT') statusText = 'Quên quẹt ra';
      else if (rec.status === 'MISSING_IN') statusText = 'Quên quẹt vào';
      else if (rec.status === 'ABSENT') statusText = 'Vắng mặt';
      else if (rec.status === 'OFF') statusText = 'Nghỉ';

      dataRows.push([
        s.empId,
        s.empName,
        s.department || '',
        rec.dateDisplay,
        dayNames[rec.dayOfWeek] || '',
        rec.assignedShift?.name || 'Tự do',
        rec.assignedShift?.startTime || '',
        rec.assignedShift?.endTime || '',
        rec.firstIn || '',
        rec.lastOut || '',
        rec.lateMinutes,
        rec.earlyMinutes,
        rec.workHours,
        rec.overtimeHours,
        rec.workUnitsEarned,
        statusText,
        rec.notes.join('; '),
        rec.allPunches.join(' | '),
      ]);
    }
  }

  const aoa = [
    [`BẢNG CHI TIẾT CHẤM CÔNG & QUẸT THẺ THÁNG ${month} NĂM ${year}`],
    [],
    header,
    ...dataRows,
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = [
    { wch: 12 }, // Mã NV
    { wch: 22 }, // Họ tên
    { wch: 14 }, // Bộ phận
    { wch: 12 }, // Ngày
    { wch: 10 }, // Thứ
    { wch: 18 }, // Ca làm việc
    { wch: 14 }, // Vào QĐ
    { wch: 14 }, // Ra QĐ
    { wch: 14 }, // Vào thực tế
    { wch: 14 }, // Ra thực tế
    { wch: 14 }, // Muộn
    { wch: 14 }, // Về sớm
    { wch: 15 }, // Giờ làm
    { wch: 14 }, // Tăng ca
    { wch: 12 }, // Công
    { wch: 14 }, // Trạng thái
    { wch: 25 }, // Ghi chú
    { wch: 30 }, // Tất cả lần quẹt
  ];

  XLSX.utils.book_append_sheet(wb, ws, `ChiTiet_T${month}_${year}`);
  XLSX.writeFile(wb, `Chi_Tiet_Cham_Cong_Thang_${month}_${year}.xlsx`);
}
