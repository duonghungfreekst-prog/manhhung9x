/**
 * Endoscopy API Client — giao tiếp qua Electron IPC thay vì Python server
 */

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
  } catch {
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

const getApi = () => window.electronAPI;

export const getDbStats = async () => {
  const api = getApi();
  if (api?.endoscopy?.getStats) return api.endoscopy.getStats();
  if (api?.getDbStats) return api.getDbStats();
  return null;
};

export const getPatients = async (q?: string) => {
  const api = getApi();
  if (api?.endoscopy?.getPatients) return api.endoscopy.getPatients(q);
  if (api?.getPatients) return api.getPatients(q);
  return { ok: false, patients: [] };
};

export const addPatient = async (d: Partial<Patient>) => {
  const api = getApi();
  if (api?.endoscopy?.addPatient) return api.endoscopy.addPatient(d);
  if (api?.addPatient) return api.addPatient(d);
  return { ok: false, error: 'API không khả dụng' };
};

export const getSessions = async (patient_id: number) => {
  const api = getApi();
  if (api?.endoscopy?.getSessions) return api.endoscopy.getSessions(patient_id);
  if (api?.getSessions) return api.getSessions(patient_id);
  return { ok: false, sessions: [] };
};

export const createSession = async (d: { patient_id: number; exam_type: string; doctor_name: string }) => {
  const api = getApi();
  if (api?.endoscopy?.createSession) return api.endoscopy.createSession(d);
  if (api?.createSession) return api.createSession(d);
  return { ok: false, error: 'API không khả dụng' };
};

export const getImages = async (session_id: number) => {
  const api = getApi();
  if (api?.endoscopy?.getImages) return api.endoscopy.getImages(session_id);
  if (api?.getImages) return api.getImages(session_id);
  return { ok: false, images: [] };
};

export const toggleFav = async (image_id: number) => {
  const api = getApi();
  if (api?.endoscopy?.toggleFavorite) return api.endoscopy.toggleFavorite(image_id);
  if (api?.endoscopy?.toggleFav) return api.endoscopy.toggleFav(image_id);
  if (api?.toggleFav) return api.toggleFav(image_id);
  return { ok: false };
};

export const saveCapture = async (session_id: number, b64: string, res: string) => {
  const api = getApi();
  if (api?.endoscopy?.saveCapture) return api.endoscopy.saveCapture(session_id, b64, res);
  if (api?.saveCapture) return api.saveCapture(session_id, b64, res);
  return { ok: false, error: 'API không khả dụng' };
};

export const exportWordReport = async () => ({ ok: false, msg: 'Chưa hỗ trợ tạo word không cần Python' });

export const recognizeImage = async (b64: string) => {
  const api = getApi();
  if (api?.endoscopy?.recognizeImage) return api.endoscopy.recognizeImage(b64);
  if ((api as any)?.recognizeImage) return (api as any).recognizeImage(b64);
  return { ok: false, error: 'API không khả dụng' };
};
