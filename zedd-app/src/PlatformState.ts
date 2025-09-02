import { format as formatDate, parseISO } from 'date-fns'
import { promises as fsp } from 'fs'
import { computed, makeObservable, observable } from 'mobx'
import * as path from 'path'
import {
  OTTIntegration,
  PlatformExportFormat,
  PlatformIntegration,
  PlatformType,
  Task,
  TaskActivity,
  webDriverQuit,
} from 'zedd-platform'
import './index.css'
import { FILE_DATE_FORMAT, getLatestFileInDir, mkdirIfNotExists } from './util'
import { RepliconIntegration } from 'zedd-platform/out/src/replicon-integration'
import { PlatformOptions } from 'zedd-platform/out/src/model/platform.options.model'
import { WorkEntry } from 'zedd-platform/out/src/model/work-entry.model'

export enum PlatformActionType {
  SubmitTimesheet,
  ImportTasks,
}

export class PlatformState {
  public ottLink: string

  public repliconLink: string

  public repliconActivity: string

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

  private integrationMap: Record<string, PlatformIntegration>

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

  get taskActivities(): TaskActivity[] {
    return this._taskActivities
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
        .flat().find(
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

  public async setIntegrationMap(): Promise<void> {
    const options: PlatformOptions = {
      headless: this.chromeHeadless,
      executablePath: this.chromeExe,
    }
    this.integrationMap = {
      REPLICON: new RepliconIntegration(this.repliconLink, options),
      OTT: new OTTIntegration(this.ottLink, options),
    }
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
      if (platform === 'ALL') {
        for (const [key] of Object.entries(this.integrationMap)) {
          await this.export(key as PlatformType, platformExport, submitTimesheets)
        }
      } else {
        this.platformIntegration = this.integrationMap[platform]
        const exportTasksForPlatform = Object.fromEntries(
          Object.entries(platformExport)
            .map(([day, entries]) => [day, entries.filter(e => e.platformType === platform)])
            .filter(([_, entries]) => entries.length > 0)
        );

        await this.platformIntegration.exportTasks(exportTasksForPlatform, submitTimesheets)
      }
      this.success = true
    } finally {
      await this.platformIntegration?.quitBrowser()
      this._currentlyExportingTasks = false
    }
  }

  public async importAndSavePlatformTasks(
    toImport: 'ALL' | PlatformType,
    infoNotify?: (info: string) => void,
    notSave?: boolean,
  ): Promise<Task[]> {
    try {
      if (toImport === 'ALL') {
        const results: Task[] = []
        for (const [key] of Object.entries(this.integrationMap)) {
          const tasks = await this.importAndSavePlatformTasks(key as PlatformType, infoNotify, true)
          results.push(...tasks)
        }

        const existingExternalIds = new Set(this._tasks.map((task) => task.projectIntId))
        const uniqueTasks = results
          .flat()
          .filter((task) => !existingExternalIds.has(task.projectIntId))
        this._tasks.push(...uniqueTasks)
        infoNotify &&
          infoNotify('Imported ' + existingExternalIds.size + ' tasks from ' + toImport + '.')
      } else {
        this.platformIntegration = this.integrationMap[toImport]

        this._tasks = await this.importPlatformTasks(this.platformIntegration, (tasks) => {
          infoNotify && infoNotify('Imported ' + tasks.length + ' tasks from ' + toImport + '.')

          this._tasks = [...tasks]
        })
      }

      if (!notSave) {
        await this.savePlatformTasksToFile(this._tasks)
      }
    } catch (error) {
      this.platformIntegration?.quitBrowser()
    }
    return this._tasks
  }

  public async importRepliconTaskActivities(
    platformTaskIntId: string | number | undefined,
    infoNotify?: (info: string) => void,
  ) {
    const task: Task = (platformTaskIntId && this.resolveTask(platformTaskIntId as number)) as Task

    if (!task) {
      throw new Error('No task found')
    }

    const workEntry: WorkEntry = {
      taskIntId: task.intId,
      projectName: task.projectName,
      projectIntId: task.projectIntId,
      taskCode: task.taskCode,
      taskName: task.name,
      hours: 0,
      platformType: 'REPLICON',
    }
    const repliconIntegration = this.integrationMap['REPLICON'] as RepliconIntegration
    // TODO save taskActivities to each Task (task.taskActivities)
    this._taskActivities = await repliconIntegration.importTaskActivities(
      workEntry,
      (taskActivities) => {
        infoNotify &&
          infoNotify('Imported ' + taskActivities.length + ' task activities from REPLICON.')
      },
    )
    this.saveTaskActivitiesToFile(this._taskActivities)
  }

  public async loadStateFromFile(): Promise<void> {
    ;[this._tasksLastUpdated, this._tasks] = await this.loadPlatformTasksFromFile()
    ;[, this._taskActivities] = await this.loadTaskActivitiesFromFile()
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

  private async saveTaskActivitiesToFile(tasks: TaskActivity[]) {
    const json = JSON.stringify(tasks, undefined, '  ')
    this.saveToFile(json, "activities")
  }

  private async loadTaskActivitiesFromFile(): Promise<[Date, TaskActivity[]]> {
    const [date, content] = await this.loadFromFile("activities")
    return [date, JSON.parse(content)]
  }

  private async savePlatformTasksToFile(tasks: Task[]) {
    const json = JSON.stringify(tasks, undefined, '  ')
    this.saveToFile(json, "tasks")
  }

  private async loadPlatformTasksFromFile(): Promise<[Date, Task[]]> {
    const [date, content] = await this.loadFromFile("tasks")
    const tasks: Task[] = JSON.parse(content, (key, value) =>
      'end' === key || 'start' === key ? parseISO(value) : value,
    )
    return [date, tasks]
  }

  private async saveToFile(json: string, name: string) {
    const newFile = name + '_' + formatDate(new Date(), FILE_DATE_FORMAT) + '.json'
    await fsp.writeFile(path.join(this.platformDir, newFile), json)
    const filesToDelete = (await fsp.readdir(this.platformDir, { withFileTypes: true })).filter(
      (f) => f.isFile() && f.name !== newFile && f.name.includes(name + '_'),
    )
    await Promise.all(filesToDelete.map((f) => fsp.unlink(path.join(this.platformDir, f.name))))
  }

  private async loadFromFile(name: string): Promise<[Date, string]> {
    const [file, date] = await getLatestFileInDir(this.platformDir, new RegExp(`^${name}_(.*)\.json$`))
    const content = await fsp.readFile(path.join(this.platformDir, file), {
      encoding: 'utf8',
    })
    return [date, content]
  }
}
