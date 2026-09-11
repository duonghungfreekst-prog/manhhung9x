import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, Users, Calendar, BarChart2, Grid, List,
  Download, Search, RefreshCw, ChevronDown, X, Clock,
  Settings, CheckCircle2, AlertTriangle, AlertCircle,
  Plus, Trash2, Edit2, RotateCcw, FileSpreadsheet, Filter,
  Stethoscope
} from 'lucide-react';
import type {
  ShiftPreset,
  ScheduleConfig,
  RawPunchLog,
  EmployeeMonthlySummary,
} from '../utils/biometricAttendance';
import {
  DEFAULT_SHIFTS,
  DEFAULT_WEEKLY_TEMPLATE,
  parseBiometricExcelOrCsv,
  parseBiometricTextOrDat,
  evaluateMonthlyAttendance,
  exportMonthlyTimesheetExcel,
  exportDetailedPunchLogsExcel,
} from '../utils/biometricAttendance';

// ── Định nghĩa kiểu dữ liệu cũ của Chấm Công Lượt Khám (HIS) ────────────────
interface RawDoctorRow { doctor: string; datetime: Date | null; }
interface DoctorSummary {
  name: string;
  totalWorkDays: number;
  totalSessions: number;
  workDays: string[]; // 'dd/mm/yyyy'
}

function parseHisDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
  }
  if (typeof val === 'string') {
    const d = new Date(val.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toDateKey(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function computeHisSummaries(rows: RawDoctorRow[]): DoctorSummary[] {
  const map = new Map<string, { sessions: number; days: Set<string> }>();
  for (const r of rows) {
    if (!r.doctor || !r.datetime) continue;
    const name = r.doctor.trim();
    if (!map.has(name)) map.set(name, { sessions: 0, days: new Set() });
    const entry = map.get(name)!;
    entry.sessions++;
    entry.days.add(toDateKey(r.datetime));
  }
  return Array.from(map.entries())
    .map(([name, { sessions, days }]) => ({
      name, totalSessions: sessions,
      totalWorkDays: days.size,
      workDays: Array.from(days).sort((a, b) => {
        const toTs = (s: string) => { const [d, m, y] = s.split('/'); return +new Date(+y, +m - 1, +d); };
        return toTs(a) - toTs(b);
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

// ── COMPONENT CHÍNH ATTENDANCE TAB ──────────────────────────────────────────

export function AttendanceTab() {
  // ── Phân hệ con (Sub-Tabs) ──
  const [activeSubTab, setActiveSubTab] = useState<'biometric' | 'shifts' | 'schedule' | 'his_counter'>('biometric');

  // ── Cấu hình Ca làm việc (Shifts) ──
  const [shifts, setShifts] = useState<ShiftPreset[]>(() => {
    try {
      const saved = localStorage.getItem('dmh_shift_presets');
      return saved ? JSON.parse(saved) : DEFAULT_SHIFTS;
    } catch {
      return DEFAULT_SHIFTS;
    }
  });

  // ── Cấu hình Lịch biểu & Phân ca (Schedules) ──
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(() => {
    try {
      const saved = localStorage.getItem('dmh_shift_schedules');
      return saved ? JSON.parse(saved) : {
        weeklyTemplate: DEFAULT_WEEKLY_TEMPLATE,
        employeeRosters: {},
      };
    } catch {
      return {
        weeklyTemplate: DEFAULT_WEEKLY_TEMPLATE,
        employeeRosters: {},
      };
    }
  });

  // Lưu cấu hình khi có thay đổi
  useEffect(() => {
    try {
      localStorage.setItem('dmh_shift_presets', JSON.stringify(shifts));
    } catch {}
  }, [shifts]);

  useEffect(() => {
    try {
      localStorage.setItem('dmh_shift_schedules', JSON.stringify(scheduleConfig));
    } catch {}
  }, [scheduleConfig]);

  // ── Dữ liệu Máy Chấm Công (Biometric Data) ──
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [rawPunchLogs, setRawPunchLogs] = useState<RawPunchLog[]>([]);
  const [bioFileName, setBioFileName] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSearch, setBioSearch] = useState('');
  const [bioStatusFilter, setBioStatusFilter] = useState<'ALL' | 'LATE' | 'EARLY' | 'MISSING' | 'OT'>('ALL');
  const [bioViewMode, setBioViewMode] = useState<'grid' | 'details'>('grid');
  const [selectedBioEmp, setSelectedBioEmp] = useState<EmployeeMonthlySummary | null>(null);
  const bioFileRef = useRef<HTMLInputElement>(null);

  // ── Tính toán tổng hợp Bảng công tháng ──
  const monthlySummaries = useMemo(() => {
    if (!rawPunchLogs.length) return [];
    return evaluateMonthlyAttendance(rawPunchLogs, shifts, scheduleConfig, selectedMonth, selectedYear);
  }, [rawPunchLogs, shifts, scheduleConfig, selectedMonth, selectedYear]);

  // Bộ lọc tìm kiếm & trạng thái máy chấm công
  const filteredSummaries = useMemo(() => {
    return monthlySummaries.filter(s => {
      const matchName = !bioSearch || s.empName.toLowerCase().includes(bioSearch.toLowerCase()) || s.empId.toLowerCase().includes(bioSearch.toLowerCase());
      if (!matchName) return false;
      if (bioStatusFilter === 'LATE') return s.totalLateCount > 0;
      if (bioStatusFilter === 'EARLY') return s.totalEarlyCount > 0;
      if (bioStatusFilter === 'MISSING') return s.totalMissingCount > 0;
      if (bioStatusFilter === 'OT') return s.totalOtHours > 0;
      return true;
    });
  }, [monthlySummaries, bioSearch, bioStatusFilter]);

  // ── Đọc File Máy Chấm Công ──
  const handleBioFileUpload = useCallback((file: File) => {
    setBioLoading(true);
    setBioError('');
    setBioFileName(file.name);

    const isTextOrDat = file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.dat');

    if (isTextOrDat) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = String(e.target?.result ?? '');
          const result = parseBiometricTextOrDat(text);
          if (!result.punchLogs.length) {
            setBioError('Không tìm thấy dữ liệu quẹt thẻ hợp lệ trong file!');
          } else {
            setRawPunchLogs(result.punchLogs);
            // Tự động cập nhật tháng/năm theo lần quẹt gần nhất
            const lastLog = result.punchLogs[result.punchLogs.length - 1];
            setSelectedMonth(lastLog.timestamp.getMonth() + 1);
            setSelectedYear(lastLog.timestamp.getFullYear());
          }
        } catch {
          setBioError('Lỗi phân tích file văn bản/DAT từ máy chấm công.');
        }
        setBioLoading(false);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buf = e.target?.result as ArrayBuffer;
          const result = parseBiometricExcelOrCsv(buf);
          if (!result.punchLogs.length) {
            setBioError('Không tìm thấy dữ liệu quẹt thẻ hợp lệ trong file Excel/CSV!');
          } else {
            setRawPunchLogs(result.punchLogs);
            const firstLog = result.punchLogs[0];
            setSelectedMonth(firstLog.timestamp.getMonth() + 1);
            setSelectedYear(firstLog.timestamp.getFullYear());
          }
        } catch {
          setBioError('Không đọc được file. Vui lòng kiểm tra định dạng (.xlsx, .xls, .csv, .txt, .dat).');
        }
        setBioLoading(false);
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  // ── Quản lý Form Ca làm việc (Add/Edit Modal) ──
  const [editingShift, setEditingShift] = useState<ShiftPreset | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);

  const handleOpenAddShift = () => {
    setEditingShift({
      id: `shift_${Date.now()}`,
      code: 'NEW',
      name: 'Ca Mới',
      startTime: '08:00',
      endTime: '17:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      workUnits: 1.0,
      graceLateMinutes: 15,
      graceEarlyMinutes: 15,
      checkInWindowStart: '06:30',
      checkInWindowEnd: '09:30',
      checkOutWindowStart: '16:00',
      checkOutWindowEnd: '21:00',
      overtimeThresholdMinutes: 30,
      color: '#3b82f6',
    });
    setShowShiftModal(true);
  };

  const handleSaveShift = () => {
    if (!editingShift) return;
    setShifts(prev => {
      const exists = prev.some(s => s.id === editingShift.id);
      if (exists) {
        return prev.map(s => s.id === editingShift.id ? editingShift : s);
      }
      return [...prev, editingShift];
    });
    setShowShiftModal(false);
    setEditingShift(null);
  };

  const handleDeleteShift = (id: string) => {
    if (confirm('Bạn có chắc muốn xóa ca làm việc này?')) {
      setShifts(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleResetDefaultShifts = () => {
    if (confirm('Khôi phục danh mục ca chuẩn mặc định?')) {
      setShifts(DEFAULT_SHIFTS);
    }
  };

  // ── Dữ liệu & Logic Chấm Công Lượt Khám (HIS cũ) ─────────────────────────
  const [hisSummaries, setHisSummaries] = useState<DoctorSummary[]>([]);
  const [hisRawCount, setHisRawCount] = useState(0);
  const [hisFileName, setHisFileName] = useState('');
  const [hisLoading, setHisLoading] = useState(false);
  const [hisError, setHisError] = useState('');
  const [hisSearch, setHisSearch] = useState('');
  const [hisSelected, setHisSelected] = useState<DoctorSummary | null>(null);
  const [hisColDoctor, setHisColDoctor] = useState('');
  const [hisColDatetime, setHisColDatetime] = useState('');
  const [hisHeaders, setHisHeaders] = useState<string[]>([]);
  const [hisPreviewValues, setHisPreviewValues] = useState<Record<string, string>>({});
  const [hisSheetData, setHisSheetData] = useState<Record<string, unknown>[]>([]);
  const [hisViewMode, setHisViewMode] = useState<'summary' | 'grid'>('summary');
  const [hisGridMonth, setHisGridMonth] = useState(now.getMonth() + 1);
  const [hisGridYear, setHisGridYear] = useState(now.getFullYear());
  const [hisFixedDoctors, setHisFixedDoctors] = useState('');
  const hisFileRef = useRef<HTMLInputElement>(null);

  const processHisData = (rows: Record<string, unknown>[], dCol: string, tCol: string) => {
    const raw: RawDoctorRow[] = rows.map(r => ({
      doctor: String(r[dCol] ?? ''),
      datetime: parseHisDate(r[tCol]),
    }));
    setHisRawCount(raw.filter(r => r.datetime).length);
    setHisSummaries(computeHisSummaries(raw));
    setHisSelected(null);
  };

  const handleHisFile = useCallback((file: File) => {
    setHisLoading(true); setHisError(''); setHisSummaries([]); setHisSelected(null);
    setHisFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawArr: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        if (!rawArr.length) { setHisError('File không có dữ liệu!'); setHisLoading(false); return; }

        let headerRowIdx = 0;
        let maxNonEmpty = 0;
        rawArr.slice(0, 10).forEach((row, idx) => {
          const nonEmpty = (row as unknown[]).filter(c => c !== '' && c != null).length;
          if (nonEmpty > maxNonEmpty) { maxNonEmpty = nonEmpty; headerRowIdx = idx; }
        });

        const headerRow = rawArr[headerRowIdx] as unknown[];
        const colLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const hdrs: string[] = headerRow.map((h, i) => {
          const raw = String(h ?? '').trim();
          return raw || `Cột ${i < 26 ? colLetters[i] : i + 1}`;
        });

        const dataRows: Record<string, unknown>[] = rawArr
          .slice(headerRowIdx + 1)
          .map(row => {
            const obj: Record<string, unknown> = {};
            hdrs.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? ''; });
            return obj;
          })
          .filter(r => Object.values(r).some(v => v !== '' && v != null));

        if (!dataRows.length) { setHisError('File không có dữ liệu sau hàng tiêu đề!'); setHisLoading(false); return; }

        setHisHeaders(hdrs);
        setHisSheetData(dataRows);

        const preview: Record<string, string> = {};
        hdrs.forEach(h => {
          const sample = dataRows.slice(0, 5).map(r => String(r[h] ?? '')).find(v => v.trim() !== '') ?? '';
          preview[h] = sample.length > 60 ? sample.slice(0, 60) + '…' : sample;
        });
        setHisPreviewValues(preview);

        const dCol = hdrs.find(h => /bác\s*s[iĩ]|tên|doctor|staff|nhân\s*viên/i.test(h)) ?? '';
        const tCol = hdrs.find(h => /ngày|giờ|date|time|datetime|khám/i.test(h)) ?? '';
        setHisColDoctor(dCol);
        setHisColDatetime(tCol);
        if (dCol && tCol) {
          processHisData(dataRows, dCol, tCol);
        }
      } catch {
        setHisError('Không đọc được file. Vui lòng kiểm tra định dạng (xlsx, csv).');
      }
      setHisLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const exportHisExcel = () => {
    const header = ['Bác sĩ', 'Ngày làm việc', 'Tổng ngày công', 'Tổng ca khám'];
    const dataRows = hisSummaries.flatMap(s =>
      s.workDays.map((d, i) => [
        i === 0 ? s.name : '',
        d,
        i === 0 ? s.totalWorkDays : '',
        i === 0 ? s.totalSessions : '',
      ])
    );
    const aoa = [header, ...dataRows];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'ChamCong');
    XLSX.writeFile(wb, 'BaoCaoChamCong_HIS.xlsx');
  };

  const exportHisGrid = () => {
    const daysInM = new Date(hisGridYear, hisGridMonth, 0).getDate();
    const days = Array.from({ length: daysInM }, (_, i) => i + 1);
    const fixedL = hisFixedDoctors.split('\n').map(s => s.trim()).filter(Boolean);
    const exportRows = fixedL.length > 0
      ? fixedL.map(name => hisSummaries.find(s => s.name === name) ?? { name, totalWorkDays: 0, totalSessions: 0, workDays: [] })
      : hisSummaries;

    const headerRow = [
      'Bác sĩ',
      ...days.map(d => `${String(d).padStart(2,'0')}/${String(hisGridMonth).padStart(2,'0')}`),
      'Tổng',
    ];

    const dataRows = exportRows.map(s => {
      const monthTotal = s.workDays.filter(w => {
        const [, mm, yyyy] = w.split('/');
        return +mm === hisGridMonth && +yyyy === hisGridYear;
      }).length;
      return [
        s.name,
        ...days.map(d => {
          const key = `${String(d).padStart(2,'0')}/${String(hisGridMonth).padStart(2,'0')}/${hisGridYear}`;
          return s.workDays.includes(key) ? 'X' : '';
        }),
        monthTotal,
      ];
    });

    const aoa = [headerRow, ...dataRows];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'ChamCong');
    XLSX.writeFile(wb, `ChamCong_HIS_T${hisGridMonth}_${hisGridYear}.xlsx`);
  };

  const hisFixedList = hisFixedDoctors.split('\n').map(s => s.trim()).filter(Boolean);
  const hisDoctorRows = hisFixedList.length > 0
    ? hisFixedList.map(name => hisSummaries.find(s => s.name === name) ?? { name, totalWorkDays: 0, totalSessions: 0, workDays: [] })
    : hisSummaries;
  const hisFiltered = hisDoctorRows.filter(s =>
    !hisSearch || s.name.toLowerCase().includes(hisSearch.toLowerCase())
  );

  const cardStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: 8,
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', overflow: 'hidden' }}>

      {/* ── THANH ĐIỀU HƯỚNG PHÂN HỆ SUB-TABS ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.65rem 1rem',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '3px', borderRadius: 8 }}>
          {[
            { id: 'biometric' as const, label: 'Máy Chấm Công & Bảng Công', icon: <Clock size={15} /> },
            { id: 'shifts' as const, label: 'Cài Đặt Ca Làm Việc', icon: <Settings size={15} /> },
            { id: 'schedule' as const, label: 'Lịch Biểu & Phân Ca', icon: <Calendar size={15} /> },
            { id: 'his_counter' as const, label: 'Chấm Công Khám Bệnh (HIS)', icon: <Stethoscope size={15} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: activeSubTab === tab.id ? 700 : 500,
                background: activeSubTab === tab.id ? '#3b82f6' : 'transparent',
                color: activeSubTab === tab.id ? 'white' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Nút hành động theo từng tab */}
        {activeSubTab === 'biometric' && monthlySummaries.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => exportMonthlyTimesheetExcel(monthlySummaries, selectedMonth, selectedYear)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: '#10b981',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              <Download size={14} /> Xuất Bảng Công Tháng
            </button>
            <button
              onClick={() => exportDetailedPunchLogsExcel(monthlySummaries, selectedMonth, selectedYear)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: 'white',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              <FileSpreadsheet size={14} color="#10b981" /> Xuất Chi Tiết Quẹt Thẻ
            </button>
          </div>
        )}

        {activeSubTab === 'shifts' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleResetDefaultShifts}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: 'white',
                color: '#64748b',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.8rem'
              }}
            >
              <RotateCcw size={13} /> Khôi Phục Mặc Định
            </button>
            <button
              onClick={handleOpenAddShift}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              <Plus size={15} /> Thêm Ca Mới
            </button>
          </div>
        )}
      </div>

      {/* ── NỘI DUNG TỪNG PHÂN HỆ ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0.75rem', gap: '0.75rem', minHeight: 0 }}>

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 1: MÁY CHẤM CÔNG & BẢNG CÔNG
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'biometric' && (
          <div style={{ flex: 1, display: 'flex', gap: '0.75rem', overflow: 'hidden', minWidth: 0 }}>

            {/* Cột trái: Tải file & Thống kê */}
            <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
              {/* Thẻ Upload */}
              <div style={cardStyle}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, color: '#1e293b' }}>
                  <Upload size={16} color="#3b82f6" /> Nạp Dữ Liệu Máy Chấm Công
                </div>
                <div
                  onClick={() => bioFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBioFileUpload(f); }}
                  style={{
                    border: '2px dashed #93c5fd',
                    borderRadius: 8,
                    padding: '1.25rem 0.75rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: '#eff6ff',
                    transition: 'border .2s'
                  }}
                >
                  <Clock size={32} color="#3b82f6" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1d4ed8' }}>
                    {bioFileName || 'Kéo thả hoặc nhấp để chọn tệp'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                    Excel (.xlsx, .xls), CSV, hoặc Text/DAT từ USB ZKTeco/Ronald Jack
                  </div>
                </div>
                <input
                  ref={bioFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.dat"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleBioFileUpload(f); }}
                />

                {bioLoading && (
                  <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý dữ liệu...
                  </div>
                )}
                {bioError && (
                  <div style={{ marginTop: 8, padding: '8px', background: '#fef2f2', borderRadius: 6, fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>{bioError}</div>
                  </div>
                )}
              </div>

              {/* Chọn Tháng/Năm */}
              <div style={cardStyle}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} color="#3b82f6" /> Chọn Tháng Chấm Công
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(+e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(+e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  >
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Thống kê tháng */}
              {monthlySummaries.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 10, color: '#1e293b' }}>
                    📊 Tổng Quan Tháng {selectedMonth}/{selectedYear}
                  </div>
                  {[
                    { label: 'Tổng số nhân sự', value: monthlySummaries.length, color: '#3b82f6' },
                    { label: 'Tổng ngày công', value: monthlySummaries.reduce((acc, s) => acc + s.totalWorkUnits, 0).toFixed(1), color: '#10b981' },
                    { label: 'Tổng giờ làm thực tế', value: monthlySummaries.reduce((acc, s) => acc + s.totalWorkHours, 0).toFixed(1) + 'h', color: '#6366f1' },
                    { label: 'Số lượt đi muộn', value: monthlySummaries.reduce((acc, s) => acc + s.totalLateCount, 0), color: '#f59e0b' },
                    { label: 'Số lượt về sớm', value: monthlySummaries.reduce((acc, s) => acc + s.totalEarlyCount, 0), color: '#ec4899' },
                    { label: 'Số lần quên quẹt', value: monthlySummaries.reduce((acc, s) => acc + s.totalMissingCount, 0), color: '#dc2626' },
                    { label: 'Giờ tăng ca (OT)', value: monthlySummaries.reduce((acc, s) => acc + s.totalOtHours, 0).toFixed(1) + 'h', color: '#8b5cf6' },
                  ].map(st => (
                    <div key={st.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '5px 8px', background: '#f8fafc', borderRadius: 5 }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{st.label}</span>
                      <strong style={{ fontSize: '0.88rem', color: st.color }}>{st.value}</strong>
                    </div>
                  ))}
                </div>
              )}

              {/* Chú giải các loại ca */}
              <div style={cardStyle}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 8, color: '#475569' }}>
                  🏷️ CHÚ GIẢI MÃ CA
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {shifts.map(s => (
                    <span
                      key={s.id}
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: `${s.color}15`,
                        color: s.color,
                        fontWeight: 700,
                        border: `1px solid ${s.color}40`,
                      }}
                      title={`${s.name} (${s.startTime} - ${s.endTime})`}
                    >
                      {s.code}: {s.name}
                    </span>
                  ))}
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>
                    V: Vắng
                  </span>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
                    Nghỉ: Lịch OFF
                  </span>
                </div>
              </div>
            </div>

            {/* Cột giữa: Bảng Lưới / Chi tiết chấm công */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
              {monthlySummaries.length === 0 ? (
                <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                  <Clock size={56} opacity={0.25} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#475569' }}>Chưa Có Dữ Liệu Máy Chấm Công</div>
                  <div style={{ fontSize: '0.82rem', marginTop: 6, color: '#64748b' }}>
                    Hãy tải tệp sự kiện quẹt thẻ (.xlsx, .csv, .txt hoặc .dat từ máy chấm công) để bắt đầu phân tích.
                  </div>
                </div>
              ) : (
                <>
                  {/* Toolbar lọc & chuyển chế độ xem */}
                  <div style={{ ...cardStyle, padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: '#f1f5f9', padding: '5px 10px', borderRadius: 6 }}>
                      <Search size={14} color="#64748b" />
                      <input
                        value={bioSearch}
                        onChange={e => setBioSearch(e.target.value)}
                        placeholder="Tìm theo Mã NV hoặc Tên nhân sự..."
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%' }}
                      />
                      {bioSearch && (
                        <button onClick={() => setBioSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                          <X size={13} color="#94a3b8" />
                        </button>
                      )}
                    </div>

                    {/* Bộ lọc trạng thái */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Filter size={13} color="#64748b" />
                      <select
                        value={bioStatusFilter}
                        onChange={e => setBioStatusFilter(e.target.value as any)}
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', color: '#334155' }}
                      >
                        <option value="ALL">Tất cả ({monthlySummaries.length})</option>
                        <option value="LATE">Có đi muộn</option>
                        <option value="EARLY">Có về sớm</option>
                        <option value="MISSING">Thiếu quẹt ra/vào</option>
                        <option value="OT">Có tăng ca (OT)</option>
                      </select>
                    </div>

                    {/* Switch Grid / Details */}
                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                      <button
                        onClick={() => setBioViewMode('grid')}
                        style={{
                          padding: '5px 10px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: bioViewMode === 'grid' ? '#3b82f6' : 'white',
                          color: bioViewMode === 'grid' ? 'white' : '#475569',
                        }}
                      >
                        <Grid size={13} /> Lưới Tháng
                      </button>
                      <button
                        onClick={() => setBioViewMode('details')}
                        style={{
                          padding: '5px 10px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: bioViewMode === 'details' ? '#3b82f6' : 'white',
                          color: bioViewMode === 'details' ? 'white' : '#475569',
                        }}
                      >
                        <List size={13} /> Chi Tiết
                      </button>
                    </div>
                  </div>

                  {/* ── CHẾ ĐỘ XEM 1: LƯỚI THÁNG 1..31 (GRID VIEW) ── */}
                  {bioViewMode === 'grid' ? (
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%', minWidth: 1000 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 3, minWidth: 160 }}>
                              Nhân Viên
                            </th>
                            {monthDays.map(d => {
                              const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();
                              const isWeekend = dow === 0 || dow === 6;
                              return (
                                <th
                                  key={d}
                                  style={{
                                    padding: '6px 3px',
                                    textAlign: 'center',
                                    minWidth: 32,
                                    color: isWeekend ? '#dc2626' : '#1e293b',
                                    background: isWeekend ? '#fef2f2' : 'transparent',
                                    borderLeft: '1px solid #f1f5f9',
                                  }}
                                >
                                  <div>{d}</div>
                                  <div style={{ fontSize: '0.62rem', fontWeight: 400, opacity: 0.7 }}>
                                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow]}
                                  </div>
                                </th>
                              );
                            })}
                            <th style={{ padding: '8px 6px', textAlign: 'center', background: '#ecfdf5', color: '#065f46', minWidth: 55, position: 'sticky', right: 110, zIndex: 2 }}>
                              Công
                            </th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', background: '#f0fdf4', color: '#166534', minWidth: 55, position: 'sticky', right: 55, zIndex: 2 }}>
                              Giờ Làm
                            </th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', background: '#fffbeb', color: '#b45309', minWidth: 55, position: 'sticky', right: 0, zIndex: 2 }}>
                              Muộn (L)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSummaries.map((s, idx) => {
                            const isSelected = selectedBioEmp?.empId === s.empId;
                            return (
                              <tr
                                key={s.empId}
                                onClick={() => setSelectedBioEmp(isSelected ? null : s)}
                                style={{
                                  background: isSelected ? '#eff6ff' : idx % 2 === 0 ? 'white' : '#f8fafc',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #f1f5f9',
                                  transition: 'background 0.15s',
                                }}
                              >
                                <td style={{
                                  padding: '8px 10px',
                                  fontWeight: 600,
                                  position: 'sticky',
                                  left: 0,
                                  background: isSelected ? '#eff6ff' : idx % 2 === 0 ? 'white' : '#f8fafc',
                                  zIndex: 2,
                                  borderRight: '2px solid #e2e8f0',
                                }}>
                                  <div style={{ color: '#0f172a' }}>{s.empName}</div>
                                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Mã: {s.empId}</div>
                                </td>

                                {monthDays.map(d => {
                                  const rec = s.days[d];
                                  const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();
                                  const isWeekend = dow === 0 || dow === 6;

                                  if (!rec) return <td key={d} style={{ borderLeft: '1px solid #f1f5f9' }} />;

                                  let cellBg = isWeekend ? '#fafafa' : 'transparent';
                                  let cellText = '';
                                  let cellColor = '#94a3b8';
                                  let tooltip = `${rec.dateDisplay} (${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][rec.dayOfWeek]})`;

                                  if (rec.status === 'OFF') {
                                    cellText = '-';
                                    cellColor = '#cbd5e1';
                                  } else if (rec.status === 'ABSENT') {
                                    cellText = 'V';
                                    cellColor = '#ef4444';
                                    tooltip += ' - Vắng mặt';
                                  } else if (rec.workUnitsEarned > 0) {
                                    cellText = rec.assignedShift?.code || String(rec.workUnitsEarned);
                                    cellColor = rec.assignedShift?.color || '#10b981';
                                    cellBg = `${cellColor}18`;
                                    tooltip += `\nCa: ${rec.assignedShift?.name || 'Tự do'}`;
                                    tooltip += `\nVào: ${rec.firstIn || '--:--'} | Ra: ${rec.lastOut || '--:--'}`;
                                    if (rec.lateMinutes > 0) tooltip += `\nĐi muộn: ${rec.lateMinutes}p`;
                                    if (rec.earlyMinutes > 0) tooltip += `\nVề sớm: ${rec.earlyMinutes}p`;
                                    if (rec.overtimeHours > 0) tooltip += `\nTăng ca: ${rec.overtimeHours}h`;
                                  }

                                  return (
                                    <td
                                      key={d}
                                      title={tooltip}
                                      style={{
                                        textAlign: 'center',
                                        padding: '4px 2px',
                                        background: cellBg,
                                        borderLeft: '1px solid #f1f5f9',
                                        fontWeight: 700,
                                        color: cellColor,
                                        fontSize: '0.72rem',
                                      }}
                                    >
                                      {cellText}
                                      {rec.lateMinutes > 0 && (
                                        <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: '#f59e0b', marginLeft: 2, verticalAlign: 'top' }} />
                                      )}
                                    </td>
                                  );
                                })}

                                <td style={{ textAlign: 'center', fontWeight: 800, color: '#059669', background: '#ecfdf5', position: 'sticky', right: 110, zIndex: 1, borderLeft: '2px solid #a7f3d0' }}>
                                  {s.totalWorkUnits}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#15803d', background: '#f0fdf4', position: 'sticky', right: 55, zIndex: 1 }}>
                                  {s.totalWorkHours}h
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: s.totalLateCount > 0 ? '#b45309' : '#94a3b8', background: '#fffbeb', position: 'sticky', right: 0, zIndex: 1 }}>
                                  {s.totalLateCount}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* ── CHẾ ĐỘ XEM 2: CHI TIẾT TỪNG LẦN QUẸT (DETAILS VIEW) ── */
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', width: '100%' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Nhân Viên</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Ngày</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Ca Áp Dụng</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Giờ Vào</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Giờ Ra</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Muộn (phút)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Về Sớm</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Giờ Làm</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Tăng Ca</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Số Công</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Trạng Thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSummaries.flatMap(s =>
                            monthDays.map(d => {
                              const rec = s.days[d];
                              if (!rec || (rec.status === 'OFF' && rec.allPunches.length === 0)) return null;

                              let badgeColor = '#10b981';
                              let badgeBg = '#ecfdf5';
                              let badgeText = 'Đúng giờ';
                              if (rec.status === 'LATE') { badgeColor = '#f59e0b'; badgeBg = '#fffbeb'; badgeText = 'Đi muộn'; }
                              else if (rec.status === 'EARLY') { badgeColor = '#ec4899'; badgeBg = '#fdf2f8'; badgeText = 'Về sớm'; }
                              else if (rec.status === 'LATE_EARLY') { badgeColor = '#ea580c'; badgeBg = '#fff7ed'; badgeText = 'Muộn & Sớm'; }
                              else if (rec.status === 'MISSING_OUT') { badgeColor = '#dc2626'; badgeBg = '#fef2f2'; badgeText = 'Quên quẹt ra'; }
                              else if (rec.status === 'ABSENT') { badgeColor = '#94a3b8'; badgeBg = '#f1f5f9'; badgeText = 'Vắng mặt'; }

                              return (
                                <tr key={`${s.empId}_${d}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                    {s.empName} <span style={{ fontSize: '0.7rem', color: '#64748b' }}>({s.empId})</span>
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: '#334155' }}>
                                    {rec.dateDisplay}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {rec.assignedShift ? (
                                      <span style={{ padding: '2px 8px', borderRadius: 4, background: `${rec.assignedShift.color}15`, color: rec.assignedShift.color, fontWeight: 600, fontSize: '0.72rem' }}>
                                        {rec.assignedShift.name}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: rec.lateMinutes > 0 ? '#dc2626' : '#0f172a' }}>
                                    {rec.firstIn || '--:--'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: rec.earlyMinutes > 0 ? '#dc2626' : '#0f172a' }}>
                                    {rec.lastOut || '--:--'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: rec.lateMinutes > 0 ? '#d97706' : '#94a3b8', fontWeight: rec.lateMinutes > 0 ? 700 : 400 }}>
                                    {rec.lateMinutes > 0 ? `${rec.lateMinutes}p` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: rec.earlyMinutes > 0 ? '#db2777' : '#94a3b8', fontWeight: rec.earlyMinutes > 0 ? 700 : 400 }}>
                                    {rec.earlyMinutes > 0 ? `${rec.earlyMinutes}p` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>
                                    {rec.workHours > 0 ? `${rec.workHours}h` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: rec.overtimeHours > 0 ? '#7c3aed' : '#94a3b8', fontWeight: rec.overtimeHours > 0 ? 700 : 400 }}>
                                    {rec.overtimeHours > 0 ? `${rec.overtimeHours}h` : '-'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>
                                    {rec.workUnitsEarned}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 12, background: badgeBg, color: badgeColor, fontWeight: 700, fontSize: '0.7rem' }}>
                                      {badgeText}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cột phải: Chi tiết nhân viên được chọn */}
            {selectedBioEmp && (
              <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ ...cardStyle, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>HỒ SƠ CHẤM CÔNG THÁNG</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{selectedBioEmp.empName}</div>
                      <div style={{ fontSize: '0.72rem', color: '#3b82f6' }}>Mã NV: {selectedBioEmp.empId}</div>
                    </div>
                    <button onClick={() => setSelectedBioEmp(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                      <X size={16} color="#94a3b8" />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                    <div style={{ background: '#ecfdf5', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{selectedBioEmp.totalWorkUnits}</div>
                      <div style={{ fontSize: '0.68rem', color: '#047857' }}>Tổng Ngày Công</div>
                    </div>
                    <div style={{ background: '#eff6ff', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>{selectedBioEmp.totalWorkHours}h</div>
                      <div style={{ fontSize: '0.68rem', color: '#1d4ed8' }}>Tổng Giờ Làm</div>
                    </div>
                    <div style={{ background: '#fffbeb', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>{selectedBioEmp.totalLateMinutes}p</div>
                      <div style={{ fontSize: '0.68rem', color: '#b45309' }}>Phút Đi Muộn</div>
                    </div>
                    <div style={{ background: '#f5f3ff', padding: '8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>{selectedBioEmp.totalOtHours}h</div>
                      <div style={{ fontSize: '0.68rem', color: '#6d28d9' }}>Tăng Ca (OT)</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    NHẬT KÝ QUẸT THẺ TỪNG NGÀY
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {monthDays.map(d => {
                      const rec = selectedBioEmp.days[d];
                      if (!rec || (rec.status === 'OFF' && rec.allPunches.length === 0)) return null;
                      return (
                        <div key={d} style={{ padding: '6px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #f1f5f9', fontSize: '0.72rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                              Ngày {d}/{selectedMonth} ({['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][rec.dayOfWeek]})
                            </span>
                            <span style={{ fontWeight: 700, color: rec.workUnitsEarned > 0 ? '#059669' : '#dc2626' }}>
                              {rec.workUnitsEarned} công
                            </span>
                          </div>
                          <div style={{ color: '#64748b' }}>
                            Vào: <strong style={{ color: rec.lateMinutes > 0 ? '#d97706' : '#0f172a' }}>{rec.firstIn || '--:--'}</strong>
                            {' '} | Ra: <strong style={{ color: rec.earlyMinutes > 0 ? '#db2777' : '#0f172a' }}>{rec.lastOut || '--:--'}</strong>
                          </div>
                          {rec.allPunches.length > 2 && (
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>
                              Các lần quẹt: {rec.allPunches.join(', ')}
                            </div>
                          )}
                          {rec.notes.length > 0 && (
                            <div style={{ fontSize: '0.65rem', color: '#b45309', marginTop: 2 }}>
                              ⚠️ {rec.notes.join('; ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 2: CÀI ĐẶT CA LÀM VIỆC (SHIFTS MANAGEMENT)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'shifts' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>Danh Mục Ca Làm Việc</strong>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Cài đặt khung giờ làm việc, thời gian ân hạn đi muộn / về sớm (Grace Period) và hệ số công quy đổi.
                </p>
              </div>
              <button
                onClick={handleOpenAddShift}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.82rem'
                }}
              >
                <Plus size={15} /> Thêm Ca Mới
              </button>
            </div>

            {/* Grid danh sách các Ca */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
              {shifts.map(shift => (
                <div
                  key={shift.id}
                  style={{
                    ...cardStyle,
                    borderTop: `4px solid ${shift.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: `${shift.color}20`, color: shift.color }}>
                          {shift.code}
                        </span>
                        <h4 style={{ margin: '6px 0 2px', fontSize: '0.95rem', color: '#1e293b' }}>{shift.name}</h4>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: 6 }}>
                        {shift.workUnits} công
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.78rem', color: '#475569', marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} color="#3b82f6" />
                        <span>Giờ làm việc: <strong>{shift.startTime}</strong> đến <strong>{shift.endTime}</strong> {shift.isOvernight && <span style={{ color: '#8b5cf6', fontWeight: 700 }}>(Ca trực qua đêm)</span>}</span>
                      </div>
                      {shift.breakStart && shift.breakEnd && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 13, textAlign: 'center' }}>☕</span>
                          <span>Nghỉ giữa ca: {shift.breakStart} - {shift.breakEnd}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={13} color="#10b981" />
                        <span>Ân hạn đi muộn / về sớm: <strong>{shift.graceLateMinutes}p / {shift.graceEarlyMinutes}p</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={13} color="#f59e0b" />
                        <span>Ngưỡng tính tăng ca (OT): sau <strong>{shift.overtimeThresholdMinutes} phút</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <button
                      onClick={() => { setEditingShift(shift); setShowShiftModal(true); }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        padding: '6px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: 'white',
                        color: '#334155',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      <Edit2 size={13} /> Sửa
                    </button>
                    <button
                      onClick={() => handleDeleteShift(shift.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 3: LỊCH BIỂU & PHÂN CA (ROSTER & SCHEDULING)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'schedule' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
            {/* Card 1: Lịch tuần chuẩn */}
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                📅 Cấu Hình Lịch Biểu Tuần Mẫu (Weekly Template)
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 12 }}>
                Thiết lập ca làm việc mặc định cho từng thứ trong tuần. Khi nạp dữ liệu máy chấm công, hệ thống sẽ tự động áp dụng ca tương ứng.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                {[
                  { day: 1, label: 'Thứ Hai' },
                  { day: 2, label: 'Thứ Ba' },
                  { day: 3, label: 'Thứ Tư' },
                  { day: 4, label: 'Thứ Năm' },
                  { day: 5, label: 'Thứ Sáu' },
                  { day: 6, label: 'Thứ Bảy' },
                  { day: 0, label: 'Chủ Nhật' },
                ].map(d => (
                  <div key={d.day} style={{ padding: '8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: d.day === 0 ? '#dc2626' : '#1e293b', marginBottom: 6 }}>
                      {d.label}
                    </div>
                    <select
                      value={scheduleConfig.weeklyTemplate[d.day] || 'AUTO'}
                      onChange={e => {
                        const val = e.target.value;
                        setScheduleConfig(prev => ({
                          ...prev,
                          weeklyTemplate: { ...prev.weeklyTemplate, [d.day]: val },
                        }));
                      }}
                      style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: '0.75rem' }}
                    >
                      <option value="AUTO">⚡ Tự động so khớp</option>
                      <option value="OFF">⛔ Nghỉ (OFF)</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Danh sách nhân sự & Phân ca riêng */}
            <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                    👥 Phân Ca Theo Nhân Sự (Employee Roster)
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                    Tùy chỉnh ca mặc định hoặc phân ca riêng cho từng Bác sĩ / Nhân viên.
                  </p>
                </div>
              </div>

              {monthlySummaries.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                  Chưa có danh sách nhân sự. Hãy tải file máy chấm công lên ở Tab "Máy Chấm Công & Bảng Công" để hệ thống tự động nạp danh sách nhân viên.
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Mã NV</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Họ và Tên</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Phòng Ban / Khoa</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Ca Làm Việc Mặc Định</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummaries.map(s => {
                        const curRoster = scheduleConfig.employeeRosters[s.empId];
                        return (
                          <tr key={s.empId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#3b82f6' }}>{s.empId}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.empName}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                value={curRoster?.department || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setScheduleConfig(prev => ({
                                    ...prev,
                                    employeeRosters: {
                                      ...prev.employeeRosters,
                                      [s.empId]: {
                                        empId: s.empId,
                                        empName: s.empName,
                                        department: val,
                                        defaultShiftId: curRoster?.defaultShiftId || 'AUTO',
                                        customShifts: curRoster?.customShifts || {},
                                      },
                                    },
                                  }));
                                }}
                                placeholder="Nhập khoa phòng..."
                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem', width: 140 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                value={curRoster?.defaultShiftId || 'AUTO'}
                                onChange={e => {
                                  const val = e.target.value;
                                  setScheduleConfig(prev => ({
                                    ...prev,
                                    employeeRosters: {
                                      ...prev.employeeRosters,
                                      [s.empId]: {
                                        empId: s.empId,
                                        empName: s.empName,
                                        department: curRoster?.department || '',
                                        defaultShiftId: val,
                                        customShifts: curRoster?.customShifts || {},
                                      },
                                    },
                                  }));
                                }}
                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                              >
                                <option value="AUTO">Theo Lịch Tuần / Khớp Giờ Quẹt</option>
                                {shifts.map(sh => (
                                  <option key={sh.id} value={sh.id}>
                                    Cố định: {sh.name} ({sh.startTime} - {sh.endTime})
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SUB-TAB 4: CHẤM CÔNG KHÁM BỆNH (HIS CŨ - NGUYÊN BẢN 100%)
        ══════════════════════════════════════════════════════════════════════ */}
        {activeSubTab === 'his_counter' && (
          <div style={{ flex: 1, display: 'flex', gap: '0.75rem', overflow: 'hidden', minWidth: 0 }}>
            {/* Trái: Upload file HIS & Thống kê */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: 280, flexShrink: 0, overflowY: 'auto' }}>
              <div style={cardStyle}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={14} color="#3b82f6" /> Tải File Lịch Sử Khám
                </div>
                <div
                  onClick={() => hisFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleHisFile(f); }}
                  style={{ border: '2px dashed #bfdbfe', borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: '#eff6ff' }}>
                  <Upload size={28} color="#3b82f6" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: '0.82rem', color: '#1d4ed8', fontWeight: 600 }}>
                    {hisFileName || 'Kéo thả hoặc nhấp để chọn file'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>Excel (.xlsx, .xls) hoặc CSV</div>
                </div>
                <input ref={hisFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleHisFile(f); }} />
                {hisLoading && <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Đang đọc file...</div>}
                {hisError && <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 6, fontSize: '0.78rem', color: '#dc2626' }}>{hisError}</div>}
              </div>

              {/* Column mapping */}
              {hisHeaders.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChevronDown size={14} /> Chọn Cột Dữ Liệu
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 3, fontWeight: 500 }}>CỘT TÊN BÁC SĨ</div>
                      <select value={hisColDoctor} onChange={e => setHisColDoctor(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                        <option value="">-- Chọn cột --</option>
                        {hisHeaders.map(h => (
                          <option key={h} value={h}>
                            {h}{hisPreviewValues[h] ? ` — ${hisPreviewValues[h]}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 3, fontWeight: 500 }}>CỘT NGÀY GIỜ KHÁM</div>
                      <select value={hisColDatetime} onChange={e => setHisColDatetime(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                        <option value="">-- Chọn cột --</option>
                        {hisHeaders.map(h => (
                          <option key={h} value={h}>
                            {h}{hisPreviewValues[h] ? ` — ${hisPreviewValues[h]}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => processHisData(hisSheetData, hisColDoctor, hisColDatetime)} style={{ padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
                      ⚡ Tính Ngày Công
                    </button>
                  </div>
                </div>
              )}

              {/* Stats box */}
              {hisSummaries.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
                    📊 Tổng Quan Khám Bệnh
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6, padding: '4px 6px', background: '#f8fafc', borderRadius: 4 }}>
                    <span style={{ color: '#64748b' }}>Tổng số bác sĩ:</span>
                    <strong>{hisSummaries.length}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6, padding: '4px 6px', background: '#f8fafc', borderRadius: 4 }}>
                    <span style={{ color: '#64748b' }}>Tổng bản ghi/ca khám:</span>
                    <strong style={{ color: '#2563eb' }}>{hisRawCount}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', padding: '4px 6px', background: '#f8fafc', borderRadius: 4 }}>
                    <span style={{ color: '#64748b' }}>Tổng ngày công:</span>
                    <strong style={{ color: '#10b981' }}>{hisSummaries.reduce((a, b) => a + b.totalWorkDays, 0)}</strong>
                  </div>
                </div>
              )}

              {/* Fixed doctors config */}
              <div style={cardStyle}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={14} color="#6366f1" /> Danh Sách Bác Sĩ Cố Định
                </div>
                <textarea
                  value={hisFixedDoctors}
                  onChange={e => setHisFixedDoctors(e.target.value)}
                  placeholder={"Nguyễn Văn A\nTrần Thị B\nLê Văn C\n..."}
                  style={{ width: '100%', height: 90, padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Giữa: Kết quả bảng công bác sĩ HIS */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
              {hisSummaries.length === 0 ? (
                <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                  <BarChart2 size={48} opacity={0.2} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Chưa có dữ liệu lượt khám</div>
                  <div style={{ fontSize: '0.82rem', marginTop: 6 }}>Tải file Excel lịch sử khám để đếm ngày công duy nhất</div>
                </div>
              ) : (
                <>
                  <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {/* Tìm kiếm bác sĩ */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '5px 10px', borderRadius: 6, width: 220 }}>
                      <Search size={14} color="#64748b" />
                      <input
                        value={hisSearch}
                        onChange={e => setHisSearch(e.target.value)}
                        placeholder="Tìm bác sĩ..."
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8rem', width: '100%' }}
                      />
                      {hisSearch && (
                        <button onClick={() => setHisSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                          <X size={13} color="#94a3b8" />
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db' }}>
                      <button onClick={() => setHisViewMode('summary')}
                        style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', background: hisViewMode === 'summary' ? '#3b82f6' : 'white', color: hisViewMode === 'summary' ? 'white' : '#374151', fontSize: '0.78rem', fontWeight: 600 }}>
                        Tóm tắt
                      </button>
                      <button onClick={() => setHisViewMode('grid')}
                        style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', background: hisViewMode === 'grid' ? '#3b82f6' : 'white', color: hisViewMode === 'grid' ? 'white' : '#374151', fontSize: '0.78rem', fontWeight: 600 }}>
                        Lưới chấm công
                      </button>
                    </div>

                    {hisViewMode === 'grid' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={13} color="#3b82f6" />
                        <select
                          value={hisGridMonth}
                          onChange={e => setHisGridMonth(+e.target.value)}
                          style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>Tháng {m}</option>
                          ))}
                        </select>
                        <select
                          value={hisGridYear}
                          onChange={e => setHisGridYear(+e.target.value)}
                          style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button onClick={hisViewMode === 'grid' ? exportHisGrid : exportHisExcel}
                      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
                      <Download size={14} /> Xuất Excel
                    </button>
                  </div>

                  {hisViewMode === 'grid' ? (
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '100%' }}>
                        <thead>
                          <tr style={{ background: '#eff6ff' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 160, position: 'sticky', left: 0, zIndex: 2 }}>Bác Sĩ</th>
                            {Array.from({ length: new Date(hisGridYear, hisGridMonth, 0).getDate() }, (_, i) => i + 1).map(d => (
                              <th key={d} style={{ padding: '6px 4px', textAlign: 'center', minWidth: 28 }}>{d}</th>
                            ))}
                            <th style={{ padding: '8px 10px', textAlign: 'center', background: '#dcfce7', color: '#15803d', minWidth: 50, position: 'sticky', right: 0, zIndex: 2 }}>Tổng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hisDoctorRows.map((s, i) => {
                            const daysInM = new Date(hisGridYear, hisGridMonth, 0).getDate();
                            const mDays = s.workDays.filter(w => { const [,mm,yy] = w.split('/'); return +mm === hisGridMonth && +yy === hisGridYear; });
                            return (
                              <tr key={s.name} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600, position: 'sticky', left: 0, background: i % 2 === 0 ? 'white' : '#f9fafb', zIndex: 1 }}>{s.name}</td>
                                {Array.from({ length: daysInM }, (_, idx) => idx + 1).map(d => {
                                  const key = `${String(d).padStart(2,'0')}/${String(hisGridMonth).padStart(2,'0')}/${hisGridYear}`;
                                  const worked = s.workDays.includes(key);
                                  return (
                                    <td key={d} style={{ textAlign: 'center', padding: '4px 2px', background: worked ? '#dcfce7' : 'transparent', color: worked ? '#15803d' : '#9ca3af', fontWeight: worked ? 900 : 400 }}>
                                      {worked ? 'X' : ''}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: 'center', fontWeight: 800, color: '#15803d', background: '#f0fdf4', position: 'sticky', right: 0, zIndex: 1 }}>{mDays.length}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ ...cardStyle, flex: 1, overflow: 'auto', padding: 0 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead style={{ background: '#eff6ff', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Bác Sĩ</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Ngày Công</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Tổng Ca Khám</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hisFiltered.map((s, i) => (
                            <tr key={s.name} style={{ borderBottom: '1px solid #f3f4f6', background: hisSelected?.name === s.name ? '#eff6ff' : 'white' }}
                              onClick={() => setHisSelected(hisSelected?.name === s.name ? null : s)}>
                              <td style={{ padding: '8px 10px', color: '#9ca3af' }}>{i + 1}</td>
                              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.name}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1e40af' }}>{s.totalWorkDays}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{s.totalSessions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL THÊM / SỬA CA LÀM VIỆC ── */}
      {showShiftModal && editingShift && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 10,
            width: 520,
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                {editingShift.id.startsWith('shift_') ? 'Cài Đặt Ca Làm Việc' : 'Sửa Ca Làm Việc'}
              </div>
              <button onClick={() => setShowShiftModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={18} color="#94a3b8" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Tên Ca Làm Việc *
                  </label>
                  <input
                    value={editingShift.name}
                    onChange={e => setEditingShift({ ...editingShift, name: e.target.value })}
                    placeholder="Ví dụ: Ca Hành Chính, Ca Sáng..."
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Mã Viết Tắt *
                  </label>
                  <input
                    value={editingShift.code}
                    onChange={e => setEditingShift({ ...editingShift, code: e.target.value.toUpperCase() })}
                    placeholder="HC, S, C..."
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Giờ Bắt Đầu (Vào) *
                  </label>
                  <input
                    type="time"
                    value={editingShift.startTime}
                    onChange={e => setEditingShift({ ...editingShift, startTime: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Giờ Kết Thúc (Ra) *
                  </label>
                  <input
                    type="time"
                    value={editingShift.endTime}
                    onChange={e => setEditingShift({ ...editingShift, endTime: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Nghỉ Trưa Bắt Đầu (tùy chọn)
                  </label>
                  <input
                    type="time"
                    value={editingShift.breakStart || ''}
                    onChange={e => setEditingShift({ ...editingShift, breakStart: e.target.value || undefined })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Nghỉ Trưa Kết Thúc
                  </label>
                  <input
                    type="time"
                    value={editingShift.breakEnd || ''}
                    onChange={e => setEditingShift({ ...editingShift, breakEnd: e.target.value || undefined })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Số Công Quy Đổi *
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={editingShift.workUnits}
                    onChange={e => setEditingShift({ ...editingShift, workUnits: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Ân Hạn Muộn (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingShift.graceLateMinutes}
                    onChange={e => setEditingShift({ ...editingShift, graceLateMinutes: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Ân Hạn Sớm (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingShift.graceEarlyMinutes}
                    onChange={e => setEditingShift({ ...editingShift, graceEarlyMinutes: parseInt(e.target.value, 10) || 0 })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingShift.isOvernight || false}
                    onChange={e => setEditingShift({ ...editingShift, isOvernight: e.target.checked })}
                  />
                  <span>Ca trực qua đêm (sang sáng hôm sau)</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Màu nhận diện:</span>
                  {['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'].map(c => (
                    <div
                      key={c}
                      onClick={() => setEditingShift({ ...editingShift, color: c })}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: c,
                        cursor: 'pointer',
                        border: editingShift.color === c ? '2px solid #0f172a' : '2px solid white',
                        boxShadow: '0 0 2px rgba(0,0,0,0.3)'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => setShowShiftModal(false)}
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveShift}
                  style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  Lưu Ca Làm Việc
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
