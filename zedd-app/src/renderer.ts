import {
  app,
  autoUpdater,
  screen as electronScreen,
  getCurrentWindow,
  Menu,
  nativeImage,
  powerMonitor,
  shell,
  Tray,
} from '@electron/remote'
import { BrowserWindow, ipcRenderer, MenuItemConstructorOptions, Rectangle } from 'electron'
import { execFile } from 'child_process'
import { format as formatDate, getISODay, startOfISOWeek } from 'date-fns'
import { sum } from 'lodash'
import { autorun, computed, configure as configureMobx } from 'mobx'
import * as path from 'path'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
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
import {
  deriveTeamsAutoSwitchTask,
  pickBestTeamsCallOrMeetingTitle,
} from './teamsAutoSwitch'
import { fileExists, floor, formatHoursBT, formatHoursHHmm, mkdirIfNotExists } from './util'
import { ZeddSettings } from './ZeddSettings'
import {
  getChromeDriverVersion,
  getChromeVersion,
  getLatestChromeDriverVersion,
  getNonEnvPathChromePath,
  installChromeDriver,
} from './chromeDriverMgmt'
import { AppGui } from './components/AppGui'
import './index.css'
import { suggestedTaskMenuItems } from './menuUtil'
import { startOttzTalkerServer } from './ottzTalkerServer'
import {
  checkCgJira,
  getLinksFromString,
  getTasksForSearchString,
  getTasksFromAssignedJiraIssues,
  initJiraClient,
} from './plJiraConnector'
import { fileExists, floor, formatHoursBT, formatHoursHHmm, mkdirIfNotExists } from './util'

configureMobx({ enforceActions: 'never' })

const currentWindow = getCurrentWindow()
const saveDir = path.join(app.getPath('home'), 'zedd')

const platformDir = path.join(saveDir, 'platform')

const userConfigFile = path.join(saveDir, 'zeddconfig.json')

const d = (...x: any[]) => console.log('renderer.ts', ...x)

const isWin = process.platform === 'win32'
const TEAMS_WINDOW_TITLE_QUERY = `
$teamsPids = Get-Process | Where-Object { $_.Name -match 'ms-teams|msteams|Teams' } | Select-Object -ExpandProperty Id
if (-not $teamsPids) { return }
if (-not ('TeamsWindowEnumerator' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class TeamsWindowInfo {
  public int ProcessId { get; set; }
  public string Title { get; set; }
}

public static class TeamsWindowEnumerator {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

  [DllImport("user32.dll")]
  private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

  [DllImport("user32.dll")]
  private static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr hWnd);

  public static List<TeamsWindowInfo> GetOpenWindows() {
    var windows = new List<TeamsWindowInfo>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) {
        return true;
      }

      int length = GetWindowTextLength(hWnd);
      if (length == 0) {
        return true;
      }

      var builder = new StringBuilder(length + 1);
      GetWindowText(hWnd, builder, builder.Capacity);
      var title = builder.ToString();
      if (string.IsNullOrWhiteSpace(title)) {
        return true;
      }

      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      windows.Add(new TeamsWindowInfo {
        ProcessId = (int)processId,
        Title = title
      });
      return true;
    }, IntPtr.Zero);
    return windows;
  }
}
"@ | Out-Null
}

[TeamsWindowEnumerator]::GetOpenWindows() |
  Where-Object { $teamsPids -contains $_.ProcessId -and $_.Title -and $_.Title.Trim().Length -gt 0 } |
  Select-Object -ExpandProperty Title -Unique
`
const TEAMS_CALL_CHECK_INTERVAL_MS = 15_000
const TEAMS_CALL_DETECT_CONFIRMATIONS = 2
const TEAMS_CALL_CLEAR_CONFIRMATIONS = 2

/**
 * Checks whether Microsoft Teams currently has an active call or meeting window open.
 * Returns the window title of the active Teams call/meeting, or null if none is found.
 * Only works on Windows.
 */
function getActiveTeamsCallTitle(): Promise<string | undefined> {
  if (!isWin) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', TEAMS_WINDOW_TITLE_QUERY],
      { timeout: 3000 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(undefined)
          return
        }
        const titles = stdout
          .trim()
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean)
        resolve(pickBestTeamsCallOrMeetingTitle(titles))
      },
    )
  })
}

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

function createNotificationDotImage() {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#FF4444'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, 2 * Math.PI)
  ctx.fill()
  return nativeImage.createFromDataURL(canvas.toDataURL())
}

function startIconAlert() {
  getCurrentWindow().flashFrame(true)
  if (isWin) {
    getCurrentWindow().setOverlayIcon(createNotificationDotImage(), 'Notification')
  }
}

function clearIconAlert() {
  getCurrentWindow().flashFrame(false)
  if (isWin) {
    getCurrentWindow().setOverlayIcon(null, '')
  }
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
    platformState.repliconActivity = config.repliconActivity
    platformState.chromeHeadless = config.chromeHeadless
    platformState.setIntegrationMap()
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

  try {
    const tokenFilePath = path.join(saveDir, 'ottztalker.token')
    const { token } = await startOttzTalkerServer({
      appState: state,
      platformState,
      tokenFilePath,
    })
    console.log(
      'OTTZTalker REST server running on http://127.0.0.1:12345 (token in ' + tokenFilePath + ')',
    )
    console.log('OTTZTalker token: ' + token)
  } catch (e) {
    console.error('Failed to start OTTZTalker REST server')
    console.error(e)
  }
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

  // Teams call detection: periodically check for active Teams call/meeting windows and
  // auto-switch the current task when configured.
  let teamsCallActive = false
  let previousTask: typeof state.currentTask | null = null
  let teamsCallDetectStreak = 0
  let teamsCallClearStreak = 0
  let pendingTeamsCallTitle: string | undefined = undefined
  const teamsCallInterval = setInterval(async () => {
    if (!config.teamsAutoSwitch) return
    try {
      const callTitle = await getActiveTeamsCallTitle()
      if (callTitle) {
        teamsCallClearStreak = 0
        if (pendingTeamsCallTitle !== callTitle) {
          pendingTeamsCallTitle = callTitle
          teamsCallDetectStreak = 1
        } else {
          teamsCallDetectStreak += 1
        }
      } else {
        teamsCallDetectStreak = 0
        pendingTeamsCallTitle = undefined
        teamsCallClearStreak += 1
      }

      if (
        !teamsCallActive &&
        pendingTeamsCallTitle &&
        teamsCallDetectStreak >= TEAMS_CALL_DETECT_CONFIRMATIONS
      ) {
        teamsCallActive = true
        previousTask = state.currentTask
        const teamsTask = deriveTeamsAutoSwitchTask(pendingTeamsCallTitle, config.teamsTaskName)
        state.currentTask = state.getTaskForNameWithDefaults(teamsTask.taskName, {
          taskActivityName: teamsTask.taskActivityName,
          platformTaskComment: teamsTask.platformTaskComment,
        })
        d('Teams call detected, switched to task:', teamsTask.taskName)
      } else if (
        teamsCallActive &&
        teamsCallClearStreak >= TEAMS_CALL_CLEAR_CONFIRMATIONS
      ) {
        teamsCallActive = false
        if (previousTask) {
          state.currentTask = previousTask
          d('Teams call ended, restored previous task:', previousTask.name)
        }
        previousTask = null
        teamsCallClearStreak = 0
      }
    } catch (e) {
      console.error('Error checking Teams call status', e)
    }
  }, TEAMS_CALL_CHECK_INTERVAL_MS)

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

  // Keys are date+advance-specific (e.g. 'day-2026-04-07-adv-15'), so each threshold gets
  // exactly one notification per day/week, and the set naturally prevents re-firing.
  const sentNotifications = new Set<string>()
  const cleanupTargetNotificationAutorun = autorun(() => {
    if (!config.targetNotificationsEnabled) return
    const now = new Date()
    const advanceList = config.targetNotificationAdvanceMinutes

    const notifyOnce = (key: string, title: string, body: string) => {
      if (!sentNotifications.has(key)) {
        sentNotifications.add(key)
        showNotification(title, body, () => {
          // no action needed for target notifications
        })
        if (config.targetNotificationIconAlert) {
          startIconAlert()
        }
      }
    }

    const describeOffset = (advMin: number): string => {
      if (advMin > 0) return `${advMin} min before target`
      if (advMin === 0) return 'target reached'
      return `${-advMin} min past target`
    }

    const getTitle = (advMin: number, scope: 'Daily' | 'Weekly'): string => {
      if (advMin > 0) return `${scope} target almost reached`
      if (advMin === 0) return `${scope} target reached`
      return `${scope} overtime`
    }

    for (const advMin of advanceList) {
      const advanceHours = advMin / 60

      // Daily notification
      const dayTarget = config.workmask[getISODay(now) - 1] || 0
      if (dayTarget > 0) {
        const dayWorked = state.getDayWorkedHours(now)
        const dayKey = `day-${formatDate(now, 'yyyy-MM-dd')}-adv-${advMin}`
        if (dayWorked >= dayTarget - advanceHours) {
          notifyOnce(
            dayKey,
            getTitle(advMin, 'Daily'),
            `Tracked ${formatHoursHHmm(dayWorked)} of ${dayTarget}h daily target (${describeOffset(advMin)}).`,
          )
        }
      }

      // Weekly notification
      const weekTarget = sum(config.workmask)
      if (weekTarget > 0) {
        const weekWorked = state.getWeekWorkedHours(now)
        const weekKey = `week-${formatDate(startOfISOWeek(now), 'yyyy-MM-dd')}-adv-${advMin}`
        if (weekWorked >= weekTarget - advanceHours) {
          notifyOnce(
            weekKey,
            getTitle(advMin, 'Weekly'),
            `Tracked ${formatHoursHHmm(weekWorked)} of ${weekTarget}h weekly target (${describeOffset(advMin)}).`,
          )
        }
      }
    }
  })

  currentWindowEvents.push(
    ['blur', () => (state.windowFocused = false)],
    [
      'focus',
      () => {
        state.windowFocused = true
        clearIconAlert()
      },
    ],
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
      clearInterval(teamsCallInterval)
      cleanupSetStateLinks()
      cleanupIconAutorun()
      cleanupTrayMenuAutorun()
      cleanupTrayTooltipAutorun()
      cleanupTargetNotificationAutorun()
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
