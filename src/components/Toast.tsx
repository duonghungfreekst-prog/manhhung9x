import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const ICONS = {
  success: <CheckCircle2 size={22} className="text-success" />,
  error: <AlertTriangle size={22} style={{ color: '#ef4444' }} />,
  warning: <AlertTriangle size={22} style={{ color: '#f59e0b' }} />,
};

const BORDER_COLORS = {
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
};

function Toast({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div
      className="toast"
      style={{ borderLeftColor: BORDER_COLORS[toast.type] }}
    >
      {ICONS[toast.type]}
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>{toast.title}</p>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>{toast.message}</p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onRemove }: ToastProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}
