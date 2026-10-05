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
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { FileUpload as ExportIcon } from '@mui/icons-material'
import {
  differenceInDays,
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
import { sortBy, uniqBy } from 'lodash'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useRef, useState } from 'react'
import { PlatformExportFormat, PlatformType, WorkEntry } from 'zedd-platform'
import { useTheme } from '@mui/material/styles'

import { TimeSlice } from '../AppState'
import { PlatformActionType, PlatformState } from '../PlatformState'
import { LoadingSpinner } from './LoadingSpinner'

import {
  isoDayStr,
  sum,
  formatHours,
  getActivityPercentage,
  isActivityWithDeviatingFactor,
} from '../util'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { buildProjectViewGrouping, mergeExports, sliceToExport } from '../DataSlicer'
// Re-exported because the existing test imports it from here (now lives in DataSlicer).
export { smartRound } from '../DataSlicer'

export interface PlatformViewProps {
  showing: Interval
  calculateTargetHours: (interval: Interval) => number
  slices: TimeSlice[]
  platformState: PlatformState
  submitTimesheets: boolean
  onChangeSubmitTimesheets: (x: boolean) => void
  errorHandler: (e: Error) => void
}

const DiffHoursTooltip = ({
  targetHours,
  workedHours,
  timeTravelHours,
  children,
}: {
  targetHours: number
  timeTravelHours: number
  workedHours: number
  children: React.ReactElement
}) => {
  const diff = workedHours - targetHours
  const diffTravelTime = timeTravelHours - targetHours
  const showTravelTime = timeTravelHours !== workedHours

  return (
    <Tooltip
      slotProps={{
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
          {showTravelTime ? (
            <>
              <br></br>- {targetHours} (target with TT) ={' '}
              <Box component='span' sx={{ color: diff < 0 ? 'error.dark' : 'success.light' }}>
                {diffTravelTime >= 0 ? '+' : ''}
                {diffTravelTime}
              </Box>
            </>
          ) : (
            ''
          )}
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
  const platformExport = sliceToExport({
    slices: props.slices,
    showing: props.showing,
    resolveTask: platformState.resolveTask,
  })
  const allWorkEntries = Object.values(platformExport).flatMap((x) => x)
  const tasksToShow = sortBy(
    uniqBy(allWorkEntries, (we) => we.id),
    (x) => +(-1 === x.taskIntId), // placeholder task last
    (x) => x.projectName,
    (x) => x.taskName,
  ).filter((taskToShow) => isTaskVisible(taskToShow))
  const theme = useTheme()
  const showingTotal = sum(allWorkEntries.map((we) => we.hours))

  const showingTotalWithTravelTime = sum(
    allWorkEntries.map((we) => we.hours * getActivityPercentage(we.taskActivity)),
  )

  const { projectTasksViewItems, ottTaskMissingRepliconTask } = buildProjectViewGrouping({
    platformExport,
    repliconTasks: platformState.tasks.filter((t) => t.typ === 'REPLICON'),
    repliconActivity: platformState.repliconActivity,
    intervals,
    isTaskVisible,
  })

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

  /**
   * Calculates the total worked hours within the given interval
   *
   * Iterates over each day in the interval, sums the hours of all work entries
   * recorded for that day in 'platformExport', and returns the aggregated total.
   * @param interval The date range for which worked hours should be calculated.
   * @returns The total number of worked hours within the interval.
   */
  const getWorkedHours = (interval: Interval) => {
    return sum(
      eachDayOfInterval(interval).map((date) =>
        sum(platformExport[isoDayStr(date)]?.map((workEntry) => workEntry.hours) ?? []),
      ),
    )
  }

  /**
   * Calculates the total worked hours within the given interval respective the travel time factors
   *
   * Iterates over each day in the interval, sums the hours of all work entries
   * recorded for that day in 'platformExport', and returns the aggregated total respective the TT factor.
   *
   * @param interval The date range for which worked hours should be calculated.
   * @returns The total number wof worked hours wihtin the interval respective the travel time factor.
   */
  const getWorkedHoursRespectiveTravelTime = (interval: Interval) => {
    return sum(
      eachDayOfInterval(interval).map((date) =>
        sum(
          platformExport[isoDayStr(date)]?.map(
            (workEntry) => workEntry.hours * getActivityPercentage(workEntry.taskActivity),
          ),
        ),
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
              <b>
                {showingTotalWithTravelTime === showingTotal
                  ? 'Summe'
                  : 'Summe (Summe mit Reisezeit)'}
              </b>
            </TableCell>
            {intervals.map((w, i) => (
              <TableCell
                key={i}
                style={{ textDecoration: 'underline dotted', textAlign: 'right' }}
                className='numberCell'
              >
                <DiffHoursTooltip
                  targetHours={calculateTargetHours(w)}
                  timeTravelHours={getWorkedHoursRespectiveTravelTime(w)}
                  workedHours={getWorkedHours(w)}
                >
                  <b>
                    {!(getWorkedHoursRespectiveTravelTime(w) === getWorkedHours(w))
                      ? formatHours(getWorkedHours(w)) +
                        ' (' +
                        formatHours(getWorkedHoursRespectiveTravelTime(w)) +
                        ')'
                      : formatHours(getWorkedHours(w))}
                  </b>
                </DiffHoursTooltip>
              </TableCell>
            ))}
            <TableCell
              style={{ textDecoration: 'underline dotted', textAlign: 'right' }}
              className='numberCell'
            >
              <DiffHoursTooltip
                targetHours={calculateTargetHours(showing)}
                timeTravelHours={getWorkedHoursRespectiveTravelTime(showing)}
                workedHours={showingTotal}
              >
                <b>
                  {!(showingTotalWithTravelTime === showingTotal)
                    ? formatHours(showingTotal) +
                      ' (' +
                      formatHours(showingTotalWithTravelTime) +
                      ')'
                    : formatHours(showingTotal)}
                </b>
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
                  .export(platform, mergedPlatformExport, submitTimesheets)
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
            <b>
              {isActivityWithDeviatingFactor(projectTask.taskActivity)
                ? formatHours(getWorkedHours(w, projectTask)) +
                  ' (' +
                  formatHours(
                    getWorkedHours(w, projectTask) *
                      getActivityPercentage(projectTask.taskActivity),
                  ) +
                  ')'
                : formatHours(getWorkedHours(w, projectTask))}
            </b>
          </TableCell>
        ))}
        <TableCell
          style={{
            textAlign: 'right',
            ...taskColor,
          }}
        >
          <b>
            {isActivityWithDeviatingFactor(projectTask.taskActivity)
              ? formatHours(showingTotal(projectTask)) +
                ' (' +
                formatHours(
                  showingTotal(projectTask) * getActivityPercentage(projectTask.taskActivity),
                ) +
                ')'
              : formatHours(showingTotal(projectTask))}
          </b>
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
