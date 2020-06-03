import { TextField, TextFieldProps } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Autocomplete } from '@material-ui/lab'
import { observer } from 'mobx-react-lite'
import * as React from 'react'

import { useCallback, useState } from 'react'
import { Task } from '../AppState'
import { useDebouncedCallback } from '../util'

export type TaskSelectProps = {
  tasks: Task[]

  getTasksForSearchString: (search: string) => Promise<Task[]>
  onChange: (event: React.ChangeEvent<{}>, value: Task | string | undefined) => void
  value: Task
  handleError: (err: Error) => void
  textFieldStyle?: React.CSSProperties
  hoverMode?: boolean
  getHoursForTask: (t: Task) => string
} & Omit<TextFieldProps, 'value' | 'onChange' | 'variant'>

type CancellablePromise<T> = Promise<T> & { cancelled: boolean; cancel(): void }

function cancellable<T>(p: Promise<T>): CancellablePromise<T> {
  return {
    p,
    cancelled: false,
    then(onfulfilled) {
      return cancellable(p.then((x) => !this.cancelled && onfulfilled && onfulfilled(x)))
    },
    finally(onfinally) {
      return cancellable(p.finally(() => !this.cancelled && onfinally && onfinally()))
    },
    catch(onrejected) {
      return cancellable(p.catch((x) => !this.cancelled && onrejected && onrejected(x)))
    },
    cancel() {
      this.cancelled = true
    },
    get [Symbol.toStringTag]() {
      return p[Symbol.toStringTag]
    },
  } as CancellablePromise<T>
  // let cancel: () => void
  // const result: CancellablePromise<T> = new Promise((resolve, reject) => {
  //   let cancelled = false
  //   p.then(x => !cancelled && resolve(x)).catch(x => !cancelled && reject(x))
  //   cancel = () => (cancelled = true)
  // }) as any
  // result.cancel = cancel!
  // return result
}

function cancellingPrevious<T, F extends (...args: any[]) => Promise<T>>(
  x: F,
): (...args: Parameters<F>) => CancellablePromise<T> {
  let lastPromise: CancellablePromise<any> | undefined = undefined
  return ((...args: any[]) => {
    lastPromise && lastPromise.cancel()
    return (lastPromise = cancellable(x(...args)))
  }) as any
}

const useStyles = makeStyles((theme) => ({
  renderOptionBT: {
    textAlign: 'right',
    width: '90px',
    paddingRight: '16px',
    flex: '0 0 auto',
    color: theme.palette.text.secondary,
  },
}))

export const TaskSelect = observer(
  ({
    onChange,
    tasks,
    style,
    textFieldStyle,
    getTasksForSearchString,
    value,
    handleError,
    getHoursForTask,
    hoverMode = false,
    ...textFieldProps
  }: TaskSelectProps) => {
    const [options, setOptions] = useState([] as Task[])
    const [searching, setSearching] = useState(false)
    const [currentRequest] = useState({ id: 0 })

    const classes = useStyles()

    const getTasksForSearchStringDebounced = useDebouncedCallback(
      (searchString: string) => {
        if (searchString.length > 2) {
          setSearching(true)
          const requestId = ++currentRequest.id
          getTasksForSearchString(searchString)
            .then((ts) => requestId === currentRequest.id && setOptions(ts))
            .catch(handleError)
            .finally(() => requestId === currentRequest.id && setSearching(false))
        }
      },
      [getTasksForSearchString, currentRequest, handleError],
      500,
    )

    const onTextFieldChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => getTasksForSearchStringDebounced(e.target.value),
      [getTasksForSearchStringDebounced],
    )

    if (textFieldProps.inputProps) throw new Error('???')

    return (
      <Autocomplete
        options={[...tasks, ...options]}
        onChange={onChange}
        style={style}
        openOnFocus={false}
        value={value ?? ''}
        freeSolo
        forcePopupIcon
        autoSelect
        selectOnFocus
        loading={searching}
        loadingText='Searching for Tasks in JIRA'
        getOptionLabel={(t: Task | string) =>
          'string' === typeof t ? t : 'UNDEFINED' === t.name ? '' : t.name
        }
        renderInput={(params) => (
          <TextField
            {...params}
            {...textFieldProps}
            style={textFieldStyle}
            onChange={onTextFieldChange}
            placeholder='Nothing. Nichts. Nada. Absolument rien.'
            InputProps={params.InputProps}
            margin='dense'
          />
        )}
        renderOption={(t: Task) => (
          <>
            <span className={classes.renderOptionBT}>{getHoursForTask(t)}</span>
            <span>{t.name}</span>
          </>
        )}
      ></Autocomplete>
    )
  },
)
