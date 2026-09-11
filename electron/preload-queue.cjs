/**
 * Preload script cho Queue Display Window (màn chờ TV)
 * Bridge giữa main process và queue-display.html
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronQueueBridge', {
  // Nhận dữ liệu cập nhật từ main process
  onUpdate: (callback) => {
    ipcRenderer.on('queue-display:update', (_event, data) => {
      callback(data);
    });
  },

  // Phát TTS tiếng Việt qua Piper (gọi main process)
  speakPiper: (text) => ipcRenderer.invoke('queue:speak-piper', text),
});
