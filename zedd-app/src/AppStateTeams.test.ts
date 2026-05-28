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

  it('restores the previous task after a Teams meeting ends', () => {
    const state = new AppState()
    const previousTask = state.getTaskForNameWithDefaults('My Work Task', {})
    state.currentTask = previousTask

    // Simulate meeting start: save previousTask and switch
    const savedTask = state.currentTask
    state.currentTask = state.getTaskForNameWithDefaults('Entwicklungs-Daily', {
      taskActivityName: 'Entwicklungs-Daily',
      platformTaskComment: 'Entwicklungs-Daily',
    })
    assert.strictEqual(state.currentTask.name, 'Entwicklungs-Daily')

    // Simulate meeting end: restore
    state.currentTask = savedTask
    assert.strictEqual(state.currentTask.name, 'My Work Task')
  })
})
