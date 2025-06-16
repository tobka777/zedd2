import {
  app,
  autoUpdater,
  getCurrentWindow,
  Menu,
  powerMonitor,
  screen as electronScreen,
  shell,
  Tray,
} from '@electron/remote'
import { BrowserWindow, ipcRenderer, MenuItemConstructorOptions, Rectangle } from 'electron'
import { autorun, computed, configure as configureMobx } from 'mobx'
import * as path from 'path'
import * as React from 'react'
import 'win-ca' // use windows root certificates
import { AppState, format, formatInterval, TimeSlice } from './AppState'
import { PlatformState } from './PlatformState'
import { AppGui } from './components/AppGui'
import './index.css'
import { createRoot } from 'react-dom/client'
import {
  checkCgJira,
  getLinksFromString,
  getTasksForSearchString,
  getTasksFromAssignedJiraIssues,
  initJiraClient,
} from './plJiraConnector'
import { fileExists, floor, formatHoursBT, formatHoursHHmm, mkdirIfNotExists } from './util'
import { ZeddSettings } from './ZeddSettings'
import {
  getChromeDriverVersion,
  getChromeVersion,
  getLatestChromeDriverVersion,
  getNonEnvPathChromePath,
  installChromeDriver,
} from './chromeDriverMgmt'
import { suggestedTaskMenuItems } from './menuUtil'

configureMobx({ enforceActions: 'never' })

const currentWindow = getCurrentWindow()
const saveDir = path.join(app.getPath('home'), 'zedd')

const platformDir = path.join(saveDir, 'platform')

const userConfigFile = path.join(saveDir, 'zeddconfig.json')

const d = (...x: any[]) => console.log('renderer.ts', ...x)

const isWin = process.platform === 'win32'

// class Todo {
//   name: string
// }

// createModelSchema(Todo, {
//   title: optional(primitive()),
//   user: optional(
//     custom(
//       (value) => value.name,
//       () => SKIP,
//     ),
//   ),
// })

// serialize(new Todo()) // {}

function showNotification(title: string, text: string, cb: () => void) {
  const notification = new Notification(title, {
    body: text,
  })
  notification.onclick = cb
}

function quit() {
  ipcRenderer.send('quit')
}

function setupAutoUpdater(state: AppState, config: ZeddSettings) {
  if (global.isDev || !isWin)
    // disable autoupdater for mac,linux and development
    return () => {
      /* do nothing */
    }

  autoUpdater.setFeedURL({
    url: `${config.updateServer}/update/${process.platform}/${app.getVersion()}`,
  })

  const checkForUpdatesInterval = setInterval(
    () => autoUpdater.checkForUpdates(),
    2 * 60 * 60 * 1000, // every 2 hours
  )

  autoUpdater.on(
    'update-downloaded',
    (_event, _releaseNotes, releaseName, _releaseDate, _updateURL) =>
      (state.updateAvailable = releaseName),
  )
  autoUpdater.on('error', (error: Error) => console.log(error.message))
  return () => {
    clearInterval(checkForUpdatesInterval)
    autoUpdater.removeAllListeners()
  }
}

const getMenuItems = (state: AppState) => [
  { label: 'Undo (Ctrl+Z)', click: () => state.undo() },
  { label: 'Redo (Ctrl+Y)', click: () => state.redo() },
  {
    label: 'Open Config Dir',
    click: () => shell.showItemInFolder(userConfigFile),
  },
  { label: 'Edit Settings', click: () => (state.settingsDialogOpen = true) },
  { label: 'Github', click: () => shell.openExternal('https://github.com/tobka777/zedd2') },
  { label: 'Open Dev', click: () => getCurrentWindow().webContents.openDevTools() },
  { label: 'Reload Config', click: () => getCurrentWindow().reload() },
  { label: 'Quit', click: () => quit() },
]

async function setup() {
  await mkdirIfNotExists(saveDir)

  const platformState = new PlatformState(platformDir)

  const config = (await fileExists(userConfigFile))
    ? await ZeddSettings.readFromFile(userConfigFile)
    : new ZeddSettings(userConfigFile)

  d('platformDir=' + platformDir)
  platformState.init()
  autorun(() => {
    platformState.ottLink = config.ottLink
    platformState.repliconLink = config.repliconLink
    platformState.chromeHeadless = config.chromeHeadless
  })

  // await sleep(5000);
  // importAndSaveClarityTasks();
  try {
    await platformState.loadStateFromFile()
  } catch (e) {
    console.error('Could not load clarity tasks')
    console.error(e)
  }

  try {
    initJiraClient(config.cgJira, platformState, () => config.saveToFile(), config.jira2.url)
  } catch (e) {
    console.error('Could not init JiraClient')
    console.error(e)
  }

  const currentWindowEvents: [string, (...args: any[]) => void][] = []
  let state: AppState
  try {
    state = await AppState.loadFromDir(path.join(saveDir, 'data'))
    d(state)
    d('Cleaning save dir')
    const deletedFileCount = await AppState.cleanSaveDir(path.join(saveDir, 'data'))
    d(`Deleted ${deletedFileCount} files.`)
  } catch (e) {
    console.error(e)
    console.error('Could not load state from ' + path.join(saveDir, 'data'))
    state = new AppState()
  }

  state.startInterval(() => powerMonitor?.getSystemIdleTime() ?? 0)
  state.config = config
  let lastAwaySlice: string | undefined
  state.idleSliceNotificationCallback = (when) => {
    lastAwaySlice = formatInterval(when) + ' ' + '$$$OTHER$$$'
    console.log('You were away ' + format(when.start) + ' - ' + format(when.end))
    showNotification(
      'You were away ' + format(when.start) + ' - ' + format(when.end),
      'Close to discard or click to assign a task.',
      () => {
        if (lastAwaySlice) {
          const [start, end, _taskName] = TimeSlice.parse(lastAwaySlice!)
          lastAwaySlice = undefined
          const newSlice = new TimeSlice(start, end, state.getUndefinedTask())
          state.addSlice(newSlice)

          if (!currentWindow.isVisible()) {
            currentWindow.show()
          }
          if (state.hoverMode) {
            state.hoverMode = false
          }
          currentWindow.focus()
          state.changingSliceTask = newSlice
        }
      },
      // code for interactive notification. Disabled because it only works with a native module
      // which isn't worth the hassle.
      //   [state.currentTask.name.substring(0), formatInterval(when) + ' ' + state.currentTask.name],
      //   ['Other...', formatInterval(when) + ' ' + '$$$OTHER$$$'],
      //   (_, wargs) => {
      //     const [start, end, taskName] = TimeSlice.parse(wargs.arguments)
      //     const newSlice = new TimeSlice(
      //       start,
      //       end,
      //       '$$$OTHER$$$' === taskName ? state.getUndefinedTask() : state.getTaskForName(taskName),
      //     )
      //     state.addSlice(newSlice)
      //     if ('$$$OTHER$$$' === taskName) {
      //       if (!currentWindow.isVisible()) {
      //         currentWindow.show()
      //       }
      //       if (state.hoverMode) {
      //         state.hoverMode = false
      //       }
      //       currentWindow.focus()
      //       state.changingSliceTask = newSlice
      //     }
      //   },
    )
  }

  state.whatsNewDialogOpen = app.getVersion() !== state.whatsNewDialogLastOpenedForVersion
  state.whatsNewDialogLastOpenedForVersion = app.getVersion()

  getTasksFromAssignedJiraIssues(platformState.tasks)
    .then((e) => (state.assignedIssueTasks = e.map((t) => state.normalizeTask(t))))
    .catch((error) => state.addMessage(error.message))

  const checkChromePath = async (): Promise<{
    chromeVersion: string
    chromeDriverVersion: string
  }> => {
    if (!state.config.chromePath) {
      state.config.chromePath = (await getNonEnvPathChromePath()) ?? ''
      if (!state.config.chromePath) {
        throw new Error(
          'Could not find chrome.exe in standard locations! Is it installed?' +
            ' https://www.google.com/chrome',
        )
      }
    }
    if (!(await fileExists(state.config.chromePath))) {
      throw new Error(
        `Could not find specified path '${state.config.chromePath}'!` +
          ' Set to empty to try standard locations.',
      )
    }
    console.log('configured chrome path', state.config.chromePath)
    const chromeVersion = await getChromeVersion(state.config.chromePath)
    console.log('current chrome version', chromeVersion)
    if (parseInt(chromeVersion.split('.')[0]) < 115) {
      // Requirement Check if Chrome newer than 115
      throw new Error(
        `Chrome ${chromeVersion} is not supported. Update Chrome to version 115 or newer!`,
      )
    }

    const requiredChromeDriverVersion = await getLatestChromeDriverVersion(chromeVersion)
    const chromeDriverDir = path.join(app.getPath('appData'), 'chromedriver')
    await mkdirIfNotExists(chromeDriverDir)
    let chromedriver = 'chromedriver'
    if (isWin) {
      chromedriver += '.exe'
    }
    const chromeDriverPath = path.join(chromeDriverDir, chromedriver)
    if (
      !(await fileExists(chromeDriverPath)) ||
      requiredChromeDriverVersion !== (await getChromeDriverVersion(chromeDriverPath))
    ) {
      console.log('chromedriver missing or has wrong version')
      installChromeDriver(requiredChromeDriverVersion, chromeDriverDir, false)
    }
    platformState.chromeExe = state.config.chromePath
    platformState.chromedriverExe = chromeDriverPath
    return { chromeVersion, chromeDriverVersion: requiredChromeDriverVersion }
  }
  checkChromePath().catch((error) => state.addMessage(error.message))

  const boundsContained = (outer: Rectangle, inner: Rectangle, margin = 0) =>
    outer.x - inner.x <= margin &&
    outer.y - inner.y <= margin &&
    inner.x + inner.width - (outer.x + outer.width) <= margin &&
    inner.y + inner.height - (outer.y + outer.height) <= margin

  const setBoundsSafe = (bw: BrowserWindow, bounds: Rectangle) => {
    if (!boundsContained(electronScreen.getDisplayMatching(bounds).bounds, bounds)) {
      bw.setBounds({ x: 20, y: 20, width: 800, height: 600 })
    } else {
      bw.setBounds(bounds)
    }
  }

  console.log(electronScreen.getPrimaryDisplay().bounds, state.bounds)

  const saveInterval = setInterval(
    () => AppState.saveToDir(state, path.join(saveDir, 'data')),
    10 * 1000,
  )

  const lastActionInterval = setInterval(
    () => (state.lastAction = powerMonitor.getSystemIdleTime()),
    1000,
  )

  let taskSelectRef: HTMLInputElement | undefined = undefined

  currentWindowEvents.push([
    'close',
    (_e: Electron.Event) => {
      if (config.keepHovering) {
        state.hoverMode = true
      } else {
        currentWindow.hide()
      }
    },
  ])

  const hoverModeOff = () => (state.hoverMode = false)
  const restoreUnmaximizedBoundsIfNotHoverMode = () =>
    !state.hoverMode && setBoundsSafe(currentWindow, state.bounds.normal)

  const saveWindowBounds = ({ sender }: { sender: BrowserWindow }) => {
    if (state && !state.hoverMode) {
      if (sender.isMaximized()) {
        state.bounds.maximized = true
      } else {
        state.bounds.maximized = false
        state.bounds.normal = sender.getBounds()
      }
    }
    if (state && state.hoverMode) {
      state.bounds.hover = sender.getBounds()
    }
  }

  currentWindowEvents.push(['resize', saveWindowBounds])
  currentWindowEvents.push(['maximize', saveWindowBounds])
  currentWindowEvents.push(['maximize', hoverModeOff])
  currentWindowEvents.push(['unmaximize', restoreUnmaximizedBoundsIfNotHoverMode])
  currentWindowEvents.push(['move', saveWindowBounds])
  const currentIconImage = computed(() => {
    const NUMBER_OF_SAMPLES = 12
    let iconExt = '.ico'
    if (!isWin) {
      iconExt = '_24.png'
    }
    if (state.timingInProgess) {
      return path.join(
        app.getAppPath(),
        'icons',
        'progress' + floor((state.getDayProgress(new Date()) % 1) * NUMBER_OF_SAMPLES) + iconExt,
      )
    } else {
      return path.join(app.getAppPath(), 'icons', 'paused' + iconExt)
    }
  })
  const tray = new Tray(currentIconImage.get())
  tray.on('double-click', () => {
    getCurrentWindow().show()
  })

  const cleanupSetStateLinks = autorun(() => {
    state.links = getLinksFromString(state.currentTask.name)
  })

  let currentMenu: Electron.Menu

  const cleanupTrayMenuAutorun = autorun(() => {
    tray.setContextMenu(
      (currentMenu = Menu.buildFromTemplate([
        // Quit first, so it is the furthest from the mouse
        {
          label: 'Quit',
          type: 'normal',
          click: () => quit(),
        },

        { type: 'separator' },

        ...suggestedTaskMenuItems(
          state,
          platformState,
          state.currentTask,
          (task) => (state.currentTask = task),
        ),

        {
          label: 'Other...',
          click: () => {
            if (!currentWindow.isVisible()) {
              currentWindow.show()
            }
            if (state.hoverMode) {
              state.hoverMode = false
            }
            currentWindow.focus()
            console.log(taskSelectRef)
            taskSelectRef && taskSelectRef.focus()
          },
        },

        ...(0 === state.links.length ? [] : [{ type: 'separator' } as MenuItemConstructorOptions]),

        ...state.links.map(
          ([key, link]): MenuItemConstructorOptions => ({
            label: 'Open in Browser: ' + key,
            type: 'normal',
            click: () => shell.openExternal(link),
          }),
        ),

        { type: 'separator' },

        {
          label: state.timingInProgess ? '■ Stop Timing' : '▶️ Start Timing',
          type: 'normal',
          click: () => state.toggleTimingInProgress(),
        },
      ])),
    )
  })
  const cleanupIconAutorun = autorun(() => {
    tray.setImage(currentIconImage.get())
    currentWindow.setIcon(currentIconImage.get())
  })
  const cleanupTrayTooltipAutorun = autorun(() => {
    const workedTime = formatHoursHHmm(state.getDayWorkedHours(new Date()))
    const timingInfo =
      state.timingInProgess && state.currentTask
        ? '▶️ Currently Timing: ' +
          state.currentTask.name +
          ' ' +
          formatHoursBT(state.getTaskHours(state.currentTask))
        : '■ Not Timing'
    tray.setToolTip(workedTime + ' ' + timingInfo)
    document.title = workedTime + ' ' + timingInfo
  })

  currentWindowEvents.push(
    ['blur', () => (state.windowFocused = false)],
    ['focus', () => (state.windowFocused = true)],
  )

  autorun(
    () => {
      if (
        config.keepHovering &&
        !state.hoverMode &&
        !state.dialogOpen() &&
        !platformState.currentlyImportingTasks &&
        !state.windowFocused
      ) {
        state.hoverMode = true
      }
    },
    { delay: 15_000 },
  )

  const cleanupHoverModeAutorun = autorun(() => {
    currentWindow.setSkipTaskbar(state.hoverMode)
    currentWindow.setAlwaysOnTop(state.hoverMode)
    // currentWindow.resizable = !state.hoverMode
    console.log('currentWindow.resizable', currentWindow.resizable)
    // console.log('showing:', state.hoverMode, !currentWindow.isVisible)
    // state.hoverMode && !currentWindow.isVisible && currentWindow.show()
    if (state.hoverMode) {
      const vertical = 'vertical' === state.config.keepHovering
      if (vertical) {
        currentWindow.setMinimumSize(43, 64)
        currentWindow.setMaximumSize(43, 0)
      } else {
        currentWindow.setMinimumSize(64, 37)
        currentWindow.setMaximumSize(0, 37)
      }
      currentWindow.isMaximized() && currentWindow.unmaximize()
      setBoundsSafe(currentWindow, {
        ...state.bounds.hover,
        height: vertical ? Math.max(150, state.bounds.hover.height) : 37,
        width: vertical ? 43 : Math.max(200, state.bounds.hover.width),
      })
    } else {
      currentWindow.setMaximumSize(10000, 10000)
      setBoundsSafe(currentWindow, state.bounds.normal)
      if (state.bounds.maximized) {
        currentWindow.maximize()
      }
    }
  })

  const cleanupAutoUpdater = setupAutoUpdater(state, config)

  currentWindowEvents.forEach(([x, y]) => currentWindow.on(x as any, y))

  let cleanup: () => void = undefined!

  window.addEventListener('beforeunload', cleanup)

  return {
    cleanup: (cleanup = () => {
      console.log('setup().cleanup')
      clearInterval(saveInterval)
      clearInterval(lastActionInterval)
      cleanupSetStateLinks()
      cleanupIconAutorun()
      cleanupTrayMenuAutorun()
      cleanupTrayTooltipAutorun()
      state.cleanup()
      tray.destroy()
      cleanupAutoUpdater()
      cleanupHoverModeAutorun()
      currentWindowEvents.forEach(([x, y]) => currentWindow.removeListener(x as any, y))
      window.removeEventListener('beforeunload', cleanup)
    }),
    renderDOM: () => {
      const container = document.getElementById('react-root')
      const root = createRoot(container!)
      root.render(
        React.createElement(AppGui, {
          showContextMenu: () => currentMenu.popup(),
          taskSelectRef: (r) => (taskSelectRef = r),
          state,
          checkCgJira,
          checkChromePath,
          platformState: platformState,
          menuItems: getMenuItems(state),
          getTasksForSearchString: (s) =>
            getTasksForSearchString(s).then((ts) =>
              ts.filter((t) => !state.tasks.some((t2) => t2.name === t.name)),
            ),
          getLinksFromString,
        }),
      )
    },
  }
}

let cleanup: () => void
let renderDOM: () => void

setup().then((r) => {
  ;({ cleanup, renderDOM } = r)
  renderDOM()
})

if (module.hot) {
  module.hot.accept('./components/AppGui', () => {
    renderDOM()
  })
  module.hot.dispose(() => cleanup())
  module.hot.accept()
}
