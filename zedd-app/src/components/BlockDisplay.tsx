import { format } from 'date-fns'
import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { useCallback } from 'react'

import { useTheme } from '@mui/material/styles'
import { TimeSlice } from '../AppState'
import { ClarityState } from '../ClarityState'
import { SliceDragStartHandler, SliceSplitHandler } from './Calendar'

export type BlockProps = {
  slice: TimeSlice
  startDrag?: SliceDragStartHandler<TimeSlice>
  showTime?: boolean
  onSplit?: SliceSplitHandler<TimeSlice>
  onContextMenu: (e: React.MouseEvent, block: TimeSlice) => void
  onAltRightClick: (e: React.MouseEvent, block: TimeSlice) => void
  onMarkingBlock: (e: React.MouseEvent, block: TimeSlice) => void
  clarityState: ClarityState
  slicesMarked: boolean
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onContextMenu'>

export const BlockDisplay = observer(
  ({
    slice,
    slicesMarked,
    onSplit,
    startDrag,
    onContextMenu,
    onAltRightClick,
    onMarkingBlock,
    clarityState,
    style,
    className,
    ...attributes
  }: BlockProps) => {
    const blockClickHandler = useCallback(
      (e: React.MouseEvent) => {
        if (e.ctrlKey && onSplit) onSplit(slice, e)
        if (1 === e.button) onContextMenu(e, slice)
        if (0 === e.button && e.altKey === true) onAltRightClick(e, slice)
        if (0 === e.button && e.shiftKey === true) {
          setMarking((current) => !current)
          onMarkingBlock(e, slice)
        }
      },
      [slice, onSplit, onContextMenu],
    )
    const [isMarked, setMarking] = React.useState(false)

    function checkIfMarked(): boolean {
      if (!slicesMarked && isMarked) {
        setMarking((current) => !current)
      }
      return isMarked
    }

    const startHandleHandler = useCallback(
      (e: React.MouseEvent) => {
        if (e.button === 0) {
          startDrag!(slice, e, 'start')
        }
      },
      [startDrag, slice],
    )
    const startPrevHandleHandler = useCallback(
      (e: React.MouseEvent) => {
        if (e.button === 0) {
          startDrag!(slice, e, 'start+prev')
        }
      },
      [startDrag, slice],
    )
    const endHandleHandler = useCallback(
      (e: React.MouseEvent) => {
        if (e.button === 0) {
          startDrag!(slice, e, 'end')
        }
      },
      [startDrag, slice],
    )
    const completeHandleHandler = useCallback(
      (e: React.MouseEvent) => {
        if (e.button === 0) {
          startDrag!(slice, e, 'complete')
        }
      },
      [startDrag, slice],
    )

    const clarityTask = clarityState.resolveTask(slice.task.clarityTaskIntId)

    const theme = useTheme()

    return (
      <div
        {...attributes}
        key={slice?.task?.name ?? 'UNDEFINED'}
        className={'block ' + className}
        style={{
          ...style,
          padding: '2px',
          fontSize: 'smaller',
          fontWeight: 200,
          position: 'absolute',
          backgroundColor:
            'task' in slice
              ? checkIfMarked()
                ? slice.task
                    .getColor()
                    .set('hsl.s', 0.9)
                    .set('hsl.l', 'dark' === theme.palette.mode ? 0.2 : 0.8)
                    .darker()
                    .css()
                : slice.task
                    .getColor()
                    .set('hsl.s', 0.9)
                    .set('hsl.l', 'dark' === theme.palette.mode ? 0.2 : 0.8)
                    .css()
              : '#eeeeee',
          right: 0,
          left: 20,
          borderRadius: 4,
          boxSizing: 'border-box',
        }}
        // {...hotKeys}
        onClick={blockClickHandler}
        onContextMenu={(e) => onContextMenu(e, slice)}
      >
        {true && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              paddingRight: 2,
              fontSize: '80%',
              color: slice.task.getColor().set('hsl.s', 1).set('hsl.l', 0.38).css(),
            }}
          >
            {format(slice.start, 'HH:mm')} - {format(slice.end, 'HH:mm')}
          </div>
        )}
        {!clarityTask && (
          <span title='Clarity Task is unset/invalid' style={{ cursor: 'help' }}>
            ⚠️
          </span>
        )}
        {slice.task.name}{' '}
        {clarityTask && (
          <span style={{ fontFamily: 'Consolas' }}>
            {clarityTask.name}
            {slice.task.clarityTaskComment && (
              <span style={{ fontStyle: 'italic' }}>{' mK ' + slice.task.clarityTaskComment}</span>
            )}
          </span>
        )}
        {startDrag && (
          <>
            <div className='block-handle bottom-right' onMouseDown={endHandleHandler}></div>
            <div className='block-handle top-left' onMouseDown={startHandleHandler}></div>
            <div className='block-handle top-center' onMouseDown={startPrevHandleHandler}></div>
            <div className='block-handle inside' onMouseDown={completeHandleHandler}></div>
          </>
        )}
      </div>
    )
  },
)
// export const BlockDisplayShortcuts: any = withHotKeys(BlockDisplay as any, {}) as any
