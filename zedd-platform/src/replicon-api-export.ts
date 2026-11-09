import { randomUUID } from 'crypto'
import { addDays, format, parseISO } from 'date-fns'
import { PlatformExportFormat } from './model'
import { WorkEntry } from './model/work-entry.model'
import { RepliconApi } from './replicon-api'

/*
 * Export to Replicon through its JSON web services instead of clicking through the timesheet page.
 * Payloads follow https://github.com/cheeloung/replicon-mcp (verified there against a live tenant)
 * and the operation signatures of Replicon's service help pages (…/services/<Service>.svc/help).
 * Only the activity metadata key is assumed.
 */

const USER_URI = /urn:replicon-tenant:[^:"]+:user:[0-9]+/
const TIMESHEET_STATUS_WAITING = /:waiting$/
const TIMESHEET_STATUS_APPROVED = /:approved$/

export interface RepliconDate {
  year: number
  month: number
  day: number
}

interface Timesheet {
  uri: string
  statusUri?: string
  days: string[]
}

export const toRepliconDate = (isoDay: string): RepliconDate => {
  const [year, month, day] = isoDay.split('-').map(Number)
  return { year, month, day }
}

const fromRepliconDate = (d: RepliconDate) =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`

/** Splits days into ranges of consecutive days. */
export function consecutiveRanges(days: string[]): [string, string][] {
  const ranges: [string, string][] = []
  for (const day of [...days].sort()) {
    const last = ranges[ranges.length - 1]
    if (last && format(addDays(parseISO(last[1]), 1), 'yyyy-MM-dd') === day) {
      last[1] = day
    } else {
      ranges.push([day, day])
    }
  }
  return ranges
}

/** Builds the PutTimeEntry parameters for one work entry. */
export function timeEntryParameters(
  tenant: string,
  userUri: string,
  day: string,
  work: WorkEntry,
): unknown {
  if (!work.projectUri) {
    throw new Error(
      `The Replicon project of "${work.projectName}" is unknown. Please import the Replicon tasks ` +
        'again, so zedd knows the projects of the tasks.',
    )
  }
  const totalMinutes = Math.round(work.hours * 60)
  const customMetadata: unknown[] = [
    { keyUri: 'urn:replicon:time-entry-metadata-key:project', value: { uri: work.projectUri } },
    {
      keyUri: 'urn:replicon:time-entry-metadata-key:task',
      value: { uri: `urn:replicon-tenant:${tenant}:task:${work.taskIntId}` },
    },
  ]
  if (work.taskActivityUri) {
    // assumed: activities are set like project and task, with their own metadata key
    customMetadata.push({
      keyUri: 'urn:replicon:time-entry-metadata-key:activity',
      value: { uri: work.taskActivityUri },
    })
  }
  if (work.comment) {
    customMetadata.push({
      keyUri: 'urn:replicon:time-entry-metadata-key:comments',
      value: { text: work.comment },
    })
  }
  return {
    timeEntry: {
      target: { parameterCorrelationId: randomUUID() },
      user: { uri: userUri },
      entryDate: toRepliconDate(day),
      // both are needed, or the entry is missing from Replicon's timesheet report
      timeAllocationTypeUris: [
        'urn:replicon:time-allocation-type:attendance',
        'urn:replicon:time-allocation-type:project',
      ],
      interval: {
        hours: {
          hours: Math.floor(totalMinutes / 60),
          minutes: totalMinutes % 60,
          seconds: 0,
          milliseconds: 0,
          microseconds: 0,
        },
        timePair: null,
      },
      customMetadata,
      extensionFieldValues: [],
    },
    unitOfWorkId: randomUUID(),
  }
}

/** Finds the owner of a timesheet, i.e. the user to export for. */
export async function getTimesheetOwner(api: RepliconApi, timesheetUri: string): Promise<string> {
  const owner = await api.request('TimesheetService1.svc/GetTimesheetOwner', { timesheetUri })
  const userUri = USER_URI.exec(JSON.stringify(owner))?.[0]
  if (!userUri) {
    throw new Error('Could not find the owner of the Replicon timesheet ' + timesheetUri)
  }
  return userUri
}

async function getTimesheetForDay(api: RepliconApi, userUri: string, day: string) {
  const details = await api.request('TimesheetService1.svc/GetTimesheetDetailsForDate', {
    userUri,
    date: toRepliconDate(day),
    timesheetGetOptionUri: null,
  })
  const uri: string | undefined = details?.timesheet?.uri
  if (!uri) throw new Error('No Replicon timesheet found for ' + day)
  return { uri, statusUri: details.timesheet.statusUri as string | undefined }
}

async function reopenIfSubmitted(api: RepliconApi, timesheet: Timesheet) {
  if (timesheet.statusUri && TIMESHEET_STATUS_APPROVED.test(timesheet.statusUri)) {
    throw new Error(
      `The Replicon timesheet of ${timesheet.days[0]} is already approved and can't be changed.`,
    )
  }
  if (timesheet.statusUri && TIMESHEET_STATUS_WAITING.test(timesheet.statusUri)) {
    await api.request('TimesheetApprovalService1.svc/Reopen', {
      timesheetUri: timesheet.uri,
      unitOfWorkId: randomUUID(),
      comments: 'Reopened by zedd to export time',
    })
  }
}

async function getTimeEntries(api: RepliconApi, userUri: string, start: string, end: string) {
  const entries = await api.request('TimeEntryService3.svc/GetTimeEntriesForUserAndDateRange', {
    user: { uri: userUri },
    dateRange: { startDate: toRepliconDate(start), endDate: toRepliconDate(end) },
    asOf: null,
  })
  return (Array.isArray(entries) ? entries : []) as {
    uri?: string
    entryDate?: RepliconDate
    revisionGroupUri?: string
  }[]
}

/** Deletes the existing time entries of the user on the given days. */
async function deleteTimeEntries(api: RepliconApi, userUri: string, days: string[]) {
  const daySet = new Set(days)
  for (const [start, end] of consecutiveRanges(days)) {
    for (const entry of await getTimeEntries(api, userUri, start, end)) {
      if (!entry.uri || (entry.entryDate && !daySet.has(fromRepliconDate(entry.entryDate)))) {
        continue
      }
      await api.request('TimeEntryService3.svc/DeleteTimeEntry', { timeEntryUri: entry.uri })
    }
  }
}

/**
 * Submits the timesheet. Like the Replicon page, the revision groups of the entries are submitted
 * first, which some tenants require before the timesheet can be submitted.
 */
async function submit(api: RepliconApi, userUri: string, timesheet: Timesheet) {
  const days = [...timesheet.days].sort()
  const entries = await getTimeEntries(api, userUri, days[0], days[days.length - 1])
  const revisionGroups = new Set(entries.map((e) => e.revisionGroupUri).filter(Boolean))
  for (const timeEntryRevisionGroupUri of revisionGroups) {
    // may already be submitted from a previous attempt, so a failure doesn't stop the submit
    await api
      .request('TimeEntryRevisionGroupApprovalService1.svc/Submit', {
        timeEntryRevisionGroupUri,
        unitOfWorkId: randomUUID(),
        comments: '',
      })
      .catch((e) => console.warn('Could not submit revision group', e))
  }
  await api.request('TimesheetApprovalService1.svc/Submit2', {
    timesheetUri: timesheet.uri,
    unitOfWorkId: randomUUID(),
    comments: '',
    changeReason: '',
  })
}

/**
 * Writes the work entries of the exported days to Replicon: the existing entries of these days are
 * replaced, days without work entries are cleared.
 *
 * @param currentTimesheetUri - a timesheet of the user, to find the user and the tenant
 */
export async function exportViaApi(
  api: RepliconApi,
  currentTimesheetUri: string,
  data: PlatformExportFormat,
  submitTimesheets: boolean,
): Promise<void> {
  const tenant = /urn:replicon-tenant:([^:]+):/.exec(currentTimesheetUri)![1]
  const userUri = await getTimesheetOwner(api, currentTimesheetUri)

  // check everything before changing anything
  for (const day of Object.keys(data)) {
    data[day].forEach((work) => timeEntryParameters(tenant, userUri, day, work))
  }

  const timesheets = new Map<string, Timesheet>()
  for (const day of Object.keys(data).sort()) {
    const { uri, statusUri } = await getTimesheetForDay(api, userUri, day)
    const timesheet = timesheets.get(uri) ?? { uri, statusUri, days: [] }
    timesheet.days.push(day)
    timesheets.set(uri, timesheet)
  }

  for (const timesheet of timesheets.values()) {
    await reopenIfSubmitted(api, timesheet)
    await deleteTimeEntries(api, userUri, timesheet.days)
    for (const day of timesheet.days) {
      for (const work of data[day]) {
        await api.request(
          'TimeEntryService3.svc/PutTimeEntry',
          timeEntryParameters(tenant, userUri, day, work),
        )
      }
    }
    if (submitTimesheets) {
      await submit(api, userUri, timesheet)
    }
  }
}
