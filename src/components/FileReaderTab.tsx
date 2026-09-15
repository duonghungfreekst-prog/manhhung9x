import React, { useState, useCallback, useRef } from 'react';
import {
  UploadCloud, FileCode2, FileText, FileSpreadsheet,
  Table2, Eye, Download, Trash2, Search, ChevronDown,
  ChevronUp, Info, Copy, CheckCheck, AlertCircle,
  RefreshCw, Wand2, X, ArrowRight, CheckCircle2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { startGlobalLoading, stopGlobalLoading } from '../utils/globalLoading';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedFile {
  id: string;
  name: string;
  format: 'xml' | 'csv' | 'excel';
  size: string;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
  rawText?: string;
  parsedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const format: ParsedFile['format'] = ext === 'xml' ? 'xml' : ext === 'csv' ? 'csv' : 'excel';

  let rawText: string | undefined;
  let rows: Record<string, unknown>[];
  if (format === 'xml') {
    rawText = await file.text();
    rows = parseXml(rawText);
  } else if (format === 'csv') {
    rawText = await file.text();
    rows = parseCsv(rawText);
  } else {
    rows = await parseExcel(file);
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    format,
    size: formatFileSize(file.size),
    rowCount: rows.length,
    columns,
    rows,
    rawText,
    parsedAt: new Date().toLocaleString('vi-VN'),
  };
}

function parseXml(text: string): Record<string, unknown>[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) return [];

  const rowTags = [
    'BenhNhan', 'BENHNHAN', 'HoSo', 'HOSO', 'ThanhToan',
    'Record', 'record', 'Row', 'row', 'Item', 'item', 'patient', 'Patient',
  ];

  let elements: NodeListOf<Element> | null = null;
  for (const tag of rowTags) {
    const found = doc.querySelectorAll(tag);
    if (found.length > 0) { elements = found; break; }
  }
  if (!elements && doc.documentElement?.children?.length > 0) {
    const firstChildTag = doc.documentElement.children[0].tagName;
    elements = doc.querySelectorAll(firstChildTag);
  }
  if (!elements) return [];

  return Array.from(elements).map(el => {
    const row: Record<string, unknown> = {};
    // Attributes
    Array.from(el.attributes).forEach(attr => { row[`@${attr.name}`] = attr.value; });
    // Children
    Array.from(el.children).forEach(child => {
      if (child.children.length > 0) {
        Array.from(child.children).forEach(gc => {
          row[`${child.tagName}.${gc.tagName}`] = gc.textContent?.trim() ?? '';
        });
      } else {
        row[child.tagName] = child.textContent?.trim() ?? '';
      }
    });
    return row;
  }).filter(r => Object.keys(r).length > 0);
}

function parseCsv(text: string): Record<string, unknown>[] {
  const wb = XLSX.read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
}

async function parseExcel(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

const FORMAT_META = {
  xml:   { icon: <FileCode2 size={18}/>,    color: '#6366f1', bg: '#ede9fe', label: 'XML' },
  csv:   { icon: <FileText size={18}/>,     color: '#f59e0b', bg: '#fef3c7', label: 'CSV' },
  excel: { icon: <FileSpreadsheet size={18}/>, color: '#10b981', bg: '#dcfce7', label: 'Excel' },
};

function FormatBadge({ format }: { format: ParsedFile['format'] }) {
  const m = FORMAT_META[format];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: m.bg, color: m.color,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 700,
    }}>
      {m.icon} {m.label}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-secondary"
      style={{ fontSize: '0.75rem', padding: '3px 8px' }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <><CheckCheck size={13}/> Đã copy</> : <><Copy size={13}/> Copy</>}
    </button>
  );
}

// File Drop Zone
function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    onFiles(Array.from(e.dataTransfer.files));
  }, [onFiles]);

  return (
    <div
      className={`reader-dropzone ${drag ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xml,.csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
      />
      <UploadCloud size={40} style={{ color: '#6366f1', marginBottom: '0.75rem' }} />
      <p style={{ fontWeight: 600, color: '#1e293b', fontSize: '1rem' }}>
        Kéo thả hoặc click để chọn tệp
      </p>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
        Hỗ trợ: <strong>XML</strong> · <strong>CSV</strong> · <strong>Excel (.xlsx, .xls)</strong>
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {(['xml', 'csv', 'excel'] as const).map(f => <FormatBadge key={f} format={f} />)}
      </div>
    </div>
  );
}

// Data table viewer
function DataViewer({ file, searchQ }: { file: ParsedFile; searchQ: string }) {
  const [page, setPage] = useState(1);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(file.columns));
  const [showColPicker, setShowColPicker] = useState(false);
  const PAGE_SIZE = 20;

  const filtered = file.rows.filter(row =>
    !searchQ || Object.values(row).some(v => String(v).toLowerCase().includes(searchQ.toLowerCase()))
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cols = file.columns.filter(c => visibleCols.has(c));

  const exportFiltered = () => {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dữ liệu');
    XLSX.writeFile(wb, `${file.name.replace(/\.[^.]+$/, '')}_export.xlsx`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          <strong>{filtered.length}</strong> / {file.rowCount} dòng
          {searchQ && ` (đang lọc)`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <button
              className="btn-secondary"
              style={{ fontSize: '0.75rem' }}
              onClick={() => setShowColPicker(!showColPicker)}
            >
              <Table2 size={14}/> Cột ({visibleCols.size}/{file.columns.length}) <ChevronDown size={12}/>
            </button>
            {showColPicker && (
              <div className="col-picker">
                <div style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.8rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                  Chọn cột hiển thị
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#6366f1' }}
                    onClick={() => setVisibleCols(new Set(file.columns))}>Tất cả</button>
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0.25rem' }}>
                  {file.columns.map(col => (
                    <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', cursor: 'pointer', borderRadius: 4, fontSize: '0.78rem' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <input
                        type="checkbox"
                        checked={visibleCols.has(col)}
                        onChange={() => {
                          const next = new Set(visibleCols);
                          if (next.has(col)) { if (next.size > 1) next.delete(col); }
                          else next.add(col);
                          setVisibleCols(next);
                        }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="btn-secondary" style={{ fontSize: '0.75rem' }} onClick={exportFiltered}>
            <Download size={14}/> Xuất Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="reader-table-wrap">
        <table className="reader-table">
          <thead>
            <tr>
              <th style={{ width: 45, textAlign: 'center', color: '#94a3b8' }}>#</th>
              {cols.map(col => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                  {(page - 1) * PAGE_SIZE + i + 1}
                </td>
                {cols.map(col => {
                  const val = String(row[col] ?? '');
                  const isHighlight = searchQ && val.toLowerCase().includes(searchQ.toLowerCase());
                  return (
                    <td key={col} title={val} style={isHighlight ? { background: '#fef9c3' } : {}}>
                      <span style={{ display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {val || <span style={{ color: '#cbd5e1' }}>—</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <span className="pagination-info">Trang {page}/{totalPages} · {filtered.length} dòng</span>
          <div className="pagination-controls">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              return <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>;
            })}
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RawViewer({ text, filename }: { text: string; filename: string }) {
  const [show, setShow] = useState(false);
  
  const getSafePreview = (str: string, limit: number) => {
    if (str.length <= limit) return str;
    const sub = str.slice(0, limit);
    const lastNewline = sub.lastIndexOf('\n');
    return lastNewline > limit * 0.8 ? sub.slice(0, lastNewline) : sub;
  };

  const preview = getSafePreview(text, 3000);
  return (
    <div>
      <button className="btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => setShow(!show)}>
        {show ? <><ChevronUp size={14}/> Ẩn nội dung thô</> : <><Eye size={14}/> Xem nội dung thô</>}
      </button>
      {show && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{filename} — {text.length.toLocaleString()} ký tự</span>
            <CopyBtn text={text} />
          </div>
          <pre className="raw-viewer">{preview}{text.length > 3000 ? '\n...(còn nữa)' : ''}</pre>
        </div>
      )}
    </div>
  );
}

// Column info
function ColumnInfo({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false);
  const stats = columns.map(col => {
    const vals = rows.map(r => r[col]);
    const nonEmpty = vals.filter(v => v !== '' && v != null).length;
    const unique = new Set(vals.map(String)).size;
    const sample = vals.find(v => v !== '' && v != null);
    return { col, nonEmpty, unique, fill: Math.round((nonEmpty / rows.length) * 100), sample };
  });

  return (
    <div>
      <button className="btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => setOpen(!open)}>
        <Info size={14}/> {open ? 'Ẩn' : 'Phân tích'} {columns.length} cột
        {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      </button>
      {open && (
        <div className="col-analysis">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {['Tên cột', 'Có dữ liệu', '% điền', 'Unique', 'Mẫu'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.72rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.col} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '5px 10px', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.col}</td>
                  <td style={{ padding: '5px 10px' }}>{s.nonEmpty}/{rows.length}</td>
                  <td style={{ padding: '5px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${s.fill}%`, height: '100%', background: s.fill > 80 ? '#10b981' : s.fill > 40 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{s.fill}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '5px 10px' }}>{s.unique}</td>
                  <td style={{ padding: '5px 10px', color: '#64748b', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(s.sample ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Format Converter Modal ──────────────────────────────────────────────────

const TARGET_FORMATS = [
  { key: 'xlsx', label: 'Excel (.xlsx)', icon: <FileSpreadsheet size={16}/>, color: '#10b981', bg: '#dcfce7' },
  { key: 'csv',  label: 'CSV (.csv)',    icon: <FileText size={16}/>,        color: '#f59e0b', bg: '#fef3c7' },
  { key: 'xml',  label: 'XML (.xml)',    icon: <FileCode2 size={16}/>,       color: '#6366f1', bg: '#ede9fe' },
  { key: 'json', label: 'JSON (.json)',  icon: <FileCode2 size={16}/>,       color: '#0ea5e9', bg: '#e0f2fe' },
] as const;
type TargetFmt = typeof TARGET_FORMATS[number]['key'];

function rowsToXml(rows: Record<string, unknown>[], rootTag = 'Data', rowTag = 'Row'): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const lines = rows.map(r => {
    const children = Object.entries(r).map(([k, v]) => `    <${k}>${esc(String(v ?? ''))}</${k}>`).join('\n');
    return `  <${rowTag}>\n${children}\n  </${rowTag}>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${lines.join('\n')}\n</${rootTag}>`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ConvertModal({ file, onClose }: { file: ParsedFile; onClose: () => void }) {
  const [target, setTarget] = useState<TargetFmt>('xlsx');
  const [done, setDone] = useState(false);
  const baseName = file.name.replace(/\.[^.]+$/, '');

  const handleConvert = () => {
    const rows = file.rows;
    if (target === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, `${baseName}_converted.xlsx`);
    } else if (target === 'csv') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      download(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' }), `${baseName}_converted.csv`);
    } else if (target === 'xml') {
      const xml = rowsToXml(rows, 'Data', 'Row');
      download(new Blob([xml], { type: 'text/xml;charset=utf-8' }), `${baseName}_converted.xml`);
    } else if (target === 'json') {
      download(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), `${baseName}_converted.json`);
    }
    setDone(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
      backdropFilter: 'blur(3px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '1.75rem', width: 460, maxWidth: '95vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{ background: '#ede9fe', padding: '0.5rem', borderRadius: 10, color: '#6366f1' }}>
              <RefreshCw size={18}/>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>Chuyển đổi định dạng</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{file.name} · {file.rowCount} dòng</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Source → target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 10 }}>
          <FormatBadge format={file.format} />
          <ArrowRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Chọn định dạng đích bên dưới</span>
        </div>

        {/* Format grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.25rem' }}>
          {TARGET_FORMATS.map(f => (
            <button
              key={f.key}
              onClick={() => { setTarget(f.key); setDone(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.75rem 1rem', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${target === f.key ? f.color : '#e2e8f0'}`,
                background: target === f.key ? f.bg : '#fff',
                fontWeight: target === f.key ? 700 : 500,
                fontSize: '0.85rem', color: target === f.key ? f.color : '#475569',
                transition: 'all 0.15s', fontFamily: 'inherit',
                boxShadow: target === f.key ? `0 0 0 3px ${f.color}22` : 'none',
              }}
            >
              <span style={{ color: f.color }}>{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        {done ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', background: '#dcfce7', borderRadius: 10, color: '#166534', fontWeight: 600 }}>
            <CheckCircle2 size={18}/> Đã tải xuống thành công!
          </div>
        ) : (
          <button
            onClick={handleConvert}
            style={{
              width: '100%', padding: '0.875rem', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff',
              fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
              fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = '')}
          >
            <Download size={16}/> Chuyển đổi &amp; Tải xuống
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Auto-Fix Engine ──────────────────────────────────────────────────────────

function autoFix(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; report: string[] } {
  const report: string[] = [];
  let trimmed = 0, emptyRemoved = 0, colFixed = 0;

  // 1. Remove completely empty rows
  const withData = rows.filter(r => {
    const empty = Object.values(r).every(v => v === '' || v == null);
    if (empty) emptyRemoved++;
    return !empty;
  });

  // 2. Trim all string values
  const fixed = withData.map(r => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'string') {
        const t = v.trim();
        if (t !== v) trimmed++;
        out[k] = t;
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  // 3. Re-key: normalize column names (trim whitespace)
  // Lỗi #7 fix: lấy sampleKeys từ fixed[0] (sau khi đã filter) thay vì rows[0] gốc
  const sampleKeys = Object.keys(fixed[0] ?? {});
  const normalized = fixed.map(r => {
    const out: Record<string, unknown> = {};
    for (const k of sampleKeys) {
      const nk = k.trim();
      if (nk !== k) colFixed++;
      out[nk] = r[k] ?? r[nk];
    }
    return out;
  });

  if (emptyRemoved) report.push(`✅ Đã xóa ${emptyRemoved} dòng trống`);
  if (trimmed) report.push(`✅ Đã cắt khoảng trắng ${trimmed} ô`);
  if (colFixed > 0) report.push(`✅ Đã chuẩn hóa tên cột`);
  if (!report.length) report.push('✅ Dữ liệu đã sạch, không cần sửa');

  return { rows: normalized, report };
}

// Single file card
function FileCard({ file, onRemove, onUpdate }: {
  file: ParsedFile;
  onRemove: () => void;
  onUpdate: (updated: ParsedFile) => void;
}) {
  const [tab, setTab] = useState<'table' | 'raw' | 'columns'>('table');
  const [search, setSearch] = useState('');
  const [showConvert, setShowConvert] = useState(false);
  const [fixReport, setFixReport] = useState<string[] | null>(null);

  const handleAutoFix = () => {
    const { rows, report } = autoFix(file.rows);
    const updatedColumns = rows.length > 0 ? Object.keys(rows[0]) : file.columns;
    onUpdate({ ...file, rows, columns: updatedColumns, rowCount: rows.length });
    setFixReport(report);
    setTimeout(() => setFixReport(null), 4000);
  };

  return (
    <>
      {showConvert && <ConvertModal file={file} onClose={() => setShowConvert(false)} />}
      <div className="reader-card">
        {/* Card Header */}
        <div className="reader-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
            <FormatBadge format={file.format} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 2 }}>
                <span>📄 {file.rowCount.toLocaleString()} dòng</span>
                <span>📊 {file.columns.length} cột</span>
                <span>💾 {file.size}</span>
                <span>🕐 {file.parsedAt}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
            {/* Auto-fix button */}
            <button
              className="btn-secondary"
              style={{ fontSize: '0.78rem', color: '#d97706', borderColor: '#fcd34d', background: '#fffbeb' }}
              onClick={handleAutoFix}
              title="Tự động căn sửa: trim khoảng trắng, xóa dòng trống, chuẩn hóa cột"
            >
              <Wand2 size={14}/> Tự động sửa
            </button>
            {/* Convert button */}
            <button
              className="btn-secondary"
              style={{ fontSize: '0.78rem', color: '#6366f1', borderColor: '#c7d2fe', background: '#eff0ff' }}
              onClick={() => setShowConvert(true)}
              title="Chuyển đổi sang định dạng khác"
            >
              <RefreshCw size={14}/> Chuyển định dạng
            </button>
            <div className="search-input-wrapper" style={{ width: 180 }}>
              <Search size={13} className="search-icon" />
              <input
                className="search-input"
                type="text"
                placeholder="Tìm kiếm..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="btn-secondary" style={{ color: '#ef4444', padding: '4px 8px' }} onClick={onRemove}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Auto-fix report */}
        {fixReport && (
          <div style={{
            padding: '0.6rem 1.25rem', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0',
            display: 'flex', gap: '1rem', flexWrap: 'wrap',
          }}>
            {fixReport.map((r, i) => (
              <span key={i} style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 500 }}>{r}</span>
            ))}
          </div>
        )}

        {/* Tabs inside card */}
        <div className="reader-card-tabs">
          {([
            { key: 'table',   icon: <Table2 size={14}/>, label: 'Bảng dữ liệu' },
            { key: 'columns', icon: <Info size={14}/>,   label: 'Phân tích cột' },
            ...(file.rawText ? [{ key: 'raw', icon: <Eye size={14}/>, label: 'Nội dung thô' }] : []),
          ] as { key: typeof tab; icon: React.ReactElement; label: string }[]).map(t => (
            <button
              key={t.key}
              className={`reader-inner-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="reader-card-body">
          {tab === 'table'   && <DataViewer file={file} searchQ={search} />}
          {tab === 'columns' && <ColumnInfo columns={file.columns} rows={file.rows} />}
          {tab === 'raw'     && file.rawText && <RawViewer text={file.rawText} filename={file.name} />}
        </div>
      </div>
    </>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

// ─── Main Export ─────────────────────────────────────────────────────────────

export function FileReaderTab() {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (rawFiles: File[]) => {
    setLoading(true);
    setError(null);
    startGlobalLoading('file-reader', `Đang giải mã và phân tích cấu trúc ${rawFiles.length} tệp tin...`);
    try {
      const parsed = await Promise.all(rawFiles.map(parseFile));
      setFiles(prev => [...parsed, ...prev]);
    } catch (err) {
      setError(`Không thể đọc file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
      stopGlobalLoading('file-reader');
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const updateFile = useCallback((updated: ParsedFile) => {
    setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
      {/* Drop Zone */}
      <DropZone onFiles={handleFiles} />

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <div className="spinner" style={{ borderTopColor: '#3b82f6', borderColor: '#bfdbfe' }} />
          <span style={{ color: '#1d4ed8', fontSize: '0.875rem' }}>Đang phân tích file...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.875rem' }}>
          <AlertCircle size={18} /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
        </div>
      )}

      {/* Files */}
      {files.length === 0 && !loading && (
        <div className="empty-state" style={{ padding: '2rem' }}>
          <FileCode2 size={48} opacity={0.2} />
          <p style={{ fontSize: '0.9rem' }}>Chưa có file nào được tải lên. Hỗ trợ XML, CSV và Excel.</p>
        </div>
      )}

      {files.map(f => (
        <FileCard key={f.id} file={f} onRemove={() => removeFile(f.id)} onUpdate={updateFile} />
      ))}
    </div>
  );
}
