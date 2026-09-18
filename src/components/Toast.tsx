import { useEffect, useState, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, ShieldAlert } from 'lucide-react';
import { 
  type ToastItem, 
  removeToast, 
  subscribeNotifications, 
  getNotificationSnapshot 
} from '../utils/notificationSystem';
import { ModernConfirmDialog, ModernAlertDialog } from './NotificationDialog';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const TOAST_THEMES = {
  success: {
    accent: '#10b981',
    bg: '#ffffff',
    iconBg: '#ecfdf5',
    icon: <CheckCircle2 size={20} color="#10b981" />,
    badge: 'THÀNH CÔNG',
  },
  error: {
    accent: '#ef4444',
    bg: '#ffffff',
    iconBg: '#fef2f2',
    icon: <AlertTriangle size={20} color="#ef4444" />,
    badge: 'SỰ CỐ',
  },
  warning: {
    accent: '#f59e0b',
    bg: '#ffffff',
    iconBg: '#fffbeb',
    icon: <ShieldAlert size={20} color="#f59e0b" />,
    badge: 'CẢNH BÁO',
  },
  info: {
    accent: '#3b82f6',
    bg: '#ffffff',
    iconBg: '#eff6ff',
    icon: <Info size={20} color="#3b82f6" />,
    badge: 'THÔNG TIN',
  },
};

export function ModernToastItem({ 
  toast, 
  onRemove 
}: { 
  toast: ToastItem | ToastMessage; 
  onRemove: (id: string) => void;
}) {
  const duration = ('duration' in toast && toast.duration) ? toast.duration : 4500;
  const theme = TOAST_THEMES[toast.type] || TOAST_THEMES.info;
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef<number>(duration);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (!isPaused) {
      startTimeRef.current = Date.now();
      timer = setTimeout(() => {
        onRemove(toast.id);
      }, remainingRef.current);
    }

    return () => {
      clearTimeout(timer);
      if (!isPaused && startTimeRef.current > 0) {
        const elapsed = Date.now() - startTimeRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      }
    };
  }, [isPaused, toast.id, onRemove]);

  return (
    <div
      className="modern-toast"
      style={{ '--toast-accent': theme.accent } as React.CSSProperties}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div 
        className="modern-toast-icon" 
        style={{ background: theme.iconBg }}
      >
        {theme.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span 
            className="modern-toast-badge"
            style={{ color: theme.accent, borderColor: `${theme.accent}30` }}
          >
            {theme.badge}
          </span>
          <p className="modern-toast-title">
            {toast.title}
          </p>
        </div>
        {toast.message && (
          <p className="modern-toast-desc">
            {toast.message}
          </p>
        )}
      </div>

      <button
        onClick={() => onRemove(toast.id)}
        className="modern-toast-close"
        title="Đóng thông báo"
      >
        <X size={15} />
      </button>

      {/* Thanh tiến trình đếm ngược thời gian tự đóng */}
      <div
        className="modern-toast-progress"
        style={{
          background: theme.accent,
          animationDuration: `${duration}ms`,
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      />
    </div>
  );
}

/**
 * ToastContainer tương thích ngược cho App.tsx
 */
export function ToastContainer({ toasts, onRemove }: ToastProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ModernToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

/**
 * GlobalNotificationContainer: Quản lý TOÀN BỘ thông báo Toast & Hộp thoại xác nhận / alert
 * Đặt duy nhất 1 lần ở gốc của ứng dụng (App.tsx)
 */
export function GlobalNotificationContainer() {
  const [snapshot, setSnapshot] = useState(getNotificationSnapshot);

  useEffect(() => {
    const unsubscribe = subscribeNotifications(() => {
      setSnapshot(getNotificationSnapshot());
    });
    return unsubscribe;
  }, []);

  const { toasts, confirmDialog, alertDialog } = snapshot;

  return (
    <>
      {/* Danh sách Toasts nổi góc phải trên */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <ModernToastItem 
              key={t.id} 
              toast={t} 
              onRemove={removeToast} 
            />
          ))}
        </div>
      )}

      {/* Hộp thoại xác nhận Confirm */}
      {confirmDialog && (
        <ModernConfirmDialog dialog={confirmDialog} />
      )}

      {/* Hộp thoại thông báo kết quả Alert */}
      {alertDialog && (
        <ModernAlertDialog dialog={alertDialog} />
      )}
    </>
  );
}
