import { compareDesc, differenceInMinutes } from 'date-fns'
import { Version2Client as JiraClient } from 'jira.js'
import { isEqual } from 'lodash'
import { Task } from './AppState'
import { PlatformState } from './PlatformState'
import { PlatformType, Task as PlatformTask } from 'zedd-platform'
import { ZeddSettings } from './ZeddSettings'

// Initialize
let jiraConfig: ZeddSettings['cgJira']
let jira: JiraClient
let saveSettings: () => void

let lastJiraCall: Date | undefined = undefined
let platformState: PlatformState
let jira2url: string = ''

export function initJiraClient(
  jc: ZeddSettings['cgJira'],
  newPlatformState: PlatformState,
  newSaveSettings: () => void,
  newJira2url: string,
): void {
  platformState = newPlatformState
  jiraConfig = jc
  saveSettings = newSaveSettings
  jira2url = newJira2url
  const url = new URL(jc.url)
  jira = new JiraClient({
    host: url.toString(),
    telemetry: false,
    authentication: {
      personalAccessToken: jc.token,
    },
  })
}

const externalJiraField = 'customfield_10216'
const platformTaskField = 'customfield_10301'

const jiraConnectorErrorToMessage = (x: any) => {
  console.error(x)
  const { body, request } = JSON.parse(x)
  throw new Error(request.method + ' ' + request.uri.href + ' returned ' + body)
}

export const checkCgJira = async (config: ZeddSettings['cgJira']): Promise<any> => {
  console.log(config.url)
  const response = await fetch(config.url + '/rest/api/2/myself', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + config.token,
    },
  })
  if (response.status >= 400) {
    console.error(response)
    throw new Error(response.url + ' returned ' + response.status + ' ' + response.statusText)
  } else {
    return response
  }
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
    const projects = await jira.projects.getAllProjects()
    console.warn(projects)
    const keys = projects.map((p) => p.key).filter((key): key is string => key !== undefined)
    if (!isEqual(keys, jiraConfig.keys)) {
      console.log('retrieved project keys: ', keys)
      jiraConfig.keys = keys
      saveSettings()
    }
  })
const issueInfoToTask = async (platformTasks: PlatformTask[], i: any): Promise<Task> => {
  if (i.fields.parent) {
    const result = await callWithJsessionCookie(() =>
      jira.issueSearch
        .searchForIssuesUsingJqlPost({
          jql: `key=${i.fields.parent.key}`,
        })
        .catch(jiraConnectorErrorToMessage),
    )
    return issueInfoToTask(platformTasks, result.issues?.[0])
  }

  const externalKey = i.fields[externalJiraField]
  const platformTaskFieldValue = i.fields[platformTaskField]?.[0]?.trim()
  let platformTaskId: number | undefined
  let platformType: PlatformType | undefined = undefined
  if (platformTaskFieldValue) {
    const platformTask = platformTasks
      .filter((t) => t.name === platformTaskFieldValue)
      .sort((a, b) => (!a.start || !b.start ? 0 : compareDesc(a.start, b.start)))[0]
    platformTaskId = platformTask?.intId
    platformType = platformTask?.typ
    if (!platformTaskId || !platformType) {
      console.warn("No account found for JIRA Task Field '" + platformTaskFieldValue + "'")
    }
  } else if (externalKey) {
    const platformTask = platformTasks
      .filter((t) => t.name.includes(externalKey))
      .sort((a, b) => (!a.start || !b.start ? 0 : compareDesc(a.start, b.start)))[0]
    platformTaskId = platformTask?.intId
    platformType = platformTask?.typ
    if (!platformTaskId || !platformType) {
      console.warn("No account found for external JIRA-Key '" + externalKey + "'")
    }
  }
  console.log(
    'resolved ',
    i.fields.summary,
    platformTaskId,
    platformTasks.find((t) => t.intId === platformTaskId),
  )
  return new Task(
    (externalKey ? externalKey + '/' : '') +
      i.key +
      ': ' +
      i.fields.summary.replace(new RegExp('^' + externalKey + ':? ?'), ''),
    [],
    platformType,
    String(platformTaskId),
  )
}

export const getTasksFromAssignedJiraIssues = (platformTasks: PlatformTask[]): Promise<Task[]> =>
  callWithJsessionCookie(async () => {
    const result = await jira.issueSearch
      .searchForIssuesUsingJqlPost({
        jql: jiraConfig.currentIssuesJql,
      })
      .catch(jiraConnectorErrorToMessage)
    console.log(result)

    await updateJiraProjectKeys()

    return Promise.all(result.issues?.map((i) => issueInfoToTask(platformTasks, i)) || [])
  })

export const getTasksForSearchString = async (s: string): Promise<Task[]> =>
  callWithJsessionCookie(async () => {
    const sClean = s.trim().replace('"', '\\\\"')
    const orKeyMatch = sClean.match(/^[a-z]{1,6}-\d+$/i) ? ` OR key = "${sClean}"` : ''
    const jql = `(text ~ "${sClean}"${orKeyMatch}) AND resolution = Unresolved ORDER BY updated DESC`
    console.log('searching ' + jql)
    const result = await jira.issueSearch
      .searchForIssuesUsingJqlPost({
        jql,
      })
      .catch(jiraConnectorErrorToMessage)
    return Promise.all(result.issues?.map((i) => issueInfoToTask(platformState.tasks, i)) || [])
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
