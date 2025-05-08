import { format as formatDate, parseISO } from 'date-fns'
import { promises as fsp } from 'fs'
import { computed, makeObservable, observable } from 'mobx'
import * as path from 'path'
import { fillClarity, webDriverQuit } from 'zedd-platform/out/src/clarity-integration'
import { PlatformExportFormat } from 'zedd-platform/out/src/model/platform-export-format.model'
import { Task as ZeddPlatformTask } from 'zedd-platform/src/model/task.model'
import './index.css'

import { importOTTTasks } from 'zedd-platform/out/src'
import { FILE_DATE_FORMAT, getLatestFileInDir, mkdirIfNotExists } from './util'

export interface PlatformTask extends ZeddPlatformTask {
  projectName: string
  projectIntId: string
}

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
  private _tasks: PlatformTask[] = []

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

  get tasks(): PlatformTask[] {
    return this._tasks
  }

  @computed
  get intIdTaskMap(): Map<number, PlatformTask> {
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
    infoNotify?: (info: string) => void,
  ): Promise<PlatformTask[]> {
    this._tasks = await this.importPlatformTasks((tasks) => {
      infoNotify && infoNotify('Imported ' + tasks.length + '.')

      this._tasks = [
        ...tasks.map(
          (t) =>
            ({
              ...t,
              projectName: t.projectName,
              projectIntId: t.projectIntId,
            } as PlatformTask),
        ),
      ]
    })
    await this.savePlatformTasksToFile(this._tasks)
    return this._tasks
  }

  public async loadStateFromFile(): Promise<void> {
    ;[this._tasksLastUpdated, this._tasks] = await this.loadPlatformTasksFromFile()
  }

  public resolveTask(intId: number | undefined): undefined | ZeddPlatformTask {
    return intId === undefined ? undefined : this.intIdTaskMap.get(intId)
  }

  public isValidTaskIntId(intId: number | undefined): boolean {
    return this.resolveTask(intId) !== undefined
  }

  public killSelenium(): void {
    webDriverQuit()
  }

  private clearPlatformState(importing: boolean) {
    this._currentlyImportingTasks = importing
    this._currentlyExportingTasks = !importing
    this.error = ''
    this.success = false
  }

  private async importPlatformTasks(
    notifyTasks?: (p: ZeddPlatformTask[]) => void,
  ): Promise<PlatformTask[]> {
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
        },
        notifyTasks,
      )

      this.success = true
      return tasks.map((task) => Object.assign(task, task as unknown as PlatformTask))
    } finally {
      this._currentlyImportingTasks = false
    }
  }

  private async savePlatformTasksToFile(tasks: PlatformTask[]) {
    const json = JSON.stringify(tasks, undefined, '  ')
    const newFile = 'tasks_' + formatDate(new Date(), FILE_DATE_FORMAT) + '.json'
    await fsp.writeFile(path.join(this.platformDir, newFile), json)
    const filesToDelete = (await fsp.readdir(this.platformDir, { withFileTypes: true })).filter(
      (f) => f.isFile() && f.name !== newFile,
    )
    await Promise.all(filesToDelete.map((f) => fsp.unlink(path.join(this.platformDir, f.name))))
  }

  private async loadPlatformTasksFromFile(): Promise<[Date, PlatformTask[]]> {
    const [file, date] = await getLatestFileInDir(this.platformDir, /^tasks_(.*)\.json$/)
    const content = await fsp.readFile(path.join(this.platformDir, file), {
      encoding: 'utf8',
    })
    const tasks: PlatformTask[] = JSON.parse(content, (key, value) =>
      'end' === key || 'start' === key ? parseISO(value) : value,
    )
    return [date, tasks]
  }
}
