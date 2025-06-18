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
import {
  InvalidPlattformUrlException,
  PlatformIntegration,
  PlatformIntegrationFactory,
  PlatformType,
} from 'zedd-platform'
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

async function getPlatformIntegrations(
  platform: 'ALL' | PlatformType,
  platformState: PlatformState,
): Promise<PlatformIntegration> {
  return await new PlatformIntegrationFactory().create(
    platform,
    platformState.ottLink,
    platformState.repliconLink,
    {
      headless: platformState.chromeHeadless,
      executablePath: platformState.chromeExe,
    },
  )
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
          const platformIntegration = await getPlatformIntegrations(platformType, platformState)
          setSelectedPlatform(platformIntegration)

          await platformState
            .importAndSavePlatformTasks(platformIntegration, platformType, (info) =>
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

    const [popperOpen, setPopperOpen] = useState(false)
    const [selectedPlatform, setSelectedPlatform] = useState<PlatformIntegration>(null)
    const anchorRef = useRef(null)

    let guessIntId: number | undefined = undefined
    let guessTaskIntId: number | undefined = undefined
    let guessProjectIntId: number | undefined = undefined
    if (value.intId === undefined) {
      const keys = value.name.match(/[A-Z]+-\d+/g) ?? []
      const keyRegexes = keys.map((key) => new RegExp(key + '(?!\\d)'))
      const task = platformState.tasks.find((ct) =>
        keyRegexes.some((regex) => ct.name.match(regex)),
      )
      guessIntId = task?.intId
      guessProjectIntId = task?.projectIntId
      guessTaskIntId = task?.taskIntId
    }

    if (platformState.actionType === PlatformActionType.ImportTasks) {
      setTimeout(() => {
        platformState.success = false
      }, 60000)
    }

    function isAccountTaskChosen() {
      return value.platformType === 'REPLICON' && value.intId && value.intId !== ''
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
            value={value.intId}
            disabled={value === state.getUndefinedTask()}
            label={`Account for Task ${value && value.name}`}
            fullWidth
            style={{ flex: '1 1 auto' }}
            onChange={(newIntId) => {
              if (newIntId !== undefined && newIntId !== null) {
                value.intId = newIntId
                const task = platformState.resolveTask(value?.intId)
                value.platformType = task?.typ
              } else {
                value.intId = ''
                value.taskActivityUri = ''
                value.taskActivityName = ''
              }
            }}
            platformState={platformState}
          />
        </Grid>
        <Grid item xs={2} lg={1}>
          <Button
            disabled={undefined === guessIntId}
            onClick={(_) => {
              value.intId = guessIntId
              value.taskIntId = guessTaskIntId
              value.projectIntId = guessProjectIntId
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
            onClick={async () => {
              await platformState.killPlatform()
            }}
          >
            Cancel
          </Button>
        </Grid>

        {isAccountTaskChosen() && (
          <Grid item xs={10} lg={11}>
            <TaskActivitySelect
              value={value.taskActivityUri}
              disabled={value === state.getUndefinedTask()}
              label={`Activity for Task ${value && value.name}`}
              fullWidth
              style={{ flex: '1 1 auto' }}
              onChange={(taskActivity) => {
                state.slices.forEach((slice) => {
                  if (slice.task.name === value.name) {
                    slice.task.taskActivityUri = taskActivity?.uri ?? ''
                    slice.task.taskActivityName = taskActivity?.name ?? ''
                  }
                })
              }}
              platformState={platformState}
            />
          </Grid>
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
            <Button
              disabled={!value || value === state.getUndefinedTask()}
              onClick={() => (value.platformTaskComment = value.name)}
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
