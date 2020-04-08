import { useTheme, makeStyles } from '@material-ui/core/styles'
import {
  addDays,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachDayOfInterval,
  format as formatDate,
  max as dateMax,
  min as dateMin,
} from 'date-fns'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { ClarityExportFormat } from 'zedd-clarity'
import {
  Button,
  Checkbox,
  FormControlLabel,
  Card,
  CardContent,
  CardActions,
} from '@material-ui/core'
import { Send as SendIcon } from '@material-ui/icons'
import { groupBy, uniqBy, sortBy } from 'lodash'

import { validDate, TimeSlice } from '../AppState'
import { ClarityState } from '../ClarityState'
import { ceil, splitIntervalIntoCalendarDays, sum, omap, isoDayStr } from '../util'

const roundToNearest = (x: number, toNearest: number) => Math.round(x / toNearest) * toNearest
const floorToNearest = (x: number, toNearest: number) => Math.floor(x / toNearest) * toNearest

/**
 * Rounds a bunch of (wrapped) values up or down so that the sum of the rounded values
 * is equal to the rounded sum of the unrounded values.
 */
export function smartRound<T>(arr: T[], f: (t: T) => number, toNearest: number): [number, T][] {
  let result: [number, T][] = arr.map((x) => [f(x), x])
  const targetValue = roundToNearest(sum(result.map(([x]) => x)), toNearest)
  const allFloored = sum(result.map(([x]) => floorToNearest(x, toNearest)))
  const roundUpCount = Math.round((targetValue - allFloored) / toNearest)
  result = sortBy(
    result,
    // sort those for which ceil(x) === x at end, as they have to effect on the calculation
    ([x]) => +(ceilToNearest(x, toNearest) === x),
    // sort those which are closest to their ceil value first
    ([x]) => ceilToNearest(x, toNearest) - x,
  )

  for (let i = 0; i < result.length; i++) {
    const roundedValue =
      i < roundUpCount
        ? ceilToNearest(result[i][0], toNearest)
        : floorToNearest(result[i][0], toNearest)
    result[i][0] = roundedValue
  }

  const smartRoundSum = sum(result.map(([x]) => x))
  if (roundToNearest(smartRoundSum, toNearest) !== targetValue) {
    throw new Error(`expected=${targetValue} actual=${smartRoundSum}`)
  }

  return result
}

export interface ClarityViewProps {
  showing: Interval
  slices: TimeSlice[]
  clarityState: ClarityState
  submitTimesheets: boolean
  onChangeSubmitTimesheets: (x: boolean) => void
  errorHandler: (e: Error) => void
}

const useStyles = makeStyles((theme) => ({
  table: {
    padding: 0,
    borderSpacing: 0,
    '& .textHeader': { textAlign: 'left' },
    '& .numberCell, .numberHeader': {
      textAlign: 'right',
    },
    '& th': { padding: theme.spacing(1, 2) },
    '& td': {
      borderTop: '1px solid',
      borderColor: theme.palette.divider,
      padding: theme.spacing(0.5, 2),
    },
  },
}))

const formatHours = (h: number) =>
  h ? h.toLocaleString('de-DE', { minimumFractionDigits: 2 }) : '-'

export const ceilToNearest = (x: number, nearest: number) => ceil(x / nearest) * nearest

const placeholderClarityTask = {
  projectName: 'UNDEFINED',
  intId: -1,
  name: 'UNDEFINED',
}

function transform({ slices, showing, clarityState }: ClarityViewProps): ClarityExportFormat {
  // add 1 to the end of showing, because we want the interval to go to the end of the
  // not just the begining
  const showInterval = { start: showing.start, end: addDays(showing.end, 1) }

  // in the first step, create a ClarityExportFormat with and entry for each
  // task/comment combination
  const dayMap: ClarityExportFormat = {}
  for (const slice of slices) {
    validDate(slice.start)
    validDate(slice.end)
    validDate(showing.start)
    validDate(showing.end)
    try {
      if (!areIntervalsOverlapping(slice, showInterval)) {
        continue
      }
    } catch (e) {
      console.error(slice, showInterval)
      throw e
    }
    const task =
      (slice.task.clarityTaskIntId && clarityState.resolveTask(+slice.task.clarityTaskIntId)) ||
      placeholderClarityTask
    // fix start/end of b, as part of the interval may be outside showInterval
    const bStartFixed = dateMax([slice.start, showInterval.start])
    const bEndFixed = dateMin([slice.end, showInterval.end])
    for (const daySlice of splitIntervalIntoCalendarDays({
      start: bStartFixed,
      end: bEndFixed,
    })) {
      const dayKey = isoDayStr(daySlice.start)
      const dayHourss = dayMap[dayKey] || (dayMap[dayKey] = [])
      let dayHours = dayHourss.find(
        (d) =>
          d.taskIntId === slice.task.clarityTaskIntId &&
          d.comment === slice.task.clarityTaskComment,
      )
      if (!dayHours) {
        dayHours = {
          hours: 0,
          projectName: task.projectName,
          taskIntId: task.intId,
          taskName: task.name,
          comment: slice.task.clarityTaskComment,
        }
        dayHourss.push(dayHours)
      }

      dayHours.hours += differenceInMinutes(daySlice.end, daySlice.start) / 60
    }
  }
  // round hours
  for (const dayHourss of Object.values(dayMap)) {
    const smartRounded = smartRound(
      // sort by task first so we have a stable result
      // if there are multiple tasks with the same time
      sortBy(dayHourss, 'projectName', 'taskName'),
      (x) => x.hours,
      0.25,
    )
    for (const [roundedHours, dayHours] of smartRounded) {
      dayHours.hours = roundedHours
    }
  }
  // group entries with same task (but different comment)
  for (const dayStr of Object.keys(dayMap)) {
    dayMap[dayStr] = Object.values(groupBy(dayMap[dayStr], (we) => we.taskIntId)).map(
      (workEntries) => ({
        hours: sum(workEntries.map((we) => we.hours)),
        projectName: workEntries[0].projectName,
        taskIntId: workEntries[0].taskIntId,
        taskName: workEntries[0].taskName,
        comment:
          workEntries
            .filter((we) => we.comment)
            .map((we) => formatHours(we.hours) + ': ' + we.comment)
            .join(', ') || undefined,
      }),
    )
  }
  return dayMap
}

export const ClarityView = observer((props: ClarityViewProps) => {
  const { showing, submitTimesheets, onChangeSubmitTimesheets, errorHandler, clarityState } = props
  const days = eachDayOfInterval(showing)
  const clarityExport = transform(props)
  const allWorkEntries = Object.values(clarityExport).flatMap((x) => x)
  const tasksToShow = sortBy(
    uniqBy(allWorkEntries, (we) => we.taskIntId),
    (x) => +(-1 === x.taskIntId), // placeholder task last
    (x) => x.projectName,
    (x) => x.taskName,
  )
  const theme = useTheme()
  const classes = useStyles(props)

  return (
    <Card>
      <CardContent
        component={'table'}
        style={{ width: '100%', color: theme.palette.text.primary }}
        className={classes.table}
      >
        <thead>
          <tr>
            <th className='textHeader'>Project / Task</th>
            {days.map((d) => (
              <th key={isoDayStr(d)} className='numberHeader'>
                {formatDate(d, 'EEEEEE, dd.MM')}
              </th>
            ))}
            <th className='numberCell'>Total</th>
          </tr>
        </thead>
        <tbody>
          {tasksToShow.map((taskToShow) => (
            <tr
              key={taskToShow.taskIntId}
              style={-1 !== taskToShow.taskIntId ? {} : { color: theme.palette.error.main }}
            >
              <td>
                <span style={{ whiteSpace: 'nowrap' }}>{taskToShow.projectName}</span>
                {' / '}
                <span style={{ whiteSpace: 'nowrap' }}>{taskToShow.taskName}</span>
              </td>
              {days.map((d) => {
                const workEntry = clarityExport[isoDayStr(d)]?.find(
                  (we) => we.taskIntId === taskToShow.taskIntId,
                )
                return (
                  <td
                    key={taskToShow.taskIntId + '-' + isoDayStr(d)}
                    title={workEntry?.comment}
                    style={{ cursor: workEntry?.comment ? 'help' : 'default' }}
                    className='numberCell'
                  >
                    {workEntry?.comment && <span style={{ fontSize: 'xx-small' }}>m/K </span>}
                    {formatHours(workEntry?.hours ?? 0)}
                  </td>
                )
              })}
              <td className='numberCell'>
                {formatHours(
                  sum(
                    allWorkEntries
                      .filter((we) => we.taskIntId === taskToShow.taskIntId)
                      .map((we) => we.hours),
                  ),
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            {days.map((d) => (
              <td key={'total-' + isoDayStr(d)} className='numberCell'>
                {formatHours(sum(clarityExport[isoDayStr(d)]?.map((we) => we.hours) ?? []))}
              </td>
            ))}
            <td className='numberCell'>{formatHours(sum(allWorkEntries.map((we) => we.hours)))}</td>
          </tr>
        </tfoot>
      </CardContent>
      <CardActions style={{ flexDirection: 'row-reverse' }}>
        <Button
          disabled={clarityState.currentlyImportingTasks}
          variant='contained'
          onClick={() => {
            clarityState
              .export(
                omap(clarityExport, (workEntries) =>
                  workEntries.filter((entry) => -1 !== entry.taskIntId),
                ),
                submitTimesheets,
              )
              .catch(errorHandler)
          }}
          endIcon={<SendIcon />}
        >
          Clarity!
        </Button>{' '}
        <FormControlLabel
          control={
            <Checkbox
              checked={submitTimesheets}
              onChange={(_, checked) => onChangeSubmitTimesheets(!!checked)}
            />
          }
          title='Autosubmit timesheets or just save them'
          label='Autosubmit'
        />
      </CardActions>
    </Card>
  )
})
