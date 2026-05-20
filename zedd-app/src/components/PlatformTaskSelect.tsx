import { observer } from 'mobx-react-lite'
import * as React from 'react'
import { Autocomplete, TextField, Chip } from '@mui/material'
import { StandardTextFieldProps } from '@mui/material/TextField'
import { PlatformState } from '../PlatformState'
import { Task } from 'zedd-platform'
import { rankByWordPrefixSimilarity } from '../search'

export type PlatformTaskSelectProps = {
  platformState: PlatformState
  onChange: (taskIntId: number | undefined) => void
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
          return rankByWordPrefixSimilarity(
            options.map((task) => ({
              item: task,
              text: [task.projectName, task.name, task.projectIntId, task.taskCode]
                .filter((x) => x !== undefined && x !== null && x !== '')
                .join(' '),
            })),
            state.inputValue,
            maxEntries,
          )
        }}
        onChange={(_: unknown, task: Task | undefined) => onChange(task?.intId)}
        value={resolvedVal ?? null}
        renderOption={(props, option: Task, _state) => (
          <li
            {...props}
            className={`${props.className ?? ''} ${
              option.typ === 'REPLICON' ? 'replicon-task' : 'ott-task'
            }`}
          >
            {option.projectName === option.name ? (
              <div style={{ width: '50%' }}>{option.projectName}</div>
            ) : (
              <>
                <div style={{ width: '25%' }}>{option.projectName}</div>
                <div style={{ width: '25%' }}>{option.name}</div>
              </>
            )}
            <div style={{ width: '25%' }}>{option.taskCode}</div>
            <div style={{ width: '25%' }}>
              <Chip
                label={option.typ}
                color={option.typ === 'REPLICON' ? 'primary' : 'secondary'}
                size='small'
              />
            </div>
          </li>
        )}
        getOptionLabel={(x: Task) =>
          x
            ? (x.projectName === x.name ? x.projectName : x.projectName + ' / ' + x.name) +
              ' / ' +
              x.taskCode
            : ''
        }
      />
    )
  },
)
