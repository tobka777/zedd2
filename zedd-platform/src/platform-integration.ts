import { PlatformExportFormat, Task } from './model'
import { PlatformOptions } from './model/platform.options.model'
import { $x, checkPlatformUrl } from './utils'
import puppeteer, { Browser, ElementHandle, Page } from 'puppeteer'

export abstract class PlatformIntegration {
  protected browser?: Browser
  protected page!: Page
  protected platformLink: string
  protected options: PlatformOptions
  private closeTimer?: ReturnType<typeof setTimeout>

  protected constructor(platformLink: string, options: PlatformOptions) {
    this.platformLink = platformLink
    this.options = options
  }

  async init() {
    checkPlatformUrl(this.platformLink)
    await this.quitBrowser()
    const browser = await puppeteer.launch({
      headless: this.options.headless,
      executablePath: this.options.executablePath,
      args: [`--window-size=${window.screen.availWidth},${window.screen.availHeight}`],
      defaultViewport: {
        width: Math.round(window.screen.availWidth),
        height: Math.round(window.screen.availHeight * 0.9),
      },
    })
    this.browser = browser
    this.closeTimer = setTimeout(async () => {
      // only close the browser of this run, not one launched by a later run
      if (this.browser !== browser) return
      console.error('Timeout: Browser closed after 10 minutes.')
      await this.quitBrowser()
    }, 600_000)

    this.page = await browser.newPage()
    this.page.setDefaultTimeout(100_000)

    await this.page.goto(this.platformLink)
  }

  /**
   * Loads the tasks available on the platform and maps them to the internal task model.
   *
   * @param notifyTasks - optional callback, invoked with the loaded tasks before the method returns.
   * @returns the list of tasks found on the platform.
   */
  abstract importTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]>

  /**
   * Writes the given work entries to the platform's timesheet, entry by entry.
   *
   * @param data - the work entries to export, each value the entries for that day.
   * @param submitTimesheets - whether to submit the timesheet for approval afterwards
   */
  abstract exportTasks(data: PlatformExportFormat, submitTimesheets: boolean): Promise<void>

  /**
   * Closes the browser of the current run, if any. Safe to call multiple times.
   */
  async quitBrowser(): Promise<void> {
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
    const browser = this.browser
    this.browser = undefined
    if (browser) {
      await browser.close()
    }
  }

  protected async clickElementWithContent(expression: string) {
    const [node] = await $x(this.page, expression)

    if (node) {
      const button = node as unknown as ElementHandle<Element>
      await button.click()
      return button
    }

    return null
  }

  protected async sleep(seconds: number) {
    await new Promise((f) => setTimeout(f, seconds * 1000))
  }
}
