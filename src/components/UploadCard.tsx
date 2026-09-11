import React, { useCallback, useState } from 'react';
import { UploadCloud, FileCheck2, FileSpreadsheet, FileCode2, FileText, X, Eye } from 'lucide-react';
import type { FileFormat } from '../types';

interface UploadCardProps {
  title: string;
  subtitle: string;
  exampleName: string;
  file: File | null;
  format: FileFormat | null;
  onFileChange: (file: File | null) => void;
  color?: string;
  previewRows?: Record<string, unknown>[];
}

const FORMAT_ICONS: Record<string, React.ReactElement> = {
  excel: <FileSpreadsheet size={18} />,
  xml:   <FileCode2 size={18} />,
  csv:   <FileText size={18} />,
};

const FORMAT_COLORS: Record<string, string> = {
  excel: '#10b981',
  xml:   '#6366f1',
  csv:   '#f59e0b',
};

export function UploadCard({
  title, subtitle, exampleName, file, format, onFileChange, color = '#10b981', previewRows,
}: UploadCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) onFileChange(droppedFile);
  }, [onFileChange]);

  const activeColor = format ? FORMAT_COLORS[format] ?? color : color;

  return (
    <div
      className={`upload-card ${file ? 'active' : ''} ${dragOver ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      style={file ? { borderColor: activeColor, background: `${activeColor}08` } : {}}
    >
      <UploadCloud className="upload-icon" size={44} style={{ color: activeColor }} />
      <h3 className="upload-title">{title}</h3>
      <p className="upload-subtitle">{subtitle}</p>

      {/* Format badges */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {(['excel', 'xml', 'csv'] as FileFormat[]).map(f => (
          <span
            key={f}
            className="format-badge"
            style={{
              background: format === f ? FORMAT_COLORS[f] : '#f1f5f9',
              color: format === f ? 'white' : '#64748b',
            }}
          >
            {FORMAT_ICONS[f]} {f.toUpperCase()}
          </span>
        ))}
      </div>

      <div className="file-input-wrapper">
        <button className="btn-upload">
          <FileSpreadsheet size={18} />
          Chọn tệp
        </button>
        <input
          type="file"
          accept=".xlsx,.xls,.xml,.csv"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
        />
      </div>

      {file ? (
        <div style={{ marginTop: '0.75rem', width: '100%' }}>
          <div className="file-name" style={{ color: activeColor, justifyContent: 'center' }}>
            <FileCheck2 size={16} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {file.name}
            </span>
            <span className="format-badge" style={{ background: FORMAT_COLORS[format ?? 'excel'], color: 'white', fontSize: '0.65rem' }}>
              {format?.toUpperCase()}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', lineHeight: 1 }}
              title="Xóa tệp"
            ><X size={14} /></button>
          </div>

          {previewRows && previewRows.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => setShowPreview(!showPreview)}
              style={{ marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
            >
              <Eye size={14} /> {showPreview ? 'Ẩn' : 'Xem'} {previewRows.length} dòng
            </button>
          )}

          {showPreview && previewRows && previewRows.length > 0 && (
            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    {Object.keys(previewRows[0]).slice(0, 6).map(k => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).slice(0, 6).map((v, j) => (
                        <td key={j}>{String(v).substring(0, 20)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="upload-hint">Kéo thả hoặc click chọn tệp · Ví dụ: {exampleName}</p>
      )}
    </div>
  );
}
