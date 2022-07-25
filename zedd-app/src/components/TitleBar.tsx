import { AppBar, Badge, Button, Menu as MuiMenu, MenuItem, Tooltip } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  Menu as MenuIcon,
  PlayArrow as PlayArrowIcon,
  Remove as ToHoverIcon,
  Stop as StopIcon,
} from '@mui/icons-material'
import { BrowserWindow, ipcRenderer } from 'electron'
import { getCurrentWindow, app, autoUpdater } from '@electron/remote'
import { observer, useLocalObservable } from 'mobx-react-lite'
import * as React from 'react'
import { useEffect, useState } from 'react'

import { AppState } from '../AppState'
import { formatHoursHHmm } from '../util'
import { ZeddSvgIcon } from './ZeddSvgIcon'

interface TitleBarProps {
  state: AppState
  menuItems: { label: string; click: () => void }[]
  showContextMenu: () => void
}
const toggleWindowMaximized = (bw: BrowserWindow) =>
  bw.isMaximized() ? bw.unmaximize() : bw.maximize()

export const TitleBar = observer(({ state, menuItems, showContextMenu }: TitleBarProps) => {
  const vertical = state.hoverMode && 'vertical' === state.config.keepHovering

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  const theme = useTheme()

  const local = useLocalObservable(() => ({
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
      style={{
        ['WebkitAppRegion' as any]: 'drag',
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        height: vertical ? '100%' : 37,
        width: vertical ? 43 : '100%',
        alignItems: 'center',
        backgroundColor: state.currentTask
          .getColor()
          .set('hsl.s', 0.9)
          .set('hsl.l', 'dark' === theme.palette.mode ? 0.2 : 0.8)
          .css(),
      }}
      position='static'
      onContextMenu={showContextMenu}
    >
      <div
        style={{
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
        <Button
          onClick={handleClick}
          style={{ color: 'inherit', ['WebkitAppRegion' as any]: 'no-drag' }}
        >
          <Badge variant='dot' color='secondary' invisible={!state.updateAvailable}>
            <MenuIcon />
          </Badge>
        </Button>
      )}
      <MuiMenu
        style={{
          ['WebkitAppRegion' as any]: 'no-drag',
        }}
        transitionDuration={0}
        id='simple-menu'
        anchorEl={anchorEl}
        keepMounted
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
        <MenuItem onClick={() => (state.whatsNewDialogOpen = true)}>
          {app.getVersion() + (global.isDev ? ' (dev)' : '')}
        </MenuItem>
        {state.updateAvailable && (
          <MenuItem
            onClick={() => {
              if (state.updateAvailable) {
                ipcRenderer.send('quit')
              } else {
                autoUpdater.checkForUpdates()
              }
              setAnchorEl(null)
            }}
          >
            {`Update ${app.getVersion()} → ${state.updateAvailable}`}
          </MenuItem>
        )}
      </MuiMenu>
      <Tooltip title={formatHoursHHmm(state.getDayWorkedHours(new Date()))}>
        <Button
          style={{
            ['WebkitAppRegion' as any]: 'no-drag',
            width: !vertical ? '64px' : '37px',
            height: vertical ? '64px' : '37px',
            color: 'inherit',
          }}
          onClick={() => state.toggleTimingInProgress()}
        >
          {state.timingInProgess ? <StopIcon /> : <PlayArrowIcon />}
        </Button>
      </Tooltip>
      {/* {state.lastAction} */}
      <div
        style={{
          fontSize: vertical ? 'initial' : 'large',
          margin: vertical ? theme.spacing(1, 0) : theme.spacing(0, 1),
          // writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
        }}
      >
        {state.formatHours(state.getTaskHours(state.currentTask))}
      </div>
      <div
        style={{
          fontSize: 'large',
          flexGrow: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
        }}
      >
        {state.currentTask.name}
      </div>
      {!state.hoverMode && state.config.keepHovering && (
        <Button
          onClick={() => getCurrentWindow().minimize()}
          style={{ color: 'inherit', borderRadius: 0, ['WebkitAppRegion' as any]: 'no-drag' }}
        >
          <ToHoverIcon />
        </Button>
      )}
      {state.hoverMode && (
        <Button
          onClick={() => (state.hoverMode = false)}
          style={{ color: 'inherit', borderRadius: 0, ['WebkitAppRegion' as any]: 'no-drag' }}
        >
          {local.maximized ? '🗖' : '🗗︎'}
          {/* <ExpandIcon /> */}
        </Button>
      )}
      {!state.hoverMode && (
        <Button
          onClick={() => toggleWindowMaximized(getCurrentWindow())}
          style={{ color: 'inherit', borderRadius: 0, ['WebkitAppRegion' as any]: 'no-drag' }}
        >
          {local.maximized ? '🗗︎' : '🗖'}
        </Button>
      )}
      {!state.hoverMode && state.config.keepHovering && (
        <Button
          onClick={() => getCurrentWindow().hide()}
          style={{ color: 'inherit', borderRadius: 0, ['WebkitAppRegion' as any]: 'no-drag' }}
        >
          🗙︎
        </Button>
      )}
    </AppBar>
  )
})
