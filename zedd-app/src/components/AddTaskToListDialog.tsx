import {Dialog, DialogActions, DialogContent, DialogTitle, Grid, TextField, Tooltip} from '@mui/material'
import Button from '@mui/material/Button'
import * as React from 'react'
import {ChangeEvent, useState} from 'react'

import {AppState, Task} from '../AppState'
import {ClarityState} from '../ClarityState'
import {ClarityTaskSelect} from "./ClarityTaskSelect";
import {ContentCopy as CopyIcon, Delete} from "@mui/icons-material";
import {TaskSelect} from "./TaskSelect";
import {format as formatDate} from "date-fns";

export const AddTaskToListDialog = ({
                                        state,
                                        clarityState,
                                        getTasksForSearchString,
                                    }: {
    state: AppState
    getTasksForSearchString: (ss: string) => Promise<Task[]>
    clarityState: ClarityState
}) => {
    const [newTask, setNewTask] = useState(new Task())
    const [isDuplicateOrEmptyTask, setIsDuplicateOrEmptyTask] = useState(true);
    const [initHandler, setInitHandler] = useState(false);


    const handleAddTask = () => {
        state.addTask(newTask);
        setNewTask(new Task())
        setIsDuplicateOrEmptyTask(true)
    };
    return (

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
                    <Grid item xs={10} lg={11}>
                        <TaskSelect
                            tasks={state.tasks}
                            label={
                                state.focused
                                    ? `Task for time slice ${formatDate(state.focused.start, 'do MMMM')} ${formatDate(
                                        state.focused.start,
                                        'HH:mm',
                                    )} - ${formatDate(state.focused.end, 'HH:mm')}`
                                    : 'Task name'
                            }
                            value={newTask}
                            onChangeCapture={(e: ChangeEvent<HTMLInputElement>) => {
                                const matchingTask = state.tasks.some((t) => t.name === e.target.value.trim())
                                const showWarning = matchingTask || e.target.value.trim() === ""

                                if (showWarning) {
                                    setIsDuplicateOrEmptyTask(true)
                                    setInitHandler(true)
                                } else {
                                    setIsDuplicateOrEmptyTask(false)
                                    setInitHandler(false)
                                }

                            }}
                            onChange={(_, t) => {
                                if (typeof t === 'string') {
                                    setNewTask(new Task(t));
                                }
                                if (t instanceof Task) {
                                    setNewTask(t);
                                }
                            }}
                            fullWidth
                            style={{flex: '1 1 auto', width: '100%'}}
                            getTasksForSearchString={getTasksForSearchString}
                            handleError={(error) => state.addMessage(error.message)}
                            getHoursForTask={(t) => state.formatHours(state.getTaskHours(t))}
                            error={isDuplicateOrEmptyTask && initHandler}
                            helperText={isDuplicateOrEmptyTask && initHandler ? 'A task with this name already exists.' : ''}
                        />
                    </Grid>
                    <Grid item xs={2} lg={1}>
                        <Button
                            disabled={newTask === state.getUndefinedTask()}
                            onClick={() => {
                                state.removeTask(newTask)
                                setNewTask(new Task("",undefined,"",""))
                            }}
                            style={{width: '100%'}}
                            endIcon={<Delete/>}
                        >
                            Delete
                        </Button>
                    </Grid>
                    <Grid item xs={10} lg={15}>
                        <ClarityTaskSelect
                            value={newTask.clarityTaskIntId}
                            disabled={newTask.name === state.getUndefinedTask().name}
                            label={`Clarity-Account for Task ${newTask.name}`}
                            fullWidth
                            style={{flex: '1 1 auto'}}
                            onChange={(newIntId) =>
                                (setNewTask(new Task(newTask.name, newIntId, newTask.key, newTask.clarityTaskComment)))}
                            clarityState={clarityState}
                        />
                    </Grid>
                    <Grid item xs={10} lg={11}>
                        <TextField
                            value={newTask.clarityTaskComment}
                            label='Clarity-Account Comment for This Task'
                            disabled={newTask === state.getUndefinedTask()}
                            onChange={(e) => {
                                setNewTask(new Task(newTask.name, newTask.clarityTaskIntId, newTask.key, e.target.value))
                            }}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={2} lg={1}>
                        <Tooltip title='Copy task name to task comment'>
                            <Button
                                disabled={!newTask || newTask === state.getUndefinedTask()}
                                onClick={() =>
                                    setNewTask(new Task(newTask.name, newTask.clarityTaskIntId, newTask.key, newTask.name))
                                }
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
                <Button onClick={() => {
                    state.addedSliceTask = false
                    setIsDuplicateOrEmptyTask(false)
                }} color='primary'>
                    Cancel
                </Button>
                <Button
                    type='button'
                    onClick={handleAddTask}
                    color='primary'
                    disabled={isDuplicateOrEmptyTask}
                >
                    Add
                </Button>
            </DialogActions>
        </Dialog>

    )

}
