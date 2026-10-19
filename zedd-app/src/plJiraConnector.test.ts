import * as assert from 'assert'
import type { Task as PlatformTask } from 'zedd-platform'
import { issueInfoToTask } from './plJiraConnector'

describe('plJiraConnector.issueInfoToTask', () => {
  const platformTasks: PlatformTask[] = [
    {
      name: 'Zedd Platform',
      intId: 1234,
      typ: 'REPLICON',
      projectIntId: 1,
      projectName: 'Proj Alpha',
      taskCode: 'ALPHA-1',
    },
    {
      name: 'EXT-7 Zedd Platform',
      intId: 5678,
      typ: 'OTT',
      projectIntId: 2,
      projectName: 'Proj Beta',
      taskCode: 'BETA-1',
    },
  ]

  const issue = (fields: Record<string, unknown>) => ({
    key: 'ZEDD-42',
    fields: { summary: 'Some summary', ...fields },
  })

  it('maps the platform task intId into Task.intId', async () => {
    const task = await issueInfoToTask(
      platformTasks,
      issue({ customfield_10301: ['Zedd Platform'] }),
    )
    assert.strictEqual(task.intId, '1234')
    assert.strictEqual(task.typ, 'REPLICON')
    assert.strictEqual(task.taskActivityName, undefined)
    assert.strictEqual(task.name, 'ZEDD-42: Some summary')
  })

  it('resolves the platform task via the external key field and prefixes the name', async () => {
    const task = await issueInfoToTask(
      platformTasks,
      issue({ customfield_10216: 'EXT-7', summary: 'EXT-7: Some summary' }),
    )
    assert.strictEqual(task.intId, '5678')
    assert.strictEqual(task.typ, 'OTT')
    assert.strictEqual(task.name, 'EXT-7/ZEDD-42: Some summary')
  })
})
