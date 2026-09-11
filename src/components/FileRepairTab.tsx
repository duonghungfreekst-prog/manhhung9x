import { useState, useRef, useEffect } from 'react';
import {
  Upload, Wrench, FileSpreadsheet, FileText, File,
  CheckCircle, AlertTriangle, Download, Trash2, RefreshCw, Info, AlignLeft, ArrowLeftRight,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
// JSZip bundled inside xlsx package – used for DOCX manipulation
import JSZip from 'jszip';

type RepairStatus = 'idle' | 'processing' | 'done' | 'error';

interface PrintCheck {
  canPrint: boolean;
  warnings: string[];
  tips: string[];
}

interface RepairResult {
  fileName: string;
  originalSize: number;
  repairedSize: number;
  issues: string[];
  fixed: string[];
  printCheck?: PrintCheck;
  blob?: Blob;
}

interface ConvertResult {
  targetFmt: string;
  blob: Blob;
  fileName: string;
  status: 'done' | 'error';
  errorMsg?: string;
}

interface FileItem {
  file: File;
  status: RepairStatus;
  result?: RepairResult;
  convertResult?: ConvertResult;
  convertError?: string;
}

const FILE_TYPES = [
  { ext: ['xlsx', 'xls', 'csv'], label: 'Excel / CSV', icon: <FileSpreadsheet size={16} color="#10b981" />, color: '#10b981' },
  { ext: ['xml'], label: 'XML', icon: <FileText size={16} color="#6366f1" />, color: '#6366f1' },
  { ext: ['txt'], label: 'TXT', icon: <File size={16} color="#f59e0b" />, color: '#f59e0b' },
  { ext: ['json'], label: 'JSON', icon: <FileText size={16} color="#3b82f6" />, color: '#3b82f6' },
  { ext: ['csv'], label: 'CSV', icon: <FileSpreadsheet size={16} color="#10b981" />, color: '#10b981' },
  { ext: ['docx', 'doc'], label: 'Word', icon: <FileText size={16} color="#2563eb" />, color: '#2563eb' },
];

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['xlsx', 'xls'].includes(ext)) return <FileSpreadsheet size={18} color="#10b981" />;
  if (['xml'].includes(ext)) return <FileText size={18} color="#6366f1" />;
  if (['json'].includes(ext)) return <FileText size={18} color="#3b82f6" />;
  if (['csv'].includes(ext)) return <FileSpreadsheet size={18} color="#10b981" />;
  if (['docx', 'doc'].includes(ext)) return <FileText size={18} color="#2563eb" />;
  return <File size={18} color="#64748b" />;
}

// ─── Hàm chuyển chuỗi text sang số ─────────────────────────────────────────────
function textToNumber(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;

  // Bỏ ký tự tiền tệ & ký hiệu thừa: VNĐ, đ, $, %, ...
  s = s.replace(/[₫đ$€£¥%]/gi, '').trim();

  // Dấu ngoặc = số âm kế toán: (1.234) -> -1234
  const isNeg = /^\(.*\)$/.test(s);
  if (isNeg) s = '-' + s.slice(1, -1).trim();

  // Xác định định dạng số: VN = 1.234.567,89 | US = 1,234,567.89 | thuần = 1234567
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Nếu dấu chấm xuất hiện trước dấu phẩy -> kiểu VN (1.234,56)
    if (s.indexOf('.') < s.indexOf(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Kiểu US (1,234.56)
      s = s.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    // Chỉ có dấu chấm: có thể là hàng nghìn VN (1.234) hoặc thập phân (1.5)
    const parts = s.split('.');
    const allThree = parts.slice(1).every(p => p.length === 3);
    if (parts.length > 1 && allThree) {
      // 1.234 hoặc 1.234.567 -> hàng nghìn VN
      s = s.replace(/\./g, '');
    }
    // Còn lại giữ nguyên (1.5 = số thập phân)
  } else if (hasComma && !hasDot) {
    // Chỉ có dấu phẩy: có thể là hàng nghìn US (1,234) hoặc thập phân VN (1,5)
    const parts = s.split(',');
    const allThree = parts.slice(1).every(p => p.length === 3);
    if (parts.length > 1 && allThree) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }

  const num = Number(s);
  if (isNaN(num)) return null;
  return num;
}

// ─── Excel/CSV Repair ──────────────────────────────────────────────────────────
async function repairExcel(file: File): Promise<RepairResult> {
  const issues: string[] = [];
  const fixed: string[] = [];
  const buf = await file.arrayBuffer();

  const wb = XLSX.read(buf, {
    type: 'array',
    cellDates: true,
    cellNF: true,
    cellText: false,
    WTF: false,
  });

  let trimFixed = 0;
  let numFixed = 0;
  let nanFixed = 0;
  let emptySheets = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    if (range.e.r === 0 && range.e.c === 0) {
      emptySheets++;
      issues.push(`Sheet "${sheetName}" rỗng hoặc chỉ có 1 ô`);
    }

    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (!cell) continue;

        if (cell.t === 's' && typeof cell.v === 'string') {
          // 1. Xóa khoảng trắng thừa
          const trimmed = cell.v.trim();
          if (trimmed !== cell.v) {
            cell.v = trimmed;
            cell.w = trimmed;
            trimFixed++;
          }

          // 2. Chuyển số dạng text → số thực (deep parse)
          if (trimmed !== '') {
            const num = textToNumber(trimmed);
            // Không chuyển nếu trông như mã/ngày/ID (có chữ cái, dấu /, -)
            const looksLikeCode = /[a-zA-Z]/.test(trimmed) || /\d{4}-\d{2}-\d{2}/.test(trimmed) || /\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed);
            if (num !== null && !looksLikeCode) {
              cell.t = 'n';
              cell.v = num;
              cell.w = String(num);
              numFixed++;
            }
          }
        }

        // 3. Sửa ô số bị NaN / Infinity
        if (cell.t === 'n' && (isNaN(cell.v) || !isFinite(cell.v))) {
          issues.push(`Ô ${addr} (sheet "${sheetName}") có giá trị lỗi (NaN/∞)`);
          cell.v = 0;
          cell.w = '0';
          nanFixed++;
        }
      }
    }
  }

  if (emptySheets > 0) issues.push(`${emptySheets} sheet không có dữ liệu`);
  if (issues.length === 0) issues.push('Không phát hiện lỗi cấu trúc rõ ràng');

  if (trimFixed > 0) fixed.push(`Xóa khoảng trắng thừa: ${trimFixed} ô`);
  if (numFixed > 0) fixed.push(`Chuyển số dạng text → số thực: ${numFixed} ô (hỗ trợ định dạng VN 1.234.567, US 1,234,567, tiền tệ đ/$)`);
  if (nanFixed > 0) fixed.push(`Sửa giá trị lỗi NaN/Infinity: ${nanFixed} ô`);

  const outputType = file.name.endsWith('.csv') ? 'csv' : 'xlsx';
  const outBuf = XLSX.write(wb, { type: 'array', bookType: outputType as XLSX.BookType });
  const blob = new Blob([outBuf], {
    type: outputType === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  fixed.push('Xuất lại file sạch');

  return {
    fileName: file.name,
    originalSize: file.size,
    repairedSize: blob.size,
    issues,
    fixed,
    blob,
  };
}

// ─── XML Repair ───────────────────────────────────────────────────────────────
async function repairXml(file: File): Promise<RepairResult> {
  const issues: string[] = [];
  const fixed: string[] = [];
  let text = await file.text();

  // Xóa BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    fixed.push('Đã xóa BOM (Byte Order Mark)');
  }

  // Thêm header XML nếu thiếu
  if (!text.trimStart().startsWith('<?xml')) {
    text = '<?xml version="1.0" encoding="UTF-8"?>\n' + text;
    fixed.push('Đã thêm XML declaration header');
    issues.push('Thiếu header khai báo XML');
  }

  // Sửa ký tự đặc biệt không encode (& thô)
  const rawAmp = (text.match(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g) || []).length;
  if (rawAmp > 0) {
    text = text.replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, '&amp;');
    fixed.push(`Đã encode ${rawAmp} ký tự '&' chưa được escape`);
    issues.push(`${rawAmp} ký tự '&' thô không hợp lệ trong XML`);
  }

  // Validate parse
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    issues.push('XML vẫn còn lỗi cú pháp không thể tự sửa: ' + parseError.textContent?.slice(0, 80));
  } else {
    fixed.push('Cấu trúc XML hợp lệ sau khi sửa');
  }

  if (issues.length === 0) issues.push('Không phát hiện lỗi cấu trúc');
  const blob = new Blob([text], { type: 'application/xml' });

  return {
    fileName: file.name,
    originalSize: file.size,
    repairedSize: blob.size,
    issues,
    fixed,
    blob,
  };
}

// ─── JSON Repair ──────────────────────────────────────────────────────────────
async function repairJson(file: File): Promise<RepairResult> {
  const issues: string[] = [];
  const fixed: string[] = [];
  let text = await file.text();

  // Xóa BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    fixed.push('Đã xóa BOM');
  }

  // Thử parse, nếu lỗi thì cố gắng tự sửa trailing comma
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
    fixed.push('JSON hợp lệ');
  } catch {
    issues.push('JSON có lỗi cú pháp');
    // Sửa trailing comma phổ biến
    const fixed1 = text.replace(/,\s*([}\]])/g, '$1');
    try {
      parsed = JSON.parse(fixed1);
      text = fixed1;
      fixed.push('Đã xóa trailing comma');
    } catch {
      issues.push('Không thể tự động sửa lỗi JSON phức tạp');
    }
  }

  const outText = parsed ? JSON.stringify(parsed, null, 2) : text;
  fixed.push('Đã format lại JSON (pretty print)');

  if (issues.length === 0) issues.push('Không phát hiện lỗi cấu trúc');
  const blob = new Blob([outText], { type: 'application/json' });

  return {
    fileName: file.name,
    originalSize: file.size,
    repairedSize: blob.size,
    issues,
    fixed,
    blob,
  };
}

async function repairWord(file: File): Promise<RepairResult> {
  const issues: string[] = [];
  const fixed: string[] = [];
  const buf = await file.arrayBuffer();

  // Kiểm tra magic bytes của ZIP (PK\x03\x04)
  const header = new Uint8Array(buf.slice(0, 4));
  const isZip = header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04;
  if (!isZip) {
    issues.push('File không phải định dạng DOCX hợp lệ (thiếu ZIP header)');
    if (file.name.toLowerCase().endsWith('.doc')) {
      issues.push('File .doc (Word 97-2003) không thể tự sửa — hãy mở bằng Word và lưu lại dưới dạng .docx');
    }
    return { fileName: file.name, originalSize: file.size, repairedSize: 0, issues, fixed };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    issues.push('Không thể mở file DOCX — có thể bị hỏng hoặc bị mã hóa bằng mật khẩu');
    return { fileName: file.name, originalSize: file.size, repairedSize: 0, issues, fixed };
  }

  // Kiểm tra cấu trúc DOCX bắt buộc
  const requiredParts = ['word/document.xml', '[Content_Types].xml', '_rels/.rels'];
  for (const part of requiredParts) {
    if (!zip.file(part)) {
      issues.push(`Thiếu thành phần bắt buộc: ${part}`);
    }
  }

  // Phân tích word/document.xml bằng DOM (an toàn, không regex thô)
  const docXmlFile = zip.file('word/document.xml');
  if (docXmlFile) {
    const rawXml = await docXmlFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawXml, 'application/xml');
    const parseError = xmlDoc.querySelector('parsererror');

    if (parseError) {
      // Có lỗi XML — chỉ báo cáo, KHÔNG sửa để tránh làm file hỏng thêm
      issues.push('XML nội dung có lỗi cú pháp: ' + (parseError.textContent?.slice(0, 120) ?? ''));
      issues.push('Không tự động sửa XML bị lỗi để tránh làm hỏng thêm nội dung');
    } else {
      // XML hợp lệ — dùng DOM API để xóa khoảng trắng thừa trong <w:t> an toàn
      const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const textNodes = xmlDoc.getElementsByTagNameNS(NS_W, 't');
      let trimCount = 0;

      for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        const original = node.textContent ?? '';
        // Chỉ xóa khoảng trắng tab/space thừa ở giữa, giữ nguyên đầu/cuối
        const cleaned = original.replace(/[ \t]{3,}/g, '  ');
        if (cleaned !== original) {
          node.textContent = cleaned;
          // Đảm bảo xml:space="preserve" được giữ
          if (!node.hasAttribute('xml:space')) {
            node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
          }
          trimCount++;
        }
      }

      if (trimCount > 0) {
        // Serialize DOM lại thành XML string
        const serializer = new XMLSerializer();
        const newXml = serializer.serializeToString(xmlDoc);
        zip.file('word/document.xml', newXml);
        fixed.push(`Xóa khoảng trắng thừa trong ${trimCount} đoạn văn bản`);
      } else {
        fixed.push('Nội dung văn bản không có khoảng trắng thừa');
      }
      fixed.push('Cấu trúc XML nội dung hợp lệ');
    }
  }

  if (issues.length === 0) issues.push('Không phát hiện lỗi cấu trúc');
  fixed.push('Xuất lại file DOCX sạch');

  const outBuf = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const blob = new Blob([outBuf], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  return {
    fileName: file.name,
    originalSize: file.size,
    repairedSize: blob.size,
    issues,
    fixed,
    blob,
  };
}


// ─── TXT Repair ───────────────────────────────────────────────────────────────
async function repairTxt(file: File): Promise<RepairResult> {
  const issues: string[] = [];
  const fixed: string[] = [];
  let text = await file.text();

  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    fixed.push('Đã xóa BOM');
  }

  // Chuẩn hóa line ending
  const crlfCount = (text.match(/\r\n/g) || []).length;
  const crCount = (text.match(/\r(?!\n)/g) || []).length;
  if (crlfCount > 0 || crCount > 0) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    fixed.push(`Đã chuẩn hóa line ending (${crlfCount + crCount} dòng CRLF/CR → LF)`);
    if (crlfCount > 0) issues.push(`${crlfCount} dòng dùng CRLF (Windows)`);
  }

  // Xóa khoảng trắng cuối mỗi dòng
  const lines = text.split('\n');
  let trailingFixed = 0;
  const cleanedLines = lines.map(l => {
    const t = l.trimEnd();
    if (t !== l) trailingFixed++;
    return t;
  });
  if (trailingFixed > 0) {
    text = cleanedLines.join('\n');
    fixed.push(`Đã xóa khoảng trắng cuối dòng (${trailingFixed} dòng)`);
  }

  if (issues.length === 0) issues.push('Không phát hiện lỗi cấu trúc');
  fixed.push('Đã xuất lại file sạch');
  const blob = new Blob([text], { type: 'text/plain' });

  return {
    fileName: file.name,
    originalSize: file.size,
    repairedSize: blob.size,
    issues,
    fixed,
    blob,
  };
}

// ─── Kiểm tra khả năng in ─────────────────────────────────────────────────────
async function checkPrintability(file: File): Promise<PrintCheck> {
  const warnings: string[] = [];
  const tips: string[] = [];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const MB = file.size / (1024 * 1024);

  if (MB > 50) warnings.push(`File quá lớn (${MB.toFixed(1)} MB) — có thể gây treo máy in`);

  if (['xlsx', 'xls'].includes(ext)) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const cols = range.e.c - range.s.c + 1;
        const rows = range.e.r - range.s.r + 1;
        if (cols > 50) warnings.push(`Sheet "${name}": có ${cols} cột — dễ bị cắt khi in`);
        if (rows > 5000) warnings.push(`Sheet "${name}": có ${rows} dòng — nên chia nhỏ trước khi in`);
        if (!ws['!pageSetup']) tips.push(`Sheet "${name}" chưa có thiết lập trang in (Page Setup)`);
      }
      tips.push('Mở Excel → Ctrl+P để xem trước, chọn "Fit Sheet on One Page" nếu cần');
    } catch {
      warnings.push('Không đọc được file Excel — có thể bị hỏng hoặc bị khóa');
    }
  }

  if (ext === 'csv') {
    tips.push('File CSV không hỗ trợ in trực tiếp — mở bằng Excel rồi in');
  }
  if (ext === 'xml') {
    tips.push('File XML không hỗ trợ in trực tiếp — dùng trình duyệt hoặc convert sang HTML');
  }
  if (ext === 'json') {
    tips.push('File JSON không hỗ trợ in trực tiếp — dùng notepad++ hoặc convert sang bảng');
  }
  if (ext === 'txt') {
    tips.push('Mở Notepad → Ctrl+P để in. Chọn font và margin phù hợp trước khi in');
  }
  if (['docx', 'doc'].includes(ext)) {
    tips.push('Mở file bằng Microsoft Word → Ctrl+P để in. Kiểm tra lề và khổ giấy trước khi in');
    if (MB > 20) warnings.push(`File Word khá lớn (${MB.toFixed(1)} MB) — có thể chứa nhiều hình ảnh`);
  }

  const canPrint = warnings.length === 0;
  return { canPrint, warnings, tips };
}

// ─── Tự động căn chỉnh văn bản Excel ─────────────────────────────────────────────────────
async function alignExcel(file: File): Promise<RepairResult> {
  const issues: string[] = [];
  const fixed: string[] = [];
  const buf = await file.arrayBuffer();

  const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellNF: true });

  let headerCells = 0;
  let dataCells = 0;
  let widthFixed = 0;
  let wrapFixed = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws['!ref']) { issues.push(`Sheet "${sheetName}" rỗng`); continue; }
    const range = XLSX.utils.decode_range(ws['!ref']);
    const numCols = range.e.c - range.s.c + 1;

    // ─ 1. Căn chỉnh header (dòng đầu tiên): in đậm, nền xanh, chữ trắng, căn giữa ─
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: range.s.r, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: '1E40AF' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top:    { style: 'thin', color: { rgb: 'BFDBFE' } },
          bottom: { style: 'thin', color: { rgb: 'BFDBFE' } },
          left:   { style: 'thin', color: { rgb: 'BFDBFE' } },
          right:  { style: 'thin', color: { rgb: 'BFDBFE' } },
        },
      };
      headerCells++;
    }

    // ─ 2. Căn chỉnh dàng dữ liệu: số căn phải, text căn trái, ngày căn giữa ─
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const isAlt = (R - range.s.r) % 2 === 0; // zebra stripe
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        const cell = ws[addr];
        const isNum = cell.t === 'n';
        const isDate = cell.t === 'd' || (cell.t === 's' && /\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(String(cell.v)));
        const halign = isNum ? 'right' : isDate ? 'center' : 'left';

        cell.s = {
          font: { sz: 10, color: { rgb: '1E293B' } },
          fill: { fgColor: { rgb: isAlt ? 'EFF6FF' : 'FFFFFF' } },
          alignment: { horizontal: halign, vertical: 'center', wrapText: true },
          border: {
            top:    { style: 'hair', color: { rgb: 'E2E8F0' } },
            bottom: { style: 'hair', color: { rgb: 'E2E8F0' } },
            left:   { style: 'hair', color: { rgb: 'E2E8F0' } },
            right:  { style: 'hair', color: { rgb: 'E2E8F0' } },
          },
        };
        dataCells++;
        wrapFixed++;
      }
    }

    // ─ 3. Tự động căn độ rộng cột dựa trên nội dung ─
    const colWidths: { wch: number }[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      let maxLen = 10;
      for (let R = range.s.r; R <= range.e.r; R++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (!cell) continue;
        const len = String(cell.w || cell.v || '').length;
        if (len > maxLen) maxLen = len;
      }
      // Giới hạn tối đa 40 ký tự, tối thiểu 8
      colWidths.push({ wch: Math.min(Math.max(maxLen + 2, 8), 40) });
      widthFixed++;
    }
    ws['!cols'] = colWidths;

    // ─ 4. Cố định chiều cao dòng header ─
    ws['!rows'] = ws['!rows'] || [];
    ws['!rows'][range.s.r] = { hpt: 20 }; // 20pt ~ 27px

    // ─ 5. Thiết lập Page Setup cướng buộc in ─
    ws['!pageSetup'] = {
      orientation: numCols > 10 ? 'landscape' : 'portrait',
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
    };
    ws['!printOptions'] = { gridLines: false };
    ws['!margins'] = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
  }

  if (headerCells > 0) fixed.push(`Căn chỉnh header: ${headerCells} ô (in đậm, nền xanh, căn giữa)`);
  if (dataCells > 0) fixed.push(`Căn chỉnh dữ liệu: ${dataCells} ô (số → căn phải, text → căn trái, ngày → căn giữa, xuất hiện xen kẽ màu)`);
  if (widthFixed > 0) fixed.push(`Tự động căn độ rộng ${widthFixed} cột theo nội dung (tối đa 40 ký tự)`);
  if (wrapFixed > 0) fixed.push('Bật Word Wrap (xuống dòng tự động trong ô)');
  fixed.push('Thiết lập trang in: khổ A4, căn lề, hướng giấy tự động');

  if (issues.length === 0) issues.push('Không phát hiện vấn đề cấu trúc');

  const outBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
  const blob = new Blob([outBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  return {
    fileName: file.name,
    originalSize: file.size,
    repairedSize: blob.size,
    issues,
    fixed,
    blob,
  };
}

async function repairFile(file: File): Promise<RepairResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  let result: RepairResult;
  if (['xlsx', 'xls', 'csv'].includes(ext)) result = await repairExcel(file);
  else if (ext === 'xml') result = await repairXml(file);
  else if (ext === 'json') result = await repairJson(file);
  else if (ext === 'txt') result = await repairTxt(file);
  else if (['docx', 'doc'].includes(ext)) result = await repairWord(file);
  else throw new Error(`Chưa hỗ trợ định dạng .${ext}`);

  result.printCheck = await checkPrintability(file);
  return result;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ─── Danh sách định dạng đích có thể chuyển theo loại file ───────────────────────
function getConvertTargets(ext: string): { label: string; value: string; color: string }[] {
  switch (ext) {
    case 'xlsx': case 'xls':
      return [
        { label: 'CSV', value: 'csv', color: '#10b981' },
        { label: 'JSON', value: 'json', color: '#3b82f6' },
        { label: 'TXT (tab)', value: 'txt', color: '#f59e0b' },
        { label: 'XML', value: 'xml', color: '#6366f1' },
      ];
    case 'csv':
      return [
        { label: 'Excel (.xlsx)', value: 'xlsx', color: '#10b981' },
        { label: 'JSON', value: 'json', color: '#3b82f6' },
        { label: 'XML', value: 'xml', color: '#6366f1' },
        { label: 'TXT (tab)', value: 'txt', color: '#f59e0b' },
      ];
    case 'xml':
      return [
        { label: 'Excel (.xlsx)', value: 'xlsx', color: '#10b981' },
        { label: 'CSV', value: 'csv', color: '#10b981' },
        { label: 'JSON', value: 'json', color: '#3b82f6' },
      ];
    case 'json':
      return [
        { label: 'Excel (.xlsx)', value: 'xlsx', color: '#10b981' },
        { label: 'CSV', value: 'csv', color: '#10b981' },
        { label: 'TXT', value: 'txt', color: '#f59e0b' },
        { label: 'XML', value: 'xml', color: '#6366f1' },
      ];
    case 'txt':
      return [
        { label: 'CSV', value: 'csv', color: '#10b981' },
        { label: 'Excel (.xlsx)', value: 'xlsx', color: '#10b981' },
      ];
    case 'docx': case 'doc':
      return [
        { label: 'TXT (văn bản thuần)', value: 'txt', color: '#f59e0b' },
        { label: 'HTML', value: 'html', color: '#e11d48' },
      ];
    default:
      return [];
  }
}

// ─── Hàm chuyển định dạng file ──────────────────────────────────────────────────────
async function convertFile(file: File, targetFmt: string): Promise<{ blob: Blob; fileName: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  // ─ Đọc dữ liệu bảng tới ─────────────────────────────────────────────────────
  // Nhóm 1: Excel/CSV/JSON/TXT → bảng (rows + headers)
  const isTableSource = ['xlsx', 'xls', 'csv', 'json', 'txt'].includes(ext);
  if (isTableSource) {
    let rows: Record<string, unknown>[] = [];
    let headers: string[] = [];

    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    } else if (ext === 'json') {
      const text = await file.text();
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : [parsed];
      headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    } else if (ext === 'txt') {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        // Phát hiện dấu phân cách: tab, pipe, semicolon, comma
        const sep = lines[0].includes('\t') ? '\t'
          : lines[0].includes('|') ? '|'
          : lines[0].includes(';') ? ';'
          : lines[0].includes(',') ? ','
          : null;
        if (sep) {
          headers = lines[0].split(sep).map(h => h.trim());
          rows = lines.slice(1).map(l => {
            const vals = l.split(sep!);
            return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? '']));
          });
        } else {
          headers = ['Nội dung'];
          rows = lines.map(l => ({ 'Nội dung': l }));
        }
      }
    }

    // Xuất sang định dạng đích
    if (targetFmt === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName: `${baseName}.xlsx` };
    }
    if (targetFmt === 'csv') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      const csv = XLSX.utils.sheet_to_csv(ws);
      return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName: `${baseName}.csv` };
    }
    if (targetFmt === 'json') {
      return { blob: new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), fileName: `${baseName}.json` };
    }
    if (targetFmt === 'txt') {
      const lines = [headers.join('\t'), ...rows.map(r => headers.map(h => String(r[h] ?? '')).join('\t'))];
      return { blob: new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), fileName: `${baseName}.txt` };
    }
    if (targetFmt === 'xml') {
      const xmlLines = ['<?xml version="1.0" encoding="UTF-8"?>', '<data>'];
      for (const row of rows) {
        xmlLines.push('  <row>');
        for (const [k, v] of Object.entries(row)) {
          const tag = k.replace(/[^a-zA-Z0-9_]/g, '_') || 'field';
          const val = String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          xmlLines.push(`    <${tag}>${val}</${tag}>`);
        }
        xmlLines.push('  </row>');
      }
      xmlLines.push('</data>');
      return { blob: new Blob([xmlLines.join('\n')], { type: 'application/xml' }), fileName: `${baseName}.xml` };
    }
  }

  // Nhóm 2: XML → bảng
  if (ext === 'xml') {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const children = Array.from(doc.documentElement.children);
    const rows: Record<string, string>[] = children.map(el => {
      const obj: Record<string, string> = {};
      Array.from(el.children).forEach(c => { obj[c.tagName] = c.textContent ?? ''; });
      if (Object.keys(obj).length === 0) obj['_text'] = el.textContent ?? '';
      return obj;
    });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    if (targetFmt === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName: `${baseName}.xlsx` };
    }
    if (targetFmt === 'csv') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      const csv = XLSX.utils.sheet_to_csv(ws);
      return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName: `${baseName}.csv` };
    }
    if (targetFmt === 'json') {
      return { blob: new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), fileName: `${baseName}.json` };
    }
    if (targetFmt === 'txt') {
      const lines = [headers.join('\t'), ...rows.map(r => headers.map(h => r[h] ?? '').join('\t'))];
      return { blob: new Blob([lines.join('\n')], { type: 'text/plain' }), fileName: `${baseName}.txt` };
    }
  }

  // Nhóm 3: DOCX → TXT / HTML
  if (['docx', 'doc'].includes(ext)) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) throw new Error('Không đọc được nội dung DOCX');
    const rawXml = await docXmlFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawXml, 'application/xml');

    // Thu thập các đoạn văn (paragraph)
    const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = xmlDoc.getElementsByTagNameNS(NS_W, 'p');
    const paraTexts: string[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const tNodes = paragraphs[i].getElementsByTagNameNS(NS_W, 't');
      let line = '';
      for (let j = 0; j < tNodes.length; j++) line += tNodes[j].textContent ?? '';
      paraTexts.push(line);
    }

    if (targetFmt === 'txt') {
      return { blob: new Blob([paraTexts.join('\n')], { type: 'text/plain;charset=utf-8' }), fileName: `${baseName}.txt` };
    }
    if (targetFmt === 'html') {
      const htmlLines = paraTexts.map(t => `<p>${t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`);
      const html = `<!DOCTYPE html>\n<html lang="vi">\n<head><meta charset="UTF-8"><title>${baseName}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:0 auto}p{margin:0.5em 0}</style></head>\n<body>\n${htmlLines.join('\n')}\n</body>\n</html>`;
      return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), fileName: `${baseName}.html` };
    }
  }

  throw new Error(`Không thể chuyển định dạng từ .${ext} sang .${targetFmt}`);
}

export function FileRepairTab() {
  const [items, setItems] = useState<FileItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [aligningIdx, setAligningIdx] = useState<number | null>(null);
  const [convertMenuIdx, setConvertMenuIdx] = useState<number | null>(null);
  const [convertingIdx, setConvertingIdx] = useState<number | null>(null);

  // Đóng convert menu khi click ra ngoài
  useEffect(() => {
    if (convertMenuIdx === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-convert-menu]')) setConvertMenuIdx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [convertMenuIdx]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setItems(prev => [
      ...prev,
      ...arr.map(f => ({ file: f, status: 'idle' as RepairStatus }))
    ]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const repairOne = async (idx: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, status: 'processing' } : it));
    try {
      const result = await repairFile(items[idx].file);
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, status: 'done', result } : it));
    } catch (e) {
      setItems(prev => prev.map((it, i) => i === idx ? {
        ...it,
        status: 'error',
        result: {
          fileName: it.file.name,
          originalSize: it.file.size,
          repairedSize: 0,
          issues: [(e as Error).message],
          fixed: [],
        }
      } : it));
    }
  };

  const repairAll = async () => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'idle') {
        await repairOne(i);
      }
    }
  };

  const alignOne = async (idx: number) => {
    const item = items[idx];
    const ext = item.file.name.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'xls'].includes(ext)) return;
    setAligningIdx(idx);
    try {
      const result = await alignExcel(item.file);
      result.printCheck = await checkPrintability(item.file);
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, status: 'done', result } : it));
    } catch (e) {
      setItems(prev => prev.map((it, i) => i === idx ? {
        ...it, status: 'error',
        result: { fileName: it.file.name, originalSize: it.file.size, repairedSize: 0, issues: [(e as Error).message], fixed: [] }
      } : it));
    } finally {
      setAligningIdx(null);
    }
  };

  const downloadResult = (item: FileItem) => {
    if (!item.result?.blob) return;
    const ext = item.file.name.split('.').pop() || 'xlsx';
    const baseName = item.file.name.replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(item.result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_repaired.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const convertOne = async (idx: number, targetFmt: string) => {
    setConvertMenuIdx(null);
    setConvertingIdx(idx);
    // Xóa kết quả convert cũ trước khi chạy
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, convertResult: undefined, convertError: undefined } : it));
    try {
      const { blob, fileName } = await convertFile(items[idx].file, targetFmt);
      // Lỗi #11 fix: lưu kết quả convert vào state thay vì tự động tải — cho user chủ động tải
      setItems(prev => prev.map((it, i) =>
        i === idx ? { ...it, convertResult: { targetFmt, blob, fileName, status: 'done' } } : it
      ));
    } catch (e) {
      // Lỗi #11 fix: hiển thị lỗi inline thay vì alert()
      setItems(prev => prev.map((it, i) =>
        i === idx ? { ...it, convertResult: { targetFmt, blob: new Blob(), fileName: '', status: 'error', errorMsg: (e as Error).message } } : it
      ));
    } finally {
      setConvertingIdx(null);
    }
  };

  const downloadConvertResult = (item: FileItem) => {
    if (!item.convertResult?.blob || item.convertResult.status !== 'done') return;
    const url = URL.createObjectURL(item.convertResult.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.convertResult.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearConvertResult = (idx: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, convertResult: undefined, convertError: undefined } : it));
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wrench size={22} color="#f59e0b" /> Sửa Lỗi File
        </h2>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
          Tự động phát hiện và sửa các lỗi phổ biến trong file Excel, XML, JSON, CSV, TXT, Word
        </p>
      </div>

      {/* Supported formats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILE_TYPES.map(t => (
          <div key={t.label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20,
            background: t.color + '15', border: `1px solid ${t.color}40`,
            fontSize: '0.82rem', fontWeight: 600, color: t.color
          }}>
            {t.icon} .{t.ext.join(' .')}
          </div>
        ))}
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#3b82f6' : '#cbd5e1'}`,
          borderRadius: 12,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#eff6ff' : '#f8fafc',
          transition: 'all 0.2s',
          marginBottom: 20,
        }}
      >
        <Upload size={36} color={dragging ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: 12 }} />
        <div style={{ color: dragging ? '#2563eb' : '#475569', fontWeight: 600, fontSize: '1rem' }}>
          Kéo thả file vào đây hoặc bấm để chọn
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 4 }}>
          Hỗ trợ: .xlsx · .xls · .csv · .xml · .json · .txt · .docx · .doc
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.xml,.json,.txt,.docx,.doc"
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* Actions */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={repairAll}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: '#f59e0b', color: 'white', cursor: 'pointer',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem'
            }}
          >
            <Wrench size={16} /> Sửa Tất Cả
          </button>
          <button
            onClick={() => setItems([])}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: 'white', color: '#64748b', cursor: 'pointer',
              fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem'
            }}
          >
            <Trash2 size={15} /> Xóa tất cả
          </button>
        </div>
      )}

      {/* File List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '14px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}>
            {/* Row header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: item.result ? 12 : 0 }}>
              {getFileIcon(item.file.name)}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{fmtSize(item.file.size)}</div>
              </div>

              {/* Status badge */}
              {item.status === 'idle' && (
                <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '2px 10px', borderRadius: 20 }}>
                  Chờ xử lý
                </span>
              )}
              {item.status === 'processing' && (
                <span style={{ fontSize: '0.8rem', color: '#2563eb', background: '#eff6ff', padding: '2px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý...
                </span>
              )}
              {item.status === 'done' && (
                <span style={{ fontSize: '0.8rem', color: '#10b981', background: '#ecfdf5', padding: '2px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={13} /> Xong
                </span>
              )}
              {item.status === 'error' && (
                <span style={{ fontSize: '0.8rem', color: '#ef4444', background: '#fef2f2', padding: '2px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={13} /> Lỗi
                </span>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                {(item.status === 'idle' || item.status === 'done' || item.status === 'error') && (
                  <button onClick={() => repairOne(idx)} style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none',
                    background: item.status === 'done' ? '#64748b' : '#f59e0b',
                    color: 'white', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    <Wrench size={13} /> {item.status === 'done' ? 'Chạy lại' : 'Sửa lỗi'}
                  </button>
                )}
                {['xlsx','xls'].includes(item.file.name.split('.').pop()?.toLowerCase() || '') && item.status === 'idle' && (
                  <button onClick={() => alignOne(idx)} style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none',
                    background: '#6366f1', color: 'white', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    <AlignLeft size={13} /> Căn chỉnh
                  </button>
                )}
                {/* Nút Chuyển định dạng — lỗi #11 fix: cho phép convert mọi trạng thái + data-convert-menu để đóng khi click ngoài */}
                {getConvertTargets(item.file.name.split('.').pop()?.toLowerCase() || '').length > 0 && (
                  <div style={{ position: 'relative' }} data-convert-menu>
                    <button
                      onClick={() => setConvertMenuIdx(convertMenuIdx === idx ? null : idx)}
                      disabled={convertingIdx === idx}
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: 'none',
                        background: convertingIdx === idx ? '#94a3b8' : '#0ea5e9',
                        color: 'white', cursor: convertingIdx === idx ? 'default' : 'pointer',
                        fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                      }}
                    >
                      {convertingIdx === idx
                        ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Đang chuyển...</>
                        : <><ArrowLeftRight size={13} /> Chuyển ▾</>
                      }
                    </button>
                    {convertMenuIdx === idx && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, zIndex: 100,
                        background: 'white', border: '1px solid #e2e8f0',
                        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                        minWidth: 175, marginTop: 4, overflow: 'hidden',
                      }}>
                        <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Chuyển sang định dạng:</span>
                          <button onClick={() => setConvertMenuIdx(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex' }}>
                            <X size={12} />
                          </button>
                        </div>
                        {getConvertTargets(item.file.name.split('.').pop()?.toLowerCase() || '').map(target => (
                          <button
                            key={target.value}
                            onClick={() => convertOne(idx, target.value)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              width: '100%', padding: '8px 14px',
                              border: 'none', background: 'none', cursor: 'pointer',
                              fontSize: '0.85rem', color: '#0f172a', textAlign: 'left',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: target.color, flexShrink: 0 }} />
                            {target.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {aligningIdx === idx && (
                  <span style={{ fontSize: '0.8rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Đang căn chỉnh...
                  </span>
                )}
                {item.status === 'done' && item.result?.blob && (
                  <button onClick={() => downloadResult(item)} style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none',
                    background: '#10b981', color: 'white', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    <Download size={13} /> Tải về
                  </button>
                )}
                <button onClick={() => removeItem(idx)} style={{
                  padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
                  background: 'white', color: '#94a3b8', cursor: 'pointer', flexShrink: 0
                }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Lỗi #11 fix: kết quả convert hiển thị inline dưới header row */}
            {item.convertResult && (
              <div style={{
                margin: '8px 0 0',
                padding: '8px 14px',
                borderRadius: 8,
                background: item.convertResult.status === 'done' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${item.convertResult.status === 'done' ? '#86efac' : '#fca5a5'}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {item.convertResult.status === 'done' ? (
                  <>
                    <CheckCircle size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: '#166534', flex: 1 }}>
                      Đã chuyển xong: <strong>{item.convertResult.fileName}</strong>
                    </span>
                    <button
                      onClick={() => downloadConvertResult(item)}
                      style={{
                        padding: '4px 12px', borderRadius: 6, border: 'none',
                        background: '#16a34a', color: 'white', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0
                      }}
                    >
                      <Download size={12} /> Tải về
                    </button>
                    <button
                      onClick={() => clearConvertResult(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, flexShrink: 0, display: 'flex' }}
                      title="Đóng"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} color="#dc2626" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: '#dc2626', flex: 1 }}>
                      Lỗi chuyển định dạng: {item.convertResult.errorMsg}
                    </span>
                    <button
                      onClick={() => clearConvertResult(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2, flexShrink: 0, display: 'flex' }}
                      title="Đóng"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Result detail */}
            {item.result && (
              <div>
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Issues */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={13} /> Phát hiện ({item.result.issues.length})
                    </div>
                    {item.result.issues.map((iss, i) => (
                      <div key={i} style={{ fontSize: '0.82rem', color: '#64748b', padding: '2px 0', display: 'flex', gap: 6 }}>
                        <Info size={12} style={{ flexShrink: 0, marginTop: 2, color: '#f59e0b' }} />
                        {iss}
                      </div>
                    ))}
                  </div>
                  {/* Fixed */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={13} /> Đã sửa ({item.result.fixed.length})
                    </div>
                    {item.result.fixed.map((f, i) => (
                      <div key={i} style={{ fontSize: '0.82rem', color: '#64748b', padding: '2px 0', display: 'flex', gap: 6 }}>
                        <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 2, color: '#10b981' }} />
                        {f}
                      </div>
                    ))}
                    {item.result.repairedSize > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 6 }}>
                        Kích thước: {fmtSize(item.result.originalSize)} → {fmtSize(item.result.repairedSize)}
                      </div>
                    )}
                  </div>
                </div>
                {/* Print check */}
                {item.result.printCheck && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px', borderRadius: 8,
                    background: item.result.printCheck.canPrint ? '#ecfdf5' : '#fffbeb',
                    border: `1px solid ${item.result.printCheck.canPrint ? '#6ee7b7' : '#fcd34d'}`,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
                      color: item.result.printCheck.canPrint ? '#065f46' : '#92400e' }}>
                      {item.result.printCheck.canPrint
                        ? <><CheckCircle size={14} /> File có thể in bình thường</>
                        : <><AlertTriangle size={14} /> Cảnh báo khi in</>
                      }
                    </div>
                    {item.result.printCheck.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: '0.82rem', color: '#b45309', display: 'flex', gap: 6, marginBottom: 3 }}>
                        <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {w}
                      </div>
                    ))}
                    {item.result.printCheck.tips.map((t, i) => (
                      <div key={i} style={{ fontSize: '0.82rem', color: '#475569', display: 'flex', gap: 6, marginBottom: 3 }}>
                        <Info size={12} style={{ flexShrink: 0, marginTop: 2, color: '#3b82f6' }} /> {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: '0.9rem' }}>
          <Wrench size={40} color="#e2e8f0" style={{ marginBottom: 12 }} />
          <div>Chưa có file nào. Kéo thả hoặc bấm vùng trên để thêm file.</div>
        </div>
      )}
    </div>
  );
}
