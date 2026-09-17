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
  unlockIpc?: (params: any) => Promise<any>;
  [key: string]: any;
}

export interface GeminiAPI {
  proxyGenerate: (payload: { key: string; model: string; bodyPayload: any }) => Promise<{ ok: boolean; status?: number; data?: any; error?: string }>;
}

export interface PcToolsAPI {
  getHardwareInfo?: () => Promise<any>;
  benchmarkDisk?: (params: any) => Promise<any>;
  cleanJunk?: () => Promise<any>;
  optimizeRam?: () => Promise<any>;
  getSavedWifi?: () => Promise<{ ok: boolean; count?: number; networks?: any[]; error?: string }>;
  networkFix?: () => Promise<{ ok: boolean; output?: string; error?: string }>;
  fixLanPrinter?: () => Promise<{ ok: boolean; output?: string; error?: string }>;
  launchWinTool?: (toolId: string) => Promise<{ ok: boolean; error?: string }>;
  checkLicense?: () => Promise<{ ok: boolean; raw?: string; status?: string; error?: string }>;
  backupDrivers?: (destFolder?: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  powerAction?: (params: { action: string; minutes: number }) => Promise<{ ok: boolean; output?: string; error?: string }>;
  getOemKey?: () => Promise<{ ok: boolean; key?: string; error?: string }>;
  scanLan?: () => Promise<{ ok: boolean; devices?: any[]; error?: string }>;
  getRestorePoints?: () => Promise<{ ok: boolean; points?: any[]; error?: string }>;
  createRestorePoint?: (desc: string) => Promise<{ ok: boolean; output?: string; error?: string }>;
  openRestoreGui?: () => Promise<{ ok: boolean; error?: string }>;
  getStartupApps?: () => Promise<{ ok: boolean; apps?: any[]; error?: string }>;
  removeStartupApp?: (payload: { name: string; scope: string }) => Promise<{ ok: boolean; error?: string }>;
  scanLargeFiles?: () => Promise<{ ok: boolean; files?: any[]; error?: string }>;
  openFileLocation?: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  deleteFile?: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  [key: string]: any;
}

export interface ElectronAPI {
  system: SystemAPI;
  printer: PrinterAPI;
  his: HisAPI;
  endoscopy: EndoscopyAPI;
  biometric: BiometricAPI;
  license: LicenseAPI;
  gemini: GeminiAPI;
  pcTools: PcToolsAPI;
  pctools: PcToolsAPI;
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
