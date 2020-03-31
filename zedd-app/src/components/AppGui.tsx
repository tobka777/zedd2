import { CssBaseline, Snackbar } from '@material-ui/core'
import { createMuiTheme, MuiThemeProvider, makeStyles } from '@material-ui/core/styles'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import { Alert } from '@material-ui/lab'
import { remote } from 'electron'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useMemo } from 'react'

import { ErrorBoundary } from './ErrorBoundary'
import { AppState, Task } from '../AppState'
import { ClarityState } from '../ClarityState'
import { ChangeSliceTaskDialog } from './ChangeSliceTaskDialog'
import { RenameTaskDialog } from './RenameTaskDialog'
import { SettingsDialog } from './SettingsDialog'
import { ZeddSettings } from '../ZeddSettings'
import { TitleBar } from './TitleBar'
import { AppBody } from './AppBody'

const { systemPreferences } = remote

export interface AppGuiProps {
  state: AppState
  clarityState: ClarityState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  menuItems: { label: string; click: () => void }[]
  checkCgJira: (cg: ZeddSettings['cgJira']) => Promise<any>
}

const useStyles = makeStyles({
  '@global #react-root': {
    // transform: 'rotate(20deg)',
    // overflow: 'scroll',
  },
})

export const AppGui = observer(
  ({ state, clarityState, getTasksForSearchString, checkCgJira, menuItems }: AppGuiProps) => {
    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)')

    const theme = useMemo(
      () =>
        createMuiTheme({
          spacing: 8,
          palette: {
            primary: { main: '#' + systemPreferences.getAccentColor().substr(0, 6) },
            // type: true ? 'dark' : 'light',
            type: prefersDarkMode ? 'dark' : 'light',
          },
        }),
      [prefersDarkMode],
    )

    const { config } = state
    const currentFocusedTask = state.focused?.task ?? state.currentTask

    useStyles()

    return (
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {!state.hoverMode && (
          <Snackbar
            open={state.errors.length !== 0}
            autoHideDuration={10000}
            onClose={() => state.errors.shift()}
          >
            <Alert onClose={() => state.errors.shift()} severity='error'>
              {state.errors.length && state.errors[0]}
            </Alert>
          </Snackbar>
        )}
        <TitleBar
          state={state}
          getTasksForSearchString={getTasksForSearchString}
          menuItems={menuItems}
        />
        {state.settingsDialogOpen && (
          <SettingsDialog
            done={() => {
              config.saveToFile()
              state.settingsDialogOpen = false
            }}
            checkCgJira={checkCgJira}
            settings={state.config}
            clarityState={clarityState}
          />
        )}
        {currentFocusedTask && state.renameTaskDialogOpen ? (
          <RenameTaskDialog
            task={currentFocusedTask}
            key={'dialog-rename-task-' + currentFocusedTask.name}
            done={(newName) => {
              state.renameTaskDialogOpen = false
              if (newName && currentFocusedTask) currentFocusedTask.name = newName
            }}
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
                state.changingSliceTask!.task = newTask
                state.changingSliceTask = undefined
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
          />
        </ErrorBoundary>
      </MuiThemeProvider>
    )
  },
)
