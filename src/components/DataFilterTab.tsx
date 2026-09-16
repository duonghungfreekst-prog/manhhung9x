import React, { useState, useMemo } from 'react';
import { Filter, Search, Download, AlertCircle, List, Hash } from 'lucide-react';
import { UploadCard } from './UploadCard';
import { readAnyFile } from '../utils/excelProcessor';
import { showToast } from '../utils/notificationSystem';
import { startGlobalLoading, stopGlobalLoading } from '../utils/globalLoading';
import type { FileFormat } from '../types';
import * as XLSX from 'xlsx';

type FilterMode = 'duplicate' | 'search' | 'group';

// ─── Đọc Excel thông minh: tự động tìm hàng header thực sự ─────────────────────
async function smartReadExcel(file: File, forceHeaderRow?: number): Promise<{
  data: Record<string, unknown>[];
  detectedHeaderRow: number;
  previewRows: unknown[][];
  totalRows: number;
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const maxScanRow = Math.min(range.e.r, 14);

  // Lưu tối đa 12 hàng đầu để hiển thị picker
  const previewRows: unknown[][] = [];
  for (let r = range.s.r; r <= Math.min(range.e.r, 11); r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, 25); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell?.v != null ? String(cell.v).trim() : '');
    }
    previewRows.push(row);
  }

  // Tìm hàng header nếu chưa chỉ định
  let bestHeaderRow = forceHeaderRow ?? 0;

  if (forceHeaderRow === undefined) {
    let bestScore = -1;
    for (let r = range.s.r; r <= maxScanRow; r++) {
      let textCount = 0;
      let numCount = 0;
      let emptyCount = 0;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        const val = cell?.v != null ? String(cell.v).trim() : '';
        if (!val) emptyCount++;
        else if (/^\d+$/.test(val)) numCount++;
        else textCount++;
      }
      const score = textCount * 3 + numCount * 0.5 - emptyCount * 0.8;
      if ((textCount + numCount) > 0 && score > bestScore) {
        bestScore = score;
        bestHeaderRow = r;
      }
    }
  }

  // Đọc data từ hàng header đã chọn
  const rows = XLSX.utils.sheet_to_json(ws, {
    defval: '',
    header: 1,
    range: bestHeaderRow,
  }) as unknown[][];

  if (rows.length < 2) return { data: [], detectedHeaderRow: bestHeaderRow, previewRows, totalRows: range.e.r };

  const rawHeaders = rows[0] as unknown[];
  const headers: string[] = rawHeaders.map((h, i) => {
    const s = String(h ?? '').trim();
    return s || `Cột_${i + 1}`;
  });

  const nonEmptyCols = headers
    .map((_, i) => i)
    .filter(i => rows.slice(1).some(row => String((row as unknown[])[i] ?? '').trim() !== ''));

  const usedNames: string[] = [];
  const cleanHeaders: string[] = nonEmptyCols.map(i => {
    let name = headers[i];
    let count = 1;
    while (usedNames.includes(name)) {
      name = `${headers[i]}_${++count}`;
    }
    usedNames.push(name);
    return name;
  });

  // Lỗi #10 fix: hàm chuẩn hóa giá trị từ cell: convert Date object → DD/MM/YYYY
  // để tránh lỗi parse múi giờ sau này
  const normalizeCellValue = (v: unknown): unknown => {
    if (v instanceof Date) {
      const dd = String(v.getDate()).padStart(2, '0');
      const mm = String(v.getMonth() + 1).padStart(2, '0');
      const yyyy = v.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    return v;
  };

  const data = rows.slice(1).map(row => {
    const obj: Record<string, unknown> = {};
    nonEmptyCols.forEach((colIdx, j) => {
      obj[cleanHeaders[j]] = normalizeCellValue((row as unknown[])[colIdx] ?? '');
    });
    return obj;
  }).filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''));

  return { data, detectedHeaderRow: bestHeaderRow, previewRows, totalRows: range.e.r };
}

export function DataFilterTab() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<FileFormat | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string>('');
  const [primaryField, setPrimaryField] = useState<string>('');
  const [displayFields, setDisplayFields] = useState<string[]>([]);

  const [filterMode, setFilterMode] = useState<FilterMode>('duplicate');
  const [searchQuery, setSearchQuery] = useState('');
  const [valueSearch, setValueSearch] = useState('');
  const [groupFilterValue, setGroupFilterValue] = useState(''); // bộ lọc trước khi gộp
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupField, setGroupField] = useState<string>('');

  // Header row picker
  const [rawPreviewRows, setRawPreviewRows] = useState<unknown[][]>([]);
  const [detectedHeaderRow, setDetectedHeaderRow] = useState<number>(0);
  const [showHeaderPicker, setShowHeaderPicker] = useState(false);
  const currentFileRef = React.useRef<File | null>(null);

  const columns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  const handleFileChange = async (f: File | null) => {
    setFile(f);
    setFormat(null);
    setData([]);
    setPreviewRows([]);
    setPrimaryField('');
    setDisplayFields([]);
    setValueSearch('');
    setExpandedGroups(new Set());
    setRawPreviewRows([]);
    setShowHeaderPicker(false);
    setLoadError('');
    currentFileRef.current = f;

    if (!f) return;

    setIsProcessing(true);
    const taskId = `filter-load-${f.name}`;
    startGlobalLoading(taskId, `Đang phân tích & đọc dữ liệu tệp "${f.name}"...`);
    try {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      let parsedData: Record<string, unknown>[];
      let parsedFormat: string;

      if (['xlsx', 'xls'].includes(ext)) {
        const result = await smartReadExcel(f);
        parsedData = result.data;
        parsedFormat = 'Excel';
        setRawPreviewRows(result.previewRows);
        setDetectedHeaderRow(result.detectedHeaderRow);
      } else {
        const result = await readAnyFile(f);
        parsedData = result.data;
        parsedFormat = result.format;
      }

      setFormat(parsedFormat.toLowerCase() as FileFormat);
      setData(parsedData);
      setPreviewRows(parsedData.slice(0, 5));
      if (parsedData.length > 0) {
        const cols = Object.keys(parsedData[0]);
        if (cols.length > 0) {
          setPrimaryField(cols[0]);
          setDisplayFields(cols.slice(1, 6));
        }
        showToast.success('Tải tệp thành công', `Đã tải ${parsedData.length} dòng dữ liệu từ ${f.name}`);
      }
    } catch (err) {
      console.error(err);
      // Lỗi #3 fix: dùng state inline thay vì alert() native
      setLoadError('Không thể đọc tệp: ' + (err instanceof Error ? err.message : String(err)));
      setFile(null);
    } finally {
      setIsProcessing(false);
      stopGlobalLoading(taskId);
    }
  };

  // Đổi header row thủ công
  const handleChangeHeaderRow = async (rowIdx: number) => {
    if (!currentFileRef.current) return;
    setDetectedHeaderRow(rowIdx);
    setShowHeaderPicker(false);
    setIsProcessing(true);
    const taskId = 'filter-change-header';
    startGlobalLoading(taskId, `Đang nạp lại dữ liệu theo hàng tiêu đề ${rowIdx + 1}...`);
    try {
      const result = await smartReadExcel(currentFileRef.current, rowIdx);
      setData(result.data);
      setPreviewRows(result.data.slice(0, 5));
      if (result.data.length > 0) {
        const cols = Object.keys(result.data[0]);
        setPrimaryField(cols[0]);
        setDisplayFields(cols.slice(1, 6));
      }
    } finally {
      setIsProcessing(false);
      stopGlobalLoading(taskId);
    }
  };

  const toggleDisplayField = (col: string) => {
    setDisplayFields(prev =>
      prev.includes(col) ? prev.filter(f => f !== col) : [...prev, col]
    );
  };

  // ── Chế độ 1: Tìm trùng toàn bộ ──────────────────────────────────────────
  const duplicateGroups = useMemo(() => {
    if (!primaryField || data.length === 0) return [];
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of data) {
      const val = String(row[primaryField] ?? '').trim();
      if (!val) continue;
      if (!groups.has(val)) groups.set(val, []);
      groups.get(val)!.push(row);
    }
    const duplicates: { value: string; count: number; rows: Record<string, unknown>[] }[] = [];
    for (const [val, rows] of groups.entries()) {
      if (rows.length > 1) duplicates.push({ value: val, count: rows.length, rows });
    }
    duplicates.sort((a, b) => b.count - a.count);
    return duplicates;
  }, [data, primaryField]);

  const filteredDuplicateGroups = useMemo(() => {
    if (!searchQuery) return duplicateGroups;
    const q = searchQuery.toLowerCase();
    return duplicateGroups.filter(g =>
      g.value.toLowerCase().includes(q) ||
      g.rows.some(r => displayFields.some(f => String(r[f] ?? '').toLowerCase().includes(q)))
    );
  }, [duplicateGroups, searchQuery, displayFields]);

  // ── Chế độ 2: Tìm giá trị cụ thể ─────────────────────────────────────────
  const valueSearchResults = useMemo(() => {
    if (!primaryField || !valueSearch.trim() || data.length === 0) return [];
    const q = valueSearch.trim().toLowerCase();
    return data.filter(row =>
      String(row[primaryField] ?? '').toLowerCase().includes(q)
    );
  }, [data, primaryField, valueSearch]);

  // Group kết quả tìm theo giá trị thực tế để dễ đọc
  const valueSearchGroups = useMemo(() => {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of valueSearchResults) {
      const val = String(row[primaryField] ?? '').trim();
      if (!groups.has(val)) groups.set(val, []);
      groups.get(val)!.push(row);
    }
    return Array.from(groups.entries()).map(([value, rows]) => ({ value, rows, count: rows.length }));
  }, [valueSearchResults, primaryField]);

  const toggleExpandGroup = (val: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  // ── Chế độ 3: Gộp theo trường ───────────────────────────────────────────
  const effectiveGroupField = groupField || primaryField;

  // Chuẩn hóa giá trị: chỉ chuẩn hóa nếu trông giống ngày thật sự
  const normalizeGroupKey = (val: string): string => {
    // Chỉ thử parse nếu chuỗi có dạng ngày (DD/MM/YYYY, YYYY-MM-DD, ISO timestamp...)
    // Tránh parse tên người hoặc mã số thành Date
    // eslint-disable-next-line no-useless-escape
    const isDateLike = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}(T.*)?|\d{4}\/\d{2}\/\d{2})$/.test(val.trim());
    if (!isDateLike) return val;

    // Thử parse Date từ các dạng hợp lệ
    let d: Date | null = null;
    // DD/MM/YYYY hoặc DD-MM-YYYY
    // eslint-disable-next-line no-useless-escape
    const dmyMatch = val.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
      const day = +dmyMatch[1], month = +dmyMatch[2], year = +dmyMatch[3];
      // Phân biệt DD/MM/YYYY vs MM/DD/YYYY: nếu month > 12 thì hoán đổi
      if (month <= 12) {
        d = new Date(year < 100 ? year + 2000 : year, month - 1, day);
      }
    } else {
      d = new Date(val);
    }

    if (d && !isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    // Không parse được → dùng nguyên
    return val;
  };

  // Dữ liệu đã lọc theo primaryField + groupFilterValue trước khi gộp
  const groupFilteredData = useMemo(() => {
    if (!primaryField || data.length === 0) return data;
    const q = groupFilterValue.trim().toLowerCase();
    if (!q) return data;
    return data.filter(row =>
      String(row[primaryField] ?? '').toLowerCase().includes(q)
    );
  }, [data, primaryField, groupFilterValue]);

  const groupByGroups = useMemo(() => {
    if (!effectiveGroupField || groupFilteredData.length === 0) return [];
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of groupFilteredData) {
      const raw = String(row[effectiveGroupField] ?? '').trim();
      if (!raw) continue;
      const key = normalizeGroupKey(raw);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries())
      .map(([value, rows]) => ({ value, rows, count: rows.length }))
      .sort((a, b) => {
        const da = a.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const db = b.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (da && db) {
          const ta = new Date(+da[3], +da[2] - 1, +da[1]).getTime();
          const tb = new Date(+db[3], +db[2] - 1, +db[1]).getTime();
          return ta - tb;
        }
        return a.value.localeCompare(b.value);
      });
  }, [groupFilteredData, effectiveGroupField]);

  // ── Xuất Excel ─────────────────────────────────────────────────────────────
  const handleExport = () => {
    const exportData: Record<string, unknown>[] = [];

    if (filterMode === 'duplicate') {
      filteredDuplicateGroups.forEach(group => {
        group.rows.forEach((row, idx) => {
          const item: Record<string, unknown> = {
            [primaryField]: group.value,
            'Số lượng trùng': idx === 0 ? group.count : '',
          };
          displayFields.forEach(f => { item[f] = row[f]; });
          exportData.push(item);
        });
      });
    } else if (filterMode === 'group') {
      groupByGroups.forEach(group => {
        group.rows.forEach((row, idx) => {
          const item: Record<string, unknown> = {
            [effectiveGroupField]: group.value,
            'Số bản ghi': idx === 0 ? group.count : '',
          };
          displayFields.filter(f => f !== effectiveGroupField).forEach(f => { item[f] = row[f]; });
          exportData.push(item);
        });
      });
    } else {
      valueSearchGroups.forEach(group => {
        group.rows.forEach((row, idx) => {
          const item: Record<string, unknown> = {
            [primaryField]: group.value,
            'Số lượng tìm thấy': idx === 0 ? group.count : '',
          };
          displayFields.forEach(f => { item[f] = row[f]; });
          exportData.push(item);
        });
      });
    }

    if (exportData.length === 0) {
      showToast.warning('Không có dữ liệu', 'Không có bản ghi nào thỏa mãn điều kiện lọc để xuất.');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KetQua');
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `KetQuaLoc_${date}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast.success('Xuất Excel thành công', `Đã xuất ${exportData.length} dòng kết quả lọc ra tệp: ${fileName}`);
  };

  const hasResults = filterMode === 'duplicate'
    ? filteredDuplicateGroups.length > 0
    : filterMode === 'group'
    ? groupByGroups.length > 0
    : valueSearchGroups.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      {/* Upload Area */}
      <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <UploadCard
          title="Tải tệp dữ liệu cần lọc"
          subtitle="Hỗ trợ Excel, XML, CSV"
          exampleName="DuLieu.xlsx"
          file={file}
          format={format}
          onFileChange={handleFileChange}
          previewRows={previewRows}
          color="#3b82f6"
        />
      </div>

      {/* Lỗi #3 fix: hiển thị lỗi inline dạng banner thay vì alert() */}
      {loadError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem', background: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: 8,
          color: '#dc2626', fontSize: '0.875rem',
        }}>
          <AlertCircle size={18} />
          {loadError}
          <button
            onClick={() => setLoadError('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
          >&#x2715;</button>
        </div>
      )}

      {isProcessing && <div className="progress-bar-wrap"><div className="progress-bar"/></div>}

      {/* Header Row Picker — chỉ hiển thị với Excel */}
      {rawPreviewRows.length > 0 && (
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '10px 16px', background: '#f0fdf4', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>
              📋 Đang dùng <strong>hàng {detectedHeaderRow + 1}</strong> làm tiêu đề cột
            </span>
            <button
              onClick={() => setShowHeaderPicker(p => !p)}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #16a34a', background: showHeaderPicker ? '#16a34a' : 'white', color: showHeaderPicker ? 'white' : '#16a34a', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
            >
              {showHeaderPicker ? '✕ Đóng' : '✏️ Chọn lại hàng tiêu đề'}
            </button>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Nếu tên cột hiển thị sai, hãy click vào hàng tiêu đề đúng bên dưới
            </span>
          </div>

          {showHeaderPicker && (
            <div style={{ overflowX: 'auto', maxHeight: 280 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <tbody>
                  {rawPreviewRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      onClick={() => handleChangeHeaderRow(rIdx)}
                      style={{
                        cursor: 'pointer',
                        background: rIdx === detectedHeaderRow ? '#dbeafe' : rIdx % 2 === 0 ? 'white' : '#f8fafc',
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s',
                      }}
                      title={`Dùng hàng ${rIdx + 1} làm tiêu đề`}
                    >
                      <td style={{ padding: '5px 8px', color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem', width: 36, textAlign: 'center', borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap', background: rIdx === detectedHeaderRow ? '#bfdbfe' : '#f8fafc' }}>
                        {rIdx === detectedHeaderRow ? '✓' : rIdx + 1}
                      </td>
                      {(row as string[]).slice(0, 12).map((cell, cIdx) => (
                        <td key={cIdx} style={{
                          padding: '5px 10px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
                          color: rIdx === detectedHeaderRow ? '#1d4ed8' : cell ? '#334155' : '#cbd5e1',
                          fontWeight: rIdx === detectedHeaderRow ? 700 : 400,
                        }}>
                          {cell || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '6px 16px', fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                👆 Click vào hàng chứa tên cột thực sự (STT, Mã y tế, Họ tên bệnh nhân...)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Configuration */}
      {data.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e293b' }}>
            <Filter size={18} /> Cấu hình lọc dữ liệu
          </h3>

          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
            <button
              onClick={() => setFilterMode('duplicate')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85rem',
                background: filterMode === 'duplicate' ? '#3b82f6' : '#f1f5f9',
                color: filterMode === 'duplicate' ? 'white' : '#64748b',
                transition: 'all 0.2s',
              }}
            >
              <Hash size={15} /> Tìm tất cả trùng lặp
            </button>
            <button
              onClick={() => setFilterMode('search')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85rem',
                background: filterMode === 'search' ? '#8b5cf6' : '#f1f5f9',
                color: filterMode === 'search' ? 'white' : '#64748b',
                transition: 'all 0.2s',
              }}
            >
              <List size={15} /> Tìm giá trị cụ thể
            </button>
            <button
              onClick={() => setFilterMode('group')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85rem',
                background: filterMode === 'group' ? '#f59e0b' : '#f1f5f9',
                color: filterMode === 'group' ? 'white' : '#64748b',
                transition: 'all 0.2s',
              }}
            >
              ⊞ Gộp theo trường
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            {/* Primary Field */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                1. Chọn trường cần lọc
              </label>
              <select
                value={primaryField}
                onChange={e => { setPrimaryField(e.target.value); setValueSearch(''); setExpandedGroups(new Set()); }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
              >
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Ô nhập giá trị tìm kiếm — chỉ hiển thị ở mode search */}
              {filterMode === 'search' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
                    Nhập giá trị cần tìm:
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder={`VD: Dương Minh Châu`}
                      value={valueSearch}
                      onChange={e => setValueSearch(e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '0.5rem 0.5rem 0.5rem 2rem',
                        borderRadius: '6px', border: '1px solid #a78bfa',
                        outline: 'none', fontSize: '0.875rem',
                        boxShadow: '0 0 0 2px #ede9fe',
                      }}
                    />
                  </div>
                  {valueSearch && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600 }}>
                      Tìm thấy {valueSearchResults.length} dòng · {valueSearchGroups.length} giá trị khác nhau
                    </div>
                  )}
                  {!valueSearch && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                      Nhập tên hoặc giá trị bất kỳ để tìm trong cột đã chọn.
                    </div>
                  )}
                </div>
              )}

              {/* Chế độ Gộp: lọc trước + chọn trường gộp */}
              {filterMode === 'group' && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Lọc giá trị trước khi gộp */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
                      Lọc theo cột trên (tùy chọn):
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Search size={15} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder={`VD: Nguyễn Văn Trường`}
                        value={groupFilterValue}
                        onChange={e => { setGroupFilterValue(e.target.value); setExpandedGroups(new Set()); }}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '0.5rem 0.5rem 0.5rem 2rem',
                          borderRadius: '6px', border: '1px solid #fbbf24',
                          outline: 'none', fontSize: '0.875rem',
                          boxShadow: '0 0 0 2px #fef3c7',
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#92400e' }}>
                      {groupFilterValue
                        ? <>Đang lọc: <strong>{groupFilteredData.length}</strong> / {data.length} dòng phù hợp</>
                        : 'De trong = gop toan bo du lieu'}
                    </div>
                  </div>

                  {/* Chọn trường gộp */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#92400e', marginBottom: '0.4rem' }}>
                      Gộp theo trường:
                    </label>
                    <select
                      value={effectiveGroupField}
                      onChange={e => setGroupField(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #fbbf24', outline: 'none', boxShadow: '0 0 0 2px #fef3c7' }}
                    >
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#92400e' }}>
                      Gộp dòng có cùng giá trị. VD: "Ngày khám" → đếm bao nhiêu lượt/ngày.
                    </div>
                    {groupByGroups.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>
                        {groupByGroups.length} giá trị · tổng {groupFilteredData.length} bản ghi
                      </div>
                    )}
                  </div>
                </div>
              )}

              {filterMode === 'duplicate' && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                  Hệ thống sẽ tìm các dòng có cùng giá trị ở cột này.
                </div>
              )}
            </div>

            {/* Display Fields */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                2. Chọn các trường thông tin hiển thị kèm theo
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc' }}>
                {columns.filter(c => c !== primaryField).map(col => (
                  <label key={col} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', background: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={displayFields.includes(col)}
                      onChange={() => toggleDisplayField(col)}
                    />
                    {col}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {data.length > 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>
                {filterMode === 'duplicate' ? (
                  <>Kết quả: <span style={{ color: '#ef4444' }}>{filteredDuplicateGroups.length} nhóm trùng</span></>
                ) : filterMode === 'group' ? (
                  <>Gộp theo <span style={{ color: '#d97706' }}>&ldquo;{effectiveGroupField}&rdquo;</span>: <span style={{ color: '#d97706' }}>{groupByGroups.length} giá trị</span> · tổng <span style={{ color: '#d97706' }}>{data.length} bản ghi</span></>
                ) : valueSearch ? (
                  <>Kết quả tìm &ldquo;<span style={{ color: '#7c3aed' }}>{valueSearch}</span>&rdquo;: <span style={{ color: '#7c3aed' }}>{valueSearchResults.length} dòng</span></>
                ) : (
                  <span style={{ color: '#94a3b8' }}>Chưa nhập từ khóa tìm kiếm</span>
                )}
              </h3>

              {/* Search trong mode duplicate */}
              {filterMode === 'duplicate' && (
                <div style={{ position: 'relative', width: '250px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Tìm kiếm trong kết quả..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '0.4rem 0.5rem 0.4rem 2rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleExport}
              disabled={!hasResults}
              style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: hasResults ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: hasResults ? 1 : 0.5 }}
            >
              <Download size={16} /> Xuất Excel
            </button>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
            {/* ── Mode 1: Duplicate ── */}
            {filterMode === 'duplicate' && (
              filteredDuplicateGroups.length > 0 ? (
                <table className="reader-table">
                  <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '2px solid #cbd5e1', color: '#475569', fontWeight: 600 }}>{primaryField}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center', borderBottom: '2px solid #cbd5e1', color: '#475569', fontWeight: 600, width: 90 }}>Số lượng</th>
                      {displayFields.map(f => (
                        <th key={f} style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '2px solid #cbd5e1', color: '#475569', fontWeight: 600 }}>{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDuplicateGroups.map((group, gIndex) => (
                      <React.Fragment key={gIndex}>
                        {group.rows.map((row, rIndex) => (
                          <tr key={`${gIndex}-${rIndex}`} style={{ background: rIndex === 0 ? 'transparent' : '#f8fafc', borderBottom: rIndex === group.rows.length - 1 ? '1px solid #cbd5e1' : '1px dotted #e2e8f0' }}>
                            {rIndex === 0 ? (
                              <td rowSpan={group.rows.length} style={{ padding: '0.75rem 1rem', borderRight: '1px solid #e2e8f0', verticalAlign: 'top', fontWeight: 600, color: '#0f172a' }}>
                                {group.value}
                              </td>
                            ) : null}
                            {rIndex === 0 ? (
                              <td rowSpan={group.rows.length} style={{ padding: '0.75rem 1rem', borderRight: '1px solid #e2e8f0', verticalAlign: 'top', textAlign: 'center' }}>
                                <span style={{ display: 'inline-block', background: '#fee2e2', color: '#dc2626', padding: '0.25rem 0.5rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.75rem' }}>
                                  {group.count}
                                </span>
                              </td>
                            ) : null}
                            {displayFields.map(f => (
                              <td key={f} style={{ padding: '0.5rem 1rem', color: '#334155' }}>{String(row[f] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                  <AlertCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>Không tìm thấy dữ liệu trùng lặp nào theo điều kiện đã chọn.</p>
                </div>
              )
            )}

            {/* ── Mode 2: Search value ── */}
            {filterMode === 'search' && (
              !valueSearch.trim() ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                  <Search size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Nhập giá trị cần tìm vào ô tìm kiếm bên trên</p>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>Ví dụ: gõ "Dương Minh Châu" để xem tất cả dòng có tên này</p>
                </div>
              ) : valueSearchGroups.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                  <AlertCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>Không tìm thấy dòng nào chứa &ldquo;<strong>{valueSearch}</strong>&rdquo; trong cột {primaryField}.</p>
                </div>
              ) : (
                <div style={{ padding: '0.75rem' }}>
                  {valueSearchGroups.map((group, gIdx) => {
                    const isExpanded = expandedGroups.has(group.value) || valueSearchGroups.length === 1;
                    return (
                      <div key={gIdx} style={{ marginBottom: '0.75rem', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        {/* Group Header — click to expand */}
                        <div
                          onClick={() => toggleExpandGroup(group.value)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 16px', background: '#f0f9ff',
                            cursor: 'pointer', userSelect: 'none',
                            borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                          }}
                        >
                          <span style={{ flex: 1, fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                            {group.value}
                          </span>
                          <span style={{
                            background: group.count > 1 ? '#fee2e2' : '#dcfce7',
                            color: group.count > 1 ? '#dc2626' : '#16a34a',
                            padding: '3px 12px', borderRadius: 999, fontWeight: 700, fontSize: '0.78rem',
                          }}>
                            {group.count} {group.count > 1 ? 'lượt trùng' : 'dòng'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {isExpanded ? '▲ Thu gọn' : '▼ Xem chi tiết'}
                          </span>
                        </div>

                        {/* Expanded rows */}
                        {isExpanded && (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  <th style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0', width: 40 }}>#</th>
                                  {displayFields.map(f => (
                                    <th key={f} style={{ padding: '6px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{f}</th>
                                  ))}
                                  {displayFields.length === 0 && (
                                    <th style={{ padding: '6px 12px', color: '#94a3b8', fontStyle: 'italic', borderBottom: '1px solid #e2e8f0' }}>
                                      (Chọn trường hiển thị ở cấu hình bên trên)
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.map((row, rIdx) => (
                                  <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '6px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{rIdx + 1}</td>
                                    {displayFields.map(f => (
                                      <td key={f} style={{ padding: '6px 12px', color: '#334155' }}>{String(row[f] ?? '')}</td>
                                    ))}
                                    {displayFields.length === 0 && (
                                      <td style={{ padding: '6px 12px', color: '#94a3b8', fontStyle: 'italic' }}>—</td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
            {/* ── Mode 3: Gộp theo trường ── */}
            {filterMode === 'group' && (
              groupByGroups.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                  <AlertCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>Chưa có dữ liệu để gộp.</p>
                </div>
              ) : (
                <div>
                  {/* Header bảng */}
                  <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto auto', gap: 0, padding: '8px 16px', background: '#fef3c7', borderBottom: '2px solid #fde68a', fontSize: '0.8rem', fontWeight: 700, color: '#92400e' }}>
                    <span style={{ textAlign: 'center' }}>STT</span>
                    <span>{effectiveGroupField}</span>
                    <span style={{ textAlign: 'center', minWidth: 80 }}>Số bản ghi</span>
                    <span style={{ textAlign: 'center', minWidth: 60 }}></span>
                  </div>

                  {groupByGroups.map((group, gIdx) => {
                    const isOpen = expandedGroups.has(group.value);
                    const maxCount = Math.max(...groupByGroups.map(g => g.count));
                    const ratio = group.count / maxCount;
                    const badgeBg = group.count === 1 ? '#16a34a' : ratio > 0.6 ? '#dc2626' : ratio > 0.3 ? '#d97706' : '#3b82f6';

                    return (
                      <div key={gIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {/* Hàng chính — click để mở/đóng chi tiết */}
                        <div
                          onClick={() => toggleExpandGroup(group.value)}
                          style={{
                            display: 'grid', gridTemplateColumns: '36px 1fr auto auto', alignItems: 'center', gap: 0,
                            padding: '10px 16px', cursor: 'pointer',
                            background: isOpen ? '#fffbeb' : gIdx % 2 === 0 ? 'white' : '#fafafa',
                            transition: 'background 0.15s',
                          }}
                        >
                          {/* STT */}
                          <span style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>{gIdx + 1}</span>

                          {/* Tên ngày / giá trị */}
                          <span style={{ fontWeight: isOpen ? 700 : 500, color: '#1e293b', fontSize: '0.9rem' }}>
                            {group.value}
                          </span>

                          {/* Badge số lượng */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 80 }}>
                            <span style={{
                              background: badgeBg, color: 'white',
                              borderRadius: 999, padding: '2px 10px',
                              fontSize: '0.75rem', fontWeight: 700,
                              minWidth: 28, textAlign: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }}>
                              {group.count}
                            </span>
                          </span>

                          {/* Mũi tên */}
                          <span style={{ minWidth: 60, textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {isOpen ? '▲' : '▼'}
                          </span>
                        </div>

                        {/* Chi tiết mở rộng */}
                        {isOpen && (
                          <div style={{ overflowX: 'auto', borderTop: '1px solid #fde68a', background: '#fffdf0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                              <thead>
                                <tr style={{ background: '#fef3c7' }}>
                                  <th style={{ padding: '5px 12px', textAlign: 'center', color: '#92400e', fontWeight: 600, borderBottom: '1px solid #fde68a', width: 36 }}>#</th>
                                  {displayFields.filter(f => f !== effectiveGroupField).map(f => (
                                    <th key={f} style={{ padding: '5px 12px', textAlign: 'left', color: '#78350f', fontWeight: 600, borderBottom: '1px solid #fde68a', whiteSpace: 'nowrap' }}>{f}</th>
                                  ))}
                                  {displayFields.filter(f => f !== effectiveGroupField).length === 0 && columns.filter(c => c !== effectiveGroupField).slice(0, 5).map(f => (
                                    <th key={f} style={{ padding: '5px 12px', textAlign: 'left', color: '#78350f', fontWeight: 600, borderBottom: '1px solid #fde68a', whiteSpace: 'nowrap' }}>{f}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.map((row, rIdx) => {
                                  const cols = displayFields.filter(f => f !== effectiveGroupField).length > 0
                                    ? displayFields.filter(f => f !== effectiveGroupField)
                                    : columns.filter(c => c !== effectiveGroupField).slice(0, 5);
                                  return (
                                    <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? 'white' : '#fffbeb', borderBottom: '1px solid #fef9c3' }}>
                                      <td style={{ padding: '5px 12px', textAlign: 'center', color: '#b45309', fontWeight: 600 }}>{rIdx + 1}</td>
                                      {cols.map(f => (
                                        <td key={f} style={{ padding: '5px 12px', color: '#334155' }}>{String(row[f] ?? '')}</td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
