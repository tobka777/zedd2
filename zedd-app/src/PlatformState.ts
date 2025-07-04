import { format as formatDate, parseISO } from 'date-fns'
import { promises as fsp } from 'fs'
import { computed, makeObservable, observable } from 'mobx'
import * as path from 'path'
import {
  fillClarity,
  webDriverQuit,
  importOTTTasks,
  PlatformExportFormat,
  Task,
  PlatformType,
  ottQuit,
} from 'zedd-platform'
import './index.css'
import { FILE_DATE_FORMAT, getLatestFileInDir, mkdirIfNotExists } from './util'

export enum PlatformActionType {
  SubmitTimesheet,
  ImportTasks,
}

export class PlatformState {
  public ottLink: string

  public chromeExe: string

  public chromedriverExe: string

  public chromeHeadless: boolean

  /**
   * The name of the "platform resource" you are filling out
   * timesheets for, i.e. yourself. this is only required
   * if you have the right ins platform to fill timesheets for
   * others.
   */
  public resourceName: string | undefined

  @observable
  public error = ''

  @observable
  public success = false

  @observable
  public actionType: PlatformActionType

  @observable
  private _currentlyImportingTasks = false

  @observable
  private _currentlyExportingTasks = false

  @observable
  private _tasks: Task[] = []

  @observable
  private _tasksLastUpdated: Date | undefined

  public constructor(public platformDir: string) {
    makeObservable(this)
  }

  public get currentlyImportingTasks(): boolean {
    return this._currentlyImportingTasks
  }

  public get currentlyExportingTasks(): boolean {
    return this._currentlyExportingTasks
  }

  get tasks(): Task[] {
    return this._tasks
  }

  @computed
  get intIdTaskMap(): Map<number, Task> {
    return this._tasks.reduce((map, task) => map.set(task.intId, task), new Map())
  }

  @computed
  get projectNames(): string[] {
    const projectNames = Array.from(
      this._tasks.reduce((set, task) => (set.add(task.projectName), set), new Set<string>()),
    )
    projectNames.sort()
    return projectNames
  }

  public get tasksLastUpdated(): Date | undefined {
    return this._tasksLastUpdated
  }

  public async init(): Promise<void> {
    await mkdirIfNotExists(this.platformDir)
  }

  public async export(
    platformExport: PlatformExportFormat,
    submitTimesheets: boolean,
  ): Promise<void> {
    this.actionType = PlatformActionType.SubmitTimesheet
    console.log('exporting timesheets', platformExport)
    try {
      this.clearPlatformState(false)
      await fillClarity(this.ottLink, platformExport, submitTimesheets, this.resourceName, {
        headless: this.chromeHeadless,
        chromeExe: this.chromeExe,
        chromedriverExe: this.chromedriverExe,
      })
      this.success = true
    } finally {
      this._currentlyExportingTasks = false
    }
  }

  public async importAndSavePlatformTasks(
    // @ts-expect-error TS6133
    toImport: 'ALL' | PlatformType,
    infoNotify?: (info: string) => void,
  ): Promise<Task[]> {
    this._tasks = await this.importPlatformTasks((tasks) => {
      infoNotify && infoNotify('Imported ' + tasks.length + ' tasks from OTT.')

      this._tasks = [...tasks]
    })
    await this.savePlatformTasksToFile(this._tasks)
    return this._tasks
  }

  public async loadStateFromFile(): Promise<void> {
    ;[this._tasksLastUpdated, this._tasks] = await this.loadPlatformTasksFromFile()
  }

  public resolveTask(intId: number | undefined): undefined | Task {
    return intId === undefined ? undefined : this.intIdTaskMap.get(intId)
  }

  public isValidTaskIntId(intId: number | undefined): boolean {
    return this.resolveTask(intId) !== undefined
  }

  public killPlatform(): void {
    webDriverQuit()
    ottQuit()
  }

  private clearPlatformState(importing: boolean) {
    this._currentlyImportingTasks = importing
    this._currentlyExportingTasks = !importing
    this.error = ''
    this.success = false
  }

  private async importPlatformTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]> {
    this.actionType = PlatformActionType.ImportTasks
    if (this._currentlyImportingTasks) {
      throw new Error('Already importing')
    }
    try {
      this.clearPlatformState(true)
      this._currentlyExportingTasks = false
      const tasks = await importOTTTasks(
        this.ottLink,
        {
          headless: this.chromeHeadless,
          executablePath: this.chromeExe,
        },
        notifyTasks,
      )

      this.success = true
      return tasks
    } finally {
      this._currentlyImportingTasks = false
    }
  }

  private async savePlatformTasksToFile(tasks: Task[]) {
    const json = JSON.stringify(tasks, undefined, '  ')
    const newFile = 'tasks_' + formatDate(new Date(), FILE_DATE_FORMAT) + '.json'
    await fsp.writeFile(path.join(this.platformDir, newFile), json)
    const filesToDelete = (await fsp.readdir(this.platformDir, { withFileTypes: true })).filter(
      (f) => f.isFile() && f.name !== newFile,
    )
    await Promise.all(filesToDelete.map((f) => fsp.unlink(path.join(this.platformDir, f.name))))
  }

  private async loadPlatformTasksFromFile(): Promise<[Date, Task[]]> {
    const [file, date] = await getLatestFileInDir(this.platformDir, /^tasks_(.*)\.json$/)
    const content = await fsp.readFile(path.join(this.platformDir, file), {
      encoding: 'utf8',
    })
    const tasks: Task[] = JSON.parse(content, (key, value) =>
      'end' === key || 'start' === key ? parseISO(value) : value,
    )
    return [date, tasks]
  }
}
