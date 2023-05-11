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
    const [newTaskComment, setNewTaskComment] = useState("")
    const [newTaskId, setNewTaskId] = useState(0 )
    const [newTaskName, setNewTaskName] = useState("")


    const matchingTask = state.tasks.find((t) => t.name === newTaskName.trim())
    const showWarning = newTaskName && matchingTask !== undefined


    return (
        <form>
            <Dialog
                open={true}
                onClose={() => state.addedSliceTask = false}
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
                                label='New task name '
                                type='text'
                                value={newTaskName}
                                onChange={(e) => {
                                    setNewTaskName(e.target.value)
                                }}
                                fullWidth
                                helperText={!showWarning ? '' : 'A task with this name already exists. '}
                            />
                        </Grid>
                        <Grid item xs={10} lg={15}>
                            <ClarityTaskSelect
                                value={newTaskId}
                                // disabled={task === state.getUndefinedTask()}
                                // label={`Clarity-Account for Task ${task && newTaskName}`}
                                fullWidth
                                style={{flex: '1 1 auto'}}
                                onChange={(newIntId) => (setNewTaskId(newIntId))}
                                clarityState={clarityState}
                            />
                        </Grid>
                        <Grid item xs={10} lg={11}>
                            <TextField
                                value={newTaskComment}
                                label='Clarity-Account Comment for This Task'
                                // disabled={task === state.getUndefinedTask()}
                                onChange={(e) => (setNewTaskComment(e.target.value))}
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={2} lg={1}>
                            <Tooltip title='Copy task name to task comment'>
                                <Button
                                    // disabled={!task || task === state.getUndefinedTask()}
                                    onClick={() => (setNewTaskComment(newTaskName)) }
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
                    <Button onClick={() => state.addedSliceTask = false} color='primary'>
                        Cancel
                    </Button>
                    <Button
                        type='button'
                        onClick={() => {
                            console.log("coś")
                            // state.notifyTaskInteraction(task);
                            // done(task);
                            state.addTask( new Task(newTaskName, newTaskId,"",newTaskComment))
                            setNewTaskName("")
                            setNewTaskComment("")
                            setNewTaskId("")
                        }}
                        color='primary'
                    >
                        Add
                    </Button>
                </DialogActions>
            </Dialog>
        </form>
    )

}
