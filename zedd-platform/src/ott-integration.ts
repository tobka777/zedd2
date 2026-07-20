import { ElementHandle } from 'puppeteer'
import { PlatformExportFormat, Task } from './model'
import { PlatformOptions } from './model/platform.options.model'
import { PlatformIntegration } from './platform-integration'
import { isAfter, isBefore, isWithinInterval, min as dateMin, parse, parseISO } from 'date-fns'
import { enGB } from 'date-fns/locale'
import partition from 'lodash/partition'
import { What } from './model/what.model'
import { WorkEntry } from './model/work-entry.model'
import { clearInput } from './utils'

export class OTTIntegration extends PlatformIntegration {
  public constructor(platformLink: string, options: PlatformOptions) {
    super(platformLink, options)
  }

  async importTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]> {
    await this.init()
    await this.page.waitForSelector('[role="table"]')

    await this.page.setRequestInterception(true)

    const [dropdownNode] = await this.page.$x(
      "//div[@role='button' and contains(text(), 'Started & ended in selected period')]",
    )

    const dropdown = dropdownNode as unknown as ElementHandle<Element>
    await dropdown.click()

    const dropdownOptions = await this.page.waitForSelector('ul[role="listbox"]')

    const allAssigned = await dropdownOptions?.waitForSelector('li[data-value="All"]')
    await allAssigned!.click()
    this.page.on('request', (req) => {
      req.continue()
    })
    return new Promise<Task[]>((resolve, reject) => {
      this.page.on('response', async (res) => {
        try {
          if ((await res.text()).includes('assignedIssues')) {
            const jsonResponse = await res.json()

            if (jsonResponse && Array.isArray(jsonResponse.data)) {
              const tasks = this.getTasksFromJson(jsonResponse)
              notifyTasks && notifyTasks(tasks)
              await this.browser.close()
              resolve(tasks) // Resolving the promise with the tasks
            }
          }
        } catch (error) {
          console.error('Error parsing JSON:', error)
          await this.browser.close()
          reject(error) // Rejecting the promise if there is an error
        }
      })
    })
  }

  async exportTasks(whatt: PlatformExportFormat, submitTimesheets: boolean): Promise<void> {
    await this.init()
    let what: What[] = Object.keys(whatt).map((dateString: string) => ({
      day: parseISO(dateString),
      work: whatt[dateString],
    }))

    await this.page.waitForSelector('[role="table"]')

    await this.checkOneWeek()

    await this.clickAllEngagements()

    // nächstes Zeitformular ausfüllen, obwohl ein vorheriges Zeitformular aktuell finalized ist
    let deferredAlreadyFinalizedError: unknown = null
    while (what.length > 0) {
      await this.page.waitForSelector('[role="table"]')

      await this.sleep(1)

      await this.chooseDateFromCalendar(what)

      await this.deleteAllTasks()

      await this.clickAllAssigned()

      const timerange = await this.page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span.MuiButton-label'))
        const regex = /^[A-Z][a-z]{2,8} \d{2} \d{4} - [A-Z][a-z]{2,8} \d{2} \d{4}$/
        const range = spans.find((span) => regex.test(span.textContent?.trim() || ''))
        return range!.textContent!.trim()
      })

      const [start, end] = timerange
        .split(' - ')
        .map((ds) => parse(ds.trim(), 'MMM dd yyyy', new Date(), { locale: enGB }))

      const [relevant, others] = partition(what, (w) => isWithinInterval(w.day, { start, end }))

      try {
        await this.checkFinilisedButton(timerange)
      } catch (err) {
        deferredAlreadyFinalizedError = err
        what = others
        continue
      }

      for (let i = 0; i < relevant.length; i++) {
        for (let j = 0; j < relevant[i].work.length; j++) {
          await this.addNewTask(relevant[i].work[j], start, relevant[i].day)
        }
      }

      what = others
    }

    if (deferredAlreadyFinalizedError) throw deferredAlreadyFinalizedError

    await this.finaliseTimesheet(submitTimesheets)
  }

  private getTasksFromJson(jsonResponse: any): Task[] {
    let tasks: Task[] = []

    for (let i = 0; i < jsonResponse.data[0].assignedIssues.length; i++) {
      let assignedIssue = jsonResponse.data[0].assignedIssues[i]
      let assoBoardProjectCodes = jsonResponse.data[0].assoBoardProjectCodes
      let projectIndex = -1
      for (let j = 0; j < assoBoardProjectCodes.length; j++) {
        if (assoBoardProjectCodes[j].projectCodeId === +assignedIssue.projectCode) {
          projectIndex = j
        }
      }
      let task: Task = {
        name: assignedIssue.title,
        intId: assignedIssue.appointmentId,
        projectIntId: projectIndex > -1 ? assoBoardProjectCodes[projectIndex].gfsProjectCode : null,
        projectName: projectIndex > -1 ? assoBoardProjectCodes[projectIndex].gtmProjectName : null,
        start: undefined,
        end: undefined,
        taskCode: projectIndex > -1 ? assoBoardProjectCodes[projectIndex].gfsTaskCode : null,
        typ: 'OTT',
      }
      tasks.push(task)
    }

    return tasks
  }

  private async deleteAllTasks() {
    await this.clickAllAssigned('bookedInPeriod')
    const checkbox = await this.page.waitForSelector('th.wlh_checkbox input[type="checkbox"]')
    await checkbox?.click()

    const deleteButton = await this.clickElementWithContent(
      "//button[.//span[contains(text(), 'Delete')] and not(@disabled)]",
    )

    if (deleteButton) {
      const timeEntriesDialog = await this.page.waitForSelector('div[role="dialog"]')

      let reasonDialog = await timeEntriesDialog!.waitForSelector(
        'textarea[placeholder="Please provide a reason"]',
      )
      await reasonDialog?.type('Korrektur')
      await this.clickElementWithContent("//button[.//span[text()='Yes, Continue']]")
      await this.page.waitForSelector('div[role="dialog"]', { hidden: true })
    }
  }

  private async addNewTask(work: WorkEntry, startWeek: Date, taskDay: Date) {
    if (work.platformType === 'REPLICON') return
    let addNewTaskInput = await this.page.waitForSelector("input[placeholder*='Search task']")
    const [clearButton] = await this.page.$x(
      "//input[contains(@placeholder, 'Search task')]/../div/button[contains(@title, 'Clear')]",
    )
    await (clearButton as ElementHandle<Element>)!.click()

    await addNewTaskInput!.type(String(work.taskName))

    let rowWithSearchedTaskNode = await this.page.waitForXPath(
      "//tr[.//div[text()='" + work.taskName + "']]",
    )

    if (!rowWithSearchedTaskNode) {
      throw new Error('Task ' + work.taskName + ' konnte nicht gefunden werden.')
      return
    }

    const cellDayInRow = taskDay.getDate() - startWeek.getDate()
    const tdHandles = await rowWithSearchedTaskNode.$$('td.wlbc_bydate')
    const colWithWeekday = tdHandles[cellDayInRow]

    await this.page.mouse.click(0, 0)

    await this.addTimesAndCommentToTask(work, taskDay, colWithWeekday)
  }

  private async clickAllAssigned(value: string = 'All') {
    await this.sleep(2)
    const [issueFilterElement] = (await this.page.$x(
      "//*[contains(text(), 'Issue Filter')]/../../div/div[@role='button']",
    )) as [ElementHandle<Element>]

    if (issueFilterElement) {
      await issueFilterElement.click()
      const dropdownOptions = await this.page.waitForSelector('ul[role="listbox"]')

      const allAssigned = await dropdownOptions?.waitForSelector('li[data-value="' + value + '"]')
      await allAssigned!.click()

      await this.page.waitForSelector('[role="table"]')
    }
  }

  private async clickAllEngagements() {
    const [engagementElement] = await this.page.$x("//*[text() = 'Engagement']")

    const engagementSelect = (await engagementElement.evaluateHandle((el) => {
      let parent: Element | null = el as unknown as Element
      while (parent) {
        const buttonDiv = parent.querySelector('div[role="button"]')
        if (buttonDiv) {
          return buttonDiv
        }
        parent = parent.parentElement
      }
      return null
    })) as ElementHandle<Element>

    if (engagementSelect) {
      await engagementSelect.click()
      const dropdownOptions = await this.page.waitForSelector('ul[role="listbox"]')

      const allAssigned = await dropdownOptions?.waitForSelector('li[title="All"]')
      await allAssigned!.click()

      await this.page.waitForSelector('[role="table"]')
    }
  }

  private async checkOneWeek() {
    const periodTypeSelect = await this.clickElementWithContent(
      "//div[contains(@role, 'button') and contains(text(), 'One month')]",
    )

    if (periodTypeSelect) {
      const dropdownOptions = await this.page.waitForSelector('ul[role="listbox"]')

      const week = await dropdownOptions?.waitForSelector('li[data-value="week"]')
      await week!.click()
      await this.page.waitForSelector('[role="table"]')
    }
  }

  private async chooseDateFromCalendar(what: What[]) {
    const minDate = dateMin(what.map((w) => w.day))

    const minDateAlsMonthYear = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(minDate)

    const calendarRangeDateNode = await this.page.evaluateHandle(() => {
      const spans = Array.from(document.querySelectorAll('span.MuiButton-label'))
      const regex = /^[A-Z][a-z]{2,8} \d{2} \d{4} - [A-Z][a-z]{2,8} \d{2} \d{4}$/
      return spans.find((span) => regex.test(span.textContent!.trim()))
    })

    const calendarRangeDate = calendarRangeDateNode as unknown as ElementHandle<Element>
    await calendarRangeDate.click()

    const calendarMainWindow = await this.page.waitForSelector('.DayPicker-wrapper')
    const minDateAlsMonthYearAlsDate: Date = new Date(minDateAlsMonthYear)
    while (true) {
      let calendarDateMonthYear = (await calendarMainWindow?.$$eval(
        '.DayPicker-Caption > div',
        (elements) => elements.map((el) => el.textContent!.trim())[0],
      )) as string
      let calendarDateMonthAlsDate: Date = new Date(calendarDateMonthYear)
      if (isBefore(minDateAlsMonthYearAlsDate, calendarDateMonthAlsDate)) {
        const prev = await calendarMainWindow!.waitForSelector('span[aria-label="Previous Month"]')
        await prev!.click()
      } else if (isAfter(minDateAlsMonthYearAlsDate, calendarDateMonthAlsDate)) {
        const next = await calendarMainWindow!.waitForSelector('span[aria-label="Next Month"]')
        await next!.click()
      } else {
        break
      }
    }
    const calendarWeeksBody = await calendarMainWindow!.waitForSelector(
      '.DayPicker-Months > .DayPicker-Month > .DayPicker-Body',
    )
    const weeks: ElementHandle[] = await calendarWeeksBody!.$$('.DayPicker-Week')

    for (const weekEl of weeks) {
      const dayElements = await weekEl.$$('.DayPicker-Day')

      for (const dayEl of dayElements) {
        const ariaLabel = await dayEl.evaluate((node) => node.getAttribute('aria-label'))

        if (ariaLabel === minDate.toDateString()) {
          await dayEl.click()
          break
        }
      }
    }

    await this.page.mouse.click(0, 0)
  }

  private async checkFinilisedButton(timerange: string) {
    const finaliseBtnHandleNode = await this.page.waitForXPath(
      "//button[.//span[contains(text(), 'Finalize')]]",
    )
    const finaliseBtnHandle = finaliseBtnHandleNode as unknown as HTMLButtonElement
    const isDisabled = await this.page.evaluate((el) => el.disabled, finaliseBtnHandle)
    if (isDisabled) {
      throw new Error('Finalize button is disabled in period ' + timerange)
    }
  }

  private async addTimesAndCommentToTask(
    work: WorkEntry,
    day: Date,
    colWithWeekday: ElementHandle<HTMLTableCellElement>,
  ) {
    const dayNumber = String(day.getDate()).padStart(2, '0')
    const weekday = day.toLocaleString('en-US', { weekday: 'short' })

    const dayInHeader = await this.clickElementWithContent(
      `//th[@role='columnheader' and contains(@class, 'wlh_date') and .//div[text()='${dayNumber}'] and .//div[text()='${weekday}']]`,
    )

    await colWithWeekday?.click()
    const inputWeekday = await colWithWeekday.$('input')
    await clearInput(inputWeekday)
    await inputWeekday?.type(String(work.hours))

    await this.page.mouse.click(0, 0)

    let [rowWithSearchedTaskNodeUpdated] = await this.page.$x(
      "//tr[.//div[text()='" + work.taskName + "']]",
    )

    let comment = work.comment

    if (comment) {
      const commentTextBox = await rowWithSearchedTaskNodeUpdated.waitForSelector(
        'textarea[placeholder="Comment"]',
      )
      await this.fillTextarea(commentTextBox, String(comment))
      //await commentTextBox?.type(String(comment)) // instabil bei längeren Kommentaren
    }
    await dayInHeader?.click()
  }

  /**
   * AI-generated function to handle textarea onchange events.
   * Alternative for page.type(string) because it is instable for long text i.e. missing characters.
   */
  private async fillTextarea(element: ElementHandle | null, value: string) {
    await element?.evaluate((el, val) => {
      const textarea = el as HTMLTextAreaElement
      textarea.focus()

      // React-safe native setter (relevant für kontrollierte Komponenten)
      const proto = Object.getPrototypeOf(textarea)
      const desc =
        Object.getOwnPropertyDescriptor(proto, 'value') ||
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
      if (desc && desc.set) {
        desc.set!.call(textarea, val)
      } else {
        textarea.value = val
      }

      // Feuere ein InputEvent (mit inputType, hilft bei libs die auf InputEvent prüfen)
      const inputEvt = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        composed: true,
        data: val,
        inputType: 'insertText',
      })
      textarea.dispatchEvent(inputEvt)

      // Manche Frameworks reagieren auf 'change' / 'blur' / keyboard events
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
      textarea.dispatchEvent(new Event('blur', { bubbles: true }))
    }, value)
  }

  private async finaliseTimesheet(submitTimesheets: boolean) {
    if (submitTimesheets) {
      await this.clickElementWithContent("//button[.//span[contains(text(), 'Finalise')]]")
      await this.page.waitForXPath("//div[contains(text(), 'FINALISING YOUR TIMESHEET')]")
      await this.clickElementWithContent("//button[.//span[text()='Yes, Continue']]")
      await this.page.waitForXPath("//div[contains(text(), 'FINALISING YOUR TIMESHEET')]", {
        hidden: true,
      })
    }
  }

  async quitBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
    }
  }
}
