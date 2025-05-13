import puppeteer, { Browser, ElementHandle, Page } from 'puppeteer'
import { Task } from './model/task.model'
import { PlatformOptions } from './model/platform.options.model'
import { checkPlatformUrl } from './utils'
import { isAfter, isBefore, isWithinInterval, min as dateMin, parse, parseISO } from 'date-fns'
import { PlatformExportFormat } from './model'
import partition from 'lodash/partition'
import { enGB } from 'date-fns/locale'

let browser: Browser
let page: Page

export async function importOTTTasks(
  ottLink: string,
  options: PlatformOptions,
  notifyTasks?: (p: Task[]) => void,
): Promise<Task[]> {
  checkPlatformUrl(ottLink)
  browser = await puppeteer.launch({
    headless: options.headless,
    executablePath: options.executablePath,
  })
  setTimeout(async () => {
    console.error('Timeout: Browser closed after 10 minutes.')
    await ottQuit()
  }, 600_000)

  page = await browser.newPage()
  page.setDefaultTimeout(100_000)

  await page.goto(ottLink)

  await page.waitForSelector('[role="table"]')

  await page.setRequestInterception(true)

  await clickAllAssigned(page)

  page.on('request', (req) => {
    req.continue()
  })
  return new Promise<Task[]>((resolve, reject) => {
    page.on('response', async (res) => {
      try {
        if ((await res.text()).includes('assignedIssues')) {
          const jsonResponse = await res.json()

          if (jsonResponse && Array.isArray(jsonResponse.data)) {
            const tasks = getTasksFromJson(jsonResponse)
            notifyTasks && notifyTasks(tasks)
            await browser.close()
            resolve(tasks) // Resolving the promise with the tasks
          }
        }
      } catch (error) {
        console.error('Error parsing JSON:', error)
        await browser.close()
        reject(error) // Rejecting the promise if there is an error
      }
    })
  })
}

function getTasksFromJson(jsonResponse: any): Task[] {
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

export async function fillOTT(
  nikuLink: string,
  data: PlatformExportFormat,
  submitTimesheets: boolean,
): Promise<void> {
  return exportToOTT(data, submitTimesheets, nikuLink)
}

async function clickElementWithContent(page: Page, expression: string) {
  const [node] = await page.$x(expression)

  if (node) {
    const button = node as unknown as ElementHandle<Element>
    await button.click()
    return button
  }

  return null
}

export async function exportToOTT(
  whatt: PlatformExportFormat,
  submitTimesheets: boolean,
  ottLink: string,
) {
  let what = Object.keys(whatt).map((dateString: string) => ({
    day: parseISO(dateString),
    work: whatt[dateString],
  }))

  const browser = await puppeteer.launch({
    headless: false,
    args: [`--window-size=${window.screen.availWidth},${window.screen.availHeight}`],
    defaultViewport: {
      width: window.screen.availWidth,
      height: window.screen.availHeight,
    },
  })
  const page = await browser.newPage()

  await page.goto(ottLink)

  while (what.length > 0) {
    await page.waitForSelector('[role="table"]')

    const minDate = dateMin(what.map((w) => w.day))

    const minDateAlsMonthYear = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(minDate)

    await chooseDateFromCalendar(page, minDateAlsMonthYear, minDate)

    const timerange = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span.MuiButton-label'))
      const regex = /^[A-Z][a-z]{2,8} \d{2} \d{4} - [A-Z][a-z]{2,8} \d{2} \d{4}$/
      const range = spans.find((span) => regex.test(span.textContent?.trim() || ''))
      return range!.textContent!.trim()
    })

    const finaliseBtnHandleNode = await page.waitForXPath(
      "//button[.//span[contains(text(), 'Finalise')]]",
    )
    const finaliseBtnHandle = finaliseBtnHandleNode as unknown as HTMLButtonElement
    const isDisabled = await page.evaluate((el) => el.disabled, finaliseBtnHandle)
    if (isDisabled) {
      throw new Error('Finalise button is disabled in period ' + timerange)
    }

    await clickAllAssigned(page)

    await clickElementWithContent(
      page,
      "//span[contains(@class, 'MuiButton-label') and contains(text(), 'Collapse all')]",
    )

    const [start, end] = timerange
      .split(' - ')
      .map((ds) => parse(ds.trim(), 'MMM dd yyyy', new Date(), { locale: enGB }))

    const [relevant, others] = partition(what, (w) => isWithinInterval(w.day, { start, end }))

    let addNewTaskInput = await page.waitForSelector("input[placeholder*='Add new task']")

    for (let i = 0; i < relevant.length; i++) {
      for (let j = 0; j < relevant[i].work.length; j++) {
        addNewTaskInput = await page.waitForSelector("input[placeholder*='Add new task']")
        await addNewTaskInput!.type(relevant[i].work[j].taskName)

        await clickElementWithContent(
          page,
          "//li[contains(@role, 'option') and contains(text(), '" +
            relevant[i].work[j].taskName +
            "')]",
        )

        const [rowWithSearchedTaskNode] = await page.$x(
          "//tr[.//div[text()='" + relevant[i].work[j].taskName + "']]",
        )

        const cellDayInRow = relevant[i].day.getDate() - start.getDate()

        const tdHandles = await rowWithSearchedTaskNode.$$('td.wlbc_bydate')

        await tdHandles[cellDayInRow].click()
        await tdHandles[cellDayInRow].type(String(relevant[i].work[j].hours))

        await page.mouse.click(0, 0)

        if (relevant[i].work[j].comment) {
          const day = relevant[i].day
          const dayNumber = String(day.getDate()).padStart(2, '0')
          const weekday = day.toLocaleString('en-US', { weekday: 'short' })

          const dayInHeader = await clickElementWithContent(
            page,
            `//th[@role='columnheader' and contains(@class, 'wlh_date') and .//div[text()='${dayNumber}'] and .//div[text()='${weekday}']]`,
          )

          const commentTextBox = await page.waitForSelector('textarea[placeholder="Comment"]')
          commentTextBox?.type(relevant[i].work[j].comment as string)
          await dayInHeader?.click()
        }
      }
    }

    what = others

    const checkbox = await page.waitForSelector('th.wlh_checkbox input[type="checkbox"]')
    await checkbox?.click()

    await clickElementWithContent(page, "//button[.//span[contains(text(), 'Delete')]]")

    const timeEntriesDialog = await page.waitForSelector('div[role="dialog"]')

    let reasonDialog = await timeEntriesDialog!.waitForSelector(
      'textarea[placeholder="Please provide a reason"]',
    )
    await reasonDialog?.type('Korrektur')
    await clickElementWithContent(page, "//button[.//span[text()='Yes, Continue']]")
    await page.waitForSelector('div[role="dialog"]', { hidden: true })
  }

  if (submitTimesheets) {
    await clickElementWithContent(page, "//button[.//span[contains(text(), 'Finalise')]]")
    await page.waitForXPath("//div[contains(text(), 'FINALISING YOUR TIMESHEET')]")
    await clickElementWithContent(page, "//button[.//span[text()='Yes, Continue']]")
    await page.waitForXPath("//div[contains(text(), 'FINALISING YOUR TIMESHEET')]", {
      hidden: true,
    })
  }
}

export async function ottQuit() {
  if (browser) {
    browser.close()
  }
}

async function clickAllAssigned(page: Page) {
  const isClickable = await clickElementWithContent(
    page,
    "//div[@role='button' and contains(text(), 'Started & ended in selected period')]",
  )

  if (isClickable) {
    const dropdownOptions = await page.waitForSelector('ul[role="listbox"]')

    const allAssigned = await dropdownOptions?.waitForSelector('li[data-value="All"]')
    await allAssigned!.click()

    await page.waitForSelector('[role="table"]')
  }
}

async function chooseDateFromCalendar(page: Page, minDateAlsMonthYear: string, minDate: Date) {
  const calendarRangeDateNode = await page.evaluateHandle(() => {
    const spans = Array.from(document.querySelectorAll('span.MuiButton-label'))
    const regex = /^[A-Z][a-z]{2,8} \d{2} \d{4} - [A-Z][a-z]{2,8} \d{2} \d{4}$/
    return spans.find((span) => regex.test(span.textContent!.trim()))
  })

  const calendarRangeDate = calendarRangeDateNode as unknown as ElementHandle<Element>
  await calendarRangeDate.click()

  const calendarMainWindow = await page.waitForSelector('.DayPicker-wrapper')
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

  await page.mouse.click(0, 0)
  await page.waitForSelector('.DayPicker-wrapper', { hidden: true })
}
