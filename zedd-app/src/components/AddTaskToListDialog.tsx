import {Dialog, DialogActions, DialogContent, DialogTitle, Grid, TextField, Tooltip} from '@mui/material'
import Button from '@mui/material/Button'
import * as React from 'react'
import {useState} from 'react'

import {AppState, Task} from '../AppState'
import {ClarityState} from '../ClarityState'
import {ClarityTaskSelect} from "./ClarityTaskSelect";
import {ContentCopy as CopyIcon} from "@mui/icons-material";

export const AddTaskToListDialog = ({
                                        done,
                                        state,
                                        clarityState,
                                    }: {
    done: (newTask: Task | string) => void
    state: AppState
    getTasksForSearchString: (ss: string) => Promise<Task[]>
    clarityState: ClarityState
}) => {

    const [newTask, setNewTask] = useState(new Task())

    const matchingTask = state.tasks.find((t) => t.name === newTask.name.trim())
    const showWarning = newTask.name && matchingTask !== undefined

    return (
        <Dialog
            open={true}
            onClose={(_) => done(newTask)}
            aria-labelledby='form-dialog-title'
            maxWidth='lg'
            fullWidth
        >
            <DialogTitle id='form-dialog-title'>
                {`Plan your tasks for the future`}
            </DialogTitle>
                <DialogContent>
                    <Grid container style={{alignItems: 'center'}} spacing={2}>
                        <Grid item xs={10} lg={15}>
                            <TextField
                                autoFocus
                                error={showWarning}
                                margin='dense'
                                id='name'
                                label='Task name'
                                type='text'
                                // value={newTask}
                                onChange={(e) => {
                                    setNewTask(state.getTaskForName(e.target.value))
                                }}
                                fullWidth
                                helperText={!showWarning ? '' : 'A task with this name already exists. '}
                            />
                        </Grid>
                        <Grid item xs={10} lg={15}>
                            <ClarityTaskSelect
                                value={newTask.clarityTaskIntId}
                                disabled={newTask === state.getUndefinedTask()}
                                label={`Clarity-Account for Task ${newTask && newTask.name}`}
                                fullWidth
                                style={{flex: '1 1 auto'}}
                                onChange={(newIntId) => (newTask.clarityTaskIntId = newIntId)}
                                clarityState={clarityState}
                            />
                        </Grid>
                        <Grid item xs={10} lg={11}>
                            <TextField
                                // value={newTask.clarityTaskComment}
                                label='Clarity-Account Comment for This Task'
                                disabled={newTask === state.getUndefinedTask()}
                                onChange={(e) => (newTask.clarityTaskComment = e.target.value)}
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={2} lg={1}>
                            <Tooltip title='Copy task name to task comment'>
                                <Button
                                    disabled={!newTask || newTask === state.getUndefinedTask()}
                                    onClick={() => (newTask.clarityTaskComment = newTask.name)}
                                    fullWidth
                                    endIcon={<CopyIcon/>}
                                >
                                    Copy
                                </Button>
                            </Tooltip>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={(_) => done(newTask)} color='primary'>
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
                        Add
                    </Button>
                </DialogActions>
        </Dialog>
    )
}
