import { Dialog, DialogActions, DialogContent, DialogTitle } from '@material-ui/core'
import Button from '@material-ui/core/Button'
import TextField from '@material-ui/core/TextField'
import * as React from 'react'
import { ReactElement, useState } from 'react'

import { AppState, Task } from '../AppState'

export const RenameTaskDialog = ({
  task,
  onClose,
  state,
}: {
  task: Task
  state: AppState
  onClose: () => void
}): ReactElement => {
  const [newName, setNewName] = useState(task.name)

  const matchingTask = state.tasks.find((t) => t.name === newName)
  const showWarning = !!newName && matchingTask !== undefined && matchingTask !== task

  return (
    <Dialog open={true} onClose={onClose} aria-labelledby='form-dialog-title' maxWidth='lg'>
      <DialogTitle id='form-dialog-title'>Rename Task {task.name}</DialogTitle>
      <form>
        <DialogContent>
          <TextField
            autoFocus
            error={showWarning}
            margin='dense'
            id='name'
            label='New name for Task'
            type='text'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth
            helperText={!showWarning ? '' : 'A task with this name already exists.'}
          />
          {showWarning}
        </DialogContent>
        <DialogActions>
          <Button color='primary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='submit'
            disabled={showWarning}
            onClick={(_) => {
              task.name = newName
              onClose()
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
