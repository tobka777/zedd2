import { randomUUID } from 'crypto'
import { addDays, format, parseISO } from 'date-fns'
import { PlatformExportFormat } from './model'
import { WorkEntry } from './model/work-entry.model'
import { RepliconApi } from './replicon-api'

/*
 * Export to Replicon through its JSON web services instead of clicking through the timesheet page.
 * The payloads of GetUser/GetTimesheetForDate2/GetTimeEntriesForUserAndDateRange/PutTimeEntry follow
 * https://github.com/kyhau/friday-5pm-helper; those marked "assumed" aren't documented publicly.
 */

const USER_URI = /urn:replicon-tenant:[^:"]+:user:[0-9]+/
const TIMESHEET_URI = /urn:replicon-tenant:[^:"\/]+:timesheet:[0-9a-zA-Z-]+/g
const TIME_ENTRY_URI = /urn:replicon-tenant:[^:"]+:time-entry:[0-9a-zA-Z-]+/

/** statuses in which a timesheet can be edited without reopening it */
const EDITABLE_APPROVAL_STATUS = /:(open|rejected|not-submitted)$/

export interface RepliconDate {
  year: number
  month: number
  day: number
}

export const toRepliconDate = (isoDay: string): RepliconDate => {
  const [year, month, day] = isoDay.split('-').map(Number)
  return { year, month, day }
}

const fromRepliconDate = (d: RepliconDate) =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`

/** Splits sorted days into ranges of consecutive days. */
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

/** Builds the PutTimeEntry parameters for one work entry (payload as in friday-5pm-helper). */
export function timeEntryParameters(
  tenant: string,
  userUri: string,
  day: string,
  work: WorkEntry,
): unknown {
  const totalMinutes = Math.round(work.hours * 60)
  const customMetadata: unknown[] = [
    {
      keyUri: 'urn:replicon:time-entry-metadata-key:task',
      value: { uri: `urn:replicon-tenant:${tenant}:task:${work.taskIntId}` },
    },
  ]
  if (work.taskActivityUri) {
    // assumed: activities are set like the task, with their own metadata key
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
      target: {},
      user: { uri: userUri },
      entryDate: toRepliconDate(day),
      timeAllocationTypeUris: [
        'urn:replicon:time-allocation-type:attendance',
        'urn:replicon:time-allocation-type:project',
      ],
      interval: {
        hours: {
          hours: Math.floor(totalMinutes / 60),
          minutes: totalMinutes % 60,
          seconds: 0,
        },
      },
      customMetadata,
      extensionFieldValues: [],
    },
    unitOfWorkId: randomUUID(),
  }
}

/** Finds the owner of a timesheet, i.e. the user to export for. */
export async function getTimesheetOwner(api: RepliconApi, timesheetUri: string): Promise<string> {
  // assumed parameters
  const owner = await api
    .request('TimesheetService1.svc/GetTimesheetOwner', { timesheetUri })
    .catch(() => undefined)
  const fromOwner = owner && USER_URI.exec(JSON.stringify(owner))?.[0]
  if (fromOwner) return fromOwner
  const timesheet = await api.request('TimesheetService1.svc/GetStandardTimesheet2', {
    timesheetUri,
  })
  const text = JSON.stringify(timesheet)
  const userUri =
    /"owner"\s*:\s*\{[^}]*?"uri"\s*:\s*"(urn:replicon-tenant:[^:"]+:user:[0-9]+)"/.exec(
      text,
    )?.[1] ?? USER_URI.exec(text)?.[0]
  if (!userUri) {
    throw new Error('Could not find the owner of the Replicon timesheet ' + timesheetUri)
  }
  return userUri
}

async function getTimesheetForDay(api: RepliconApi, userUri: string, day: string) {
  const result = await api.request('TimesheetService1.svc/GetTimesheetForDate2', {
    userUri,
    date: toRepliconDate(day),
  })
  const timesheetUri = JSON.stringify(result).match(TIMESHEET_URI)?.[0]
  if (!timesheetUri) throw new Error('No Replicon timesheet found for ' + day)
  return timesheetUri
}

async function reopenIfSubmitted(api: RepliconApi, timesheetUri: string) {
  const summary = await api.request('TimesheetService1.svc/GetTimesheetSummary', { timesheetUri })
  const approvalStatus: string | undefined = summary?.approvalStatus?.uri
  if (!approvalStatus || EDITABLE_APPROVAL_STATUS.test(approvalStatus)) return
  // assumed parameters
  await api.request('TimesheetApprovalService1.svc/Reopen', {
    timesheetUri,
    comments: 'Reopened by zedd to export time',
    unitOfWorkId: randomUUID(),
  })
}

/** Deletes the existing time entries of the user on the given days. */
async function deleteTimeEntries(api: RepliconApi, userUri: string, days: string[]) {
  const daySet = new Set(days)
  for (const [start, end] of consecutiveRanges(days)) {
    const entries: any[] = await api.request(
      'TimeEntryService3.svc/GetTimeEntriesForUserAndDateRange',
      {
        user: { uri: userUri },
        dateRange: { startDate: toRepliconDate(start), endDate: toRepliconDate(end) },
      },
    )
    for (const entry of entries ?? []) {
      const timeEntryUri = entry?.uri ?? TIME_ENTRY_URI.exec(JSON.stringify(entry))?.[0]
      const entryDate: RepliconDate | undefined = entry?.entryDate
      if (!timeEntryUri || (entryDate && !daySet.has(fromRepliconDate(entryDate)))) continue
      // assumed parameters
      await api.request('TimeEntryService3.svc/DeleteTimeEntry', {
        timeEntryUri,
        unitOfWorkId: randomUUID(),
      })
    }
  }
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

  const daysByTimesheet = new Map<string, string[]>()
  for (const day of Object.keys(data).sort()) {
    const timesheetUri = await getTimesheetForDay(api, userUri, day)
    daysByTimesheet.set(timesheetUri, [...(daysByTimesheet.get(timesheetUri) ?? []), day])
  }

  for (const [timesheetUri, days] of daysByTimesheet) {
    await reopenIfSubmitted(api, timesheetUri)
    await deleteTimeEntries(api, userUri, days)
    for (const day of days) {
      for (const work of data[day]) {
        await api.request(
          'TimeEntryService3.svc/PutTimeEntry',
          timeEntryParameters(tenant, userUri, day, work),
        )
      }
    }
    if (submitTimesheets) {
      // assumed parameters
      await api.request('TimesheetApprovalService1.svc/Submit2', {
        timesheetUri,
        comments: null,
        unitOfWorkId: randomUUID(),
      })
    }
  }
}
