/**
 * src/types/electron.d.ts
 * Khai báo TypeScript cho Typed IPC Gateway (window.electronAPI) DMH_Tools v7
 */

export interface SystemAPI {
  getHWID: () => Promise<string>;
  executeScript: (commandId: string, params?: Record<string, string | number>) => Promise<{ ok: boolean; output?: string; error?: string }>;
  checkHealth: () => Promise<{ ok: boolean; status: string }>;
}

export interface PrinterAPI {
  getList: () => Promise<any[]>;
  diagnose: (printerName: string) => Promise<any>;
  repairSpooler: (mode?: 'diagnostic' | 'safe' | 'advanced') => Promise<any>;
  fix0x11b: () => Promise<any>;
}

export interface HisAPI {
  fetchPatients: (connStr: string, roomCode?: string) => Promise<{ ok: boolean; data?: any[]; error?: string }>;
  fetchRooms: (connStr: string) => Promise<{ ok: boolean; data?: any[]; error?: string }>;
  updatePatientStatus: (connStr: string, maBenhNhan: string | number) => Promise<{ ok: boolean; rowsAffected?: number; warn?: string }>;
  latestCalled: (connStr: string, roomCode?: string) => Promise<{ ok: boolean; data?: any; error?: string }>;
  selectLogo: () => Promise<{ ok: boolean; path?: string }>;
}

export interface EndoscopyAPI {
  listCameras: () => Promise<{ ok: boolean; cameras: any[]; error?: string }>;
  getStats: () => Promise<{ total_patients: number; total_sessions: number; total_images: number; total_size_mb: number }>;
  getPatients: (query?: string) => Promise<{ patients: any[] }>;
  addPatient: (data: any) => Promise<{ ok: boolean; patient?: any; error?: string }>;
  getSessions: (patientId: number) => Promise<{ sessions: any[] }>;
  createSession: (data: any) => Promise<{ ok: boolean; session?: any; error?: string }>;
  getImages: (sessionId: number) => Promise<{ images: any[] }>;
  toggleFavorite: (imageId: number) => Promise<{ ok: boolean; is_favorite?: boolean }>;
  saveCapture: (sessionId: number, base64Data: string, resolution?: string) => Promise<{ ok: boolean; image?: any; error?: string }>;
  backup: (targetZipPath: string) => Promise<{ ok: boolean; file_path?: string; size_mb?: number; error?: string }>;
  restore: (sourceZipPath: string) => Promise<{ ok: boolean; restored_at?: string; patient_count?: number; image_count?: number; error?: string }>;
}

export interface BiometricAPI {
  getLocalIp: () => Promise<{ primaryIp: string; defaultSubnet: string; subnets: string[] }>;
  scanLan: (subnet: string, port: number) => Promise<{ ok: boolean; count: number; devices: any[]; error?: string }>;
  testConnection: (ip: string, port: number, timeoutMs?: number) => Promise<{ ok: boolean; error?: string }>;
  pullLogs: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  getDeviceStatus: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  syncTime: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  testVoice: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  reboot: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  clearAdmin: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  unlockDoor: (ip: string, port: number, durationSeconds?: number, timeoutMs?: number) => Promise<any>;
  getUsers: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  deleteUser: (ip: string, port: number, uid: number | string, timeoutMs?: number) => Promise<any>;
  clearLogs: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
}

export interface LicenseAPI {
  verify: (rawKey: string) => Promise<{ ok: boolean; valid?: boolean; payload?: any; error?: string }>;
  getHWID: () => Promise<string>;
  checkRevocation: (rawKey: string) => Promise<boolean>;
  bindKey: (rawKey: string) => Promise<any>;
  getInstanceId: () => Promise<string>;
}

export interface ElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>; // Hỗ trợ tương thích ngược
  system: SystemAPI;
  printer: PrinterAPI;
  his: HisAPI;
  endoscopy: EndoscopyAPI;
  biometric: BiometricAPI;
  license: LicenseAPI;
  // Legacy aliases
  getHWID?: () => Promise<string>;
  convertPdfNative?: (inputPath: string) => Promise<any>;
  htmlToPdf?: (options: any) => Promise<any>;
  getDbStats?: () => Promise<any>;
  getPatients?: (q?: string) => Promise<any>;
  addPatient?: (data: any) => Promise<any>;
  getSessions?: (patient_id: number) => Promise<any>;
  createSession?: (data: any) => Promise<any>;
  getImages?: (session_id: number) => Promise<any>;
  toggleFav?: (image_id: number) => Promise<any>;
  saveCapture?: (session_id: number, b64: string, res?: string) => Promise<any>;
  openFolder?: (folderPath: string) => Promise<any>;
  openFile?: (filePath: string) => Promise<any>;
  speakTts?: (text: string, voice?: string) => Promise<any>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
