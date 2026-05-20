import { StandardTextFieldProps } from '@mui/material/TextField'
import { observer } from 'mobx-react-lite'
import { Autocomplete, TextField } from '@mui/material'
import * as React from 'react'
import { PlatformState } from '../PlatformState'
import { TaskActivity } from 'zedd-platform/out/src/model/task-activity.model'
import { Task } from 'zedd-platform'
import { rankByWordPrefixSimilarity, tokenizeSearchWords } from '../search'

export type TaskActivitySelectProps = {
  platformState: PlatformState
  onChange: (taskActivity: TaskActivity | undefined) => void
  platformTask: Task | undefined
  value: string | undefined
} & Omit<StandardTextFieldProps, 'onChange' | 'value'>

export const TaskActivitySelect = observer(
  ({
    platformState,
    onChange,
    value,
    platformTask,
    style,
    disabled,
    ...textFieldProps
  }: TaskActivitySelectProps) => {
    const maxEntries = 60
    const searchableActivities = React.useMemo(
      () =>
        (platformState.taskActivities ?? []).map((taskActivity) => {
          const text = taskActivity?.displayText ?? taskActivity?.name ?? ''
          return { item: taskActivity, text, words: tokenizeSearchWords(text) }
        }),
      [platformState.taskActivities],
    )

    const resolvedVal = (value !== undefined && platformState.resolveActivity(value)) || undefined

    return (
      <Autocomplete
        renderInput={(params) => <TextField {...params} {...textFieldProps} />}
        //options={platformTask?.taskActivities ?? []}
        options={platformState.taskActivities ?? []}
        disabled={disabled}
        style={style}
        filterOptions={(_options: TaskActivity[], state) => {
          return rankByWordPrefixSimilarity(
            searchableActivities,
            state.inputValue,
            maxEntries,
          )
        }}
        onChange={(_: unknown, taskActivity: TaskActivity | null) =>
          onChange?.(taskActivity ?? undefined)
        }
        value={resolvedVal ?? null}
        renderOption={(props, option) => (
          <li {...props}>
            <div style={{ width: '100%' }}>{option?.displayText ?? ''}</div>
          </li>
        )}
        getOptionLabel={(x) => x?.displayText ?? ''}
      />
    )
  },
)
