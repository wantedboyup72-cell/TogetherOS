const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

let mainWindow = null
let pendingAuthUrl = process.argv.find(value => value.startsWith('togetheros://')) || null

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
