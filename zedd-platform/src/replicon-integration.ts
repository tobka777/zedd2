import {PlatformIntegration} from './platform-integration'
import {PlatformOptions} from './model/platform.options.model'
import {PlatformExportFormat, Task, TaskActivity} from './model'
import {ElementHandle, HTTPRequest} from 'puppeteer'
import {What} from './model/what.model'
import {isWithinInterval, min as dateMin, parse, parseISO} from 'date-fns'
import {enGB} from 'date-fns/locale'
import partition from 'lodash/partition'
import {WorkEntry} from './model/work-entry.model'

export class RepliconIntegration extends PlatformIntegration {
  public constructor(platformLink: string, options: PlatformOptions) {
    super(platformLink, options)
  }

  async importTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]> {
    await this.init()
    await this.goToTheTimesheet(true)
    await this.page.waitForSelector('table.dataGrid > tbody[sectiontype="actions"]')
    let taskTable = await this.page.waitForSelector('table.dataGrid')

    const urlTaskPromise = new Promise<string>((resolve) => {
      const onRequest = async (req: HTTPRequest) => {
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

    const addRowButton = await taskTable?.waitForSelector(
      'ul.actionList > li > a[aria-label="Add New TimeLine"]',
    )
    await addRowButton!.click()

    const taskSearchButton = await this.page.waitForSelector('td.timesheetSortableHeader')
    await taskSearchButton?.click()

    await this.clickSearchByCategory()

    const url = await urlTaskPromise

    const [tenant, timesheet] = this.extractTenantAndTimesheet(url)

    const projectJsonResponse = await this.page.evaluate(async (url) => {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      return response.json()
    }, url)

    const tasks = await this.getTasksFromJson(projectJsonResponse, tenant, timesheet)

    notifyTasks && notifyTasks(tasks)
    await this.browser.close()
    return tasks
  }

  async importTaskActivities(
    work: WorkEntry,
    notifyTaskActivities?: (p: TaskActivity[]) => void,
  ): Promise<TaskActivity[]> {
    await this.init()
    await this.goToTheTimesheet(true)
    await this.page.waitForSelector('table.dataGrid > tbody[sectiontype="actions"]')
    await this.addRow()
    await this.page.waitForTimeout(300)
    const taskSearchButton = await this.clickElementWithContent(
      '//span[contains(@class, "taskSelectorSearchByCategoryContainer")]//span[contains(@class, "placeholder") and contains(text(), "Select Project")]',
    )
    const row = await this.chooseTaskFromDropdown(null, taskSearchButton, work)

    const [activitySelectNode] = await row.$x(".//a[contains(., 'Select an Activity')]")
    let activitySelect = activitySelectNode as unknown as ElementHandle<Element>
    if (activitySelect) {
      await activitySelect?.click()
      await this.page.waitForSelector('td.activity > span')

      const taskActivities = await new Promise<TaskActivity[]>((resolve, reject) => {
        this.page.on('response', async (res) => {
          try {
            if ((await res.text()).includes(':activity:')) {
              const jsonResponse = await res.json()

              if (jsonResponse && Array.isArray(jsonResponse.d)) {
                const activityOptions = jsonResponse.d.map((option: TaskActivity) => option)
                await this.browser.close()
                resolve(activityOptions)
              }
            }
          } catch (error) {
            console.error('Error parsing JSON:', error)
            await this.browser.close()
            reject(error)
          }
        })
      })
      notifyTaskActivities && notifyTaskActivities(taskActivities)
      return taskActivities
    }
    throw new Error('No task activities found')
  }

  async exportTasks(whatt: PlatformExportFormat, submitTimesheets: boolean): Promise<void> {
    await this.init()
    await this.goToTheTimesheet(false)

    let what: What[] = Object.keys(whatt).map((dateString: string) => ({
      day: parseISO(dateString),
      work: whatt[dateString],
    }))

    while (what.length > 0) {
      await this.chooseDateFromCalendar(what)
      await this.page.waitForSelector('table.dataGrid')

      await this.clickElementWithContent(
        '(//tbody[@sectiontype="rows"]/tr)[last()]/td[contains(@class, "timesheetSortableHeader")]',
      )

      await this.clickSearchByCategory()

      const timerange = await this.page.$eval('.timesheetPeriod > .timesheetPeriodSelect', (el) =>
        el.innerHTML.trim(),
      )
      const [start, end] = timerange
        .split(' - ')
        .map((ds) => parse(ds.trim(), 'MMMM dd, yyyy', new Date(), { locale: enGB }))

      const [relevant, others] = partition(what, (w) => isWithinInterval(w.day, { start, end }))
      await this.clearAllTasks()
      await this.page.waitForTimeout(3000)
      for (let i = 0; i < relevant.length; i++) {
        for (let j = 0; j < relevant[i].work.length; j++) {
          let work = relevant[i].work[j]
          let row = await this.getRowTaskFromTable(work)
          let taskSearchButton = null
          if (!row) {
            await this.addRow()
            await this.page.waitForTimeout(300)
            taskSearchButton = await this.clickElementWithContent(
              '//span[contains(@class, "taskSelectorSearchByCategoryContainer")]//span[contains(@class, "placeholder") and contains(text(), "Select Project")]',
            )
          }

          await this.addNewTask(row, work, relevant[i].day, taskSearchButton)
        }
      }

      what = others
      await this.finaliseTimesheet(submitTimesheets)
    }
  }

  private async addRow() {
    const prevRows = await this.page.$x('//tbody[@sectiontype="rows"]/tr')

    await this.page.focus('body')
    await this.page.keyboard.down('Control')
    await this.page.keyboard.down('Alt')
    await this.page.keyboard.press('t')
    await this.page.keyboard.up('Alt')
    await this.page.keyboard.up('Control')

    await this.page.waitForFunction(
      (selector, count) => document.querySelectorAll(selector).length > count,
      { timeout: 5000 },
      'tbody[sectiontype="rows"] tr',
      prevRows.length,
    )
  }

  private async goToTheTimesheet(goToFirstNotCompleted: boolean) {
    await this.forceGetTargetSite('home')
    const updatedUrl = this.page.url().replace(/home\/?$/, 'my/timesheet/current')
    await this.page.goto(updatedUrl)
    await this.forceGetTargetSite('timesheet')
    let actions = null
    while (actions === null && goToFirstNotCompleted) {
      try {
        actions = await this.page.waitForSelector('table.dataGrid > tbody[sectiontype="actions"]', {
          timeout: 1000,
        })
      } catch (ex) {
        actions = null
        const nextArrow = await this.page.waitForSelector(
          '.timesheetPeriod > a[aria-label="Next Timesheet"]',
        )
        await nextArrow?.click()
        await this.page.waitForFunction(() => document.readyState === 'complete', {
          timeout: 10000,
        })
      }
    }
  }

  private async clickSearchByCategory() {
    const nodes = await this.page.$x("//span[text()='Search By Category']")

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

  private async forceGetTargetSite(searchedPartInLink: string, timeout = 30000) {
    const start = Date.now()

    while (true) {
      const currentUrl = this.page.url()

      if (currentUrl.includes(searchedPartInLink)) {
        await this.page.waitForFunction(() => document.readyState === 'complete', {
          timeout: 30000,
        })

        return
      }

      if (Date.now() - start > timeout) {
        throw new Error(`Timed out waiting for URL to contain: ${searchedPartInLink}`)
      }

      await this.page.waitForTimeout(300)
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
      'https://eu3.replicon.com/wbs/urn:replicon-tenant:' +
      tenant +
      ':timesheet:' +
      timesheet +
      '/tasks?pj='
    const coreUrlEnd = '&q=&c=100'
    for (let i = 0; i < projectJsonResponse.results.length; i++) {
      let project = projectJsonResponse.results[i].project
      let url = coreUrlStart + project.uri + coreUrlEnd
      const taskJsonResponse = await this.page.evaluate(async (url) => {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        return response.json()
      }, url)
      for (let j = 0; j < taskJsonResponse.results.length; j++) {
        let task: Task = {
          name: project.name,
          intId: project.code,
          projectIntId: taskJsonResponse.results[j].task.uri.split(':task:')[1],
          projectName: project.name,
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

  private async chooseDateFromCalendar(what: What[]) {
    const minDate = dateMin(what.map((w) => w.day))

    const minMonth = (minDate.getMonth() + 1).toString()

    const calendar = await this.page.waitForSelector('.timesheetPeriod')
    await calendar!.click()

    await this.selectElementWithContent(
      '//select[contains(@class, "calendarSelect") and @aria-label="Month"][option]',
      minMonth,
    )
    await this.selectElementWithContent(
      '//select[contains(@class, "calendarSelect") and @aria-label="Year"][option]',
      minDate.getFullYear().toString(),
    )

    let weeks: ElementHandle[] = await this.page!.$$('.periodCalendarBody > .period')

    for (let i = 0; i < weeks.length; i++) {
      const weeksUpdate = await this.page!.$$('.periodCalendarBody > .period')
      const weekEl = weeksUpdate[i]
      const periodValue = await weekEl.evaluate((period) => period.getAttribute('value'))
      const isSelected = await weekEl.evaluate((period) => period.classList.contains('selected'))
      if (!(periodValue && /^\d{4}-\d{2}-\d{2}$/.test(periodValue))) {
        throw new Error('Value date has wrong format')
      }

      const dateFromValue = new Date(periodValue)

      if (isNaN(dateFromValue.getTime())) {
        throw new Error('Date ist incorrect')
      }

      if (minMonth != (dateFromValue.getMonth() + 1).toString()) {
        continue
      }

      const dayElements = await weekEl.$$('.dsday')

      for (const dayEl of dayElements) {
        const day = await dayEl.evaluate((node) => node.innerHTML)

        if (day === minDate.getDate().toString()) {
          if (isSelected) {
            await dayEl.click()
          } else {
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'networkidle0' }),
              await dayEl.click(),
            ])
          }

          return
        }
      }
    }
  }

  private async selectElementWithContent(expression: string, option: string) {
    const [node] = await this.page.$x(expression)

    if (node) {
      const button = node as unknown as ElementHandle<Element>
      await button.select(option)
      return button
    }

    return null
  }

  private async addNewTask(
    row: ElementHandle<Element> | null,
    work: WorkEntry,
    taskDay: Date,
    taskSearchButton: ElementHandle<Element> | null,
  ) {
    row = await this.chooseTaskFromDropdown(row, taskSearchButton, work)

    const [activitySelectNode] = await row.$x(".//a[contains(., 'Select an Activity')]")
    const activitySelect = activitySelectNode as unknown as ElementHandle<Element>
    if (activitySelect) {
      await activitySelect.click()

      await this.page.waitForXPath(
        "//ul[contains(@class, 'divDropdownList')]//a[contains(text(), '" +
          work.taskActivity +
          "')]",
        { visible: true },
      )
      await this.clickElementWithContent(
        "//ul[contains(@class, 'divDropdownList')]//a[contains(text(), '" +
          work.taskActivity +
          "')]",
      )
    }

    await this.fillTaskDay(row, work, taskDay)
    await this.page.keyboard.down('Enter')
    await this.page.keyboard.up('Enter')
  }

  private async chooseTaskFromDropdown(
    row: ElementHandle<Element> | null,
    taskSearchButton: ElementHandle<Element> | null,
    work: WorkEntry,
  ) {
    if (!row) {
      await taskSearchButton!.type(String(work.taskIntId))
      await taskSearchButton!.click()
      await this.chooseTaskFromOptions(
        work.projectName + ' - ',
        'ul.divDropdownList > li.highlighted.hasChild',
      )
      await this.page.waitForSelector('ul.divDropdownList > li.highlighted.hasChild', {
        hidden: true,
        timeout: 5000,
      })
      await taskSearchButton!.type(work.taskCode + ' - ' + work.taskCode)
      await taskSearchButton!.click()
      await this.chooseTaskFromOptions(
        work.taskCode + ' - ' + work.taskCode,
        'ul.divDropdownList > li.highlighted.flatTaskItem',
      )
      await this.page.waitForFunction(
        (projectIntId) => {
          const tbody = document.evaluate(
            '//tbody[@sectiontype="rows"]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement

          return tbody && tbody.innerHTML.includes(projectIntId)
        },
        { timeout: 5000 },
        String(work.taskIntId),
      )
      row = await this.getRowTaskFromTable(work)
    }

    if (!row) {
      throw new Error('No row found')
    }
    return row
  }

  private async chooseTaskFromOptions(searchedText: string, expression: string) {
    while (true) {
      await this.page.keyboard.down('ArrowDown')
      await this.page.keyboard.up('ArrowDown')
      let li = null
      try {
        li = await this.page.waitForSelector(expression, {
          timeout: 1000,
        })
      } catch (e) {
        li = null
      }
      if (li) {
        const code = await li.evaluate((el) => {
          el.classList.remove('highlighted')
          return (el as HTMLElement).innerText
        })

        if (code.includes(searchedText)) {
          await this.page.keyboard.down('Enter')
          await this.page.keyboard.up('Enter')

          break
        }
      }
    }
  }

  private async fillTaskDay(row: ElementHandle<Element>, work: WorkEntry, taskDay: Date) {
    const formattedTaskDay = taskDay.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
    })
    const [weekday, day] = formattedTaskDay.replace(',', '').split(' ')

    const days = await row.$x('//td[contains(@class,"day")]/input')
    let dayFieldNode = null

    for (let dayNode of days) {
      dayFieldNode = dayNode as unknown as ElementHandle<Element>

      let isSearchedRow = await dayFieldNode.evaluate(
        (el, weekday, day) => {
          let arialLabel = el.getAttribute('aria-label')
          return arialLabel && arialLabel.includes(day + ' ' + weekday)
        },
        weekday,
        day,
      )
      if (isSearchedRow) {
        break
      }
    }

    if (!dayFieldNode) {
      throw new Error('No day field with ' + day + ' found')
    }

    const dayField = dayFieldNode as unknown as ElementHandle<Element>
    await dayField.click()
    await dayField.type(String(work.hours))

    await this.commentTask(work.comment, dayField)
  }

  private async getRowTaskFromTable(work: WorkEntry) {
    const rows = await this.page.$x('//tbody[@sectiontype="rows"]/tr')
    for (const rowNode of rows) {
      const row = rowNode as ElementHandle<Element>
      const taskCell = await row.$('.timesheetTaskNameFormat')
      if (!taskCell) continue

      const isMatch = await taskCell.evaluate(
        (el, projectName, taskCode) => {
          const [projectDiv, taskDiv] = el.querySelectorAll('div')
          const projectText = projectDiv?.textContent?.trim() ?? ''
          const taskText = taskDiv?.textContent?.trim().split(' - ')[0] ?? ''
          return projectText.includes(projectName) && taskText === taskCode
        },
        work.projectName,
        work.taskCode,
      )

      if (isMatch) {
        return row
      }
    }

    return null
  }

  private async commentTask(comment: string | undefined, dayField: ElementHandle<Element>) {
    if (comment) {
      dayField = (await this.page.evaluateHandle((el) => {
        while (el && el.parentElement && !el.classList.contains('day')) {
          el = el.parentElement
        }
        return el
      }, dayField)) as ElementHandle<Element>
      if (dayField) {
        const commentPlus = await dayField.waitForSelector(
          '.componentAllocationEntryDetailIndicator > .indicator',
        )
        await commentPlus?.click()
        const textArea = await this.page.waitForSelector('.contextPopup textarea.commentBox', {
          visible: true,
        })
        await textArea?.type(comment)
        const okButton = await this.page.waitForSelector('.contextPopup input#okButton')
        await okButton?.click()
      }
    }
  }

  private async clearAllTasks() {
    const reopenButton = await this.clickElementWithContent('//input[@value="Reopen"]')
    if (reopenButton) {
      await this.page.waitForXPath('//h1[text()="Reopen Timesheet"]')
      const confirmReopenButton = await this.page.waitForSelector(
        'div.buttonRow > input.important[value="Reopen"]',
      )
      await confirmReopenButton?.click()
    }

    const clearAllButton = await this.page.waitForSelector('input.clearall')
    await clearAllButton?.click()
    await this.page.waitForSelector('div[aria-label="Clear Timesheet Data"]')

    const confirmClearButton = await this.page.waitForSelector(
      'input.important[value="Clear Time Entries"]',
    )
    await confirmClearButton?.click()

    await this.page.waitForSelector('div[aria-label="Clear Timesheet Data"]', { visible: false })
  }

  private async finaliseTimesheet(submitTimesheets: boolean) {
    if (submitTimesheets) {
      let submit = await this.clickElementWithContent(
        "//button[contains(text(), 'Submit for Approval')]",
      )
      if (submit) {
        await this.page.waitForXPath(
          "//span[contains(@class, 'statusSubmitting')]/span[contains(@class, 'statusName') and contains(text(), 'Submitting')]",
          {
            hidden: true,
          },
        )
      } else {
        let resubmit = await this.clickElementWithContent(
          "//button[contains(text(), 'Resubmit for Approval')]",
        )
        if (resubmit) {
          await this.page.waitForXPath("//div[contains(@aria-label, 'Resubmit Timesheet')]")
          let confirmResubmitButton = await this.page.waitForSelector(
            'input[value^="Resubmit for Approval"]',
          )
          await confirmResubmitButton?.click()
          await this.page.waitForXPath("//div[contains(@aria-label, 'Resubmit Timesheet')]", {
            hidden: true,
          })
        }
      }
    }
  }

  async quitBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
    }
  }
}
