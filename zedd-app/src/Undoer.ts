import {
  observe,
  IArrayDidChange,
  IValueDidChange,
  ISetDidChange,
  IMapDidChange,
  IObjectDidChange,
} from 'mobx'

export class Undoer {
  private undoStack: any[] = []

  private undoing: boolean = false

  private undoPosition: number = 0

  makeUndoable = (object: any): void => {
    if (!object.x) {
      const xx = observe(
        object,
        (
          change:
            | IValueDidChange<any>
            | IArrayDidChange<any>
            | ISetDidChange<any>
            | IMapDidChange<any>
            | IObjectDidChange<any>,
        ) => {
          if (!this.undoing) {
            console.log(change)

            this.undoPosition = this.undoStack.length
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
              change.removed.forEach(() => {
                object[x]()
                object[x] = undefined
              })
            } else if (change.type === 'update') {
            }
          }
        },
      )
      let x = Symbol()
      object[x] = xx
    }
  }

  public undo(): void {
    if (this.undoPosition >= 0) {
      let action = this.undoStack[this.undoPosition]
      this.undoPosition--
      try {
        this.undoing = true
        if (action.type === 'splice') {
          action.element.splice(action.index, action.added.length, ...action.removed)
        } else if (action.type === 'update') {
        }
      } finally {
        this.undoing = false
      }
    }
  }

  public redo(): void {
    if (this.undoPosition <= this.undoStack.length) {
      this.undoPosition++
      let action = this.undoStack[this.undoPosition]
      if (!action) {
        this.undoPosition--
        return
      }
      try {
        this.undoing = true
        if (action.type === 'splice') {
          action.element.splice(action.index, action.removed.length, ...action.added)
        } else if (action.type === 'update') {
        }
      } finally {
        this.undoing = false
      }
    }
  }
}
