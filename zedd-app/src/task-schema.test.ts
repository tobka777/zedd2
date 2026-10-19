import * as assert from 'assert'
import { makeObservable, observable } from 'mobx'
import { deserialize, list, serializable } from 'serializr'
import { Task } from './entities/Task'
import { migrateLegacyTaskKeys, taskSchema } from './task-schema'

class TaskListHolder {
  @serializable(list(taskSchema))
  @observable
  public tasks: Task[] = []

  constructor() {
    makeObservable(this)
  }
}

describe('migrateLegacyTaskKeys', () => {
  it('promotes legacy keys to canonical names', () => {
    const out = migrateLegacyTaskKeys({ name: 'X', platformTaskIntId: 42, platformType: 'OTT' })
    assert.strictEqual(out.intId, 42)
    assert.strictEqual(out.typ, 'OTT')
  })

  it('never overwrites an already-canonical value (idempotent)', () => {
    const out = migrateLegacyTaskKeys({
      name: 'X',
      intId: 7,
      platformTaskIntId: 99,
      typ: 'REPLICON',
      platformType: 'OTT',
    })
    assert.strictEqual(out.intId, 7)
    assert.strictEqual(out.typ, 'REPLICON')
  })

  it('returns the same reference when there is nothing to migrate', () => {
    const json = { name: 'X', intId: 1, typ: 'OTT' }
    assert.strictEqual(migrateLegacyTaskKeys(json), json)
  })

  it('does not mutate the input JSON', () => {
    const json: Record<string, unknown> = { name: 'X', platformTaskIntId: 42 }
    const out = migrateLegacyTaskKeys(json)
    assert.strictEqual(json.intId, undefined)
    assert.strictEqual(out.intId, 42)
  })

  it('passes non-object values through unchanged', () => {
    assert.strictEqual(migrateLegacyTaskKeys(null), null)
    assert.strictEqual(migrateLegacyTaskKeys(5), 5)
  })
})

describe('taskSchema (load-time migration through list)', () => {
  it('populates intId/typ from legacy on-disk keys', () => {
    const holder = deserialize(TaskListHolder, {
      tasks: [{ name: 'Legacy Task', platformTaskIntId: 42, platformType: 'OTT' }],
    })
    assert.ok(holder.tasks[0] instanceof Task)
    assert.strictEqual(holder.tasks[0].intId, 42)
    assert.strictEqual(holder.tasks[0].typ, 'OTT')
  })

  it('leaves already-canonical data untouched', () => {
    const holder = deserialize(TaskListHolder, {
      tasks: [{ name: 'New Task', intId: 7, typ: 'REPLICON' }],
    })
    assert.strictEqual(holder.tasks[0].intId, 7)
    assert.strictEqual(holder.tasks[0].typ, 'REPLICON')
  })

  it('stays stable across a serialize/re-deserialize round trip', () => {
    const first = deserialize(TaskListHolder, {
      tasks: [{ name: 'RoundTrip', platformTaskIntId: 42, platformType: 'OTT' }],
    })
    const persisted = JSON.parse(JSON.stringify(first.tasks))
    const second = deserialize(TaskListHolder, { tasks: persisted })
    assert.strictEqual(second.tasks[0].intId, 42)
    assert.strictEqual(second.tasks[0].typ, 'OTT')
  })
})
