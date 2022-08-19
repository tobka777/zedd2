import {
  observe,
  IArrayDidChange,
  ISetDidChange,
  IMapDidChange,
  IObjectDidChange,
  isObservableArray,
  isObservable,
} from 'mobx'

export class Undoer {
  private undoStack: any[] = []
  private trackUndoEvents: boolean = true
  private undoPosition: number = -1
  private readonly undoStateKey = Symbol('undoStateKey')

  public makeUndoable = (object: any): void => {
    if (!object[this.undoStateKey] && !this.isPrimitive(object) && !this.isDate(object)) {
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
            const currentTimeStamp = Math.floor(Date.now() / 10)
            if (change.type === 'splice') {
              this.undoStack.push({
                type: change.type,
                added: change.added,
                removed: change.removed,
                index: change.index,
                element: change.object,
                timeStamp: currentTimeStamp,
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
                  timeStamp: currentTimeStamp,
                })
                this.makeUndoable(updateChange.newValue)
              } else {
                const updateChange = change as IObjectDidChange & { type: 'update' }
                this.undoStack.push({
                  type: updateChange.type,
                  element: updateChange.object,
                  newValue: updateChange.newValue,
                  name: updateChange.name,
                  oldValue: updateChange.oldValue,
                  timeStamp: currentTimeStamp,
                })
                this.makeUndoable(updateChange.newValue)
              }
            }
          }
        },
      )
    }
    if (isObservable(object)) {
      Object.keys(object).forEach((key) => {
        if (object[key]) {
          this.makeUndoable(object[key])
        }
      })
    }
  }

  public undo(): void {
    if (this.undoPosition >= 0) {
      let action = this.undoStack[this.undoPosition]
      this.undoPosition--
      try {
        this.trackUndoEvents = false
        if (action.type === 'splice') {
          const timeStampToDelete = action.timeStamp
          action.element.splice(action.index, action.added.length, ...action.removed)
          if (this.undoStack[this.undoPosition]) {
            if (timeStampToDelete - this.undoStack[this.undoPosition].timeStamp <= 6) {
              this.undo()
            }
          }
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
          const timeStampToRedo = action.timeStamp
          action.element[action.name ? action.name : action.index] = action.newValue
          if (this.undoStack[this.undoPosition + 1]) {
            if (this.undoStack[this.undoPosition + 1].timeStamp - timeStampToRedo <= 6) {
              this.redo()
            }
          }
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

  private isDate(element: any): boolean {
    return Object.prototype.toString.call(element) === '[object Date]'
  }
}
