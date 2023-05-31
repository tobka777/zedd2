import {Dialog, DialogActions, DialogContent, DialogTitle, Grid} from '@mui/material'
import Button from '@mui/material/Button'
import * as React from 'react'
import {ChangeEvent, useEffect, useState} from 'react'

import {AppState, Task} from '../AppState'
import {TaskSelect} from "./TaskSelect";
import {format as formatDate} from "date-fns";

export const DeleteTaskDialog = ({
                                     state,
                                     getTasksForSearchString,
                                 }: {
    state: AppState
    getTasksForSearchString: (ss: string) => Promise<Task[]>
}) => {
    const [newTask, setNewTask] = useState(new Task("", undefined, "", ""))
    const [isDuplicateOrEmptyTask, setIsDuplicateOrEmptyTask] = useState(true);


    useEffect(() => {
        const matchingTask = state.tasks.some((t) => t.name === newTask.name)
        if (matchingTask) {
            setIsDuplicateOrEmptyTask(() => {
                return false
            })
        } else {
            setIsDuplicateOrEmptyTask(() => {
                return true
            })
        }
    }, [newTask.name, state.tasks])

    return (

        <Dialog
            open={true}
            onClose={() => state.addedSliceTask = false}
            aria-labelledby='form-dialog-title'
            maxWidth='xs'
            fullWidth
        >
            <DialogTitle id='form-dialog-title'>
                {`Delete tasks from the list`}
            </DialogTitle>

            <DialogContent>
                <Grid container style={{alignItems: 'center'}} spacing={2}>
                    <Grid item xs={10} lg={12}>
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
                                setNewTask(new Task(e.target.value))
                            }}
                            onChange={(_, t) => {
                                if (typeof t === 'string') {
                                    setNewTask(() => {
                                        return new Task(t);
                                    });
                                }
                                if (t instanceof Task) {
                                    setNewTask(() => {
                                        return t;
                                    });
                                }
                            }}
                            fullWidth
                            style={{flex: '1 1 auto', width: '100%'}}
                            getTasksForSearchString={getTasksForSearchString}
                            handleError={(error) => state.addMessage(error.message)}
                            getHoursForTask={(t) => state.formatHours(state.getTaskHours(t))}
                        />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => {
                    state.deletedTask = false
                    setIsDuplicateOrEmptyTask(false)
                }} color='primary'>
                    Cancel
                </Button>
                <Button
                    disabled={isDuplicateOrEmptyTask}
                    onClick={() => {
                        state.removeTask(newTask)
                        console.log("newTask.name3: " + newTask.name)
                        setNewTask(new Task("", undefined, "", ""))
                    }}
                >
                    Delete
                </Button>
            </DialogActions>
        </Dialog>

    )

}
