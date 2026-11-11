import { PlatformExportFormat, Task } from './model'
import { PlatformOptions } from './model/platform.options.model'
import { checkPlatformUrl } from './utils'
import { BrowserContext, chromium, LaunchOptions, Page } from 'playwright-core'

const BROWSER_CLOSE_TIMEOUT_MS = 10_000

export abstract class PlatformIntegration {
  protected context?: BrowserContext
  protected page!: Page
  protected platformLink: string
  protected options: PlatformOptions
  private closeTimer?: ReturnType<typeof setTimeout>

  protected constructor(platformLink: string, options: PlatformOptions) {
    this.platformLink = platformLink
    this.options = options
  }

  /**
   * @param headless - overrides the headless option, e.g. to show the browser to the user
   */
  async init(headless = this.options.headless) {
    checkPlatformUrl(this.platformLink)
    await this.quitBrowser()
    const context = await this.launchEdge(headless)
    this.context = context
    this.closeTimer = setTimeout(async () => {
      // only close the browser of this run, not one launched by a later run
      if (this.context !== context) return
      console.error('Timeout: Browser closed after 10 minutes.')
      await this.quitBrowser()
    }, 600_000)

    this.page = context.pages()[0] ?? (await context.newPage())
    this.page.setDefaultTimeout(100_000)

    await this.page.goto(this.platformLink)
  }

  /**
   * Starts the installed Microsoft Edge. Edge signs in with the Microsoft work account of the
   * device on its own, so no SSO extension is needed for the 2FA login.
   */
  private async launchEdge(headless: boolean | undefined): Promise<BrowserContext> {
    const { width, height } = this.options.windowSize ?? { width: 1280, height: 900 }
    const viewport = { width: Math.round(width), height: Math.round(height * 0.9) }
    const launchOptions: LaunchOptions = {
      channel: 'msedge',
      // Playwright passes --no-sandbox otherwise, which Edge warns about as unsupported
      chromiumSandbox: true,
      headless,
      args: [`--window-size=${Math.round(width)},${Math.round(height)}`],
    }
    try {
      if (this.options.userDataDir) {
        return await chromium.launchPersistentContext(this.options.userDataDir, {
          ...launchOptions,
          viewport,
        })
      }
      const browser = await chromium.launch(launchOptions)
      return await browser.newContext({ viewport })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (/distribution 'msedge' is not found/i.test(message)) {
        throw new Error(
          'Microsoft Edge is not installed. Please install it: https://www.microsoft.com/edge',
        )
      }
      if (this.options.userDataDir) {
        throw new Error(
          `Could not start Microsoft Edge with the zedd profile (${this.options.userDataDir}). ` +
            'Is an Edge window of a previous import/export still open? Close it and try again.\n' +
            message,
        )
      }
      throw e
    }
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
   * Closes the browser of the current run, if any. Safe to call multiple times. If Edge doesn't close
   * normally, Playwright kills it (only the Edge it started, by its pid).
   */
  async quitBrowser(): Promise<void> {
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
    const context = this.context
    this.context = undefined
    if (context) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), BROWSER_CLOSE_TIMEOUT_MS)
      })
      try {
        // without a persistent profile, closing the context doesn't close the browser
        const close = async () => {
          const browser = context.browser()
          await context.close()
          if (browser?.isConnected()) await browser.close()
        }
        if ('timeout' === (await Promise.race([close(), timeout]))) {
          console.error('Edge did not close in time.')
        }
      } catch (e) {
        console.error('Could not close Edge.', e)
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
