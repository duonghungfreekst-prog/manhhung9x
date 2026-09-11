import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, Users, Calendar, BarChart2, Grid,
  Download, Search, RefreshCw, ChevronDown, X, List
} from 'lucide-react';

interface RawRow { doctor: string; datetime: Date | null; }
interface DoctorSummary {
  name: string;
  totalWorkDays: number;
  totalSessions: number;
  workDays: string[]; // 'dd/mm/yyyy'
}

// Chuyển serial Excel hoặc chuỗi về Date
function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel date serial
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

function computeSummaries(rows: RawRow[]): DoctorSummary[] {
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

export function AttendanceTab() {
  const [summaries, setSummaries] = useState<DoctorSummary[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DoctorSummary | null>(null);
  const [colDoctor, setColDoctor] = useState('');
  const [colDatetime, setColDatetime] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [sheetData, setSheetData] = useState<Record<string, unknown>[]>([]);
  const [viewMode, setViewMode] = useState<'summary' | 'grid'>('summary');
  const now = new Date();
  const [gridMonth, setGridMonth] = useState(now.getMonth() + 1);
  const [gridYear, setGridYear]   = useState(now.getFullYear());
  // Danh sách bác sĩ cố định (mỗi dòng 1 tên) — giống cột A của Bang_Cham_Cong
  const [fixedDoctors, setFixedDoctors] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Process data ─────────────────────────────────────────────────────────────
  const processData = (rows: Record<string, unknown>[], dCol: string, tCol: string) => {
    const raw: RawRow[] = rows.map(r => ({
      doctor: String(r[dCol] ?? ''),
      datetime: parseDate(r[tCol]),
    }));
    setRawCount(raw.filter(r => r.datetime).length);
    setSummaries(computeSummaries(raw));
    setSelected(null);
  };

  // ── Read file ───────────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setLoading(true); setError(''); setSummaries([]); setSelected(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Đọc dạng raw array để tự tìm hàng header thực (tránh __EMPTY)
        const rawArr: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        if (!rawArr.length) { setError('File không có dữ liệu!'); setLoading(false); return; }

        // Tìm hàng có nhiều ô không trống nhất trong 10 hàng đầu → đó là header thực
        let headerRowIdx = 0;
        let maxNonEmpty = 0;
        rawArr.slice(0, 10).forEach((row, idx) => {
          const nonEmpty = (row as unknown[]).filter(c => c !== '' && c != null).length;
          if (nonEmpty > maxNonEmpty) { maxNonEmpty = nonEmpty; headerRowIdx = idx; }
        });

        const headerRow = rawArr[headerRowIdx] as unknown[];
        // Dùng tên cột thực; nếu trống thì fallback 'Cột A', 'Cột B'...
        const colLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const hdrs: string[] = headerRow.map((h, i) => {
          const raw = String(h ?? '').trim();
          return raw || `Cột ${i < 26 ? colLetters[i] : i + 1}`;
        });

        // Dữ liệu từ hàng sau header
        const dataRows: Record<string, unknown>[] = rawArr
          .slice(headerRowIdx + 1)
          .map(row => {
            const obj: Record<string, unknown> = {};
            hdrs.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? ''; });
            return obj;
          })
          .filter(r => Object.values(r).some(v => v !== '' && v != null));

        if (!dataRows.length) { setError('File không có dữ liệu sau hàng tiêu đề!'); setLoading(false); return; }

        setHeaders(hdrs);
        setSheetData(dataRows);

        // Lấy giá trị mẫu đầu tiên của mỗi cột để hiển thị trong dropdown
        const preview: Record<string, string> = {};
        hdrs.forEach(h => {
          const sample = dataRows.slice(0, 5).map(r => String(r[h] ?? '')).find(v => v.trim() !== '') ?? '';
          preview[h] = sample.length > 60 ? sample.slice(0, 60) + '…' : sample;
        });
        setPreviewValues(preview);

        // Auto-detect columns
        const dCol = hdrs.find(h => /bác\s*s[iĩ]|tên|doctor|staff|nhân\s*viên/i.test(h)) ?? '';
        const tCol = hdrs.find(h => /ngày|giờ|date|time|datetime|khám/i.test(h)) ?? '';
        setColDoctor(dCol);
        setColDatetime(tCol);
        if (dCol && tCol) {
          processData(dataRows, dCol, tCol);
        }
      } catch {
        setError('Không đọc được file. Vui lòng kiểm tra định dạng (xlsx, csv).');
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleApplyCols = () => {
    if (!colDoctor || !colDatetime) { setError('Vui lòng chọn cột Bác sĩ và cột Ngày giờ.'); return; }
    setError('');
    processData(sheetData, colDoctor, colDatetime);
  };

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const exportExcel = () => {
    // Dùng aoa_to_sheet để giữ đúng thứ tự cột
    const header = ['Bác sĩ', 'Ngày làm việc', 'Tổng ngày công', 'Tổng ca khám'];
    const dataRows = summaries.flatMap(s =>
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
    XLSX.writeFile(wb, 'BaoCaoChamCong.xlsx');
  };

  // ── Export grid Excel (hàng=BS, cột=ngày) ──────────────────────────────────
  const exportGrid = () => {
    const daysInMonth = new Date(gridYear, gridMonth, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // Tính lại doctorRows inline để đảm bảo dùng đúng giá trị hiện tại
    const fixedL = fixedDoctors.split('\n').map(s => s.trim()).filter(Boolean);
    const exportRows = fixedL.length > 0
      ? fixedL.map(name => summaries.find(s => s.name === name) ?? { name, totalWorkDays: 0, totalSessions: 0, workDays: [] })
      : summaries;

    // Dùng aoa_to_sheet để đảm bảo thứ tự cột: Bác sĩ | 01 | 02 | ... | 31 | Tổng
    const headerRow = [
      'Bác sĩ',
      ...days.map(d => `${String(d).padStart(2,'0')}/${String(gridMonth).padStart(2,'0')}`),
      'Tổng',
    ];

    const dataRows = exportRows.map(s => {
      const monthTotal = s.workDays.filter(w => {
        const [, mm, yyyy] = w.split('/');
        return +mm === gridMonth && +yyyy === gridYear;
      }).length;
      return [
        s.name,
        ...days.map(d => {
          const key = `${String(d).padStart(2,'0')}/${String(gridMonth).padStart(2,'0')}/${gridYear}`;
          return s.workDays.includes(key) ? 'X' : '';
        }),
        monthTotal,
      ];
    });

    const aoa = [headerRow, ...dataRows];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'ChamCong');
    XLSX.writeFile(wb, `ChamCong_T${gridMonth}_${gridYear}.xlsx`);
  };

  // Danh sách hiển thị: nếu có fixedDoctors thì dùng đó (giữ thứ tự), nếu không thì dùng tất cả từ data
  const fixedList = fixedDoctors.split('\n').map(s => s.trim()).filter(Boolean);
  const doctorRows = fixedList.length > 0
    ? fixedList.map(name => summaries.find(s => s.name === name) ?? { name, totalWorkDays: 0, totalSessions: 0, workDays: [] })
    : summaries;

  const filtered = doctorRows.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const card: React.CSSProperties = { background: 'white', borderRadius: 8, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,.08)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f9ff', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ ...card, margin: '0.75rem 0.75rem 0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <BarChart2 size={22} color="#3b82f6" />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: '1rem' }}>Chấm Công Bác Sĩ</strong>
          <span style={{ marginLeft: 10, fontSize: '0.78rem', color: '#6b7280' }}>
            Tính ngày công duy nhất từ lịch sử khám (nhiều ca/ngày = 1 ngày công)
          </span>
        </div>
        {summaries.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid #d1d5db' }}>
              {([['summary', <List size={13}/>, 'Tóm tắt'] , ['grid', <Grid size={13}/>, 'Lưới chấm công']] as const).map(([m, icon, label]) => (
                <button key={m} onClick={() => setViewMode(m)}
                  style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 600,
                    background: viewMode === m ? '#3b82f6' : 'white', color: viewMode === m ? 'white' : '#374151' }}>
                  {icon} {label}
                </button>
              ))}
            </div>
            <button onClick={viewMode === 'grid' ? exportGrid : exportExcel}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
              <Download size={14} /> {viewMode === 'grid' ? 'Xuất Lưới Excel' : 'Xuất Excel'}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '0.75rem', padding: '0.75rem', overflow: 'hidden', minHeight: 0 }}>

        {/* LEFT: Upload + Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: 280, flexShrink: 0, overflowY: 'auto' }}>

          {/* Upload */}
          <div style={card}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Upload size={14} color="#3b82f6" /> Tải File Dữ Liệu
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{ border: '2px dashed #bfdbfe', borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: '#eff6ff' }}>
              <Upload size={28} color="#3b82f6" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: '0.82rem', color: '#1d4ed8', fontWeight: 600 }}>
                {fileName || 'Kéo thả hoặc nhấp để chọn file'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>Excel (.xlsx, .xls) hoặc CSV</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {loading && <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Đang đọc file...</div>}
            {error && <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 6, fontSize: '0.78rem', color: '#dc2626' }}>{error}</div>}
          </div>

          {/* Column mapping */}
          {headers.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChevronDown size={14} /> Chọn Cột Dữ Liệu
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 3, fontWeight: 500 }}>CỘT TÊN BÁC SĨ</div>
                  <select value={colDoctor} onChange={e => setColDoctor(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                    <option value="">-- Chọn cột --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>
                        {h}{previewValues[h] ? ` — ${previewValues[h]}` : ''}
                      </option>
                    ))}
                  </select>
                  {colDoctor && previewValues[colDoctor] && (
                    <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#059669', background: '#f0fdf4', padding: '3px 6px', borderRadius: 4 }}>
                      Mẫu: {previewValues[colDoctor]}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 3, fontWeight: 500 }}>CỘT NGÀY GIỜ KHÁM</div>
                  <select value={colDatetime} onChange={e => setColDatetime(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                    <option value="">-- Chọn cột --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>
                        {h}{previewValues[h] ? ` — ${previewValues[h]}` : ''}
                      </option>
                    ))}
                  </select>
                  {colDatetime && previewValues[colDatetime] && (
                    <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#059669', background: '#f0fdf4', padding: '3px 6px', borderRadius: 4 }}>
                      Mẫu: {previewValues[colDatetime]}
                    </div>
                  )}
                </div>
                <button onClick={handleApplyCols} style={{ padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
                  ⚡ Tính Ngày Công
                </button>
              </div>
            </div>
          )}

          {/* Stats */}
          {summaries.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10 }}>📊 Tổng Quan</div>
              {[
                { label: 'Tổng bác sĩ', value: summaries.length, color: '#3b82f6' },
                { label: 'Tổng bản ghi', value: rawCount, color: '#6366f1' },
                { label: 'Tổng ngày công', value: summaries.reduce((s, d) => s + d.totalWorkDays, 0), color: '#10b981' },
                { label: 'TB ngày công/BS', value: (summaries.reduce((s, d) => s + d.totalWorkDays, 0) / summaries.length).toFixed(1), color: '#f59e0b' },
              ].map(st => (
                <div key={st.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '6px 8px', background: '#f9fafb', borderRadius: 6 }}>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{st.label}</span>
                  <strong style={{ fontSize: '0.95rem', color: st.color }}>{st.value}</strong>
                </div>
              ))}
            </div>
          )}

          {/* Fixed doctors config */}
          <div style={card}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} color="#6366f1" /> Danh Sách Bác Sĩ Cố Định
            </div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 6 }}>
              Nhập mỗi tên 1 dòng (giống cột A của bảng chấm công). Chỉ những bác sĩ này mới hiển thị trong lưới.
            </div>
            <textarea
              value={fixedDoctors}
              onChange={e => setFixedDoctors(e.target.value)}
              placeholder={"Nguyễn Văn A\nTrần Thị B\nLê Văn C\n..."}
              style={{ width: '100%', height: 100, padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.78rem', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
            />
            {fixedList.length > 0 && (
              <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#6366f1', fontWeight: 600 }}>
                ✓ Đang dùng {fixedList.length} bác sĩ cố định
              </div>
            )}
          </div>
          <div style={{ ...card, background: '#fefce8', border: '1px solid #fde68a' }}>
            <div style={{ fontSize: '0.78rem', color: '#713f12' }}>
              <strong>💡 Logic tính:</strong><br />
              Mỗi bác sĩ, tool sẽ lấy tất cả bản ghi, cắt bỏ phần giờ (tương đương hàm <code>INT()</code> của Excel), sau đó dùng <code>UNIQUE()</code> để đếm số ngày duy nhất.<br /><br />
              <strong>VD:</strong> 3 ca khám vào ngày 11/05 → chỉ tính <strong>1 ngày công</strong>.
            </div>
          </div>
        </div>

        {/* CENTER: Summary table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
          {summaries.length === 0 ? (
            <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
              <BarChart2 size={48} opacity={0.2} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Chưa có dữ liệu</div>
              <div style={{ fontSize: '0.82rem', marginTop: 6 }}>Tải file Excel/CSV lên để bắt đầu tính ngày công</div>
            </div>
          ) : viewMode === 'grid' ? (
            /* ── GRID VIEW ── */
            <>
              {/* Month/Year picker */}
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <Calendar size={15} color="#3b82f6" />
                <strong style={{ fontSize: '0.82rem' }}>Bảng chấm công tháng:</strong>
                <select value={gridMonth} onChange={e => setGridMonth(+e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                  {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>Tháng {m}</option>)}
                </select>
                <select value={gridYear} onChange={e => setGridYear(+e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                  {Array.from({ length: now.getFullYear() - 2020 + 2 }, (_, i) => 2020 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span style={{ fontSize: '0.78rem', color: '#6b7280', marginLeft: 'auto' }}>
                {summaries.filter(s => s.workDays.some(w => { const [,mm,yy] = w.split('/'); return +mm===gridMonth && +yy===gridYear; })).length} bác sĩ có lịch | {doctorRows.length} hiển thị
                </span>
              </div>
              {/* Grid table */}
              <div style={{ ...card, flex: 1, overflow: 'auto' }}>
                {(() => {
                  const daysInMonth = new Date(gridYear, gridMonth, 0).getDate();
                  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
                  const th: React.CSSProperties = { padding: '6px 4px', textAlign: 'center', fontWeight: 700, fontSize: '0.72rem', borderBottom: '2px solid #bfdbfe', color: '#1e40af', background: '#eff6ff', position: 'sticky', top: 0, whiteSpace: 'nowrap', minWidth: 28 };
                  return (
                    <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, textAlign: 'left', minWidth: 160, position: 'sticky', left: 0, zIndex: 2 }}>Bác Sĩ</th>
                          {days.map(d => {
                            const dow = new Date(gridYear, gridMonth-1, d).getDay();
                            const isWeekend = dow===0||dow===6;
                            return (
                              <th key={d} style={{ ...th, color: isWeekend ? '#dc2626' : '#1e40af', background: isWeekend ? '#fef2f2' : '#eff6ff', lineHeight: 1.2 }}>
                                <div>{d}</div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 500, opacity: 0.75 }}>/{gridMonth}</div>
                              </th>
                            );
                          })}
                          <th style={{ ...th, background: '#dcfce7', color: '#15803d', minWidth: 52, position: 'sticky', right: 0, zIndex: 2, borderLeft: '2px solid #86efac' }}>Tổng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doctorRows.map((s, i) => {
                          const monthWorkDays = s.workDays.filter(w => { const [,mm,yy]=w.split('/'); return +mm===gridMonth && +yy===gridYear; });
                          const hasData = s.totalWorkDays > 0;
                          return (
                            <tr key={s.name} style={{ background: i%2===0?'white':'#f9fafb' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600, fontSize: '0.8rem', position: 'sticky', left: 0, background: i%2===0?'white':'#f9fafb', borderRight: '2px solid #e5e7eb', zIndex: 1, color: hasData ? '#111' : '#9ca3af', fontStyle: hasData ? 'normal' : 'italic' }}>{s.name}</td>
                              {days.map(d => {
                                const key = `${String(d).padStart(2,'0')}/${String(gridMonth).padStart(2,'0')}/${gridYear}`;
                                const worked = s.workDays.includes(key);
                                const dow = new Date(gridYear, gridMonth-1, d).getDay();
                                return (
                                  <td key={d} style={{ textAlign: 'center', padding: '4px 2px',
                                    background: worked ? '#dcfce7' : (dow===0||dow===6) ? '#fef9f9' : 'transparent',
                                    color: worked ? '#15803d' : '#9ca3af', fontWeight: worked ? 900 : 400 }}>
                                    {worked ? 'X' : ''}
                                  </td>
                                );
                              })}
                              <td style={{ textAlign: 'center', fontWeight: 800, color: '#15803d', background: '#f0fdf4', padding: '4px 10px', position: 'sticky', right: 0, zIndex: 1, borderLeft: '2px solid #86efac', minWidth: 52 }}>{monthWorkDays.length}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </>
          ) : (
            /* ── SUMMARY VIEW ── */
            <>
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <Search size={15} color="#9ca3af" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm bác sĩ..."
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem' }} />
                {search && <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#9ca3af" /></button>}
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{filtered.length} / {summaries.length} bác sĩ</span>
              </div>

              <div style={{ ...card, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={15} color="#3b82f6" /> Bảng Chấm Công
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                    <thead style={{ background: '#eff6ff', position: 'sticky', top: 0 }}>
                      <tr>
                        {['#', 'Tên Bác Sĩ', 'Ngày Công', 'Ca Khám', 'TB Ca/Ngày', 'Hành động'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: i > 1 ? 'center' : 'left', borderBottom: '2px solid #bfdbfe', color: '#1e40af', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s, i) => (
                        <tr key={s.name} style={{ borderBottom: '1px solid #f3f4f6', background: selected?.name === s.name ? '#eff6ff' : i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer', transition: 'background .15s' }}
                          onClick={() => setSelected(selected?.name === s.name ? null : s)}>
                          <td style={{ padding: '10px 12px', color: '#9ca3af', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 12px', borderRadius: 20, fontWeight: 800, fontSize: '0.9rem' }}>{s.totalWorkDays}</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>{s.totalSessions}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280' }}>
                            {(s.totalSessions / s.totalWorkDays).toFixed(1)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <button onClick={e => { e.stopPropagation(); setSelected(selected?.name === s.name ? null : s); }}
                              style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid #bfdbfe', background: selected?.name === s.name ? '#3b82f6' : 'white', color: selected?.name === s.name ? 'white' : '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                              {selected?.name === s.name ? 'Ẩn' : 'Chi tiết'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Detail panel */}
        {selected && (
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ ...card, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500 }}>NGÀY LÀM VIỆC</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e40af', marginTop: 2 }}>{selected.name}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                  <X size={16} color="#9ca3af" />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                {[
                  { label: 'Ngày công', value: selected.totalWorkDays, bg: '#dbeafe', color: '#1e40af' },
                  { label: 'Ca khám', value: selected.totalSessions, bg: '#dcfce7', color: '#15803d' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} /> DANH SÁCH {selected.totalWorkDays} NGÀY
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {selected.workDays.map((d, i) => (
                  <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 5, marginBottom: 3, background: i % 2 === 0 ? '#f0f9ff' : 'white', border: '1px solid #e0f2fe' }}>
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', width: 20, textAlign: 'right' }}>{i + 1}</span>
                    <Calendar size={11} color="#3b82f6" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1e3a8a' }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
