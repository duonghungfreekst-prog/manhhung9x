/**
 * DMH_Tools - Global Loading & Processing Engine
 * Quản lý trạng thái xử lý toàn ứng dụng (Global Loading State)
 * Cho phép bất kỳ tab/component nào phát tín hiệu bắt đầu hoặc hoàn tất tác vụ
 */

import { useState, useEffect } from 'react';

export interface LoadingTask {
  id: string;
  message: string;
  timestamp: number;
}

// Bộ lưu trữ danh sách tác vụ đang chạy trong RAM
const activeTasks = new Map<string, LoadingTask>();
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.error('Error in global loading listener:', e);
    }
  }
}

/**
 * Bắt đầu một tác vụ đang xử lý trên toàn ứng dụng
 * @param taskId Mã định danh duy nhất của tác vụ (ví dụ: 'printer-diagnose', 'attendance-sync')
 * @param message Thông điệp mô tả hành động (ví dụ: 'Đang quét chẩn đoán máy in...')
 */
export function startGlobalLoading(taskId: string, message: string = 'Hệ thống đang xử lý...') {
  activeTasks.set(taskId, {
    id: taskId,
    message,
    timestamp: Date.now(),
  });
  notifyListeners();
}

/**
 * Cập nhật thông điệp của tác vụ đang chạy
 */
export function updateGlobalLoading(taskId: string, message: string) {
  const existing = activeTasks.get(taskId);
  if (existing) {
    existing.message = message;
    notifyListeners();
  } else {
    startGlobalLoading(taskId, message);
  }
}

/**
 * Kết thúc một tác vụ đang xử lý
 */
export function stopGlobalLoading(taskId: string) {
  if (activeTasks.has(taskId)) {
    activeTasks.delete(taskId);
    notifyListeners();
  }
}

/**
 * Xóa sạch toàn bộ tác vụ đang chạy (Force reset)
 */
export function clearAllGlobalLoading() {
  activeTasks.clear();
  notifyListeners();
}

/**
 * Lấy danh sách các tác vụ đang chạy
 */
export function getActiveGlobalTasks(): LoadingTask[] {
  return Array.from(activeTasks.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Lấy thông điệp của tác vụ gần nhất
 */
export function getLatestLoadingMessage(): string | null {
  const tasks = getActiveGlobalTasks();
  if (tasks.length === 0) return null;
  return tasks[0].message;
}

/**
 * Helper tiện ích: Tự động quản lý start/stop quanh một hàm async
 */
export async function runWithLoading<T>(
  taskId: string,
  message: string,
  asyncFn: () => Promise<T>
): Promise<T> {
  startGlobalLoading(taskId, message);
  try {
    return await asyncFn();
  } finally {
    stopGlobalLoading(taskId);
  }
}

/**
 * React Hook: Lắng nghe trạng thái xử lý toàn app trong các component React
 */
export function useGlobalLoading() {
  const [tasks, setTasks] = useState<LoadingTask[]>(getActiveGlobalTasks);

  useEffect(() => {
    const update = () => setTasks(getActiveGlobalTasks());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const isLoading = tasks.length > 0;
  const currentMessage = tasks.length > 0 ? tasks[0].message : '';
  const taskCount = tasks.length;

  return {
    isLoading,
    currentMessage,
    taskCount,
    tasks,
    startLoading: startGlobalLoading,
    stopLoading: stopGlobalLoading,
    updateLoading: updateGlobalLoading,
  };
}
