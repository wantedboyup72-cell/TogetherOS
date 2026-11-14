const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('togetherOS', {
  onAuthCallback(callback) {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, url) => callback(url)
    ipcRenderer.on('togetheros:auth-callback', listener)
    return () => ipcRenderer.removeListener('togetheros:auth-callback', listener)
  },

  updater: {
    checkForUpdates() {
      return ipcRenderer.invoke('karya-updater:check')
    },
    downloadUpdate() {
      return ipcRenderer.invoke('karya-updater:download')
    },
    installUpdate() {
      return ipcRenderer.invoke('karya-updater:install')
    },
    onStatus(callback) {
      if (typeof callback !== 'function') return () => {}
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('karya-updater:status', listener)
      return () => ipcRenderer.removeListener('karya-updater:status', listener)
    }
  }
})
