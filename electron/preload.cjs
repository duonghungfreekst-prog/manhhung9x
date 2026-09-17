const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Typed IPC Namespaces (Architecture v7) ──────────────────────────────
  system: {
    getHardware: () => ipcRenderer.invoke('system:get-hwid'),
    checkHealth: () => ipcRenderer.invoke('system:check-health'),
  },

  his: {
    fetchPatients: (connStr, roomCode) => ipcRenderer.invoke('his-call:fetch-patients', connStr, roomCode),
    fetchRooms: (connStr) => ipcRenderer.invoke('his-call:fetch-rooms', connStr),
    updatePatientStatus: (connStr, maBenhNhan) => ipcRenderer.invoke('his-call:update-patient', connStr, maBenhNhan),
    latestCalled: (connStr, roomCode) => ipcRenderer.invoke('his-call:latest-called', connStr, roomCode),
    selectLogo: () => ipcRenderer.invoke('his-call:select-logo'),
  },
  endoscopy: {
    listCameras: () => ipcRenderer.invoke('endoscopy:list-cameras'),
    getStats: () => ipcRenderer.invoke('endoscopy:db-stats'),
    getPatients: (q) => ipcRenderer.invoke('endoscopy:get-patients', q),
    addPatient: (data) => ipcRenderer.invoke('endoscopy:add-patient', data),
    getSessions: (pid) => ipcRenderer.invoke('endoscopy:get-sessions', pid),
    createSession: (data) => ipcRenderer.invoke('endoscopy:create-session', data),
    getImages: (sid) => ipcRenderer.invoke('endoscopy:get-images', sid),
    toggleFavorite: (id) => ipcRenderer.invoke('endoscopy:toggle-fav', id),
    saveCapture: (sid, b64, res) => ipcRenderer.invoke('endoscopy:save-capture', sid, b64, res),
    backup: (path) => ipcRenderer.invoke('endoscopy:backup', path),
    restore: (path) => ipcRenderer.invoke('endoscopy:restore', path),
  },
  license: {
    verify: (rawKey) => ipcRenderer.invoke('license:verify', rawKey),
    getHWID: () => ipcRenderer.invoke('system:get-hwid'),
    checkRevocation: (rawKey) => ipcRenderer.invoke('license:check-revocation', rawKey),
    bindKey: (rawKey) => ipcRenderer.invoke('license:bind-key', rawKey),
    getInstanceId: () => ipcRenderer.invoke('license:get-instance-id'),
  },

  // ── Existing & Legacy Compatibility ──────────────────────────────────────
  invoke:           (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  convertPdfNative: (inputPath) => ipcRenderer.invoke('convert-pdf', inputPath),
  htmlToPdf:        (options)   => ipcRenderer.invoke('html-to-pdf', options),
  getHWID:          ()          => ipcRenderer.invoke('system:get-hwid'),
  checkLicenseRevocation: (rawKey) => ipcRenderer.invoke('license:check-revocation', rawKey),
  bindLicenseKey:         (rawKey) => ipcRenderer.invoke('license:bind-key', rawKey),
  getInstanceId:          ()       => ipcRenderer.invoke('license:get-instance-id'),
  getTrialInitSec:        (hwid)   => ipcRenderer.invoke('license:get-trial-init', hwid),
  saveTrialInitSec:       (sec, hwid) => ipcRenderer.invoke('license:save-trial-init', sec, hwid),
  getHwidTrial:           (hwid)   => ipcRenderer.invoke('license:get-hwid-trial', hwid),
  saveBackupKey:          (rawKey) => ipcRenderer.invoke('license:save-backup-key', rawKey),
  getBackupKey:           ()       => ipcRenderer.invoke('license:get-backup-key'),
  clearBackupKey:         ()       => ipcRenderer.invoke('license:clear-backup-key'),
  cleanRevokedKey:        (rawKey) => ipcRenderer.invoke('license:clean-revoked-key', rawKey),

  // ── Nội Soi AI 4K (Local Database & IPC) ──────────────────────────────────
  getDbStats:   ()           => ipcRenderer.invoke('endoscopy:db-stats'),
  getPatients:  (q)          => ipcRenderer.invoke('endoscopy:get-patients', q),
  addPatient:   (data)       => ipcRenderer.invoke('endoscopy:add-patient', data),
  getSessions:  (patient_id) => ipcRenderer.invoke('endoscopy:get-sessions', patient_id),
  createSession:(data)       => ipcRenderer.invoke('endoscopy:create-session', data),
  getImages:    (session_id) => ipcRenderer.invoke('endoscopy:get-images', session_id),
  toggleFav:    (image_id)   => ipcRenderer.invoke('endoscopy:toggle-fav', image_id),
  saveCapture:  (session_id, b64, res) => ipcRenderer.invoke('endoscopy:save-capture', session_id, b64, res),

  openFolder: (folderPath)     => ipcRenderer.invoke('endoscopy:open-folder', folderPath),
  openFile:   (filePath)       => ipcRenderer.invoke('endoscopy:open-file', filePath),

  // ── Camera Driver (tích hợp, offline) ───────────────────────────────────
  installCameraDriver:  ()      => ipcRenderer.invoke('endoscopy:install-camera-driver'),
  openDeviceManager:    ()      => ipcRenderer.invoke('endoscopy:open-device-manager'),
  openCameraApp:        ()      => ipcRenderer.invoke('endoscopy:open-camera-app'),
  openDriverUrl:        (url)   => ipcRenderer.invoke('endoscopy:open-driver-url', url),
  // Nhận live log từ quá trình cài driver
  onDriverLog: (cb) => {
    ipcRenderer.on('endoscopy:driver-log', (_e, line) => cb(line));
  },
  removeDriverLogListener: () => {
    ipcRenderer.removeAllListeners('endoscopy:driver-log');
  },

  // ── HIS Call (TCP LAN) ────────────────────────────────────────────────────
  sendTcpCommand: (ip, port, message) => ipcRenderer.invoke('his-call:send-tcp', ip, port, message),

  // ── Máy Chấm Công (Biometric LAN IP) ───────────────────────────────────
  biometric: {
    testConnection: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:test-connection', ip, port, timeoutMs),
    pullLogs: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:pull-logs', ip, port, timeoutMs),
    scanLan: (subnet, port) => ipcRenderer.invoke('biometric:scan-lan', subnet, port),
    getLocalIp: () => ipcRenderer.invoke('biometric:get-local-ip'),
    getDeviceStatus: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:get-device-status', ip, port, timeoutMs),
    syncTime: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:sync-time', ip, port, timeoutMs),
    testVoice: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:test-voice', ip, port, timeoutMs),
    reboot: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:reboot', ip, port, timeoutMs),
    clearAdmin: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:clear-admin', ip, port, timeoutMs),
    unlockDoor: (ip, port, durationSeconds, timeoutMs) => ipcRenderer.invoke('biometric:unlock-door', ip, port, durationSeconds, timeoutMs),
    getUsers: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:get-users', ip, port, timeoutMs),
    deleteUser: (ip, port, uid, timeoutMs) => ipcRenderer.invoke('biometric:delete-user', ip, port, uid, timeoutMs),
    clearLogs: (ip, port, timeoutMs) => ipcRenderer.invoke('biometric:clear-logs', ip, port, timeoutMs),
  },
  fetchHisPatients: (connStr, roomCode) => ipcRenderer.invoke('his-call:fetch-patients', connStr, roomCode),
  updateHisPatientStatus: (connStr, maBenhNhan) => ipcRenderer.invoke('his-call:update-patient', connStr, maBenhNhan),
  fetchHisRooms: (connStr) => ipcRenderer.invoke('his-call:fetch-rooms', connStr),
  fetchLatestCalled: (connStr, roomCode) => ipcRenderer.invoke('his-call:latest-called', connStr, roomCode),
  selectLogo: () => ipcRenderer.invoke('his-call:select-logo'),

  // ── TTS Giọng Việt (HoaiMy Neural / edge-tts) ────────────────────────────
  speakTts: (text, voice = 'default') => ipcRenderer.invoke('queue:speak-piper', text, voice),

  // ── Queue Display (Màn Chờ TV) ────────────────────────────────────────────
  openQueueDisplay:   (options) => ipcRenderer.invoke('queue:open-display', options),
  closeQueueDisplay:  ()        => ipcRenderer.invoke('queue:close-display'),
  isQueueDisplayOpen: ()        => ipcRenderer.invoke('queue:is-open'),
  updateQueueDisplay: (data)    => ipcRenderer.invoke('queue:update-display', data),
  onQueueStatus: (cb) => {
    const handler = (_e, open) => cb(open);
    ipcRenderer.on('queue:status-changed', handler);
    return () => ipcRenderer.removeListener('queue:status-changed', handler);
  },

  // ── Float Control Window (Cửa Sổ Nổi) ───────────────────────────────────
  openFloatControl:   ()       => ipcRenderer.invoke('float:open'),
  closeFloatControl:  ()       => ipcRenderer.invoke('float:close'),
  isFloatOpen:        ()       => ipcRenderer.invoke('float:is-open'),
  pushFloatState:     (data)   => ipcRenderer.invoke('float:push-state', data),
  onFloatStatus: (cb) => {
    const handler = (_e, open) => cb(open);
    ipcRenderer.on('float:status-changed', handler);
    return () => ipcRenderer.removeListener('float:status-changed', handler);
  },
  // Nhận action từ cửa sổ nổi (call-next, recall, refresh, toggle-tv)
  onFloatAction: (cb) => {
    ipcRenderer.on('float:action', (_e, action) => cb(action));
  },
  removeFloatActionListener: () => {
    ipcRenderer.removeAllListeners('float:action');
  },

  // ── Window Capture (Bandicam style) ───────────────────────────────────────
  getSources:    () => ipcRenderer.invoke('endoscopy:get-sources'),
  listCameras:   () => ipcRenderer.invoke('endoscopy:list-cameras'),
  startEndoscopyServer: () => ipcRenderer.invoke('endoscopy:start-server'),
  recognizeImage: (b64) => ipcRenderer.invoke('endoscopy:recognize-image', b64), startXml3176Server: () => ipcRenderer.invoke('xml3176:start-server'), stopXml3176Server: () => ipcRenderer.invoke('xml3176:stop-server'), getXml3176ServerStatus: () => ipcRenderer.invoke('xml3176:server-status'),

  // ── Compare Server: Doi chieu ho so BHYT (Python, port 27185) ───────────────
  compareFiles: (portalB64, internalB64) => ipcRenderer.invoke('compare:compare-b64', portalB64, internalB64),

  // ── PC Tools (BTP Pro All-in-One: Kỹ Thuật Máy Tính) ──────────────────────
  pcTools: {
    getHardwareInfo:      () => ipcRenderer.invoke('pctools:get-hardware-info'),
    benchmarkDisk:        (params) => ipcRenderer.invoke('pctools:benchmark-disk', params),
    cleanJunk:            () => ipcRenderer.invoke('pctools:clean-junk'),
    optimizeRam:          () => ipcRenderer.invoke('pctools:optimize-ram'),
    applyTweak:           (tweakId) => ipcRenderer.invoke('pctools:apply-tweak', tweakId),
    applyBatchTweaks:      (tweakIds) => ipcRenderer.invoke('pctools:apply-batch-tweaks', tweakIds),
    installBatchApps:      (apps) => ipcRenderer.invoke('pctools:install-batch-apps', apps),
    onBatchInstallProgress: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('pctools:batch-install-progress', handler);
      return () => ipcRenderer.removeListener('pctools:batch-install-progress', handler);
    },
    setOemInfo:           (info) => ipcRenderer.invoke('pctools:set-oem-info', info),
    launchExternal:       (toolKey) => ipcRenderer.invoke('pctools:launch-external', toolKey),
    openFolder:           (folderKey) => ipcRenderer.invoke('pctools:open-folder', folderKey),
    openDownloadUrl:      (url) => ipcRenderer.invoke('pctools:open-download-url', url),
    getUserAccounts:      () => ipcRenderer.invoke('pctools:get-user-accounts'),
    manageUser:           (params) => ipcRenderer.invoke('pctools:manage-user', params),
    getLaptopHealth:      () => ipcRenderer.invoke('pctools:get-laptop-health'),
    installOffice:        (config) => ipcRenderer.invoke('pctools:install-office', config),
    installVietnameseFonts: (fontType) => ipcRenderer.invoke('pctools:install-vietnamese-fonts', fontType),
    installCustomApp:     (options) => ipcRenderer.invoke('pctools:install-custom-app', options),
    getOemKey:            () => ipcRenderer.invoke('pctools:get-oem-key'),
    scanLan:              () => ipcRenderer.invoke('pctools:scan-lan'),
    getRestorePoints:     () => ipcRenderer.invoke('pctools:get-restore-points'),
    createRestorePoint:   (desc) => ipcRenderer.invoke('pctools:create-restore-point', desc),
    openRestoreGui:       () => ipcRenderer.invoke('pctools:open-restore-gui'),
    getStartupApps:       () => ipcRenderer.invoke('pctools:get-startup-apps'),
    removeStartupApp:     (payload) => ipcRenderer.invoke('pctools:remove-startup-app', payload),
    scanLargeFiles:       () => ipcRenderer.invoke('pctools:scan-large-files'),
    openFileLocation:     (path) => ipcRenderer.invoke('pctools:open-file-location', path),
    deleteFile:           (path) => ipcRenderer.invoke('pctools:delete-file', path),
    pingTest:              (customTarget) => ipcRenderer.invoke('pctools:ping-test', customTarget),
    generateBatteryReport: () => ipcRenderer.invoke('pctools:generate-battery-report'),
    enableLanSharing:      () => ipcRenderer.invoke('pctools:enable-lan-sharing'),
    backupUserData:        () => ipcRenderer.invoke('pctools:backup-user-data'),
    masterBoost:           () => ipcRenderer.invoke('pctools:master-boost'),
    getServicesStatus:     () => ipcRenderer.invoke('pctools:get-services-status'),
    repairServices:        () => ipcRenderer.invoke('pctools:repair-services'),
    clearPrintQueue:       () => ipcRenderer.invoke('pctools:clear-print-queue'),
    checkPrinterPort:      (ip) => ipcRenderer.invoke('pctools:check-printer-port', ip),
    installVcRedist:       () => ipcRenderer.invoke('pctools:install-vcredist'),
    getDriverInfo:         () => ipcRenderer.invoke('pctools:get-driver-info'),
    scanHardwareChanges:   () => ipcRenderer.invoke('pctools:scan-hardware-changes'),
    selectFolder:          (title) => ipcRenderer.invoke('pctools:select-folder', title),
    backupDrivers:         (destFolder) => ipcRenderer.invoke('pctools:backup-drivers', destFolder),
    selectInfFile:         () => ipcRenderer.invoke('pctools:select-inf-file'),
    installDriverInf:      (infPath) => ipcRenderer.invoke('pctools:install-driver-inf', infPath),
    restartNetworkAdapter: () => ipcRenderer.invoke('pctools:restart-network-adapter'),
  },

  // ── DMH Modular On-Demand Suite ───────────────────────────────────────────
  modules: {
    getStatusAll: (modulesList) => ipcRenderer.invoke('module:get-status-all', modulesList),
    downloadGithub: (payload) => ipcRenderer.invoke('module:download-github', payload),
    uninstall: (moduleId) => ipcRenderer.invoke('module:uninstall', moduleId),
    getBaseDir: () => ipcRenderer.invoke('module:get-base-dir'),
    onDownloadProgress: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('module:download-progress', handler);
      return () => ipcRenderer.removeListener('module:download-progress', handler);
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('module:download-progress');
    },
  },

  // ── Auto-Update Installer Runner ──────────────────────────────────────────
  runInstaller: (name) => ipcRenderer.invoke('system:run-installer', name),

  // ── Open URL in default browser (dùng cho tải trực tiếp qua Chrome/Edge) ──
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),

  // ── Printer Repair & LAN Share Suite ──────────────────────────────────────
  printer: {
    getList:           () => ipcRenderer.invoke('printer:get-printers'),
    diagnose:          (name) => ipcRenderer.invoke('printer:diagnose', name),
    repairSpooler:     (mode) => ipcRenderer.invoke('printer:repair-spooler', mode),
    fix0x11b:          () => ipcRenderer.invoke('printer:fix-0x11b'),
    getPrinters:       () => ipcRenderer.invoke('printer:get-printers'),
    fixShareError:     () => ipcRenderer.invoke('printer:fix-share-error'),
    fixError0x40:      (params) => ipcRenderer.invoke('printer:fix-error-0x40', params),
    unlockIpc:         (params) => ipcRenderer.invoke('printer:unlock-ipc', params),
    clearSmbCache:     () => ipcRenderer.invoke('printer:clear-smb-cache'),
    openCredentialManager: () => ipcRenderer.invoke('printer:open-credential-manager'),
    getShareRpcStatus: () => ipcRenderer.invoke('printer:get-share-rpc-status'),
    restartSpooler:    () => ipcRenderer.invoke('printer:restart-spooler'),
    restartPc:         () => ipcRenderer.invoke('printer:restart-pc'),
    fixPointAndPrint:  () => ipcRenderer.invoke('printer:fix-point-and-print'),
    fixOfflineSnmp:    () => ipcRenderer.invoke('printer:fix-offline-snmp'),
    enableLanSharing:  () => ipcRenderer.invoke('printer:enable-lan-sharing'),
    fixSpoolerCrash:   () => ipcRenderer.invoke('printer:fix-spooler-crash'),
    printTestPage:     (name) => ipcRenderer.invoke('printer:print-test-page', name),
    setDefault:        (name) => ipcRenderer.invoke('printer:set-default', name),
    resumePrinter:     (name) => ipcRenderer.invoke('printer:resume-printer', name),
    openQueue:         (name) => ipcRenderer.invoke('printer:open-queue', name),
    openProperties:    (name) => ipcRenderer.invoke('printer:open-properties', name),
    openWindowsTool:   (tool) => ipcRenderer.invoke('printer:open-windows-tool', tool),
    diagnoseAll:       () => ipcRenderer.invoke('printer:diagnose-all'),
    fixAllIssues:      () => ipcRenderer.invoke('printer:fix-all-issues'),
    diagnose709:       () => ipcRenderer.invoke('printer:diagnose-709'),
    fixError709AZ:     () => ipcRenderer.invoke('printer:fix-error-709-az'),
    fixDefaultPrinter709: (name) => ipcRenderer.invoke('printer:fix-default-printer-709', name),
    exportFix709Script:   () => ipcRenderer.invoke('printer:export-fix-709-script'),
    saveWindowsCredential: (params) => ipcRenderer.invoke('printer:save-windows-credential', params),
    getJobs:           (name) => ipcRenderer.invoke('printer:get-jobs', name),
    deleteJob:         (name, jobId) => ipcRenderer.invoke('printer:delete-job', name, jobId),
    clearQueue:        (name) => ipcRenderer.invoke('printer:clear-queue', name),
    uninstallPrinter:  (name, driverName) => ipcRenderer.invoke('printer:uninstall-printer', name, driverName),
    getDrivers:        () => ipcRenderer.invoke('printer:get-drivers'),
    getAvailablePorts: () => ipcRenderer.invoke('printer:get-available-ports'),
    addLocalPortPrinter: (params) => ipcRenderer.invoke('printer:add-local-port-printer', params),
    autoInstallDriver:   (params) => ipcRenderer.invoke('printer:auto-install-driver', params),
    selectDriverFile:    () => ipcRenderer.invoke('printer:select-driver-file'),
    onDriverInstallProgress: (cb) => {
      ipcRenderer.on('printer:driver-install-progress', (_e, data) => cb(data));
    },
    removeDriverInstallProgressListener: () => {
      ipcRenderer.removeAllListeners('printer:driver-install-progress');
    },
  },

  // ── Certificate & Digital Signature (Ký Số XML & USB Token) ───────────────
  ca: {
    getCertificates: () => ipcRenderer.invoke('ca:get-certificates'),
    selectXmlFiles:  () => ipcRenderer.invoke('ca:select-xml-files'),
    signXml:         (payload) => ipcRenderer.invoke('ca:sign-xml', payload),
    verifyXml:       (payload) => ipcRenderer.invoke('ca:verify-xml', payload),
    saveSignedFile:  (payload) => ipcRenderer.invoke('ca:save-signed-file', payload),
  },

  // ── Smart In-App Refresh (Làm Mới Thông Minh Bảo Tồn Vị Trí) ─────────────
  onSmartRefresh: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:trigger-smart-refresh', handler);
    return () => ipcRenderer.removeListener('app:trigger-smart-refresh', handler);
  },
});

