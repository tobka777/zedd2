import {
  Alert,
  Button,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
} from '@mui/material'
import {
  createTheme,
  StyledEngineProvider,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles'
import { ThemeProvider } from '@emotion/react'
import useMediaQuery from '@mui/material/useMediaQuery'
import { autoUpdater } from '@electron/remote'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'

import { ErrorBoundary } from './ErrorBoundary'
import { AppState, Task } from '../AppState'
import { PlatformState } from '../PlatformState'
import { ChangeSliceTaskDialog } from './ChangeSliceTaskDialog'
import { RenameTaskDialog } from './RenameTaskDialog'
import { SettingsDialog } from './SettingsDialog'
import { ZeddSettings } from '../ZeddSettings'
import { TitleBar } from './TitleBar'
import { AppBody } from './AppBody'
import changelog from '../../../CHANGELOG.md'
import { useClasses } from '../util'

export interface AppGuiProps {
  state: AppState
  platformState: PlatformState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  menuItems: { label: string; click: () => void }[]
  checkCgJira: (cg: ZeddSettings['cgJira']) => Promise<any>
  checkChromePath: () => Promise<any>
  showContextMenu: () => void
  taskSelectRef?: (r: HTMLInputElement) => void
  getLinksFromString: (s: string) => [string, string][]
}

const styles = {
  '@global #react-root': {},
}

export const AppGui = observer(
  ({
    state,
    platformState,
    getTasksForSearchString,
    checkCgJira,
    menuItems,
    checkChromePath,
    showContextMenu,
    taskSelectRef,
    getLinksFromString,
  }: AppGuiProps) => {
    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)')

    const theme = useMemo(
      () =>
        createTheme({
          components: {
            MuiTextField: {
              defaultProps: {
                variant: 'standard',
              },
            },
          },
          spacing: 8,
          palette: {
            mode: prefersDarkMode ? 'dark' : 'light',
          },
        }),
      [prefersDarkMode],
    )

    const { config } = state
    const currentFocusedTask = state.focused?.task ?? state.currentTask

    const classes = useClasses(styles)

    const message = !state.hoverMode && state.messages.length ? state.messages[0] : undefined

    useEffect(() => {
      const undoAndRedo = (e: KeyboardEvent) => {
        if (
          ((e.ctrlKey || e.metaKey) && e.key === 'z') ||
          ((e.ctrlKey || e.metaKey) && e.key === 'Z' && e.shiftKey)
        ) {
          state.undo()
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          state.redo()
        }
      }
      window.addEventListener('keydown', undoAndRedo)
      return () => window.removeEventListener('keydown', undoAndRedo)
    }, [state])

    useEffect(() => {
      const keyDown = (e: KeyboardEvent) => {
        // clearMarking
        if (e.key === 'Escape') {
          state.clearMarking()
        }
        // removeSlicesOnDelete
        if (e.key === 'Delete' && state.markedSlices.length !== 0) {
          state.removeSlices(state.markedSlices[0])
        }
      }
      window.addEventListener('keydown', keyDown)
      return () => window.removeEventListener('keydown', keyDown)
    }, [state])

    return (
      <StyledEngineProvider injectFirst>
        <MuiThemeProvider theme={theme}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {message && (
              <Snackbar open={true} onClose={() => state.messages.shift()} key={message.id}>
                <Alert severity={message.severity} onClose={() => state.messages.shift()}>
                  {message.msg}
                </Alert>
              </Snackbar>
            )}
            {state.whatsNewDialogOpen && !state.hoverMode && (
              <Dialog open={true} onClose={() => (state.whatsNewDialogOpen = false)}>
                <DialogTitle>What's New</DialogTitle>
                <DialogContent>
                  <ReactMarkdown children={changelog} />
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => autoUpdater.checkForUpdates()}>Check for updates</Button>
                  <Button onClick={() => (state.whatsNewDialogOpen = false)} color='primary'>
                    Got it!
                  </Button>
                </DialogActions>
              </Dialog>
            )}
            <TitleBar state={state} menuItems={menuItems} showContextMenu={showContextMenu} />
            {state.settingsDialogOpen && (
              <SettingsDialog
                done={() => {
                  config.saveToFile()
                  state.settingsDialogOpen = false
                }}
                checkCgJira={checkCgJira}
                checkChromePath={checkChromePath}
                settings={state.config}
                platformState={platformState}
              />
            )}
            {state.renamingTask ? (
              <RenameTaskDialog
                task={state.renamingTask}
                key={'dialog-rename-task-' + currentFocusedTask.name}
                state={state}
                onClose={() => (state.renamingTask = undefined)}
              />
            ) : (
              state.changingSliceTask && (
                <ChangeSliceTaskDialog
                  platformState={platformState}
                  slice={state.changingSliceTask}
                  getTasksForSearchString={getTasksForSearchString}
                  done={(newTask) => {
                    if ('string' === typeof newTask) newTask = state.getTaskForName(newTask)
                    console.log('ChangeSLiceTaskDialog', 'state.changingSliceTask!.task = newTask')
                    const sliceIndex = state.markedSlices.findIndex(
                      (e) => e === state.changingSliceTask!,
                    )
                    if (sliceIndex !== -1) {
                      state.markedSlices.forEach((e) => {
                        e.task = newTask as Task
                      })
                      state.changingSliceTask = undefined
                    } else {
                      state.changingSliceTask!.task = newTask
                      state.changingSliceTask = undefined
                    }
                    state.clearMarking()
                  }}
                  state={state}
                />
              )
            )}
            <ErrorBoundary>
              <AppBody
                state={state}
                platformState={platformState}
                getTasksForSearchString={getTasksForSearchString}
                display={!state.hoverMode}
                taskSelectRef={taskSelectRef}
                getLinksFromString={getLinksFromString}
                settings={state.config}
              />
            </ErrorBoundary>
          </ThemeProvider>
        </MuiThemeProvider>
      </StyledEngineProvider>
    )
  },
)
