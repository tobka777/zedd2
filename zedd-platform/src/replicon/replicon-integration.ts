import { $x, waitForSelector, waitForTimeout } from '../utils'
import { PlatformIntegration } from '../platform-integration'
import { PlatformOptions } from '../model/platform.options.model'
import { PlatformExportFormat, Task, TaskActivity } from '../model'
import { ElementHandle } from 'playwright-core'
import { RepliconApi } from './replicon-api'
import { exportViaApi } from './replicon-api-export'

const TIMESHEET_URI = /urn:replicon-tenant:[^:"\/]+:timesheet:[0-9a-zA-Z-]+/
const LOGIN_TIMEOUT_MS = 5 * 60_000

export class RepliconIntegration extends PlatformIntegration {
  public constructor(platformLink: string, options: PlatformOptions) {
    super(platformLink, options)
  }
  
  override async importTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]> {
    await this.init()
    const timesheetUri = this.watchTimesheetUri()
    await this.goToTheTimesheet(true)
    await waitForSelector(this.page, 'table.dataGrid > tbody[sectiontype="actions"]')

    const currentTimesheetUri = await this.waitFor(timesheetUri, 10_000)
    const projects = await this.fetchProjects(currentTimesheetUri)
    const tasks = await this.getTasksFromJson(projects, currentTimesheetUri!)

    notifyTasks && notifyTasks(tasks)
    await this.quitBrowser()
    return tasks
  }

  override async exportTasks(data: PlatformExportFormat, submitTimesheets: boolean): Promise<void> {
    if (Object.keys(data).length === 0) return
    await this.init()
    const timesheetUri = this.watchTimesheetUri()
    await this.goToTheTimesheet(false)
    const currentTimesheetUri = await this.waitFor(timesheetUri, 15_000)
    if (!currentTimesheetUri) {
      throw new Error('Could not find the Replicon timesheet after the login.')
    }
    await exportViaApi(new RepliconApi(this.page), currentTimesheetUri, data, submitTimesheets)
  }

  /**
   * This method returns all activities related to given tasks from Replicon.
   *
   * @param notifyTaskActivities an optional callback, after loading.
   * @returns Promise with found task activities.
   * @throws Error, if no activities are found, failure to parse JSON.
   *
   */
  public async importTaskActivities(
    notifyTaskActivities?: (p: TaskActivity[]) => void,
  ): Promise<TaskActivity[]> {
    await this.init()
    await this.goToTheTimesheet(true)

    await this.addRow()
    await waitForTimeout(300)

    const [addRowNode] = await $x(this.page, "//a[contains(., '+ Add Row')]")
    const [activitySelectNode] = await $x(this.page, "//a[contains(., 'Select an Activity')]")
    let addRow = addRowNode as unknown as ElementHandle<Element>
    let activitySelect = activitySelectNode as unknown as ElementHandle<Element>

    if (addRow && !activitySelect) {
      await addRow?.click()
    }

    if (activitySelect) {
      await activitySelect?.click()
      await waitForSelector(this.page, 'td.activity > span')

      const taskActivities = await new Promise<TaskActivity[]>((resolve, reject) => {
        this.page.on('response', async (res) => {
          try {
            if (res.request().method() === 'OPTIONS') return
            const body = await res.text()
            if (!body.includes(':activity:')) return

            const json = JSON.parse(body)
            const activityOptions = Array.isArray(json.d)
              ? json.d.map((option: TaskActivity) => option)
              : []
            await this.quitBrowser()
            resolve(activityOptions)
          } catch (error) {
            console.error('Error parsing JSON:', error)
            await this.quitBrowser()
            reject(error)
          }
        })
      })
      notifyTaskActivities && notifyTaskActivities(taskActivities)
      return taskActivities
    }
    throw new Error('No task activities found')
  }

  private async fetchProjects(timesheetUri: string | undefined): Promise<any> {
    if (!timesheetUri) {
      throw new Error('Could not find the Replicon timesheet after the login.')
    }
    const json = await this.getJson(this.wbsUrl(timesheetUri, 'projects?q=&c=100'))
    if (!Array.isArray(json?.results)) {
      throw new Error('Could not load the projects of the Replicon timesheet.')
    }
    return json
  }

  private async getTasksFromJson(projectJsonResponse: any, timesheetUri: string) {
    const tasks: Task[] = []
    for (const { project } of projectJsonResponse.results) {
      const taskJsonResponse = await this.getJson(
        this.wbsUrl(timesheetUri, `tasks?pj=${project.uri}&q=&c=100`),
      )
      const projectName = project.name.replace(/^"|"$/g, '')
      for (const { task } of taskJsonResponse.results) {
        tasks.push({
          name: projectName,
          intId: task.uri.split(':task:')[1],
          projectIntId: project.code,
          projectName,
          projectUri: project.uri,
          start: undefined,
          end: undefined,
          taskCode: task.name,
          typ: 'REPLICON',
        })
      }
    }
    return tasks
  }

  private wbsUrl(timesheetUri: string, path: string) {
    return `${new URL(this.page.url()).origin}/wbs/${timesheetUri}/${path}`
  }

  private getJson(url: string): Promise<any> {
    return this.page.evaluate(async (url) => {
      const response = await fetch(url)
      return response.json()
    }, url)
  }

  private watchTimesheetUri(): () => string | undefined {
    let uri: string | undefined
    this.page.on('request', (request) => {
      uri ??= [request.url(), request.postData() ?? '']
        .map((s) => TIMESHEET_URI.exec(s)?.[0])
        .find(Boolean)
    })
    return () => uri
  }

  private async waitFor<T>(get: () => T | undefined, timeout: number): Promise<T | undefined> {
    const start = Date.now()
    while (get() === undefined && Date.now() - start < timeout) {
      await waitForTimeout(300)
    }
    return get()
  }

  private async addRow() {
    const prevRows = await $x(this.page, '//tbody[@sectiontype="rows"]/tr')

    await this.page.click('table.dataGrid > tbody[sectiontype="actions"] a#add-new-timeline')

    await this.page.waitForFunction(
      ({ selector, count }) => document.querySelectorAll(selector).length > count,
      { selector: 'tbody[sectiontype="rows"] tr', count: prevRows.length },
      { timeout: 5000 },
    )
  }

  private async goToTheTimesheet(goToFirstNotCompleted: boolean) {
    await this.forceGetTargetSite('home', LOGIN_TIMEOUT_MS).catch(() => {
      throw new Error(
        'The Replicon login was not completed within 5 minutes. Please log in in the Edge window ' +
          "(if 'Open Edge in' is set to Background, switch to Foreground for the login).",
      )
    })
    const updatedUrl = this.page.url().replace(/home\/?$/, 'my/timesheet/current')
    await this.page.goto(updatedUrl)
    await this.forceGetTargetSite('timesheet')
    let actions = null
    while (actions === null && goToFirstNotCompleted) {
      try {
        actions = await waitForSelector(
          this.page,
          'table.dataGrid > tbody[sectiontype="actions"]',
          {
            timeout: 1000,
          },
        )
      } catch (ex) {
        actions = null
        const nextArrow = await waitForSelector(
          this.page,
          '.timesheetPeriod > a[aria-label="Next Timesheet"]',
        )
        await nextArrow?.click()
        await this.page.waitForFunction(() => document.readyState === 'complete', undefined, {
          timeout: 10000,
        })
      }
    }
  }

  private async forceGetTargetSite(searchedPartInLink: string, timeout = 60000) {
    const start = Date.now()
    let samlLoginClicked = false

    while (true) {
      const currentUrl = this.page.url()

      if (currentUrl.includes(searchedPartInLink)) {
        await this.page.waitForFunction(() => document.readyState === 'complete', undefined, {
          timeout: 30000,
        })

        return
      }

      if (Date.now() - start > timeout) {
        throw new Error(`Timed out waiting for URL to contain: ${searchedPartInLink}`)
      }

      if (!samlLoginClicked) {
        samlLoginClicked = await this.clickSamlLoginIfShown()
      }

      await waitForTimeout(300)
    }
  }

  private async clickSamlLoginIfShown(): Promise<boolean> {
    try {
      const candidates = await $x(
        this.page,
        "//*[self::button or self::a or self::input or @role='button']" +
          "[contains(translate(normalize-space(.), 'saml', 'SAML'), 'SAML')" +
          " or contains(translate(@value, 'saml', 'SAML'), 'SAML')]",
      )
      let button
      for (const candidate of candidates) {
        if (await candidate.isVisible()) {
          button = candidate
          break
        }
      }
      if (!button) return false
      console.log('[Replicon] login page shown, continuing with SAML')
      await button.click({ timeout: 5000 })
      return true
    } catch (e) {
      console.warn('[Replicon] could not check for SAML login', e)
      return false
    }
  }
}
