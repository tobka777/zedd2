import {
  Box,
  Button,
  CardActions,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
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

import {
  isoDayStr,
  omap,
  splitIntervalIntoCalendarDays,
  sum,
  useClasses,
  hashStringToInt,
} from '../util'
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

const generateId = (intId: number, taskActivityName?: string): string =>
  String(intId + (taskActivityName ? '_' + taskActivityName : ''))

const placeholderPlatformTask = (name: string): Task => ({
  projectName: 'UNDEFINED',
  projectIntId: -1,
  intId: hashStringToInt(name),
  name: name || 'UNDEFINED',
  taskCode: 'UNDEFINED',
  typ: 'UNDEFINED',
})

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
      placeholderPlatformTask(slice.task.name)
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
          d.taskActivity === slice.task.taskActivityName &&
          d.comment === slice.task.platformTaskComment,
      )
      if (!dayHours) {
        dayHours = {
          hours: 0,
          id: generateId(task.intId, slice.task.taskActivityName),
          projectName: task.projectName,
          projectIntId: task.projectIntId,
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
    dayMap[dayStr] = Object.values(groupBy(dayMap[dayStr], (we) => we.id)).map((workEntries) => ({
      id: workEntries[0].id,
      hours: sum(workEntries.map((we) => we.hours)),
      projectName: workEntries[0].projectName,
      projectIntId: workEntries[0].projectIntId,
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
    }))
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

const mergeExports = (a: PlatformExportFormat, b: PlatformExportFormat): PlatformExportFormat => {
  const result = { ...a }
  for (const day in b) {
    result[day] = [...(result[day] || []), ...b[day]]
  }
  return result
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
  const isTaskVisible = (task: WorkEntry) =>
    task.projectName.toLowerCase().includes(platformViewFilterProject.toLowerCase()) ||
    task.taskName.toLowerCase().includes(platformViewFilterProject.toLowerCase())

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
    uniqBy(allWorkEntries, (we) => we.id),
    (x) => +(-1 === x.taskIntId), // placeholder task last
    (x) => x.projectName,
    (x) => x.taskName,
  ).filter((taskToShow) => isTaskVisible(taskToShow))
  const theme = useTheme()
  const classes = useClasses(styles)
  const showingTotal = sum(allWorkEntries.map((we) => we.hours))

  const projectTasksViewItems: PlatformExportFormat = {}
  const ottTaskMissingRepliconTask: WorkEntry[] = []
  for (const w of intervals) {
    const workEntries = eachDayOfInterval(w)
      .flatMap((d) => platformExport[isoDayStr(d)] ?? [])
      ?.filter((t) => t.platformType === 'OTT' && isTaskVisible(t))

    for (const task of workEntries) {
      const projectData = platformState.tasks.find(
        (project) =>
          project.typ === 'REPLICON' &&
          project.projectName === task.projectName &&
          project.taskCode &&
          task.taskCode,
      )
      if (projectData) {
        const groupTask: WorkEntry = {
          hours: 0,
          id: generateId(projectData.intId, platformState.repliconActivity),
          projectName: projectData.projectName,
          projectIntId: projectData.projectIntId,
          taskIntId: projectData.intId,
          taskName: projectData.name,
          platformType: projectData.typ,
          taskCode: projectData.taskCode,
          comment: '',
          taskActivity: platformState.repliconActivity,
          child: [],
        }
        const projectItems = projectTasksViewItems[isoDayStr(w.start)]
        const projectItem = projectItems?.find(
          (item) =>
            item.projectName === projectData.projectName && item.taskCode === projectData.taskCode,
        )

        if (projectItem) {
          projectItem.hours += task.hours
          projectItem.child?.push(task)
        } else {
          groupTask.hours = task.hours
          groupTask.child?.push(task)
          if (projectItems) {
            projectTasksViewItems[isoDayStr(w.start)].push(groupTask)
          } else {
            projectTasksViewItems[isoDayStr(w.start)] = [groupTask]
          }
        }
      } else {
        ottTaskMissingRepliconTask.push(task)
      }
    }
  }

  const allProjectTasks = Object.values(projectTasksViewItems).flatMap((x) => x)
  const mergedProjectTasks = uniqBy(allProjectTasks, (task) => task.id).map((task) => {
    const matchingTasks = allProjectTasks.filter((t) => t.id === task.id)
    const allChilds = matchingTasks.flatMap((t) => t.child ?? [])
    return {
      ...task,
      child: uniqBy(allChilds, (child) => child.id),
    }
  })

  const projectTasks = sortBy(
    mergedProjectTasks,
    (x) => +(-1 === x.taskIntId), // placeholder task last
    (x) => x.projectName,
    (x) => x.taskName,
  )

  const projectTasksView = [
    ...projectTasks,
    ...tasksToShow.filter(
      (task) =>
        task.platformType !== 'OTT' || ottTaskMissingRepliconTask.find((t) => t.id === task.id),
    ),
  ]
  const mergedPlatformExport = mergeExports(platformExport, projectTasksViewItems)

  const getWorkedHours = (interval: Interval) => {
    return sum(
      eachDayOfInterval(interval).map((d) =>
        sum(platformExport[isoDayStr(d)]?.map((we) => we.hours) ?? []),
      ),
    )
  }

  return (
    <div style={{ width: '97%', color: theme.palette.text.primary }}>
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
              <TableCell
                key={isoDayStr(w.start)}
                sx={{ fontWeight: 'bold' }}
                className='numberHeader'
              >
                {formatDate(w.start, headerFormat)}
              </TableCell>
            ))}
            <TableCell sx={{ fontWeight: 'bold' }} className='numberCell'>
              Total
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(projectTasksView).map(([projectIntId, projectTask]) => (
            <ProjectRow
              key={projectIntId}
              intervals={intervals}
              projectTask={projectTask}
              tasksItems={mergedPlatformExport}
            />
          ))}
          <TableRow>
            <TableCell colSpan={2} style={{ textAlign: 'right' }}>
              <b>Summe</b>
            </TableCell>
            {intervals.map((w, i) => (
              <TableCell
                key={i}
                style={{ textDecoration: 'underline dotted', textAlign: 'right' }}
                className='numberCell'
              >
                <DiffHoursTooltip
                  targetHours={calculateTargetHours(w)}
                  workedHours={getWorkedHours(w)}
                >
                  <b>{formatHours(getWorkedHours(w))}</b>
                </DiffHoursTooltip>
              </TableCell>
            ))}
            <TableCell
              style={{ textDecoration: 'underline dotted', textAlign: 'right' }}
              className='numberCell'
            >
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
                    omap(mergedPlatformExport, (workEntries) =>
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
    </div>
  )
})

function ProjectRow({
  intervals,
  projectTask,
  tasksItems,
}: {
  intervals: Interval[]
  projectTask: WorkEntry
  tasksItems: PlatformExportFormat
}) {
  const theme = useTheme()
  const [open, setOpen] = React.useState(true)

  let taskColor = {}
  if (projectTask.platformType === 'UNDEFINED') {
    taskColor = { color: theme.palette.grey[400] }
  } else if (projectTask.platformType === 'OTT') {
    taskColor = { color: theme.palette.warning.main }
  }

  const showingTotal = (task: WorkEntry) =>
    sum(intervals.map((interval) => getWorkedHours(interval, task)))
  const getWorkEntries = (interval: Interval, task: WorkEntry) =>
    eachDayOfInterval(interval)
      .flatMap((d) => tasksItems[isoDayStr(d)] ?? [])
      .filter((we) => we.id === task.id)

  const getWorkedHours = (interval: Interval, task: WorkEntry) =>
    sum(getWorkEntries(interval, task).map((we) => we.hours))

  return (
    <>
      <TableRow onClick={() => setOpen(!open)}>
        <TableCell>
          {projectTask.child && projectTask.child.length > 0 && (
            <IconButton aria-label='expand row' size='small'>
              {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          )}
        </TableCell>
        <TableCell style={taskColor}>
          {projectTask.platformType !== 'UNDEFINED' ? (
            <>
              <b>
                {projectTask.projectName}
                {projectTask.taskName !== projectTask.projectName
                  ? ' / ' + projectTask.taskName
                  : ''}
                <small>
                  ({projectTask.taskCode}/
                  <span
                    style={!projectTask.taskActivity ? { color: theme.palette.error.main } : {}}
                  >
                    {projectTask.taskActivity || 'UNDEFINED'}
                  </span>
                  )
                </small>
              </b>
              &nbsp;
              <Chip
                label={projectTask.platformType}
                color={projectTask.platformType === 'REPLICON' ? 'primary' : 'secondary'}
                size='small'
              />
            </>
          ) : (
            <b>{projectTask.taskName}</b>
          )}
        </TableCell>
        {intervals.map((w, i) => (
          <TableCell
            key={i}
            style={{
              textAlign: 'right',
              ...taskColor,
            }}
          >
            <b>{formatHours(getWorkedHours(w, projectTask))}</b>
          </TableCell>
        ))}
        <TableCell
          style={{
            textAlign: 'right',
            ...taskColor,
          }}
        >
          <b>{formatHours(showingTotal(projectTask))}</b>
        </TableCell>
      </TableRow>
      {open && (
        <>
          {projectTask.child?.map((task) => (
            <TableRow key={task.id} className='white'>
              <TableCell />
              <TableCell>
                {task.projectName} / {task.taskName} <small>({task.taskCode})</small>
                &nbsp;
                <Chip
                  label={task.platformType}
                  color={task.platformType === 'REPLICON' ? 'primary' : 'secondary'}
                  size='small'
                />
              </TableCell>
              {intervals.map((w) => {
                const workEntries = getWorkEntries(w, task)
                return (
                  <TableCell
                    key={task.id + '-' + isoDayStr(w.start)}
                    title={workEntries.map((we) => we.comment).join('\n')}
                    style={{
                      textAlign: 'right',
                      cursor: workEntries.some((we) => we.comment) ? 'help' : 'default',
                    }}
                    className='numberCell'
                  >
                    {workEntries.some((we) => we.comment) && (
                      <span
                        style={{
                          fontSize: 'xx-small',
                        }}
                      >
                        m/K{' '}
                      </span>
                    )}
                    {formatHours(getWorkedHours(w, task))}
                  </TableCell>
                )
              })}
              <TableCell style={{ textAlign: 'right' }}>
                {formatHours(showingTotal(task))}
              </TableCell>
            </TableRow>
          ))}
        </>
      )}
    </>
  )
}
