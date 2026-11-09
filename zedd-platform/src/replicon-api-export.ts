import { randomUUID } from 'crypto'
import { addDays, format, parseISO } from 'date-fns'
import { PlatformExportFormat } from './model'
import { WorkEntry } from './model/work-entry.model'
import { RepliconApi } from './replicon-api'

const USER_URI = /urn:replicon-tenant:[^:"]+:user:[0-9]+/
const TIME_ENTRY_URI = /urn:replicon-tenant:[^:"]+:time-entry:[0-9a-zA-Z-]+/
/** project time carries project or task metadata; other entries (e.g. attendance only) are kept */
const PROJECT_TIME = /time-entry-metadata-key:(project|task)"/
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
  extensionFieldValues: unknown[] = [],
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
      extensionFieldValues,
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

/** an extension field of the tenant, e.g. the work location, as returned on a time entry */
interface ExtensionFieldValue {
  definition?: { uri?: string; displayText?: string; name?: string }
  tag?: { uri?: string } | null
  textValue?: string | null
  numericValue?: number | null
}

/** The work location is a custom field of the tenant; it's recognized by its name. */
const WORK_LOCATION = /location|standort|arbeitsort|einsatzort/i
const WORK_LOCATION_LOOKBACK_DAYS = 56

/** The work location fields of a time entry, reduced to what's needed to write them again. */
function workLocationFields(entry: { extensionFieldValues?: ExtensionFieldValue[] }) {
  return (entry.extensionFieldValues ?? [])
    .filter(
      (field) => field.definition?.uri && WORK_LOCATION.test(JSON.stringify(field.definition)),
    )
    .filter((field) => field.tag?.uri || field.textValue || field.numericValue != null)
    .map((field) => ({
      definition: { uri: field.definition!.uri },
      ...(field.tag?.uri ? { tag: { uri: field.tag.uri } } : {}),
      ...(field.textValue ? { textValue: field.textValue } : {}),
      ...(field.numericValue != null ? { numericValue: field.numericValue } : {}),
    }))
}

/**
 * Finds the work location for each exported day, like the Replicon page fills it in: from an entry
 * of that day, else from the latest entry before. Throws if there's none, before anything changes.
 */
async function getWorkLocations(api: RepliconApi, userUri: string, days: string[]) {
  const sorted = [...days].sort()
  const start = format(addDays(parseISO(sorted[0]), -WORK_LOCATION_LOOKBACK_DAYS), 'yyyy-MM-dd')
  const entries = (await getTimeEntries(api, userUri, start, sorted[sorted.length - 1]))
    .filter((entry) => entry.entryDate && workLocationFields(entry).length > 0)
    .sort((a, b) => fromRepliconDate(a.entryDate!).localeCompare(fromRepliconDate(b.entryDate!)))
  const locations = new Map<string, unknown[]>()
  for (const day of sorted) {
    const entry =
      entries.find((e) => fromRepliconDate(e.entryDate!) === day) ??
      [...entries].reverse().find((e) => fromRepliconDate(e.entryDate!) < day)
    if (!entry) {
      throw new Error(
        `No work location found for ${day}. Please enter one entry with its work location by hand ` +
          'in Replicon first; zedd takes the work location over from there.',
      )
    }
    locations.set(day, workLocationFields(entry))
  }
  return locations
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
    extensionFieldValues?: ExtensionFieldValue[]
  }[]
}

/** The existing project time entries of the user on the given days. */
async function getProjectTimeEntries(api: RepliconApi, userUri: string, days: string[]) {
  const daySet = new Set(days)
  const uris: string[] = []
  for (const [start, end] of consecutiveRanges(days)) {
    for (const entry of await getTimeEntries(api, userUri, start, end)) {
      if (!entry.uri || (entry.entryDate && !daySet.has(fromRepliconDate(entry.entryDate)))) {
        continue
      }
      if (PROJECT_TIME.test(JSON.stringify(entry))) uris.push(entry.uri)
    }
  }
  return uris
}

const deleteTimeEntry = (api: RepliconApi, timeEntryUri: string) =>
  api.request('TimeEntryService3.svc/DeleteTimeEntry', { timeEntryUri })

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
  const daysWithWork = Object.keys(data).filter((day) => data[day].some((w) => w.hours > 0))
  const workLocations = daysWithWork.length
    ? await getWorkLocations(api, userUri, daysWithWork)
    : new Map<string, unknown[]>()

  const timesheets = new Map<string, Timesheet>()
  for (const day of Object.keys(data).sort()) {
    const { uri, statusUri } = await getTimesheetForDay(api, userUri, day)
    const timesheet = timesheets.get(uri) ?? { uri, statusUri, days: [] }
    timesheet.days.push(day)
    timesheets.set(uri, timesheet)
  }

  for (const timesheet of timesheets.values()) {
    await reopenIfSubmitted(api, timesheet)
    const oldEntries = await getProjectTimeEntries(api, userUri, timesheet.days)

    // write the new entries first, so a failure doesn't leave the days empty
    const newEntries: string[] = []
    try {
      for (const day of timesheet.days) {
        for (const work of data[day].filter((w) => w.hours > 0)) {
          const result = await api.request(
            'TimeEntryService3.svc/PutTimeEntry',
            timeEntryParameters(tenant, userUri, day, work, workLocations.get(day)),
          )
          const uri = TIME_ENTRY_URI.exec(JSON.stringify(result))?.[0]
          if (uri) newEntries.push(uri)
        }
      }
    } catch (e) {
      // take back what was written, so the days keep their old entries
      for (const uri of newEntries) {
        await deleteTimeEntry(api, uri).catch((e2) => console.error('Could not undo ' + uri, e2))
      }
      throw e
    }

    for (const uri of oldEntries) {
      await deleteTimeEntry(api, uri)
    }
    if (submitTimesheets) {
      await submit(api, userUri, timesheet)
    }
  }
}
