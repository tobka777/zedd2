import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { Autocomplete, TextField } from '@mui/material'
import { StandardTextFieldProps } from '@mui/material/TextField'
import { PlatformState, PlatformTask } from '../PlatformState'

export type PlatformTaskSelectProps = {
  platformState: PlatformState
  onChange: (taskIntId: number | undefined) => void
  value: number | undefined
} & Omit<StandardTextFieldProps, 'onChange' | 'value'>

export const PlatformTaskSelect = observer(
  ({
    platformState,
    onChange,
    value,
    style,
    disabled,
    ...textFieldProps
  }: PlatformTaskSelectProps) => {
    const maxEntries = 20

    const resolvedVal = (value !== undefined && platformState.resolveTask(value)) || undefined

    return (
      <Autocomplete
        renderInput={(params) => <TextField {...params} {...textFieldProps} />}
        options={platformState.tasks}
        disabled={disabled}
        style={style}
        filterOptions={(options: PlatformTask[], state) => {
          const result = []
          const inputParts = state.inputValue
            .toLowerCase()
            .replace('/', ' ')
            .trim()
            .split(/[\s*]+/)
          for (let i = 0; i < options.length && result.length <= maxEntries; i++) {
            const task = options[i]
            if (
              inputParts.every(
                (ip) =>
                  task.name.toLowerCase().includes(ip) ||
                  task.projectName.toLowerCase().includes(ip),
              )
            ) {
              result.push(task)
            }
          }
          return result
        }}
        onChange={(_: unknown, platformTask: PlatformTask | undefined) =>
          onChange(platformTask?.intId)
        }
        value={resolvedVal}
        renderOption={(props, option: PlatformTask, _state) => (
          <li {...props}>
            <div style={{ width: '30%' }}>{option.projectName}</div>
            <div style={{ width: '30%' }}>{option.name}</div>
            <div style={{ width: '30%' }}>{option.strId}</div>
          </li>
        )}
        getOptionLabel={(x: PlatformTask) => (x ? x.projectName + ' / ' + x.name : '')}
      />
    )
  },
)
