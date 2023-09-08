import {
  By,
  until,
  Builder as WebDriverBuilder,
  Capabilities,
  WebDriver,
  WebElement,
  Key,
  WebElementPromise,
} from 'selenium-webdriver'
import * as path from 'path'
import * as url from 'url'
import * as chrome from 'selenium-webdriver/chrome'
import partition from 'lodash/partition'
import uniqBy from 'lodash/uniqBy'
import sleep from 'sleep-promise'
import * as fs from 'fs'
import * as csv from 'fast-csv'
import { promises as fsp } from 'fs'
import deepEqual from 'deep-equal'
import 'selenium-webdriver/lib/atoms/get-attribute'
import 'selenium-webdriver/lib/atoms/is-displayed'
import { homedir } from 'os'
import {
  min as dateMin,
  format,
  parse as parseDate,
  isWithinInterval,
  isSameDay,
  parseISO,
  compareAsc,
  differenceInCalendarDays,
} from 'date-fns'
import { de } from 'date-fns/locale'
import uniq from 'lodash/uniq'

const CONTROL_KEY: string = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL

export class NikuUrlInvalidError extends Error {
  constructor(url: string) {
    super(`url ${JSON.stringify(url)} is not valid`)
  }
}

const logSleep = async (ms: number) => {
  console.warn('sleeping for ' + ((ms / 1000) | 0) + 's')
  await sleep(ms)
}

function checkNikuUrl(urlToCheck: any) {
  if (!urlToCheck) {
    throw new NikuUrlInvalidError(urlToCheck)
  }
  const urlParts = url.parse(urlToCheck)
  if (!urlParts.protocol || !urlParts.host || !urlParts.path) {
    throw new NikuUrlInvalidError(urlToCheck)
  }
}

var chromeDriver: WebDriver

async function makeContext({
  headless = false,
  downloadDir,
  chromeExe,
  chromedriverExe,
}: SeleniumOptions) {
  d('making context headless=' + headless)
  const chromeOptions = new chrome.Options().addArguments('--no-sandbox')
  if (downloadDir) {
    await fsp.mkdir(downloadDir, { recursive: true })
    chromeOptions.setUserPreferences({ 'download.default_directory': downloadDir })
  }
  d(`download.default_directory="${downloadDir}"`)

  if (chromeExe) {
    chromeOptions.setChromeBinaryPath(chromeExe)
  }
  if (headless) {
    chromeOptions.headless()
  }
  const driver = new WebDriverBuilder()
    .setChromeOptions(chromeOptions)
    .setChromeService(new chrome.ServiceBuilder(chromedriverExe))
    .withCapabilities(Capabilities.chrome())
    .build()
  chromeDriver = driver
  await driver.manage().setTimeouts({ implicit: 5000 })

  return wrapDriver(driver)
}
function wrapDriver(driver: WebDriver) {
  function $$(css: string): Promise<WebElement[]>
  function $$(root: WebElement, css: string): Promise<WebElement[]>
  function $$(a: WebElement | string, css?: string) {
    if ('string' === typeof a) {
      return driver.findElements(By.css(a))
    } else {
      return a.findElements(By.css(css!))
    }
  }
  function $(css: string): WebElementPromise
  function $(root: WebElement | undefined, css: string): WebElementPromise
  function $(a: WebElement | string | undefined, css?: string) {
    if ('string' === typeof a) {
      return driver.findElement(By.css(a))
    } else {
      return (a || driver).findElement(By.css(css!))
    }
  }
  return [$, $$, driver] as [typeof $, typeof $$, WebDriver]
}
type Context = ReturnType<typeof wrapDriver>

export async function getProjectInfo(
  nikuLink: string,
  seleniumOptions: SeleniumOptions,
  excludeProject?: (projectName: string) => boolean,
  notifyProject?: (p: Project) => void,
): Promise<Project[]> {
  const downloadDir = seleniumOptions.downloadDir ?? __dirname + '/downloads'
  return withErrorHandling('getProjectInfo', nikuLink, { ...seleniumOptions, downloadDir }, (ctx) =>
    getProjectInfoInternal(nikuLink, ctx, downloadDir, excludeProject, notifyProject),
  )
}
const pageLoad = async ([$, $$, driver]: Context) => {
  // await driver.wait(until.elementIsVisible(await $("#ppm_header_wait")))
  await sleep(200) // give it time to show the loading icon
  await driver.wait(until.elementLocated({ css: '#ppm_header_wait' }))
  await driver.wait(until.elementIsNotVisible(await $('#ppm_header_wait')))
  await sleep(1000)
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}

const urlHashQueryParam = (url: string, p: string) =>
  new URL(new URL(url).hash.replace(/^#/, 'http://example.com?')).searchParams.get(p)

export interface Project {
  name: string
  intId: number
  tasks: Task[]
}
export interface Task {
  sortNo: number
  name: string
  strId?: string
  projectName: string
  intId: number
  start: Date
  end: Date
  openForTimeEntry: boolean
}
async function forceGetSSO(ctx: Context, url: string) {
  const [$, $$, driver] = ctx
  do {
    await driver.get(url)
    await pageLoad(ctx)
  } while (url != (await driver.getCurrentUrl()))
}
async function getProjects(
  ctx: Context,
  nikuLink: string,
  downloadDir: string,
): Promise<Project[]> {
  const [$, $$, driver] = ctx
  d('getting projects')
  await forceGetSSO(ctx, nikuLink + '#action:mainnav.work&classCode=project')
  await driver.wait(until.elementLocated({ css: '.ppm_workspace_title' }))
  await pageLoad(ctx)

  const projects: Project[] = []

  d(' emptying download dir')
  for (const file of await fsp.readdir(downloadDir)) {
    await fsp.unlink(path.join(downloadDir, file))
  }
  d(' clicking on CSV export')
  // read "javascript:" link from the dom and run it manually
  // clicking "options" gear can result in ElementClickInterceptedException, who knows why
  const action = await $('[alt="In CSV exportieren"]').getAttribute('href')
  d('  running csv export action ' + action)
  await driver.executeScript(action.replace(/^javascript:/, ''))
  d('  waiting for new file in downloadDir')
  let files
  do {
    await sleep(1000)
    files = await fsp.readdir(downloadDir)
  } while (files.length == 0)
  const csvPath = path.join(downloadDir, files[0])
  const ilog = (x: any) => (console.log(x), x)
  await new Promise((resolve, reject) =>
    fs
      .createReadStream(csvPath)
      .pipe(
        csv.parse({
          headers: true,
        }),
      )
      .on('data', (row: { [header: string]: string }) => {
        console.log(row)
        const [_, intIdStr, name] = /id=(\d+).*"(.*)"\)/.exec(row['Projekt'])!
        projects.push({
          name: name,
          intId: +intIdStr,
          tasks: [],
        })
      })
      .on('error', reject)
      .on('end', resolve),
  )

  return projects
}

async function getProjectTasks(
  nikuLink: string,
  ctx: Context,
  { name: pName, intId: projectIntId }: Project,
  openForTimeEntry: 'yes' | 'no' | 'all',
  downloadDir: string,
): Promise<Task[]> {
  const [$, $$, driver] = ctx
  const tasks: Task[] = []
  d('get tasks for project ' + pName + ' ' + projectIntId)
  const headerWaitIcon = await $('#ppm_header_wait')
  await driver.get(nikuLink + '#action:projmgr.keyTaskList&id=' + projectIntId)
  await driver.wait(until.elementIsVisible(await $('#ppm_header_wait')))
  await pageLoad(ctx)
  await $('[name=is_open_te]').sendKeys({ all: 'Alle', no: 'Nein', yes: 'Ja' }[openForTimeEntry])
  await $('[name=filter]').click()
  await pageLoad(ctx)
  // const ersteSeiteButton = await $$(
  //   "#grid-content-projmgr\\.odfKeyTaskList .ppm_pagination *[title='Erste Seite']",
  // ).then(bs => bs[0])
  // if (ersteSeiteButton) {
  //   d('clicking ersteSeiteButton')
  //   await ersteSeiteButton.click()
  //   await pageLoad(ctx)
  // }
  d(' emptying download dir')
  for (const file of await fsp.readdir(downloadDir)) {
    await fsp.unlink(path.join(downloadDir, file))
  }
  d(' clicking on CSV export')
  // read "javascript:" link from the dom and run it manually
  // clicking "options" gear can result in ElementClickInterceptedException, who knows why
  const action = await $('[alt="In CSV exportieren"]').getAttribute('href')
  d('  running csv export action ' + action)
  await driver.executeScript(action.replace(/^javascript:/, ''))
  d('  waiting for new file in downloadDir')
  let files
  do {
    await sleep(1000)
    files = await fsp.readdir(downloadDir)
  } while (files.length == 0)
  const csvPath = path.join(downloadDir, files[0])
  const ilog = (x: any) => (console.log(x), x)

  await new Promise((resolve, reject) =>
    fs
      .createReadStream(csvPath)
      .pipe(
        csv.parse({
          headers: (headersFromCsv: csv.ParserHeaderArray) => {
            if (headersFromCsv.filter((h) => h === 'Aufgabe').length === 2) {
              const indexFirstAufgabe = headersFromCsv.indexOf('Aufgabe')
              headersFromCsv[indexFirstAufgabe] = 'AufgabeJaNein'
            }
            return headersFromCsv
          },
        }),
      )
      .on('data', (row: { [header: string]: string }) => {
        if (row['AufgabeJaNein'] === 'Nein') return
        if (row['Für Zeiteintrag geöffnet'] === 'Nein') return
        const [_, intIdStr, name] = /id=(\d+).*"(.*)"\)/.exec(row['Aufgabe'])!
        tasks.push({
          sortNo: +row['PSP-Sortierung'],
          name: name,
          strId: row['ID'],
          intId: +intIdStr,
          projectName: pName,
          start: parseDate(row['Anfang'], 'dd.MM.yy', new Date()),
          end: parseDate(row['Ende'], 'dd.MM.yy', new Date()),
          openForTimeEntry: row['Für Zeiteintrag geöffnet'] == 'Ja',
        })
      })
      .on('error', reject)
      .on('end', resolve),
  )
  await fsp.unlink(csvPath)
  d(`  found ${tasks.length} tasks`)
  return tasks
}
function getPagination(ctx: Context, where?: WebElement) {
  const [$, $$, driver] = ctx
  return $(where, '.ppm_pagination_display_of')
    .then((d) => d && d.getText())
    .then((t) => {
      const [_, fromStr, toStr, ofStr] = t.match(/(\d+)\s*-\s+(\d+)\s*von\s*(\d+) angezeigt/)!
      return {
        from: +fromStr,
        to: +toStr,
        of: +ofStr,
      }
    })
}

function hasClass(e: WebElement, c: string) {
  return e.getAttribute('class').then((classString) => classString.split('\\s+').includes(c))
}

async function getProjectInfoInternal(
  nikuLink: string,
  ctx: Context,
  downloadDir: string,
  excludeProject: (projectName: string) => boolean = () => false,
  notifyProject?: (p: Project) => void,
) {
  const [$, $$, driver] = ctx

  const projects = (await getProjects(ctx, nikuLink, downloadDir)).filter(
    (p) => !excludeProject(p.name),
  )

  const tasks: Task[] = []
  for (const project of projects) {
    project.tasks = await getProjectTasks(nikuLink, ctx, project, 'yes', downloadDir)
    notifyProject && notifyProject(project)
  }

  return projects
}

async function addTasks(
  ctx: Context,
  tasks: Pick<Task, 'projectName' | 'intId' | 'name' | 'strId'>[],
) {
  const [$, $$, driver] = ctx

  const as = await $$('#portlet-table-timeadmin\\.editTimesheet tbody td[column="9"] a')
  const addedIds = await Promise.all(
    as.map((a) => a.getAttribute('href').then((href) => +urlHashQueryParam(href, 'id')!)),
  )
  d('already have tasks with ids ' + addedIds)
  tasks = tasks.filter((t) => !addedIds.includes(t.intId))
  d(`adding ${tasks.length} tasks...`)
  if (tasks.length == 0) {
    return
  }

  await $(`button[onclick*="'timeadmin.timesheetAddTask'"]`).click()
  await pageLoad(ctx)
  await $('select[name=ff_assigned]').sendKeys('Alle')
  await $('select[name=ff_task_status]').sendKeys('Alle')
  for (let i = 0; i < tasks.length; i++) {
    const taskIdInput = await $('input[name=ff_task_id]')
    const taskNameInput = await $('input[name=ff_task_name]')
    const projectNameInput = await $('input[name=ff_project_name]')
    // const projectIdInput = await $('input[name=ff_project_id]')
    const applyFilterButton = await $('button[name=applyFilter]')
    const task = tasks[i]
    await projectNameInput.sendKeys(Key.chord(CONTROL_KEY, 'a'), task.projectName)
    if (task.strId) {
      await taskIdInput.sendKeys(Key.chord(CONTROL_KEY, 'a'), task.strId)
      await taskNameInput.sendKeys(Key.chord(CONTROL_KEY, 'a'), Key.BACK_SPACE)
    } else {
      await taskIdInput.sendKeys(Key.chord(CONTROL_KEY, 'a'), Key.BACK_SPACE)
      await taskNameInput.sendKeys(Key.chord(CONTROL_KEY, 'a'), task.name)
    }
    await applyFilterButton.click()
    await pageLoad(ctx)
    const taskRows = await $$(
      '#ppm-portlet-grid-content-timeadmin\\.selectTimesheetTask tbody table tbody tr',
    )
    d(`found ${taskRows.length} taskRows`)
    for (const tr of taskRows) {
      const taskRowTaskId = +(await $(tr, 'input[name=selitem_id]').getAttribute('value'))
      d('taskRowTaskId', taskRowTaskId)
      if (taskRowTaskId === task.intId) {
        await $(tr, 'input[name=selitem]').click()
        break
      }
    }

    // select thingy
    if (i == tasks.length - 1) {
      await $(`.ppm_button_bar button[onclick*="'timeadmin.addTimesheetTask'"]`).click()
    } else {
      await $(`.ppm_button_bar button[onclick*="'timeadmin.addTimesheetTaskMore'"]`).click()
    }
    await pageLoad(ctx)
  }
  // await sleep(30000)
}

interface WorkEntry {
  projectName: string
  taskName: string
  taskIntId: number
  hours: number
  comment?: string
}
export type ClarityExportFormat = {
  [day: string]: WorkEntry[]
}

async function exportToClarity(
  ctx: Context,
  whatt: ClarityExportFormat,
  submitTimesheets: boolean,
  resourceName: string | undefined,
  nikuLink: string,
): Promise<void> {
  const [$, $$, driver] = ctx
  type ThenArg<T> = T extends Promise<infer U> ? U : T

  let what = Object.keys(whatt).map((dateString: string) => ({
    day: parseISO(dateString),
    work: whatt[dateString],
  }))

  async function getRowInfos(editMode: boolean) {
    const trs = await $$(
      '#portlet-table-timeadmin\\.editTimesheet div.ppm_gridcontent ' +
        '> table > tbody > tr:not(:first-child):not(:last-child)',
    )
    d(`found ${trs.length} trs`)
    return Promise.all(
      trs.map(async (tr) => {
        const projectNameTd = await $(tr, `td[column="${editMode ? 8 : 7}"]`)
        const rowNum = await projectNameTd.getAttribute('rownum')
        const projectName = await $(projectNameTd, 'a').getText()
        const taskNameA = await $(tr, `td[column="${editMode ? 9 : 8}"] a`)
        const taskName = await taskNameA.getText()
        const taskIntId = await taskNameA
          .getAttribute('href')
          .then((href) => +urlHashQueryParam(href, 'id')!)
        const hasComments = await hasClass(
          await $(tr, `td[column="${editMode ? 7 : 6}"] img`),
          'caui-ndeNotes',
        )
        return { rowNum, projectName, taskName, taskIntId, tr, hasComments }
      }),
    )
  }

  type RowInfo = ThenArg<ReturnType<typeof getRowInfos>>[number]

  async function openCommentsDialogAndGetComments(rowInfo: RowInfo) {
    d("  comments aren't empty/empty, opening dialog")
    await $(rowInfo.tr, 'td > a#notes').click()
    await pageLoad(ctx)

    const comments = await Promise.all(
      (
        await $$('#ppm-portlet-grid-content-timeadmin\\.notesBrowser .ppm_gridcontent tbody tr')
      ).map(async (tr) => {
        const checkbox = await $(tr, 'input[type=checkbox]')
        const content = await $(tr, 'td[column="6"]').getText()
        return { checkbox, content }
      }),
    )

    return comments
  }

  async function correctComments(
    relevant: typeof what,
    rowInfo: ThenArg<ReturnType<typeof getRowInfos>>[number],
  ) {
    d('fixing comments for ' + rowInfo.taskName)
    const targetComments: { [dayString: string]: string } = {}
    for (const what of relevant) {
      const dayStr = format(what.day, 'EEEEEE', { locale: de }).toUpperCase()
      const comment = (what.work.find((s) => s.taskIntId == rowInfo.taskIntId) || {}).comment || ''
      targetComments[dayStr] = comment.replace('\r', '').replace('\n', ' ')
    }

    d(targetComments, rowInfo)

    if (!Object.values(targetComments).some((x) => x) && !rowInfo.hasComments) {
      // don't need to do anything
      return
    }
    d("  comments aren't empty/empty, opening dialog")
    await $(rowInfo.tr, 'td[column="7"] a').click()
    await pageLoad(ctx)

    const comments = await Promise.all(
      (
        await $$('#ppm-portlet-grid-content-timeadmin\\.notesBrowser .ppm_gridcontent tbody tr')
      ).map(async (tr) => {
        const checkbox = await $(tr, 'input[type=checkbox]')
        const content = await $(tr, 'td[column="6"]').getText()
        return { checkbox, content }
      }),
    )

    // delete all comments with a [XX] marker
    const [delComments, keepComments] = partition(comments, (c) => /\[.{2}\]/.test(c.content))

    // we want to keep all comments for non-relevant days, so we copy those to targetComments
    const joinedCommentContents = delComments
      .map((c) => c.content.replace('\n', ' ').trim())
      .join(' ')
    for (const commentFromClarity of joinedCommentContents.split(/(?=\[.{2}\])/).filter((x) => x)) {
      d(commentFromClarity)
      const [_, day, comment] = commentFromClarity.match(/\[(.{2})\](.*)/)!
      if (targetComments[day.toUpperCase()] === undefined) {
        // use old comment
        targetComments[day.toUpperCase()] = comment.trim()
      }
    }

    if (delComments.length != 0) {
      await Promise.all(
        delComments.map((c) => {
          d('  selecting for deletion ' + c.content)
          return c.checkbox.click()
        }),
      )

      d('  clicking delete')
      await $(
        `#ppm-portlet-grid-content-timeadmin\\.notesBrowser button[onclick*="'timeadmin.deleteItemsConfirmPopup'"]`,
      ).click()
      await pageLoad(ctx)

      d('    confirming')
      await $(
        `#ppm-portlet-grid-content-timeadmin\\.deleteItemsConfirmPopup button[onclick*="'timeadmin.deleteNotes'"]`,
      ).click()
      await pageLoad(ctx)
    }

    async function addComment(content: string) {
      const noteInput = await $('#portlet-timeadmin\\.notesBrowser textarea[name=note]')
      await noteInput.sendKeys(content)
      const catInput = await $('#portlet-timeadmin\\.notesBrowser input[name=category]')
      await catInput.sendKeys('BOT')
      d('  adding comment ' + content)
      await $(`#portlet-timeadmin\\.notesBrowser button[onclick*="'timeadmin.addNote'"]`).click()

      await pageLoad(ctx)
    }

    // we add all comments as a single clarity-comment, divided by newlines
    const clarityCommentToAdd = Object.keys(targetComments)
      .filter((dayString) => targetComments[dayString])
      .map((dayString) => '[' + dayString + '] ' + targetComments[dayString])
      .join('\n')
    await addComment(clarityCommentToAdd)

    await $('#portlet-timeadmin\\.notesBrowser button[onclick="closeWindow();"]').click()
  }

  async function exportTimesheet(timesheetStartDate: Date, rowInfos: RowInfo[], days: Date[]) {
    d('exporting timesheet starting at ' + formatDayYYYY(timesheetStartDate))
    d('for days ' + days)
    const daysInfo: { day: Date; work: WorkEntry[] }[] = days.map((d) => ({ day: d, work: [] }))
    for (const rowInfo of rowInfos) {
      let comments: string[] = []
      if (rowInfo.hasComments) {
        comments = await openCommentsDialogAndGetComments(rowInfo).then((cs) =>
          cs.map((c) => c.content),
        )
        await $('#portlet-timeadmin\\.notesBrowser button[onclick="closeWindow();"]').click()
      }

      for (const day of days) {
        const dayStr = format(day, 'EEEEEE', { locale: de })
        const dayComment = comments.find((c) => c.startsWith(dayStr + ': '))
        const columnIndex = 13 + differenceInCalendarDays(day, timesheetStartDate)
        const hoursStr = await $(rowInfo.tr, `td[column="${columnIndex}"]`).getText()
        const hours = +hoursStr.replace(',', '.')
        if (hours != 0)
          daysInfo
            .find((di) => di.day == day)!
            .work.push({
              taskIntId: rowInfo.taskIntId,
              taskName: rowInfo.taskName,
              projectName: rowInfo.projectName,
              hours,
              comment: dayComment && dayComment.substring(4),
            })
      }
    }
    return daysInfo
  }

  function formatDayYYYY(d: Date) {
    return format(d, 'dd.MM.yyyy')
  }

  interface What {
    day: Date
    work: WorkEntry[]
  }

  function normalizeWhatArray(ws: What[]) {
    ws.sort((a, b) => compareAsc(a.day, b.day))
    for (const w of ws) {
      w.work.sort((a, b) => a.taskIntId - b.taskIntId)
      for (const y of w.work) {
        y.comment = y.comment || undefined
      }
    }
  }

  function timeSheetDataEqual(a: What[], b: What[]) {
    normalizeWhatArray(a)
    normalizeWhatArray(b)
    return deepEqual(a, b)
  }

  // DEFINITIONS END

  d('submitTimesheets = ' + submitTimesheets)

  while (what.length) {
    d(`${what.length} days left to submit`)
    await forceGetSSO(ctx, nikuLink + '#action:timeadmin.timesheetBrowserReturn')

    // you can get rights to enter data for other people
    // in which case you need to enter the "resource name", i.e. yourself in the
    // corresponding field, so your timesheets are shown
    if (resourceName) {
      await $('input[name=ff_res_name]').sendKeys(Key.chord(CONTROL_KEY, 'a'), resourceName)
      await $('select[name=ff_my_rights]').sendKeys('Alle')
    }

    const minDate = dateMin(what.map((w) => w.day))
    d(`minDate is ${formatDayYYYY(minDate)}`)
    await $('input[name=ff_date_type][value=userdefined]').click()
    await $('input[name=ff_from_date]').sendKeys(
      Key.chord(CONTROL_KEY, 'a'),
      formatDayYYYY(minDate),
    )
    await $('select[name=ff_status]').sendKeys(Key.chord(CONTROL_KEY, 'a'))
    await $('button[name=applyFilter]').click()
    await pageLoad(ctx)

    // click on the first timesheet
    await $('#manageTimesheet').click()
    await pageLoad(ctx)
    const txt = await $('select[name=timeperiod] > option[selected=true]').getText()
    const [start, end] = txt
      .split(' – ')
      .map((ds) => parseDate(ds, 'dd.MM.yy', Date.now(), { locale: de }))
    d('start ' + start)
    d('end ' + end)
    d('in timesheet ' + format(start, 'EEEEEE dd.MM') + ' - ' + format(end, 'EEEEEE dd.MM'))

    const [relevant, others] = partition(what, (w) => isWithinInterval(w.day, { start, end }))

    const saveTimesheetExitButton = (
      await $$(`button[onclick*="'timeadmin.saveTimesheetExit','status=2'"]`)
    )[0]
    const createAdjustmentTimesheetButton = (
      await $$(`button[onclick*="'timeadmin.createAdjustmentTimesheet'"]`)
    )[0]
    if (saveTimesheetExitButton || createAdjustmentTimesheetButton) {
      d('reading timesheet data...')
      const data = await exportTimesheet(
        start,
        await getRowInfos(false),
        relevant.map((w) => w.day),
      )
      d('  done')
      if (timeSheetDataEqual(data, relevant)) {
        d('timesheet data is already correct')
        what = others
        continue
      } else {
        if (saveTimesheetExitButton) {
          d('sende Zeitformular zurück')
          await saveTimesheetExitButton.click()
          await pageLoad(ctx)
          continue
        }
        if (createAdjustmentTimesheetButton) {
          d('passe Zeitformular an')
          await createAdjustmentTimesheetButton.click()
          await pageLoad(ctx)
        }
      }
    }

    await addTasks(
      ctx,
      uniqBy(
        relevant.flatMap((w) => w.work),
        (t) => t.taskIntId,
      ).map(({ taskName, taskIntId, projectName }) => ({
        name: taskName,
        intId: taskIntId,
        projectName,
      })),
    )
    const rowInfos = await getRowInfos(true)
    for (const ri of rowInfos) {
      await correctComments(relevant, ri)
    }
    // d('' + eachDayOfInterval({ start, end }))
    d('' + relevant.map((w) => w.day))
    for (const day of uniq(relevant.map((w) => w.day)).sort(compareAsc)) {
      d('  filling out ' + format(day, 'EEEEEE dd.MM'))
      const daySlices = (relevant.find((w) => isSameDay(w.day, day)) || { work: [] }).work
      await Promise.all(
        rowInfos.map(async (rowInfo) => {
          const hours = daySlices
            .filter((s) => s.taskIntId === rowInfo.taskIntId)
            .map((s) => s.hours)
            .reduce((a, b) => a + b, 0)
            .toLocaleString('de-DE', { maximumFractionDigits: 2 })
            .replace('.', ',')
          d(`    setting ${hours} hours for task ${rowInfo.taskIntId} ${rowInfo.taskName}`)
          await $(
            rowInfo.tr,
            `input[alt^="${format(day, 'EEEEEE, dd.MM', { locale: de })}"]`,
          ).sendKeys(Key.chord(CONTROL_KEY, 'a'), hours)
        }),
      )
    }

    if (submitTimesheets) {
      d('  submitting timesheet')
      await $(`button[onclick*="'timeadmin.saveTimesheetExit','status=1'"]`).click()
    } else {
      d('  saving timesheet')
      await $(`button[onclick="submitForm('page','timeadmin.saveTimesheet');"]`).click()
    }
    await pageLoad(ctx)
    what = others
  }
  await logSleep(5000)
}

function d(...x: any) {
  console.log('zedd-clarity', ...x)
}

export interface SeleniumOptions {
  headless?: boolean
  downloadDir?: string
  chromedriverExe?: string
  chromeExe?: string
}

export async function fillClarity(
  nikuLink: string,
  data: ClarityExportFormat,
  submitTimesheets: boolean,
  resourceName: string | undefined,
  seleniumOptions: SeleniumOptions,
): Promise<void> {
  return withErrorHandling('fillClarity', nikuLink, seleniumOptions, (ctx) =>
    exportToClarity(ctx, data, submitTimesheets, resourceName, nikuLink),
  )
}
export async function withErrorHandling<R>(
  name: string,
  nikuLink: string,
  seleniumOptions: SeleniumOptions,
  cb: (ctx: Context) => Promise<R>,
): Promise<R> {
  checkNikuUrl(nikuLink)
  const ctx = await makeContext(seleniumOptions)
  try {
    return await cb(ctx)
  } catch (err: any) {
    console.error(err)
    const ssDir = path.join(homedir(), 'zedd', 'log')
    await fsp.mkdir(ssDir, { recursive: true })

    const formatedDate = format(new Date(), 'yyyy-MM-dd_HHmm')

    const ssFile = path.join(ssDir, name + '_' + formatedDate + '.png')
    console.warn('Saving screenshot to', ssFile)
    await fsp.writeFile(ssFile, await ctx[2].takeScreenshot(), 'base64')

    const htmlFile = path.join(ssDir, name + '_' + formatedDate + '.html')
    console.warn('Saving HTML to', htmlFile)
    await fsp.writeFile(htmlFile, await ctx[2].getPageSource(), 'utf8')

    const txtFile = path.join(ssDir, name + '_log.txt')
    console.warn('Append LOG to', txtFile)
    await fsp.appendFile(
      txtFile,
      name + '_' + formatedDate + '\n' + err.toString() + '\n\n',
      'utf8',
    )

    throw err
  } finally {
    await ctx[2].quit()
  }
}

export async function webDriverQuit() {
  if (chromeDriver) {
    chromeDriver.quit()
  }
}
