import { useState } from 'react';
import { History, Trash2, ChevronRight, Clock } from 'lucide-react';
import type { HistoryEntry } from '../types';
import { loadHistory, clearHistory } from '../utils/excelProcessor';

interface HistoryPanelProps {
  onRestore: (entry: HistoryEntry) => void;
  isOpen?: boolean;
  onClose?: () => void;
  showTriggerButton?: boolean;
}

export function HistoryPanel({ onRestore, isOpen, onClose, showTriggerButton = true }: HistoryPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isOpen !== undefined) {
      if (!val && onClose) onClose();
    } else {
      setInternalOpen(val);
    }
  };

  const handleClear = () => {
    clearHistory();
    setHistory([]);
  };

  if (!open) {
    if (!showTriggerButton) return null;
    return (
      <button
        className="btn-secondary"
        onClick={() => setOpen(true)}
        title="Xem lịch sử đối chiếu"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 9px', borderRadius: 7, height: 30,
          whiteSpace: 'nowrap', fontSize: '0.75rem', fontWeight: 600,
          flexShrink: 0
        }}
      >
        <History size={14} />
        <span>Lịch sử ({history.length})</span>
      </button>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}><Clock size={16} style={{ marginRight: 6 }} />Lịch sử đối chiếu</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {history.length > 0 && (
            <button className="btn-secondary" onClick={handleClear} style={{ color: '#ef4444', fontSize: '0.75rem' }}>
              <Trash2 size={14} /> Xóa tất cả
            </button>
          )}
          <button className="btn-secondary" onClick={() => setOpen(false)}>✕</button>
        </div>
      </div>

      {history.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Chưa có lịch sử</div>
      ) : (
        <div className="history-list">
          {history.map(entry => (
            <div key={entry.id} className="history-item">
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{entry.portalFileName}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>vs {entry.internalFileName}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{entry.timestamp}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span className="stat-pill stat-match" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>Khớp: {entry.stats.khop}</span>
                  <span className="stat-pill stat-diff" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>Lệch: {entry.stats.lech}</span>
                  <span className="stat-pill stat-missing" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>KT: {entry.stats.khongThay}</span>
                </div>
              </div>
              <button className="btn-secondary" onClick={() => { onRestore(entry); setOpen(false); }}>
                <ChevronRight size={16} /> Tải lại
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
