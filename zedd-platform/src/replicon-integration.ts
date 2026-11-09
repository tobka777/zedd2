import { $x, waitForSelector, waitForTimeout } from './utils'
import { PlatformIntegration } from './platform-integration'
import { PlatformOptions } from './model/platform.options.model'
import { PlatformExportFormat, Task, TaskActivity } from './model'
import { ElementHandle, Request } from 'playwright-core'
import { RepliconApi, RepliconApiResult } from './replicon-api'
import { exportViaApi } from './replicon-api-export'
import { promises as fsp } from 'fs'

/** One call of Replicon's web services, recorded while the user works in the timesheet. */
export interface RepliconRecordedCall {
  time: string
  method: string
  url: string
  requestBody?: string
  status?: number
  responseBody?: string
}

export interface RepliconApiRecording {
  recordedAt: string
  servicesRoot?: string
  timesheetUri?: string
  /** read-only calls zedd made itself, to check that the API works with the browser session */
  probe: Record<string, RepliconApiResult>
  /** calls of the Replicon page while the user worked in it */
  calls: RepliconRecordedCall[]
}

const RECORDED_URL = /\/services\/|\.svc\/|\/wbs\//
/** login and authentication calls may carry passwords or tokens, so they aren't recorded */
const NOT_RECORDED_URL = /login|authentication|security|token|saml|oauth|password/i
const SECRET_FIELD = /("[^"]*(password|token|secret)[^"]*"\s*:\s*)"[^"]*"/gi
const redact = (body: string | undefined) => body?.replace(SECRET_FIELD, '$1"***"')
const TIMESHEET_URI = /urn:replicon-tenant:[^:"\/]+:timesheet:[0-9a-zA-Z-]+/
const MAX_BODY_LENGTH = 50_000
/** time the user has for the login (SSO, SAML, 2FA), like OTT waits for its table */
const LOGIN_TIMEOUT_MS = 5 * 60_000

export class RepliconIntegration extends PlatformIntegration {
  /** zedd only talks to and records Replicon's own hosts */
  protected isRepliconHost = (host: string) => host.endsWith('.replicon.com')

  public constructor(platformLink: string, options: PlatformOptions) {
    super(platformLink, options)
  }

  async importTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]> {
    await this.init()
    const timesheetUri = this.watchTimesheetUri()
    await this.goToTheTimesheet(true)
    await waitForSelector(this.page, 'table.dataGrid > tbody[sectiontype="actions"]')

    const projects = await this.fetchProjects(await this.waitFor(timesheetUri, 10_000))
    const tasks = await this.getTasksFromJson(projects.json, projects.tenant, projects.timesheet)

    notifyTasks && notifyTasks(tasks)
    await this.quitBrowser()
    return tasks
  }

  /**
   * Loads the projects of the timesheet from the URL the task search of the page uses. Requests it
   * directly; only if that fails, the task search is opened in the page to find the URL.
   */
  private async fetchProjects(
    timesheetUri: string | undefined,
  ): Promise<{ json: any; tenant: string; timesheet: string }> {
    if (timesheetUri) {
      const url = `${new URL(this.page.url()).origin}/wbs/${timesheetUri}/projects?q=&c=100`
      const json = await this.getJson(url).catch(() => undefined)
      if (Array.isArray(json?.results)) {
        const [tenant, timesheet] = this.extractTenantAndTimesheet(url)
        return { json, tenant, timesheet }
      }
      console.warn('[Replicon] projects not available directly, opening the task search')
    }

    const urlTaskPromise = new Promise<string>((resolve) => {
      const onRequest = (req: Request) => {
        const url = req.url()
        if (
          url.includes('replicon-tenant') &&
          url.includes('timesheet') &&
          url.includes('projects')
        ) {
          this.page.off('request', onRequest)
          resolve(url)
        }
      }
      this.page.on('request', onRequest)
    })

    const taskTable = await waitForSelector(this.page, 'table.dataGrid')
    const addRowButton = await waitForSelector(
      taskTable!,
      'ul.actionList > li > a[aria-label="Add New TimeLine"]',
    )
    await addRowButton!.click()
    const taskSearchButton = await waitForSelector(this.page, 'td.timesheetSortableHeader')
    await taskSearchButton?.click()
    await this.clickSearchByCategory()

    const url = await urlTaskPromise
    const [tenant, timesheet] = this.extractTenantAndTimesheet(url)
    return { json: await this.getJson(url), tenant, timesheet }
  }

  private getJson(url: string): Promise<any> {
    return this.page.evaluate(async (url) => {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      return response.json()
    }, url)
  }

  /**
   * This method returns all activities related to given tasks from Replicon.
   *
   * @param notifyTaskActivities an optional callback, after loading.
   * @returns Promise with found task activities.
   * @throws Error, if no activities are found, failure to parse JSON.
   *
   */
  async importTaskActivities(
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

  /**
   * Records the web service calls of the Replicon page, to learn the payloads for an API-based
   * export. Opens the current timesheet in a visible Edge, checks read-only that the services work
   * with the browser session, then records every call while the user works in the timesheet (e.g.
   * reopen, enter time, submit), until the user closes the Edge window. Nothing is changed by zedd.
   * Request headers (cookies, tokens) are not recorded.
   *
   * @param outFile - JSON file the recording is written to, also while recording
   */
  async recordApiCalls(outFile: string): Promise<RepliconApiRecording> {
    await this.init(false)
    // subscribed right away, so closing the window early isn't missed
    const pageClosed = new Promise<void>((resolve) => this.page.once('close', () => resolve()))
    const recording: RepliconApiRecording = {
      recordedAt: new Date().toISOString(),
      probe: {},
      calls: [],
    }
    const save = () =>
      fsp
        .writeFile(outFile, JSON.stringify(recording, undefined, 2), 'utf8')
        .catch((e) => console.error('Could not save Replicon API recording', e))

    this.page.on('response', async (response) => {
      const request = response.request()
      const url = new URL(request.url())
      if (
        !this.isRepliconHost(url.hostname) ||
        !RECORDED_URL.test(request.url()) ||
        NOT_RECORDED_URL.test(url.pathname)
      ) {
        return
      }
      const call: RepliconRecordedCall = {
        time: new Date().toISOString(),
        method: request.method(),
        url: request.url(),
        requestBody: redact(request.postData()?.slice(0, MAX_BODY_LENGTH) ?? undefined),
        status: response.status(),
      }
      call.responseBody = await response
        .text()
        .then((text) => redact(text.slice(0, MAX_BODY_LENGTH)))
        .catch(() => undefined)
      recording.timesheetUri ??= [call.url, call.requestBody, call.responseBody]
        .map((s) => s && TIMESHEET_URI.exec(s)?.[0])
        .find(Boolean)
      recording.calls.push(call)
      await save()
    })

    try {
      await this.goToTheTimesheet(false)
    } catch (e) {
      // e.g. the login didn't finish in time; the user can still navigate there themselves
      console.error('Could not open the Replicon timesheet', e)
    }
    // give the page time for its own calls, which reveal the timesheet URI
    await this.sleep(5).catch(() => undefined)

    try {
      const api = new RepliconApi(this.page, this.isRepliconHost)
      recording.servicesRoot = api.servicesRoot
      if (recording.timesheetUri) {
        for (const operation of [
          'TimesheetService1.svc/GetStandardTimesheet2',
          'TimesheetService1.svc/GetTimesheetSummary',
        ]) {
          recording.probe[operation] = await api.call(operation, {
            timesheetUri: recording.timesheetUri,
          })
        }
      }
    } catch (e) {
      // e.g. the user closed the window early; keep what was recorded so far
      console.error('Replicon API probe failed', e)
    }
    await save()

    // record until the user closes the window (or the browser is closed after 10 minutes)
    await pageClosed
    await save()
    await this.quitBrowser()
    return recording
  }

  /**
   * Exports through Replicon's web services (see exportViaApi), with the browser only used for the
   * SSO login: the existing entries of the exported days are replaced.
   */
  async exportTasks(data: PlatformExportFormat, submitTimesheets: boolean): Promise<void> {
    if (Object.keys(data).length === 0) return
    await this.init()
    const timesheetUri = this.watchTimesheetUri()
    await this.goToTheTimesheet(false)
    const currentTimesheetUri = await this.waitFor(timesheetUri, 15_000)
    if (!currentTimesheetUri) {
      throw new Error('Could not find the Replicon timesheet after the login.')
    }
    await exportViaApi(
      new RepliconApi(this.page, this.isRepliconHost),
      currentTimesheetUri,
      data,
      submitTimesheets,
    )
  }

  /**
   * Remembers the first timesheet URI the Replicon page uses in its requests.
   */
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
    // Replicon shows its home page once the user is logged in
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

  private async clickSearchByCategory() {
    const nodes = await $x(this.page, "//span[text()='Search By Category']")

    for (let i = 0; i < nodes.length; i++) {
      const button = nodes[i] as unknown as ElementHandle<Element>

      const targetNodeHandle = await this.page.evaluate((el) => {
        let current: Element | null = el

        while (
          current &&
          current.parentElement &&
          current.tagName.toLowerCase() !== 'task-selector-navigation-bar'
        ) {
          if (
            current.classList.contains('searchByCategory') &&
            current.classList.contains('active')
          ) {
            return null
          }
          current = current.parentElement
        }

        if (
          current?.getAttribute &&
          current
            .getAttribute('params')
            ?.includes('currentTab: params.navigationBarParams.currentTab')
        ) {
          return current as Element
        }

        return null
      }, button)

      if (targetNodeHandle) {
        await button.click()
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

      // Replicon keeps its login in a session cookie, which Edge drops on close, so its login page
      // comes up on every run. The Microsoft login behind SAML is kept in the persistent profile,
      // so continuing with SAML usually signs in without any user interaction.
      if (!samlLoginClicked) {
        samlLoginClicked = await this.clickSamlLoginIfShown()
      }

      await waitForTimeout(300)
    }
  }

  /**
   * Clicks "Sign in with SAML" if the Replicon login page is shown.
   *
   * @returns whether the button was clicked
   */
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
      // the page may navigate while it is checked
      console.warn('[Replicon] could not check for SAML login', e)
      return false
    }
  }

  private extractTenantAndTimesheet(url: string): [string, string] {
    const match = url.match(/urn:replicon-tenant:([^:]+):timesheet:([^/]+)/)
    if (match) {
      const [, tenant, timesheet] = match
      return [tenant, timesheet]
    }
    return ['', '']
  }

  private async getTasksFromJson(projectJsonResponse: any, tenant: string, timesheet: string) {
    let tasks: Task[] = []

    const coreUrlStart =
      new URL(this.page.url()).origin +
      '/wbs/urn:replicon-tenant:' +
      tenant +
      ':timesheet:' +
      timesheet +
      '/tasks?pj='
    const coreUrlEnd = '&q=&c=100'
    for (let i = 0; i < projectJsonResponse.results.length; i++) {
      let project = projectJsonResponse.results[i].project
      let url = coreUrlStart + project.uri + coreUrlEnd
      const taskJsonResponse = await this.getJson(url)
      for (let j = 0; j < taskJsonResponse.results.length; j++) {
        const projectName = project.name.replace(/^"|"$/g, '')
        let task: Task = {
          name: projectName,
          intId: taskJsonResponse.results[j].task.uri.split(':task:')[1],
          projectIntId: project.code,
          projectName: projectName,
          projectUri: project.uri,
          start: undefined,
          end: undefined,
          taskCode: taskJsonResponse.results[j].task.name,
          typ: 'REPLICON',
        }
        tasks.push(task)
      }
    }

    return tasks
  }
}
