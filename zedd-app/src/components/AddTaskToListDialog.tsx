import {Dialog, DialogActions, DialogContent, DialogTitle, Grid, TextField} from '@mui/material'
import Button from '@mui/material/Button'
import {format as formatDate} from 'date-fns'
import * as React from 'react'
import {useState} from 'react'

import {AppState, Task} from '../AppState'
import {ClarityState} from '../ClarityState'
import {TaskSelect} from "./TaskSelect";
import {ClarityTaskSelect} from "./ClarityTaskSelect";

export const AddTaskToListDialog = ({

                                        done,
                                        state,
                                        getTasksForSearchString,
                                        clarityState,
                                    }: {

    done: (newTask: Task | string) => void
    state: AppState
    getTasksForSearchString: (ss: string) => Promise<Task[]>
    clarityState: ClarityState
}) => {

    const [newTask, setNewTask] = useState<Task>(new Task())

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
            <form>
                <DialogContent>
                    <Grid container style={{alignItems: 'center'}} spacing={2}>
                        <Grid item xs={10} lg={15}>
                            <TaskSelect
                                tasks={state.tasks}
                                label={
                                    state.focused
                                        ? `Task for time slice ${formatDate(state.focused.start, 'do MMMM')} ${formatDate(
                                            state.focused.start,
                                            'HH:mm',
                                        )} - ${formatDate(state.focused.end, 'HH:mm')}`
                                        : 'Currently timing'
                                }
                                value={newTask}
                                onChange={(_, t) => {
                                    setNewTask(state.getTaskForName(t))
                                }}
                                fullWidth
                                style={{flex: '1 1 auto', width: '100%'}}
                                getTasksForSearchString={getTasksForSearchString}
                                handleError={(error) => state.addMessage(error.message)}
                                getHoursForTask={(t) => state.formatHours(state.getTaskHours(t))}
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
                                value={newTask.clarityTaskComment}
                                label='Clarity-Account Comment for This Task'
                                disabled={newTask === state.getUndefinedTask()}
                                onChange={(e) => (newTask.clarityTaskComment = e.target.value)}
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={2} lg={1}>
                            {/*<Tooltip title='Copy task name to task comment'>*/}
                            {/*<Button*/}
                            {/*    disabled={!newTask || newTask === state.getUndefinedTask()}*/}
                            {/*    onClick={() => (newTask.clarityTaskComment = newTask.name)}*/}
                            {/*    fullWidth*/}
                            {/*    endIcon={<CopyIcon/>}*/}
                            {/*>*/}
                            {/*    Copy*/}
                            {/*</Button>*/}
                            {/*</Tooltip>*/}
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
            </form>
        </Dialog>
    )
}
