/**
 * statePreserver.ts
 * Tiện ích chụp ảnh & khôi phục trạng thái tương tác và vị trí cuộn của người dùng.
 * Đảm bảo khi làm mới dữ liệu (Refresh/Auto-Refresh):
 * - Vị trí cuộn (Scroll Position) của window, main content, và mọi bảng/danh sách giữ nguyên 100%.
 * - Trạng thái focus & con trỏ văn bản (caret selection) của ô nhập liệu (input/textarea) không bị cướp.
 * - Hạn chế giật lag, chớp trắng màn hình.
 */

export interface ScrollElementSnapshot {
  element: HTMLElement;
  scrollTop: number;
  scrollLeft: number;
  selector?: string;
}

export interface ActiveInputSnapshot {
  element: HTMLInputElement | HTMLTextAreaElement | null;
  id?: string;
  name?: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  scrollTop: number;
  scrollLeft: number;
  valueLength: number;
}

export interface InteractiveStateSnapshot {
  timestamp: number;
  windowScrollX: number;
  windowScrollY: number;
  scrollSnapshots: ScrollElementSnapshot[];
  activeInput: ActiveInputSnapshot | null;
}

/**
 * Tìm một CSS selector duy nhất cho phần tử để hỗ trợ khôi phục nếu phần tử bị unmount/re-mount
 */
function getUniqueSelector(el: HTMLElement): string | undefined {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const dataScrollId = el.getAttribute('data-scroll-id');
  if (dataScrollId) return `[data-scroll-id="${CSS.escape(dataScrollId)}"]`;
  const dataTab = el.getAttribute('data-tab');
  if (dataTab) return `[data-tab="${CSS.escape(dataTab)}"]`;
  return undefined;
}

/**
 * Chụp ảnh toàn bộ vị trí cuộn và trạng thái tương tác hiện tại
 */
export function captureInteractiveState(): InteractiveStateSnapshot {
  const scrollSnapshots: ScrollElementSnapshot[] = [];

  // 1. Chụp window scroll
  const windowScrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
  const windowScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

  // 2. Chụp .main-content và document.documentElement
  const rootScrollers = [
    document.documentElement,
    document.body,
    document.querySelector('.main-content') as HTMLElement | null,
    document.querySelector('.tab-panel-fullbleed') as HTMLElement | null,
  ].filter(Boolean) as HTMLElement[];

  for (const el of rootScrollers) {
    if (el.scrollTop > 0 || el.scrollLeft > 0) {
      scrollSnapshots.push({
        element: el,
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        selector: getUniqueSelector(el),
      });
    }
  }

  // 3. Quét tất cả các container có thanh cuộn trong DOM
  try {
    const candidates = document.querySelectorAll<HTMLElement>(
      '.main-content, .tab-panel-fullbleed, .results-table-container, .table-scroll, .table-container, .overflow-y-auto, .overflow-auto, [data-preserve-scroll], table, tbody, div[style*="overflow"]'
    );

    const visited = new Set<HTMLElement>(rootScrollers);

    candidates.forEach(el => {
      if (visited.has(el)) return;
      visited.add(el);

      // Nếu phần tử có cuộn thực tế
      if (el.scrollTop > 0 || el.scrollLeft > 0 || el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
        scrollSnapshots.push({
          element: el,
          scrollTop: el.scrollTop,
          scrollLeft: el.scrollLeft,
          selector: getUniqueSelector(el),
        });
      }
    });
  } catch (err) {
    console.debug('[STATE_PRESERVER] Quét phần tử cuộn:', err);
  }

  // 4. Chụp trạng thái ô input/textarea đang focus
  let activeInput: ActiveInputSnapshot | null = null;
  const activeEl = document.activeElement;
  if (
    activeEl &&
    (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) &&
    !['button', 'submit', 'checkbox', 'radio', 'file'].includes(activeEl.type)
  ) {
    try {
      activeInput = {
        element: activeEl,
        id: activeEl.id || undefined,
        name: activeEl.name || undefined,
        selectionStart: activeEl.selectionStart,
        selectionEnd: activeEl.selectionEnd,
        scrollTop: activeEl.scrollTop,
        scrollLeft: activeEl.scrollLeft,
        valueLength: activeEl.value?.length || 0,
      };
    } catch {
      // Một số kiểu input (như email, number) không hỗ trợ selectionStart trong một số trình duyệt
      activeInput = {
        element: activeEl,
        id: activeEl.id || undefined,
        name: activeEl.name || undefined,
        selectionStart: null,
        selectionEnd: null,
        scrollTop: activeEl.scrollTop,
        scrollLeft: activeEl.scrollLeft,
        valueLength: activeEl.value?.length || 0,
      };
    }
  }

  return {
    timestamp: Date.now(),
    windowScrollX,
    windowScrollY,
    scrollSnapshots,
    activeInput,
  };
}

/**
 * Khôi phục trạng thái tương tác từ snapshot
 */
export function restoreInteractiveState(snapshot: InteractiveStateSnapshot | null): void {
  if (!snapshot) return;

  const applyRestoration = () => {
    // 1. Phục hồi window scroll
    if (snapshot.windowScrollX > 0 || snapshot.windowScrollY > 0) {
      window.scrollTo({
        left: snapshot.windowScrollX,
        top: snapshot.windowScrollY,
        behavior: 'instant' as ScrollBehavior,
      });
    }

    // 2. Phục hồi vị trí cuộn cho từng phần tử
    for (const item of snapshot.scrollSnapshots) {
      let target: HTMLElement | null = null;

      // Ưu tiên tham chiếu trực tiếp nếu phần tử vẫn nằm trong DOM
      if (document.body.contains(item.element)) {
        target = item.element;
      } else if (item.selector) {
        // Nếu phần tử bị re-render tạo DOM mới, tìm lại qua selector
        try {
          target = document.querySelector<HTMLElement>(item.selector);
        } catch {
          // Selector không hợp lệ - bỏ qua
        }
      }

      if (target) {
        if (target.scrollTop !== item.scrollTop) {
          target.scrollTop = item.scrollTop;
        }
        if (target.scrollLeft !== item.scrollLeft) {
          target.scrollLeft = item.scrollLeft;
        }
      }
    }

    // 3. Phục hồi active element và con trỏ gõ văn bản
    if (snapshot.activeInput) {
      const { element, id, name, selectionStart, selectionEnd } = snapshot.activeInput;
      let targetInput: (HTMLInputElement | HTMLTextAreaElement) | null = null;

      if (element && document.body.contains(element)) {
        targetInput = element;
      } else if (id) {
        targetInput = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      } else if (name) {
        targetInput = document.querySelector(`[name="${CSS.escape(name)}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
      }

      if (targetInput && document.activeElement !== targetInput) {
        try {
          targetInput.focus({ preventScroll: true });
          if (selectionStart !== null && selectionEnd !== null) {
            targetInput.setSelectionRange(selectionStart, selectionEnd);
          }
        } catch {
          // Bỏ qua lỗi nếu input type không hỗ trợ selection
        }
      }
    }
  };

  // Khôi phục đa pha (ngay lập tức, frame tiếp theo, và sau 60ms) để đảm bảo DOM render hoàn tất
  applyRestoration();
  requestAnimationFrame(() => {
    applyRestoration();
    setTimeout(applyRestoration, 60);
  });
}

/**
 * Bọc một hàm bất đồng bộ với cơ chế tự động bảo tồn vị trí cuộn & tương tác
 */
export async function withStatePreservation<T>(fn: () => Promise<T>): Promise<T> {
  const snapshot = captureInteractiveState();
  try {
    const result = await fn();
    return result;
  } finally {
    restoreInteractiveState(snapshot);
  }
}
