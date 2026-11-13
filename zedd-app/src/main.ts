import * as remoteMain from '@electron/remote/main'
import {
  app,
  BrowserWindow,
  ipcMain,
  MessageChannelMain,
  session,
  utilityProcess,
  UtilityProcess,
} from 'electron'
import * as path from 'path'
import {
  BROWSER_WORKER_CONNECT,
  BROWSER_WORKER_EXIT,
  BROWSER_WORKER_PORT,
} from './browserWorkerProtocol'

ipcMain.on('renderer-console', (_e, data: { level: string; text: string }) => {
  if (data.level === 'error' || data.level === 'warn') {
    console.error('[renderer]', data.text)
  } else if (data.level === 'log') {
    console.log('[renderer]', data.text)
  } else {
    console.debug('[renderer]', data.text)
  }
})

remoteMain.initialize()

global.isDev = process.argv.includes('--dev')

global.appUserModelId = global.isDev ? process.execPath : 'com.squirrel.zedd.zedd-app'
app.setAppUserModelId(global.appUserModelId)
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1'

if (require('electron-squirrel-startup')) {
  app.quit()
}
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | undefined

app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

let userQuit: boolean = false
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false,
      contextIsolation: false,
    },
  })
  remoteMain.enable(mainWindow.webContents)

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)

  if (global.isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('close', (e) => {
    if (!userQuit) {
      e.preventDefault()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = undefined
  })
}

let browserWorker: UtilityProcess | undefined

const getBrowserWorker = (): UtilityProcess => {
  if (!browserWorker) {
    const worker = utilityProcess.fork(path.join(__dirname, 'browser-worker.js'), [], {
      serviceName: 'zedd browser',
    })
    worker.on('exit', (code) => {
      if (browserWorker === worker) browserWorker = undefined
      console.log('browser worker exited with code', code)
      mainWindow?.webContents.send(BROWSER_WORKER_EXIT, code)
    })
    browserWorker = worker
  }
  return browserWorker
}

ipcMain.on(BROWSER_WORKER_CONNECT, (event) => {
  const { port1, port2 } = new MessageChannelMain()
  getBrowserWorker().postMessage('connect', [port1])
  event.sender.postMessage(BROWSER_WORKER_PORT, null, [port2])
})

app.on('will-quit', () => {
  browserWorker?.kill()
})

ipcMain.on('quit', () => {
  userQuit = true
  app.quit()
})

app.on('ready', () => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'zedd-app'
    callback({ cancel: false, requestHeaders: details.requestHeaders })
  })
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (null === mainWindow) {
    createWindow()
  }
})
