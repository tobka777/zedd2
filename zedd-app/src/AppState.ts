import * as assert from 'assert'
import {
  addMinutes,
  areIntervalsOverlapping,
  compareDesc,
  differenceInMinutes,
  differenceInMonths,
  eachDayOfInterval,
  eachYearOfInterval,
  endOfDay,
  format as formatDate,
  getDay,
  getISODay,
  getYear,
  isAfter,
  isBefore,
  isSameDay,
  isValid,
  max as dateMax,
  min as dateMin,
  parse as dateParse,
  parseISO,
  set as dateSet,
  startOfDay,
  startOfMinute,
  subSeconds,
} from 'date-fns'
import { sum } from 'lodash'
import type { IObservableArray } from 'mobx'
import { action, computed, intercept, makeObservable, observable, transaction } from 'mobx'
import { createTransformer, ObservableGroupMap } from 'mobx-utils'

import { randomUUID } from 'crypto'

import {
  createSimpleSchema,
  custom,
  date,
  getDefaultModelSchema,
  list,
  object,
  reference,
  serializable,
  SKIP,
} from 'serializr'

import {
  abs,
  formatHoursBT,
  formatHoursHHmm,
  getUniqueId,
  isoWeekInterval,
  startOfNextMinute,
  uniqCustom,
} from './util'
import { ZeddSettings } from './ZeddSettings'
import { Undoer } from './Undoer'

import { Task } from './entities/Task'
import { taskSchema } from './task-schema'

export const MIN_GAP_TIME_MIN = 5

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

  @serializable
  public id: string

  @observable
  private _startEnd!: { start: Date; end: Date }

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

  constructor(start: Date, end: Date, task: Task, id?: string) {
    makeObservable(this)
    this.setInterval(start, end)
    this.task = task
    this.id = id ?? randomUUID()
  }
  toString(): string {
    return formatInterval(this) + ' ' + this.task.name
  }
}

export class AppState {
  /** CONSTANTS */
  public static readonly APP_START_TIME = new Date()

  /** FIELDS */

  @observable
  public slicesMarked: boolean = false

  @observable
  public windowFocused: boolean = false

  @observable
  @serializable
  public timingInProgess: boolean = true

  @observable
  @serializable(
    list(
      custom(
        // v2 shape
        (s: TimeSlice) => ({
          id: s.id,
          start: s.start,
          end: s.end,
          task: s.task.name,
        }),
        (jsonValue, context, _oldValue, done) => {
          // legacy v1 shape: slices as strings
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
                result = new TimeSlice(start, end, task, jsonValue.id)
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

  public markedSlices: IObservableArray<TimeSlice> = observable([])

  public lastClickedSlice: TimeSlice | undefined

  @observable
  public copiedSlice: TimeSlice | undefined = undefined

  @serializable(list(taskSchema))
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
  @serializable(
    list(
      object(
        createSimpleSchema({
          fetchedDate: date(),
          country: true,
          holidays: list(date()),
          year: true,
          state: true,
        }),
      ),
    ),
  )
  public cachedHolidays: {
    fetchedDate: Date
    countryCode: string
    holidays: Date[]
    year: number
    stateCode?: string
  }[] = []

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

  @observable
  @serializable(
    custom(
      (t: Task) => t.name,
      (name, context, _oldValue, done) => {
        context.rootContext.await(
          getDefaultModelSchema(Task)!,
          name,
          // pass createCallback, otherwise random errors from ref-counting
          // TODO: fix in serializr
          context.rootContext.createCallback((task) => done(undefined, task)),
        )
      },
    ),
  )
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

  private _interval!: NodeJS.Timeout

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

  public undoer: Undoer = new Undoer()

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

  public async getHolidays(
    interval: Interval,
    countryCode: string,
    getHolidaysFromApi: (year: number, countryCode: string, stateCode?: string) => Promise<Date[]>,
    stateCode?: string,
  ): Promise<Date[]> {
    const searchedYears = eachYearOfInterval(interval)
    let holidays: Date[] = []

    for (const dateYear of searchedYears) {
      const year = getYear(dateYear)
      let holidaysForYear = this.getHolidaysFromCacheAndDeleteExpired(year, countryCode, stateCode)

      if (holidaysForYear.length === 0) {
        holidaysForYear = await getHolidaysFromApi(year, countryCode, stateCode)
        if (holidaysForYear.length !== 0) {
          this.addHolidaysToCache(countryCode, holidaysForYear, year, stateCode!)
        }
      }

      holidays = [...holidays, ...holidaysForYear]
    }

    return holidays
  }

  private getHolidaysFromCacheAndDeleteExpired(
    searchedYear: number,
    where: string,
    state?: string,
  ): Date[] {
    let holidays: Date[] = []

    for (let index = 0; index < this.cachedHolidays.length; index++) {
      if (
        this.cachedHolidays[index] &&
        this.cachedHolidays[index].countryCode === where &&
        this.cachedHolidays[index].year === searchedYear &&
        this.cachedHolidays[index].stateCode === state
      ) {
        if (!this.isFetchedDateExpired(this.cachedHolidays[index].fetchedDate)) {
          holidays = this.cachedHolidays[index].holidays
        } else {
          this.cachedHolidays.splice(index, 1)
        }
      }
    }

    return holidays
  }

  private addHolidaysToCache(
    country: string,
    holidays: Date[],
    year: number,
    state?: string,
  ): void {
    this.cachedHolidays.push({
      fetchedDate: new Date(),
      countryCode: country,
      holidays: holidays,
      year: year,
      stateCode: state,
    })
  }

  private isFetchedDateExpired(date: Date): boolean {
    const now = new Date()
    return differenceInMonths(now, date) > 1
  }

  @serializable(list(taskSchema, { afterDeserialize: (callback) => callback(undefined, SKIP) }))
  @computed
  get tasks(): Task[] {
    return Array.from(this.slicesByTask.keys())
  }

  @computed
  get tasksInfos(): { task: Task; lastEnd: Date }[] {
    const UNDEFINED_TASK = this.getUndefinedTask()
    const tasksInfos = this.slices.reduceRight(
      (result, slice) => {
        if (slice.task !== UNDEFINED_TASK) {
          const info = result.find((i) => i.task === slice.task)
          if (info) {
            info.lastEnd = dateMax([info.lastEnd, slice.end])
          } else {
            result.push({ task: slice.task, lastEnd: slice.end })
          }
        }
        return result
      },
      [] as { task: Task; lastEnd: Date }[],
    )
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

  private respectingManualSliceEnd = false

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
      this.tasks.find((t) => 'UNDEFINED' === t.name || '' === t.name) ||
      new Task('UNDEFINED', [], undefined, 'UNDEFINED')
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

  @action
  public fillErsatz(when: Interval, holidays: Date[]): void {
    for (const day of eachDayOfInterval(when)) {
      const task = holidays.some((holiday) => isSameDay(day, holiday))
        ? this.getTaskForName('HOLIDAY')
        : this.getTaskForName(this.config.ersatzTask)
      this.addSliceIfDayEmpty(this.makeFullDaySlice(day, task))
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
    return this.slices.reduce(
      (result, s) => {
        if (!isBefore(s.start, slice.start)) return result
        if (!result || isAfter(s.start, result.start)) return s
        return result
      },
      undefined as TimeSlice | undefined,
    )
  }

  public getNextSlice(slice: Interval): TimeSlice | undefined {
    return this.slices.reduce(
      (result, s) => {
        if (!isAfter(s.start, slice.start)) return result
        if (!result || isBefore(s.start, result.start)) return s
        return result
      },
      undefined as TimeSlice | undefined,
    )
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
      new Task(taskName, [])
    )
  }

  public addSlice(s: TimeSlice): TimeSlice {
    validDate(s.start)
    validDate(s.end)

    this.slices.push(s)
    return s
  }

  public removeSlices(s: TimeSlice): void {
    const index = this.slices.indexOf(s)
    const onMarkedSlice = this.markedSlices.findIndex((e) => e === s)
    if (onMarkedSlice === -1) {
      this.removeSlice(index)
    } else {
      this.markedSlices.forEach((e) => {
        this.removeSlice(this.slices.indexOf(e))
      })
    }
    this.clearMarking()
  }

  private removeSlice(index: number): void {
    if (index === this.slices.length - 1) {
      this.slices.length--
    } else {
      this.slices.splice(index, 1)
    }
  }

  public markSlice(slice: TimeSlice): void {
    const ifExists = this.markedSlices.includes(slice)

    if (ifExists) {
      const index = this.markedSlices.indexOf(slice)
      if (index === this.markedSlices.length - 1) {
        this.markedSlices.length--
      } else {
        this.markedSlices.splice(index, 1)
      }
    } else {
      this.markedSlices.push(slice)
      this.slicesMarked = true
      this.lastClickedSlice = this.markedSlices[this.markedSlices.length - 1]
    }
  }

  public clearMarking(): void {
    this.markedSlices.clear()
    this.slicesMarked = false
    this.copiedSlice = undefined
  }

  public startInterval(getUserIdleTime: () => number): void {
    this._interval = setInterval(
      () => this.trackTime(undefined, getUserIdleTime(), undefined),
      5_000,
    )
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
    secondsSinceLastUserInput = 0,
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
        this.slices.reduce(
          (prev, s) => {
            if (abs(differenceInMinutes(now, s.end)) < 5 && isBefore(s.start, now)) {
              if (!prev || isAfter(s.start, prev.start)) {
                return s
              }
            }
            return prev
          },
          undefined as TimeSlice | undefined,
        ) ?? this.lastTimedSlice

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
        if (lastSlice) {
          lastSlice.end = startOfNextMinute(prevLastUserAction)
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
        const coveringSlice = this.slices.find((s) => s.start <= now && now < s.end)
        if (coveringSlice?.task === this.currentTask) {
          this.lastTimedSlice = coveringSlice
        } else if (!coveringSlice) {
          const start = startOfMinute(now)
          const newSlice: TimeSlice = new TimeSlice(start, addMinutes(start, 1), this.currentTask)
          this.lastTimedSlice = this.addSlice(newSlice)
        }
      } else {
        if (
          abs(differenceInMinutes(lastSlice.end, lastSlice.start)) < 5 &&
          lastSlice.task !== this.currentTask
        ) {
          // last slice is < 5min, convert it
          lastSlice.task = this.currentTask
        }
        if (lastSlice.task === this.currentTask) {
          if (
            this.respectingManualSliceEnd &&
            lastSlice === this.lastTimedSlice &&
            !isAfter(now, lastSlice.end)
          ) {
            this.lastTimedSlice = lastSlice
          } else if (lastSlice.end > startOfNextMinute(now)) {
            this.lastTimedSlice = lastSlice
            this.respectingManualSliceEnd = true
          } else if (this.respectingManualSliceEnd && lastSlice === this.lastTimedSlice) {
            const boundary = dateMin([lastSlice.end, startOfNextMinute(now)])
            lastSlice.end = boundary
            this.respectingManualSliceEnd = false
            this.lastTimedSlice = this.addSlice(
              new TimeSlice(boundary, startOfNextMinute(now), this.currentTask),
            )
          } else if (isSameDay(lastSlice.start, now)) {
            let nextSliceStart: Date | undefined
            for (const s of this.slices) {
              if (s !== lastSlice && s.start >= lastSlice.end) {
                if (!nextSliceStart || s.start < nextSliceStart) nextSliceStart = s.start
              }
            }
            lastSlice.end = nextSliceStart
              ? dateMin([startOfNextMinute(now), nextSliceStart])
              : startOfNextMinute(now)
            this.lastTimedSlice = lastSlice
          } else {
            // new day: the previous slice ends at midnight
            const boundary = startOfDay(now)
            lastSlice.end = boundary
            this.lastTimedSlice = this.addSlice(
              new TimeSlice(boundary, startOfNextMinute(now), this.currentTask),
            )
          }
        } else if (isAfter(lastSlice.end, now) && lastSlice !== this.lastTimedSlice) {
        } else {
          this.respectingManualSliceEnd = false
          lastSlice.end = dateMin([lastSlice.end, startOfMinute(now)])
          const newSlice = new TimeSlice(lastSlice.end, startOfNextMinute(now), this.currentTask)
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
    assert.ok(isSameDay(newSlice.start, newSlice.end))
    const dayIsEmpty = this.isDayEmpty(newSlice.start)
    if (dayIsEmpty) {
      this.addSlice(newSlice)
    }
    return dayIsEmpty
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
