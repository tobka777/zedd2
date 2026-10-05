import {
  addDays,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachDayOfInterval,
  max as dateMax,
  min as dateMin,
} from 'date-fns'
import { groupBy, remove, sortBy } from 'lodash'
import type {
  PlatformExportFormat,
  Task as PlatformTask,
  PlatformType,
  WorkEntry,
} from 'zedd-platform'
import { validDate } from './AppState'
import {
  formatHours,
  hashStringToInt,
  isoDayStr,
  splitIntervalIntoCalendarDays,
  sum,
} from './util'

/**
 * Minimal shape of a time slice needed to turn it into a platform work entry.
 * `task` is the app Task (or whatever carries those fields) — only the fields
 * the export needs are read, so the pure slicer stays decoupled from MobX.
 */
export interface SliceInput {
  start: Date
  end: Date
  task: {
    name: string
    intId: number | string | undefined
    taskActivityName?: string
    platformTaskComment: string
  }
}

const roundToNearest = (x: number, toNearest: number) => Math.round(x / toNearest) * toNearest
const floorToNearest = (x: number, toNearest: number) => Math.floor(x / toNearest) * toNearest
const ceilToNearest = (x: number, toNearest: number) => Math.ceil(x / toNearest) * toNearest

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

export const generateId = (intId: number, taskActivityName?: string): string =>
  String(intId + (taskActivityName ? '_' + taskActivityName : ''))

export const placeholderPlatformTask = (name: string): PlatformTask => ({
  projectName: 'UNDEFINED',
  projectIntId: -1,
  intId: hashStringToInt(name),
  name: name || 'UNDEFINED',
  taskCode: 'UNDEFINED',
  typ: 'UNDEFINED',
})

/**
 * Map a persisted catalog task (`platform/tasks_*.json`) onto the canonical keys in
 * memory. Tolerates the legacy `platformTaskIntId` key and fills in `typ` when missing.
 * Idempotent: already-canonical data passes through unchanged. No file rewrite.
 */
export function normalizeCatalogTask(raw: Record<string, unknown>): PlatformTask {
  const t = { ...raw }
  if (t.intId === undefined && t.platformTaskIntId !== undefined) {
    t.intId = t.platformTaskIntId
    delete t.platformTaskIntId
  }
  if (t.typ === undefined) t.typ = 'UNDEFINED'
  return t as unknown as PlatformTask
}

export const mergeExports = (a: PlatformExportFormat, b: PlatformExportFormat): PlatformExportFormat => {
  const result = { ...a }
  for (const day in b) {
    result[day] = [...(result[day] || []), ...b[day]]
  }
  return result
}

/**
 * Turns time slices into the `PlatformExportFormat` (the "JSON document") for the given
 * `showing` interval. Pure: no MobX / no PlatformState — the platform-task resolver is
 * injected so callers can pass `platformState.resolveTask` through.
 *
 * This is the single source of truth for the slice → work-entry join, day-splitting,
 * grouping and rounding (moved out of the UI).
 */
export function sliceToExport(args: {
  slices: SliceInput[]
  showing: Interval
  resolveTask: (intId?: number | string) => PlatformTask | undefined
  outputCommentHours?: boolean
}): PlatformExportFormat {
  const { slices, showing, resolveTask, outputCommentHours = false } = args
  // add 1 to the end of showing, because we want the interval to go to the end of the
  // not just the beginning
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
      (slice.task.intId && resolveTask(slice.task.intId)) || placeholderPlatformTask(slice.task.name)
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
          d.taskIntId === slice.task.intId &&
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

/**
 * The single central filter that decides which work entries go into an export for a
 * given platform. Replaces the old double-filtering (the UI's `-1 !== taskIntId` filter
 * plus `PlatformState.export`'s `platformType === platform` + `keepEmptyEntries`).
 *
 * Entries whose `taskIntId` is `-1` (placeholder tasks) are dropped; only entries whose
 * `platformType` matches the target platform remain. OTT keeps days that end up empty
 * (so that an OTT timesheet day is still exported even with 0 booked hours); other
 * platforms drop empty days.
 */
export function buildExportForPlatform(
  merged: PlatformExportFormat,
  platform: PlatformType,
): PlatformExportFormat {
  const keepEmptyEntries = platform === 'OTT'
  return Object.fromEntries(
    Object.entries(merged)
      .map(([day, entries]) => [
        day,
        entries.filter((e) => -1 !== e.taskIntId && e.platformType === platform),
      ])
      .filter(([_day, entries]) => keepEmptyEntries || entries.length > 0),
  ) as PlatformExportFormat
}

/**
 * Display-only roll-up that groups OTT work entries under their matching REPLICON
 * project task (adding a `child` list). This is purely for the platform view and is
 * NOT part of the exported document — `buildExportForPlatform` never sees these rows.
 */
export function buildProjectViewGrouping(args: {
  platformExport: PlatformExportFormat
  repliconTasks: PlatformTask[]
  repliconActivity: string
  intervals: Interval[]
  isTaskVisible: (we: WorkEntry) => boolean
}): { projectTasksViewItems: PlatformExportFormat; ottTaskMissingRepliconTask: WorkEntry[] } {
  const { platformExport, repliconTasks, repliconActivity, intervals, isTaskVisible } = args

  const projectTasksViewItems: PlatformExportFormat = {}
  const ottTaskMissingRepliconTask: WorkEntry[] = []
  for (const w of intervals) {
    const workEntries = eachDayOfInterval(w)
      .flatMap((d) => platformExport[isoDayStr(d)] ?? [])
      ?.filter((t) => t.platformType === 'OTT' && isTaskVisible(t))

    for (const task of workEntries) {
      const projectData = repliconTasks.find(
        (project) =>
          project.typ === 'REPLICON' &&
          project.projectName === task.projectName &&
          project.taskCode === task.taskCode,
      )
      if (projectData) {
        const taskActivity = task.taskActivity || repliconActivity
        const groupTask: WorkEntry = {
          hours: 0,
          id: generateId(projectData.intId, taskActivity),
          projectName: projectData.projectName,
          projectIntId: projectData.projectIntId,
          taskIntId: projectData.intId,
          taskName: projectData.name,
          platformType: projectData.typ,
          taskCode: projectData.taskCode,
          comment: '',
          taskActivity: taskActivity,
          child: [],
        }
        const projectItems = projectTasksViewItems[isoDayStr(w.start)]
        const projectItem = projectItems?.find(
          (item) =>
            item.projectName === projectData.projectName &&
            item.taskCode === projectData.taskCode &&
            item.taskActivity === taskActivity,
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
  return { projectTasksViewItems, ottTaskMissingRepliconTask }
}
