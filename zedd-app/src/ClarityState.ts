import { format as formatDate, parseISO } from 'date-fns'
import { promises as fsp } from 'fs'
import { computed, observable, makeObservable } from 'mobx'
import * as path from 'path'
import {
  fillClarity,
  getProjectInfo,
  ClarityExportFormat,
  Task as ZeddClarityTask,
  Project as ZeddClarityProject,
  webDriverQuit,
} from 'zedd-clarity'
import './index.css'

import { getLatestFileInDir, mkdirIfNotExists, FILE_DATE_FORMAT } from './util'

export interface ClarityTask extends ZeddClarityTask {
  projectName: string
  projectIntId: number
}

export enum ClarityActionType {
  SubmitTimesheet,
  ImportTasks,
}

export class ClarityState {
  public nikuLink: string

  public chromeExe: string

  public chromedriverExe: string

  public chromeHeadless: boolean

  /**
   * The name of the "clarity resource" you are filling out
   * timesheets for, i.e. yourself. this is only required
   * if you have the right ins clarity to fill timesheets for
   * others.
   */
  public resourceName: string | undefined

  @observable
  public error = ''

  @observable
  public success = false

  @observable
  public actionType: ClarityActionType

  @observable
  private _currentlyImportingTasks = false

  @observable
  private _tasks: ClarityTask[] = []

  @observable
  private _tasksLastUpdated: Date | undefined

  public constructor(public clarityDir: string) {
    makeObservable(this)
  }

  public get currentlyImportingTasks(): boolean {
    return this._currentlyImportingTasks
  }

  get tasks(): ClarityTask[] {
    return this._tasks
  }

  @computed
  get intIdTaskMap(): Map<number, ClarityTask> {
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
    await mkdirIfNotExists(this.clarityDir)
  }

  public async export(
    clarityExport: ClarityExportFormat,
    submitTimesheets: boolean,
  ): Promise<void> {
    this.actionType = ClarityActionType.SubmitTimesheet
    console.log('exporting timesheets', clarityExport)
    try {
      this.clearClarityState()
      await fillClarity(this.nikuLink, clarityExport, submitTimesheets, this.resourceName, {
        headless: this.chromeHeadless,
        chromeExe: this.chromeExe,
        chromedriverExe: this.chromedriverExe,
      })
      this.success = true
    } finally {
      this._currentlyImportingTasks = false
    }
  }

  public async importAndSaveClarityTasks(
    excludedProjects: string[],
    toImport: string[] | 'ALL' | 'NEW',
    infoNotify?: (info: string) => void,
  ): Promise<ClarityTask[]> {
    const importProject = (projectName: string) => {
      if (toImport === 'ALL') {
        return true
      } else if (toImport === 'NEW') {
        return !this.projectNames.includes(projectName)
      } else {
        return toImport.includes(projectName)
      }
    }
    await this.importClarityTasks(
      (projectName) => excludedProjects.includes(projectName) || !importProject(projectName),
      (project) => {
        infoNotify &&
          infoNotify(
            'Imported ' + project.tasks.length + ' tasks from project ' + project.name + '.',
          )
        const tasksToKeep = this._tasks.filter(
          ({ projectName }) =>
            !excludedProjects.includes(projectName) && projectName !== project.name,
        )
        this._tasks = [
          ...tasksToKeep,
          ...project.tasks.map((t) => ({
            ...t,
            projectName: project.name,
            projectIntId: project.intId,
          })),
        ]
      },
    )
    await this.saveClarityTasksToFile(this._tasks)
    return this._tasks
  }

  public async loadStateFromFile(): Promise<void> {
    ;[this._tasksLastUpdated, this._tasks] = await this.loadClarityTasksFromFile()
  }

  public resolveTask(intId: number | undefined): undefined | ZeddClarityTask {
    return intId === undefined ? undefined : this.intIdTaskMap.get(intId)
  }

  public isValidTaskIntId(intId: number | undefined): boolean {
    return this.resolveTask(intId) !== undefined
  }

  private clearClarityState() {
    this._currentlyImportingTasks = true
    this.error = ''
    this.success = false
  }

  private async importClarityTasks(
    excludeProject: (projectName: string) => boolean,
    notifyProject?: (p: ZeddClarityProject) => void,
  ): Promise<ClarityTask[]> {
    this.actionType = ClarityActionType.ImportTasks
    if (this._currentlyImportingTasks) {
      throw new Error('Already importing')
    }
    try {
      this.clearClarityState()
      const projectInfos = await getProjectInfo(
        this.nikuLink,
        {
          downloadDir: path.join(this.clarityDir, 'dl'),
          chromeExe: this.chromeExe,
          chromedriverExe: this.chromedriverExe,
          headless: this.chromeHeadless,
        },
        excludeProject,
        notifyProject,
      )
      this.success = true
      return projectInfos.flatMap(({ tasks, name: projectName, intId: projectIntId }) =>
        tasks.map((task) =>
          Object.assign(
            task,
            {
              projectName,
              projectIntId,
            },
            task as unknown as ClarityTask,
          ),
        ),
      )
    } finally {
      this._currentlyImportingTasks = false
    }
  }

  private async saveClarityTasksToFile(tasks: ClarityTask[]) {
    const json = JSON.stringify(tasks, undefined, '  ')
    const newFile = 'tasks_' + formatDate(new Date(), FILE_DATE_FORMAT) + '.json'
    await fsp.writeFile(path.join(this.clarityDir, newFile), json)
    const filesToDelete = (await fsp.readdir(this.clarityDir, { withFileTypes: true })).filter(
      (f) => f.isFile() && f.name !== newFile,
    )
    await Promise.all(filesToDelete.map((f) => fsp.unlink(path.join(this.clarityDir, f.name))))
  }

  private async loadClarityTasksFromFile(): Promise<[Date, ClarityTask[]]> {
    const [file, date] = await getLatestFileInDir(this.clarityDir, /^tasks_(.*)\.json$/)
    const content = await fsp.readFile(path.join(this.clarityDir, file), {
      encoding: 'utf8',
    })
    const tasks: ClarityTask[] = JSON.parse(content, (key, value) =>
      'end' === key || 'start' === key ? parseISO(value) : value,
    )
    return [date, tasks]
  }

  public sileniumKill(): void {
    webDriverQuit(this.chromedriverExe)
  }
}
