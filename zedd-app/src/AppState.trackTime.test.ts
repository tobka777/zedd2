import * as assert from 'assert'
import {
  addDays,
  addSeconds,
  differenceInSeconds,
  isAfter,
  parse as dateParse,
  parseISO,
  set as dateSet,
  subSeconds,
} from 'date-fns'

import { dateFormatString, AppState, TimeSlice, formatInterval } from './AppState'

const calcTargetTime = (now: Date, time: string) => {
  const parts = time.split(':').map((s) => +s)
  let targetTime = dateSet(now, {
    hours: parts[0],
    minutes: parts[1] ?? 0,
    seconds: parts[2] ?? 0,
  })
  if (!isAfter(targetTime, now)) {
    targetTime = addDays(targetTime, 1)
  }
  return targetTime
}

describe('AppState.trackTime boundaries (integration)', () => {
  let state: AppState
  let now: Date
  let lastUserInput: Date

  function date(dateString: string) {
    return dateParse(dateString, dateFormatString, now)
  }

  function tickUntil(time: string) {
    const targetTime = calcTargetTime(now, time)
    while (true) {
      const nextNow = addSeconds(now, 10)
      if (isAfter(nextNow, targetTime)) {
        break
      }
      now = nextNow
      lastUserInput = subSeconds(now, 2)
      state.trackTime(now, differenceInSeconds(now, lastUserInput))
    }
  }

  function startTiming(what: string) {
    state.currentTask = state.getTaskForName(what)
    state.timingInProgess = true
  }

  function addSlice(slice: string) {
    const [start, end, taskName] = TimeSlice.parse(slice)
    state.addSlice(new TimeSlice(start, end, state.getTaskForName(taskName)))
  }

  const sliceStrs = () =>
    [...state.slices]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((s) => formatInterval(s) + ' ' + s.task.name)

  function checkSlices(...slices: string[]) {
    assert.deepStrictEqual(sliceStrs(), slices, `state.slices at ${now.toISOString()}`)
  }

  beforeEach(() => {
    state = new AppState()
    now = parseISO('2020-01-01T10:00:02')
    lastUserInput = now
  })

  describe('runs into the start of an existing slice', () => {
    it('stops the running slice at the existing slice start and keeps the current task', () => {
      addSlice('2020-01-01 11:00 - 2020-01-01 12:00 daily')

      startTiming('rebasing')
      tickUntil('11:30')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
        '2020-01-01 11:00 - 2020-01-01 12:00 daily',
      )
      assert.equal(state.currentTask.name, 'rebasing', 'current task stays selected')
    })

    it('resumes the current task in a new slice once the existing slice has ended', () => {
      addSlice('2020-01-01 11:00 - 2020-01-01 12:00 daily')

      startTiming('rebasing')
      tickUntil('13:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
        '2020-01-01 11:00 - 2020-01-01 12:00 daily',
        '2020-01-01 12:00 - 2020-01-01 13:00 rebasing',
      )
    })

    it('does not overlap any slice', () => {
      addSlice('2020-01-01 11:00 - 2020-01-01 12:00 daily')
      addSlice('2020-01-01 13:00 - 2020-01-01 14:00 review')

      startTiming('rebasing')
      tickUntil('14:30')

      for (let i = 0; i < state.slices.length; i++) {
        for (let j = i + 1; j < state.slices.length; j++) {
          const a = state.slices[i]
          const b = state.slices[j]
          assert.ok(
            a.end <= b.start || b.end <= a.start,
            `slices overlap: ${formatInterval(a)} ${a.task.name} / ${formatInterval(b)} ${b.task.name}`,
          )
        }
      }
    })

    it('extends normally when there is no existing slice in the way', () => {
      startTiming('rebasing')
      tickUntil('12:30')

      checkSlices('2020-01-01 10:00 - 2020-01-01 12:30 rebasing')
    })
  })

  describe('manually extended slice end (set into the future)', () => {
    it('keeps the manual end while now is before it', () => {
      startTiming('rebasing')
      tickUntil('11:00')
      checkSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')

      state.slices[0].end = date('2020-01-01 12:00')
      tickUntil('11:30')

      checkSlices('2020-01-01 10:00 - 2020-01-01 12:00 rebasing')
    })

    it('ends at the manual end and continues in a new slice once now passes it', () => {
      startTiming('rebasing')
      tickUntil('11:00')

      state.slices[0].end = date('2020-01-01 12:00')
      tickUntil('12:30')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 12:00 rebasing',
        '2020-01-01 12:00 - 2020-01-01 12:30 rebasing',
      )
    })
  })
})
