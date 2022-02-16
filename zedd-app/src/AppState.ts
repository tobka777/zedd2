import * as assert from 'assert'
import {
  addMinutes,
  areIntervalsOverlapping,
  compareDesc,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  format as formatDate,
  getDay,
  getISODay,
  isAfter,
  isBefore,
  isSameDay,
  isValid,
  max as dateMax,
  min as dateMin,
  parseISO,
  set as dateSet,
  startOfDay,
  startOfMinute,
  parse as dateParse,
  subSeconds,
} from 'date-fns'
import * as remote from '@electron/remote'
import { promises as fsp } from 'fs'
import { sum } from 'lodash'
import { computed, observable, transaction, intercept, action, makeObservable } from 'mobx'
import type { IObservableArray } from 'mobx'
import { createTransformer, ObservableGroupMap } from 'mobx-utils'
import * as path from 'path'
import * as chroma from 'chroma.ts'
import {
  custom,
  date,
  deserialize,
  identifier,
  list,
  object,
  reference,
  serializable,
  serialize,
  SKIP,
  getDefaultModelSchema,
} from 'serializr'

import feiertage from './feiertage.json'
import {
  abs,
  isoWeekInterval,
  mkdirIfNotExists,
  startOfNextMinute,
  stringHashColor,
  tryWithFilesInDir,
  uniqCustom,
  FILE_DATE_FORMAT,
  readFilesWithDate,
  formatHoursBT,
  formatHoursHHmm,
  getUniqueId,
} from './util'
import { ZeddSettings } from './ZeddSettings'
import { Undoer } from './Undoer'

export const MIN_GAP_TIME_MIN = 5

function filterDatesFalloff(dates: Date[], now = new Date()) {
  dates.sort(compareDesc)
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1]
    const current = dates[i]
    let keep
    if (differenceInHours(now, current) < 1) {
      // keep everything
      keep = true
    } else if (differenceInDays(now, current) < 1) {
      // keep one per hour
      keep = prev.getHours() !== current.getHours()
    } else {
      // keep one per day
      keep = +startOfDay(prev) !== +startOfDay(current)
    }
    if (!keep) {
      dates.splice(i, 1)
      i--
    }
  }
}

export class Task {
  @serializable(identifier())
  @observable
  public name: string

  @serializable
  @observable
  public clarityTaskIntId: number | undefined

  /**
   * The internal key for JIRA-Issues.
   * Used to prevent multiple tasks being created for the same issue.
   */
  @serializable
  @observable
  public key: string | undefined

  @serializable
  @observable
  public clarityTaskComment: string = ''

  constructor(
    name: string = '',
    clarityTaskIntId?: number | undefined,
    key?: string,
    clarityTaskComment?: string,
  ) {
    makeObservable(this)
    this.name = name
    this.clarityTaskIntId = clarityTaskIntId
    this.key = key
    this.clarityTaskComment = clarityTaskComment || ''
  }

  public static same(a: Task, b: Task): boolean {
    return (a.key && b.key && a.key === b.key) || a.name === b.name
  }

  public getColor(): chroma.Color {
    return stringHashColor(this.name)
  }
}

export const validDate = <T extends Date | number>(d: T): T => {
  if (!isValid(d)) throw new Error('date invalid: ' + d)
  return d
}
export const dateFormatString = 'yyyy-MM-dd HH:mm'
export const format = (date: Date | number): string => formatDate(date, dateFormatString)
export const formatInterval = (s: Interval): string => format(s.start) + ' - ' + format(s.end)

export class TimeSlice {
  static parse(slice: string): [Date, Date, string] {
    const [, startString, endString, taskName] = slice.match(/(.{16}) - (.{16}) (.*)/)!
    const now = new Date()
    return [
      dateParse(startString, dateFormatString, now),
      dateParse(endString, dateFormatString, now),
      taskName,
    ]
  }

  @observable
  private _startEnd: { start: Date; end: Date }

  @serializable(date())
  get start(): Date {
    return this._startEnd.start
  }

  set start(start: Date) {
    this.setInterval(start, undefined)
  }
  @serializable(date())
  get end(): Date {
    return this._startEnd.end
  }

  set end(end: Date) {
    this.setInterval(undefined, end)
  }

  @serializable(reference(Task))
  @observable
  public task: Task

  @action
  public setInterval(start = this._startEnd.start, end = this._startEnd.end): void {
    if (differenceInMinutes(end, start) <= 0) {
      throw new Error(`start (${start}) must be at least one minute before end (${end})`)
    }
    this._startEnd = { start, end }
  }

  constructor(start: Date, end: Date, task: Task) {
    makeObservable(this)
    this.setInterval(start, end)
    this.task = task
  }
  toString(): string {
    return formatInterval(this) + ' ' + this.task.name
  }
}
export const timeSliceStr = (ts: TimeSlice | undefined): string | undefined => {
  if (!ts) return undefined
  return formatInterval(ts) + ' ' + ts.task.name
}

export class AppState {
  /** CONSTANTS */
  public static readonly APP_START_TIME = new Date()

  /** FIELDS */

  @observable
  public windowFocused: boolean = false

  @observable
  @serializable
  public timingInProgess: boolean = true

  @observable
  @serializable(
    list(
      custom(
        (s: TimeSlice) => s.toString(),
        (jsonValue, context, _oldValue, done) => {
          const [start, end, taskName] =
            'object' === typeof jsonValue
              ? [new Date(jsonValue.start), new Date(jsonValue.end), jsonValue.task]
              : TimeSlice.parse(jsonValue)
          context.rootContext.await(
            getDefaultModelSchema(Task)!,
            taskName,
            // pass createCallback, otherwise random errors from ref-counting
            // TODO: fix in serializr
            context.rootContext.createCallback((task) => {
              let result
              try {
                result = new TimeSlice(start, end, task)
              } catch (e) {
                result = SKIP
              }
              done(undefined, result)
            }),
          )
        },
      ),
    ),
  )
  public slices: IObservableArray<TimeSlice> = observable([])

  @serializable(list(object(Task)))
  public lastInteractedTasks: IObservableArray<Task> = observable([])

  private slicesByTask = new ObservableGroupMap(
    this.slices,
    (slice) => slice.task, //
    { name: 'slicesByTask' },
  )

  private slicesByDay = new ObservableGroupMap(
    this.slices,
    (slice) => startOfDay(slice.start).getTime(),
    { name: 'slicesByDay' },
  )

  @observable
  public renamingTask: undefined | Task = undefined

  @observable
  public settingsDialogOpen: boolean = false

  @observable
  public whatsNewDialogOpen: boolean = true

  @observable
  @serializable
  public whatsNewDialogLastOpenedForVersion: string = ''

  @observable
  public messages: {
    msg: string
    severity: 'error' | 'warning' | 'info'
    timeout: number
    id: number
  }[] = []

  public addMessage(
    msg: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    timeout = 10000,
  ): void {
    this.messages.push({ msg, severity, timeout, id: getUniqueId() })
  }

  @observable
  @serializable
  public submitTimesheets = false

  @observable
  public assignedIssueTasks: Task[] = []

  @observable
  public changingSliceTask: TimeSlice | undefined = undefined

  /**
   * init last, so this.slices is already set
   */
  @observable
  @serializable(reference(Task))
  public currentTask: Task = this.getUndefinedTask()

  @observable
  public focused: TimeSlice | undefined = undefined

  @observable
  public lastAction = 0

  @observable
  public updateAvailable: string | undefined

  @serializable(
    custom(
      (x) => x,
      (x, _, old) => (x.normal ? x : { ...old, normal: x }),
    ),
  )
  public bounds = {
    normal: { x: 100, y: 100, width: 800, height: 600 },
    maximized: false,
    hover: { x: 100, y: 100, width: 800, height: 600 },
  }

  public config: ZeddSettings = new ZeddSettings()

  public idleSliceNotificationCallback: undefined | ((when: Interval) => void)

  @observable
  private _startDate: string = ''

  @observable
  private _endDate: string = ''

  @observable
  private _showing!: Interval

  private _interval: NodeJS.Timeout

  @serializable(date())
  private lastUserAction: Date = new Date()

  /**
   * Whether the always-on-top, title-bar-only "hover mode" is currently enabled.
   */
  @observable
  @serializable
  public hoverMode: boolean = false

  /**
   * Relevant links to display in the UI
   */
  @observable
  public links: [string, string][] = []

  private undoer: Undoer = new Undoer()

  constructor() {
    makeObservable(this)
    this.showing = isoWeekInterval(Date.now())
    intercept(this, 'slices', (change) => {
      if ('update' === change.type) {
        this.slices.replace(change.newValue)
        return null
      } else {
        throw new Error(JSON.stringify(change))
      }
    })

    this.undoer.makeUndoable(this.slices)
  }

  public undo(): void {
    this.undoer.undo()
  }

  public redo(): void {
    this.undoer.redo()
  }

  public static async saveToDir(instance: AppState, dir: string): Promise<void> {
    // const allTasks = instance.slices.map(s => s.task)
    // if (instance.currentTask) allTasks.push(instance.currentTask)
    // instance.tasks = uniq(allTasks)
    await mkdirIfNotExists(dir)
    const newFile = 'data_' + formatDate(new Date(), FILE_DATE_FORMAT) + '.json'
    try {
      await fsp.writeFile(path.join(dir, newFile), instance.toJsonString(), 'utf8')
    } catch (e) {
      try {
        await fsp.unlink(newFile)
      } catch (e2) {
        console.log('Error while trying to unlink file after error writing file.', e2)
      }
      throw e
    }
  }

  public static loadFromJsonString(json: string): AppState {
    const newState = deserialize(AppState, JSON.parse(json))
    newState.undoer.reset()
    return newState
  }

  public static async loadFromDir(dir: string): Promise<AppState> {
    return await tryWithFilesInDir(dir, /^data_(.*).json$/, async (file, _date) => {
      console.log('loadFromDir: loading AppState from', file)
      const json = await fsp.readFile(path.join(dir, file), 'utf8')
      return this.loadFromJsonString(json)
    })
  }

  /**
   * Delete old files in the directory. (Keeping some, the more recent, the more frequently).
   * @returns The number of deleted files.
   */
  public static async cleanSaveDir(dir: string): Promise<number> {
    const filesWithDate = await readFilesWithDate(dir, /^data_(.*).json$/)
    const datesToKeep = filesWithDate.map(([_f, date]) => date)
    filterDatesFalloff(datesToKeep)
    const pathsToDelete = filesWithDate
      .filter(([_f, date]) => !datesToKeep.includes(date))
      .map(([f]) => path.join(dir, f))
    await Promise.all(pathsToDelete.map(fsp.unlink))
    return pathsToDelete.length
  }

  @serializable(list(object(Task), { afterDeserialize: (callback) => callback(undefined, SKIP) }))
  @computed
  get tasks(): Task[] {
    return Array.from(this.slicesByTask.keys())
  }

  @computed
  get tasksInfos(): { task: Task; lastEnd: Date }[] {
    const UNDEFINED_TASK = this.getUndefinedTask()
    const tasksInfos = this.slices.reduceRight((result, slice) => {
      if (slice.task !== UNDEFINED_TASK) {
        const info = result.find((i) => i.task === slice.task)
        if (info) {
          info.lastEnd = dateMax([info.lastEnd, slice.end])
        } else {
          result.push({ task: slice.task, lastEnd: slice.end })
        }
      }
      return result
    }, [] as { task: Task; lastEnd: Date }[])
    tasksInfos.sort((a, b) => compareDesc(a.lastEnd, b.lastEnd))
    return tasksInfos
  }

  @serializable(
    custom(
      (s, _, state) => state.slices.indexOf(s),
      (i, context) => {
        if (-1 === i) {
          return undefined
        } else {
          if (context.target.slices.length <= i) {
            throw new Error('?!' + i)
          }
          return context.target.slices[i]
        }
      },
    ),
  )
  private lastTimedSlice: undefined | TimeSlice = undefined

  public get startDate(): string {
    return this._startDate
  }
  public set startDate(iso: string) {
    this._startDate = iso
    this.updateShowingFromStartEnd()
  }
  public get endDate(): string {
    return this._endDate
  }
  public set endDate(iso: string) {
    this._endDate = iso
    this.updateShowingFromStartEnd()
  }

  public get showing(): Interval {
    return this._showing
  }

  @serializable(object({ factory: () => ({}), props: { start: date(), end: date() } }))
  public set showing(newShowing: Interval) {
    this._showing = newShowing
    this._startDate = formatDate(newShowing.start, 'yyyy-MM-dd')
    this._endDate = formatDate(newShowing.end, 'yyyy-MM-dd')
  }

  @computed
  public get showingSlices(): TimeSlice[] {
    return eachDayOfInterval(this.showing).flatMap(
      (day) => this.slicesByDay.get(day.getTime()) || [],
    )
  }

  /**
   * If tasks already contains a task with a matching key or name, return that,
   * otherwise return the passed task.
   */
  public normalizeTask(taskToNormalize: Task): Task {
    return this.tasks.find((t) => Task.same(taskToNormalize, t)) ?? taskToNormalize
  }

  /** METHODS */
  public toggleTimingInProgress(): void {
    this.timingInProgess = !this.timingInProgess
  }

  public getDayWorkedHours(day: Date): number {
    return (
      sum(
        this.slicesByDay
          .get(startOfDay(day).getTime())
          ?.map((s) => differenceInMinutes(s.end, s.start)) ?? [],
      ) / 60
    )
  }

  public getDayProgress(day: Date): number {
    const dayHours = this.getDayWorkedHours(day)
    const dayShouldWorkHours = this.config.workmask[getISODay(day) - 1] || 0
    return 0 === dayShouldWorkHours ? 1 : dayHours / dayShouldWorkHours
  }

  public getUndefinedTask(): Task {
    return (
      this.tasks.find((t) => 'UNDEFINED' === t.name) ||
      new Task('UNDEFINED', undefined, 'UNDEFINED')
    )
  }

  public getMostRecentTasks(n: number): Task[] {
    return this.tasksInfos.slice(0, n).map((i) => i.task)
  }

  public getSuggestedTasks(): Task[] {
    return uniqCustom([...this.getMostRecentTasks(7), ...this.assignedIssueTasks], Task.same)
  }

  public getTaskHours = createTransformer(
    (task: Task) =>
      (sum(this.slicesByTask.get(task)?.map((s) => differenceInMinutes(s.end, s.start))) ?? 0) / 60,
    { debugNameGenerator: (t) => `getTaskMinutes${t?.name}` },
  )

  public fillErsatz(when: Interval): void {
    for (const day of eachDayOfInterval(when)) {
      this.addSliceIfDayEmpty(
        this.makeFullDaySlice(day, this.getTaskForName(this.config.ersatzTask)),
      )
    }
  }

  public clearErsatz(when: Interval): void {
    const fixedWhen = { start: startOfDay(when.start), end: endOfDay(when.end) }
    const ersatzTask = this.getTaskForName(this.config.ersatzTask)
    const slicesToRemove = this.slices.filter(
      (s) => s.task === ersatzTask && areIntervalsOverlapping(s, fixedWhen),
    )
    transaction(() => slicesToRemove.forEach((r) => this.slices.remove(r)))
  }

  public getPreviousSlice(slice: Interval): TimeSlice | undefined {
    return this.slices.reduce((result, s) => {
      if (!isBefore(s.start, slice.start)) return result
      if (!result || isAfter(s.start, result.start)) return s
      return result
    }, undefined as TimeSlice | undefined)
  }

  public getNextSlice(slice: Interval): TimeSlice | undefined {
    return this.slices.reduce((result, s) => {
      if (!isAfter(s.start, slice.start)) return result
      if (!result || isBefore(s.start, result.start)) return s
      return result
    }, undefined as TimeSlice | undefined)
  }

  public getTaskForName(name: Task | string | undefined): Task {
    const taskName = ('string' === typeof name ? name : name?.name)?.trim()?.replace(/\s+/, ' ')
    if (!taskName) {
      return this.getUndefinedTask()
    }
    const taskNameLC = taskName.toLowerCase()
    return (
      this.tasks.find((t) => taskNameLC === t.name.toLowerCase()) ||
      this.assignedIssueTasks.find((t) => taskNameLC === t.name.toLowerCase()) ||
      new Task(taskName, undefined)
    )
  }

  public addSlice(s: TimeSlice): TimeSlice {
    validDate(s.start)
    validDate(s.end)

    this.slices.push(s)
    return s
  }

  public removeSlice(s: TimeSlice): void {
    const index = this.slices.indexOf(s)
    if (index === this.slices.length - 1) {
      this.slices.length--
    } else {
      this.slices.splice(index, 1)
      /*transaction(() => {
        this.slices[index] = this.slices.pop()!
      })*/
    }
  }

  public startInterval(): void {
    this._interval = setInterval(this.trackTime, 5_000)
  }
  public cleanup(): void {
    if (this._interval) clearInterval(this._interval)
  }

  /**
   * Tasks cannot overlap.
   *
   * Main time tracking loop. The currentTask can be assumed to have been set immediately
   * after the last event. Call on('resume') to make assumption valid.
   *
   * The currently selected task eats/overrides existing slices in the way. When encountering
   * a new slice, the currently selected task switches. The user is presented with an option
   * to stay with the curent task.
   */
  public trackTime = (
    now = new Date(),
    secondsSinceLastUserInput = remote?.powerMonitor?.getSystemIdleTime() ?? 0,
    minIdleTimeInMin = Math.max(this?.config?.minIdleTimeMin ?? 15, 1),
  ): void => {
    this.undoer.notUndoable(() => {
      const prevLastUserAction = this.lastUserAction
      this.lastUserAction = subSeconds(now, secondsSinceLastUserInput)
      if (!this.timingInProgess || this.getUndefinedTask() === this.currentTask) {
        this.lastTimedSlice = undefined
        return
      }
      let lastSlice =
        this.slices.reduce((prev, s) => {
          if (abs(differenceInMinutes(now, s.end)) < 5 && isBefore(s.start, now)) {
            if (!prev || isAfter(s.start, prev.start)) {
              return s
            }
          }
          return prev
        }, undefined as TimeSlice | undefined) ?? this.lastTimedSlice

      // console.log('lastSlice', strlastSlice)
      if (differenceInMinutes(now, this.lastUserAction) > minIdleTimeInMin) {
        if (lastSlice) {
          lastSlice.end = startOfNextMinute(this.lastUserAction)
          this.lastTimedSlice = undefined
        }
        return
      }
      if (
        isAfter(this.lastUserAction, prevLastUserAction) &&
        differenceInMinutes(now, prevLastUserAction) > minIdleTimeInMin
      ) {
        // console.log('user is back', timeSliceStr(lastSlice))

        if (lastSlice) {
          lastSlice.end = startOfNextMinute(prevLastUserAction)
          // console.log('lastSlice', timeSliceStr(lastSlice))
          lastSlice = undefined
        }
        try {
          if (this.idleSliceNotificationCallback) {
            this.idleSliceNotificationCallback({
              start: startOfNextMinute(prevLastUserAction),
              end: startOfMinute(now),
            })
          }
        } catch (e) {
          console.error('There was an error calling idleSliceNotificationCallback', e)
        }
      }

      if (!lastSlice) {
        const start = startOfMinute(now)
        const newSlice: TimeSlice = new TimeSlice(start, addMinutes(start, 1), this.currentTask)
        // console.log('ADDING SLICE', newSlice)

        this.lastTimedSlice = this.addSlice(newSlice)
      } else {
        if (
          abs(differenceInMinutes(lastSlice.end, lastSlice.start)) < 5 &&
          lastSlice.task !== this.currentTask
        ) {
          // last slice is < 5min, convert it
          lastSlice.task = this.currentTask
        }
        if (lastSlice.task === this.currentTask) {
          if (isSameDay(lastSlice.start, now)) {
            // extend current slice
            lastSlice.end = startOfNextMinute(now)
            this.lastTimedSlice = lastSlice
          } else {
            //   console.log('adding slice because of new day', now, timeSliceStr(lastSlice))
            const boundary = startOfDay(now)
            lastSlice.end = boundary
            this.lastTimedSlice = this.addSlice(
              new TimeSlice(boundary, startOfNextMinute(now), this.currentTask),
            )
          }
        } else {
          lastSlice.end = dateMin([lastSlice.end, startOfMinute(now)])
          const newSlice = new TimeSlice(lastSlice.end, startOfNextMinute(now), this.currentTask)
          // console.log('lastSlice is different, add', timeSliceStr(lastSlice), timeSliceStr(newSlice))
          this.lastTimedSlice = this.addSlice(newSlice)
        }
      }
    })
  }

  public isDayEmpty(timeInDay: Date): boolean {
    return !this.slicesByDay.get(startOfDay(timeInDay).getTime())?.length
  }

  public addSliceIfDayEmpty(newSlice: TimeSlice | undefined): boolean {
    if (!newSlice) {
      return false
    }
    assert(isSameDay(newSlice.start, newSlice.end))
    const dayIsEmpty = this.isDayEmpty(newSlice.start)
    if (dayIsEmpty) {
      this.addSlice(newSlice)
    }
    return dayIsEmpty
  }

  public importHolidays(): void {
    for (const holidayDateStr of Object.keys(feiertage)) {
      const date = new Date(holidayDateStr)
      const slice = this.makeFullDaySlice(date, this.getTaskForName('URLAUB'))
      this.addSliceIfDayEmpty(slice)
    }
  }

  public toJsonString(): string {
    const stateJsonObject = serialize(AppState, this)
    return JSON.stringify(stateJsonObject, undefined, '  ')
  }

  private updateShowingFromStartEnd() {
    try {
      const start = parseISO(this.startDate)
      const end = parseISO(this.endDate)
      if (start <= end) this.showing = { start, end }
    } catch (e) {
      console.error(e)
    }
  }

  private makeFullDaySlice(day: Date, task: Task): TimeSlice | undefined {
    const dayWorkHours = this.config.workmask[getDay(day) - 1]
    if (dayWorkHours) {
      return new TimeSlice(
        dateSet(day, { hours: this.config.startHour }),
        dateSet(day, {
          hours: this.config.startHour + dayWorkHours,
        }),
        task,
      )
    }
    return undefined
  }

  public notifyTaskInteraction(task: Task): void {
    if (this.lastInteractedTasks.indexOf(task) !== -1) {
      this.lastInteractedTasks.splice(this.lastInteractedTasks.indexOf(task), 1)
    }
    if (this.lastInteractedTasks.length === 5) {
      this.lastInteractedTasks.pop()
    }
    this.lastInteractedTasks.unshift(task)
  }

  public getTasksForMenu(): Task[] {
    return this.lastInteractedTasks
  }

  public dialogOpen(): boolean {
    return !!(
      this.settingsDialogOpen ||
      this.renamingTask ||
      this.changingSliceTask ||
      this.whatsNewDialogOpen
    )
  }

  public calcTargetHours(interval: Interval): number {
    return sum(eachDayOfInterval(interval).map((day) => this.config.workmask[getDay(day) - 1]))
  }

  public formatHours = (hours: number): string =>
    'bt' === this.config.timeFormat ? formatHoursBT(hours) : formatHoursHHmm(hours)
}
