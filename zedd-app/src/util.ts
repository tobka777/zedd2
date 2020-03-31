import * as chroma from 'chroma.ts'
import {
  addDays,
  addMinutes,
  addSeconds,
  compareDesc,
  endOfMonth,
  format as formatDate,
  isBefore,
  isEqual,
  lastDayOfISOWeek,
  parse as parseDate,
  roundToNearestMinutes,
  startOfDay,
  startOfISOWeek,
  startOfMinute,
  startOfMonth,
} from 'date-fns'
import { promises as fsp, PathLike } from 'fs'
import * as fs from 'fs'
import { promisify } from 'util'

export const FILE_DATE_FORMAT = "yyyyMMdd'T'HHmm"

export const fileExists = promisify(fs.exists)

/**
 *
 * @param dir
 * @param regex The first capturing group must match a Date in the format FILE_DATE_FORMAT.
 */
export const getLatestFileInDir = async (dir: PathLike, regex: RegExp): Promise<[string, Date]> => {
  const filesWithDate = await readFilesWithDate(dir, regex)
  if (0 === filesWithDate.length) {
    throw new Error(
      `Could not find file matching ${regex} in ${dir}. files=${filesWithDate.map(([f]) => f)}`,
    )
  }
  return filesWithDate[0]
}
export const readFilesWithDate = async (
  dir: PathLike,
  regex: RegExp,
): Promise<[string, Date][]> => {
  const files = await fsp.readdir(dir)
  return files
    .filter((f) => regex.test(f))
    .map((f) => [f, parseDate(regex.exec(f)![1], FILE_DATE_FORMAT, new Date())] as [string, Date])
    .sort(([_bFile, aDate], [_aFile, bDate]) => compareDesc(aDate, bDate))
}

/**
 * Sorts the files in a directory descendingly by the parsed date. Calls the callback on the first
 * file. If an error is thrown, the callback is called on the second file, etc...
 *
 * @param dir Directory from which to read/parse the date from files.
 * @param regex Regex matching the filenames to consider. The first capturing group must match a
 * Date in the format FILE_DATE_FORMAT.
 * @param cb The callback called with file and date.
 */
export const tryWithFilesInDir = async <R>(
  dir: PathLike,
  regex: RegExp,
  cb: (f: string, date: Date) => Promise<R>,
): Promise<R> => {
  const filesWithDate = await readFilesWithDate(dir, regex)
  for (const [f, date] of filesWithDate) {
    try {
      return await cb(f, date)
    } catch (e) {
      console.warn('Error calling callback with', f, e)
    }
  }
  throw new Error(
    `Tried ${filesWithDate.length} files. None returned a value. See log for exceptions.`,
  )
}

export const { abs, floor, ceil, round, imul, min } = Math

export async function mkdirIfNotExists(
  dir: PathLike,
  options?: number | string | fs.MakeDirectoryOptions | null,
) {
  const dirExists = await fileExists(dir)
  if (!dirExists) {
    await fsp.mkdir(dir, options)
  }
  return !dirExists
}

export const startOfNextMinute = (d: Date | number) => startOfMinute(addMinutes(d, 1))

export const startOfNextDay = (d: Date | number) => startOfDay(addDays(d, 1))

export function splitIntervalIntoCalendarDays(interval: Interval): Interval[] {
  const result = []
  let { start, end } = interval
  while (end > startOfNextDay(start)) {
    result.push({ start: start, end: startOfNextDay(start) })
    start = startOfNextDay(start)
  }
  result.push({ start, end })
  return result
}
export const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0)

export const formatMinutesHHmm = (mins: number) => {
  return ((mins / 60) | 0) + ':' + ('' + (mins % 60)).padStart(2, '0')
}
export const formatMinutes = (mins: number) => {
  return (mins / (60 * 8)).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export const isoWeekInterval = (d: Date | number) => ({
  start: startOfISOWeek(d),
  end: lastDayOfISOWeek(d),
})

export const toggle = (arr: any[], value: any) => {
  const idx = arr.indexOf(value)
  if (idx !== -1) {
    arr.splice(idx, 1)
  } else {
    arr.push(value)
  }
}

export const intRange = (startIncl: number, endExcl: number) =>
  Array(endExcl - startIncl)
    .fill(undefined)
    .map((_, i) => startIncl + i)

export const monthInterval = (d: Date | number) => ({ start: startOfMonth(d), end: endOfMonth(d) })

/**
 * Given an array `input`, returns a new array such that for all pairs (s, t) of the
 * new array, cmp(s, t) == false
 */
export const uniqCustom = <T>(input: T[], equals: (s: T, t: T) => boolean): T[] => {
  const result: T[] = []
  for (const s of input) {
    if (!result.some((t) => equals(s, t))) {
      result.push(s)
    }
  }
  return result
}

export const businessWeekInterval = (d: Date | number) => ({
  start: startOfISOWeek(d),
  end: addDays(lastDayOfISOWeek(d), -2),
})

export const getDayInterval = (date: Date) => {
  const start = startOfDay(date)
  return { start, end: addDays(start, 1) }
}

export const isBeforeOrEqual = (d: Date, d2: Date) => isBefore(d, d2) || isEqual(d, d2)

export const ilog = <T>(x: T, ...more: any[]) => (console.log(x, ...more), x)

export const roundDownToQuarterHour = (date: Date) => {
  return roundToNearestMinutes(addSeconds(date, -7.5 * 60), { nearestTo: 15 })
}

export const isoDay = (date: Date) => {
  return formatDate(date, 'yyyy-MM-dd')
}

export function omap<K extends string, T, M>(x: { [P in K]: T }, f: (t: T) => M) {
  const result: { [P in K]: M } = {} as any
  for (const k of Object.keys(x)) result[k as K] = f(x[k as K])
  return result
}

export const stringHash = (str: string) => {
  let h: number = 0
  for (let i = 0; i < str.length; i++) h = (imul(31, h) + str.charCodeAt(i)) | 0
  return h
}

export const stringHashColor = (str: string) => {
  return chroma.num(stringHash(str) & 0xffffff)
}
