import { Button, ButtonGroup, Paper, Tooltip } from '@material-ui/core'
import { makeStyles, useTheme } from '@material-ui/core/styles'
import Popover from '@material-ui/core/Popover'
import { DateRange } from 'react-date-range'
import {
  addMinutes,
  addMonths,
  addWeeks,
  max as dateMax,
  min as dateMin,
  startOfDay,
  differenceInDays,
  isMonday,
  addDays,
  startOfMonth,
  isSameDay,
  endOfMonth,
  isEqual,
  format as formatDate,
} from 'date-fns'
import { remote, MenuItemConstructorOptions } from 'electron'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback, useState } from 'react'

import { ErrorBoundary } from './ErrorBoundary'
import { AppState, Task, TimeSlice } from '../AppState'
import { ClarityState } from '../ClarityState'
import { businessWeekInterval, isoWeekInterval, monthInterval, omap, startOfNextDay } from '../util'
import { BlockDisplay } from './BlockDisplay'
import { Calendar } from './Calendar'
import { ClarityView } from './ClarityView'
import { TaskEditor } from './TaskEditor'
import { ArrowBack, ArrowForward, Delete as DeleteIcon } from '@material-ui/icons'
import { suggestedTaskMenuItems } from '../menuUtil'

import 'react-date-range/dist/styles.css' // main style file
import 'react-date-range/dist/theme/default.css' // theme css file

const { Menu, shell } = remote

const useStyles = makeStyles((theme) => ({
  contentRoot: {
    overflowY: 'scroll',
    '& > *': { margin: theme.spacing(2) },
  },
  controlBar: {
    margin: theme.spacing(-1),
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    '& > *': { margin: theme.spacing(1), flexGrow: 1 },
    '& .MuiButtonGroup-root > *': { flexGrow: 1 },
    '& input[type="date"]::-webkit-clear-button': { display: 'none' },
  },
}))

export const DateRangePicker = ({ value, onChange }: { value: Interval; onChange: Function }) => {
  const [anchorEl, setAnchorEl] = useState(null)

  const handleClick = (event: any) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const open = Boolean(anchorEl)
  const id = open ? 'simple-popover' : undefined

  return (
    <div>
      <div aria-describedby={id} onClick={handleClick}>
        <div
          className='MuiFormControl-root MuiTextField-root'
          style={{ width: '100%', minWidth: '20rem' }}
        >
          <label
            className='MuiFormLabel-root MuiInputLabel-root MuiInputLabel-formControl MuiInputLabel-animated MuiInputLabel-shrink MuiFormLabel-filled'
            data-shrink='true'
          >
            Start 🡢 End
          </label>
          <div className='MuiInputBase-root MuiInput-root MuiInput-underline MuiInputBase-formControl MuiInput-formControl'>
            <input
              aria-invalid='false'
              readOnly
              type='text'
              className='MuiInputBase-input MuiInput-input'
              value={
                formatDate(value.start as Date, 'E, do MMMM') +
                ' 🡢 ' +
                formatDate(value.end as Date, 'E, do MMMM')
              }
            />
          </div>
        </div>
      </div>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <DateRange
          months={2}
          editableDateInputs={true}
          onChange={(item: any) => onChange(item)}
          moveRangeOnFirstSelection={true}
          ranges={[
            {
              startDate: value.start as Date,
              endDate: value.end as Date,
              key: 'selection',
            },
          ]}
        />
      </Popover>
    </div>
  )
}

export interface AppBodyProps {
  state: AppState
  clarityState: ClarityState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  getLinksFromString: (s: string) => [string, string][]
  display: boolean
  taskSelectRef?: (r: HTMLInputElement) => void
}

export const AppBody = observer(
  ({
    state,
    clarityState,
    getTasksForSearchString,
    display,
    taskSelectRef,
    getLinksFromString,
  }: AppBodyProps) => {
    const classes = useStyles()

    const theme = useTheme()

    const onBlockClick = useCallback(
      (_: React.MouseEvent, slice: TimeSlice) => {
        Menu.buildFromTemplate([
          ...suggestedTaskMenuItems(state, clarityState, slice.task, (task) => (slice.task = task)),
          {
            type: 'normal',
            label: 'Other...',
            click: (_) => (state.changingSliceTask = slice),
          },

          { type: 'separator' },

          ...getLinksFromString(slice.task.name).map(
            ([key, link]): MenuItemConstructorOptions => ({
              type: 'normal',
              label: 'Open in Browser: ' + key,
              click: () => shell.openExternal(link),
            }),
          ),

          { type: 'separator' },

          {
            type: 'normal',
            label: 'Start Timing This',
            click: () => (state.currentTask = slice.task),
          },
          { type: 'normal', label: 'Delete', click: (_) => state.removeSlice(slice) },
          {
            type: 'normal',
            label: 'Eat Previous Slice',
            click: (_) => {
              const previousSlice = state.getPreviousSlice(slice)
              if (!previousSlice || !isSameDay(previousSlice.start, slice.start)) return
              state.removeSlice(previousSlice)
              slice.start = previousSlice.start
            },
          },
          {
            type: 'normal',
            label: 'Eat Next Slice',
            click: (_) => {
              const nextSlice = state.getNextSlice(slice)
              if (!nextSlice || !isSameDay(nextSlice.start, slice.start)) return
              state.removeSlice(nextSlice)
              slice.end = nextSlice.end
            },
          },
        ]).popup()
      },
      [clarityState, state],
    )

    const arrowClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        const dir = +e.currentTarget.dataset.dir!
        const { start, end } = state.showing
        const diff = differenceInDays(end, start)
        console.log(isMonday(start), diff)
        if (isMonday(start) && 4 === diff) {
          // showing mo-fri
          state.showing = omap(state.showing, (d) => addWeeks(d, dir))
        } else if (isSameDay(start, startOfMonth(start)) && isSameDay(end, endOfMonth(start))) {
          state.showing = omap(state.showing, (d) => addMonths(d, dir))
        } else {
          state.showing = omap(state.showing, (d) => addDays(d, dir * (diff + 1)))
        }
      },
      [state],
    )

    return (
      <div className={classes.contentRoot} style={{ display: display ? 'block' : 'none' }}>
        <div>
          <TaskEditor
            state={state}
            clarityState={clarityState}
            onTaskSelectChange={(t) => (state.currentTask = t)}
            value={state.currentTask}
            getTasksForSearchString={getTasksForSearchString}
            taskSelectRef={taskSelectRef}
          />
        </div>
        <div>
          <div className={classes.controlBar}>
            <DateRangePicker
              value={state.showing}
              onChange={(newValue: any) =>
                (state.showing = {
                  start: newValue.selection.startDate,
                  end: newValue.selection.endDate,
                })
              }
            />
            <ButtonGroup variant='contained'>
              <Button size='large' onClick={arrowClick} data-dir='-1'>
                <ArrowBack />
              </Button>
              <Button size='large' onClick={arrowClick} data-dir='+1'>
                <ArrowForward />
              </Button>
            </ButtonGroup>
            <ButtonGroup variant='contained'>
              <Button
                size='large'
                onClick={(_) => (state.showing = businessWeekInterval(addWeeks(new Date(), -1)))}
              >
                Last
              </Button>
              <Button
                size='large'
                onClick={(_) => (state.showing = businessWeekInterval(new Date()))}
              >
                This Week
              </Button>
              <Button
                size='large'
                onClick={(_) => (state.showing = businessWeekInterval(addWeeks(new Date(), 1)))}
              >
                Next
              </Button>
              <Button
                size='large'
                onClick={(_) => (state.showing = isoWeekInterval(state.showing.start))}
              >
                7
              </Button>
            </ButtonGroup>
            <Button
              size='large'
              variant='contained'
              onClick={(_) => (state.showing = monthInterval(addMonths(new Date(), 1)))}
            >
              Next Month
            </Button>
            <ButtonGroup variant='contained'>
              <Tooltip title='Fill currently shown empty days with ERSATZ task.' arrow>
                <Button size='large' onClick={(_) => state.fillErsatz(state.showing)}>
                  Ersatz
                </Button>
              </Tooltip>
              <Tooltip title='Delete all currently shown ERSATZ slices.' arrow>
                <Button size='large' onClick={(_) => state.clearErsatz(state.showing)}>
                  <DeleteIcon />
                </Button>
              </Tooltip>
            </ButtonGroup>
            {state.links.map(([k, link]) => (
              <Button
                size='large'
                variant='contained'
                onClick={() => shell.openExternal(link)}
                key={k}
              >
                {k}
              </Button>
            ))}
          </div>
        </div>
        {differenceInDays(state.showing.end, state.showing.start) > 31 ? (
          <div style={{ textAlign: 'center', color: theme.palette.text.disabled }}>
            The calendar is not shown for intervals larger than 31 days.
          </div>
        ) : (
          <Paper>
            <Calendar
              showing={state.showing}
              slices={state.showingSlices}
              startHour={state.config.startHour}
              onSliceEndChange={(slice, newEnd) => {
                newEnd = dateMax([newEnd, addMinutes(slice.start, 1)])
                newEnd = dateMin([newEnd, startOfNextDay(slice.start)])
                const nextSlice = state.getNextSlice(slice)
                if (nextSlice) newEnd = dateMin([newEnd, nextSlice.start])
                slice.end = newEnd
              }}
              onSliceStartChange={(slice, newStart) => {
                const ns2 = newStart
                newStart = dateMin([newStart, addMinutes(slice.end, -1)])
                newStart = dateMax([newStart, startOfDay(slice.start)])
                const prevSlice = state.getPreviousSlice(slice)
                if (prevSlice) newStart = dateMax([newStart, prevSlice.end])
                slice.start = newStart
                if (!isEqual(ns2, newStart)) console.warn('...')
              }}
              onSliceAdd={(s) => state.addSlice(s)}
              splitBlock={(slice, splitAt) => {
                if (slice.start < splitAt && splitAt < slice.end) {
                  const newSlice = new TimeSlice(slice.start, slice.end, slice.task)
                  slice.end = splitAt
                  newSlice.start = splitAt
                  state.addSlice(newSlice)
                }
              }}
              getVirtualSlice={(start, end) => new TimeSlice(start, end, state.getUndefinedTask())}
              deleteSlice={(b) => state.removeSlice(b)}
              renderSlice={(attributes) => {
                return (
                  <BlockDisplay
                    {...attributes}
                    clarityState={clarityState}
                    onContextMenu={onBlockClick}
                  />
                )
              }}
            />
          </Paper>
        )}
        <ErrorBoundary>
          <ClarityView
            showing={state.showing}
            slices={state.showingSlices}
            clarityState={clarityState}
            submitTimesheets={state.submitTimesheets}
            onChangeSubmitTimesheets={(x) => (state.submitTimesheets = x)}
            errorHandler={(error) => state.addMessage(error.message)}
            showingTargetHours={state.calcTargetHours(state.showing)}
          />
        </ErrorBoundary>
      </div>
    )
  },
)
