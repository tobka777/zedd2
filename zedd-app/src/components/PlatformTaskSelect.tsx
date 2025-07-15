import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { Autocomplete, TextField, Chip } from '@mui/material'
import { StandardTextFieldProps } from '@mui/material/TextField'
import { PlatformState } from '../PlatformState'
import { Task } from 'zedd-platform'

export type PlatformTaskSelectProps = {
  platformState: PlatformState
  onChange: (taskIntId: number | undefined | string) => void
  value: number | undefined | string
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
    const maxEntries = 60

    const resolvedVal = (value !== undefined && platformState.resolveTask(value)) || undefined

    return (
      <Autocomplete
        renderInput={(params) => <TextField {...params} {...textFieldProps} />}
        options={platformState.tasks}
        disabled={disabled}
        style={style}
        filterOptions={(options: Task[], state) => {
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
                  task.projectName.toLowerCase().includes(ip) ||
                  task.projectIntId.toLocaleString().includes(ip),
              )
            ) {
              result.push(task)
            }
          }
          return result
        }}
        onChange={(_: unknown, task: Task | undefined) => onChange(task?.intId)}
        value={resolvedVal}
        renderOption={(props, option: Task, _state) => (
          <li
            {...props}
            className={`${props.className ?? ''} ${
              option.typ === 'REPLICON' ? 'replicon-task' : 'ott-task'
            }`}
          >
            {option.projectName === option.name ? (
              <div style={{ width: '50%' }}>{option.projectName}</div>
            ): (
              <>
                <div style={{ width: '25%' }}>{option.projectName}</div>
                <div style={{ width: '25%' }}>{option.name}</div>
              </>
            )}
            <div style={{ width: '25%' }}>{option.taskCode}</div>
            <div style={{ width: '25%' }}><Chip label={option.typ} color={option.typ === 'REPLICON' ? 'primary' : 'secondary'} size="small" /></div>
          </li>
        )}
        getOptionLabel={(x: Task) => (x ? x.projectName + ' / ' + x.name : '')}
      />
    )
  },
)
