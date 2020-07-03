import {
  Button,
  Grid,
  Paper,
  TextField,
  Tooltip,
  MenuItem,
  MenuList,
  ClickAwayListener,
  Popper,
} from '@material-ui/core'
import { Edit as EditIcon, GetApp as ImportIcon, SentimentSatisfiedAlt } from '@material-ui/icons'
import { format as formatDate, formatDistance } from 'date-fns'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback, useState, useRef } from 'react'
import { NikuUrlInvalidError } from 'zedd-clarity'

import { AppState, Task } from '../AppState'
import { ClarityState } from '../ClarityState'
import { ClarityTaskSelect } from './ClarityTaskSelect'
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
    console.log('value', value)
    const importClarityTasks = useCallback(
      (which: string) =>
        clarityState
          .importAndSaveClarityTasks(
            state.config.excludeProjects,
            'ALL' === which ? 'ALL' : [which],
          )
          .catch((e) =>
            state.errors.push(
              e.message +
                (e instanceof NikuUrlInvalidError
                  ? 'Check zeddConfig.nikuLink and reload config.'
                  : ''),
            ),
          ),
      [clarityState, state],
    )

    const [popperOpen, setPopperOpen] = useState(false)
    const anchorRef = useRef(null)

    let guessClarityIntId: number | undefined = undefined
    if (value.clarityTaskIntId === undefined) {
      const keys = value.name.match(/[A-Z]+-\d+/g) ?? []
      guessClarityIntId = clarityState.tasks.find((ct) => keys.some((key) => ct.name.includes(key)))
        ?.intId
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
            onChange={(_, t) => onTaskSelectChange(state.getTaskForName(t))}
            fullWidth
            style={{ flex: '1 1 auto', width: '100%' }}
            getTasksForSearchString={getTasksForSearchString}
            handleError={(err) => state.errors.push(err.message)}
            getHoursForTask={(t) => state.formatHours(state.getTaskHours(t))}
          />
        </Grid>
        <Grid item xs={2} lg={1}>
          <Button
            disabled={!value || value === state.getUndefinedTask()}
            onClick={(_) => (state.renameTaskDialogOpen = true)}
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
            <Button
              variant='text'
              onClick={() => setPopperOpen(!popperOpen)}
              style={{ width: '100%' }}
              ref={anchorRef}
              endIcon={<ImportIcon />}
            >
              Import
            </Button>
          </Tooltip>
          <Popper
            open={popperOpen}
            anchorEl={anchorRef.current}
            role={undefined}
            transition
            style={{ zIndex: 1400 }}
          >
            <Paper>
              <ClickAwayListener onClickAway={() => setPopperOpen(false)}>
                <MenuList id='split-button-menu'>
                  <MenuItem
                    onClick={() => {
                      setPopperOpen(false)
                      importClarityTasks('ALL')
                    }}
                  >
                    ALL
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
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Popper>
        </Grid>

        <Grid item xs={10} lg={11}>
          <TextField
            value={value.clarityTaskComment}
            label='Clarity-Account Comment for This Task'
            disabled={value === state.getUndefinedTask()}
            onChange={(e) => (value.clarityTaskComment = e.target.value)}
            fullWidth={true}
          />
        </Grid>
      </Grid>
    )
  },
)
