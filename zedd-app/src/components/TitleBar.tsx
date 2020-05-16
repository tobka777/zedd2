import { Button, AppBar, Menu as MuiMenu, MenuItem, Badge } from '@material-ui/core'
import { makeStyles, useTheme } from '@material-ui/core/styles'
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Menu as MenuIcon,
  Remove as ToHoverIcon,
} from '@material-ui/icons'
import { remote, BrowserWindow, ipcRenderer } from 'electron'
import { observer, useLocalStore } from 'mobx-react-lite'
import * as React from 'react'
import { useEffect, useState } from 'react'

import { AppState, Task } from '../AppState'
import { TaskSelect } from './TaskSelect'
import { ZeddSvgIcon } from './ZeddSvgIcon'

const { getCurrentWindow, app, autoUpdater } = remote

interface TitleBarProps {
  state: AppState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  menuItems: { label: string; click: () => void }[]
}

const toggleWindowMaximized = (bw: BrowserWindow) =>
  bw.isMaximized() ? bw.unmaximize() : bw.maximize()

export const TitleBar = observer(({ state, getTasksForSearchString, menuItems }: TitleBarProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  const theme = useTheme()

  const local = useLocalStore(() => ({
    maximized: getCurrentWindow().isMaximized(),
  }))

  useEffect(() => {
    const onMaximize = () => (local.maximized = true)
    const onUnmaximize = () => !state.hoverMode && (local.maximized = false)
    getCurrentWindow().on('maximize', onMaximize)
    getCurrentWindow().on('unmaximize', onUnmaximize)
    return () => {
      getCurrentWindow().removeListener('maximize', onMaximize)
      getCurrentWindow().removeListener('unmaximize', onUnmaximize)
    }
  })

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  return (
    <AppBar
      // 37px seems to be the min. window height
      style={{ display: 'flex', flexDirection: 'row', height: 37, alignItems: 'center' }}
      position='static'
    >
      <div
        style={{
          ['WebkitAppRegion' as any]: 'drag',
          margin: 8,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          cursor: 'move',
        }}
      >
        <ZeddSvgIcon
          progress={((state.getDayProgress(new Date()) * 12) | 0) / 12}
          res={24}
          stopped={!state.timingInProgess}
        />
      </div>
      {!state.hoverMode && (
        <Button onClick={handleClick} style={{ color: 'inherit' }}>
          <Badge variant='dot' color='secondary' invisible={!state.updateAvailable}>
            <MenuIcon />
          </Badge>
        </Button>
      )}
      <MuiMenu
        transitionDuration={0}
        id='simple-menu'
        anchorEl={anchorEl}
        keepMounted
        getContentAnchorEl={null}
        open={!!anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {menuItems.map(({ label, click }) => (
          <MenuItem
            key={label}
            onClick={() => {
              click()
              setAnchorEl(null)
            }}
          >
            {label}
          </MenuItem>
        ))}
        <MenuItem
          // disabled={!state.updateAvailable}
          onClick={() => {
            if (state.updateAvailable) {
              ipcRenderer.send('user-will-quit')
              autoUpdater.quitAndInstall()
            } else {
              autoUpdater.checkForUpdates()
            }
            setAnchorEl(null)
          }}
        >
          {state.updateAvailable
            ? `Update ${app.getVersion()} → ${state.updateAvailable}`
            : app.getVersion()}
        </MenuItem>
      </MuiMenu>
      <Button
        style={{ width: '1em', color: 'inherit' }}
        onClick={() => state.toggleTimingInProgress()}
      >
        {state.timingInProgess ? <StopIcon /> : <PlayArrowIcon />}
      </Button>
      {/* {state.lastAction} */}
      <div style={{ fontSize: 'large', margin: theme.spacing(0, 1) }}>
        {state.formatHours(state.getTaskHours(state.currentTask))}
      </div>
      <TaskSelect
        tasks={state.tasks}
        value={state.currentTask}
        onChange={(_, t) => (state.currentTask = state.getTaskForName(t))}
        fullWidth
        style={{ flex: '1 1 auto', width: '100%', flexGrow: 1, margin: 4 }}
        getTasksForSearchString={getTasksForSearchString}
        // inputProps={{ classes: classes.input }}
        handleError={(err) => state.errors.push(err.message)}
        hoverMode={state.hoverMode}
        getHoursForTask={(t) => state.formatHours(state.getTaskHours(t))}
      />
      {state.hoverMode && (
        <Button
          onClick={() => (state.hoverMode = false)}
          style={{ color: 'inherit', borderRadius: 0 }}
        >
          {local.maximized ? '🗖' : '🗗︎'}
          {/* <ExpandIcon /> */}
        </Button>
      )}
      {!state.hoverMode && (
        <Button
          onClick={() => toggleWindowMaximized(getCurrentWindow())}
          style={{ color: 'inherit', borderRadius: 0 }}
        >
          {local.maximized ? '🗗︎' : '🗖'}
        </Button>
      )}
      {!state.hoverMode && !state.config.keepHovering && (
        <Button
          onClick={() => getCurrentWindow().close()}
          style={{ color: 'inherit', borderRadius: 0 }}
        >
          🗙︎
        </Button>
      )}
      {!state.hoverMode && state.config.keepHovering && (
        <Button
          onClick={() => (state.hoverMode = true)}
          style={{ color: 'inherit', borderRadius: 0 }}
        >
          <ToHoverIcon />
        </Button>
      )}
    </AppBar>
  )
})
