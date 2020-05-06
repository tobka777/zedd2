import { format as formatDate, parseISO } from 'date-fns'
import { promises as fsp } from 'fs'
import { computed, observable } from 'mobx'
import * as path from 'path'
import {
  fillClarity,
  getProjectInfo,
  ClarityExportFormat,
  Task as ZeddClarityTask,
} from 'zedd-clarity'
import './index.css'

import { getLatestFileInDir, mkdirIfNotExists, FILE_DATE_FORMAT } from './util'

export interface ClarityTask extends ZeddClarityTask {
  projectName: string
  projectIntId: string
}

export class ClarityState {
  public nikuLink: string

  public chromeExe: string

  public chromedriverExe: string

  @observable
  private _currentlyImportingTasks = false

  @observable
  private _tasks: ClarityTask[] = []

  @observable
  private _tasksLastUpdated: Date | undefined

  public constructor(public clarityDir: string) {}

  public get currentlyImportingTasks() {
    return this._currentlyImportingTasks
  }

  get tasks() {
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

  public get tasksLastUpdated() {
    return this._tasksLastUpdated
  }

  public async init() {
    await mkdirIfNotExists(this.clarityDir)
  }

  public async export(clarityExport: ClarityExportFormat, submitTimesheets: boolean) {
    try {
      this._currentlyImportingTasks = true
      await fillClarity(this.nikuLink, clarityExport, submitTimesheets, {
        headless: false,
        chromeExe: this.chromeExe,
        chromedriverExe: this.chromedriverExe,
      })
    } finally {
      this._currentlyImportingTasks = false
    }
  }

  public async importAndSaveClarityTasks(
    excludedProjects: string[],
    toImport: string[] | 'ALL' = 'ALL',
  ): Promise<ClarityTask[]> {
    const importProject = (projectName: string) =>
      'ALL' === toImport || toImport.includes(projectName)
    const importedTasks = await this.importClarityTasks(
      (projectName) => excludedProjects.includes(projectName) || !importProject(projectName),
    )
    const oldTasksNotExcludedAndNotImported = this._tasks.filter(
      ({ projectName }) => !excludedProjects.includes(projectName) && !importProject(projectName),
    )
    this._tasks = [...oldTasksNotExcludedAndNotImported, ...importedTasks]
    await this.saveClarityTasksToFile(this._tasks)
    return this._tasks
  }

  public async loadStateFromFile() {
    ;[this._tasksLastUpdated, this._tasks] = await this.loadClarityTasksFromFile()
  }

  public resolveTask(intId: number | undefined) {
    return intId === undefined ? undefined : this.intIdTaskMap.get(intId)
  }

  public isValidTaskIntId(intId: number | undefined) {
    return this.resolveTask(intId) !== undefined
  }

  private async importClarityTasks(
    excludeProject: (projectName: string) => boolean,
  ): Promise<ClarityTask[]> {
    if (this._currentlyImportingTasks) {
      throw new Error('Already importing')
    }
    try {
      this._currentlyImportingTasks = true
      const projectInfos = await getProjectInfo(
        this.nikuLink,
        {
          downloadDir: path.join(this.clarityDir, 'dl'),
          chromeExe: this.chromeExe,
          chromedriverExe: this.chromedriverExe,
        },
        excludeProject,
      )
      return projectInfos.flatMap(({ tasks, name: projectName, intId: projectIntId }) =>
        tasks.map((task) =>
          Object.assign(
            task,
            {
              projectName,
              projectIntId,
            },
            (task as unknown) as ClarityTask,
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
}
