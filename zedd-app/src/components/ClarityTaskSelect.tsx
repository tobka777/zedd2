import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { TextField, Autocomplete } from '@mui/material'
import { StandardTextFieldProps } from '@mui/material/TextField'
import { PlatformState, ClarityTask } from '../PlatformState'

export type ClarityTaskSelectProps = {
  clarityState: PlatformState
  onChange: (taskIntId: number | undefined) => void
  value: number | undefined
} & Omit<StandardTextFieldProps, 'onChange' | 'value'>

export const ClarityTaskSelect = observer(
  ({
    clarityState,
    onChange,
    value,
    style,
    disabled,
    ...textFieldProps
  }: ClarityTaskSelectProps) => {
    const maxEntries = 20

    const resolvedVal = (value !== undefined && clarityState.resolveTask(value)) || undefined

    return (
      <Autocomplete
        renderInput={(params) => <TextField {...params} {...textFieldProps} />}
        options={clarityState.tasks}
        disabled={disabled}
        style={style}
        filterOptions={(options: ClarityTask[], state) => {
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
        onChange={(_: unknown, clarityTask: ClarityTask | undefined) =>
          onChange(clarityTask?.intId)
        }
        value={resolvedVal}
        renderOption={(props, option: ClarityTask, _state) => (
          <li {...props}>
            <div style={{ width: '30%' }}>{option.projectName}</div>
            <div style={{ width: '30%' }}>{option.name}</div>
            <div style={{ width: '30%' }}>{option.strId}</div>
          </li>
        )}
        getOptionLabel={(x: ClarityTask) => (x ? x.projectName + ' / ' + x.name : '')}
      />
    )
  },
)
