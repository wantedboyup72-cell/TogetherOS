const {
  app,
  BrowserWindow,
  shell,
  ipcMain
} = require('electron')
const path = require('node:path')
const { autoUpdater } = require('electron-updater')

let mainWindow = null
let pendingAuthUrl = process.argv.find(value => value.startsWith('togetheros://')) || null
let updateDownloaded = false

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowPrerelease = false

function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('karya-updater:status', status)
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus({ state: 'checking', message: 'Checking for updates...' })
})

autoUpdater.on('update-available', info => {
  sendUpdateStatus({
    state: 'available',
    version: info.version,
    message: `Version ${info.version} is available.`
  })
})

autoUpdater.on('update-not-available', info => {
  sendUpdateStatus({
    state: 'not-available',
    version: info.version,
    message: 'You are using the latest version.'
  })
})

autoUpdater.on('download-progress', progress => {
  sendUpdateStatus({
    state: 'downloading',
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
    message: `Downloading update: ${Math.round(progress.percent)}%`
  })
})

autoUpdater.on('update-downloaded', info => {
  updateDownloaded = true
  sendUpdateStatus({
    state: 'downloaded',
    version: info.version,
    message: 'Update downloaded. Restart to install.'
  })
})

autoUpdater.on('error', error => {
  sendUpdateStatus({
    state: 'error',
    message: error.message || 'Update check failed.'
  })
})

ipcMain.handle('karya-updater:check', async () => {
  if (!app.isPackaged) {
    return { ok: false, message: 'Updates are available in the installed desktop app.' }
  }

  try {
    await autoUpdater.checkForUpdates()
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update check failed.'
    sendUpdateStatus({ state: 'error', message })
    return { ok: false, message }
  }
})

ipcMain.handle('karya-updater:download', async () => {
  if (!app.isPackaged) return { ok: false, message: 'Use the installed desktop app.' }

  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed.'
    sendUpdateStatus({ state: 'error', message })
    return { ok: false, message }
  }
})

ipcMain.handle('karya-updater:install', () => {
  if (!updateDownloaded) {
    return { ok: false, message: 'No downloaded update is ready.' }
  }

  autoUpdater.quitAndInstall()
  return { ok: true }
})

function deliverAuthUrl(url) {
  if (!url || !url.startsWith('togetheros://')) return
  pendingAuthUrl = url

  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoading() === false) {
    mainWindow.webContents.send('togetheros:auth-callback', url)
    pendingAuthUrl = null
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
}

const hasSingleInstance = app.requestSingleInstanceLock()

if (!hasSingleInstance) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find(value => value.startsWith('togetheros://'))
    if (url) deliverAuthUrl(url)

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    deliverAuthUrl(url)
  })

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 680,
      autoHideMenuBar: true,
      backgroundColor: '#0b1020',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))

    mainWindow.webContents.on('did-finish-load', () => {
      if (pendingAuthUrl) {
        mainWindow.webContents.send('togetheros:auth-callback', pendingAuthUrl)
        pendingAuthUrl = null
      }
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) shell.openExternal(url)
      return { action: 'deny' }
    })

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('file://')) event.preventDefault()
    })

    mainWindow.on('closed', () => { mainWindow = null })
  }

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient('togetheros')
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
