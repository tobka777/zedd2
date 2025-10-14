import { Button, Grid, Menu, MenuItem, TextField, Tooltip } from '@mui/material'
import {
  ContentCopy as CopyIcon,
  Edit as EditIcon,
  GetApp as ImportIcon,
  SentimentSatisfiedAlt,
} from '@mui/icons-material'
import { format as formatDate, formatDistance } from 'date-fns'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { InvalidPlattformUrlException, PlatformType } from 'zedd-platform'
import { AppState, Task } from '../AppState'
import { PlatformActionType, PlatformState } from '../PlatformState'
import { PlatformTaskSelect } from './PlatformTaskSelect'
import { LoadingSpinner } from './LoadingSpinner'
import { TaskSelect } from './TaskSelect'
import { TaskActivitySelect } from './TaskActivitySelect'

interface TaskEditorProps {
  state: AppState
  value: Task
  platformState: PlatformState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  onTaskSelectChange: (t: Task) => void
  style?: React.CSSProperties
  taskSelectRef?: (r: HTMLInputElement) => void
}

export const TaskEditor = observer(
  ({
    state,
    platformState,
    onTaskSelectChange,
    value,
    getTasksForSearchString,
    style,
    taskSelectRef,
  }: TaskEditorProps) => {
    const importPlatformTasks = useCallback(
      async (which: string) => {
        const platformType = 'OTT' === which ? 'OTT' : 'REPLICON' === which ? 'REPLICON' : 'ALL'

        try {
          await platformState
            .importAndSavePlatformTasks(platformType, (info) =>
              state.addMessage(info, 'info', 2000),
            )
            .catch((e) => {
              platformState.error = e.message
              state.addMessage(
                e.message +
                  (e instanceof InvalidPlattformUrlException
                    ? 'Check zeddConfig.ottLink or zeddConfig.repliconLink and reload config.'
                    : ''),
                'error',
              )
            })
        } catch (e: any) {
          state.addMessage('Failed to fetch platform integrations: ' + e.message, 'error', 4000)
        }
      },
      [platformState, state],
    )

    const importRepliconTaskActivities = useCallback(async () => {
      try {
        await platformState
          .importRepliconTaskActivities(state.currentTask.platformTaskIntId, (info) =>
            state.addMessage(info, 'info', 2000),
          )
          .catch((e) => {
            platformState.error = e.message
            state.addMessage(
              e.message +
                (e instanceof InvalidPlattformUrlException
                  ? 'Check zeddConfig.ottLink or zeddConfig.repliconLink and reload config.'
                  : ''),
              'error',
            )
          })
      } catch (e: any) {
        state.addMessage('Failed to fetch platform integrations: ' + e.message, 'error', 4000)
      }
    }, [platformState, state])

    const [popperOpen, setPopperOpen] = useState(false)
    const anchorRef = useRef(null)

    let guessPlatformIntId: number | undefined = undefined
    if (value.platformTaskIntId === undefined) {
      const keys = value.name.match(/[A-Z]+-\d+/g) ?? []
      const keyRegexes = keys.map((key) => new RegExp(key + '(?!\\d)'))
      const task = platformState.tasks.find((ct) =>
        keyRegexes.some((regex) => ct.name.match(regex)),
      )
      guessPlatformIntId = task?.intId
    }

    if (platformState.actionType === PlatformActionType.ImportTasks) {
      setTimeout(() => {
        platformState.success = false
      }, 60000)
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
        <Grid item xs={6} lg={9}>
          <PlatformTaskSelect
            value={value.platformTaskIntId}
            disabled={value === state.getUndefinedTask()}
            label={`Account for Task ${value && value.name}`}
            fullWidth
            style={{ flex: '1 1 auto' }}
            onChange={(newIntId) => {
              if (newIntId !== undefined && newIntId !== null) {
                value.platformTaskIntId = newIntId
                const task = platformState.resolveTask(value?.platformTaskIntId)
                value.platformType = task?.typ
              } else {
                value.platformTaskIntId = ''
              }
              value.taskActivityName = value.taskActivityName || state.config.repliconActivity
            }}
            platformState={platformState}
          />
        </Grid>
        <Grid item xs={2} lg={1}>
          <Button
            disabled={undefined === guessPlatformIntId}
            onClick={(_) => {
              value.platformTaskIntId = guessPlatformIntId
            }}
            style={{ width: '100%' }}
            endIcon={<SentimentSatisfiedAlt />}
          >
            Guess
          </Button>
        </Grid>
        <Grid item xs={2} lg={1}>
          <Tooltip
            title={`imported ${platformState.tasks.length} tasks ${
              platformState.tasksLastUpdated
                ? formatDistance(platformState.tasksLastUpdated, new Date())
                : 'never'
            } ago`}
          >
            <Button
              variant='text'
              onClick={() => !platformState.currentlyImportingTasks && setPopperOpen(!popperOpen)}
              disabled={
                platformState.currentlyImportingTasks || platformState.currentlyExportingTasks
              }
              style={{ width: '100%' }}
              ref={anchorRef}
              endIcon={
                <>
                  {platformState.currentlyImportingTasks === false && <ImportIcon />}
                  {platformState.actionType === PlatformActionType.ImportTasks && (
                    <LoadingSpinner
                      loading={platformState.currentlyImportingTasks}
                      error={platformState.error !== ''}
                      success={platformState.success}
                    />
                  )}
                </>
              }
            >
              Import
            </Button>
          </Tooltip>
          <Menu
            open={popperOpen}
            anchorEl={anchorRef.current}
            style={{ zIndex: 1400 }}
            id='split-button-menu'
            onClose={() => setPopperOpen(false)}
          >
            {(['ALL', 'OTT', 'REPLICON'] as PlatformType[]).map((platform) => (
              <MenuItem
                key={platform}
                onClick={async () => {
                  setPopperOpen(false)
                  await importPlatformTasks(platform)
                }}
              >
                {platform}
              </MenuItem>
            ))}
          </Menu>
        </Grid>
        <Grid item xs={2} lg={1}>
          <Button
            variant='text'
            style={{ width: '100%' }}
            disabled={!platformState.currentlyImportingTasks}
            onClick={() => platformState.killPlatform()}
          >
            Cancel
          </Button>
        </Grid>

        {value.platformType === 'REPLICON' &&
          value.platformTaskIntId &&
          value.platformTaskIntId !== '' && (
            <>
              <Grid item xs={10} lg={11}>
                <TaskActivitySelect
                  value={value.taskActivityName}
                  platformTask={platformState.resolveTask(value.platformTaskIntId as number)}
                  disabled={value === state.getUndefinedTask()}
                  label={`Activity for Task ${value && value.name}`}
                  fullWidth
                  style={{ flex: '1 1 auto' }}
                  onChange={(taskActivity) => {
                    state.slices.find((slice) => {
                      if (slice.task.name === value.name) {
                        slice.task.taskActivityName = taskActivity?.name ?? ''
                      }
                    })
                  }}
                  platformState={platformState}
                />
              </Grid>
              <Grid item xs={2} lg={1}>
                <Button
                  style={{ width: '100%' }}
                  disabled={!value || value === state.getUndefinedTask()}
                  onClick={async () => await importRepliconTaskActivities()}
                  endIcon={<ImportIcon />}
                >
                  Import
                </Button>
              </Grid>
            </>
          )}
        <Grid item xs={10} lg={11}>
          <TextField
            value={value.platformTaskComment}
            label='Account Comment for This Task'
            disabled={value === state.getUndefinedTask()}
            onChange={(e) => (value.platformTaskComment = e.target.value)}
            fullWidth
          />
        </Grid>
        <Grid item xs={2} lg={1}>
          <Tooltip title='Copy task name to task comment'>
            <span>
              <Button
                disabled={!value || value === state.getUndefinedTask()}
                onClick={() => (value.platformTaskComment = value.name)}
                fullWidth
                endIcon={<CopyIcon />}
              >
                Copy
              </Button>
            </span>
          </Tooltip>
        </Grid>
      </Grid>
    )
  },
)
