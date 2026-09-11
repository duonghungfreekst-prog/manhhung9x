import { useState } from 'react';
import { FileCheck2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { ComparedResult, MatchStatus } from '../types';

interface ResultsTableProps {
  results: ComparedResult[];
  filter: MatchStatus | 'TẤT CẢ';
  searchQuery: string;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function getStatusClass(status: MatchStatus): string {
  switch (status) {
    case 'KHỚP':      return 'status-khop';
    case 'LỆCH':      return 'status-lech';
    case 'KHÔNG THẤY': return 'status-khongthay';
    default:          return '';
  }
}

function SeverityDot({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const colors = { high: '#ef4444', medium: '#f59e0b', low: '#94a3b8' };
  const labels = { high: 'Nghiêm trọng', medium: 'Vừa', low: 'Nhẹ' };
  return (
    <span
      title={labels[severity]}
      style={{
        display: 'inline-block', width: 8, height: 8,
        borderRadius: '50%', background: colors[severity],
        marginRight: 4, flexShrink: 0,
      }}
    />
  );
}

function PatientRow({ r }: { r: ComparedResult }) {
  const [expanded, setExpanded] = useState(false);
  const highCount = r.differences.filter(d => d.severity === 'high').length;

  return (
    <>
      <tr
        className={`result-row ${expanded ? 'expanded' : ''}`}
        onClick={() => r.status !== 'KHỚP' && setExpanded(!expanded)}
        style={{ cursor: r.status !== 'KHỚP' ? 'pointer' : 'default' }}
      >
        <td>
          <span className={`status-label ${getStatusClass(r.status)}`}>
            {r.status}
          </span>
          {r.status === 'LỆCH' && highCount > 0 && (
            <span className="severity-badge high">{highCount} nghiêm trọng</span>
          )}
        </td>
        <td>
          <div className="patient-info">
            <span className="patient-name">{r.name}</span>
            <span className="patient-id">
              <span className="label-muted">Mã thẻ:</span> {r.insuranceCode || '—'}
            </span>
            <span className="patient-time">
              <span className="label-muted">KCB:</span> {r.timeRange}
            </span>
          </div>
        </td>
        <td>
          {r.status === 'KHỚP' ? (
            <div className="diff-success">
              <CheckCircle2 size={16} />
              Mọi dữ liệu trùng khớp hoàn toàn
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.differences.slice(0, expanded ? undefined : 2).map((d, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div className={`diff-item-inline severity-${d.severity}`}>
                    <SeverityDot severity={d.severity} />
                    <span className="diff-field">{d.field}:</span>
                    <span className="diff-portal">{d.portalValue}</span>
                    <span className="diff-arrow">→</span>
                    <span className="diff-internal">{d.internalValue}</span>
                  </div>
                  {d.note && (
                    <span style={{
                      fontSize: '0.7rem', color: '#92400e',
                      background: '#fef3c7', border: '1px solid #fbbf24',
                      borderRadius: 4, padding: '1px 6px',
                      alignSelf: 'flex-start', marginLeft: 12,
                    }}>
                      {d.note}
                    </span>
                  )}
                </div>
              ))}
              {r.differences.length > 2 && (
                <button
                  className="expand-btn"
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                >
                  {expanded ? <><ChevronUp size={14}/> Thu gọn</> : <><ChevronDown size={14}/> +{r.differences.length - 2} mục khác</>}
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

export function ResultsTable({ results, filter, searchQuery, page, pageSize, onPageChange }: ResultsTableProps) {
  const filtered = results.filter(r => {
    const matchFilter = filter === 'TẤT CẢ' || r.status === filter;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      r.name.toLowerCase().includes(q) ||
      r.insuranceCode.toLowerCase().includes(q) ||
      r.differences.some(d => d.field.toLowerCase().includes(q));
    return matchFilter && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <FileCheck2 size={56} opacity={0.25} />
        <p style={{ fontSize: '1rem', maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          Vui lòng tải lên 2 tệp dữ liệu <strong>(Excel / XML / CSV)</strong> và nhấn <strong>"BẮT ĐẦU ĐỐI CHIẾU"</strong>
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="empty-state">
        <AlertCircle size={56} opacity={0.25} />
        <p>Không có kết quả phù hợp với bộ lọc.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>TRẠNG THÁI</th>
              <th style={{ width: '32%' }}>THÔNG TIN BỆNH NHÂN</th>
              <th>CHI TIẾT SAI LỆCH (CỔNG GIÁM ĐỊNH vs 01/BH)</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(r => <PatientRow key={r.id + r.name} r={r} />)}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <span className="pagination-info">
            Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} / {filtered.length} bản ghi
          </span>
          <div className="pagination-controls">
            <button
              className="page-btn"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
            >«</button>
            <button
              className="page-btn"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >‹</button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              return (
                <button
                  key={p}
                  className={`page-btn ${p === page ? 'active' : ''}`}
                  onClick={() => onPageChange(p)}
                >{p}</button>
              );
            })}

            <button
              className="page-btn"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >›</button>
            <button
              className="page-btn"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}
