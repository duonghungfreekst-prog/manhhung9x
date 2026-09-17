/**
 * src/types/electron.d.ts
 * Khai báo TypeScript cho Typed IPC Gateway (window.electronAPI) DMH_Tools v7
 */

export interface SystemAPI {
  getHWID: () => Promise<string>;
  checkHealth: () => Promise<{ ok: boolean; status: string }>;
  executeScript?: (commandId: string, params?: Record<string, string | number>) => Promise<{ ok: boolean; output?: string; error?: string }>;
}

export interface HisAPI {
  fetchPatients: (connStr: string, roomCode: string) => Promise<{ ok: boolean; data?: any[]; error?: string }>;
  fetchRooms: (connStr: string) => Promise<{ ok: boolean; data?: any[]; error?: string }>;
  updatePatientStatus: (connStr: string, maBenhNhan: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  latestCalled: (connStr: string, roomCode: string) => Promise<{ ok: boolean; data?: any; error?: string }>;
  selectLogo: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  sendTcpCommand: (ip: string, port: number, message: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
}

export interface EndoscopyAPI {
  listCameras: () => Promise<{ ok: boolean; cameras?: any[]; error?: string }>;
  getStats: () => Promise<any>;
  getPatients: (q?: string) => Promise<{ ok: boolean; patients?: any[]; error?: string }>;
  addPatient: (data: any) => Promise<{ ok: boolean; patient?: any; error?: string }>;
  getSessions: (pid: number) => Promise<{ ok: boolean; sessions?: any[]; error?: string }>;
  createSession: (data: any) => Promise<{ ok: boolean; session?: any; error?: string }>;
  getImages: (sid: number) => Promise<{ ok: boolean; images?: any[]; error?: string }>;
  toggleFavorite: (id: number) => Promise<{ ok: boolean; is_favorite?: boolean; error?: string }>;
  toggleFav?: (id: number) => Promise<{ ok: boolean; is_favorite?: boolean; error?: string }>;
  saveCapture: (sid: number, b64: string, res?: string) => Promise<{ ok: boolean; image?: any; error?: string }>;
  backup: (path: string) => Promise<{ ok: boolean; error?: string }>;
  restore: (path: string) => Promise<{ ok: boolean; error?: string }>;
  openFolder: (folderPath: string) => Promise<any>;
  openFile: (filePath: string) => Promise<any>;
  installCameraDriver?: () => Promise<any>;
  openDeviceManager?: () => Promise<any>;
  openCameraApp?: () => Promise<any>;
  openDriverUrl?: (url: string) => Promise<any>;
  getSources?: () => Promise<any>;
  recognizeImage?: (b64: string) => Promise<any>;
  onDriverLog?: (cb: (line: string) => void) => void;
  removeDriverLogListener?: () => void;
}

export interface LicenseAPI {
  verify: (rawKey: string) => Promise<{ ok: boolean; valid?: boolean; info?: any; error?: string }>;
  getHWID: () => Promise<string>;
  checkRevocation: (rawKey: string) => Promise<any>;
  bindKey: (rawKey: string) => Promise<any>;
  getInstanceId: () => Promise<string>;
}

export interface BiometricAPI {
  testConnection: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  pullLogs: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  scanLan: (subnet: string, port?: number) => Promise<any>;
  getLocalIp: () => Promise<any>;
  getDeviceStatus: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  syncTime: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  testVoice: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  reboot: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  clearAdmin: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  unlockDoor: (ip: string, port: number, durationSeconds: number, timeoutMs?: number) => Promise<any>;
  getUsers: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
  deleteUser: (ip: string, port: number, uid: string | number, timeoutMs?: number) => Promise<any>;
  clearLogs: (ip: string, port: number, timeoutMs?: number) => Promise<any>;
}

export interface PrinterAPI {
  getList: () => Promise<any[]>;
  diagnose: (printerName: string) => Promise<any>;
  repairSpooler: (mode?: 'diagnostic' | 'safe' | 'advanced') => Promise<any>;
  fix0x11b: () => Promise<any>;
  unlockIpc?: (params: any) => Promise<any>;
  getPrinters?: () => Promise<any[]>;
  fixShareError?: () => Promise<any>;
  fixError0x40?: (params: any) => Promise<any>;
  clearSmbCache?: () => Promise<any>;
  openCredentialManager?: () => Promise<any>;
  getShareRpcStatus?: () => Promise<any>;
  restartSpooler?: () => Promise<any>;
  restartPc?: () => Promise<any>;
  fixPointAndPrint?: () => Promise<any>;
  fixOfflineSnmp?: () => Promise<any>;
  enableLanSharing?: () => Promise<any>;
  fixSpoolerCrash?: () => Promise<any>;
  printTestPage?: (name: string) => Promise<any>;
  setDefault?: (name: string) => Promise<any>;
  resumePrinter?: (name: string) => Promise<any>;
  openQueue?: (name: string) => Promise<any>;
  openProperties?: (name: string) => Promise<any>;
  openWindowsTool?: (tool: string) => Promise<any>;
  diagnoseAll?: () => Promise<any>;
  fixAllIssues?: () => Promise<any>;
  diagnose709?: () => Promise<any>;
  fixError709AZ?: () => Promise<any>;
  fixDefaultPrinter709?: (name: string) => Promise<any>;
  exportFix709Script?: () => Promise<any>;
  saveWindowsCredential?: (params: any) => Promise<any>;
  getJobs?: (name: string) => Promise<any>;
  deleteJob?: (name: string, jobId: string | number) => Promise<any>;
  clearQueue?: (name: string) => Promise<any>;
  uninstallPrinter?: (name: string, driverName?: string) => Promise<any>;
  getDrivers?: () => Promise<any>;
  getAvailablePorts?: () => Promise<any>;
  addLocalPortPrinter?: (params: any) => Promise<any>;
  autoInstallDriver?: (params: any) => Promise<any>;
  selectDriverFile?: () => Promise<any>;
  onDriverInstallProgress?: (cb: (data: any) => void) => () => void;
  removeDriverInstallProgressListener?: () => void;
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
  applyTweak?: (tweakId: string) => Promise<any>;
  applyBatchTweaks?: (tweakIds: string[]) => Promise<any>;
  installBatchApps?: (apps: string[]) => Promise<any>;
  onBatchInstallProgress?: (cb: (data: any) => void) => () => void;
  setOemInfo?: (info: any) => Promise<any>;
  launchExternal?: (toolKey: string) => Promise<any>;
  openFolder?: (folderKey: string) => Promise<any>;
  openDownloadUrl?: (url: string) => Promise<any>;
  getUserAccounts?: () => Promise<any>;
  manageUser?: (params: any) => Promise<any>;
  getLaptopHealth?: () => Promise<any>;
  installOffice?: (config: any) => Promise<any>;
  installVietnameseFonts?: (fontType: string) => Promise<any>;
  installCustomApp?: (options: any) => Promise<any>;
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
  pingTest?: (customTarget?: string) => Promise<any>;
  generateBatteryReport?: () => Promise<any>;
  enableLanSharing?: () => Promise<any>;
  backupUserData?: () => Promise<any>;
  masterBoost?: () => Promise<any>;
  getServicesStatus?: () => Promise<any>;
  repairServices?: () => Promise<any>;
  clearPrintQueue?: () => Promise<any>;
  checkPrinterPort?: (ip: string) => Promise<any>;
  installVcRedist?: () => Promise<any>;
  getDriverInfo?: () => Promise<any>;
  scanHardwareChanges?: () => Promise<any>;
  selectFolder?: (title?: string) => Promise<any>;
  selectInfFile?: () => Promise<any>;
  installDriverInf?: (infPath: string) => Promise<any>;
  restartNetworkAdapter?: () => Promise<any>;
  [key: string]: any;
}

export interface ModulesAPI {
  getStatusAll: (modulesList: any[]) => Promise<any>;
  downloadGithub: (payload: any) => Promise<any>;
  uninstall: (moduleId: string) => Promise<any>;
  getBaseDir: () => Promise<string>;
  onDownloadProgress: (cb: (data: any) => void) => () => void;
  removeProgressListener: () => void;
}

export interface CaAPI {
  getCertificates: () => Promise<any>;
  selectXmlFiles: () => Promise<any>;
  signXml: (payload: any) => Promise<any>;
  verifyXml: (payload: any) => Promise<any>;
  saveSignedFile: (payload: any) => Promise<any>;
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
  modules?: ModulesAPI;
  ca?: CaAPI;

  // Root / Global helpers
  runInstaller?: (name: string) => Promise<any>;
  openExternal?: (url: string) => Promise<any>;
  speakTts?: (text: string, voice?: string) => Promise<any>;
  openQueueDisplay?: (options?: any) => Promise<any>;
  closeQueueDisplay?: () => Promise<any>;
  isQueueDisplayOpen?: () => Promise<boolean>;
  updateQueueDisplay?: (data: any) => Promise<any>;
  onQueueStatus?: (cb: (open: boolean) => void) => () => void;
  openFloatControl?: () => Promise<any>;
  closeFloatControl?: () => Promise<any>;
  isFloatOpen?: () => Promise<boolean>;
  pushFloatState?: (data: any) => Promise<any>;
  onFloatStatus?: (cb: (open: boolean) => void) => () => void;
  onFloatAction?: (cb: (action: string) => void) => void;
  removeFloatActionListener?: () => void;
  compareFiles?: (portalB64: string, internalB64: string) => Promise<any>;
  onSmartRefresh?: (callback: () => void) => () => void;

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
  fetchHisPatients?: (connStr: string, roomCode: string) => Promise<any>;
  updateHisPatientStatus?: (connStr: string, maBenhNhan: string) => Promise<any>;
  fetchHisRooms?: (connStr: string) => Promise<any>;
  fetchLatestCalled?: (connStr: string, roomCode: string) => Promise<any>;
  selectLogo?: () => Promise<any>;
  sendTcpCommand?: (ip: string, port: number, message: string) => Promise<any>;
  onDriverLog?: (cb: (line: string) => void) => void;
  removeDriverLogListener?: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
