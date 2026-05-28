import { randomBytes } from 'crypto'
import {
  addDays,
  areIntervalsOverlapping,
  max as dateMax,
  min as dateMin,
  differenceInMinutes,
  parseISO,
  roundToNearestMinutes,
} from 'date-fns'
import { promises as fsp } from 'fs'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { groupBy, remove, sortBy, sum } from 'lodash'
import * as path from 'path'
import type { AppState } from './AppState'
import type { PlatformState } from './PlatformState'
import { isoDayStr, splitIntervalIntoCalendarDays } from './util'

type StartOttzTalkerServerOptions = {
  appState: AppState
  platformState: PlatformState
  host?: string
  port?: number
  tokenFilePath: string
}

type OttBookingPoint = {
  date: string
  taskId: number | string
  hours: number
  comment?: string
}

function getBearerToken(req: IncomingMessage): string | undefined {
  const auth = req.headers['authorization']
  if (!auth || Array.isArray(auth)) {
    return undefined
  }
  if (!auth.startsWith('Bearer ')) {
    return undefined
  }
  return auth.slice('Bearer '.length)
}

async function getOrCreateToken(tokenFilePath: string): Promise<string> {
  try {
    const token = (await fsp.readFile(tokenFilePath, 'utf8')).trim()
    if (token) {
      return token
    }
  } catch (_e) {
    // ignore
  }
  const token = randomBytes(16).toString('hex')
  await fsp.mkdir(path.dirname(tokenFilePath), { recursive: true })
  await fsp.writeFile(tokenFilePath, token, 'utf8')
  return token
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(json))
  res.end(json)
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

const roundToNearest = (x: number, toNearest: number) => Math.round(x / toNearest) * toNearest
const floorToNearest = (x: number, toNearest: number) => Math.floor(x / toNearest) * toNearest
const ceilToNearest = (x: number, toNearest: number) => Math.ceil(x / toNearest) * toNearest

function smartRound<T>(arr: T[], f: (t: T) => number, toNearest: number): [number, T][] {
  let result: [number, T][] = arr.map((x) => [f(x), x])
  const targetValue = roundToNearest(sum(result.map(([x]) => x)), toNearest)
  const allFloored = sum(result.map(([x]) => floorToNearest(x, toNearest)))
  const roundUpCount = Math.round((targetValue - allFloored) / toNearest)
  result = sortBy(
    result,
    ([x]) => +(ceilToNearest(x, toNearest) === x),
    ([x]) => ceilToNearest(x, toNearest) - x,
  )

  for (let i = 0; i < result.length; i++) {
    const roundedValue =
      i < roundUpCount
        ? ceilToNearest(result[i][0], toNearest)
        : floorToNearest(result[i][0], toNearest)
    result[i][0] = roundedValue
  }

  const smartRoundSum = sum(result.map(([x]) => x))
  if (roundToNearest(smartRoundSum, toNearest) !== targetValue) {
    throw new Error(`expected=${targetValue} actual=${smartRoundSum}`)
  }

  return result
}

function computeOttBookingPoints(
  appState: AppState,
  platformState: PlatformState,
  interval: Interval,
): OttBookingPoint[] {
  const showInterval = { start: interval.start, end: addDays(interval.end, 1) }
  const dayMap: Record<string, { hours: number; taskId: number | string; comment?: string }[]> = {}

  for (const slice of appState.slices) {
    try {
      if (!areIntervalsOverlapping(slice, showInterval)) {
        continue
      }
    } catch (e) {
      throw e
    }

    if (!slice.task.platformTaskIntId) {
      continue
    }

    const platformTask = platformState.resolveTask(slice.task.platformTaskIntId)
    if (!platformTask || platformTask.typ !== 'OTT') {
      continue
    }

    const bStartFixed = dateMax([slice.start, showInterval.start])
    const bEndFixed = dateMin([slice.end, showInterval.end])
    for (const daySlice of splitIntervalIntoCalendarDays({ start: bStartFixed, end: bEndFixed })) {
      const dayKey = isoDayStr(daySlice.start)
      const dayHourss = (dayMap[dayKey] = dayMap[dayKey] ?? [])
      let dayHours = dayHourss.find(
        (d) => d.taskId === platformTask.intId && d.comment === slice.task.platformTaskComment,
      )
      if (!dayHours) {
        dayHours = {
          hours: 0,
          taskId: platformTask.intId,
          comment: slice.task.platformTaskComment || undefined,
        }
        dayHourss.push(dayHours)
      }
      dayHours.hours += differenceInMinutes(daySlice.end, daySlice.start) / 60
    }
  }

  for (const dayHourss of Object.values(dayMap)) {
    const smartRounded = smartRound(
      sortBy(
        dayHourss,
        (x) => String(x.taskId),
        (x) => x.comment ?? '',
      ),
      (x) => x.hours,
      0.25,
    )
    for (const [roundedHours, dayHours] of smartRounded) {
      dayHours.hours = roundedHours
    }
    remove(dayHourss, (we) => we.hours === 0)
  }

  const result: OttBookingPoint[] = []
  for (const [dayStr, entries] of Object.entries(dayMap)) {
    const grouped = Object.values(groupBy(entries, (we) => String(we.taskId))).map(
      (workEntries) => {
        const comment =
          workEntries
            .filter((we) => we.comment)
            .map((we) => we.comment)
            .join(', ') || undefined
        return {
          date: dayStr,
          taskId: workEntries[0].taskId,
          hours: sum(workEntries.map((we) => we.hours)),
          comment,
        }
      },
    )
    for (const g of grouped) {
      result.push(g)
    }
  }

  return sortBy(
    result,
    (x) => x.date,
    (x) => String(x.taskId),
  )
}

export async function startOttzTalkerServer({
  appState,
  platformState,
  host = '127.0.0.1',
  port = 12345,
  tokenFilePath,
}: StartOttzTalkerServerOptions): Promise<{ token: string; close: () => Promise<void> }> {
  const token = await getOrCreateToken(tokenFilePath)

  const server = createServer(async (req, res) => {
    try {
      const reqToken = getBearerToken(req)
      if (reqToken !== token) {
        sendText(res, 401, 'Unauthorized\n')
        return
      }

      const url = new URL(req.url ?? '/', `http://${host}:${port}`)
      const pathname = url.pathname

      if (req.method === 'GET' && pathname === '/platform') {
        sendJson(res, 200, { tasks: platformState.tasks, ztalkerVersion: 2 })
        return
      }

      if (req.method === 'PUT' && pathname === '/platform') {
        const body = await readBody(req)
        const tasks = JSON.parse(body, (key, value) =>
          key === 'end' || key === 'start' ? parseISO(value) : value,
        )

        await platformState.replaceTasksFromExternal(tasks, (oldIntId, newIntId) => {
          for (const task of appState.tasks) {
            if (task.platformTaskIntId === oldIntId) {
              task.platformTaskIntId = newIntId
              task.platformType = platformState.resolveTask(newIntId)?.typ
            }
          }
          if (appState.currentTask.platformTaskIntId === oldIntId) {
            appState.currentTask.platformTaskIntId = newIntId
            appState.currentTask.platformType = platformState.resolveTask(newIntId)?.typ
          }
        })
        sendJson(res, 200, { status: 'ok' })
        return
      }

      if (req.method === 'GET' && pathname === '/data/latest') {
        res.statusCode = 200
        const json = appState.toJsonString()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Length', Buffer.byteLength(json))
        res.end(json)
        return
      }

      if (req.method === 'GET' && pathname === '/ott/booking-points') {
        const startStr = url.searchParams.get('start')
        const endStr = url.searchParams.get('end')
        if (!startStr || !endStr) {
          sendJson(res, 400, {
            error: 'Missing query params: start, end (expected ISO dates like 2026-03-15)',
          })
          return
        }

        const start = parseISO(startStr)
        const end = parseISO(endStr)
        if (Number.isNaN(+start) || Number.isNaN(+end)) {
          sendJson(res, 400, {
            error: 'Invalid start/end. Expected ISO date strings like 2026-03-15.',
          })
          return
        }
        if (+start > +end) {
          sendJson(res, 400, { error: 'Invalid range: start must be <= end' })
          return
        }

        const normalized: Interval = {
          start: roundToNearestMinutes(start, { nearestTo: 1 }),
          end: roundToNearestMinutes(end, { nearestTo: 1 }),
        }

        const points = computeOttBookingPoints(appState, platformState, normalized)
        sendJson(res, 200, points)
        return
      }

      if (req.method === 'POST' && pathname === '/restart') {
        sendJson(res, 410, { status: 'gone' })
        return
      }

      sendText(res, 404, 'Unknown endpoint')
    } catch (e) {
      sendText(res, 500, String(e))
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  return {
    token,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}
