import {Dialog, DialogActions, DialogContent, DialogTitle, Grid, TextField, Tooltip} from '@mui/material'
import Button from '@mui/material/Button'
import * as React from 'react'
import {useState} from 'react'

import {AppState, Task} from '../AppState'
import {ClarityState} from '../ClarityState'
import {ClarityTaskSelect} from "./ClarityTaskSelect";
import {ContentCopy as CopyIcon} from "@mui/icons-material";
import {TaskSelect} from "./TaskSelect";
import {format as formatDate} from "date-fns";

export const AddTaskToListDialog = ({
                                        state,
                                        clarityState,
                                        getTasksForSearchString,
                                        // onTaskSelectChange,
                                    }: {
    // onTaskSelectChange: (t: Task) => void
    state: AppState
    getTasksForSearchString: (ss: string) => Promise<Task[]>
    clarityState: ClarityState
}) => {
    const [newTask, setNewTask] = useState(new Task())
    const [showError, setShowError] = useState(true);
    const [isDuplicateTask, setIsDuplicateTask] = useState(false);

    const matchingTask = state.tasks.some((t) => t.name === newTask.name.trim())
    const showWarning =  newTask.name && matchingTask !== undefined  && matchingTask || (newTask.name.trim() === "")

    // const task = new Task(newTaskName, newTaskId, undefined, newTaskComment);

    const handleAddTask = () => {
            state.addTask(newTask);
            setNewTask(new Task())

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
                            onChangeCapture={(e) => {
                                // setNewTask(new Task(e.target.value))
                                const matchingTask = state.tasks.some((t) => t.name === e.target.value.trim())
                                const showWarning = matchingTask || e.target.value.trim() === ""
                                if(showWarning ){
                                    setIsDuplicateTask(true)
                                }else {
                                    setIsDuplicateTask(false)
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
                            error={isDuplicateTask}
                            helperText={!isDuplicateTask ? '' : 'A task with this name already exists.'}
                        />
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
                            disabled={newTask.name === state.getUndefinedTask().name}
                            onChange={(e) => {
                                // const updatedTask = { ...newTask, clarityTaskComment: e.target.value }
                                //  (newTask.clarityTaskComment = e.target.value)
                                setNewTask(new Task(newTask.name, newTask.clarityTaskIntId, newTask.key, e.target.value))
                            }}
                            fullWidth
                        />
                    </Grid>
                    <Grid item xs={2} lg={1}>
                        <Tooltip title='Copy task name to task comment'>
                            <Button
                                // disabled={!task || task === state.getUndefinedTask()}
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
                <Button onClick={() => state.addedSliceTask = false} color='primary'>
                    Cancel
                </Button>
                <Button
                    type='button'
                    onClick={handleAddTask}
                    color='primary'
                    disabled={isDuplicateTask}
                >
                    Add
                </Button>
            </DialogActions>
        </Dialog>

    )

}
