const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatAPI', {
  // Nhận cập nhật state từ cửa sổ chính
  onStateUpdate: (cb) => ipcRenderer.on('float:state-update', (_e, data) => cb(data)),
  // Gửi hành động ngược lại
  floatAction:   (action) => ipcRenderer.send('float:action', action),
  minimizeFloat: ()       => ipcRenderer.invoke('float:minimize'),
  resizeFloat:   (w, h)   => ipcRenderer.invoke('float:resize', w, h),
  closeFloat:    ()       => ipcRenderer.invoke('float:close'),
  onToggleBubble: (cb)    => ipcRenderer.on('float:toggle-bubble', () => cb()),
});
