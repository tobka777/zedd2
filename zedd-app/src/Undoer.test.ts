import * as assert from 'assert'
import { isObservable, makeAutoObservable, observable } from 'mobx'
import { Undoer } from './Undoer'

describe('Undoer', () => {
  describe('makeUndoable', () => {
    let undoer = new Undoer()
    let a = { foo: [] as any[] }

    a = makeAutoObservable(a)
    undoer.makeUndoable(a.foo)

    function reset(): void {
      undoer.reset()
      a.foo.length = 0
    }

    it('reset', () => {
      let t = { name: 'Test' }
      t = makeAutoObservable(t)

      a.foo.push(t)

      undoer.reset()

      undoer.undo()
      undoer.undo()

      assert.equal(a.foo.length, 1)

      undoer.redo()
      undoer.redo()

      assert.equal(a.foo.length, 1)
    })

    it('undo', () => {
      reset()

      let t = { name: 'Test' }
      t = makeAutoObservable(t)

      a.foo.push(t)

      assert.equal(a.foo.length, 1)

      undoer.undo()

      assert.equal(a.foo.length, 0)

      undoer.redo()

      assert.equal(a.foo.length, 1)

      t.name = 'Foo'

      assert.equal(t.name, 'Foo')

      undoer.undo()

      assert.equal(t.name, 'Test')
    })

    it('undo and redo', () => {
      reset()

      let t = { name: 'Test' }
      let v = { name: 'TestB' }

      t = makeAutoObservable(t)
      v = makeAutoObservable(v)

      a.foo.push(t)
      a.foo.push(v)

      undoer.undo()
      undoer.undo()

      assert.equal(a.foo.length, 0)

      undoer.redo()

      assert.equal(a.foo.length, 1)
      assert.equal(a.foo[0].name, 'Test')

      undoer.redo()

      assert.equal(a.foo.length, 2)
      assert.equal(a.foo[1].name, 'TestB')
    })

    it('undo, change and redo', () => {
      reset()

      let t = { name: 'TestA' }
      let v = { name: 'TestB' }
      let b = { name: 'TestC' }
      let n = { name: 'TestD' }

      t = makeAutoObservable(t)
      v = makeAutoObservable(v)

      a.foo.push(t)
      a.foo.push(v)
      a.foo.push(b)

      undoer.undo()
      undoer.undo()

      a.foo.push(n)

      undoer.redo()

      assert.equal(a.foo.length, 2)

      undoer.redo()

      assert.equal(a.foo.length, 2)
    })

    it('undo, change, redo and undo', () => {
      reset()

      let t = { name: 'TestA' }
      let v = { name: 'TestB' }
      let b = { name: 'TestC' }
      let n = { name: 'TestD' }

      t = makeAutoObservable(t)
      v = makeAutoObservable(v)

      a.foo.push(t)
      a.foo.push(v)
      a.foo.push(b)

      undoer.undo()
      undoer.undo()

      a.foo.push(n)

      undoer.redo()

      undoer.undo()

      assert.equal(a.foo.length, 1)

      undoer.undo()

      assert.equal(a.foo.length, 0)

      undoer.redo()
      undoer.redo()

      assert.equal(a.foo.length, 2)
      assert.equal(a.foo[1].name, 'TestD')
    })

    it('action not undoable', () => {
      reset()
      reset()

      let t = { name: 'TestA' }
      t = makeAutoObservable(t)

      undoer.notUndoable(() => {
        a.foo.push(t)
        t.name = 'TestB'
      })

      assert.equal(a.foo.length, 1)
      assert.equal(t.name, 'TestB')

      undoer.undo()
      undoer.undo()

      assert.equal(a.foo.length, 1)
      assert.equal(t.name, 'TestB')
    })

    it('new object propertie also undoable', () => {
      reset()

      let foo = { x: undefined as any }
      foo = makeAutoObservable(foo)

      undoer.makeUndoable(foo)

      foo.x = { bar: 2 }

      foo.x.bar = 3

      assert.equal(foo.x.bar, 3)

      undoer.undo()

      assert.equal(foo.x.bar, 2)

      undoer.undo()

      assert.equal(foo.x, undefined)

      undoer.redo()

      assert.equal(foo.x.bar, 2)

      undoer.redo()

      assert.equal(foo.x.bar, 3)
    })

    it('array did change', () => {
      reset()

      let foo = observable([1, 1, 1, 1])

      undoer.makeUndoable(foo)

      foo[1] = 2

      undoer.undo()

      assert.equal(foo[1], 1)

      undoer.redo()

      assert.equal(foo[1], 2)
    })

    it('complex array did change', () => {
      reset()

      let foo = observable([{ bar: 1 }, { bar: 1 }, { bar: 1 }])

      undoer.makeUndoable(foo)

      foo[1].bar = 2

      undoer.undo()

      assert.equal(isObservable(foo[1]), true)

      assert.equal(foo[1].bar, 1)

      undoer.redo()

      assert.equal(foo[1].bar, 2)
    })
  })
})
