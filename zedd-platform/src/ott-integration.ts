import puppeteer, {Browser, ElementHandle, Page} from 'puppeteer'
import {Task} from './model/task.model'
import {PlatformOptions} from './model/platform.options.model'
import {checkPlatformUrl} from './utils'
import {isAfter, isBefore, isWithinInterval, min as dateMin, parse, parseISO} from 'date-fns'
import {PlatformExportFormat} from './model'
import {enGB} from 'date-fns/locale'
import partition from 'lodash/partition'

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
  options: PlatformOptions,
): Promise<void> {
  return exportToOTT(data, submitTimesheets, nikuLink, options)
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

interface What {
  day: Date
  work: WorkEntry[]
}

async function deleteAllTasks(page: Page) {
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

async function addNewTask(page: Page, work: WorkEntry, startWeek: Date, taskDay: Date) {
  let addNewTaskInput = await page.waitForSelector("input[placeholder*='Add new task']")
  await addNewTaskInput!.type(work.taskName)

  await clickElementWithContent(
    page,
    "//li[contains(@role, 'option') and contains(text(), '" + work.taskName + "')]",
  )

  let [rowWithSearchedTaskNode] = await page.$x("//tr[.//div[text()='" + work.taskName + "']]")

  const cellDayInRow = taskDay.getDate() - startWeek.getDate()

  const tdHandles = await rowWithSearchedTaskNode.$$('td.wlbc_bydate')

  await page.mouse.click(0, 0)

  await tdHandles[cellDayInRow].click()
  await tdHandles[cellDayInRow].type(String(work.hours))

  await page.mouse.click(0, 0)

  let [rowWithSearchedTaskNodeUpdated] = await page.$x(
    "//tr[.//div[text()='" + work.taskName + "']]",
  )

  await commentTask(work.comment, taskDay, page, rowWithSearchedTaskNodeUpdated)
}

export async function exportToOTT(
  whatt: PlatformExportFormat,
  submitTimesheets: boolean,
  ottLink: string,
  options: PlatformOptions,
) {
  const browser = await puppeteer.launch({
    headless: options.headless,
    executablePath: options.executablePath,
    args: [`--window-size=${window.screen.availWidth},${window.screen.availHeight}`],
    defaultViewport: {
      width: Math.round(window.screen.availWidth),
      height: Math.round(window.screen.availHeight * 0.9),
    },
  })

  const page = await browser.newPage()

  await page.goto(ottLink)

  let what: What[] = Object.keys(whatt).map((dateString: string) => ({
    day: parseISO(dateString),
    work: whatt[dateString],
  }))

  await page.waitForSelector('[role="table"]')

  await checkOneWeek(page)
  await clickAllAssigned(page)

  while (what.length > 0) {
    await page.waitForSelector('[role="table"]')

    await chooseDateFromCalendar(page, what)

    await deleteAllTasks(page)

    const timerange = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span.MuiButton-label'))
      const regex = /^[A-Z][a-z]{2,8} \d{2} \d{4} - [A-Z][a-z]{2,8} \d{2} \d{4}$/
      const range = spans.find((span) => regex.test(span.textContent?.trim() || ''))
      return range!.textContent!.trim()
    })

    await checkFinilisedButton(page, timerange)

    await clickAllAssigned(page)

    await clickElementWithContent(
      page,
      "//span[contains(@class, 'MuiButton-label') and contains(text(), 'Collapse all')]",
    )

    const [start, end] = timerange
      .split(' - ')
      .map((ds) => parse(ds.trim(), 'MMM dd yyyy', new Date(), { locale: enGB }))

    const [relevant, others] = partition(what, (w) => isWithinInterval(w.day, { start, end }))

    for (let i = 0; i < relevant.length; i++) {
      for (let j = 0; j < relevant[i].work.length; j++) {
        await addNewTask(page, relevant[i].work[j], start, relevant[i].day)
      }
    }

    what = others
  }

  await finaliseTimesheet(submitTimesheets, page)
}

export async function ottQuit() {
  if (browser) {
    await browser.close()
  }
}

async function checkOneWeek(page: Page) {
  const periodTypeSelect = await clickElementWithContent(page, "//div[contains(@role, 'button') and contains(text(), 'One month')]");

  if (periodTypeSelect) {
    const dropdownOptions = await page.waitForSelector('ul[role="listbox"]')

    const week = await dropdownOptions?.waitForSelector('li[data-value="week"]')
    await week!.click()
    await page.waitForSelector('[role="table"]')
  }
}

async function clickAllAssigned(page: Page) {
  const [issueFilterElement] = await page.$x("//*[contains(text(), 'Issue Filter')]")

  const issueFilterSelect = (await issueFilterElement.evaluateHandle((el) => {
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

  if (issueFilterSelect) {
    await issueFilterSelect.click()
    const dropdownOptions = await page.waitForSelector('ul[role="listbox"]')

    const allAssigned = await dropdownOptions?.waitForSelector('li[data-value="All"]')
    await allAssigned!.click()

    await page.waitForSelector('[role="table"]')
  }
}

async function chooseDateFromCalendar(page: Page, what: What[]) {
  const minDate = dateMin(what.map((w) => w.day))

  const minDateAlsMonthYear = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(minDate)

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

async function checkFinilisedButton(page: Page, timerange: string) {
  const finaliseBtnHandleNode = await page.waitForXPath(
    "//button[.//span[contains(text(), 'Finalise')]]",
  )
  const finaliseBtnHandle = finaliseBtnHandleNode as unknown as HTMLButtonElement
  const isDisabled = await page.evaluate((el) => el.disabled, finaliseBtnHandle)
  if (isDisabled) {
    throw new Error('Finalise button is disabled in period ' + timerange)
  }
}

async function commentTask(
  comment: string | undefined,
  day: Date,
  page: Page,
  rowWithSearchedTaskNode: ElementHandle<Node>,
) {
  if (comment) {
    const dayNumber = String(day.getDate()).padStart(2, '0')
    const weekday = day.toLocaleString('en-US', { weekday: 'short' })

    const dayInHeader = await clickElementWithContent(
      page,
      `//th[@role='columnheader' and contains(@class, 'wlh_date') and .//div[text()='${dayNumber}'] and .//div[text()='${weekday}']]`,
    )

    const commentTextBox = await rowWithSearchedTaskNode.waitForSelector(
      'textarea[placeholder="Comment"]',
    )
    commentTextBox?.type(comment as string)
    await dayInHeader?.click()
  }
}

async function finaliseTimesheet(submitTimesheets: boolean, page: Page) {
  if (submitTimesheets) {
    await clickElementWithContent(page, "//button[.//span[contains(text(), 'Finalise')]]")
    await page.waitForXPath("//div[contains(text(), 'FINALISING YOUR TIMESHEET')]")
    await clickElementWithContent(page, "//button[.//span[text()='Yes, Continue']]")
    await page.waitForXPath("//div[contains(text(), 'FINALISING YOUR TIMESHEET')]", {
      hidden: true,
    })
  }
}
