import { compareDesc, differenceInMinutes } from 'date-fns'
import { Version2Client as JiraClient } from 'jira.js'
// @ts-ignore
import * as request from 'request'

import { Task } from './AppState'
import { ClarityTask, ClarityState } from './ClarityState'
import { ZeddSettings } from './ZeddSettings'
import { isEqual } from 'lodash'

// Initialize
const jar = request.jar()
let jiraConfig: ZeddSettings['cgJira']
let jira: JiraClient
let saveSettings: () => void

let lastJiraCall: Date | undefined = undefined
let clarityState: ClarityState
let jira2url: string = ''

export function initJiraClient(
  jc: ZeddSettings['cgJira'],
  newClarityState: ClarityState,
  newSaveSettings: () => void,
  newJira2url: string,
): void {
  clarityState = newClarityState
  jiraConfig = jc
  saveSettings = newSaveSettings
  jira2url = newJira2url
  const url = new URL(jc.url)
  jira = new JiraClient({
    host: url.toString(),
    telemetry: false,
    headers: {
      'User-Agent': 'zedd-app',
    },
    authentication: {
      basic: {
        username: jc.username,
        password: Buffer.from(jc.password, 'base64').toString('utf8'),
      },
    },
  })
}

const externalJiraField = 'customfield_10216'
const clarityTaskField = 'customfield_10301'

const jiraConnectorErrorToMessage = (x: any) => {
  console.error(x)
  const { body, request } = JSON.parse(x)
  throw new Error(request.method + ' ' + request.uri.href + ' returned ' + body)
}

export const checkCgJira = (config: ZeddSettings['cgJira']): Promise<any> => {
  return new Promise((resolve, reject) =>
    request(
      {
        method: 'GET',
        jar,
        url: config.url,
        auth: {
          username: config.username,
          password: Buffer.from(config.password, 'base64').toString('utf8'),
        },
      },
      (err: any, response: any) => {
        if (err) {
          reject(err)
        } else if (response.statusCode >= 400) {
          console.error(response)
          reject(
            new Error(
              response.request.method +
                ' ' +
                response.request.uri.href +
                ' returned ' +
                response.statusCode +
                ' ' +
                response.statusMessage,
            ),
          )
        } else {
          resolve(response)
        }
      },
    ),
  )
}

const callWithJsessionCookie = async <T>(cb: () => Promise<T>) => {
  if (!lastJiraCall || differenceInMinutes(new Date(), lastJiraCall) > 10) {
    await checkCgJira(jiraConfig)
    lastJiraCall = new Date()
  }

  return cb()
}

const updateJiraProjectKeys = () =>
  callWithJsessionCookie(async () => {
    const projects = await jira.projects.getAllProjects<{ key: string }[]>()
    console.warn(projects)
    const keys = projects.map((p) => p.key)
    if (!isEqual(keys, jiraConfig.keys)) {
      console.log('retrieved project keys: ', keys)
      jiraConfig.keys = keys
      saveSettings()
    }
  })
const issueInfoToTask = async (clarityTasks: ClarityTask[], i: any): Promise<Task> => {
  if (i.fields.parent) {
    const result = await callWithJsessionCookie(() =>
      jira.issueSearch
        .searchForIssuesUsingJqlPost({
          jql: `key=${i.fields.parent.key}`,
        })
        .catch(jiraConnectorErrorToMessage),
    )
    return issueInfoToTask(clarityTasks, result.issues?.[0])
  }

  const externalKey = i.fields[externalJiraField]
  const clarityTaskFieldValue = i.fields[clarityTaskField]?.[0]?.trim()
  let clarityTaskId: number | undefined
  if (clarityTaskFieldValue) {
    clarityTaskId = clarityTasks
      .filter((t) => t.name === clarityTaskFieldValue)
      .sort((a, b) => compareDesc(a.start, b.start))[0]?.intId
    if (!clarityTaskId) {
      console.warn(
        "No clarity-account found for JIRA Clarity-Task Field '" + clarityTaskFieldValue + "'",
      )
    }
  } else if (externalKey) {
    clarityTaskId = clarityTasks
      .filter((t) => t.name.includes(externalKey))
      .sort((a, b) => compareDesc(a.start, b.start))[0]?.intId
    if (!clarityTaskId) {
      console.warn("No clarity-account found for exernal JIRA-Key '" + externalKey + "'")
    }
  }
  console.log(
    'resolved ',
    i.fields.summary,
    clarityTaskId,
    clarityTasks.find((t) => t.intId === clarityTaskId),
  )
  return new Task(
    (externalKey ? externalKey + '/' : '') +
      i.key +
      ': ' +
      i.fields.summary.replace(new RegExp('^' + externalKey + ':? ?'), ''),
    clarityTaskId,
  )
}

export const getTasksFromAssignedJiraIssues = (clarityTasks: ClarityTask[]): Promise<Task[]> =>
  callWithJsessionCookie(async () => {
    const result = await jira.issueSearch
      .searchForIssuesUsingJqlPost({
        jql: jiraConfig.currentIssuesJql,
      })
      .catch(jiraConnectorErrorToMessage)
    console.log(result)

    await updateJiraProjectKeys()

    return Promise.all(result.issues?.map((i) => issueInfoToTask(clarityTasks, i)) || [])
  })

export const getTasksForSearchString = async (s: string): Promise<Task[]> =>
  callWithJsessionCookie(async () => {
    const sClean = s.trim().replace('"', '\\\\"')
    const orKeyMatch = sClean.match(/^[a-z]{1,6}-\d+$/i) ? ` OR key = "${sClean}"` : ''
    const jql = `(text ~ "${sClean}*"${orKeyMatch}) AND resolution = Unresolved ORDER BY updated DESC`
    console.log('searching ' + jql)
    const result = await jira.issueSearch
      .searchForIssuesUsingJqlPost({
        jql,
      })
      .catch(jiraConnectorErrorToMessage)
    return Promise.all(result.issues?.map((i) => issueInfoToTask(clarityState.tasks, i)) || [])
  })

/** Extracts keys matching projects in connected jira and returns issue links from them. */
export function getLinksFromString(str: string): [string, string][] {
  const keys = str.match(/\b[A-Z]+-\d+\b/g) ?? []
  return keys
    .map((k): [string, string] => [
      k,
      !jiraConfig.keys?.length || jiraConfig.keys.includes(k.match(/\w+/)![0])
        ? jiraConfig.url + 'browse/' + k
        : jira2url
        ? jira2url + 'browse/' + k
        : '',
    ])
    .filter(([, link]) => link)
}
