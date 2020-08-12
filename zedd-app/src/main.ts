import { app, ipcMain, BrowserWindow } from 'electron'
import { homedir } from 'os'
import * as path from 'path'

global.isDev = process.argv.includes('--dev')

global.appUserModelId = global.isDev ? process.execPath : 'com.squirrel.zedd.zedd-app'
app.setAppUserModelId(global.appUserModelId)
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.allowRendererProcessReuse = false

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  // eslint-disable-line global-require
  app.quit()
}
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | undefined

app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

let userQuit: boolean = false
const createWindow = () => {
  if (global.isDev) {
    // BrowserWindow.addDevToolsExtension(
    //   path.join(
    //     homedir(),
    //     // react-devtools
    //     'AppData/Local/Google/Chrome/User Data/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/4.8.2_0',
    //   ),
    // )
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false,
      enableRemoteModule: true,
    },
  })

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)

  if (global.isDev) {
    // Open the DevTools.
    mainWindow.webContents.openDevTools()
  }

  // This must be done here, because registered callbacks in the renderer
  // process are async and preventDefault is ignored
  mainWindow.on('close', (e) => {
    if (!userQuit) {
      e.preventDefault()
    }
  })
  // mainWindow.on('minimize', () => mainWindow!.hide())

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = undefined
  })
}

ipcMain.on('quit', () => {
  userQuit = true
  app.quit()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (null === mainWindow) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
