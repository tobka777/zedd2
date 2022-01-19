import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { TextField, Autocomplete } from '@mui/material'
import { StandardTextFieldProps } from '@mui/material/TextField'
import { ClarityState, ClarityTask } from '../ClarityState'

export type ClarityTaskSelectProps = {
  clarityState: ClarityState
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
    console.log('value ' + value + ' res ', resolvedVal)

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
        renderOption={(_props, option: ClarityTask, _state) => (
          <div key={option.name}>
            <div style={{ width: '30%' }}>{option.projectName}</div>
            <div style={{ width: '30%' }}>{option.name}</div>
            <div style={{ width: '30%' }}>{option.strId}</div>
          </div>
        )}
        getOptionLabel={(x: ClarityTask) => (x ? x.projectName + ' / ' + x.name : '')}
      />
    )
  },
)
