import * as assert from 'assert'
import { isObservable, makeAutoObservable, observable } from 'mobx'
import * as sinon from 'sinon'
import { setTimeout } from 'timers'
import { Undoer } from './Undoer'

describe('Undoer', () => {
  describe('makeUndoable', () => {
    const undoer = new Undoer()
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

    afterEach(function (done) {
      this.timeout(1200)
      setTimeout(done, 1000)
    })

    it('undo', () => {
      reset()

      let t = { name: 'Test' }

      t = makeAutoObservable(t)

      setTimeout(function () {
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
      }, 100)
    })

    it('undo and redo', () => {
      reset()

      let t = { name: 'Test' }
      let v = { name: 'TestB' }

      t = makeAutoObservable(t)

      v = makeAutoObservable(v)

      setTimeout(function () {
        a.foo.push(t)
      }, 100)

      setTimeout(function () {
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
      }, 200)
    })

    it('undo, change and redo', () => {
      reset()

      let t = { name: 'TestA' }
      let v = { name: 'TestB' }
      const b = { name: 'TestC' }
      const n = { name: 'TestD' }

      t = makeAutoObservable(t)
      v = makeAutoObservable(v)

      setTimeout(function () {
        a.foo.push(t)
      }, 100)

      setTimeout(function () {
        a.foo.push(v)
      }, 200)

      setTimeout(function () {
        a.foo.push(b)
      }, 300)

      setTimeout(function () {
        undoer.undo()
        undoer.undo()

        a.foo.push(n)

        undoer.redo()

        assert.equal(a.foo.length, 2)

        undoer.redo()

        assert.equal(a.foo.length, 2)
      }, 400)
    })

    it('undo, change, redo and undo', () => {
      reset()

      let t = { name: 'TestA' }
      let v = { name: 'TestB' }
      const b = { name: 'TestC' }
      const n = { name: 'TestD' }

      t = makeAutoObservable(t)
      v = makeAutoObservable(v)

      setTimeout(function () {
        a.foo.push(t)
      }, 100)
      setTimeout(function () {
        a.foo.push(v)
      }, 200)
      setTimeout(function () {
        a.foo.push(b)
      }, 300)

      setTimeout(function () {
        undoer.undo()
        undoer.undo()
        a.foo.push(n)
      }, 400)

      setTimeout(function () {
        undoer.redo()

        undoer.undo()

        assert.equal(a.foo.length, 1)

        undoer.undo()

        assert.equal(a.foo.length, 0)

        undoer.redo()
        undoer.redo()

        assert.equal(a.foo.length, 2)
        assert.equal(a.foo[1].name, 'TestD')
      }, 600)
    })

    it('action not undoable', () => {
      reset()
      reset()

      let t = { name: 'TestA' }
      t = makeAutoObservable(t)

      setTimeout(function () {
        undoer.notUndoable(() => {
          a.foo.push(t)
          t.name = 'TestB'
        })
      }, 100)

      setTimeout(function () {
        assert.equal(a.foo.length, 1)
        assert.equal(t.name, 'TestB')

        undoer.undo()
        undoer.undo()

        assert.equal(a.foo.length, 1)
        assert.equal(t.name, 'TestB')
      }, 200)
    })

    it('new object properties also undoable', () => {
      reset()

      let foo = { x: undefined as any }
      foo = makeAutoObservable(foo)

      undoer.makeUndoable(foo)

      setTimeout(function () {
        foo.x = { bar: 2 }
      }, 100)

      setTimeout(function () {
        foo.x.bar = 3
      }, 300)

      setTimeout(function () {
        assert.equal(foo.x.bar, 3)

        undoer.undo()

        assert.equal(foo.x.bar, 2)

        undoer.undo()

        assert.equal(foo.x, undefined)

        undoer.redo()

        assert.equal(foo.x.bar, 2)

        undoer.redo()

        assert.equal(foo.x.bar, 3)
      }, 500)
    })

    it('array did change', () => {
      reset()

      const foo = observable([1, 1, 1, 1])

      undoer.makeUndoable(foo)

      foo[1] = 2

      undoer.undo()

      assert.equal(foo[1], 1)

      undoer.redo()

      assert.equal(foo[1], 2)
    })

    it('complex array did change', () => {
      reset()

      const foo = observable([{ bar: 1 }, { bar: 1 }, { bar: 1 }])

      undoer.makeUndoable(foo)

      foo[1].bar = 2

      undoer.undo()

      assert.equal(isObservable(foo[1]), true)

      assert.equal(foo[1].bar, 1)

      undoer.redo()

      assert.equal(foo[1].bar, 2)
    })

    it('existing object properties are undoable', () => {
      reset()
      let foo = { bar: { e: 1 } }
      foo = makeAutoObservable(foo)
      undoer.makeUndoable(foo)

      foo.bar.e = 2

      undoer.undo()

      assert.equal(foo.bar.e, 1)

      undoer.redo()

      assert.equal(foo.bar.e, 2)
    })
  })

  describe('maxStackSize', () => {
    let clock: sinon.SinonFakeTimers

    beforeEach(() => (clock = sinon.useFakeTimers({ now: 1_000_000, toFake: ['Date'] })))
    afterEach(() => clock.restore())

    it('drops the oldest entries', () => {
      const undoer = new Undoer(3)
      const foo = observable({ bar: 0 })
      undoer.makeUndoable(foo)

      for (let i = 1; i <= 5; i++) {
        clock.tick(100)
        foo.bar = i
      }

      for (let i = 0; i < 5; i++) undoer.undo()
      // only the last 3 changes (3, 4, 5) can be undone
      assert.equal(foo.bar, 2)

      for (let i = 0; i < 5; i++) undoer.redo()
      assert.equal(foo.bar, 5)
    })

    it('does not split a group of entries which are undone together', () => {
      const undoer = new Undoer(3)
      const foo = observable({ bar: 0 })
      undoer.makeUndoable(foo)

      clock.tick(100)
      foo.bar = 1
      foo.bar = 2
      clock.tick(100)
      foo.bar = 3
      foo.bar = 4

      // stack would be 4 entries; the first group (1, 2) is dropped completely
      undoer.undo()
      assert.equal(foo.bar, 2)
      undoer.undo()
      assert.equal(foo.bar, 2)
    })
  })
})
