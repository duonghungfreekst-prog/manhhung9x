/**
 * Endoscopy API Client — giao tiếp qua Electron IPC thay vì Python server
 */

// Lấy electronAPI từ preload
const eAPI = () => (window as any).electronAPI;

// ── Các hàm cũ không còn dùng (giữ để không lỗi UI nếu có gọi) ──────────────
export const ping = async () => ({ pong: true });
export interface StatusData { running: boolean; logs: string[]; captures: any[]; gpu_info: any; }
export const getStatus = async (): Promise<StatusData> => ({ running: true, logs: [], captures: [], gpu_info: {} });
export interface CaptureInfo { thumbnail_path: string; processed_path: string; meta: any; trigger_type: string; }
export const getCameras = async () => ({ cameras: [] });
export const startCore = async () => ({ ok: true, msg: 'Đã bỏ qua Python core' });
export const stopCore = async () => ({ ok: true });
export const manualCapture = async () => ({ ok: true });
export const configureTriggers = async () => ({ ok: true });
export const getThumbnailB64 = async (p: string) => {
  try {
    const res = await fetch(`file://${p.replace(/\\/g, '/')}`);
    const blob = await res.blob();
    return new Promise<{ok: boolean, data: string | null}>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ ok: true, data: (reader.result as string).split(',')[1] });
      reader.onerror = () => resolve({ ok: false, data: null });
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return { ok: false, data: null };
  }
};

// ── Database ──────────────────────────────────────────────────────────────────
export interface Patient {
  id: number; full_name: string; birth_year: string;
  gender: string; patient_code: string; phone: string; created_at: string;
}
export interface Session {
  id: number; patient_id: number; exam_date: string; exam_type: string;
  doctor_name: string; diagnosis: string; note: string;
  folder_path: string; created_at: string; image_count?: number;
  full_name?: string; patient_code?: string;
}
export interface ImageRecord {
  id: number; session_id: number; original_path: string;
  processed_path: string; thumbnail_path: string;
  file_size_kb: number; resolution: string; trigger_type: string;
  is_favorite: number; captured_at: string;
}
export interface DbStats {
  total_patients: number; total_sessions: number;
  total_images: number; total_size_mb: number;
}

export const getDbStats    = () => eAPI().getDbStats();
export const getPatients   = (q?: string) => eAPI().getPatients(q);
export const addPatient    = (d: Partial<Patient>) => eAPI().addPatient(d);
export const getSessions   = (patient_id: number) => eAPI().getSessions(patient_id);
export const createSession = (d: { patient_id: number; exam_type: string; doctor_name: string }) => eAPI().createSession(d);
export const getImages     = (session_id: number) => eAPI().getImages(session_id);
export const toggleFav     = (image_id: number) => eAPI().toggleFav(image_id);
export const saveCapture   = (session_id: number, b64: string, res: string) => eAPI().saveCapture(session_id, b64, res);
export const exportWordReport = async () => ({ ok: false, msg: 'Chưa hỗ trợ tạo word không cần Python' });
export const recognizeImage   = (b64: string) => eAPI().recognizeImage(b64);
