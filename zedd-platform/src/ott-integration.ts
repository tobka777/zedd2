import puppeteer, {Browser, ElementHandle, Page} from 'puppeteer'
import {Task} from './model/task.model'
import {PlatformOptions} from "./model/platform.options.model";

let browser: Browser
let page: Page

export async function importOTTTasks(nikuLink: string, options: PlatformOptions, notifyTasks?: (p: Task[]) => void): Promise<Task[]> {
  browser = await puppeteer.launch({ headless: options.headless })
  page = await browser.newPage()

  await page.goto(nikuLink)

  await page.waitForSelector('[role="table"]')

  await page.setRequestInterception(true)


  const [dropdownNode] = await page.$x(
      "//div[@role='button' and contains(text(), 'Started & ended in selected period')]"
  );

  const dropdown = dropdownNode as unknown as ElementHandle<Element>;
  await dropdown.click();

  const dropdownOptions = await page.waitForSelector('ul[role="listbox"]');

  const allAssigned = await dropdownOptions?.waitForSelector('li[data-value="All"]')
  await allAssigned!.click()
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
      strId: projectIndex > -1 ? assoBoardProjectCodes[projectIndex].gfsTaskCode : null,
      intId: assignedIssue.appointmentId,
      projectName: projectIndex > -1 ? assoBoardProjectCodes[projectIndex].gtmProjectName : null,
      start: null,
      end: null,
      projectIntId: projectIndex > -1 ? assoBoardProjectCodes[projectIndex].gfsProjectCode : null,
      taskCode: projectIndex > -1 ? assoBoardProjectCodes[projectIndex].gfsTaskCode : null,
      typ: 'OTT',
    }
    tasks.push(task)
  }

  return tasks
}
