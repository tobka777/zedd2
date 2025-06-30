import { MenuItemConstructorOptions } from 'electron'
import { AppState, Task } from './AppState'
import { PlatformState } from './PlatformState'

export const suggestedTaskMenuItems = (
  state: AppState,
  platformState: PlatformState,
  checked: Task,
  onClick: (t: Task) => void,
): MenuItemConstructorOptions[] => {
  return state.getTasksForMenu().map(
    (t): MenuItemConstructorOptions => ({
      label: t.name,
      sublabel:
        // U+2007 = FIGURE SPACE (space the width of a number)
        state.formatHours(state.getTaskHours(t)).padStart(6, '\u2007') +
        ((x) => (x ? '   ' + x.projectName + ' / ' + x.name : ''))(
          platformState.resolveTask(t.platformTaskIntId),
        ),
      type: 'checkbox',
      checked: checked === t,
      click: (x) => {
        onClick(state.getTaskForName(x.label))
        const newTask = state.getTaskForName(x.label)
        const sliceIndex = state.markedSlices.findIndex((e) => e.task === newTask)
        if (sliceIndex !== -1) {
          state.markedSlices.forEach((e) => {
            e!.task = newTask
          })
        }
        state.clearMarking()
        state.notifyTaskInteraction(state.getTaskForName(x.label))
      },
    }),
  )
}
