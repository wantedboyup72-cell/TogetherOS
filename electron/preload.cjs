const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('togetherOS', {
  onAuthCallback(callback) {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, url) => callback(url)
    ipcRenderer.on('togetheros:auth-callback', listener)
    return () => ipcRenderer.removeListener('togetheros:auth-callback', listener)
  }
})
