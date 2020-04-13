import { Button, ButtonGroup, TextField, PopoverPosition, Paper, Tooltip } from '@material-ui/core'
import { useTheme, makeStyles } from '@material-ui/core/styles'
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
} from 'date-fns'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback, useState } from 'react'

import { ErrorBoundary } from './ErrorBoundary'
import { AppState, Task, TimeSlice } from '../AppState'
import { ClarityState } from '../ClarityState'
import { businessWeekInterval, isoWeekInterval, monthInterval, omap, startOfNextDay } from '../util'
import { BlockDisplay } from './BlockDisplay'
import { Calendar, SliceDragStartHandler, SliceSplitHandler } from './Calendar'
import { ClarityView } from './ClarityView'
import { TaskEditor } from './TaskEditor'
import { sortBy } from 'lodash'
import { remote, MenuItemConstructorOptions } from 'electron'
import { ArrowBack, ArrowForward, Delete as DeleteIcon } from '@material-ui/icons'

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

export interface AppBodyProps {
  state: AppState
  clarityState: ClarityState
  getTasksForSearchString: (s: string) => Promise<Task[]>
  display: boolean
}

export const AppBody = observer(
  ({ state, clarityState, getTasksForSearchString, display }: AppBodyProps) => {
    const [anchorPosition, setAnchorPosition] = useState(undefined as undefined | PopoverPosition)

    const theme = useTheme()
    const classes = useStyles()

    // const onBlockClick = useCallback((e: React.MouseEvent, slice: TimeSlice) => {
    //   console.log('onContextMenu')
    //   if (2 === e.button)
    //     setAnchorPosition(
    //       ilog({
    //         top: e.clientY,
    //         left: e.clientX,
    //       }),
    //     )
    // }, [])

    const onMenuClose = useCallback(() => setAnchorPosition(undefined), [setAnchorPosition])
    const onBlockClick = useCallback(
      (_: React.MouseEvent, slice: TimeSlice) => {
        Menu.buildFromTemplate([
          ...sortBy(state.getSuggestedTasks(), (t) => t.name).map(
            (t): MenuItemConstructorOptions => ({
              type: 'checkbox',
              label: t.name,
              checked: slice.task === t,
              click: (x) => (slice.task = state.getTaskForName(x.label)),
            }),
          ),
          {
            type: 'normal',
            label: 'Other...',
            click: (_) => (state.changingSliceTask = slice),
          },

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
              if (!previousSlice) return
              state.removeSlice(previousSlice)
              slice.start = previousSlice.start
            },
          },
          {
            type: 'normal',
            label: 'Eat Next Slice',
            click: (_) => {
              const nextSlice = state.getNextSlice(slice)
              if (!nextSlice) return
              state.removeSlice(nextSlice)
              slice.end = nextSlice.end
            },
          },
        ]).popup()
      },
      [state],
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
        {/* <Menu
          anchorPosition={anchorPosition}
          open={!!anchorPosition}
          onClose={onMenuClose}
          disablePortal
          anchorReference='anchorPosition'
        >
          {sortBy(state.getSuggestedTasks(), t => t.name).map(
            t => (
              <MenuItem
                dense
                style={{
                  backgroundColor: t
                    .getColor()
                    .set('hsl.s', 0.9)
                    .set('hsl.l', 'dark' === theme.palette.type ? 0.2 : 0.8)
                    .css(),
                }}
                onClick={x => (slice.task = state.getTaskForName(x.label))}
              >
                {t.name}
              </MenuItem>
            ),
            //   type: 'checkbox',
            //   label: t.name,
            //   checked: slice.task === t,
            //   ,
            // }),
          )}
        </Menu> */}
        <div>
          <TaskEditor
            state={state}
            clarityState={clarityState}
            onTaskSelectChange={(t) => (state.currentTask = t)}
            value={state.currentTask}
            getTasksForSearchString={getTasksForSearchString}
          />
        </div>
        {/* <Button
            variant='contained'
            color={state.timingInProgess ? 'primary' : 'secondary'}
            onClick={() => (state.timingInProgess = !state.timingInProgess)}
            style={{ fontSize: '300%', lineHeight: '33.3%', minWidth: '2em' }}
          >
            {state.timingInProgess ? '■' : '▶️'}
          </Button> */}
        <div>
          <div className={classes.controlBar}>
            <TextField
              label='Start'
              type='date'
              value={state.startDate}
              onChange={(e) => (state.startDate = e.target.value)}
            />
            <TextField
              label='End'
              type='date'
              value={state.endDate}
              onChange={(e) => (state.endDate = e.target.value)}
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
              newStart = dateMin([newStart, addMinutes(slice.end, -1)])
              newStart = dateMax([newStart, startOfDay(slice.start)])
              const prevSlice = state.getPreviousSlice(slice)
              if (prevSlice) newStart = dateMax([newStart, prevSlice.end])
              slice.start = newStart
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
        <ErrorBoundary>
          <ClarityView
            showing={state.showing}
            slices={state.showingSlices}
            clarityState={clarityState}
            submitTimesheets={state.submitTimesheets}
            onChangeSubmitTimesheets={(x) => (state.submitTimesheets = x)}
            errorHandler={(e) => state.errors.push(e.message)}
          />
        </ErrorBoundary>
      </div>
    )
  },
)
