import { Button, ButtonGroup, Paper, Tooltip } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import makeStyles from '@mui/styles/makeStyles'
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
  subMinutes as sub,
  differenceInMinutes,
} from 'date-fns'
import { MenuItemConstructorOptions } from 'electron'
import { Menu, shell } from '@electron/remote'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback } from 'react'

import { ErrorBoundary } from './ErrorBoundary'
import { AppState, Task, TimeSlice } from '../AppState'
import { ClarityState } from '../ClarityState'
import {
  businessWeekInterval,
  isoWeekInterval,
  monthInterval,
  omap,
  startOfNextDay,
  yearInterval,
} from '../util'
import { BlockDisplay } from './BlockDisplay'
import { Calendar } from './Calendar'
import { ClarityView } from './ClarityView'
import { TaskEditor } from './TaskEditor'
import { ArrowBack, ArrowForward, Delete as DeleteIcon } from '@mui/icons-material'
import { suggestedTaskMenuItems } from '../menuUtil'
import { DateRangePicker } from './DateRangePicker'

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
              onChange={(newValue) => (state.showing = newValue)}
            />
            <ButtonGroup variant='outlined'>
              <Button size='large' onClick={arrowClick} data-dir='-1'>
                <ArrowBack />
              </Button>
              <Button size='large' onClick={arrowClick} data-dir='+1'>
                <ArrowForward />
              </Button>
            </ButtonGroup>
            <ButtonGroup variant='outlined'>
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
              variant='outlined'
              onClick={(_) => (state.showing = monthInterval(addMonths(new Date(), 1)))}
            >
              Next Month
            </Button>
            <Button
              size='large'
              variant='outlined'
              onClick={(_) => (state.showing = yearInterval(new Date()))}
            >
              Year
            </Button>
            <ButtonGroup variant='outlined'>
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
                variant='outlined'
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
              correctSlicePositionEnd={(currentSlice, newEnd) => {
                newEnd = dateMax([newEnd, addMinutes(currentSlice.start, 1)])
                newEnd = dateMin([newEnd, startOfNextDay(currentSlice.start)])
                const nextSlice = state.getNextSlice(currentSlice)
                if (nextSlice) {
                  if (nextSlice.start === currentSlice.end) {
                    newEnd = newEnd >= nextSlice.end ? addMinutes(nextSlice.end, -1) : newEnd
                  } else {
                    newEnd = newEnd > nextSlice.start ? nextSlice.start : newEnd
                  }
                }
                return { start: currentSlice.start!, end: newEnd! }
              }}
              correctSlicePositionStart={(currentSlice, newStart) => {
                newStart = dateMin([newStart, addMinutes(currentSlice.end, -1)])
                newStart = dateMax([newStart, startOfDay(currentSlice.start)])
                const prevSlice = state.getPreviousSlice(currentSlice)
                if (prevSlice)
                  if (currentSlice.start === prevSlice.end) {
                    newStart =
                      newStart <= prevSlice.start ? addMinutes(prevSlice.start, 1) : newStart
                  } else {
                    newStart = newStart < prevSlice.end ? prevSlice.end : newStart
                  }
                return { start: newStart!, end: currentSlice.end! }
              }}
              correctSlicePositionComplete={(currentSlice, newPosition) => {
                const prevSlice = state.getPreviousSlice(newPosition)
                const nextSlice = state.getNextSlice(newPosition)
                const maxSliceSize = differenceInMinutes(newPosition.end, newPosition.start)
                const startNextDay = startOfNextDay(newPosition.start)
                const startDay = startOfDay(newPosition.end)

                let distance = 0
                let { start, end } = newPosition

                if (
                  prevSlice &&
                  nextSlice &&
                  prevSlice !== currentSlice &&
                  nextSlice !== currentSlice
                ) {
                  distance = differenceInMinutes(nextSlice.start, prevSlice.end)
                } else {
                  distance = maxSliceSize
                }

                if (
                  distance < maxSliceSize ||
                  (prevSlice &&
                    differenceInMinutes(startNextDay, prevSlice.end) < maxSliceSize &&
                    prevSlice !== currentSlice) ||
                  (nextSlice &&
                    differenceInMinutes(nextSlice.start, startDay) < maxSliceSize &&
                    nextSlice !== currentSlice)
                ) {
                  return undefined
                }

                if (newPosition.end > startNextDay) {
                  start = sub(startNextDay, maxSliceSize)
                  end = startNextDay
                  return { start, end }
                }

                if (newPosition.start < startDay) {
                  start = startDay
                  end = addMinutes(startDay, maxSliceSize)
                  return { start, end }
                }

                if (prevSlice && prevSlice.end > newPosition.start && prevSlice !== currentSlice) {
                  const newEnd = addMinutes(prevSlice.end, maxSliceSize)
                  start = prevSlice.end
                  end = newEnd
                  return { start, end }
                }

                if (nextSlice && newPosition.end > nextSlice.start && nextSlice !== currentSlice) {
                  const newStart = sub(nextSlice.start, maxSliceSize)
                  start = newStart
                  end = nextSlice.start
                  return { start, end }
                }

                return { start, end }
              }}
              onSliceChange={(slice, newPos) => {
                slice.setInterval(newPos.start as Date, newPos.end as Date)
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
