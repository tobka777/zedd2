import {
  app,
  autoUpdater,
  getCurrentWindow,
  Menu,
  getGlobal,
  nativeImage,
  powerMonitor,
  screen as electronScreen,
  shell,
  Tray,
} from '@electron/remote'
import { BrowserWindow, ipcRenderer, MenuItemConstructorOptions, Rectangle } from 'electron'
import { autorun, computed, configure as configureMobx, untracked } from 'mobx'
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
import { suggestedTaskMenuItems } from './menuUtil'
configureMobx({ enforceActions: 'never' })

const currentWindow = getCurrentWindow()
const saveDir = path.join(app.getPath('home'), 'zedd')

const platformDir = path.join(saveDir, 'platform')

const userConfigFile = path.join(saveDir, 'zeddconfig.json')

const edgeProfileDir = path.join(
  process.platform === 'win32' && process.env['LOCALAPPDATA']
    ? path.join(process.env['LOCALAPPDATA'], 'zedd')
    : app.getPath('userData'),
  'edge-profile-v1',
)

const d = (...x: any[]) => console.log('renderer.ts', ...x)

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

// Renderlog only in dev mode
const forwardLogs = !!getGlobal('isDev') || !!process.env.ZEDD_FORWARD_LOGS
const MAX_FORWARDED_LOG_LENGTH = 4000
;(forwardLogs ? (['log', 'warn', 'error', 'debug'] as const) : []).forEach((level) => {
  const original = console[level].bind(console)
  console[level] = (...args: any[]) => {
    original(...args)
    try {
      const text = args
        .map((a) => {
          try {
            return typeof a === 'string' ? a : JSON.stringify(a, _jsonReplacer)
          } catch {
            return String(a)
          }
        })
        .join(' ')
        .slice(0, MAX_FORWARDED_LOG_LENGTH)
      ipcRenderer.send('renderer-console', { level, text })
    } catch {}
  }
})

function _jsonReplacer(_key: string, value: any) {
  return typeof value === 'bigint' ? value.toString() : value
}

function showNotification(title: string, text: string, cb: () => void) {
  const notification = new Notification(title, {
    body: text,
  })
  notification.onclick = cb
}

let beforeQuit = async () => {}

function quit() {
  beforeQuit()
    .catch((error) => console.error('Error before quitting', error))
    .finally(() => ipcRenderer.send('quit'))
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
  platformState.edgeProfileDir = edgeProfileDir
  beforeQuit = () => platformState.quitBrowsers()

  const config = (await fileExists(userConfigFile))
    ? await ZeddSettings.readFromFile(userConfigFile)
    : new ZeddSettings(userConfigFile)

  d('platformDir=' + platformDir)
  platformState.init()
  autorun(() => {
    platformState.ottLink = config.ottLink
    platformState.repliconLink = config.repliconLink
    platformState.repliconActivity = config.repliconActivity
    platformState.chromeHeadless = config.chromeHeadless
    // untracked, so the import/export flags read in there don't re-trigger this autorun
    untracked(() => platformState.setIntegrationMap())
  })

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
    d(`Loaded state with ${state.slices.length} slices.`)
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
    )
  }

  state.whatsNewDialogOpen = app.getVersion() !== state.whatsNewDialogLastOpenedForVersion
  state.whatsNewDialogLastOpenedForVersion = app.getVersion()

  getTasksFromAssignedJiraIssues(platformState.tasks)
    .then((e) => (state.assignedIssueTasks = e.map((t) => state.normalizeTask(t))))
    .catch((error) => state.addMessage(error.message))

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

  const dataDir = path.join(saveDir, 'data')
  let lastSavedJson: string | undefined
  const save = () => {
    const json = state.toJsonString()
    if (json === lastSavedJson) return
    AppState.saveToDir(state, dataDir, json)
      .then(() => (lastSavedJson = json))
      .catch((e) => console.error('Could not save state', e))
  }

  let saveIdleCallback: number | undefined
  const saveInterval = setInterval(() => {
    if (saveIdleCallback !== undefined) return
    saveIdleCallback = requestIdleCallback(
      () => {
        saveIdleCallback = undefined
        save()
      },
      { timeout: 5_000 },
    )
  }, 10 * 1000)

  const cleanSaveDirInterval = setInterval(
    () => AppState.cleanSaveDir(dataDir).catch((e) => console.error('Could not clean save dir', e)),
    60 * 60 * 1000,
  )
  let taskSelectRef: HTMLInputElement | null = null
  // The task select is not mounted in hover mode, so focusing has to wait until it is rendered.
  let focusTaskSelectPending = false
  const setTaskSelectRef = (r: HTMLInputElement | null) => {
    taskSelectRef = r
    if (r && focusTaskSelectPending) {
      focusTaskSelectPending = false
      r.focus()
    }
  }
  const focusTaskSelect = () => {
    if (taskSelectRef) {
      taskSelectRef.focus()
    } else {
      focusTaskSelectPending = true
    }
  }

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

  const saveWindowBounds = () => {
    const win = getCurrentWindow()
    if (state && !state.hoverMode) {
      if (win.isMaximized()) {
        state.bounds.maximized = true
      } else {
        state.bounds.maximized = false
        state.bounds.normal = win.getBounds()
      }
    }
    if (state && state.hoverMode) {
      state.bounds.hover = win.getBounds()
    }
  }

  currentWindowEvents.push(['resize', saveWindowBounds])
  currentWindowEvents.push(['maximize', saveWindowBounds])
  currentWindowEvents.push(['maximize', hoverModeOff])
  currentWindowEvents.push(['unmaximize', restoreUnmaximizedBoundsIfNotHoverMode])
  currentWindowEvents.push(['move', saveWindowBounds])
  const currentIconName = computed(() => {
    const NUMBER_OF_SAMPLES = 12
    return state.timingInProgess
      ? 'progress' + floor((state.getDayProgress(new Date()) % 1) * NUMBER_OF_SAMPLES)
      : 'paused'
  })
  const currentIconImage = computed(() =>
    path.join(app.getAppPath(), 'icons', currentIconName.get() + (isWin ? '.ico' : '_24.png')),
  )
  // The macOS menu bar sizes icons in points: a plain 24px png is shown at 24pt and fills the
  // whole menu bar (and is blurry on retina). The icons are drawn edge to edge, so use 14pt (with a
  // sharp 2x representation) to leave some padding, like the system icons.
  // As a template image macOS tints the white icon to fit light and dark menu bars.
  const MAC_TRAY_ICON_SIZE = 14
  const macTrayImages = new Map<string, Electron.NativeImage>()
  const getMacTrayImage = (iconName: string) => {
    let image = macTrayImages.get(iconName)
    if (!image) {
      const source = nativeImage.createFromPath(
        path.join(app.getAppPath(), 'icons', `${iconName}_128.png`),
      )
      image = nativeImage.createEmpty()
      for (const scaleFactor of [1, 2]) {
        const size = MAC_TRAY_ICON_SIZE * scaleFactor
        image.addRepresentation({
          scaleFactor,
          buffer: source.resize({ width: size, height: size, quality: 'best' }).toPNG(),
        })
      }
      image.setTemplateImage(true)
      macTrayImages.set(iconName, image)
    }
    return image
  }
  const currentTrayImage = computed(() =>
    isMac ? getMacTrayImage(currentIconName.get()) : currentIconImage.get(),
  )
  const tray = new Tray(currentTrayImage.get())
  tray.on('double-click', () => {
    getCurrentWindow().show()
  })

  const cleanupSetStateLinks = autorun(() => {
    state.links = getLinksFromString(state.currentTask.name)
  })

  let currentMenu: Electron.Menu
  let lastTrayMenuSignature: string | undefined

  const cleanupTrayMenuAutorun = autorun(() => {
    const template: MenuItemConstructorOptions[] = [
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
          focusTaskSelect()
        },
      },

      ...(0 === state.links.length ? [] : [{ type: 'separator' } as MenuItemConstructorOptions]),

      ...state.links.map(([key, link]): MenuItemConstructorOptions => ({
        label: 'Open in Browser: ' + key,
        type: 'normal',
        click: () => shell.openExternal(link),
      })),

      { type: 'separator' },

      {
        label: state.timingInProgess ? '■ Stop Timing' : '▶️ Start Timing',
        type: 'normal',
        click: () => state.toggleTimingInProgress(),
      },
    ]

    const signature = JSON.stringify(
      template.map(({ label, sublabel, checked, type }) => [label, sublabel, checked, type]),
    )
    if (signature === lastTrayMenuSignature) return
    lastTrayMenuSignature = signature
    tray.setContextMenu((currentMenu = Menu.buildFromTemplate(template)))
  })

  const cleanupIconAutorun = autorun(() => {
    tray.setImage(currentTrayImage.get())
    currentWindow.setIcon(currentIconImage.get())
  })

  let lastTooltip: string | undefined
  const cleanupTrayTooltipAutorun = autorun(() => {
    const workedTime = formatHoursHHmm(state.getDayWorkedHours(new Date()))
    const timingInfo =
      state.timingInProgess && state.currentTask
        ? '▶️ Currently Timing: ' +
          state.currentTask.name +
          ' ' +
          formatHoursBT(state.getTaskHours(state.currentTask))
        : '■ Not Timing'
    const tooltip = workedTime + ' ' + timingInfo
    if (tooltip === lastTooltip) return
    lastTooltip = tooltip
    tray.setToolTip(tooltip)
    document.title = tooltip
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
      if (saveIdleCallback !== undefined) cancelIdleCallback(saveIdleCallback)
      clearInterval(cleanSaveDirInterval)
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
          taskSelectRef: setTaskSelectRef,
          state,
          checkCgJira,
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
