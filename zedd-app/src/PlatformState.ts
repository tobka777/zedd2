import { format as formatDate, parseISO } from 'date-fns'
import { promises as fsp } from 'fs'
import { computed, makeObservable, observable } from 'mobx'
import * as path from 'path'
import {
  PlatformExportFormat,
  PlatformIntegration,
  PlatformIntegrationFactory,
  PlatformType,
  Task,
  TaskActivity,
  webDriverQuit,
} from 'zedd-platform'
import './index.css'
import { FILE_DATE_FORMAT, getLatestFileInDir, mkdirIfNotExists } from './util'

export enum PlatformActionType {
  SubmitTimesheet,
  ImportTasks,
}

export class PlatformState {
  public ottLink: string

  public repliconLink: string

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
  private _taskActivities: TaskActivity[] = []

  private platformIntegration: PlatformIntegration

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
  get uriTaskActivitiesMap(): Map<string, TaskActivity> {
    return this._taskActivities.reduce(
      (map, taskActivity) => map.set(taskActivity.uri, taskActivity),
      new Map(),
    )
  }

  @computed
  get projectNames(): string[] {
    const projectNames = Array.from(
      this._tasks.reduce((set, task) => (set.add(task.projectName), set), new Set<string>()),
    )
    projectNames.sort()
    return projectNames
  }

  public allRepliconTasksHaveActivity(platformExport: PlatformExportFormat): boolean {
    return (
      Object.values(platformExport)
        .flat()
        .filter((workEntry) => workEntry.platformType === 'REPLICON')
        .find(
          (workEntry) =>
            workEntry.platformType === 'REPLICON' &&
            (!workEntry.taskActivity || (workEntry.taskActivity && workEntry.taskActivity === '')),
        ) !== undefined
    )
  }

  public get tasksLastUpdated(): Date | undefined {
    return this._tasksLastUpdated
  }

  public async init(): Promise<void> {
    await mkdirIfNotExists(this.platformDir)
  }

  public async export(
    platform: 'ALL' | PlatformType,
    platformExport: PlatformExportFormat,
    submitTimesheets: boolean,
  ): Promise<void> {
    this.actionType = PlatformActionType.SubmitTimesheet
    console.log('exporting timesheets', platformExport)
    try {
      this.clearPlatformState(false)
      this.platformIntegration = await new PlatformIntegrationFactory().create(
        platform,
        this.ottLink,
        this.repliconLink,
        {
          headless: this.chromeHeadless,
          executablePath: this.chromeExe,
        },
      )

      await this.platformIntegration.exportTasks(platformExport, submitTimesheets)

      this.success = true
    } catch (ex) {
      await this.platformIntegration?.quitBrowser()
    } finally {
      this._currentlyExportingTasks = false
    }
  }

  public async importAndSavePlatformTasks(
    platformIntegration: PlatformIntegration,
    toImport: 'ALL' | PlatformType,
    infoNotify?: (info: string) => void,
  ): Promise<Task[]> {
    try {
      this.platformIntegration = platformIntegration
      this._tasks = await this.importPlatformTasks(platformIntegration, (tasks) => {
        infoNotify && infoNotify('Imported ' + tasks.length + ' tasks from ' + toImport + '.')
        this._taskActivities = platformIntegration.getActivityOptions()

        this._tasks = [...tasks]
      })
      await this.savePlatformObjectsToFile(this._tasks, 'tasks')
      await this.savePlatformObjectsToFile(this._tasks, 'activities')
    } catch (ex) {
      await platformIntegration.quitBrowser()
    }
    return this._tasks
  }

  public async loadStateFromFile(): Promise<void> {
    ;[this._tasksLastUpdated, this._tasks] = (await this.loadPlatformTasksFromFile(
      'tasks',
      /^tasks_(.*)\.json$/,
    )) as [Date, Task[]]
    if (this._tasks.length > 0) {
      this._taskActivities = (await this.loadPlatformTasksFromFile(
        'activities',
        /^activities_(.*)\.json$/,
      )) as TaskActivity[]
    }
  }

  public resolveTask(intId: number | undefined): undefined | Task {
    return intId === undefined ? undefined : this.intIdTaskMap.get(intId)
  }

  public resolveActivity(value: string) {
    return value === undefined ? undefined : this.uriTaskActivitiesMap.get(value)
  }

  public isValidTaskIntId(intId: number | undefined): boolean {
    return this.resolveTask(intId) !== undefined
  }

  public killPlatform() {
    this._currentlyExportingTasks = false
    this._currentlyImportingTasks = false
    webDriverQuit()
    this.platformIntegration?.quitBrowser()
  }

  private clearPlatformState(importing: boolean) {
    this._currentlyImportingTasks = importing
    this._currentlyExportingTasks = !importing
    this.error = ''
    this.success = false
  }

  private async importPlatformTasks(
    platformIntegration: PlatformIntegration,
    notifyTasks?: (p: Task[]) => void,
  ): Promise<Task[]> {
    this.actionType = PlatformActionType.ImportTasks
    if (this._currentlyImportingTasks) {
      throw new Error('Already importing')
    }
    try {
      this.clearPlatformState(true)
      this._currentlyExportingTasks = false
      const tasks = await platformIntegration.importTasks(notifyTasks)

      this.success = true
      return tasks
    } finally {
      this._currentlyImportingTasks = false
    }
  }

  private async savePlatformObjectsToFile(objects: Task[] | TaskActivity[], subPackage: string) {
    const objectsPlatformDir = path.join(this.platformDir, subPackage)
    const json = JSON.stringify(objects, undefined, '  ')
    const newFile = subPackage + '_' + formatDate(new Date(), FILE_DATE_FORMAT) + '.json'
    await fsp.writeFile(path.join(objectsPlatformDir, newFile), json)
    const filesToDelete = (await fsp.readdir(objectsPlatformDir, { withFileTypes: true })).filter(
      (f) => f.isFile() && f.name !== newFile,
    )
    await Promise.all(filesToDelete.map((f) => fsp.unlink(path.join(objectsPlatformDir, f.name))))
  }

  private async loadPlatformTasksFromFile(
    subPackage: string,
    pattern: RegExp,
  ): Promise<TaskActivity[] | [Date, Task[]]> {
    const objectsPlatformDir = path.join(this.platformDir, subPackage)
    const [file, date] = await getLatestFileInDir(objectsPlatformDir, pattern)
    const content = await fsp.readFile(path.join(objectsPlatformDir, file), {
      encoding: 'utf8',
    })

    if (subPackage === 'tasks') {
      const tasks: Task[] = JSON.parse(content, (key, value) =>
        'end' === key || 'start' === key ? parseISO(value) : value,
      )
      return [date, tasks]
    }
    return JSON.parse(content)
  }
}
