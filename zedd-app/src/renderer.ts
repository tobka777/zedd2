import { parse as dateParse } from 'date-fns'
import { ipcRenderer, remote, BrowserWindow, MenuItemConstructorOptions, Rectangle } from 'electron'
// @ts-ignore
import { ToastNotification } from 'electron-windows-notifications'
import { promises as fsp } from 'fs'
import { autorun, computed } from 'mobx'
import * as path from 'path'
import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { dateFormatString, format, AppState, TimeSlice } from './AppState'
import { ClarityState } from './ClarityState'
import { AppGui } from './components/AppGui'
import './index.css'
import {
  getTasksForSearchString,
  getTasksFromAssignedJiraIssues,
  initJiraClient,
  checkCgJira,
  getLinksFromString,
} from './plJiraConnector'
import toastTemplate from './toast-template.xml'
import {
  fileExists,
  formatMinutes as formatMinutesBT,
  formatMinutesHHmm,
  mkdirIfNotExists,
  floor,
} from './util'
import { ZeddSettings } from './ZeddSettings'
import { createModelSchema, optional, custom, primitive, serialize, SKIP } from 'serializr'

const {
  Tray,
  Menu,
  getCurrentWindow,
  app,
  shell,
  screen: electronScreen,
  powerMonitor,
  autoUpdater,
} = remote
const currentWindow = getCurrentWindow()
const saveDir = path.join(app.getPath('home'), 'zedd')

const clarityDir = path.join(saveDir, 'clarity')

const userConfigFile = path.join(saveDir, 'zeddconfig.json')

const d = (...x: any[]) => console.log('renderer.ts', ...x)

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

function showNotification(
  title: string,
  text: string,
  [button1Text, button1Args]: [string, string],
  [button2Text, button2Args]: [string, string],
  cb: (notification: any, args: { arguments: string }) => void,
) {
  const notification = new ToastNotification({
    template: toastTemplate,
    strings: [title, text, button1Text, button1Args, button2Text, button2Args],
  })
  notification.on('activated', cb)
  notification.show()
}

function quit() {
  ipcRenderer.send('user-quit')
}

function setupAutoUpdater(state: AppState, config: ZeddSettings) {
  if (global.isDev) return () => {}

  autoUpdater.setFeedURL({
    url: `${config.updateServer}/update/${process.platform}/${app.getVersion()}`,
  })
  const checkForUpdatesInterval = setInterval(
    () => autoUpdater.checkForUpdates(),
    2 * 60 * 60 * 1000, // every 2 hours
  )
  const onUpdateDownloaded = (
    _event: Electron.Event,
    _releaseNotes: string,
    releaseName: string,
    _releaseDate: Date,
    _updateURL: string,
  ) => {
    state.updateAvailable = releaseName
  }
  const onError = (error: Error) => state.errors.push(error.message)
  autoUpdater.on('update-downloaded', onUpdateDownloaded)
  autoUpdater.on('error', onError)
  return () => {
    clearInterval(checkForUpdatesInterval)
    autoUpdater.off('update-downloaded', onUpdateDownloaded)
    autoUpdater.off('error', onError)
  }
}

const getMenuItems = (state: AppState) => [
  {
    label: 'Open Config Dir',
    click: () => shell.showItemInFolder(userConfigFile),
  },
  { label: 'Edit Settings', click: () => (state.settingsDialogOpen = true) },

  { label: 'Github', click: () => shell.openExternal('https://github.com/NaridaL/zedd') },
  { label: 'Open Dev', click: () => getCurrentWindow().webContents.openDevTools() },
  { label: 'Reload Config', click: () => getCurrentWindow().reload() },
  { label: 'Quit', click: () => quit() },
]

async function setup() {
  await mkdirIfNotExists(saveDir)

  const clarityState = new ClarityState(clarityDir)

  const config = (await fileExists(userConfigFile))
    ? await ZeddSettings.readFromFile(userConfigFile)
    : new ZeddSettings(userConfigFile)

  d('clarityDir=' + clarityDir)
  clarityState.init()
  clarityState.nikuLink = config.nikuLink

  // await sleep(5000);
  // importAndSaveClarityTasks();
  try {
    await clarityState.loadStateFromFile()
  } catch (e) {
    console.error('Could not load clarity tasks')
    console.error(e)
  }

  try {
    initJiraClient(config.cgJira, clarityState, () => config.saveToFile())
  } catch (e) {
    console.error('Could not init JiraClient')
    console.error(e)
  }
  getTasksFromAssignedJiraIssues(clarityState.tasks)
    .then((e) => (state.assignedIssueTasks = e.map((t) => state.normalizeTask(t))))
    .catch((err) => state.errors.push(err.message))

  const currentWindowEvents: [string, Function][] = []
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
  state.startInterval()
  state.config = config
  state.idleSliceNotificationCallback = (when) => {
    console.log('You were away ' + format(when.start) + ' - ' + format(when.end))
    showNotification(
      'You were away ' + format(when.start) + ' - ' + format(when.end),
      'Close to discard or choose what to assign.',
      [
        state.currentTask.name.substring(0),
        format(when.start) + ' - ' + format(when.end) + ' ' + state.currentTask.name,
      ],
      ['Other', 'other'],
      (_, wargs) => {
        if ('other' === wargs.arguments) {
        } else {
          const [, startString, endString, taskName] = wargs.arguments.match(
            /(.{16}) - (.{16}) (.*)/,
          )!

          const now = new Date()
          state.addSlice(
            new TimeSlice(
              dateParse(startString, dateFormatString, now),
              dateParse(endString, dateFormatString, now),
              state.getTaskForName(taskName),
            ),
          )
        }
      },
    )
  }

  const boundsContained = (outer: Rectangle, inner: Rectangle, margin = 0) =>
    outer.x - inner.x <= margin &&
    outer.y - inner.y <= margin &&
    inner.x + inner.width - (outer.x + outer.width) <= margin &&
    inner.y + inner.height - (outer.y + outer.height) <= margin

  console.log(electronScreen.getPrimaryDisplay().bounds, state.bounds)

  const saveInterval = setInterval(
    () => AppState.saveToDir(state, path.join(saveDir, 'data')),
    10 * 1000,
  )

  const lastActionInterval = setInterval(
    () => (state.lastAction = powerMonitor.getSystemIdleTime()),
    1000,
  )

  currentWindowEvents.push([
    'close',
    (e: Electron.Event) => {
      if (config.keepHovering) {
        state.hoverMode = true
      } else {
        currentWindow.hide()
      }
    },
  ])

  const hoverModeOff = () => (state.hoverMode = false)
  const restoreUnmaximizedBoundsIfNotHoverMode = () =>
    !state.hoverMode && currentWindow.setBounds(state.bounds.normal)

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
    if (state.timingInProgess) {
      return (
        app.getAppPath() +
        '/' +
        'icons/progress' +
        floor((state.getDayProgress(new Date()) % 1) * NUMBER_OF_SAMPLES) +
        '.ico'
      )
    } else {
      return app.getAppPath() + '/' + 'icons/paused.ico'
    }
  })
  const tray = new Tray(currentIconImage.get())
  tray.on('double-click', () => {
    getCurrentWindow().show()
  })

  const cleanupSetStateLinks = autorun(() => {
    state.links = getLinksFromString(state.currentTask.name)
  })

  const cleanupTrayMenuAutorun = autorun(() => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        // Quit first, so it is the furthest from the mouse
        {
          label: 'Quit',
          type: 'normal',
          click: () => quit(),
        },

        { type: 'separator' },

        ...state.getSuggestedTasks().map(
          (t): MenuItemConstructorOptions => ({
            label: t.name,
            type: 'checkbox',
            checked: state.currentTask === t,
            click: (x) => (state.currentTask = state.getTaskForName(x.label)),
          }),
        ),

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
      ]),
    )
  })
  const cleanupIconAutorun = autorun(() => {
    tray.setImage(currentIconImage.get())
    currentWindow.setIcon(currentIconImage.get())
  })
  const cleanupTrayTooltipAutorun = autorun(() => {
    const workedTime = formatMinutesHHmm(state.getDayWorkedMinutes(new Date()))
    const timingInfo =
      state.timingInProgess && state.currentTask
        ? '▶️ Currently Timing: ' +
          state.currentTask.name +
          ' ' +
          formatMinutesBT(state.getTaskMinutes(state.currentTask)) +
          'BT'
        : '■ Not Timing'
    tray.setToolTip(workedTime + ' ' + timingInfo)
    document.title = workedTime + ' ' + timingInfo
  })

  let hoverModeTimer: NodeJS.Timeout | undefined
  currentWindowEvents.push(
    [
      'blur',
      () =>
        config.keepHovering &&
        !state.hoverMode &&
        (hoverModeTimer = setTimeout(() => (d('uhm'), (state.hoverMode = true)), 15_000)),
    ],
    ['focus', () => hoverModeTimer && clearTimeout(hoverModeTimer)],
  )

  const cleanupHoverModeAutorun = autorun(() => {
    currentWindow.setSkipTaskbar(state.hoverMode)
    currentWindow.setAlwaysOnTop(state.hoverMode)
    // currentWindow.resizable = !state.hoverMode
    console.log('currentWindow.resizable', currentWindow.resizable)
    // console.log('showing:', state.hoverMode, !currentWindow.isVisible)
    // state.hoverMode && !currentWindow.isVisible && currentWindow.show()
    if (state.hoverMode) {
      currentWindow.isMaximized && currentWindow.unmaximize()
      currentWindow.setBounds({
        ...state.bounds.hover,
        height: 32,
        width: Math.min(800, state.bounds.hover.width),
      })
    } else {
      currentWindow.setBounds(state.bounds.normal)
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
    cleanup: cleanup = () => {
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
    },
    renderDOM: () => {
      ReactDOM.render(
        React.createElement(AppGui, {
          state,
          checkCgJira,
          clarityState,
          menuItems: getMenuItems(state),
          getTasksForSearchString: (s) =>
            getTasksForSearchString(s).then((ts) =>
              ts.filter((t) => !state.tasks.some((t2) => t2.name === t.name)),
            ),
        }),
        document.getElementById('react-root'),
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
