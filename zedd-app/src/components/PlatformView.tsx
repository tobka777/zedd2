import {
  Box,
  Button,
  CardActions,
  Checkbox,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { FileUpload as ExportIcon } from '@mui/icons-material'
import {
  addDays,
  areIntervalsOverlapping,
  differenceInDays,
  differenceInMinutes,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  format as formatDate,
  lastDayOfISOWeek,
  lastDayOfMonth,
  lastDayOfYear,
  max as dateMax,
  min as dateMin,
} from 'date-fns'
import { groupBy, remove, sortBy, uniqBy } from 'lodash'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useRef, useState } from 'react'
import { PlatformExportFormat, PlatformType, Task } from 'zedd-platform'
import { useTheme } from '@mui/material/styles'

import { TimeSlice, validDate } from '../AppState'
import { PlatformActionType, PlatformState } from '../PlatformState'
import { LoadingSpinner } from './LoadingSpinner'

import { isoDayStr, omap, splitIntervalIntoCalendarDays, sum, useClasses } from '../util'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { WorkEntry } from 'zedd-platform/out/src/model/work-entry.model'

const roundToNearest = (x: number, toNearest: number) => Math.round(x / toNearest) * toNearest
const floorToNearest = (x: number, toNearest: number) => Math.floor(x / toNearest) * toNearest
const ceilToNearest = (x: number, toNearest: number) => Math.ceil(x / toNearest) * toNearest

const outputCommentHours = false

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

export interface PlatformViewProps {
  showing: Interval
  calculateTargetHours: (interval: Interval) => number
  slices: TimeSlice[]
  platformState: PlatformState
  submitTimesheets: boolean
  onChangeSubmitTimesheets: (x: boolean) => void
  errorHandler: (e: Error) => void
}

const styles = (theme: any) => ({
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
    '& tbody tr:hover, tfoot tr:hover': {
      backgroundColor: theme.palette.grey[500],
    },
  },
})

const formatHours = (h: number) =>
  h ? h.toLocaleString('de-DE', { minimumFractionDigits: 2 }) : '-'

const placeholderPlatformTask = {
  projectName: 'UNDEFINED',
  intId: -1,
  name: 'UNDEFINED',
  taskCode: 'UNDEFINED',
  typ: 'UNDEFINED',
}

function transform({ slices, showing, platformState }: PlatformViewProps): PlatformExportFormat {
  // add 1 to the end of showing, because we want the interval to go to the end of the
  // not just the begining
  const showInterval = { start: showing.start, end: addDays(showing.end, 1) }

  // in the first step, create a PlatformExportFormat with an entry for each
  // task/comment combination
  const dayMap: PlatformExportFormat = {}
  // init dayMap so that days without slices are also included
  for (const day of eachDayOfInterval(showing)) {
    dayMap[isoDayStr(day)] = []
  }
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
      (slice.task.platformTaskIntId && platformState.resolveTask(slice.task.platformTaskIntId)) ||
      placeholderPlatformTask
    // fix start/end of b, as part of the interval may be outside showInterval
    const bStartFixed = dateMax([slice.start, showInterval.start])
    const bEndFixed = dateMin([slice.end, showInterval.end])
    for (const daySlice of splitIntervalIntoCalendarDays({
      start: bStartFixed,
      end: bEndFixed,
    })) {
      const dayKey = isoDayStr(daySlice.start)
      const dayHourss = dayMap[dayKey]
      let dayHours = dayHourss.find(
        (d) =>
          d.taskIntId === slice.task.platformTaskIntId &&
          d.comment === slice.task.platformTaskComment,
      )
      if (!dayHours) {
        dayHours = {
          hours: 0,
          projectName: task.projectName,
          taskIntId: task.intId,
          taskName: task.name,
          platformType: task.typ,
          taskCode: task.taskCode,
          comment: slice.task.platformTaskComment,
          taskActivity: slice.task.taskActivityName,
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
    // After rounding, a WorkEntry might have 0 hours. Remove those:
    remove(dayHourss, (we) => we.hours === 0)
  }
  // group entries with same task (but different comment)
  for (const dayStr of Object.keys(dayMap)) {
    dayMap[dayStr] = Object.values(groupBy(dayMap[dayStr], (we) => we.taskIntId)).map(
      (workEntries) => ({
        hours: sum(workEntries.map((we) => we.hours)),
        projectName: workEntries[0].projectName,
        taskIntId: workEntries[0].taskIntId,
        taskName: workEntries[0].taskName,
        platformType: workEntries[0].platformType,
        taskCode: workEntries[0].taskCode,
        comment:
          workEntries
            .filter((we) => we.comment)
            .map((we) => (outputCommentHours ? formatHours(we.hours) + ': ' : '') + we.comment)
            .join(', ') || undefined,
        taskActivity: workEntries[0].taskActivity,
      }),
    )
  }
  return dayMap
}

const DiffHoursTooltip = ({
  targetHours,
  workedHours,
  children,
}: {
  targetHours: number
  workedHours: number
  children: React.ReactElement
}) => {
  const diff = workedHours - targetHours

  return (
    <Tooltip
      componentsProps={{
        tooltip: {
          sx: { backgroundColor: 'common.black', color: 'primary' },
        },
      }}
      title={
        <Typography>
          - {targetHours} (target) ={' '}
          <Box component='span' sx={{ color: diff < 0 ? 'error.dark' : 'success.light' }}>
            {diff >= 0 ? '+' : ''}
            {diff}
          </Box>
        </Typography>
      }
    >
      {children}
    </Tooltip>
  )
}

export const PlatformView = observer((props: PlatformViewProps) => {
  const {
    showing,
    submitTimesheets,
    onChangeSubmitTimesheets,
    errorHandler,
    platformState,
    calculateTargetHours,
  } = props
  const [platformViewFilterProject, setPlatformViewFilterProject] = useState('')
  const [popperOpen, setPopperOpen] = useState(false)
  const anchorRef = useRef(null)

  const noOfDays = differenceInDays(showing.end, showing.start)
  const groupBy = noOfDays > 366 ? 'year' : noOfDays > 64 ? 'month' : noOfDays > 21 ? 'week' : 'day'
  const untrimmedIntervals =
    'year' === groupBy
      ? eachYearOfInterval(showing).map((start) => ({
          start: start,
          end: lastDayOfYear(start),
        }))
      : 'month' === groupBy
      ? eachMonthOfInterval(showing).map((start) => ({
          start: start,
          end: lastDayOfMonth(start),
        }))
      : 'week' === groupBy
      ? eachWeekOfInterval(showing, { weekStartsOn: 1 }).map((start) => ({
          start: start,
          end: lastDayOfISOWeek(start),
        }))
      : eachDayOfInterval(showing).map((start) => ({
          start: start,
          end: start,
        }))
  const intervals = untrimmedIntervals.map((i) => ({
    start: dateMax([i.start, showing.start]),
    end: dateMin([i.end, showing.end]),
  }))
  const headerFormat: string =
    'year' === groupBy
      ? 'y'
      : 'month' === groupBy
      ? 'LLL y'
      : 'week' === groupBy
      ? "'Wk' RRRR / I"
      : 'EEEEEE, dd.MM'
  const platformExport = transform(props)
  const allWorkEntries = Object.values(platformExport).flatMap((x) => x)
  const tasksToShow = sortBy(
    uniqBy(allWorkEntries, (we) => we.taskIntId),
    (x) => +(-1 === x.taskIntId), // placeholder task last
    (x) => x.projectName,
    (x) => x.taskName,
  ).filter((taskToShow) => {
    return (
      taskToShow.projectName.toLowerCase().includes(platformViewFilterProject.toLowerCase()) ||
      taskToShow.taskName.toLowerCase().includes(platformViewFilterProject.toLowerCase())
    )
  })

  const theme = useTheme()
  const classes = useClasses(styles)

  const showingTotal = sum(tasksToShow.map((we) => we.hours))
  /*const showingTotal = sum(
    Object.values(platformExport)
      .flat()
      .map((we) => we.hours),
  )*/

  console.log("tasksToShow", tasksToShow)

  /*const projectTasksView = new Map<string, {data?: Task, tasks: WorkEntry[]}>();
  for(let task of tasksToShow.filter(t => t.platformType === 'OTT')) {
    const projectKey = task.projectName + '|' + task.taskCode;
    if (!projectTasksView.has(projectKey)) {
      let projectData = platformState.tasks.find(project => project.typ === 'REPLICON' && project.projectName === task.projectName && project.taskCode && task.taskCode);
      projectTasksView.set(projectKey, {data: projectData, tasks: []})
    }
    let projectTask = projectTasksView.get(projectKey)
    projectTask?.tasks.push(task);
    //projectTasksView.set(projectKey)
  }*/

  //const projectTasksView = new Map<string, PlatformExportFormat>();

  let projectTasksViewItems: PlatformExportFormat = {};

  //console.log("HAS", projectTasksView.entries())

  console.log("HASLOS", intervals)


  for(let w of intervals) {
    const workEntries = eachDayOfInterval(w)
      .flatMap((d) => platformExport[isoDayStr(d)] ?? [])
      ?.filter(t => t.platformType === 'OTT')

    for(let task of workEntries) {
      //const projectKey = task.projectName + '|' + task.taskCode;
      let projectData = platformState.tasks.find(project => project.typ === 'REPLICON' && project.projectName === task.projectName && project.taskCode && task.taskCode);
      if(projectData) {
        let groupTask: WorkEntry = {
          hours: 0,
          projectName: projectData.projectName,
          taskIntId: projectData.intId,
          taskName: projectData.name,
          platformType: projectData.typ,
          taskCode: projectData.taskCode,
          comment: "",
          taskActivity: "", // TODO default activity
        }
        let projectItems = projectTasksViewItems[isoDayStr(w.start)];
        let projectItem = projectItems?.find(item => item.projectName === projectData.projectName && item.taskCode === projectData.taskCode);
        if(projectItem) {
          projectItem.hours += task.hours;
        }
        else {
          groupTask.hours = task.hours;
          if(projectItems) {
            projectTasksViewItems[isoDayStr(w.start)].push(groupTask)
          }
          else {
            projectTasksViewItems[isoDayStr(w.start)] = [groupTask]
          }
        }
      }
/*
      if (!projectTasksView.has(projectKey)) {

        projectTasksView.set(projectKey, {[isoDayStr(w.start)]: })
      }
      let projectTask = projectTasksView.get(projectKey)
      projectTask?.tasks.push(task);*/
    }

     //console.log("workEntries",workEntries)
  }

  const projectTasksView = sortBy(
    uniqBy(Object.values(projectTasksViewItems).flatMap((x) => x), (we) => we.taskIntId),
    (x) => +(-1 === x.taskIntId), // placeholder task last
    (x) => x.projectName,
    (x) => x.taskName,
  )

  console.log("GAS", projectTasksView)
  console.log("GASsd", projectTasksViewItems)



  /*tasksToShow.filter(task => task.platformType === 'OTT').map(task => {
    let childTasks: WorkEntry[] = [];

    return {data: task, task: []}
  })*/

  //console.log(platformState.tasks.find(task => task.typ === 'REPLICON' && task.projectIntId == ))



  /*const projectCodeMap = new Map<string, Map<PlatformType, Set<string>>>()

  platformState.tasks.forEach((entry) => {
    const projectKey = String(entry.projectIntId)
    const platform = entry.typ
    const taskCode = entry.taskCode

    if (!projectCodeMap.has(projectKey)) {
      projectCodeMap.set(projectKey, new Map())
    }

    const platformMap = projectCodeMap.get(projectKey)!

    if (!platformMap.has(platform)) {
      platformMap.set(platform, new Set())
    }

    platformMap.get(platform)!.add(taskCode)
  })*/

  //tasksToShow

  const getWorkedHours = (interval: Interval) => {
    return sum(
      eachDayOfInterval(interval).map((d) =>
        sum(platformExport[isoDayStr(d)]?.map((we) => we.hours) ?? []),
      ),
    )
  }

  /*
  const platformTasksToShow = tasksToShow.reduce<
    Record<PlatformType | 'Alle Platformen', WorkEntry[]>
  >((acc, entry) => {
    const platform = entry.platformType as PlatformType
    const projectKey = String(entry.taskIntId)
    const taskCode = entry.taskCode

    const platformMap = projectCodeMap.get(projectKey)
    const platformsWithThisTask = new Set<PlatformType>()

    if (platformMap) {
      for (const [plat, taskSet] of platformMap.entries()) {
        if (taskSet.has(taskCode)) {
          platformsWithThisTask.add(plat)
        }
      }
    }

    const isMultiPlatform = platformsWithThisTask.size > 1
    const key: PlatformType | 'Alle Platformen' = isMultiPlatform ? 'Alle Platformen' : platform

    if (!acc[key]) {
      acc[key] = []
    }

    acc[key].push(entry)

    return acc
  }, {} as Record<PlatformType | 'Alle Platformen', WorkEntry[]>)
  */

  /*const platformTasksToShowPlatformExport: Record<
    PlatformType | 'Alle Platformen',
    Record<string, WorkEntry[]>
  > = {}

  for (const [platform, platformTasks] of Object.entries(platformTasksToShow) as [
    PlatformType | 'Alle Platformen',
    WorkEntry[],
  ][]) {
    const dayTasks: Record<string, WorkEntry[]> = {}

    for (const interval of intervals) {
      const days = eachDayOfInterval(interval)

      for (const day of days) {
        const isoDate = isoDayStr(day)

        const taskInGivenPeriod = platformExport?.[isoDate] ?? []

        dayTasks[isoDate] = taskInGivenPeriod.filter((task) =>
          platformTasks.some((t) => t.taskIntId === task.taskIntId),
        )
      }
    }

    platformTasksToShowPlatformExport[platform] = dayTasks
  }*/

  return (
    <TableContainer component={Table} style={{ width: '97%', color: theme.palette.text.primary }} className={classes.table}>
      <Table aria-label='collapsible table'>
        <TableHead>
          <TableRow>
            <TableCell colSpan={2}>
              <TextField
                placeholder='Project / Task'
                value={platformViewFilterProject}
                fullWidth
                onChange={(newFilter) => setPlatformViewFilterProject(newFilter.target.value)}
              />
            </TableCell>
            {intervals.map((w) => (
              <TableCell key={isoDayStr(w.start)} sx={{ fontWeight: 'bold' }} className='numberHeader'>
                {formatDate(w.start, headerFormat)}
              </TableCell>
            ))}
            <TableCell sx={{ fontWeight: 'bold' }} className='numberCell'>Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {/*Object.entries(projectTasksView).map(([projectIntId, tasksToShow]) => (
            <Row
              key={projectIntId}
              tasksToShow={tasksToShow}
              intervals={intervals}
            />
          ))*/}
          <TableRow>
            <TableCell colSpan={2} style={{textAlign: 'right'}}><b>Summe</b></TableCell>
            {intervals.map((w, i) => (
              <TableCell key={i} style={{ textDecoration: 'underline dotted' }} className='numberCell'>
                <DiffHoursTooltip
                  targetHours={calculateTargetHours(w)}
                  workedHours={getWorkedHours(w)}
                >
                  <b>{formatHours(getWorkedHours(w))}</b>
                </DiffHoursTooltip>
              </TableCell>
            ))}
            <TableCell style={{ textDecoration: 'underline dotted' }} className='numberCell'>
              <DiffHoursTooltip
                targetHours={calculateTargetHours(showing)}
                workedHours={showingTotal}
              >
                <b>{formatHours(showingTotal)}</b>
              </DiffHoursTooltip>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <CardActions style={{ flexDirection: 'row-reverse' }}>
        <Button
          disabled={!platformState.currentlyExportingTasks}
          onClick={async () => {
            await platformState.killPlatform()
          }}
        >
          Cancel
        </Button>
        <Tooltip title='Export tasks to selected platform'>
          <Button
            variant='contained'
            onClick={() => !platformState.currentlyImportingTasks && setPopperOpen(!popperOpen)}
            disabled={
              platformState.allRepliconTasksHaveActivity(platformExport) ||
              platformState.currentlyExportingTasks ||
              platformState.currentlyImportingTasks
            }
            ref={anchorRef}
            endIcon={
              <>
                {platformState.currentlyImportingTasks === false && <ExportIcon />}
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
            Export
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
                platformState
                  .export(
                    platform,
                    omap(platformExport, (workEntries) =>
                      workEntries.filter((entry) => -1 !== entry.taskIntId),
                    ),
                    submitTimesheets,
                  )
                  .catch(errorHandler)
              }}
            >
              {platform}
            </MenuItem>
          ))}
        </Menu>
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
    </TableContainer>
  )
})

/*
function Row({
  platformType,
  tasksToShow,
  intervals,
}: {
  key: string
  platformType: string
  tasksToShow: WorkEntry[]
  intervals: Interval[]
}) {
  const theme = useTheme()
  const [open, setOpen] = React.useState(true)
  const platformExport =
    platformTasksToShowPlatformExport[platformType as PlatformType | 'Alle Platformen']
  const getWorkedHours = (interval: Interval) => {
    return sum(
      eachDayOfInterval(interval).map((d) =>
        sum(
          platformExport[isoDayStr(d)]?.map((we) =>
            we.platformType === platformType || platformType === 'Alle Platformen' ? we.hours : 0,
          ) ?? [],
        ),
      ),
    )
  }

  const showingTotal = sum(
    Object.values(platformExport)
      .flat()
      .map((we) => we.hours),
  )
  const notAssignedTask = (platformType === 'UNDEFINED' ? { color: theme.palette.error.main } : {})

  return (
    <>
      <TableRow onClick={() => setOpen(!open)}>
        <TableCell>
          <IconButton aria-label='expand row' size='small'>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell style={notAssignedTask}>
          <b>{platformType}</b>
        </TableCell>
        {intervals.map((w, i) => (
          <TableCell
            key={i}
            style={{
              textAlign: 'right',
              ...notAssignedTask
            }}
          >
            {formatHours(getWorkedHours(w))}
          </TableCell>
        ))}
        <TableCell
          style={{
            textAlign: 'right',
            ...notAssignedTask
          }}
        >
          {formatHours(showingTotal)}
        </TableCell>
      </TableRow>

      {open && (
        <>
          {tasksToShow.map((taskToShow) => (
            <TableRow
              key={taskToShow.taskIntId}
              className='white'
            >
              {platformType === 'Alle Platformen' && (
                <TableCell>{taskToShow.platformType}</TableCell>
              )}
              {platformType !== 'Alle Platformen' && <TableCell />}
              <TableCell style={notAssignedTask}>
                {taskToShow.projectName} / {taskToShow.taskName} / {taskToShow.taskCode}
              </TableCell>
              {intervals.map((w) => {
                const workEntries = eachDayOfInterval(w)
                  .flatMap((d) => platformExport[isoDayStr(d)] ?? [])
                  .filter((we) => we.taskIntId === taskToShow.taskIntId)

                return (
                  <TableCell
                    key={taskToShow.taskIntId + '-' + isoDayStr(w.start)}
                    title={workEntries.map((we) => we.comment).join('\n')}
                    style={{
                      textAlign: 'right',
                      cursor: workEntries.some((we) => we.comment) ? 'help' : 'default',
                      ...notAssignedTask
                    }}
                    className='numberCell'
                  >
                    {workEntries.some((we) => we.comment) && (
                      <span
                        style={{
                          fontSize: 'xx-small',
                          ...notAssignedTask
                        }}
                      >
                        m/K{' '}
                      </span>
                    )}
                    {formatHours(sum(workEntries.map((we) => we.hours)))}
                  </TableCell>
                )
              })}
              <TableCell
                style={{
                  textAlign: 'right',
                  ...notAssignedTask
                }}
              >
                {formatHours(
                  sum(
                    Object.values(platformExport)
                      .flat()
                      .filter((we) => we.taskIntId === taskToShow.taskIntId)
                      .map((we) => we.hours),
                  ),
                )}
              </TableCell>
            </TableRow>
          ))}
        </>
      )}
    </>
  )
}*/
