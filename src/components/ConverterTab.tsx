import React, { useState, useCallback, useRef } from 'react';
import {
  UploadCloud, ArrowRight, Download, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, FileCode2, FileText, FileSpreadsheet,
  Settings2, Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';
import Tesseract from 'tesseract.js';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker&inline';

// Use inline worker to bypass Electron file:// protocol CORS issues
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

// ─── Types ────────────────────────────────────────────────────────────────────

type ConvertFormat = 'xlsx' | 'csv-utf8' | 'csv-utf8bom' | 'xml' | 'json' | 'docx';

interface ConvertJob {
  id: string;
  file: File;
  sourceFormat: string;
  targetFormat: ConvertFormat;
  status: 'pending' | 'converting' | 'done' | 'error';
  errorMsg?: string;
  downloadUrl?: string;
  downloadName?: string;
  rowCount?: number;
  colCount?: number;
}

const FORMAT_OPTIONS: { value: ConvertFormat; label: string; ext: string; desc: string; color: string; bg: string }[] = [
  { value: 'xlsx',        label: 'Excel (.xlsx)',    ext: 'xlsx', desc: 'Microsoft Excel — mở bằng Excel, LibreOffice', color: '#10b981', bg: '#dcfce7' },
  { value: 'csv-utf8bom', label: 'CSV UTF-8 BOM',   ext: 'csv',  desc: 'CSV chuẩn Windows — mở bằng Excel không lỗi tiếng Việt', color: '#6366f1', bg: '#ede9fe' },
  { value: 'csv-utf8',    label: 'CSV UTF-8',        ext: 'csv',  desc: 'CSV thuần UTF-8 — dùng cho hệ thống Linux/web', color: '#0ea5e9', bg: '#e0f2fe' },
  { value: 'xml',         label: 'XML',              ext: 'xml',  desc: 'XML chuẩn — dùng cho trao đổi dữ liệu hệ thống', color: '#8b5cf6', bg: '#f3e8ff' },
  { value: 'json',        label: 'JSON',             ext: 'json', desc: 'JSON — dùng cho API, lập trình', color: '#f59e0b', bg: '#fef3c7' },
  { value: 'docx',        label: 'Word (.docx)',     ext: 'docx', desc: 'Microsoft Word — dùng để chuyển đổi từ PDF sang Word', color: '#2563eb', bg: '#dbeafe' },
];

const FORMAT_ICONS: Record<string, React.ReactElement> = {
  xlsx:        <FileSpreadsheet size={16} />,
  'csv-utf8':  <FileText size={16} />,
  'csv-utf8bom': <FileText size={16} />,
  xml:         <FileCode2 size={16} />,
  json:        <FileText size={16} />,
  docx:        <FileText size={16} />,
};

// ─── Core Parse Logic ─────────────────────────────────────────────────────────

async function readToRows(file: File, sheetIndex = 0, delimiter = ','): Promise<{ rows: Record<string, unknown>[]; sheetName: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'json') {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return { rows, sheetName: 'Sheet1' };
  }

  if (ext === 'xml') {
    const text = await file.text();
    return { rows: parseXmlToRows(text), sheetName: 'Sheet1' };
  }

  if (ext === 'csv') {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let text: string;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      text = new TextDecoder('utf-8').decode(buf);
    } else {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        text = new TextDecoder('windows-1252').decode(buf);
      }
    }
    const FS = delimiter === '\\t' ? '\t' : delimiter;
    const wb = XLSX.read(text, { type: 'string', codepage: 65001, raw: true, FS });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return { rows: XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[], sheetName: wb.SheetNames[0] };
  }

  // Excel
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, codepage: 65001 });
  const sheetNames = wb.SheetNames;
  const sheetName = sheetNames[Math.min(sheetIndex, sheetNames.length - 1)];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
  return { rows, sheetName };
}

function parseXmlToRows(text: string): Record<string, unknown>[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML không hợp lệ');

  const rowTags = ['BenhNhan','BENHNHAN','HoSo','HOSO','ThanhToan','Record','record','Row','row','Item','item','patient','Patient','data','Data'];
  let elements: NodeListOf<Element> | null = null;
  for (const tag of rowTags) {
    const found = doc.querySelectorAll(tag);
    if (found.length > 0) { elements = found; break; }
  }
  if (!elements && doc.documentElement?.children?.length > 0) {
    elements = doc.querySelectorAll(doc.documentElement.children[0].tagName);
  }
  if (!elements) return [];

  return Array.from(elements).map(el => {
    const row: Record<string, unknown> = {};
    Array.from(el.attributes).forEach(a => { row[a.name] = a.value; });
    Array.from(el.children).forEach(child => {
      if (child.children.length > 0) {
        Array.from(child.children).forEach(gc => {
          row[`${child.tagName}_${gc.tagName}`] = gc.textContent?.trim() ?? '';
        });
      } else {
        row[child.tagName] = child.textContent?.trim() ?? '';
      }
    });
    return row;
  }).filter(r => Object.keys(r).length > 0);
}

// ─── Core Convert Logic ───────────────────────────────────────────────────────

function rowsToXlsx(rows: Record<string, unknown>[], sheetName: string): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto column widths
  const cols = Object.keys(rows[0] ?? {});
  ws['!cols'] = cols.map(k => ({
    wch: Math.min(50, Math.max(k.length + 2, ...rows.slice(0, 20).map(r => String(r[k] ?? '').length + 2))),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function rowsToCsvUtf8Bom(rows: Record<string, unknown>[]): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  // Add UTF-8 BOM so Excel opens correctly
  const bom = '\uFEFF';
  return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
}

function rowsToCsvUtf8(rows: Record<string, unknown>[]): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

function rowsToXml(rows: Record<string, unknown>[], rootTag = 'DanhSach', rowTag = 'BanGhi'): Blob {
  const escapeXml = (val: unknown): string => {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${rootTag}>`,
    ...rows.map(row => {
      const fields = Object.entries(row)
        .map(([k, v]) => {
          const safeKey = k.replace(/[^a-zA-Z0-9_\u00C0-\u024F]/g, '_');
          return `    <${safeKey}>${escapeXml(v)}</${safeKey}>`;
        })
        .join('\n');
      return `  <${rowTag}>\n${fields}\n  </${rowTag}>`;
    }),
    `</${rootTag}>`,
  ];
  return new Blob([lines.join('\n')], { type: 'application/xml;charset=utf-8' });
}

function rowsToJson(rows: Record<string, unknown>[]): Blob {
  return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
}

async function convertPdfToDocx(file: File): Promise<{ blob: Blob; filename: string; rowCount: number; colCount: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;
  const paragraphs = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | undefined;
    let text = '';
    
    for (const item of content.items) {
      if ('str' in item) {
        // If Y changes significantly, it's a new line
        if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 5 && text !== '') {
          text += '\n';
        }
        text += item.str;
        lastY = item.transform[5];
      }
    }

    // Fallback to OCR if standard text extraction yields almost nothing (likely a scanned PDF)
    if (text.trim().length < 15) {
      // Kiểm tra kết nối trước khi gọi Tesseract (cần tải language pack lần đầu)
      if (!navigator.onLine) {
        text = `[Trang ${i}: PDF dạng scan nhưng đang OFFLINE. ` +
          `Kết nối internet để nhận diện chữ (OCR). ` +
          `Language pack Tesseract cần ~20MB lần đầu dùng.]`;
      } else {
        try {
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;

            // OCR
            const { data } = await Tesseract.recognize(canvas, 'vie+eng');
            
            // 1. Chèn ảnh nền trang vào DOCX
            const imgBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
            const imgBuffer = await imgBlob!.arrayBuffer();
            paragraphs.push(new Paragraph({
              children: [new ImageRun({
                type: 'png',
                data: imgBuffer,
                transformation: { width: Math.floor(viewport.width / 2), height: Math.floor(viewport.height / 2) },
              })],
            }));

            // 2. Chèn đoạn văn OCR (xấp xỉ vị trí)
            const ocrData = data as unknown as { paragraphs: { bbox: { x0: number; y0: number; x1: number; y1: number }; text: string }[] };
            for (const p of ocrData.paragraphs) {
              paragraphs.push(new Paragraph({
                indent: { left: Math.floor(p.bbox.x0 / 4) }, // Xấp xỉ vị trí
                spacing: { before: 100 },
                children: [new TextRun({ text: p.text, size: 20 })],
              }));
            }
          }
        } catch (err: unknown) {
          const e = err as { message?: string };
          console.error('OCR Failed for page', i, err);
          paragraphs.push(new Paragraph({
            children: [new TextRun(`[Trang ${i}: OCR thất bại - ${e.message || 'Lỗi không xác định'}]`)],
          }));
        }
      }
    } else {
      // Normal digital PDF text parsing
      if (text.trim()) {
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun(line.trim())],
              })
            );
          }
        }
      }
    }
  }

  if (paragraphs.length === 0) {
    throw new Error('Chuyển đổi thất bại: PDF trống hoàn toàn.');
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = file.name.replace(/\.[^.]+$/, '') + '_converted.docx';
  return { blob, filename, rowCount: numPages, colCount: 0 };
}

async function convertFile(
  file: File & { path?: string },
  targetFormat: ConvertFormat,
  // Lỗi #6 fix: nhận thêm tham số xmlRootTag và xmlRowTag để tùy chỉnh
  xmlRootTag = 'DanhSach',
  xmlRowTag = 'BanGhi',
  excelSheetIndex = 0,
  csvDelimiter = ',',
): Promise<{ blob: Blob; filename: string; rowCount?: number; colCount?: number }> {
  if (file.name.toLowerCase().endsWith('.pdf')) {
    if (targetFormat !== 'docx') {
      throw new Error('Chỉ hỗ trợ chuyển từ PDF sang Word (.docx)');
    }
    
    // Check if we are running in Electron and have the native Python converter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).electronAPI && file.path) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uint8Array = await (window as any).electronAPI.convertPdfNative(file.path);
        const blob = new Blob([uint8Array], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const filename = file.name.replace(/\.[^.]+$/, '') + '_converted.docx';
        return { blob, filename, rowCount: 1, colCount: 0 };
      } catch (err) {
        console.error('Lỗi chuyển đổi bằng công cụ gốc:', err);
        // Fallback to basic JS extraction below
      }
    }

    return await convertPdfToDocx(file);
  }

  const { rows, sheetName } = await readToRows(file, excelSheetIndex, csvDelimiter);
  if (rows.length === 0) throw new Error('File không có dữ liệu hoặc không đọc được');

  const baseName = file.name.replace(/\.[^.]+$/, '');
  const meta = FORMAT_OPTIONS.find(f => f.value === targetFormat)!;
  const filename = `${baseName}_converted.${meta.ext}`;
  const colCount = Object.keys(rows[0] ?? {}).length;

  let blob: Blob;
  switch (targetFormat) {
    case 'xlsx':        blob = rowsToXlsx(rows, sheetName); break;
    case 'csv-utf8bom': blob = rowsToCsvUtf8Bom(rows); break;
    case 'csv-utf8':    blob = rowsToCsvUtf8(rows); break;
    // Lỗi #6 fix: truyền xmlRootTag và xmlRowTag từ tham số vào rowsToXml()
    case 'xml':         blob = rowsToXml(rows, xmlRootTag, xmlRowTag); break;
    case 'json':        blob = rowsToJson(rows); break;
    case 'docx':        throw new Error('Định dạng nguồn không thể chuyển thành Word');
  }

  return { blob, filename, rowCount: rows.length, colCount };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormatSelector({ value, onChange, exclude }: {
  value: ConvertFormat;
  onChange: (v: ConvertFormat) => void;
  exclude?: string;
}) {
  return (
    <div className="convert-format-grid">
      {FORMAT_OPTIONS.filter(f => f.value !== exclude).map(f => (
        <label
          key={f.value}
          className={`convert-format-card ${value === f.value ? 'selected' : ''}`}
          style={value === f.value ? { borderColor: f.color, background: f.bg } : {}}
        >
          <input type="radio" name="targetFormat" value={f.value} checked={value === f.value} onChange={() => onChange(f.value)} style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: value === f.value ? f.color : '#64748b' }}>{FORMAT_ICONS[f.value]}</span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: value === f.value ? f.color : '#1e293b' }}>{f.label}</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>{f.desc}</p>
        </label>
      ))}
    </div>
  );
}

function JobCard({ job, onRemove }: { job: ConvertJob; onRemove: () => void }) {
  const meta = FORMAT_OPTIONS.find(f => f.value === job.targetFormat)!;

  const handleDownload = () => {
    if (!job.downloadUrl || !job.downloadName) return;
    const a = document.createElement('a');
    a.href = job.downloadUrl;
    a.download = job.downloadName;
    a.click();
  };

  return (
    <div className={`convert-job-card status-${job.status}`}>
      <div className="convert-job-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {/* Source */}
          <div className="convert-file-pill">
            <FileSpreadsheet size={14} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.file.name}</span>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', flexShrink: 0 }}>{job.sourceFormat.toUpperCase()}</span>
          </div>
          <ArrowRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
          {/* Target */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: meta.bg, color: meta.color, padding: '2px 10px', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
            {FORMAT_ICONS[job.targetFormat]} {meta.label}
          </span>
        </div>

        {/* Stats */}
        {job.status === 'done' && (
          <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
            {job.rowCount?.toLocaleString()} dòng · {job.colCount} cột
          </span>
        )}
      </div>

      <div className="convert-job-actions">
        {job.status === 'pending' && (
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Chờ chuyển đổi...</span>
        )}
        {job.status === 'converting' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.78rem', color: '#6366f1' }}>Đang chuyển đổi...</span>
          </div>
        )}
        {job.status === 'done' && (
          <button className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderRadius: 8, boxShadow: 'none' }} onClick={handleDownload}>
            <Download size={15} /> Tải xuống
          </button>
        )}
        {job.status === 'error' && (
          <span style={{ fontSize: '0.78rem', color: '#ef4444', maxWidth: 200 }}>⚠ {job.errorMsg}</span>
        )}
        <button className="btn-secondary" style={{ padding: '4px 8px', color: '#94a3b8' }} onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>

      {job.status === 'done' && (
        <div style={{ gridColumn: '1/-1', marginTop: 0 }}>
          <div className="convert-success-bar">
            <CheckCircle2 size={14} style={{ color: '#10b981' }} />
            <span>Sẵn sàng tải: <strong>{job.downloadName}</strong></span>
          </div>
        </div>
      )}
      {job.status === 'error' && (
        <div style={{ gridColumn: '1/-1' }}>
          <div className="convert-error-bar">
            <AlertCircle size={14} /> {job.errorMsg}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ConverterTab() {
  const [jobs, setJobs] = useState<ConvertJob[]>([]);
  const [targetFormat, setTargetFormat] = useState<ConvertFormat>('xlsx');
  const [drag, setDrag] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [xmlRootTag, setXmlRootTag] = useState('DanhSach');
  const [xmlRowTag, setXmlRowTag] = useState('BanGhi');
  const [excelSheetIndex, setExcelSheetIndex] = useState<number>(0);
  const [csvDelimiter, setCsvDelimiter] = useState<string>(',');
  const inputRef = useRef<HTMLInputElement>(null);

  const blobUrls = useRef<Record<string, string>>({});

  const getSourceFormat = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = { xlsx: 'Excel', xls: 'Excel', csv: 'CSV', xml: 'XML', json: 'JSON', pdf: 'PDF' };
    return map[ext] ?? ext;
  };

  const addFiles = useCallback(async (rawFiles: File[]) => {
    const supported = rawFiles.filter(f => /\.(xlsx|xls|csv|xml|json|pdf)$/i.test(f.name));
    if (supported.length === 0) return;

    const newJobs: ConvertJob[] = supported.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      sourceFormat: getSourceFormat(f.name),
      targetFormat,
      status: 'pending',
    }));

    setJobs(prev => [...newJobs, ...prev]);

    // Convert immediately
    for (const job of newJobs) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'converting' } : j));
      try {
        const { blob, filename, rowCount, colCount } = await convertFile(
          job.file,
          job.targetFormat,
          xmlRootTag,
          xmlRowTag,
          excelSheetIndex,
          csvDelimiter
        );
        // Revoke old URL if exists
        if (blobUrls.current[job.id]) URL.revokeObjectURL(blobUrls.current[job.id]);
        const url = URL.createObjectURL(blob);
        blobUrls.current[job.id] = url;
        setJobs(prev => prev.map(j =>
          j.id === job.id ? { ...j, status: 'done', downloadUrl: url, downloadName: filename, rowCount, colCount } : j
        ));
      } catch (err) {
        setJobs(prev => prev.map(j =>
          j.id === job.id ? { ...j, status: 'error', errorMsg: err instanceof Error ? err.message : String(err) } : j
        ));
      }
    }
  }, [targetFormat, xmlRootTag, xmlRowTag]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeJob = useCallback((id: string) => {
    if (blobUrls.current[id]) URL.revokeObjectURL(blobUrls.current[id]);
    delete blobUrls.current[id];
    setJobs(prev => prev.filter(j => j.id !== id));
  }, []);

  const clearAll = () => {
    Object.values(blobUrls.current).forEach(URL.revokeObjectURL);
    blobUrls.current = {};
    setJobs([]);
  };

  const downloadAll = () => {
    jobs.filter(j => j.status === 'done').forEach(j => {
      if (!j.downloadUrl || !j.downloadName) return;
      const a = document.createElement('a');
      a.href = j.downloadUrl;
      a.download = j.downloadName;
      a.click();
    });
  };

  const doneCount = jobs.filter(j => j.status === 'done').length;
  const errorCount = jobs.filter(j => j.status === 'error').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Header ── */}
      <div className="converter-header">
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Chuyển Đổi Định Dạng File</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0' }}>
            Excel ↔ CSV ↔ XML ↔ JSON | PDF → Word · Hỗ trợ tiếng Việt UTF-8 đúng chuẩn
          </p>
        </div>
        {jobs.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {doneCount > 1 && (
              <button className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', boxShadow: 'none', borderRadius: 8 }} onClick={downloadAll}>
                <Download size={15} /> Tải tất cả ({doneCount})
              </button>
            )}
            <button className="btn-secondary" style={{ fontSize: '0.78rem' }} onClick={clearAll}>
              <Trash2 size={14} /> Xóa tất cả
            </button>
          </div>
        )}
      </div>

      {/* ── Target Format Selector ── */}
      <div className="converter-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Chuyển đổi sang định dạng:
          </h3>
          <button className="btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setShowOptions(!showOptions)}>
            <Settings2 size={13} /> Tùy chọn XML {showOptions ? '▲' : '▼'}
          </button>
        </div>

        <FormatSelector value={targetFormat} onChange={setTargetFormat} />

        {showOptions && targetFormat === 'xml' && (
          <div className="converter-xml-options">
            <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
              <Info size={13} /> Tùy chỉnh tên tag XML
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Tag gốc (root)</span>
                <input
                  className="search-input"
                  style={{ width: '100%' }}
                  value={xmlRootTag}
                  onChange={e => setXmlRootTag(e.target.value || 'DanhSach')}
                  placeholder="DanhSach"
                />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Tag hàng (row)</span>
                <input
                  className="search-input"
                  style={{ width: '100%' }}
                  value={xmlRowTag}
                  onChange={e => setXmlRowTag(e.target.value || 'BanGhi')}
                  placeholder="BanGhi"
                />
              </label>
            </div>
          </div>
        )}

        {showOptions && (targetFormat === 'xlsx' || targetFormat === 'csv-utf8' || targetFormat === 'csv-utf8bom') && (
          <div className="converter-xml-options">
            <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
              <Info size={13} /> Tùy chỉnh đọc file
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {targetFormat === 'xlsx' && (
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Sheet Index (0 = đầu)</span>
                  <input
                    type="number"
                    className="search-input"
                    style={{ width: '100%' }}
                    value={excelSheetIndex}
                    onChange={e => setExcelSheetIndex(parseInt(e.target.value) || 0)}
                  />
                </label>
              )}
              {(targetFormat === 'csv-utf8' || targetFormat === 'csv-utf8bom') && (
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Dấu phân cách</span>
                  <select
                    className="search-input"
                    style={{ width: '100%' }}
                    value={csvDelimiter}
                    onChange={e => setCsvDelimiter(e.target.value)}
                  >
                    <option value=",">Dấu phẩy (,)</option>
                    <option value=";">Dấu chấm phẩy (;)</option>
                    <option value="\t">Tab (\t)</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Drop Zone ── */}
      <div
        className={`converter-dropzone ${drag ? 'drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.xml,.json,.pdf"
          style={{ display: 'none' }}
          onChange={e => e.target.files && addFiles(Array.from(e.target.files))}
        />
        <UploadCloud size={36} style={{ color: '#6366f1', marginBottom: '0.5rem' }} />
        <p style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}>
          Kéo thả hoặc click chọn file để chuyển đổi
        </p>
        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
          Excel · CSV · XML · JSON · PDF → <strong style={{ color: FORMAT_OPTIONS.find(f=>f.value===targetFormat)?.color }}>
            {FORMAT_OPTIONS.find(f => f.value === targetFormat)?.label}
          </strong>
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: '0.875rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {['.xlsx', '.xls', '.csv', '.xml', '.json', '.pdf'].map(ext => (
            <span key={ext} style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 500 }}>{ext}</span>
          ))}
        </div>
      </div>

      {/* ── Encoding notice ── */}
      <div className="encoding-notice">
        <Info size={14} style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '0.78rem' }}>
          <strong>Ghi chú mã hóa:</strong> &nbsp;
          <span style={{ color: '#6366f1' }}>CSV UTF-8 BOM</span> → Mở bằng Excel không lỗi tiếng Việt &nbsp;|&nbsp;
          <span style={{ color: '#0ea5e9' }}>CSV UTF-8</span> → Dùng cho hệ thống web/Linux &nbsp;|&nbsp;
          <span style={{ color: '#10b981' }}>Excel (.xlsx)</span> → Giữ nguyên format, hỗ trợ đa ngôn ngữ
        </div>
      </div>

      {/* ── Summary bar ── */}
      {jobs.length > 0 && (
        <div className="convert-summary">
          <span>Tổng: <strong>{jobs.length}</strong> file</span>
          {doneCount > 0 && <span style={{ color: '#10b981' }}>✓ Xong: <strong>{doneCount}</strong></span>}
          {jobs.filter(j => j.status === 'converting').length > 0 && (
            <span style={{ color: '#6366f1' }}>⟳ Đang xử lý: <strong>{jobs.filter(j=>j.status==='converting').length}</strong></span>
          )}
          {errorCount > 0 && <span style={{ color: '#ef4444' }}>✕ Lỗi: <strong>{errorCount}</strong></span>}
        </div>
      )}

      {/* ── Jobs List ── */}
      {jobs.length === 0 && (
        <div className="empty-state" style={{ padding: '2rem' }}>
          <ArrowRight size={44} opacity={0.15} />
          <p style={{ fontSize: '0.875rem', textAlign: 'center', maxWidth: 360 }}>
            Chưa có file nào. Chọn định dạng đích rồi kéo thả file vào ô trên.
          </p>
        </div>
      )}

      {jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onRemove={() => removeJob(job.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
