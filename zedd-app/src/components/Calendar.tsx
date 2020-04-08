import { useTheme } from '@material-ui/core/styles'
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
  lastDayOfISOWeek,
  max as dateMax,
  min as dateMin,
  roundToNearestMinutes,
  set as dateSet,
  startOfISOWeek,
  subMinutes,
  isBefore,
} from 'date-fns'
import { last } from 'lodash'
import groupBy from 'lodash/groupBy'
import { observer, useLocalStore } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback, useEffect, useRef, ReactElement } from 'react'

import { intRange, isoDayStr, min } from '../util'

export type SliceDragStartHandler<T extends Interval> = (
  b: T,
  e: React.MouseEvent,
  pos: 'start' | 'end' | 'start+prev',
) => void
export type SliceSplitHandler<T extends Interval> = (b: T, e: React.MouseEvent) => void

export interface CalendarProps<T extends Interval> {
  showing: Interval
  deleteSlice: (slice: T) => void
  startHour: number
  slices: T[]
  selectedSlice?: T
  onSliceStartChange: (slice: T, newStart: Date) => void
  onSliceEndChange: (slice: T, newEnd: Date) => void
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
  }: {
    blockDayStart: Date
    slice: T
    startDrag?: SliceDragStartHandler<T> | undefined
    renderSlice: CalendarProps<T>['renderSlice']
    onSplit?: SliceSplitHandler<T> | undefined
  }) => {
    const topMinutes = differenceInMinutes(slice.start, blockDayStart)
    const heightMinutes = differenceInMinutes(slice.end, slice.start)
    return renderSlice({
      slice,
      style: {
        position: 'absolute',
        top: '' + minutesToScreen(topMinutes),
        height: '' + minutesToScreen(heightMinutes),
      },
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
  onSliceStartChange,
  onSliceEndChange,
  onSliceAdd,
  startHour: minStartHour,
  deleteSlice,
  splitBlock,
  getVirtualSlice,
}: CalendarProps<T>) => {
  const local = useLocalStore(() => ({
    showTime: new Date(),
    currentlyDragging: [] as { block: T; startEnd: 'start' | 'end' }[],
    fixedShowInterval: undefined as { start: number; end: number } | undefined,
    virtualSlice: undefined as T | undefined,
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
    (_: React.MouseEvent) => {
      if (local.virtualSlice) {
        onSliceAdd(local.virtualSlice)
        local.virtualSlice = undefined
      }
    },
    [onSliceAdd],
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
    [showing, startHour],
  )

  const hoursBlockMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pointTime = viewportXYToTime(e.clientX, e.clientY)
      if (e.ctrlKey && pointTime && !slices.some((s) => isWithinInterval(pointTime, s))) {
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
    [viewportXYToTime],
  )

  const onSplit = useCallback(
    (split: T, e: React.MouseEvent) => {
      const splitDate = viewportXYToTime(e.clientX, e.clientY)
      if (splitDate) splitBlock(split, roundToNearestMinutes(splitDate, { nearestTo: 15 }))
    },
    [splitBlock],
  )

  const dragOngoing = useCallback(
    (e: MouseEvent) => {
      local.currentlyDragging.forEach(({ block, startEnd }) => {
        const newDate = viewportXYToTime(e.clientX, e.clientY)
        if (newDate && isValid(newDate))
          ('start' === startEnd ? onSliceStartChange : onSliceEndChange)(
            block,
            roundToNearestMinutes(newDate, { nearestTo: e.ctrlKey ? 5 : 15 }),
          )
      })
      if (local.currentlyDragging.length !== 0) {
        e.preventDefault()
      }
    },
    [viewportXYToTime],
  )
  const dragStop = useCallback(() => {
    local.currentlyDragging.length = 0
    local.fixedShowInterval = undefined
    window.removeEventListener('mouseup', dragStop)
    window.removeEventListener('mousemove', dragOngoing)
  }, [dragOngoing])
  useEffect(() => {
    window.addEventListener('mousemove', dragOngoing)
    return () => window.removeEventListener('mousemove', dragOngoing)
  }, [dragOngoing])

  const dragStart: SliceDragStartHandler<T> = useCallback(
    (block, e, pos) => {
      console.log('dragStart', pos)
      if ('end' === pos || 'start' === pos) {
        local.currentlyDragging.push({ block, startEnd: pos })
      }
      if ('start+prev' === pos) {
        local.currentlyDragging.push({ block, startEnd: 'start' })
        const prevBlock = slices.find((s) => s.end === block.start)!
        if (prevBlock) local.currentlyDragging.push({ block: prevBlock, startEnd: 'end' })
      }

      local.fixedShowInterval = { start: startHour, end: getHours(showing.end) }

      window.addEventListener('mouseup', dragStop)
      window.addEventListener('mousemove', dragOngoing)

      e.preventDefault()
    },
    [dragOngoing, dragStop, startHour],
  )

  const hoursBlockMouseLeave = useCallback(
    (_: React.MouseEvent) => (local.virtualSlice = undefined),
    [],
  )

  const endHour = 24
  const now = Date.now()
  const days = eachDayOfInterval(showing)
  const daysByCalendarWeeks = groupBy(days, (d) => startOfISOWeek(d).getTime())

  const theme = useTheme()

  const weekColorScale = chroma
    .scale((t) => chroma.hsl(t * 360, 0.75, 'dark' === theme.palette.type ? 0.1 : 0.97))
    .out(undefined)

  const weekColors = weekColorScale.colors(7, 'color').map((c) => c.css())
  const weekBorderColors = weekColorScale
    .colors(7, 'color')
    .map((c) => c.darker('dark' === theme.palette.type ? -1 : 1).css())

  return (
    <div style={{ display: 'flex', flexFlow: 'row wrap' }}>
      {/* Header with year / week */}
      {Object.keys(daysByCalendarWeeks).map((startOfISOWeekStr) => {
        const firstDay = +startOfISOWeekStr
        const _includesStartOfWeek = isSameDay(daysByCalendarWeeks[startOfISOWeekStr][0], firstDay)
        const _includesEndOfWeek = isSameDay(
          last(daysByCalendarWeeks[startOfISOWeekStr])!,
          lastDayOfISOWeek(firstDay),
        )
        return (
          <div
            key={'header-week-' + startOfISOWeekStr}
            style={{
              width: percent(daysByCalendarWeeks[startOfISOWeekStr].length / days.length),
              backgroundColor: 'dark' === theme.palette.type ? '#111111' : '#eeeeee',
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
            backgroundColor: weekColors[getDay(d)],
            textAlign: 'center',
          }}
        >
          {format(d, 'E, do MMMM')}
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
                  backgroundColor: weekColors[getDay(d)],
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
              .filter(({ start }) => isSameDay(start, d))
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
                      const minutes = e.shiftKey ? 60 : e.ctrlKey ? 5 : 15
                      const dir = 'EARLIER' === earlierLater ? -1 : 1
                      if ('START' === startEnd) {
                        onSliceStartChange(s, addMinutes(s.start, dir * minutes))
                        const bPrev = slices.find((_, bbi) => slices[bbi + 1] === s)
                        if (e.altKey && bPrev) {
                          onSliceEndChange(bPrev, addMinutes(bPrev.end, dir * minutes))
                        }
                      } else {
                        onSliceEndChange(s, addMinutes(s.end, dir * minutes))
                        const bNext = slices.find((_, bbi) => slices[bbi - 1] === s)
                        if (e.altKey && bNext) {
                          onSliceStartChange(bNext, addMinutes(bNext.start, dir * minutes))
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

// cast here so generic <T extends Interval> is not lost
export const Calendar: typeof CalendarBase = observer(CalendarBase) as any
