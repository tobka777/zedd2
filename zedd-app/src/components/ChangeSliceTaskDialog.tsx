import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import Button from '@mui/material/Button'
import { format as formatDate } from 'date-fns'
import * as React from 'react'
import { useState } from 'react'

import { AppState, Task, TimeSlice } from '../AppState'
import { ClarityState } from '../ClarityState'
import { TaskEditor } from './TaskEditor'

export const ChangeSliceTaskDialog = ({
  slice,
  done,
  state,
  getTasksForSearchString,
  clarityState,
}: {
  slice: TimeSlice
  done: (newTask: Task | string) => void
  state: AppState
  getTasksForSearchString: (ss: string) => Promise<Task[]>
  clarityState: ClarityState
}) => {
  const [newTask, setNewTask] = useState(slice.task)

  return (
    <Dialog
      open={true}
      onClose={(_) => done(slice.task)}
      aria-labelledby='form-dialog-title'
      maxWidth='lg'
      fullWidth
    >
      <DialogTitle id='form-dialog-title'>
        {`Task for Time Slice ${formatDate(slice.start, 'do MMMM')} ${formatDate(
          slice.start,
          'HH:mm',
        )} - ${formatDate(slice.end, 'HH:mm')}`}
      </DialogTitle>
      <form>
        <DialogContent>
          <TaskEditor
            clarityState={clarityState}
            value={newTask}
            state={state}
            onTaskSelectChange={setNewTask}
            getTasksForSearchString={getTasksForSearchString}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={(_) => done(slice.task)} color='primary'>
            Cancel
          </Button>
          <Button
            type='submit'
            onClick={(_) => {
              state.notifyTaskInteraction(newTask)
              done(newTask)
            }}
            color='primary'
          >
            Change
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
