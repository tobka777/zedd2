import { PlatformExportFormat, Task } from './model'
import { PlatformOptions } from './model/platform.options.model'
import { $x, checkPlatformUrl } from './utils'
import puppeteer, { Browser, ElementHandle, Page } from 'puppeteer'
import { execFileSync } from 'child_process'

const BROWSER_CLOSE_TIMEOUT_MS = 5_000

/**
 * Kills the Chrome launched by puppeteer for this browser, including its child processes. Only
 * goes by the pid of the process puppeteer started, and only while it is still running, so other
 * Chrome instances of the user are never affected.
 */
function killBrowserProcess(browser: Browser) {
  const proc = browser.process()
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      // puppeteer starts Chrome as leader of its own process group
      process.kill(-proc.pid, 'SIGKILL')
    }
  } catch (e) {
    console.error('Could not kill browser process', e)
  }
}

/**
 * Closes the browser, and kills its process if closing fails or doesn't finish in time.
 */
async function closeOrKillBrowser(browser: Browser) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), BROWSER_CLOSE_TIMEOUT_MS)
  })
  try {
    if ('timeout' === (await Promise.race([browser.close(), timeout]))) {
      console.error('Browser did not close in time, killing it.')
      killBrowserProcess(browser)
    }
  } catch (e) {
    console.error('Could not close browser, killing it.', e)
    killBrowserProcess(browser)
  } finally {
    clearTimeout(timer)
  }
}

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
      await closeOrKillBrowser(browser)
    }
  }

  /**
   * Kills the browser of the current run right away, for when zedd is closing and can't wait for
   * {@link quitBrowser}.
   */
  killBrowser(): void {
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
    const browser = this.browser
    this.browser = undefined
    if (browser) {
      killBrowserProcess(browser)
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
