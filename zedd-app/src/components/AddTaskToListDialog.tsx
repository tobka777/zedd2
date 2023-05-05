import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    Menu,
    MenuItem,
    TextField,
    Tooltip
} from '@mui/material'
import Button from '@mui/material/Button'
import {format as formatDate, formatDistance} from 'date-fns'
import * as React from 'react'
import {useCallback, useRef, useState} from 'react'

import { AppState, Task, TimeSlice } from '../AppState'
import {ClarityActionType, ClarityState} from '../ClarityState'
import { TaskEditor } from './TaskEditor\
'
import {TaskSelect} from "./TaskSelect";
import {
    ContentCopy as CopyIcon,
    Edit as EditIcon,
    GetApp as ImportIcon,
    SentimentSatisfiedAlt
} from "@mui/icons-material";
import {ClarityTaskSelect} from "./ClarityTaskSelect";
import {LoadingSpinner} from "./LoadingSpinner";
import {NikuUrlInvalidError} from "zedd-clarity";
import {slice} from "lodash";

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
                    <Grid container style={{ alignItems: 'center' }} spacing={2}>
                    <Grid item xs={10} lg={11}>
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
                            // inputRef={taskSelectRef}
                            value={newTask}
                            onChange={(_, t) => {
                                setNewTask(state.getTaskForName(t))
                            }}
                            fullWidth
                            style={{ flex: '1 1 auto', width: '100%' }}
                            getTasksForSearchString={getTasksForSearchString}
                            handleError={(error) => state.addMessage(error.message)}
                            getHoursForTask={(t) => state.formatHours(state.getTaskHours(t))}
                        />
                    </Grid>
                    <Grid item xs={6} lg={9}>
                        <ClarityTaskSelect
                            value={newTask.clarityTaskIntId}
                            disabled={newTask === state.getUndefinedTask()}
                            label={`Clarity-Account for Task ${newTask && newTask.name}`}
                            fullWidth
                            style={{ flex: '1 1 auto' }}
                            onChange={(newIntId) => (newTask.clarityTaskIntId = newIntId)}
                            clarityState={clarityState}
                        />
                    </Grid>
                    <Grid item xs={2} lg={1}>
                        <Button
                            variant='text'
                            style={{ width: '100%' }}
                            disabled={!clarityState.currentlyImportingTasks}
                            onClick={() => clarityState.sileniumKill()}
                        >
                            Cancel
                        </Button>
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
                        <Tooltip title='Copy task name to task comment'>
                            <Button
                                disabled={!newTask || newTask === state.getUndefinedTask()}
                                onClick={() => (newTask.clarityTaskComment = newTask.name)}
                                fullWidth
                                endIcon={<CopyIcon />}
                            >
                                Copy
                            </Button>
                        </Tooltip>
                    </Grid>
                </Grid>
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
                        Add
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    )
}
