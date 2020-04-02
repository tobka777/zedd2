import { observable } from 'mobx'
import { serializable, raw, list, primitive, deserialize, serialize } from 'serializr'
import { promises as fsp } from 'fs'

export class ZeddSettings {
  constructor(fromFile?: string) {
    this.fromFile = fromFile!
  }

  public static async readFromFile(file: string): Promise<ZeddSettings> {
    const settings = deserialize(ZeddSettings, JSON.parse(await fsp.readFile(file, 'utf8')))
    settings.fromFile = file
    return settings
  }

  public async saveToFile(file: string = this.fromFile) {
    return fsp.writeFile(file, JSON.stringify(serialize(this), undefined, '  '), 'utf8')
  }

  private fromFile: string

  /**
   * regular worktimes. used for sick/holidays
   * format: [mondayHours, tuesdayHours, ...]
   *
   */
  @observable
  @serializable(raw())
  public workmask = [8, 8, 8, 8, 8, 0, 0]

  /**
   * first hour of the calendar by default, as well as start hour for holidays etc
   *
   */
  @observable
  @serializable(raw())
  public startHour = 8

  /**
   * define clarity projects whoses tasks should not be imported
   * function will be called with project names, returning true
   * will lead to the project being excluded
   *
   */
  @observable
  @serializable(list(primitive()))
  public excludeProjects = [] as string[]

  /**
   * int-id of the clarity-task to be used for holidays
   *
   */
  @observable
  @serializable(raw())
  public urlaubClarityTaskIntId: number | undefined

  /**
   * Name of the ERSATZ Task (not in Clarity!) You can configure the
   * Clarity-Account in the app.
   */
  @observable
  @serializable(raw())
  public ersatzTask = 'ERSATZ'

  /**
   * Link to clarity. Everything before the '#'.
   */
  @observable
  @serializable(raw())
  public nikuLink = ''

  /**
   * mininum user idle time in minutes which counts as "user is away"
   */
  @observable
  @serializable
  public minIdleTimeMin = 15

  @observable
  @serializable(raw())
  public cgJira = {
    // Everything *before* 'secure/Dashboard.jspa'.
    url: '',
    username: '',
    password: '',
    currentIssuesJql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',

    // updated automatically by the app
    keys: [],
  }

  @observable
  @serializable
  public keepHovering = true

  @serializable
  public updateServer = 'https://hazel-peach.now.sh'
}
