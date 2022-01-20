import * as chroma from 'chroma.ts'
import {
  addDays,
  addMinutes,
  addSeconds,
  compareDesc,
  endOfMonth,
  endOfYear,
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
  startOfYear,
} from 'date-fns'
import { promises as fsp, PathLike } from 'fs'
import * as fs from 'fs'
import { promisify } from 'util'
import { DependencyList, useCallback } from 'react'
import { debounce } from 'lodash'

export const FILE_DATE_FORMAT = "yyyyMMdd'T'HHmm"

export const fileExists = promisify(fs.exists)

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
): Promise<boolean> {
  const dirExists = await fileExists(dir)
  if (!dirExists) {
    await fsp.mkdir(dir, options)
  }
  return !dirExists
}

export const startOfNextMinute = (d: Date | number): Date => startOfMinute(addMinutes(d, 1))

export const startOfNextDay = (d: Date | number): Date => startOfDay(addDays(d, 1))

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
export const sum = (nums: number[]): number => nums.reduce((a, b) => a + b, 0)

export const formatHoursHHmm = (hours: number): string => {
  return (hours | 0) + ':' + ('' + (((hours % 1) * 60) | 0)).padStart(2, '0')
}
export const formatHoursBT = (hours: number): string => {
  if (0 === hours) return '-'
  return (
    (hours / 8).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + '\xa0BT'
  ) // \xa0 = NBSP
}

export const isoWeekInterval = (d: Date | number): Interval => ({
  start: startOfISOWeek(d),
  end: lastDayOfISOWeek(d),
})

export const toggle = (arr: any[], value: any): void => {
  const idx = arr.indexOf(value)
  if (idx !== -1) {
    arr.splice(idx, 1)
  } else {
    arr.push(value)
  }
}

export const intRange = (startIncl: number, endExcl: number): number[] =>
  Array(endExcl - startIncl)
    .fill(undefined)
    .map((_, i) => startIncl + i)

export const monthInterval = (d: Date | number): Interval => ({
  start: startOfMonth(d),
  end: endOfMonth(d),
})

export const yearInterval = (d: Date | number): Interval => ({
  start: startOfYear(d),
  end: endOfYear(d),
})

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

export const businessWeekInterval = (d: Date | number): Interval => ({
  start: startOfISOWeek(d),
  end: addDays(lastDayOfISOWeek(d), -2),
})

export const getDayInterval = (date: Date): Interval => {
  const start = startOfDay(date)
  return { start, end: addDays(start, 1) }
}

export const isBeforeOrEqual = (d: Date, d2: Date): boolean => isBefore(d, d2) || isEqual(d, d2)

export const ilog = <T>(x: T, ...more: any[]): T => (console.log(x, ...more), x)

export const roundDownToQuarterHour = (date: Date): Date => {
  return roundToNearestMinutes(addSeconds(date, -7.5 * 60), { nearestTo: 15 })
}

export function omap<K extends string, T, M>(x: { [P in K]: T }, f: (t: T) => M): { [P in K]: M } {
  const result: { [P in K]: M } = {} as any
  for (const k of Object.keys(x)) result[k as K] = f(x[k as K])
  return result
}

export const stringHash = (str: string): number => {
  let h: number = 0
  for (let i = 0; i < str.length; i++) h = (imul(31, h) + str.charCodeAt(i)) | 0
  return h
}

export const stringHashColor = (str: string): chroma.Color => {
  return chroma.num(stringHash(str) & 0xffffff)
}

export const isoDayStr = (day: number | Date): string => formatDate(day, 'yyyy-MM-dd')

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: DependencyList,
  waitMs: number,
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(debounce(callback, waitMs), deps)
}

let nextUniqueId = 0
export function getUniqueId(): number {
  return nextUniqueId++
}
