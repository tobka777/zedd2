import { Dialog, DialogActions, DialogContent, DialogTitle } from '@material-ui/core'
import Button from '@material-ui/core/Button'
import TextField from '@material-ui/core/TextField'
import * as React from 'react'
import { useState } from 'react'

import { Task } from '../AppState'

export const RenameTaskDialog = ({
  task,
  done,
}: {
  task: Task
  done: (newName: string) => void
}) => {
  const [newName, setNewName] = useState(task.name)

  return (
    <Dialog
      open={true}
      onClose={(_) => done(name)}
      aria-labelledby='form-dialog-title'
      maxWidth='lg'
    >
      <DialogTitle id='form-dialog-title'>Rename Task {task.name}</DialogTitle>
      <form>
        <DialogContent>
          <TextField
            autoFocus
            margin='dense'
            id='name'
            label='New name for Task'
            type='text'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={(_) => done(name)} color='primary'>
            Cancel
          </Button>
          <Button type='submit' onClick={(_) => done(newName)} color='primary'>
            Change
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
