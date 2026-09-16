/**
 * autoRefreshManager.ts
 * Bộ điều phối trung tâm Tự Động Làm Mới Thông Minh Toàn Ứng Dụng (Global Smart Auto-Refresh Engine).
 * 
 * Tính năng:
 * - Chu kỳ tự động làm mới có thể tùy biến (10s, 30s, 60s, 120s, 300s, Tắt).
 * - Cơ chế bảo tồn vị trí cuộn & tương tác (Scroll & Form State Preservation).
 * - Làm mới êm ái ngầm (Silent Mode) không khóa màn hình, không rung giật.
 * - Tự động hoãn (Defer) nếu người dùng đang nhập liệu hoặc thao tác bàn phím.
 * - Hỗ trợ các Tab đăng ký handler làm mới chuyên biệt.
 */

import { captureInteractiveState, restoreInteractiveState } from './statePreserver';

export interface AutoRefreshConfig {
  enabled: boolean;
  intervalSec: number;
  preserveState: boolean;
  silentMode: boolean;
}

export interface AutoRefreshState extends AutoRefreshConfig {
  countdown: number;
  isRefreshing: boolean;
  lastRefreshedAt: string | null;
  activeTab: string;
}

export type TabRefreshHandler = (options: { silent: boolean; isAuto: boolean }) => Promise<void>;

const LS_CONFIG_KEY = 'dmh_auto_refresh_config';

const DEFAULT_CONFIG: AutoRefreshConfig = {
  enabled: true,
  intervalSec: 30,
  preserveState: true,
  silentMode: true,
};

// Đọc cấu hình từ localStorage
export function loadAutoRefreshConfig(): AutoRefreshConfig {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_CONFIG.enabled,
      intervalSec: Number(parsed.intervalSec) > 0 ? Number(parsed.intervalSec) : DEFAULT_CONFIG.intervalSec,
      preserveState: typeof parsed.preserveState === 'boolean' ? parsed.preserveState : DEFAULT_CONFIG.preserveState,
      silentMode: typeof parsed.silentMode === 'boolean' ? parsed.silentMode : DEFAULT_CONFIG.silentMode,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// Lưu cấu hình vào localStorage
export function saveAutoRefreshConfig(config: Partial<AutoRefreshConfig>): AutoRefreshConfig {
  const current = loadAutoRefreshConfig();
  const updated = { ...current, ...config };
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  AutoRefreshManager.getInstance().updateConfig(updated);
  return updated;
}

type StateListener = (state: AutoRefreshState) => void;

export class AutoRefreshManager {
  private static instance: AutoRefreshManager;

  private config: AutoRefreshConfig;
  private countdown: number;
  private isRefreshing: boolean = false;
  private lastRefreshedAt: string | null = null;
  private activeTab: string = 'compare';

  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastUserTypingTime: number = 0;
  private tabHandlers: Map<string, TabRefreshHandler> = new Map();
  private listeners: Set<StateListener> = new Set();

  private constructor() {
    this.config = loadAutoRefreshConfig();
    this.countdown = this.config.intervalSec;
    this.setupUserActivityTracking();
    this.startTimer();
  }

  public static getInstance(): AutoRefreshManager {
    if (!AutoRefreshManager.instance) {
      AutoRefreshManager.instance = new AutoRefreshManager();
    }
    return AutoRefreshManager.instance;
  }

  /**
   * Cập nhật tab đang hoạt động
   */
  public setActiveTab(tab: string) {
    this.activeTab = tab;
    this.notifyListeners();
  }

  /**
   * Lắng nghe người dùng gõ phím để hoãn tự động làm mới, tránh cản trở thao tác
   */
  private setupUserActivityTracking() {
    if (typeof window === 'undefined') return;

    const recordActivity = () => {
      this.lastUserTypingTime = Date.now();
    };

    window.addEventListener('keydown', recordActivity, { passive: true });
    window.addEventListener('input', recordActivity, { passive: true });
  }

  /**
   * Khởi động bộ đếm chu kỳ
   */
  private startTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (!this.config.enabled || this.config.intervalSec <= 0) {
      this.notifyListeners();
      return;
    }

    this.timerId = setInterval(() => {
      if (!this.config.enabled || this.isRefreshing) return;

      // Nếu người dùng đang gõ phím trong vòng 2.5 giây gần nhất, hoãn đếm ngược thêm 5s
      const timeSinceTyping = Date.now() - this.lastUserTypingTime;
      if (timeSinceTyping < 2500 && this.countdown <= 3) {
        this.countdown = 5;
        this.notifyListeners();
        return;
      }

      this.countdown -= 1;

      if (this.countdown <= 0) {
        this.countdown = this.config.intervalSec;
        this.triggerSmartRefresh({ isAuto: true, silent: this.config.silentMode });
      } else {
        this.notifyListeners();
      }
    }, 1000);
  }

  /**
   * Cập nhật cấu hình mới
   */
  public updateConfig(newConfig: Partial<AutoRefreshConfig>) {
    const prevSec = this.config.intervalSec;
    const prevEnabled = this.config.enabled;

    this.config = { ...this.config, ...newConfig };

    if (this.config.intervalSec !== prevSec || this.config.enabled !== prevEnabled) {
      this.countdown = this.config.intervalSec;
      this.startTimer();
    }

    this.notifyListeners();
  }

  /**
   * Đăng ký handler làm mới cho từng tab
   */
  public registerHandler(tabId: string, handler: TabRefreshHandler) {
    this.tabHandlers.set(tabId, handler);
  }

  /**
   * Hủy đăng ký handler của tab khi unmount
   */
  public unregisterHandler(tabId: string) {
    this.tabHandlers.delete(tabId);
  }

  /**
   * Kích hoạt làm mới thông minh (Smart Refresh)
   * Tự động chụp và khôi phục vị trí cuộn & thao tác người dùng
   */
  public async triggerSmartRefresh(options?: {
    silent?: boolean;
    isAuto?: boolean;
    tabId?: string;
  }): Promise<void> {
    if (this.isRefreshing) return;

    const silent = options?.silent ?? this.config.silentMode;
    const isAuto = options?.isAuto ?? false;
    const targetTab = options?.tabId || this.activeTab;

    // Reset lại bộ đếm sau khi kích hoạt làm mới
    this.countdown = this.config.intervalSec;
    this.isRefreshing = true;
    this.notifyListeners();

    // 1. Chụp lại toàn bộ vị trí cuộn & tương tác nếu cấu hình bật
    const snapshot = this.config.preserveState ? captureInteractiveState() : null;

    try {
      // 2. Tìm handler của tab hiện tại
      const handler = this.tabHandlers.get(targetTab);
      if (handler) {
        await handler({ silent, isAuto });
      } else {
        // Nếu không có handler riêng, phát sự kiện DOM toàn cục để tab con tự xử lý nếu cần
        window.dispatchEvent(new CustomEvent('dmh:smart-refresh', {
          detail: { tab: targetTab, silent, isAuto }
        }));
      }

      this.lastRefreshedAt = new Date().toLocaleTimeString('vi-VN');
    } catch (err) {
      console.warn(`[AUTO_REFRESH] Lỗi làm mới tab ${targetTab}:`, err);
    } finally {
      this.isRefreshing = false;

      // 3. Khôi phục nguyên vẹn vị trí cuộn & thao tác
      if (snapshot && this.config.preserveState) {
        restoreInteractiveState(snapshot);
      }

      this.notifyListeners();
    }
  }

  /**
   * Lấy trạng thái hiện tại
   */
  public getState(): AutoRefreshState {
    return {
      ...this.config,
      countdown: this.countdown,
      isRefreshing: this.isRefreshing,
      lastRefreshedAt: this.lastRefreshedAt,
      activeTab: this.activeTab,
    };
  }

  /**
   * Đăng ký lắng nghe thay đổi trạng thái
   */
  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('[AUTO_REFRESH] Listener error:', e);
      }
    }
  }
}

// Hook React để các component dễ dàng liên kết với bộ điều phối
import { useState, useEffect } from 'react';

export function useAutoRefreshStatus() {
  const [state, setState] = useState<AutoRefreshState>(() =>
    AutoRefreshManager.getInstance().getState()
  );

  useEffect(() => {
    return AutoRefreshManager.getInstance().subscribe(setState);
  }, []);

  return state;
}

export function registerTabRefreshHandler(tabId: string, handler: TabRefreshHandler): () => void {
  AutoRefreshManager.getInstance().registerHandler(tabId, handler);
  return () => AutoRefreshManager.getInstance().unregisterHandler(tabId);
}

export function triggerGlobalSmartRefresh(options?: { silent?: boolean; isAuto?: boolean; tabId?: string }) {
  return AutoRefreshManager.getInstance().triggerSmartRefresh(options);
}
