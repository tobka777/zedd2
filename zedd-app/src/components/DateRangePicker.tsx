import { TextField, Popover } from '@mui/material'
import { DateRange } from 'react-date-range'
import { format as formatDate, toDate } from 'date-fns'
import { useCallback, useState } from 'react'
import * as React from 'react'

import 'react-date-range/dist/styles.css' // main style file
import 'react-date-range/dist/theme/default.css' // theme css file

export const DateRangePicker = ({
  value,
  onChange,
}: {
  value: Interval
  onChange: (newValue: Interval) => void
}) => {
  const [anchorEl, setAnchorEl] = useState(null as null | Element)

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      setAnchorEl(event.currentTarget)
    },
    [setAnchorEl],
  )

  const handleClose = useCallback(() => {
    setAnchorEl(null)
  }, [setAnchorEl])

  const open = Boolean(anchorEl)
  const id = open ? 'simple-popover' : undefined

  return (
    <div>
      <TextField
        aria-describedby={id}
        onClick={handleClick}
        label='Start 🡢 End'
        InputProps={{
          readOnly: true,
        }}
        style={{ minWidth: '20rem' }}
        value={formatDate(value.start, 'E, do MMMM') + ' 🡢 ' + formatDate(value.end, 'E, do MMMM')}
      />
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <DateRange
          months={2}
          editableDateInputs={true}
          onChange={(item) =>
            onChange({
              start: item.selection.startDate!,
              end: item.selection.endDate!,
            })
          }
          weekStartsOn={1}
          moveRangeOnFirstSelection={true}
          ranges={[
            {
              startDate: toDate(value.start),
              endDate: toDate(value.end),
              key: 'selection',
            },
          ]}
        />
      </Popover>
    </div>
  )
}
