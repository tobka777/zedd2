import * as assert from 'assert'

import { AppState } from './AppState'

describe('AppState Teams helpers', () => {
  it('creates new tasks with provided defaults', () => {
    const state = new AppState()
    const task = state.getTaskForNameWithDefaults('Architecture Sync', {
      taskActivityName: 'Architecture Sync',
      platformTaskComment: 'Architecture Sync',
    })

    assert.strictEqual(task.name, 'Architecture Sync')
    assert.strictEqual(task.taskActivityName, 'Architecture Sync')
    assert.strictEqual(task.platformTaskComment, 'Architecture Sync')
    assert.strictEqual(task.platformTaskIntId, undefined)
  })
})
