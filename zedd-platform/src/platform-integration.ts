import { PlatformExportFormat, Task } from './model'
import { PlatformOptions } from './model/platform.options.model'
import { checkPlatformUrl } from './utils'
import puppeteer, { Browser, ElementHandle, Page } from 'puppeteer'
import { TaskActivity } from './model/task-activity.model'

export abstract class PlatformIntegration {
  protected browser!: Browser
  protected page!: Page
  protected taskActivities: TaskActivity[] = []

  protected constructor() {}

  async init(platformLink: string, options: PlatformOptions) {
    checkPlatformUrl(platformLink)
    this.browser = await puppeteer.launch({
      headless: options.headless,
      executablePath: options.executablePath,
      args: [`--window-size=${window.screen.availWidth},${window.screen.availHeight}`],
      defaultViewport: {
        width: Math.round(window.screen.availWidth),
        height: Math.round(window.screen.availHeight * 0.9),
      },
    })
    setTimeout(async () => {
      console.error('Timeout: Browser closed after 10 minutes.')
      await this.quitBrowser()
    }, 600_000)

    this.page = await this.browser.newPage()
    this.page.setDefaultTimeout(100_000)

    await this.page.goto(platformLink)
  }

  abstract importTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]>

  abstract exportTasks(data: PlatformExportFormat, submitTimesheets: boolean): Promise<void>

  abstract quitBrowser(): Promise<void>

  protected async clickElementWithContent(expression: string) {
    const [node] = await this.page.$x(expression)

    if (node) {
      const button = node as unknown as ElementHandle<Element>
      await button.click()
      return button
    }

    return null
  }

  public getActivityOptions() {
    return this.taskActivities
  }
}
