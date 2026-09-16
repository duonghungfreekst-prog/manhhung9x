import React, { useState, useCallback, useRef } from 'react';
import {
  UploadCloud, ArrowRight, Download, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, FileCode2, FileText, FileSpreadsheet,
  Settings2, Info, Database, Globe, Image as ImageIcon,
  FileType, Layers, Eye, RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  Table, TableRow, TableCell, WidthType, HeadingLevel
} from 'docx';
import JSZip from 'jszip';
import Tesseract from 'tesseract.js';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker&inline';
import { startGlobalLoading, stopGlobalLoading } from '../utils/globalLoading';
import { showToast } from '../utils/notificationSystem';

// Use inline worker to bypass Electron file:// protocol CORS issues
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

// ─── Types ────────────────────────────────────────────────────────────────────

type ConvertFormat =
  | 'xlsx'
  | 'csv-utf8bom'
  | 'csv-utf8'
  | 'docx'
  | 'pdf'
  | 'txt'
  | 'html'
  | 'sql'
  | 'xml'
  | 'json'
  | 'md'
  | 'png';

type FormatCategory = 'all' | 'table' | 'doc' | 'dev';

interface FormatOption {
  value: ConvertFormat;
  label: string;
  ext: string;
  category: 'table' | 'doc' | 'dev';
  desc: string;
  color: string;
  bg: string;
}

interface ConvertJob {
  id: string;
  file: File & { path?: string };
  sourceFormat: string;
  targetFormat: ConvertFormat;
  status: 'pending' | 'converting' | 'done' | 'error';
  errorMsg?: string;
  downloadUrl?: string;
  downloadName?: string;
  rowCount?: number;
  colCount?: number;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'xlsx',        label: 'Excel (.xlsx)',    ext: 'xlsx', category: 'table', desc: 'Microsoft Excel — mở bằng Excel, Google Sheets, LibreOffice', color: '#10b981', bg: '#dcfce7' },
  { value: 'csv-utf8bom', label: 'CSV UTF-8 BOM',   ext: 'csv',  category: 'table', desc: 'CSV chuẩn Windows — mở bằng Excel tiếng Việt không lỗi font', color: '#6366f1', bg: '#ede9fe' },
  { value: 'csv-utf8',    label: 'CSV UTF-8',        ext: 'csv',  category: 'table', desc: 'CSV thuần UTF-8 — dùng cho hệ thống Linux, máy chủ web',    color: '#0ea5e9', bg: '#e0f2fe' },
  { value: 'docx',        label: 'Word (.docx)',     ext: 'docx', category: 'doc',   desc: 'Microsoft Word — chuyển PDF sang Word hoặc tạo Bảng biểu Word', color: '#2563eb', bg: '#dbeafe' },
  { value: 'pdf',         label: 'PDF (.pdf)',       ext: 'pdf',  category: 'doc',   desc: 'Tài liệu PDF chuẩn A4 — in ấn, báo cáo, lưu trữ tài liệu',    color: '#dc2626', bg: '#fee2e2' },
  { value: 'txt',         label: 'Văn bản (.txt)',   ext: 'txt',  category: 'doc',   desc: 'Văn bản thuần hoặc bảng TSV phân cách Tab cho máy xét nghiệm/HIS', color: '#475569', bg: '#f1f5f9' },
  { value: 'html',        label: 'Trang Web (.html)',ext: 'html', category: 'doc',   desc: 'Trang HTML bảng biểu tương tác, xem trực tiếp & in ấn dễ dàng', color: '#ea580c', bg: '#ffedd5' },
  { value: 'sql',         label: 'SQL Script (.sql)',ext: 'sql',  category: 'dev',   desc: 'Sinh lệnh INSERT INTO chia lô cho SQL Server / MySQL',        color: '#0284c7', bg: '#e0f2fe' },
  { value: 'xml',         label: 'XML',              ext: 'xml',  category: 'table', desc: 'XML chuẩn — tùy biến thẻ gốc và thẻ hàng trao đổi dữ liệu',   color: '#8b5cf6', bg: '#f3e8ff' },
  { value: 'json',        label: 'JSON',             ext: 'json', category: 'table', desc: 'JSON chuẩn — dùng cho lập trình viên, gọi API, Webhook',      color: '#f59e0b', bg: '#fef3c7' },
  { value: 'md',          label: 'Markdown (.md)',   ext: 'md',   category: 'dev',   desc: 'Bảng Markdown — viết tài liệu GitHub, Notion, Obsidian',      color: '#334155', bg: '#e2e8f0' },
  { value: 'png',         label: 'Ảnh (.png)',       ext: 'png',  category: 'dev',   desc: 'Xuất các trang PDF thành file ảnh PNG độ nét cao (hoặc ZIP)', color: '#c026d3', bg: '#fae8ff' },
];

const FORMAT_ICONS: Record<ConvertFormat, React.ReactElement> = {
  xlsx:        <FileSpreadsheet size={16} />,
  'csv-utf8bom': <FileText size={16} />,
  'csv-utf8':  <FileText size={16} />,
  docx:        <FileType size={16} />,
  pdf:         <FileText size={16} />,
  txt:         <FileText size={16} />,
  html:        <Globe size={16} />,
  sql:         <Database size={16} />,
  xml:         <FileCode2 size={16} />,
  json:        <FileCode2 size={16} />,
  md:          <FileCode2 size={16} />,
  png:         <ImageIcon size={16} />,
};

// ─── Helpers: Trích xuất file nguồn sang Rows ────────────────────────────────

async function readToRows(
  file: File,
  sheetIndex = 0,
  delimiter = ','
): Promise<{ rows: Record<string, unknown>[]; sheetName: string }> {
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

  if (ext === 'docx') {
    return await readDocxToRows(file);
  }

  if (ext === 'html' || ext === 'htm') {
    const text = await file.text();
    const wb = XLSX.read(text, { type: 'string' });
    const sheetName = wb.SheetNames[0] || 'HTML_Data';
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
    return { rows, sheetName };
  }

  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
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
    
    let FS = delimiter === '\\t' ? '\t' : delimiter;
    if (ext === 'tsv') FS = '\t';
    else if (ext === 'txt' && delimiter === ',') {
      if (text.includes('\t')) FS = '\t';
      else if (text.includes('|')) FS = '|';
      else if (text.includes(';')) FS = ';';
    }

    try {
      const wb = XLSX.read(text, { type: 'string', codepage: 65001, raw: true, FS });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      if (rows.length > 0) return { rows, sheetName: wb.SheetNames[0] || 'Sheet1' };
    } catch {
      // Fallback
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = lines.map((line, idx) => ({ STT: idx + 1, NoiDung: line }));
    return { rows, sheetName: 'TextData' };
  }

  // Excel (.xlsx, .xls)
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, codepage: 65001 });
  const sheetNames = wb.SheetNames;
  const sheetName = sheetNames[Math.min(sheetIndex, sheetNames.length - 1)] || 'Sheet1';
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
  return { rows, sheetName };
}

function parseXmlToRows(text: string): Record<string, unknown>[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Cú pháp XML không hợp lệ');

  const rowTags = [
    'BenhNhan','BENHNHAN','HoSo','HOSO','ThanhToan','Record','record',
    'Row','row','Item','item','patient','Patient','data','Data','BanGhi'
  ];
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

async function readDocxToRows(file: File): Promise<{ rows: Record<string, unknown>[]; sheetName: string }> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXml = zip.file('word/document.xml');
  if (!docXml) throw new Error('File DOCX không hợp lệ (không tìm thấy cấu trúc word/document.xml)');

  const xmlText = await docXml.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // Kiểm tra bảng <w:tbl> trong docx
  const tables = doc.querySelectorAll('tbl');
  if (tables.length > 0) {
    const tbl = tables[0];
    const trs = Array.from(tbl.querySelectorAll('tr'));
    if (trs.length > 0) {
      const allRowsData: string[][] = [];
      trs.forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('tc')).map(tc => {
          return Array.from(tc.querySelectorAll('t')).map(t => t.textContent || '').join('').trim();
        });
        allRowsData.push(cells);
      });

      if (allRowsData.length > 1) {
        const headers = allRowsData[0].map((h, idx) => h || `Cot_${idx + 1}`);
        const rows = allRowsData.slice(1).map(row => {
          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            obj[h] = row[idx] ?? '';
          });
          return obj;
        });
        return { rows, sheetName: 'WordTable' };
      }
    }
  }

  // Không có bảng -> đọc các đoạn <w:p>
  const ps = Array.from(doc.querySelectorAll('p'));
  const lines: string[] = [];
  ps.forEach(p => {
    const text = Array.from(p.querySelectorAll('t')).map(t => t.textContent || '').join('').trim();
    if (text) lines.push(text);
  });

  if (lines.length === 0) throw new Error('File Word trống hoặc không có nội dung văn bản');

  const rows = lines.map((line, idx) => ({
    STT: idx + 1,
    'NoiDung': line,
  }));
  return { rows, sheetName: 'WordDoc' };
}

// ─── PDF Parsing & Conversion ────────────────────────────────────────────────

async function convertPdfToRows(file: File): Promise<{ rows: Record<string, unknown>[]; sheetName: string }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;
  const allLines: string[][] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    
    // Gom các item theo tọa độ dòng Y
    const lineMap: Map<number, { x: number; text: string }[]> = new Map();
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        const y = Math.round(item.transform[5] / 4) * 4;
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y)!.push({ x: item.transform[4], text: item.str });
      }
    }

    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const colsInLine: string[] = [];
      let currentCell = '';
      let prevX = -1;
      for (const it of items) {
        if (prevX >= 0 && (it.x - prevX > 25)) {
          colsInLine.push(currentCell.trim());
          currentCell = it.text;
        } else {
          currentCell += (currentCell ? ' ' : '') + it.text;
        }
        prevX = it.x + it.text.length * 5;
      }
      if (currentCell.trim()) colsInLine.push(currentCell.trim());
      if (colsInLine.length > 0) allLines.push(colsInLine);
    }
  }

  if (allLines.length === 0) {
    throw new Error('Không phát hiện dữ liệu bảng trong PDF (có thể là file scan, hãy dùng tính năng chuyển sang Word với OCR)');
  }

  let maxCols = 0;
  let maxColIdx = 0;
  const scanLimit = Math.min(30, allLines.length);
  for (let i = 0; i < scanLimit; i++) {
    if (allLines[i].length > maxCols) {
      maxCols = allLines[i].length;
      maxColIdx = i;
    }
  }
  const headers = allLines[maxColIdx].map((h, idx) => h || `Cot_${idx + 1}`);
  let overallMaxCols = headers.length;
  for (const r of allLines) {
    if (r.length > overallMaxCols) overallMaxCols = r.length;
  }
  while (headers.length < overallMaxCols) {
    headers.push(`Cot_${headers.length + 1}`);
  }
  const dataRows = allLines.filter((_, idx) => idx !== maxColIdx);

  const rows = dataRows.map(r => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });

  return { rows, sheetName: 'PDF_Data' };
}

async function convertPdfToTxt(file: File): Promise<{ blob: Blob; filename: string; rowCount: number; colCount: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;
  const textPages: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | undefined;
    let pageText = '';
    
    for (const item of content.items) {
      if ('str' in item) {
        if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 5 && pageText !== '') {
          pageText += '\r\n';
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
    }
    textPages.push(`--- TRANG ${i}/${numPages} ---\r\n` + pageText.trim());
  }

  const fullText = textPages.join('\r\n\r\n');
  const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
  const filename = file.name.replace(/\.[^.]+$/, '') + '_converted.txt';
  return { blob, filename, rowCount: numPages, colCount: 1 };
}

async function convertPdfToPng(file: File): Promise<{ blob: Blob; filename: string; rowCount: number; colCount: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;

  if (numPages === 1) {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport } as any).promise;

    const imgBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Lỗi xuất blob ảnh')), 'image/png');
    });
    const filename = file.name.replace(/\.[^.]+$/, '') + '_trang1.png';
    return { blob: imgBlob, filename, rowCount: 1, colCount: 1 };
  }

  const zip = new JSZip();
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport } as any).promise;

    const imgBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
    if (imgBlob) {
      const arrBuf = await imgBlob.arrayBuffer();
      zip.file(`trang_${i}.png`, arrBuf);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = file.name.replace(/\.[^.]+$/, '') + '_tat_ca_anh.zip';
  return { blob: zipBlob, filename, rowCount: numPages, colCount: 1 };
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
        if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 5 && text !== '') {
          text += '\n';
        }
        text += item.str;
        lastY = item.transform[5];
      }
    }

    if (text.trim().length < 15) {
      if (!navigator.onLine) {
        paragraphs.push(new Paragraph({
          children: [new TextRun(
            `[Trang ${i}: PDF dạng scan nhưng đang OFFLINE. Kết nối internet để nhận diện chữ OCR.]`
          )],
        }));
      } else {
        try {
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await page.render({ canvasContext: ctx, viewport } as any).promise;

            const { data } = await Tesseract.recognize(canvas, 'vie+eng');
            const imgBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
            const imgBuffer = await imgBlob!.arrayBuffer();
            paragraphs.push(new Paragraph({
              children: [new ImageRun({
                type: 'png',
                data: imgBuffer,
                transformation: { width: Math.floor(viewport.width / 2), height: Math.floor(viewport.height / 2) },
              })],
            }));

            const ocrData = data as unknown as { paragraphs: { bbox: { x0: number; y0: number; x1: number; y1: number }; text: string }[] };
            for (const p of ocrData.paragraphs) {
              paragraphs.push(new Paragraph({
                indent: { left: Math.floor(p.bbox.x0 / 4) },
                spacing: { before: 100 },
                children: [new TextRun({ text: p.text, size: 20 })],
              }));
            }
          }
        } catch (err: unknown) {
          const e = err as { message?: string };
          console.error('OCR thất bại trang', i, err);
          paragraphs.push(new Paragraph({
            children: [new TextRun(`[Trang ${i}: OCR thất bại - ${e.message || 'Lỗi không xác định'}]`)],
          }));
        }
      }
    } else {
      if (text.trim()) {
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            paragraphs.push(new Paragraph({ children: [new TextRun(line.trim())] }));
          }
        }
      }
    }
  }

  if (paragraphs.length === 0) {
    throw new Error('Chuyển đổi thất bại: PDF hoàn toàn trống.');
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

// ─── Generators: Rows sang các định dạng đích ───────────────────────────────

function rowsToXlsx(rows: Record<string, unknown>[], sheetName: string): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
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
  const bom = '\uFEFF';
  return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
}

function rowsToCsvUtf8(rows: Record<string, unknown>[]): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

function rowsToXml(rows: Record<string, unknown>[], rootTag = 'DanhSach', rowTag = 'BanGhi'): Blob {
  const safeRoot = rootTag.trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F]/g, '_') || 'DanhSach';
  const safeRow = rowTag.trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F]/g, '_') || 'BanGhi';

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
    `<${safeRoot}>`,
    ...rows.map(row => {
      const fields = Object.entries(row)
        .map(([k, v]) => {
          const safeKey = k.replace(/[^a-zA-Z0-9_\u00C0-\u024F]/g, '_') || 'Field';
          return `    <${safeKey}>${escapeXml(v)}</${safeKey}>`;
        })
        .join('\n');
      return `  <${safeRow}>\n${fields}\n  </${safeRow}>`;
    }),
    `</${safeRoot}>`,
  ];
  return new Blob([lines.join('\n')], { type: 'application/xml;charset=utf-8' });
}

function rowsToJson(rows: Record<string, unknown>[]): Blob {
  return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
}

async function rowsToDocxTable(rows: Record<string, unknown>[], title = 'Dữ Liệu Báo Cáo'): Promise<Blob> {
  if (rows.length === 0) throw new Error('Không có dữ liệu để xuất bảng Word');
  const cols = Object.keys(rows[0] ?? {});
  if (cols.length === 0) throw new Error('Bảng dữ liệu không có cột hợp lệ');
  
  const headerRow = new TableRow({
    tableHeader: true,
    children: cols.map(col => new TableCell({
      shading: { fill: '2563eb' },
      children: [
        new Paragraph({
          children: [new TextRun({ text: String(col), bold: true, color: 'ffffff', size: 18 })],
        })
      ],
    })),
  });

  const dataRows = rows.map((row, idx) => new TableRow({
    children: cols.map(col => new TableCell({
      shading: idx % 2 === 1 ? { fill: 'f8fafc' } : undefined,
      children: [
        new Paragraph({
          children: [new TextRun({ text: String(row[col] ?? ''), size: 18 })],
        })
      ],
    })),
  }));

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 150 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Tổng số: ${rows.length.toLocaleString()} bản ghi · Xuất từ DMH_Tools Converter Pro ngày ${new Date().toLocaleDateString('vi-VN')}`,
              color: '64748b',
              size: 18,
            }),
          ],
          spacing: { after: 250 },
        }),
        table,
      ],
    }],
  });

  return await Packer.toBlob(doc);
}

function buildPrintHtml(rows: Record<string, unknown>[], title = 'Báo Cáo Dữ Liệu'): string {
  const cols = Object.keys(rows[0] ?? {});
  const escapeHtml = (val: unknown) => String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm 10mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 10pt;
    }
    .header { margin-bottom: 12px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
    h1 { font-size: 15pt; margin: 0 0 4px; color: #1e3a8a; }
    .meta { font-size: 8.5pt; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th {
      background-color: #2563eb !important; color: #ffffff !important;
      font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #1d4ed8;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    td { padding: 5px 8px; border: 1px solid #cbd5e1; vertical-align: top; }
    tr:nth-child(even) td {
      background-color: #f8fafc !important;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Tổng số bản ghi: <strong>${rows.length.toLocaleString()}</strong> · Xuất bởi DMH_Tools ngày: ${new Date().toLocaleString('vi-VN')}</div>
  </div>
  <table>
    <thead>
      <tr>
        ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('\n        ')}
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`).join('\n      ')}
    </tbody>
  </table>
</body>
</html>`;
}

async function rowsToPdf(
  rows: Record<string, unknown>[],
  title = 'Báo Cáo Dữ Liệu',
  landscape = false
): Promise<Blob> {
  const html = buildPrintHtml(rows, title);

  // 1. Electron Native printToPDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).electronAPI?.htmlToPdf) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uint8 = await (window as any).electronAPI.htmlToPdf({ html, landscape });
      return new Blob([uint8], { type: 'application/pdf' });
    } catch (err) {
      console.warn('Lỗi Electron htmlToPdf, chuyển sang jsPDF fallback:', err);
    }
  }

  // 2. Fallback jsPDF
  const { jsPDF } = await import('jspdf');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTableModule = await import('jspdf-autotable') as any;
  const autoTableFn = autoTableModule.default || autoTableModule;
  
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const cols = Object.keys(rows[0] ?? {});
  const head = [cols];
  const body = rows.map(r => cols.map(c => String(r[c] ?? '')));

  doc.setFontSize(13);
  doc.text(title, 40, 36);
  doc.setFontSize(8.5);
  doc.setTextColor(100);
  doc.text(`Tong so: ${rows.length} ban ghi - DMH_Tools Converter`, 40, 52);

  const tableOptions = {
    head,
    body,
    startY: 62,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235] as [number, number, number] },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (doc as any).autoTable === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable(tableOptions);
  } else if (typeof autoTableFn === 'function') {
    autoTableFn(doc, tableOptions);
  }

  return doc.output('blob');
}

function rowsToHtml(rows: Record<string, unknown>[], title = 'Dữ Liệu Bảng Tính'): Blob {
  const cols = Object.keys(rows[0] ?? {});
  const escapeHtml = (str: unknown) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 2rem; color: #1e293b; background: #f8fafc; }
    .container { max-width: 1300px; margin: 0 auto; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    h1 { font-size: 1.4rem; color: #0f172a; margin-top: 0; }
    .meta { font-size: 0.85rem; color: #64748b; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; }
    .search-box { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; width: 220px; }
    .table-wrapper { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; max-height: 75vh; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { position: sticky; top: 0; background: #2563eb; color: #fff; text-align: left; padding: 10px 12px; font-weight: 600; z-index: 2; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr:hover td { background: #eff6ff; }
    @media print {
      body { margin: 0; background: #fff; }
      .container { box-shadow: none; padding: 0; width: 100%; }
      .search-box { display: none; }
      th { background: #2563eb !important; color: #fff !important; -webkit-print-color-adjust: exact; }
      tr:nth-child(even) td { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div>Tổng số: <strong>${rows.length.toLocaleString()}</strong> bản ghi · Xuất ngày: ${new Date().toLocaleString('vi-VN')} · DMH_Tools Pro</div>
      <input type="text" id="filterInput" class="search-box" placeholder="🔍 Lọc nhanh bảng..." onkeyup="filterTable()">
    </div>
    <div class="table-wrapper">
      <table id="dataTable">
        <thead>
          <tr>
            ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('\n            ')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`).join('\n          ')}
        </tbody>
      </table>
    </div>
  </div>
  <script>
    function filterTable() {
      var input = document.getElementById("filterInput");
      var filter = input.value.toLowerCase();
      var table = document.getElementById("dataTable");
      var trs = table.getElementsByTagName("tr");
      for (var i = 1; i < trs.length; i++) {
        var text = trs[i].textContent || trs[i].innerText;
        trs[i].style.display = text.toLowerCase().indexOf(filter) > -1 ? "" : "none";
      }
    }
  </script>
</body>
</html>`;

  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

function rowsToSql(rows: Record<string, unknown>[], tableName = 'DMH_Table'): Blob {
  if (rows.length === 0) return new Blob([''], { type: 'application/sql;charset=utf-8' });
  const cols = Object.keys(rows[0]);
  const safeTable = tableName.trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F]/g, '_') || 'DMH_Table';
  const colList = cols.map(c => `[${c.replace(/\]/g, ']]')}]`).join(', ');

  const escapeSqlVal = (val: unknown): string => {
    if (val === null || val === undefined || val === '') return 'NULL';
    if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
    if (typeof val === 'boolean') return val ? '1' : '0';
    const s = String(val);
    return `N'${s.replace(/'/g, "''")}'`;
  };

  const lines: string[] = [
    `-- ==========================================================`,
    `-- File dữ liệu SQL tạo bởi DMH_Tools Converter Pro`,
    `-- Bảng đích: [${safeTable}] | Tổng số bản ghi: ${rows.length}`,
    `-- Ngày xuất: ${new Date().toLocaleString('vi-VN')}`,
    `-- ==========================================================`,
    ``,
  ];

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    lines.push(`INSERT INTO [${safeTable}] (${colList}) VALUES`);
    const valuesList = chunk.map((r, rowIdx) => {
      const vals = cols.map(c => escapeSqlVal(r[c])).join(', ');
      const isLast = rowIdx === chunk.length - 1;
      return `  (${vals})${isLast ? ';' : ','}`;
    });
    lines.push(valuesList.join('\n'));
    lines.push('');
  }

  return new Blob([lines.join('\n')], { type: 'application/sql;charset=utf-8' });
}

function rowsToTxt(rows: Record<string, unknown>[], delimiter = '\t'): Blob {
  if (rows.length === 0) return new Blob([''], { type: 'text/plain;charset=utf-8' });
  const cols = Object.keys(rows[0]);
  const sep = delimiter === '\\t' ? '\t' : delimiter;
  
  const header = cols.join(sep);
  const lines = rows.map(r => cols.map(c => String(r[c] ?? '')).join(sep));
  const fullText = [header, ...lines].join('\r\n');
  return new Blob([fullText], { type: 'text/plain;charset=utf-8' });
}

function rowsToMd(rows: Record<string, unknown>[]): Blob {
  if (rows.length === 0) return new Blob([''], { type: 'text/markdown;charset=utf-8' });
  const cols = Object.keys(rows[0]);
  const header = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${cols.map(c => String(r[c] ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ')} |`).join('\n');
  return new Blob([`${header}\n${sep}\n${body}`], { type: 'text/markdown;charset=utf-8' });
}

async function rowsToPng(rows: Record<string, unknown>[], title = 'Dữ Liệu Bảng Tính'): Promise<Blob> {
  if (rows.length === 0) throw new Error('Không có dữ liệu để xuất ảnh PNG');
  const cols = Object.keys(rows[0]);
  if (cols.length === 0) throw new Error('Bảng dữ liệu không có cột hợp lệ');

  const maxRows = Math.min(rows.length, 100);
  const sampleRows = rows.slice(0, maxRows);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D');

  const fontSize = 12;
  const headerFontSize = 13;
  const titleFontSize = 16;
  const paddingX = 12;
  const rowHeight = 30;
  const headerHeight = 36;
  const topSectionHeight = 70;
  const footerHeight = 32;

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  
  // Calculate column widths
  const colWidths = cols.map(c => {
    let maxW = ctx.measureText(String(c)).width + paddingX * 2;
    for (const r of sampleRows) {
      const cellText = String(r[c] ?? '');
      const w = ctx.measureText(cellText.length > 40 ? cellText.slice(0, 40) + '...' : cellText).width + paddingX * 2;
      if (w > maxW) maxW = w;
    }
    return Math.min(300, Math.max(80, Math.ceil(maxW)));
  });

  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const totalWidth = Math.max(650, tableWidth + 50);
  const totalHeight = topSectionHeight + headerHeight + (sampleRows.length * rowHeight) + footerHeight + 15;

  canvas.width = totalWidth;
  canvas.height = totalHeight;

  const c = canvas.getContext('2d')!;

  // Background
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, totalWidth, totalHeight);

  // Top header background
  c.fillStyle = '#f8fafc';
  c.fillRect(0, 0, totalWidth, topSectionHeight);

  // Title
  c.font = `bold ${titleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = '#1e3a8a';
  c.fillText(title, 25, 34);

  // Meta subtitle
  c.font = `normal 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = '#64748b';
  const metaText = `Tổng số: ${rows.length.toLocaleString()} bản ghi${rows.length > maxRows ? ` (Hiển thị ${maxRows} dòng đầu trên ảnh)` : ''} · DMH_Tools Pro ngày ${new Date().toLocaleDateString('vi-VN')}`;
  c.fillText(metaText, 25, 54);

  const startX = 25;
  let startY = topSectionHeight;

  // Header Row
  c.fillStyle = '#2563eb';
  c.fillRect(startX, startY, tableWidth, headerHeight);

  c.font = `bold ${headerFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = '#ffffff';
  let curX = startX;
  cols.forEach((col, idx) => {
    let colName = String(col);
    if (colName.length > 25) colName = colName.slice(0, 23) + '...';
    c.fillText(colName, curX + paddingX, startY + 23);
    curX += colWidths[idx];
  });

  startY += headerHeight;

  // Data Rows
  c.font = `normal ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  sampleRows.forEach((row, rowIdx) => {
    const isEven = rowIdx % 2 === 1;
    c.fillStyle = isEven ? '#f8fafc' : '#ffffff';
    c.fillRect(startX, startY, tableWidth, rowHeight);

    // Border line bottom
    c.fillStyle = '#e2e8f0';
    c.fillRect(startX, startY + rowHeight - 1, tableWidth, 1);

    curX = startX;
    cols.forEach((col, colIdx) => {
      c.fillStyle = '#1e293b';
      let val = String(row[col] ?? '');
      if (val.length > 35) val = val.slice(0, 32) + '...';
      c.fillText(val, curX + paddingX, startY + 20);

      // Vertical border
      c.fillStyle = '#e2e8f0';
      c.fillRect(curX + colWidths[colIdx] - 1, startY, 1, rowHeight);

      curX += colWidths[colIdx];
    });

    startY += rowHeight;
  });

  // Outer border around table
  c.strokeStyle = '#cbd5e1';
  c.lineWidth = 1;
  c.strokeRect(startX, topSectionHeight, tableWidth, headerHeight + sampleRows.length * rowHeight);

  // Footer note
  c.font = `italic 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  c.fillStyle = '#94a3b8';
  c.fillText('DMH_Tools Pro — Chuyển Đổi Định Dạng File Thông Minh', startX, startY + 22);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Lỗi xuất Blob ảnh PNG'));
    }, 'image/png');
  });
}

// ─── Dispatcher Trung Tâm ───────────────────────────────────────────────────

async function convertFile(
  file: File & { path?: string },
  targetFormat: ConvertFormat,
  xmlRootTag = 'DanhSach',
  xmlRowTag = 'BanGhi',
  excelSheetIndex = 0,
  csvDelimiter = ',',
  sqlTableName = 'DMH_Table',
  pdfLandscape = false
): Promise<{ blob: Blob; filename: string; rowCount?: number; colCount?: number }> {
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const meta = FORMAT_OPTIONS.find(f => f.value === targetFormat)!;
  const isPdfSource = file.name.toLowerCase().endsWith('.pdf');

  // TRƯỜNG HỢP 1: File nguồn là PDF
  if (isPdfSource) {
    if (targetFormat === 'docx') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).electronAPI && file.path) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uint8Array = await (window as any).electronAPI.convertPdfNative(file.path);
          const blob = new Blob([uint8Array], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          const filename = `${baseName}_converted.docx`;
          return { blob, filename, rowCount: 1, colCount: 0 };
        } catch (err) {
          console.error('Lỗi chuyển đổi bằng công cụ gốc:', err);
        }
      }
      return await convertPdfToDocx(file);
    }

    if (targetFormat === 'txt') {
      return await convertPdfToTxt(file);
    }

    if (targetFormat === 'png') {
      return await convertPdfToPng(file);
    }

    if (targetFormat === 'pdf') {
      const buf = await file.arrayBuffer();
      return { blob: new Blob([buf], { type: 'application/pdf' }), filename: `${baseName}_copy.pdf`, rowCount: 1, colCount: 0 };
    }

    // PDF sang bảng tính / dữ liệu (XLSX, CSV, HTML, SQL, XML, JSON, MD)
    const { rows, sheetName } = await convertPdfToRows(file);
    const colCount = Object.keys(rows[0] ?? {}).length;
    const filename = `${baseName}_converted.${meta.ext}`;

    let blob: Blob;
    switch (targetFormat) {
      case 'xlsx':        blob = rowsToXlsx(rows, sheetName); break;
      case 'csv-utf8bom': blob = rowsToCsvUtf8Bom(rows); break;
      case 'csv-utf8':    blob = rowsToCsvUtf8(rows); break;
      case 'xml':         blob = rowsToXml(rows, xmlRootTag, xmlRowTag); break;
      case 'json':        blob = rowsToJson(rows); break;
      case 'html':        blob = rowsToHtml(rows, baseName); break;
      case 'sql':         blob = rowsToSql(rows, sqlTableName); break;
      case 'md':          blob = rowsToMd(rows); break;
      default:
        blob = rowsToXlsx(rows, sheetName);
    }
    return { blob, filename, rowCount: rows.length, colCount };
  }

  // TRƯỜNG HỢP 2: File nguồn dạng Bảng tính / Dữ liệu / Word / Text
  const { rows, sheetName } = await readToRows(file, excelSheetIndex, csvDelimiter);
  if (rows.length === 0) throw new Error('File không có dữ liệu hoặc không đọc được nội dung');

  const filename = `${baseName}_converted.${meta.ext}`;
  const colCount = Object.keys(rows[0] ?? {}).length;

  let blob: Blob;
  switch (targetFormat) {
    case 'xlsx':
      blob = rowsToXlsx(rows, sheetName);
      break;
    case 'csv-utf8bom':
      blob = rowsToCsvUtf8Bom(rows);
      break;
    case 'csv-utf8':
      blob = rowsToCsvUtf8(rows);
      break;
    case 'docx':
      blob = await rowsToDocxTable(rows, baseName);
      break;
    case 'pdf':
      blob = await rowsToPdf(rows, baseName, pdfLandscape);
      break;
    case 'html':
      blob = rowsToHtml(rows, baseName);
      break;
    case 'sql':
      blob = rowsToSql(rows, sqlTableName);
      break;
    case 'txt':
      blob = rowsToTxt(rows, csvDelimiter);
      break;
    case 'xml':
      blob = rowsToXml(rows, xmlRootTag, xmlRowTag);
      break;
    case 'json':
      blob = rowsToJson(rows);
      break;
    case 'md':
      blob = rowsToMd(rows);
      break;
    case 'png':
      blob = await rowsToPng(rows, baseName);
      break;
    default:
      blob = rowsToXlsx(rows, sheetName);
  }

  return { blob, filename, rowCount: rows.length, colCount };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormatSelector({
  value,
  onChange,
  category,
  onCategoryChange
}: {
  value: ConvertFormat;
  onChange: (v: ConvertFormat) => void;
  category: FormatCategory;
  onCategoryChange: (cat: FormatCategory) => void;
}) {
  const categories: { key: FormatCategory; label: string; count: number }[] = [
    { key: 'all',   label: 'Tất cả', count: FORMAT_OPTIONS.length },
    { key: 'table', label: 'Bảng tính & CSDL', count: FORMAT_OPTIONS.filter(f => f.category === 'table').length },
    { key: 'doc',   label: 'Tài liệu & In ấn', count: FORMAT_OPTIONS.filter(f => f.category === 'doc').length },
    { key: 'dev',   label: 'Kỹ thuật & Ảnh', count: FORMAT_OPTIONS.filter(f => f.category === 'dev').length },
  ];

  const filteredOptions = category === 'all'
    ? FORMAT_OPTIONS
    : FORMAT_OPTIONS.filter(f => f.category === category);

  return (
    <div>
      {/* Category Pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.875rem', flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button
            key={c.key}
            type="button"
            className="btn-secondary"
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: '0.75rem',
              borderRadius: 20,
              borderWidth: 1,
              fontWeight: category === c.key ? 700 : 500,
              background: category === c.key ? '#eff6ff' : '#fff',
              color: category === c.key ? '#2563eb' : '#64748b',
              borderColor: category === c.key ? '#93c5fd' : '#e2e8f0',
            }}
            onClick={() => onCategoryChange(c.key)}
          >
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      {/* Grid of formats */}
      <div className="convert-format-grid">
        {filteredOptions.map(f => (
          <label
            key={f.value}
            className={`convert-format-card ${value === f.value ? 'selected' : ''}`}
            style={value === f.value ? { borderColor: f.color, background: f.bg } : {}}
          >
            <input
              type="radio"
              name="targetFormat"
              value={f.value}
              checked={value === f.value}
              onChange={() => onChange(f.value)}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: value === f.value ? f.color : '#64748b' }}>{FORMAT_ICONS[f.value]}</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: value === f.value ? f.color : '#1e293b' }}>
                {f.label}
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
              {f.desc}
            </p>
          </label>
        ))}
      </div>
    </div>
  );
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function JobCard({
  job,
  onRemove,
  onRetry
}: {
  job: ConvertJob;
  onRemove: () => void;
  onRetry: (j: ConvertJob) => void;
}) {
  const meta = FORMAT_OPTIONS.find(f => f.value === job.targetFormat)!;
  const isPreviewable = ['pdf', 'html', 'png', 'txt', 'md', 'json', 'xml'].includes(job.targetFormat);

  const handleDownload = () => {
    if (!job.downloadUrl || !job.downloadName) return;
    const a = document.createElement('a');
    a.href = job.downloadUrl;
    a.download = job.downloadName;
    a.click();
    showToast.success('Tải xuống thành công', `Đã tải tệp: ${job.downloadName}`);
  };

  const handlePreview = () => {
    if (!job.downloadUrl) return;
    window.open(job.downloadUrl, '_blank');
  };

  const fileSize = formatFileSize(job.file.size);

  return (
    <div className={`convert-job-card status-${job.status}`}>
      <div className="convert-job-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {/* Source */}
          <div className="convert-file-pill">
            <FileSpreadsheet size={14} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.file.name}</span>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', flexShrink: 0 }}>
              {job.sourceFormat.toUpperCase()}{fileSize ? ` · ${fileSize}` : ''}
            </span>
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
            {job.rowCount?.toLocaleString()} {job.colCount ? `dòng · ${job.colCount} cột` : 'trang'}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPreviewable && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: 8 }}
                onClick={handlePreview}
                title="Xem trước nội dung trong tab mới"
              >
                <Eye size={14} /> Xem
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', borderRadius: 8, boxShadow: 'none' }}
              onClick={handleDownload}
            >
              <Download size={14} /> Tải về
            </button>
          </div>
        )}
        {job.status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.78rem', color: '#ef4444', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ⚠ {job.errorMsg}
            </span>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#4f46e5', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => onRetry(job)}
              title="Thử chuyển đổi lại tệp này"
            >
              <RotateCcw size={13} /> Thử lại
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '4px 8px', color: '#94a3b8' }}
          onClick={onRemove}
          title="Xóa tệp khỏi danh sách"
        >
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
  const [category, setCategory] = useState<FormatCategory>('all');
  const [drag, setDrag] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Settings
  const [xmlRootTag, setXmlRootTag] = useState('DanhSach');
  const [xmlRowTag, setXmlRowTag] = useState('BanGhi');
  const [excelSheetIndex, setExcelSheetIndex] = useState<number>(0);
  const [csvDelimiter, setCsvDelimiter] = useState<string>(',');
  const [sqlTableName, setSqlTableName] = useState<string>('DMH_Table');
  const [pdfLandscape, setPdfLandscape] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const blobUrls = useRef<Record<string, string>>({});

  const getSourceFormat = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      xlsx: 'Excel', xls: 'Excel', csv: 'CSV', tsv: 'TSV',
      xml: 'XML', json: 'JSON', pdf: 'PDF', docx: 'Word',
      txt: 'Text', html: 'HTML', htm: 'HTML'
    };
    return map[ext] ?? ext.toUpperCase();
  };

  const addFiles = useCallback(async (rawFiles: File[]) => {
    const supported = rawFiles.filter(f => /\.(xlsx|xls|csv|tsv|xml|json|pdf|docx|txt|html|htm)$/i.test(f.name));
    if (supported.length === 0) return;

    const newJobs: ConvertJob[] = supported.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      sourceFormat: getSourceFormat(f.name),
      targetFormat,
      status: 'pending',
    }));

    setJobs(prev => [...newJobs, ...prev]);

    let successCount = 0;
    let errorCount = 0;

    startGlobalLoading('converter', `Đang chuyển đổi ${newJobs.length} tệp tin sang định dạng ${targetFormat.toUpperCase()}...`);
    try {
      for (const job of newJobs) {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'converting' } : j));
        try {
          const { blob, filename, rowCount, colCount } = await convertFile(
            job.file,
            job.targetFormat,
            xmlRootTag,
            xmlRowTag,
            excelSheetIndex,
            csvDelimiter,
            sqlTableName,
            pdfLandscape
          );

          if (blobUrls.current[job.id]) URL.revokeObjectURL(blobUrls.current[job.id]);
          const url = URL.createObjectURL(blob);
          blobUrls.current[job.id] = url;

          successCount++;
          setJobs(prev => prev.map(j =>
            j.id === job.id ? { ...j, status: 'done', downloadUrl: url, downloadName: filename, rowCount, colCount } : j
          ));
        } catch (err) {
          errorCount++;
          setJobs(prev => prev.map(j =>
            j.id === job.id ? { ...j, status: 'error', errorMsg: err instanceof Error ? err.message : String(err) } : j
          ));
        }
      }
    } finally {
      stopGlobalLoading('converter');
      if (successCount > 0 && errorCount === 0) {
        showToast.success('Chuyển đổi hoàn tất', `Đã chuyển đổi thành công ${successCount} tệp sang định dạng ${targetFormat.toUpperCase()}`);
      } else if (successCount > 0 && errorCount > 0) {
        showToast.warning('Chuyển đổi một phần', `${successCount} tệp thành công, ${errorCount} tệp gặp sự cố`);
      } else if (errorCount > 0) {
        showToast.error('Chuyển đổi thất bại', `Không thể chuyển đổi ${errorCount} tệp tin`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFormat, xmlRootTag, xmlRowTag, excelSheetIndex, csvDelimiter, sqlTableName, pdfLandscape]);

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

  const retryJob = useCallback(async (jobToRetry: ConvertJob) => {
    setJobs(prev => prev.map(j => j.id === jobToRetry.id ? { ...j, status: 'converting', errorMsg: undefined } : j));
    try {
      const { blob, filename, rowCount, colCount } = await convertFile(
        jobToRetry.file,
        jobToRetry.targetFormat,
        xmlRootTag,
        xmlRowTag,
        excelSheetIndex,
        csvDelimiter,
        sqlTableName,
        pdfLandscape
      );
      if (blobUrls.current[jobToRetry.id]) URL.revokeObjectURL(blobUrls.current[jobToRetry.id]);
      const url = URL.createObjectURL(blob);
      blobUrls.current[jobToRetry.id] = url;

      setJobs(prev => prev.map(j =>
        j.id === jobToRetry.id ? { ...j, status: 'done', downloadUrl: url, downloadName: filename, rowCount, colCount } : j
      ));
      showToast.success('Chuyển đổi thành công', `Đã chuyển đổi lại tệp ${jobToRetry.file.name}`);
    } catch (err) {
      setJobs(prev => prev.map(j =>
        j.id === jobToRetry.id ? { ...j, status: 'error', errorMsg: err instanceof Error ? err.message : String(err) } : j
      ));
      showToast.error('Chuyển đổi thất bại', err instanceof Error ? err.message : String(err));
    }
  }, [xmlRootTag, xmlRowTag, excelSheetIndex, csvDelimiter, sqlTableName, pdfLandscape]);

  const clearAll = () => {
    Object.values(blobUrls.current).forEach(URL.revokeObjectURL);
    blobUrls.current = {};
    setJobs([]);
    showToast.info('Đã xóa danh sách', 'Đã dọn sạch toàn bộ danh sách tệp chuyển đổi.');
  };

  const downloadAll = () => {
    const list = jobs.filter(j => j.status === 'done' && j.downloadUrl && j.downloadName);
    list.forEach((j, index) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = j.downloadUrl!;
        a.download = j.downloadName!;
        a.click();
      }, index * 200);
    });
    if (list.length > 0) {
      showToast.success('Đang tải xuống', `Đang tải xuống toàn bộ ${list.length} tệp tin.`);
    }
  };

  const doneCount = jobs.filter(j => j.status === 'done').length;
  const errorCount = jobs.filter(j => j.status === 'error').length;

  const currentMeta = FORMAT_OPTIONS.find(f => f.value === targetFormat);
  const optionsButtonTitle = `Tùy chọn ${currentMeta?.label.split(' ')[0] || targetFormat.toUpperCase()} ${showOptions ? '▲' : '▼'}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Header ── */}
      <div className="converter-header">
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={20} color="#2563eb" /> Chuyển Đổi Định Dạng File Đa Năng (Pro)
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0' }}>
            Hỗ trợ đầy đủ Excel, CSV, Word, PDF, Text, HTML, SQL, XML, JSON, Markdown, Ảnh · Chuẩn tiếng Việt 100%
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Chuyển đổi sang định dạng:
          </h3>
          <button
            className="btn-secondary"
            style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowOptions(!showOptions)}
          >
            <Settings2 size={13} /> {optionsButtonTitle}
          </button>
        </div>

        <FormatSelector
          value={targetFormat}
          onChange={setTargetFormat}
          category={category}
          onCategoryChange={setCategory}
        />

        {/* Dynamic Options Panel */}
        {showOptions && (
          <div className="converter-xml-options" style={{ marginTop: '0.875rem' }}>
            {targetFormat === 'xml' && (
              <>
                <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                  <Info size={13} /> Tùy chỉnh tên thẻ XML
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Tag gốc (Root)</span>
                    <input
                      className="search-input"
                      style={{ width: '100%' }}
                      value={xmlRootTag}
                      onChange={e => setXmlRootTag(e.target.value || 'DanhSach')}
                      placeholder="DanhSach"
                    />
                  </label>
                  <label style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Tag hàng (Row)</span>
                    <input
                      className="search-input"
                      style={{ width: '100%' }}
                      value={xmlRowTag}
                      onChange={e => setXmlRowTag(e.target.value || 'BanGhi')}
                      placeholder="BanGhi"
                    />
                  </label>
                </div>
              </>
            )}

            {targetFormat === 'sql' && (
              <>
                <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                  <Database size={13} /> Cấu hình sinh lệnh INSERT CSDL
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Tên bảng CSDL (Target Table)</span>
                    <input
                      className="search-input"
                      style={{ width: '100%' }}
                      value={sqlTableName}
                      onChange={e => setSqlTableName(e.target.value || 'DMH_Table')}
                      placeholder="DMH_Table"
                    />
                  </label>
                </div>
              </>
            )}

            {(targetFormat === 'csv-utf8' || targetFormat === 'csv-utf8bom' || targetFormat === 'txt') && (
              <>
                <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                  <Info size={13} /> Tùy chỉnh phân cách cột
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
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
                      <option value="\t">Dấu Tab (\t) - Chuẩn TSV / Máy xét nghiệm</option>
                      <option value="|">Dấu đứng (|) - Chuẩn XML/BHYT</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            {targetFormat === 'xlsx' && (
              <>
                <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                  <Info size={13} /> Tùy chỉnh đọc file Excel nguồn
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Sheet Index cần đọc (0 = sheet đầu tiên)</span>
                    <input
                      type="number"
                      className="search-input"
                      style={{ width: '100%' }}
                      value={excelSheetIndex}
                      onChange={e => setExcelSheetIndex(parseInt(e.target.value) || 0)}
                    />
                  </label>
                </div>
              </>
            )}

            {targetFormat === 'pdf' && (
              <>
                <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                  <Info size={13} /> Tùy chỉnh khổ giấy &amp; hướng trang PDF
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Hướng in trang</span>
                    <select
                      className="search-input"
                      style={{ width: '100%' }}
                      value={pdfLandscape ? 'landscape' : 'portrait'}
                      onChange={e => setPdfLandscape(e.target.value === 'landscape')}
                    >
                      <option value="portrait">Trang dọc (Portrait) — Thích hợp báo cáo ít cột</option>
                      <option value="landscape">Trang ngang (Landscape) — Thích hợp bảng nhiều cột</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            {targetFormat !== 'xml' && targetFormat !== 'sql' && targetFormat !== 'xlsx' && targetFormat !== 'pdf' && targetFormat !== 'csv-utf8' && targetFormat !== 'csv-utf8bom' && targetFormat !== 'txt' && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={13} /> Định dạng {targetFormat.toUpperCase()} đã được tối ưu hóa tự động theo chuẩn tốt nhất.
              </div>
            )}
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
          accept=".xlsx,.xls,.csv,.tsv,.xml,.json,.pdf,.docx,.doc,.txt,.html,.htm"
          style={{ display: 'none' }}
          onChange={e => e.target.files && addFiles(Array.from(e.target.files))}
        />
        <UploadCloud size={38} style={{ color: '#2563eb', marginBottom: '0.5rem' }} />
        <p style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', margin: '0 0 4px' }}>
          Kéo thả hoặc click chọn file để chuyển đổi tức thì
        </p>
        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
          Hỗ trợ: PDF · Word · Excel · CSV · XML · JSON · TXT · HTML → <strong style={{ color: currentMeta?.color }}>
            {currentMeta?.label}
          </strong>
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: '0.875rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {['.xlsx', '.xls', '.csv', '.tsv', '.xml', '.json', '.pdf', '.docx', '.txt', '.html'].map(ext => (
            <span key={ext} style={{ background: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>{ext}</span>
          ))}
        </div>
      </div>

      {/* ── Encoding Notice ── */}
      <div className="encoding-notice">
        <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
          <strong>Mẹo chọn định dạng xuất:</strong> &nbsp;
          <span style={{ color: '#dc2626', fontWeight: 600 }}>PDF (.pdf)</span> → Báo cáo A4 sắc nét &nbsp;|&nbsp;
          <span style={{ color: '#2563eb', fontWeight: 600 }}>Word (.docx)</span> → Tạo bảng Word chỉnh sửa được &nbsp;|&nbsp;
          <span style={{ color: '#10b981', fontWeight: 600 }}>Excel (.xlsx)</span> → Phân tích dữ liệu &nbsp;|&nbsp;
          <span style={{ color: '#0284c7', fontWeight: 600 }}>SQL (.sql)</span> → Nạp dữ liệu vào Database
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
          <p style={{ fontSize: '0.875rem', textAlign: 'center', maxWidth: 380, color: '#64748b' }}>
            Chưa có file nào trong hàng chờ. Hãy chọn định dạng mong muốn rồi kéo thả file vào ô bên trên.
          </p>
        </div>
      )}

      {jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onRemove={() => removeJob(job.id)} onRetry={retryJob} />
          ))}
        </div>
      )}
    </div>
  );
}
