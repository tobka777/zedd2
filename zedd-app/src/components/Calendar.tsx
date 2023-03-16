import { useTheme } from '@mui/material/styles'
import { red, grey } from '@mui/material/colors'
import * as chroma from 'chroma.ts'
import {
  addDays,
  addHours,
  addMinutes,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachDayOfInterval,
  format,
  getDay,
  getHours,
  getISOWeek,
  getISOWeekYear,
  isSameDay,
  isValid,
  isWithinInterval,
  max as dateMax,
  min as dateMin,
  isEqual as dateEqual,
  roundToNearestMinutes,
  set as dateSet,
  startOfISOWeek,
  subMinutes,
  isBefore,
  isSaturday,
  isSunday,
} from 'date-fns'
import { orderBy } from 'lodash'
import groupBy from 'lodash/groupBy'
import { transaction } from 'mobx'
import { observer, useLocalObservable } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback, useEffect, useRef, ReactElement } from 'react'

import { intRange, isoDayStr, min } from '../util'

export type SliceDragStartHandler<T extends Interval> = (
  b: T,
  e: React.MouseEvent,
  pos: 'start' | 'end' | 'start+prev' | 'complete',
) => void
export type SliceSplitHandler<T extends Interval> = (b: T, e: React.MouseEvent) => void

export interface CalendarProps<T extends Interval> {
  showing: Interval
  deleteSlice: (slice: T) => void
  markSlice: (slice: T) => void
  clearMarking: (click: boolean) => void
  startHour: number
  slices: T[]
  selectedSlice?: T
  correctSlicePositionStart: (currentSlice: Readonly<T>, newStart: Date) => Interval
  correctSlicePositionEnd: (currentSlice: Readonly<T>, newEnd: Date) => Interval
  correctSlicePositionComplete: (
    currentSlice: Readonly<T>,
    newPosition: Readonly<Interval>,
  ) => Interval | undefined
  onSliceChange: (slice: T, newPos: Interval) => void
  splitBlock: (slice: T, splitAt: Date) => void
  onSliceAdd: (slice: T) => void
  renderSlice: (
    attributes: React.HTMLAttributes<HTMLDivElement> & {
      slice: T
      startDrag: SliceDragStartHandler<T> | undefined
      onSplit: SliceSplitHandler<T> | undefined
    },
  ) => ReactElement
  getVirtualSlice: (start: Date, end: Date) => T
  holidays: Date[]
  copiedSlice: () => T | undefined
}

// const triple = (x: string) => [x, 'ctrl+' + x, 'shift+' + x]
const percent = (x: number) => '' + x * 100 + '%'
const adjustStartHour = (startHour: number, showing: Interval, slices: Interval[]) =>
  min(
    startHour,
    ...slices.filter((s) => areIntervalsOverlapping(s, showing)).map((s) => getHours(s.start)),
  )

export const minutesToScreen = (m: number) => '' + m + 'px'
const RenderSliceWrapper = observer(
  <T extends Interval>({
    blockDayStart,
    slice,
    startDrag,
    renderSlice,
    onSplit,
    overridePosition = slice,
    warning,
  }: {
    blockDayStart: Date
    slice: T
    startDrag?: SliceDragStartHandler<T> | undefined
    renderSlice: CalendarProps<T>['renderSlice']
    onSplit?: SliceSplitHandler<T> | undefined
    overridePosition?: Interval
    warning?: boolean
  }) => {
    const topMinutes = differenceInMinutes(overridePosition.start, blockDayStart)
    const heightMinutes = differenceInMinutes(overridePosition.end, overridePosition.start)
    return renderSlice({
      slice,
      style: {
        position: 'absolute',
        top: '' + minutesToScreen(topMinutes),
        height: '' + minutesToScreen(heightMinutes),
        cursor: warning ? 'no-drop' : '',
      },
      className: warning ? 'no-drop' : '',
      startDrag,
      onSplit,
    })
  },
)
const screenPxToMinutes = (px: number) => px
const CalendarBase = <T extends Interval>({
  renderSlice,
  showing,
  slices,
  correctSlicePositionStart,
  correctSlicePositionEnd,
  correctSlicePositionComplete,
  onSliceChange,
  onSliceAdd,
  startHour: minStartHour,
  deleteSlice,
  splitBlock,
  getVirtualSlice,
  holidays,
  clearMarking,
  copiedSlice,
}: CalendarProps<T>) => {
  const local = useLocalObservable(() => ({
    showTime: new Date(),
    currentlyDragging: [] as {
      block: T
      startEnd: 'start' | 'end' | 'complete'
      currentDragPosition: Interval | undefined
      offsetDragDate: Number
    }[],
    fixedShowInterval: undefined as { start: number; end: number } | undefined,
    virtualSlice: undefined as T | undefined,
    currentPositionValid: true,
    lastPointTime: undefined as Date | undefined,
  }))
  const timeBlockDivs: HTMLDivElement[] = useRef([]).current
  timeBlockDivs.length = 0

  // refresh every minute so that the "current time" bar moves correctly
  useEffect(() => {
    const refreshInterval = window.setInterval(() => (local.showTime = new Date()), 60_000)
    return () => window.clearInterval(refreshInterval)
  })

  const startHour = local.fixedShowInterval?.start ?? adjustStartHour(minStartHour, showing, slices)

  const hoursBlockMouseClick = useCallback(
    (e: React.MouseEvent) => {
      if (local.virtualSlice) {
        onSliceAdd(local.virtualSlice)
        local.virtualSlice = undefined
      } else if (e.shiftKey === false) {
        clearMarking(true)
      }
    },
    [onSliceAdd, local],
  )

  const viewportXYToTime = useCallback(
    (x: number, y: number) => {
      for (let i = 0; i < timeBlockDivs.length; i++) {
        const div = timeBlockDivs[i]
        const bb = div.getBoundingClientRect()
        if (x >= bb.left && x <= bb.right) {
          const topPx = y - bb.top
          const divTopDate = dateSet(addDays(showing.start, i), {
            hours: startHour,
          })
          const time = addMinutes(divTopDate, screenPxToMinutes(topPx))
          return time
        }
      }
      return undefined
    },
    [showing, startHour, timeBlockDivs],
  )

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      // Paste copied timeslot
      const slice = copiedSlice()
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && local.lastPointTime && slice) {
        console.log('PASTE')
        const diff = differenceInMinutes(slice.start, slice.end)
        const start = local.lastPointTime
        slice.end = addMinutes(start, diff)
        slice.start = start
        onSliceAdd(slice)
      }
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [])

  const hoursBlockMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pointTime = viewportXYToTime(e.clientX, e.clientY)
      local.lastPointTime = pointTime

      // New timeslot with CTRL
      if (
        (e.ctrlKey || e.metaKey) &&
        pointTime &&
        !slices.some((s) => isWithinInterval(pointTime, s))
      ) {
        const minTime = dateMax(slices.map((s) => s.end).filter((s) => s <= pointTime))
        const maxTime = dateMin(slices.map((s) => s.start).filter((s) => pointTime < s))
        let start = roundToNearestMinutes(subMinutes(pointTime, 30), { nearestTo: 15 })
        let end = addHours(start, 1)
        if (end > maxTime) {
          const diff = differenceInMinutes(end, maxTime)
          end = addMinutes(end, -diff)
          start = addMinutes(start, -diff)
        }
        if (start < minTime) {
          start = minTime
        }
        local.virtualSlice = local.virtualSlice || getVirtualSlice(start, end)
        // make sure we don't create an invalid slice in between the assignments
        if (isBefore(start, local.virtualSlice.start)) {
          local.virtualSlice.start = start
          local.virtualSlice.end = end
        } else {
          local.virtualSlice.end = end
          local.virtualSlice.start = start
        }
      } else {
        local.virtualSlice = undefined
      }
    },
    [slices, viewportXYToTime, getVirtualSlice, local],
  )

  const onSplit = useCallback(
    (split: T, e: React.MouseEvent) => {
      const splitDate = viewportXYToTime(e.clientX, e.clientY)
      if (splitDate) splitBlock(split, roundToNearestMinutes(splitDate, { nearestTo: 15 }))
    },
    [splitBlock, viewportXYToTime],
  )

  const dragOngoing = useCallback(
    (e: MouseEvent) => {
      const newDate = viewportXYToTime(e.clientX, e.clientY)
      if (newDate && isValid(newDate) && local.currentlyDragging.length) {
        const newDateRounded = roundToNearestMinutes(newDate, {
          nearestTo: e.ctrlKey || e.metaKey ? 5 : 15,
        })
        const refDate = local.currentlyDragging[0].block[local.currentlyDragging[0].startEnd]
        // sort currentlyDragging so that they don't overlap each other as we change start/end
        // individually, which isn't allowed
        const sorted = orderBy(local.currentlyDragging, [
          (cd) => cd.block.start,
          isBefore(newDate, refDate) ? 'asc' : 'desc',
        ])
        transaction(() => {
          sorted.forEach((cd) => {
            let newPos
            let { startEnd, block } = cd
            if (startEnd === 'start') {
              cd.currentDragPosition = { start: newDateRounded, end: block.end }
              newPos = correctSlicePositionStart(block, newDateRounded)
            } else if (startEnd === 'end') {
              cd.currentDragPosition = { start: block.start, end: newDateRounded }
              newPos = correctSlicePositionEnd(block, newDateRounded)
            } else if (startEnd === 'complete') {
              const blockSize = differenceInMinutes(block.end, block.start)
              const newStart = subMinutes(newDate, cd.offsetDragDate as number)
              const newStartRounded = roundToNearestMinutes(newStart, {
                nearestTo: 5,
              })
              const newEnd = addMinutes(newStartRounded, blockSize)
              cd.currentDragPosition = { start: newStartRounded, end: newEnd }
              newPos = correctSlicePositionComplete(block, cd.currentDragPosition!)
            }

            if (newPos) {
              cd.currentDragPosition = newPos
            }

            local.currentPositionValid = newPos !== undefined
          })
        })
      }
      if (local.currentlyDragging.length !== 0) {
        e.preventDefault()
      }
    },
    [viewportXYToTime, local],
  )
  const dragStop = useCallback(() => {
    transaction(() => {
      local.currentlyDragging.forEach((cd) => {
        if (local.currentPositionValid) {
          if (
            cd.block!.start !== cd.currentDragPosition!.start ||
            cd.block!.end !== cd.currentDragPosition!.end
          ) {
            onSliceChange(cd.block!, cd.currentDragPosition!)
          }
        }
        cd.offsetDragDate = 0
      })
    })

    local.currentlyDragging.length = 0
    local.fixedShowInterval = undefined

    window.removeEventListener('mousemove', dragOngoing)
    window.removeEventListener('mouseup', dragStop)
  }, [dragOngoing, local])
  useEffect(() => {
    window.addEventListener('mousemove', dragOngoing)
    return () => window.removeEventListener('mousemove', dragOngoing)
  }, [dragOngoing])

  const dragStart: SliceDragStartHandler<T> = useCallback(
    (clickedSlice, e, pos) => {
      const newDate = viewportXYToTime(e.clientX, e.clientY)
      let offsetDrag = differenceInMinutes(newDate as Date, clickedSlice.start)
      if ('end' === pos || 'start' === pos) {
        local.currentlyDragging.push({
          block: clickedSlice,
          startEnd: pos,
          currentDragPosition: clickedSlice,
          offsetDragDate: 0,
        })
      }
      if ('start+prev' === pos) {
        local.currentlyDragging.push({
          block: clickedSlice,
          startEnd: 'start',
          currentDragPosition: clickedSlice,
          offsetDragDate: 0,
        })
        const prevBlock = slices.find((s) => dateEqual(s.end, clickedSlice.start))
        if (prevBlock) {
          local.currentlyDragging.push({
            block: prevBlock,
            startEnd: 'end',
            currentDragPosition: prevBlock,
            offsetDragDate: 0,
          })
        }
      }
      if ('complete' === pos) {
        local.currentlyDragging.push({
          block: clickedSlice,
          startEnd: 'complete',
          currentDragPosition: clickedSlice,
          offsetDragDate: offsetDrag,
        })
      }

      local.fixedShowInterval = { start: startHour, end: getHours(showing.end) }

      window.addEventListener('mousemove', dragOngoing)
      window.addEventListener('mouseup', dragStop)

      e.preventDefault()
    },
    [dragOngoing, dragStop, startHour, local, showing, slices],
  )

  const hoursBlockMouseLeave = useCallback(
    (_: React.MouseEvent) => (local.virtualSlice = undefined),
    [local],
  )

  const endHour = 24
  const now = Date.now()
  const days = eachDayOfInterval(showing)
  const daysByCalendarWeeks = groupBy(days, (d) => startOfISOWeek(d).getTime())

  const theme = useTheme()

  const weekColorScale = chroma
    .scale((t) => chroma.hsl(t * 360, 0.75, 'dark' === theme.palette.mode ? 0.1 : 0.97))
    .out(undefined)

  const weekBorderColors = weekColorScale
    .colors(7, 'color')
    .map((c) => c.darker('dark' === theme.palette.mode ? -1 : 1).css())

  const getDayColor = (day: Date): string => {
    if (holidays.some((d) => isSameDay(d, day)) || isSaturday(day) || isSunday(day)) {
      return red[50]
    }
    return grey[50]
  }

  return (
    <div style={{ display: 'flex', flexFlow: 'row wrap' }}>
      {/* Header with year / week */}
      {Object.keys(daysByCalendarWeeks).map((startOfISOWeekStr) => {
        const firstDay = +startOfISOWeekStr
        // const _includesStartOfWeek = isSameDay(daysByCalendarWeeks[startOfISOWeekStr][0], firstDay)
        // const _includesEndOfWeek = isSameDay(
        //   last(daysByCalendarWeeks[startOfISOWeekStr])!,
        //   lastDayOfISOWeek(firstDay),
        // )
        return (
          <div
            key={'header-week-' + startOfISOWeekStr}
            style={{
              width: percent(daysByCalendarWeeks[startOfISOWeekStr].length / days.length),
              backgroundColor: 'dark' === theme.palette.mode ? '#111111' : '#eeeeee',
              padding: '2px 8px',
              // borderTopLeftRadius: includesStartOfWeek ? '8px 100%' : '0',
              // borderTopRightRadius: includesEndOfWeek ? '8px 100%' : '0',
            }}
          >
            {getISOWeekYear(firstDay)} / Week&nbsp;{getISOWeek(firstDay)}
          </div>
        )
      })}

      {/* Header with date */}
      {days.map((d) => (
        <div
          key={'header-day-' + isoDayStr(d)}
          style={{
            width: percent(1 / days.length),
            backgroundColor: getDayColor(d),
            textAlign: 'center',
          }}
        >
          {format(d, 'E, do MMM')}
        </div>
      ))}

      {/* background-hours blocks */}
      {days.map((d, i) => {
        const blockDayStart = dateSet(d, {
          hours: startHour,
          minutes: 0,
        })

        return (
          <div
            key={'hours-block-' + isoDayStr(d)}
            style={{
              position: 'relative',
              width: percent(1 / days.length),
              backgroundColor: 0 === getDay(d) % 2 ? 'green' : 'red',
              flex: '1 1 auto',
            }}
            ref={(r) => (timeBlockDivs[i] = r!)}
            onMouseMove={hoursBlockMouseMove}
            onClick={hoursBlockMouseClick}
            onMouseLeave={hoursBlockMouseLeave}
          >
            {intRange(startHour, endHour).map((x) => (
              <div
                key={d.toISOString() + 'T' + x}
                style={{
                  height: minutesToScreen(60),
                  boxSizing: 'border-box',
                  backgroundColor: getDayColor(d),
                  borderTop: `1px solid ${weekBorderColors[getDay(d)]}`,
                  fontSize: 'smaller',
                  color: weekBorderColors[getDay(d)],
                }}
              >
                {('' + x).padStart(2, '0')}
              </div>
            ))}

            {/* display blocks */}
            {slices
              .filter((s) =>
                isSameDay(
                  local.currentlyDragging.findIndex((slice) => slice.block === s) !== -1
                    ? local.currentlyDragging[
                        local.currentlyDragging.findIndex((slice) => slice.block === s)
                      ].currentDragPosition!.start
                    : s.start,
                  d,
                ),
              )
              .map((s, si) => {
                const keyMap: { [binding: string]: string[] | string } = {}
                const handlers: {
                  [binding: string]: (e: React.KeyboardEvent) => void
                } = {}

                for (const [startEnd, earlierKey, laterKey] of [
                  ['START', 'u', 'h'],
                  ['END', 'j', 'n'],
                ]) {
                  for (const [earlierLater, key] of [
                    ['EARLIER', earlierKey],
                    ['LATER', laterKey],
                  ]) {
                    const keys = []
                    for (const ctrl of ['', 'ctrl+'])
                      for (const alt of ['', 'alt+'])
                        for (const shift of ['', 'shift+']) {
                          keys.push(ctrl + alt + shift + key)
                        }
                    keyMap[startEnd + earlierLater] = keys
                    handlers[startEnd + earlierLater] = (e: React.KeyboardEvent) => {
                      const minutes = e.shiftKey ? 60 : e.ctrlKey || e.metaKey ? 5 : 15
                      const dir = 'EARLIER' === earlierLater ? -1 : 1
                      if ('START' === startEnd) {
                        correctSlicePositionStart(s, addMinutes(s.start, dir * minutes))
                        const bPrev = slices.find((_, bbi) => slices[bbi + 1] === s)
                        if (e.altKey && bPrev) {
                          correctSlicePositionEnd(bPrev, addMinutes(bPrev.end, dir * minutes))
                        }
                      } else {
                        correctSlicePositionEnd(s, addMinutes(s.end, dir * minutes))
                        const bNext = slices.find((_, bbi) => slices[bbi - 1] === s)
                        if (e.altKey && bNext) {
                          correctSlicePositionStart(bNext, addMinutes(bNext.start, dir * minutes))
                        }
                      }
                      e.preventDefault()
                    }
                  }
                }
                keyMap.DELETE_BLOCK = 'del'
                handlers.DELETE_BLOCK = (_) => deleteSlice(s)
                return (
                  <RenderSliceWrapper
                    slice={s}
                    startDrag={dragStart}
                    onSplit={onSplit}
                    key={si}
                    blockDayStart={blockDayStart}
                    renderSlice={renderSlice}
                    overridePosition={
                      local.currentlyDragging.findIndex((slice) => slice.block === s) !== -1
                        ? local.currentlyDragging[
                            local.currentlyDragging.findIndex((slice) => slice.block === s)
                          ].currentDragPosition
                        : undefined
                    }
                    warning={
                      !local.currentPositionValid &&
                      local.currentlyDragging.findIndex((slice) => slice.block === s) !== -1
                    }
                  />
                )
              })}
            {/* display current time line */}
            {isSameDay(d, now) && startHour <= getHours(now) && getHours(now) < endHour && (
              <div
                key='currentTimeMarker'
                style={{
                  position: 'absolute',
                  top: '' + minutesToScreen(differenceInMinutes(now, blockDayStart)),
                  height: minutesToScreen(1),
                  backgroundColor: 'red',
                  width: '100%',
                }}
              ></div>
            )}
            {/* virtual time slice */}
            {local.virtualSlice && isSameDay(local.virtualSlice.start, d) && (
              <RenderSliceWrapper
                slice={local.virtualSlice}
                key='virtual'
                blockDayStart={blockDayStart}
                renderSlice={renderSlice}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export const Calendar = observer(CalendarBase)
