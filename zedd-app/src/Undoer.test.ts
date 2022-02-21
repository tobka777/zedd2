import * as assert from 'assert'
import { makeAutoObservable, observable, makeObservable } from 'mobx'
import { Undoer } from './Undoer'

describe('Undoer', () => {
  describe('makeUndoable', () => {
    let undoer: Undoer = new Undoer()
    let a = { foo: [] as any[] }
    a = makeObservable(a, { foo: observable })

    undoer.makeUndoable(a)

    it('is undoable', () => {
      let t = { name: 'Test' }

      a.foo.push(t)
      assert.equal(a.foo.length, 1, 'push success')

      assert.equal(undoer.undoStack.length, 1, 'stack -size')

      undoer.undo()
      assert.equal(a.foo.length, 0, 'undo success')
    })
  })
})
