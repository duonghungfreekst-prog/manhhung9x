import React, { useEffect, useRef } from 'react';
import { 
  CheckCircle2, AlertTriangle, ShieldAlert, Info, Sparkles, X, 
  ArrowRight, Lightbulb
} from 'lucide-react';
import { 
  closeConfirm, 
  closeAlert, 
  type ConfirmOptions, 
  type AlertOptions
} from '../utils/notificationSystem';

interface ConfirmDialogProps {
  dialog: ConfirmOptions & { id: string };
}

interface AlertDialogProps {
  dialog: AlertOptions & { id: string };
}

// ── Gradient header và màu sắc theo biến thể ────────────────────────────────
const HEADER_THEMES: Record<string, { bg: string; icon: React.ReactNode; badgeText: string; accentColor: string }> = {
  success: {
    bg: 'linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)',
    icon: <CheckCircle2 size={26} color="#ffffff" />,
    badgeText: 'HOÀN TẤT THÀNH CÔNG',
    accentColor: '#10b981',
  },
  danger: {
    bg: 'linear-gradient(135deg, #991b1b 0%, #dc2626 50%, #ef4444 100%)',
    icon: <ShieldAlert size={26} color="#ffffff" />,
    badgeText: 'XÁC NHẬN THAO TÁC NGUY HIỂM',
    accentColor: '#ef4444',
  },
  error: {
    bg: 'linear-gradient(135deg, #991b1b 0%, #dc2626 50%, #ef4444 100%)',
    icon: <AlertTriangle size={26} color="#ffffff" />,
    badgeText: 'SỰ CỐ HỆ THỐNG',
    accentColor: '#ef4444',
  },
  warning: {
    bg: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)',
    icon: <AlertTriangle size={26} color="#ffffff" />,
    badgeText: 'CẢNH BÁO QUAN TRỌNG',
    accentColor: '#f59e0b',
  },
  info: {
    bg: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)',
    icon: <Info size={26} color="#ffffff" />,
    badgeText: 'THÔNG BÁO HỆ THỐNG',
    accentColor: '#3b82f6',
  },
};

/**
 * Format văn bản thông minh: Tự động bôi đậm các từ khóa kỹ thuật và phân tách gạch đầu dòng
 */
function FormattedMessageContent({ rawText }: { rawText: string }) {
  if (!rawText) return null;
  const paragraphs = rawText.split('\n').map(p => p.trim()).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {paragraphs.map((p, idx) => {
        // Nếu là dòng gạch đầu dòng
        if (p.startsWith('•') || p.startsWith('-')) {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.86rem', color: '#334155' }}>
              <span style={{ color: '#0284c7', fontWeight: 700, marginTop: 1 }}>•</span>
              <span style={{ flex: 1, lineHeight: 1.45 }}>{p.replace(/^[•-]\s*/, '')}</span>
            </div>
          );
        }
        // Nếu là dòng gợi ý hành động
        if (p.startsWith('👉') || p.startsWith('💡') || p.toLowerCase().startsWith('lưu ý:')) {
          return (
            <div 
              key={idx} 
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderLeft: '3.5px solid #0284c7',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '0.84rem',
                color: '#1e293b',
                fontWeight: 500,
                marginTop: 4,
              }}
            >
              <Lightbulb size={16} color="#0284c7" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, lineHeight: 1.45 }}>
                {p.replace(/^[👉💡]\s*/u, '')}
              </div>
            </div>
          );
        }
        return (
          <p key={idx} style={{ margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
            {p}
          </p>
        );
      })}
    </div>
  );
}

// ── Component Hộp thoại Xác Nhận (showConfirm) ──────────────────────────────
export function ModernConfirmDialog({ dialog }: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const theme = HEADER_THEMES[dialog.type || 'warning'] || HEADER_THEMES.warning;

  useEffect(() => {
    // Tự động focus vào nút xác nhận khi mở
    confirmBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeConfirm(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        closeConfirm(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      className="modern-dialog-overlay"
      onClick={() => closeConfirm(false)}
    >
      <div 
        className="modern-dialog-box"
        onClick={e => e.stopPropagation()}
        tabIndex={0}
      >
        {/* Header với Gradient tương thích */}
        <div style={{ background: theme.bg, padding: '1.25rem 1.4rem', color: '#ffffff', position: 'relative' }}>
          {/* Badge */}
          <div className="modern-dialog-badge">
            <Sparkles size={12} color="#fef08a" />
            <span>{dialog.badge || theme.badgeText}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modern-dialog-icon-wrap">
              {theme.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.35 }}>
                {dialog.title}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.88)' }}>
                Vui lòng xác nhận trước khi hệ thống thực thi tác vụ.
              </p>
            </div>
          </div>

          <button 
            onClick={() => closeConfirm(false)} 
            className="modern-dialog-close"
            title="Hủy bỏ (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nội dung thông báo */}
        <div style={{ padding: '1.25rem 1.4rem', maxHeight: '60vh', overflowY: 'auto' }}>
          <FormattedMessageContent rawText={dialog.message} />

          {dialog.items && dialog.items.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dialog.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.84rem', color: '#334155' }}>
                  <ArrowRight size={14} color={theme.accentColor} style={{ flexShrink: 0, marginTop: 3 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer nút hành động */}
        <div className="modern-dialog-footer">
          <button
            type="button"
            className="modern-dialog-btn-cancel"
            onClick={() => closeConfirm(false)}
          >
            {dialog.cancelText || 'Hủy bỏ'}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className="modern-dialog-btn-confirm"
            style={{ background: theme.bg }}
            onClick={() => closeConfirm(true)}
          >
            {dialog.confirmText || 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component Hộp thoại Thông Báo / Kết Quả (showAlert) ─────────────────────
export function ModernAlertDialog({ dialog }: AlertDialogProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const theme = HEADER_THEMES[dialog.type || 'info'] || HEADER_THEMES.info;

  useEffect(() => {
    btnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        closeAlert();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      className="modern-dialog-overlay"
      onClick={() => closeAlert()}
    >
      <div 
        className="modern-dialog-box"
        onClick={e => e.stopPropagation()}
        tabIndex={0}
      >
        {/* Header */}
        <div style={{ background: theme.bg, padding: '1.25rem 1.4rem', color: '#ffffff', position: 'relative' }}>
          <div className="modern-dialog-badge">
            <Sparkles size={12} color="#fef08a" />
            <span>{dialog.badge || theme.badgeText}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modern-dialog-icon-wrap">
              {theme.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.35 }}>
                {dialog.title}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.88)' }}>
                Chi tiết kết quả thực thi và thông tin phản hồi từ ứng dụng.
              </p>
            </div>
          </div>

          <button 
            onClick={() => closeAlert()} 
            className="modern-dialog-close"
            title="Đóng (Esc/Enter)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.4rem', maxHeight: '60vh', overflowY: 'auto' }}>
          <FormattedMessageContent rawText={dialog.message} />

          {dialog.items && dialog.items.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dialog.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.84rem', color: '#334155' }}>
                  <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {dialog.actionTip && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: '0.84rem',
              color: '#166534',
              fontWeight: 500,
              marginTop: 12,
            }}>
              <Lightbulb size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, lineHeight: 1.45 }}>{dialog.actionTip}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modern-dialog-footer" style={{ justifyContent: 'flex-end' }}>
          <button
            ref={btnRef}
            type="button"
            className="modern-dialog-btn-confirm"
            style={{ background: theme.bg, minWidth: 120 }}
            onClick={() => closeAlert()}
          >
            {dialog.buttonText || 'Đã hiểu'}
          </button>
        </div>
      </div>
    </div>
  );
}
