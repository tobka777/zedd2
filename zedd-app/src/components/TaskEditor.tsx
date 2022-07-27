import { Button, Grid, TextField, Tooltip, MenuItem, Menu, ButtonGroup } from '@mui/material'
import {
  Edit as EditIcon,
  GetApp as ImportIcon,
  SentimentSatisfiedAlt,
  ContentCopy as CopyIcon,
} from '@mui/icons-material'
import { format as formatDate, formatDistance } from 'date-fns'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback, useState, useRef } from 'react'
import { NikuUrlInvalidError } from 'zedd-clarity'

import { AppState, Task } from '../AppState'
import { ClarityState, ClarityActionType } from '../ClarityState'
import { ClarityTaskSelect } from './ClarityTaskSelect'
import { LoadingSpinner } from './LoadingSpinner'
import { TaskSelect } from './TaskSelect'

interface TaskEditorProps {
  state: AppState
  value: Task
  clarityState: ClarityState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  onTaskSelectChange: (t: Task) => void
  style?: React.CSSProperties
  taskSelectRef?: (r: HTMLInputElement) => void
}

export const TaskEditor = observer(
  ({
    state,
    clarityState,
    onTaskSelectChange,
    value,
    getTasksForSearchString,
    style,
    taskSelectRef,
  }: TaskEditorProps) => {
    const importClarityTasks = useCallback(
      (which: string) =>
        clarityState
          .importAndSaveClarityTasks(
            state.config.excludeProjects,
            'ALL' === which ? 'ALL' : 'NEW' === which ? 'NEW' : [which],
            (info) => state.addMessage(info, 'info', 2000),
          )
          .catch((e) => {
            clarityState.error = e.message
            state.addMessage(
              e.message +
                (e instanceof NikuUrlInvalidError
                  ? 'Check zeddConfig.nikuLink and reload config.'
                  : ''),
            )
          }),
      [clarityState, state],
    )

    const [popperOpen, setPopperOpen] = useState(false)
    const anchorRef = useRef(null)

    let guessClarityIntId: number | undefined = undefined
    if (value.clarityTaskIntId === undefined) {
      const keys = value.name.match(/[A-Z]+-\d+/g) ?? []
      const keyRegexes = keys.map((key) => new RegExp(key + '(?!\\d)'))
      guessClarityIntId = clarityState.tasks.find((ct) =>
        keyRegexes.some((regex) => ct.name.match(regex)),
      )?.intId
    }

    return (
      <Grid container style={{ ...style, alignItems: 'center' }} spacing={2}>
        <Grid item xs={10} lg={11}>
          <TaskSelect
            tasks={state.tasks}
            label={
              state.focused
                ? `Task for time slice ${formatDate(state.focused.start, 'do MMMM')} ${formatDate(
                    state.focused.start,
                    'HH:mm',
                  )} - ${formatDate(state.focused.end, 'HH:mm')}`
                : 'Currently timing'
            }
            inputRef={taskSelectRef}
            value={value}
            onChange={(_, t) => {
              onTaskSelectChange(state.getTaskForName(t))
            }}
            fullWidth
            style={{ flex: '1 1 auto', width: '100%' }}
            getTasksForSearchString={getTasksForSearchString}
            handleError={(error) => state.addMessage(error.message)}
            getHoursForTask={(t) => state.formatHours(state.getTaskHours(t))}
          />
        </Grid>
        <Grid item xs={2} lg={1}>
          <Button
            disabled={!value || value === state.getUndefinedTask()}
            onClick={(_) => (state.renamingTask = value)}
            style={{ width: '100%' }}
            endIcon={<EditIcon />}
          >
            Rename
          </Button>
        </Grid>
        <Grid item xs={8} lg={10}>
          <ClarityTaskSelect
            value={value.clarityTaskIntId}
            disabled={value === state.getUndefinedTask()}
            label={`Clarity-Account for Task ${value && value.name}`}
            fullWidth
            style={{ flex: '1 1 auto' }}
            onChange={(newIntId) => (value.clarityTaskIntId = newIntId)}
            clarityState={clarityState}
          />
        </Grid>
        <Grid item xs={2} lg={1}>
          <Button
            disabled={undefined === guessClarityIntId}
            onClick={(_) => (value.clarityTaskIntId = guessClarityIntId)}
            style={{ width: '100%' }}
            endIcon={<SentimentSatisfiedAlt />}
          >
            Guess
          </Button>
        </Grid>
        <Grid item xs={2} lg={1}>
          <Tooltip
            title={`imported ${clarityState.tasks.length} tasks ${
              clarityState.tasksLastUpdated
                ? formatDistance(clarityState.tasksLastUpdated, new Date())
                : 'never'
            } ago`}
          >
            <ButtonGroup variant='outlined'>
              <Button
                variant='text'
                onClick={() => !clarityState.currentlyImportingTasks && setPopperOpen(!popperOpen)}
                disabled={clarityState.currentlyImportingTasks}
                style={{ width: '100%' }}
                ref={anchorRef}
                endIcon={
                  <>
                    <ImportIcon />
                    {clarityState.actionType === ClarityActionType.ImportTasks && (
                      <LoadingSpinner
                        loading={clarityState.currentlyImportingTasks}
                        error={clarityState.error !== ''}
                        success={clarityState.success}
                      />
                    )}
                  </>
                }
              >
                Import
              </Button>
              <Button
                variant='text'
                disabled={!clarityState.currentlyImportingTasks}
                onClick={() => clarityState.sileniumKill()}
              >
                Abort
              </Button>
            </ButtonGroup>
          </Tooltip>
          <Menu
            open={popperOpen}
            anchorEl={anchorRef.current}
            style={{ zIndex: 1400 }}
            id='split-button-menu'
            onClose={() => setPopperOpen(false)}
          >
            <MenuItem
              onClick={() => {
                setPopperOpen(false)
                importClarityTasks('ALL')
              }}
            >
              ALL
            </MenuItem>
            <MenuItem
              onClick={() => {
                setPopperOpen(false)
                importClarityTasks('NEW')
              }}
            >
              NEW
            </MenuItem>
            {clarityState.projectNames.map((pn) => (
              <MenuItem
                key={pn}
                onClick={() => {
                  setPopperOpen(false)
                  importClarityTasks(pn)
                }}
              >
                {pn}
              </MenuItem>
            ))}
          </Menu>
        </Grid>

        <Grid item xs={10} lg={11}>
          <TextField
            value={value.clarityTaskComment}
            label='Clarity-Account Comment for This Task'
            disabled={value === state.getUndefinedTask()}
            onChange={(e) => (value.clarityTaskComment = e.target.value)}
            fullWidth
          />
        </Grid>
        <Grid item xs={2} lg={1}>
          <Tooltip title='Copy task name to task comment'>
            <Button
              disabled={!value || value === state.getUndefinedTask()}
              onClick={() => (value.clarityTaskComment = value.name)}
              fullWidth
              endIcon={<CopyIcon />}
            >
              Copy
            </Button>
          </Tooltip>
        </Grid>
      </Grid>
    )
  },
)
