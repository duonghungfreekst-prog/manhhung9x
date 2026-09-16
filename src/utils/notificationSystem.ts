/**
 * DMH_Tools - Hệ Thống Quản Lý Thông Báo & Hộp Thoại Toàn Cục
 * Cung cấp:
 *  - showToast: Thông báo nổi góc màn hình (Toast) với đếm ngược tự đóng và tiến trình
 *  - showConfirm: Hộp thoại xác nhận hiện đại trả về Promise<boolean> thay thế window.confirm()
 *  - showAlert: Hộp thoại thông báo chi tiết trả về Promise<void> thay thế window.alert()
 */

export type NotificationType = 'success' | 'error' | 'warning' | 'info';
export type DialogVariant = 'success' | 'danger' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // millisecond, mặc định 4500ms
  createdAt: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  type?: DialogVariant;
  badge?: string;
  items?: string[];
  confirmText?: string;
  cancelText?: string;
}

export interface AlertOptions {
  title: string;
  message: string;
  type?: NotificationType;
  badge?: string;
  items?: string[];
  actionTip?: string;
  buttonText?: string;
}

interface ActiveConfirmDialog extends ConfirmOptions {
  id: string;
  resolve: (value: boolean) => void;
}

interface ActiveAlertDialog extends AlertOptions {
  id: string;
  resolve: () => void;
}

// ── Kho lưu trữ trạng thái trong bộ nhớ ──────────────────────────────────────
const activeToasts: ToastItem[] = [];
let activeConfirm: ActiveConfirmDialog | null = null;
let activeAlert: ActiveAlertDialog | null = null;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.error('Error in notification listener:', e);
    }
  });
}

// ── Âm thanh giao diện nhẹ nhàng (Web Audio API) ──────────────────────────────
function playNotificationSound(type: NotificationType | DialogVariant) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // 2 nốt bổng thanh thoát (E5 -> B5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.setValueAtTime(987.77, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'error' || type === 'danger') {
      // Nốt trầm cảnh báo (C4 -> G3)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(261.63, now);
      osc.frequency.setValueAtTime(196.00, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === 'warning') {
      // Nốt cảnh báo ấm (A4)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else {
      // Nốt thông tin êm ái
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    }
  } catch {
    // Không làm gián đoạn luồng nếu trình duyệt chặn âm thanh tự động
  }
}

// ── TOAST API ─────────────────────────────────────────────────────────────────

export function removeToast(id: string) {
  const idx = activeToasts.findIndex(t => t.id === id);
  if (idx !== -1) {
    activeToasts.splice(idx, 1);
    notifyListeners();
  }
}

export function addToast(
  type: NotificationType,
  title: string,
  message?: string,
  duration = 4500
): string {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: ToastItem = {
    id,
    type,
    title,
    message,
    duration,
    createdAt: Date.now(),
  };

  // Giữ tối đa 5 toast cùng lúc để tránh tràn màn hình
  if (activeToasts.length >= 5) {
    activeToasts.shift();
  }

  activeToasts.push(item);
  playNotificationSound(type);
  notifyListeners();
  return id;
}

export const showToast = {
  success: (title: string, message?: string, duration?: number) =>
    addToast('success', title, message, duration),
  error: (title: string, message?: string, duration?: number) =>
    addToast('error', title, message, duration),
  warning: (title: string, message?: string, duration?: number) =>
    addToast('warning', title, message, duration),
  info: (title: string, message?: string, duration?: number) =>
    addToast('info', title, message, duration),
};

// ── CONFIRM DIALOG API (Hộp thoại xác nhận thay thế window.confirm) ───────────

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    // Nếu đang có confirm khác, hủy cái cũ
    if (activeConfirm) {
      activeConfirm.resolve(false);
    }

    const id = `confirm-${Date.now()}`;
    activeConfirm = {
      ...options,
      id,
      type: options.type || 'warning',
      confirmText: options.confirmText || 'Xác nhận',
      cancelText: options.cancelText || 'Hủy bỏ',
      resolve: (val: boolean) => {
        activeConfirm = null;
        notifyListeners();
        resolve(val);
      },
    };

    playNotificationSound(activeConfirm.type || 'warning');
    notifyListeners();
  });
}

export function closeConfirm(result: boolean) {
  if (activeConfirm) {
    activeConfirm.resolve(result);
  }
}

// ── ALERT DIALOG API (Hộp thoại kết quả thay thế window.alert) ────────────────

export function showAlert(options: AlertOptions | string): Promise<void> {
  return new Promise<void>(resolve => {
    if (activeAlert) {
      activeAlert.resolve();
    }

    const opts: AlertOptions =
      typeof options === 'string'
        ? {
            title: 'Thông Báo',
            message: options,
            type: 'info',
          }
        : options;

    const id = `alert-${Date.now()}`;
    activeAlert = {
      ...opts,
      id,
      type: opts.type || 'info',
      buttonText: opts.buttonText || 'Đã hiểu',
      resolve: () => {
        activeAlert = null;
        notifyListeners();
        resolve();
      },
    };

    playNotificationSound(activeAlert.type || 'info');
    notifyListeners();
  });
}

export function closeAlert() {
  if (activeAlert) {
    activeAlert.resolve();
  }
}

// ── Trạng thái dùng cho React Component ──────────────────────────────────────

export function getNotificationSnapshot() {
  return {
    toasts: [...activeToasts],
    confirmDialog: activeConfirm,
    alertDialog: activeAlert,
  };
}

export function subscribeNotifications(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
