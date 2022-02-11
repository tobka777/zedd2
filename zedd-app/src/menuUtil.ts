import { MenuItemConstructorOptions } from 'electron'
import { AppState, Task } from './AppState'
import { ClarityState } from './ClarityState'

export const suggestedTaskMenuItems = (
  state: AppState,
  clarityState: ClarityState,
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
          clarityState.resolveTask(t.clarityTaskIntId),
        ),
      type: 'checkbox',
      checked: checked === t,
      click: (x) => {
        onClick(state.getTaskForName(x.label))
        state.notifyTaskInteraction(state.getTaskForName(x.label))
      },
    }),
  )
}
