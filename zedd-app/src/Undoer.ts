import {
  observe,
  IArrayDidChange,
  ISetDidChange,
  IMapDidChange,
  IObjectDidChange,
  isObservableArray,
} from 'mobx'

export class Undoer {
  private undoStack: any[] = []
  private trackUndoEvents: boolean = true
  private undoPosition: number = -1
  private readonly undoStateKey = Symbol('undoStateKey')

  public makeUndoable = (object: any): void => {
    if (!object[this.undoStateKey] && !this.isPrimitive(object)) {
      object[this.undoStateKey] = observe(
        object,
        (
          change:
            | IArrayDidChange<any>
            | ISetDidChange<any>
            | IMapDidChange<any>
            | IObjectDidChange<any>,
        ) => {
          if (this.trackUndoEvents) {
            if (change.type === 'splice' || change.type === 'update') {
              this.undoStack.length = this.undoPosition + 1
              this.undoPosition = this.undoStack.length
            } else {
              return
            }

            if (change.type === 'splice') {
              this.undoStack.push({
                type: change.type,
                added: change.added,
                removed: change.removed,
                index: change.index,
                element: change.object,
              })
              change.added.forEach((element) => {
                this.makeUndoable(element)
              })
            } else if (change.type === 'update') {
              if (isObservableArray(change.object)) {
                const updateChange = change as IArrayDidChange & { type: 'update' }
                this.undoStack.push({
                  type: updateChange.type,
                  element: updateChange.object,
                  newValue: updateChange.newValue,
                  index: updateChange.index,
                  oldValue: updateChange.oldValue,
                })
                this.makeUndoable(updateChange.newValue)
              } else {
                const updateChange = change as IObjectDidChange & { type: 'update' }
                this.undoStack.push({
                  type: change.type,
                  element: change.object,
                  newValue: updateChange.newValue,
                  name: updateChange.name,
                  oldValue: updateChange.oldValue,
                })
                this.makeUndoable(updateChange.newValue)
              }
            }
          }
        },
      )
    }
  }

  public undo(): void {
    if (this.undoPosition >= 0) {
      let action = this.undoStack[this.undoPosition]
      this.undoPosition--
      try {
        this.trackUndoEvents = false
        if (action.type === 'splice') {
          action.element.splice(action.index, action.added.length, ...action.removed)
        } else if (action.type === 'update') {
          action.element[action.name ? action.name : action.index] = action.oldValue
        }
      } finally {
        this.trackUndoEvents = true
      }
    }
  }

  public redo(): void {
    if (this.undoPosition < this.undoStack.length - 1) {
      this.undoPosition++
      let action = this.undoStack[this.undoPosition]
      try {
        this.trackUndoEvents = false
        if (action.type === 'splice') {
          action.element.splice(action.index, action.removed.length, ...action.added)
        } else if (action.type === 'update') {
          action.element[action.name ? action.name : action.index] = action.newValue
        }
      } finally {
        this.trackUndoEvents = true
      }
    }
  }

  public reset() {
    this.undoStack = []
    this.trackUndoEvents = true
    this.undoPosition = -1
  }

  public notUndoable(action: () => void) {
    try {
      this.trackUndoEvents = false
      action()
    } finally {
      this.trackUndoEvents = true
    }
  }

  private isPrimitive(element: any): boolean {
    return element !== Object(element)
  }
}
