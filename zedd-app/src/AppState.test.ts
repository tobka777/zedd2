// import type{ describe, it } from 'mocha'
import * as assert from 'assert'
import {
  addDays,
  addSeconds,
  differenceInSeconds,
  formatISO,
  isAfter,
  parse as dateParse,
  parseISO,
  set as dateSet,
  subSeconds,
} from 'date-fns'
import * as fs from 'fs'
import * as path from 'path'
import * as sinon from 'sinon'
import { SinonSpy } from 'sinon'

import { dateFormatString, formatInterval, AppState, TimeSlice } from './AppState'

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

describe('AppState', () => {
  describe('trackTime', () => {
    let state: AppState
    let userIsIdle: boolean
    let now: Date
    let lastUserInput: Date
    let idleCallback: SinonSpy<[Interval], void>

    function date(dateString: string) {
      return dateParse(dateString, dateFormatString, now)
    }

    function waitUntil(time: string) {
      const targetTime = calcTargetTime(now, time)
      //   console.log('waiting from', now, 'until', targetTime)

      while (true) {
        const nextNow = addSeconds(now, 10)
        if (isAfter(nextNow, targetTime)) {
          break
        }
        now = nextNow
        if (!userIsIdle) {
          lastUserInput = subSeconds(now, 2)
        }
        state.trackTime(now, differenceInSeconds(now, lastUserInput))
      }
    }
    function suspendUntil(time: string) {
      const targetTime = calcTargetTime(now, time)
      now = subSeconds(targetTime, 1)
      lastUserInput = now
      state.trackTime(now, 0)
    }
    function quitUntil(time: string) {
      const saveFileContents = state.toJsonString()

      waitUntil(time)
      state = AppState.loadFromJsonString(saveFileContents)
      state.idleSliceNotificationCallback = idleCallback
      state.trackTime(now, differenceInSeconds(now, lastUserInput))
    }

    function startTiming(what: string) {
      state.currentTask = state.getTaskForName(what)
      state.timingInProgess = true
    }
    function stopTiming() {
      state.currentTask = state.getUndefinedTask()
      state.timingInProgess = false
    }
    function leave() {
      userIsIdle = true
    }
    function comeBack() {
      userIsIdle = false
    }
    function addSlice(slice: string) {
      const [start, end, taskName] = TimeSlice.parse(slice)

      state.addSlice(new TimeSlice(start, end, state.getTaskForName(taskName)))
    }
    function checkSlices(...slices: string[]) {
      assert.deepEqual(
        state.slices.map((s) => formatInterval(s) + ' ' + s.task.name),
        slices,
        'state.slices at ' + formatISO(now),
      )
    }
    function checkIdles(...slices: string[]) {
      assert.deepEqual(
        idleCallback.args.map(([s]) => formatInterval(s)),
        slices,
        'idleCallback.args',
      )
    }

    beforeEach(() => {
      idleCallback = sinon.fake() as SinonSpy<[Interval], void>
      state = new AppState()
      state.idleSliceNotificationCallback = idleCallback
      userIsIdle = false
      now = parseISO('2020-01-01T10:00:02')
    })

    it('works with < 1 min', () => {
      startTiming('rebasing')
      waitUntil('10:00:33')

      checkSlices('2020-01-01 10:00 - 2020-01-01 10:01 rebasing')
    })

    it('works with > 1 min', () => {
      startTiming('rebasing')
      waitUntil('10:23:22')

      checkSlices('2020-01-01 10:00 - 2020-01-01 10:24 rebasing')
    })

    it('works across day boundaries', () => {
      startTiming('rebasing')
      waitUntil('2:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-02 00:00 rebasing',
        '2020-01-02 00:00 - 2020-01-02 02:00 rebasing',
      )
    })

    it('leaves no gap if the last task is < 5min ago', () => {
      startTiming('rebasing')
      waitUntil('11:00')

      stopTiming()
      waitUntil('11:03')

      startTiming('daily')
      waitUntil('11:20')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
        '2020-01-01 11:00 - 2020-01-01 11:20 daily',
      )
    })

    it('does not create multiple slices if switching rapidly', () => {
      startTiming('rebasing')
      waitUntil('10:30:10')
      startTiming('jumping')
      waitUntil('10:30:30')
      startTiming('running')
      waitUntil('10:30:40')
      startTiming('leaping')
      waitUntil('11:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 10:30 rebasing',
        '2020-01-01 10:30 - 2020-01-01 11:00 leaping',
      )
    })

    it('extends the last task if it is the same task and < 5min ago', () => {
      startTiming('rebasing')
      waitUntil('11:00')

      stopTiming()
      waitUntil('11:03')
      startTiming('rebasing')
      waitUntil('11:20')

      checkSlices('2020-01-01 10:00 - 2020-01-01 11:20 rebasing')
    })

    it('converts the last slice if it is < 5min', () => {
      startTiming('rebasing')
      waitUntil('10:02')
      startTiming('eating')
      waitUntil('12:00')

      checkSlices('2020-01-01 10:00 - 2020-01-01 12:00 eating')
    })

    it('converts the last slice if it is < 5min and < 5min ago', () => {
      startTiming('rebasing')
      waitUntil('10:04')
      stopTiming()
      waitUntil('10:08')
      startTiming('eating')
      waitUntil('12:00')

      checkSlices('2020-01-01 10:00 - 2020-01-01 12:00 eating')
    })

    it('keeps timing when the user is away < 15min', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      leave()
      waitUntil('10:30')

      checkSlices('2020-01-01 10:00 - 2020-01-01 10:30 rebasing')

      comeBack()
      waitUntil('11:00')

      checkSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    })

    it('keeps timing when the app is suspended < 15min', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      suspendUntil('10:30')

      checkSlices('2020-01-01 10:00 - 2020-01-01 10:30 rebasing')

      waitUntil('11:00')

      checkSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    })

    it('keeps timing when the app is off < 15min', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      quitUntil('10:30')

      checkSlices('2020-01-01 10:00 - 2020-01-01 10:30 rebasing')

      waitUntil('11:00')

      checkSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    })

    it('stops timing when the user is away > 15min', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      leave()
      waitUntil('11:30')

      checkSlices('2020-01-01 10:00 - 2020-01-01 10:20 rebasing')

      comeBack()
      waitUntil('12:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 10:20 rebasing',
        '2020-01-01 11:30 - 2020-01-01 12:00 rebasing',
      )
      checkIdles('2020-01-01 10:20 - 2020-01-01 11:30')
    })

    it('stops timing when the app is suspended > 15min', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      suspendUntil('11:30:20')

      waitUntil('12:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 10:20 rebasing',
        '2020-01-01 11:30 - 2020-01-01 12:00 rebasing',
      )
      checkIdles('2020-01-01 10:20 - 2020-01-01 11:30')
    })

    it('stops timing when the app is off > 15min', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      quitUntil('11:30:02')

      waitUntil('12:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 10:20 rebasing',
        '2020-01-01 11:30 - 2020-01-01 12:00 rebasing',
      )
      checkIdles('2020-01-01 10:20 - 2020-01-01 11:30')
    })

    it('tracks the correct idle time if user was away <15min before the app was suspended', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      leave()
      waitUntil('10:30')

      suspendUntil('11:00:02')
      comeBack()

      waitUntil('12:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 10:20 rebasing',
        '2020-01-01 11:00 - 2020-01-01 12:00 rebasing',
      )
      checkIdles('2020-01-01 10:20 - 2020-01-01 11:00')
    })

    it('tracks the correct idle time if the app restarts while the user is away', () => {
      startTiming('rebasing')
      waitUntil('10:20')
      leave()
      waitUntil('11:00')

      quitUntil('12:00')

      waitUntil('13:00')
      comeBack()

      waitUntil('14:00')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 10:20 rebasing',
        '2020-01-01 13:00 - 2020-01-01 14:00 rebasing',
      )
      checkIdles('2020-01-01 10:20 - 2020-01-01 13:00')
    })

    it('changes the currentTask to a task it "runs into"', () => {
      addSlice('2020-01-01 11:00 - 2020-01-01 12:00 daily')

      startTiming('rebasing')
      waitUntil('11:30')

      checkSlices(
        '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
        '2020-01-01 11:00 - 2020-01-01 12:00 daily',
      )
      assert.equal(state.currentTask.name, 'daily', 'current task name')
    })

    it('works when manually extending the current time slice', () => {
      startTiming('rebasing')
      waitUntil('11:00')

      checkSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
      state.slices[0].end = date('2020-01-01 12:00')
      waitUntil('11:30')

      checkSlices('2020-01-01 10:00 - 2020-01-01 12:00 rebasing')

      waitUntil('13:00')
      checkSlices('2020-01-01 11:00 - 2020-01-01 13:00 rebasing')
    })

    it.only('alle Stände von Sonja lassen sich laden', async () => {
      const dir = 'C:\\Users\\aleonhar\\Documents\\My Received Files\\data'
      for (const f of fs.readdirSync(dir)) {
        console.log('load ', f)
        await AppState.loadFromJsonString(fs.readFileSync(path.join(dir, f), 'utf8'))
      }
    })

    // it('is possible to switch task while in an existing slice', () => {
    //   addSlice('2020-01-01 11:00 - 2020-01-01 12:00 daily')

    //   startTiming('rebasing')
    //   waitUntil('11:30')

    //   startTiming('rebasing')
    //   waitUntil('12:00')

    //   assert.equal(state.currentTask.name, 'rebasing', 'current task name')
    //   checkSlices(
    //     '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
    //     '2020-01-01 11:00 - 2020-01-01 11:30 daily',
    //     '2020-01-01 11:30 - 2020-01-01 12:00 rebasing',
    //   )
    // })

    // it.only('', () => {
    //   addSlice('2020-01-01 11:00 - 2020-01-01 12:00 daily')

    //   startTiming('rebasing')
    //   leave()

    //   waitUntil('11:30')
    //   comeBack()

    //   assert.equal(state.currentTask.name, 'daily', 'current task name')
    //   checkSlices(
    //     '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
    //     '2020-01-01 11:00 - 2020-01-01 12:00 daily',
    //   )
    // })
  })
})
