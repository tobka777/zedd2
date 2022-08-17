import {
  CssBaseline,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
} from '@mui/material'
import { createTheme, ThemeProvider, StyledEngineProvider, Theme } from '@mui/material/styles'
import makeStyles from '@mui/styles/makeStyles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { autoUpdater } from '@electron/remote'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'

import { ErrorBoundary } from './ErrorBoundary'
import { AppState, Task } from '../AppState'
import { ClarityState } from '../ClarityState'
import { ChangeSliceTaskDialog } from './ChangeSliceTaskDialog'
import { RenameTaskDialog } from './RenameTaskDialog'
import { SettingsDialog } from './SettingsDialog'
import { ZeddSettings } from '../ZeddSettings'
import { TitleBar } from './TitleBar'
import { AppBody } from './AppBody'
import changelog from '../../../CHANGELOG.md'

export interface AppGuiProps {
  state: AppState
  clarityState: ClarityState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  menuItems: { label: string; click: () => void }[]
  checkCgJira: (cg: ZeddSettings['cgJira']) => Promise<any>
  checkChromePath: () => Promise<any>
  showContextMenu: () => void
  taskSelectRef?: (r: HTMLInputElement) => void
  getLinksFromString: (s: string) => [string, string][]
}

declare module '@mui/styles/DefaultTheme' {
  interface DefaultTheme extends Theme {}
}

const useStyles = makeStyles({
  '@global #react-root': {},
})

export const AppGui = observer(
  ({
    state,
    clarityState,
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

    useStyles()

    const message = !state.hoverMode && state.messages.length ? state.messages[0] : undefined

    useEffect(() => {
      const undoAndRedo = (e: KeyboardEvent) => {
        if ((e.ctrlKey && e.key === 'z') || (e.ctrlKey && e.key === 'Z' && e.shiftKey)) {
          state.undo()
        } else if (e.ctrlKey && e.key === 'y') {
          state.redo()
        }
      }
      window.addEventListener('keydown', undoAndRedo)
      return () => window.removeEventListener('keydown', undoAndRedo)
    }, [state])

    useEffect(() => {
      const clearMarking = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          state.clearMarking()
        }
      }
      window.addEventListener('keydown', clearMarking)
      return () => window.removeEventListener('keydown', clearMarking)
    }, [state])

    return (
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {message && (
            <Snackbar
              open={true}
              autoHideDuration={message.timeout}
              onClose={() => state.messages.shift()}
              key={message.id}
            >
              <Alert severity={message.severity}>{message.msg}</Alert>
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
              clarityState={clarityState}
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
                clarityState={clarityState}
                slice={state.changingSliceTask}
                getTasksForSearchString={getTasksForSearchString}
                done={(newTask) => {
                  if ('string' === typeof newTask) newTask = state.getTaskForName(newTask)
                  console.log('ChangeSLiceTaskDialog', 'state.changingSliceTask!.task = newTask')
                  const onMarkedSlice = state.markedSlices.findIndex(
                    (e) => e === state.changingSliceTask!,
                  )
                  if (onMarkedSlice !== -1) {
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
              clarityState={clarityState}
              getTasksForSearchString={getTasksForSearchString}
              display={!state.hoverMode}
              taskSelectRef={taskSelectRef}
              getLinksFromString={getLinksFromString}
              settings={state.config}
            />
          </ErrorBoundary>
        </ThemeProvider>
      </StyledEngineProvider>
    )
  },
)
