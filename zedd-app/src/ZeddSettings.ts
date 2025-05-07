import {promises as fsp} from 'fs'
import {makeObservable, observable} from 'mobx'
import {custom, deserialize, list, primitive, raw, serializable, serialize} from 'serializr'

export class ZeddSettings {
  constructor(fromFile?: string) {
    this.fromFile = fromFile!
    makeObservable(this)
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
   * define platform projects whoses tasks should not be imported
   * function will be called with project names, returning true
   * will lead to the project being excluded
   *
   */
  @observable
  @serializable(list(primitive()))
  public excludeProjects = [] as string[]

  /**
   * Name of the ERSATZ Task (not in Platform!) You can configure the
   * Platform-Account in the app.
   */
  @observable
  @serializable(raw())
  public ersatzTask = 'ERSATZ'

  /**
   * Link to platform. Everything before the '#'.
   */
  @observable
  @serializable(raw())
  public nikuLink = ''

  /**
   * Open Chrome / Selenium in headless mode (background)
   */
  @observable
  @serializable
  public chromeHeadless = false

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
    token: '',
    currentIssuesJql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',

    // updated automatically by the app
    keys: [] as string[],
  }

  @observable
  @serializable(raw())
  public jira2 = {
    // Everything *before* 'secure/Dashboard.jspa'.
    url: '',
  }

  @observable
  @serializable
  public keepHovering: boolean | 'vertical' = false

  @serializable(
    custom(
      (x) => x,
      (x) => (x === 'https://hazel-peach.now.sh' ? 'https://hazel-peach.vercel.app/' : x),
    ),
  )
  public updateServer = 'https://hazel-peach.now.sh'

  @observable
  @serializable
  public chromePath: string = ''

  @observable
  @serializable
  public timeFormat: 'hours' | 'bt' = 'hours'

  @observable
  @serializable
  public platformResourceName: string = ''

  @observable
  @serializable(raw())
  public location: { code: string; label: string } | null = { code: '', label: '' }

  @observable
  @serializable(raw())
  public federalState: { code: string; label: string } | null = { code: '', label: '' }
}
