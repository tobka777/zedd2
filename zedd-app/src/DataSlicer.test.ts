import * as assert from 'assert'
import { parse as dateParse } from 'date-fns'
import type { PlatformExportFormat, Task as PlatformTask, WorkEntry } from 'zedd-platform'
import type { SliceInput } from './DataSlicer'
import {
  buildExportForPlatform,
  buildProjectViewGrouping,
  generateId,
  mergeExports,
  normalizeCatalogTask,
  placeholderPlatformTask,
  sliceToExport,
  smartRound,
} from './DataSlicer'
import { hashStringToInt } from './util'

const date = (s: string): Date => dateParse(s, 'yyyy-MM-dd HH:mm', new Date())

const resolvedTask: PlatformTask = {
  name: 'Backend',
  intId: 42,
  projectIntId: 10,
  projectName: 'Proj Alpha',
  taskCode: 'ALPHA-1',
  typ: 'REPLICON',
}
const resolveTask = (intId?: number | string): PlatformTask | undefined =>
  intId === 42 ? resolvedTask : undefined

const slice = (
  start: string,
  end: string,
  task: { name: string; intId?: number; taskActivityName?: string; comment?: string },
): SliceInput => ({
  start: date(start),
  end: date(end),
  task: {
    name: task.name,
    intId: task.intId,
    taskActivityName: task.taskActivityName,
    platformTaskComment: task.comment ?? '',
  },
})

const showing: Interval = { start: date('2026-03-02 00:00'), end: date('2026-03-04 00:00') }

const entry = (
  over: Partial<WorkEntry> & Pick<WorkEntry, 'id' | 'taskIntId' | 'platformType'>,
): WorkEntry => ({
  hours: 1,
  projectName: 'P',
  projectIntId: 1,
  taskName: 'T',
  taskCode: 'C',
  ...over,
})

describe('smartRound', () => {
  it('works for [2.1, 2.1] nearestTo=0.25', () => {
    const smartRounded = smartRound(
      [
        [2.1, 'A'],
        [2.1, 'B'],
      ] as [number, string][],
      ([x]) => x,
      0.25,
    )
    assert.deepEqual(smartRounded, [
      [2.25, [2.1, 'A']],
      [2.0, [2.1, 'B']],
    ])
  })
  it('rounds one value up when enough values are slightly above rounded', () => {
    const smartRounded = smartRound(
      [
        [2.01, 'A'],
        [2.02, 'B'],
        [2.03, 'C'],
        [2.04, 'D'],
        [2.05, 'E'],
      ] as [number, string][],
      ([x]) => x,
      0.25,
    )
    assert.deepEqual(smartRounded, [
      [2.25, [2.05, 'E']],
      [2, [2.04, 'D']],
      [2, [2.03, 'C']],
      [2, [2.02, 'B']],
      [2, [2.01, 'A']],
    ])
  })
  it('should work with nearestTo=1/3', () => {
    const smartRounded = smartRound(
      [
        [1 / 3 + 0.01, 'A'],
        [1 / 3, 'B'],
        [1 / 3, 'C'],
      ] as [number, string][],
      ([x]) => x,
      1 / 3,
    )
    assert.deepEqual(smartRounded, [
      [1 / 3, [1 / 3 + 0.01, 'A']],
      [1 / 3, [1 / 3, 'B']],
      [1 / 3, [1 / 3, 'C']],
    ])
  })
})

describe('generateId', () => {
  it('is the intId without an activity', () => {
    assert.strictEqual(generateId(42), '42')
  })
  it('appends the task activity', () => {
    assert.strictEqual(generateId(42, 'Coding'), '42_Coding')
  })
})

describe('placeholderPlatformTask', () => {
  it('fills UNDEFINED fields and hashes the name into intId', () => {
    const t = placeholderPlatformTask('Lost Task')
    assert.strictEqual(t.projectName, 'UNDEFINED')
    assert.strictEqual(t.projectIntId, -1)
    assert.strictEqual(t.taskCode, 'UNDEFINED')
    assert.strictEqual(t.typ, 'UNDEFINED')
    assert.strictEqual(t.name, 'Lost Task')
    assert.strictEqual(t.intId, hashStringToInt('Lost Task'))
  })
  it('uses UNDEFINED for an empty name', () => {
    assert.strictEqual(placeholderPlatformTask('').name, 'UNDEFINED')
  })
})

describe('normalizeCatalogTask', () => {
  it('promotes the legacy platformTaskIntId key and fills missing typ', () => {
    const t = normalizeCatalogTask({
      name: 'X',
      projectIntId: 1,
      projectName: 'P',
      taskCode: 'C',
      platformTaskIntId: 5,
    })
    assert.strictEqual(t.intId, 5)
    assert.strictEqual(t.typ, 'UNDEFINED')
    assert.ok(!('platformTaskIntId' in t), 'legacy key removed')
  })
  it('passes already-canonical data through unchanged', () => {
    const canonical = {
      name: 'X',
      intId: 7,
      projectIntId: 1,
      projectName: 'P',
      taskCode: 'C',
      typ: 'OTT',
    }
    assert.deepStrictEqual(normalizeCatalogTask(canonical), canonical)
  })
  it('is idempotent', () => {
    const once = normalizeCatalogTask({ name: 'X', platformTaskIntId: 5 })
    assert.deepStrictEqual(normalizeCatalogTask(once as unknown as Record<string, unknown>), once)
  })
  it('does not mutate the input', () => {
    const raw: Record<string, unknown> = { name: 'X', platformTaskIntId: 5 }
    normalizeCatalogTask(raw)
    assert.strictEqual(raw.intId, undefined)
    assert.strictEqual(raw.platformTaskIntId, 5)
  })
})

describe('mergeExports', () => {
  const a: PlatformExportFormat = {
    '2026-03-02': [entry({ id: 'a1', taskIntId: 1, platformType: 'OTT' })],
    '2026-03-03': [entry({ id: 'a2', taskIntId: 2, platformType: 'OTT' })],
  }
  const b: PlatformExportFormat = {
    '2026-03-03': [entry({ id: 'b1', taskIntId: 3, platformType: 'OTT' })],
    '2026-03-04': [entry({ id: 'b2', taskIntId: 4, platformType: 'OTT' })],
  }

  it('concatenates entries per day and keeps all days', () => {
    const merged = mergeExports(a, b)
    assert.deepStrictEqual(Object.keys(merged).sort(), ['2026-03-02', '2026-03-03', '2026-03-04'])
    assert.deepStrictEqual(
      merged['2026-03-03'].map((e) => e.id),
      ['a2', 'b1'],
    )
  })
  it('does not mutate the inputs', () => {
    const before = a['2026-03-03']
    mergeExports(a, b)
    assert.strictEqual(a['2026-03-03'], before)
    assert.strictEqual(a['2026-03-03'].length, 1)
  })
})

describe('sliceToExport', () => {
  it('maps a slice to a work entry with the resolved task data', () => {
    const out = sliceToExport({
      slices: [slice('2026-03-02 09:00', '2026-03-02 17:00', { name: 'Backend', intId: 42 })],
      showing,
      resolveTask,
    })
    assert.deepStrictEqual(Object.keys(out), ['2026-03-02', '2026-03-03', '2026-03-04'])
    const [e] = out['2026-03-02']
    assert.strictEqual(e.id, '42')
    assert.strictEqual(e.hours, 8)
    assert.strictEqual(e.projectName, 'Proj Alpha')
    assert.strictEqual(e.projectIntId, 10)
    assert.strictEqual(e.taskIntId, 42)
    assert.strictEqual(e.taskName, 'Backend')
    assert.strictEqual(e.platformType, 'REPLICON')
    assert.strictEqual(e.taskCode, 'ALPHA-1')
    assert.strictEqual(e.comment, undefined)
    assert.strictEqual(e.taskActivity, undefined)
    assert.deepStrictEqual(out['2026-03-03'], [])
  })

  it('splits a slice across calendar days', () => {
    const out = sliceToExport({
      slices: [slice('2026-03-02 22:00', '2026-03-03 14:00', { name: 'Backend', intId: 42 })],
      showing,
      resolveTask,
    })
    assert.strictEqual(out['2026-03-02'][0].hours, 2)
    assert.strictEqual(out['2026-03-03'][0].hours, 14)
  })

  it('clips a slice that starts before the shown interval', () => {
    const out = sliceToExport({
      slices: [slice('2026-03-01 22:00', '2026-03-02 02:00', { name: 'Backend', intId: 42 })],
      showing,
      resolveTask,
    })
    assert.strictEqual(out['2026-03-02'][0].hours, 2)
    assert.deepStrictEqual(out['2026-03-03'], [])
  })

  it('ignores slices entirely outside the shown interval (no leak)', () => {
    const out = sliceToExport({
      slices: [
        slice('2026-02-27 09:00', '2026-03-01 09:00', { name: 'Backend', intId: 42 }),
        slice('2026-03-05 09:00', '2026-03-05 17:00', { name: 'Backend', intId: 42 }),
      ],
      showing,
      resolveTask,
    })
    assert.deepStrictEqual(out['2026-03-02'], [])
    assert.deepStrictEqual(out['2026-03-03'], [])
  })

  it('falls back to a placeholder task for unknown tasks', () => {
    const out = sliceToExport({
      slices: [
        slice('2026-03-02 09:00', '2026-03-02 11:00', { name: 'Lost' }),
        slice('2026-03-02 11:00', '2026-03-02 13:00', { name: 'Gone', intId: 99 }),
      ],
      showing,
      resolveTask,
    })
    const [gone, lost] = out['2026-03-02']
    for (const e of [gone, lost]) {
      assert.strictEqual(e.projectName, 'UNDEFINED')
      assert.strictEqual(e.projectIntId, -1)
      assert.strictEqual(e.taskCode, 'UNDEFINED')
      assert.strictEqual(e.platformType, 'UNDEFINED')
    }
    assert.strictEqual(lost.taskName, 'Lost')
    assert.strictEqual(lost.taskIntId, hashStringToInt('Lost'))
    assert.strictEqual(lost.id, String(hashStringToInt('Lost')))
    assert.strictEqual(gone.taskName, 'Gone')
    assert.strictEqual(gone.taskIntId, hashStringToInt('Gone'))
  })

  it('sums slices of the same task and rounds the sum to a quarter', () => {
    const out = sliceToExport({
      slices: [
        slice('2026-03-02 09:00', '2026-03-02 10:06', { name: 'Backend', intId: 42 }),
        slice('2026-03-02 11:00', '2026-03-02 12:12', { name: 'Backend', intId: 42 }),
      ],
      showing,
      resolveTask,
    })
    assert.strictEqual(out['2026-03-02'].length, 1)
    assert.strictEqual(out['2026-03-02'][0].hours, 2.25)
  })

  it('drops entries that round down to zero', () => {
    const out = sliceToExport({
      slices: [slice('2026-03-02 09:00', '2026-03-02 09:05', { name: 'Backend', intId: 42 })],
      showing,
      resolveTask,
    })
    assert.deepStrictEqual(out['2026-03-02'], [])
  })

  it('distributes rounding over comment entries of the same task', () => {
    const out = sliceToExport({
      slices: [
        slice('2026-03-02 09:00', '2026-03-02 10:06', { name: 'Backend', intId: 42, comment: 'a' }),
        slice('2026-03-02 11:00', '2026-03-02 12:12', { name: 'Backend', intId: 42, comment: 'b' }),
      ],
      showing,
      resolveTask,
    })
    const [e] = out['2026-03-02']
    assert.strictEqual(e.hours, 2.25)
    assert.strictEqual(e.comment, 'a, b')
  })

  it('prefixes comments with hours when outputCommentHours is set', () => {
    const out = sliceToExport({
      slices: [
        slice('2026-03-02 09:00', '2026-03-02 10:06', { name: 'Backend', intId: 42, comment: 'a' }),
        slice('2026-03-02 11:00', '2026-03-02 12:12', { name: 'Backend', intId: 42, comment: 'b' }),
      ],
      showing,
      resolveTask,
      outputCommentHours: true,
    })
    assert.match(out['2026-03-02'][0].comment ?? '', /^1[,.]00: a, 1[,.]25: b$/)
  })

  it('keeps separate entries for different task activities', () => {
    const out = sliceToExport({
      slices: [
        slice('2026-03-02 09:00', '2026-03-02 13:00', {
          name: 'Backend',
          intId: 42,
          taskActivityName: 'Coding',
        }),
        slice('2026-03-02 13:00', '2026-03-02 17:00', {
          name: 'Backend',
          intId: 42,
          taskActivityName: 'Meeting',
        }),
      ],
      showing,
      resolveTask,
    })
    const byId = Object.fromEntries(out['2026-03-02'].map((e) => [e.id, e]))
    assert.deepStrictEqual(Object.keys(byId).sort(), ['42_Coding', '42_Meeting'])
    assert.strictEqual(byId['42_Coding'].taskActivity, 'Coding')
    assert.strictEqual(byId['42_Coding'].hours, 4)
    assert.strictEqual(byId['42_Meeting'].taskActivity, 'Meeting')
    assert.strictEqual(byId['42_Meeting'].hours, 4)
  })
})

describe('buildExportForPlatform', () => {
  const ott: WorkEntry = entry({ id: '42', taskIntId: 42, platformType: 'OTT' })
  const replicon: WorkEntry = entry({ id: '7', taskIntId: 7, platformType: 'REPLICON' })
  const placeholder: WorkEntry = entry({ id: '-1', taskIntId: -1, platformType: 'UNDEFINED' })
  const merged: PlatformExportFormat = {
    '2026-03-02': [ott, replicon, placeholder],
    '2026-03-03': [entry({ id: '43', taskIntId: 43, platformType: 'OTT' })],
    '2026-03-04': [entry({ id: '8', taskIntId: 8, platformType: 'REPLICON' })],
  }

  it('keeps only matching platform entries and drops placeholders', () => {
    const out = buildExportForPlatform(merged, 'OTT')
    assert.deepStrictEqual(
      out['2026-03-02'].map((e) => e.id),
      ['42'],
    )
  })
  it('OTT keeps days that end up empty', () => {
    const out = buildExportForPlatform(merged, 'OTT')
    assert.deepStrictEqual(out['2026-03-04'], [])
    assert.deepStrictEqual(Object.keys(out).sort(), ['2026-03-02', '2026-03-03', '2026-03-04'])
  })
  it('other platforms drop days that end up empty', () => {
    const out = buildExportForPlatform(merged, 'REPLICON')
    assert.deepStrictEqual(Object.keys(out).sort(), ['2026-03-02', '2026-03-04'])
    assert.deepStrictEqual(
      out['2026-03-02'].map((e) => e.id),
      ['7'],
    )
  })
})

describe('buildProjectViewGrouping', () => {
  const repliconTasks: PlatformTask[] = [
    {
      name: 'Backend',
      intId: 7,
      projectIntId: 10,
      projectName: 'Proj Alpha',
      taskCode: 'ALPHA-1',
      typ: 'REPLICON',
    },
  ]
  const intervals: Interval[] = [{ start: date('2026-03-02 00:00'), end: date('2026-03-03 00:00') }]
  const platformExport: PlatformExportFormat = {
    '2026-03-02': [
      entry({
        id: '42',
        taskIntId: 42,
        platformType: 'OTT',
        hours: 4,
        projectName: 'Proj Alpha',
        taskCode: 'ALPHA-1',
      }),
      entry({
        id: '44',
        taskIntId: 44,
        platformType: 'OTT',
        hours: 3,
        projectName: 'Proj Alpha',
        taskCode: 'ALPHA-1',
      }),
      entry({
        id: '55',
        taskIntId: 55,
        platformType: 'OTT',
        hours: 2,
        projectName: 'Proj Gamma',
        taskCode: 'GAMMA-9',
      }),
      entry({
        id: '7',
        taskIntId: 7,
        platformType: 'REPLICON',
        hours: 1,
        projectName: 'Proj Alpha',
        taskCode: 'ALPHA-1',
      }),
    ],
  }

  it('groups OTT entries under their REPLICON project task and collects the missing ones', () => {
    const { projectTasksViewItems, ottTaskMissingRepliconTask } = buildProjectViewGrouping({
      platformExport,
      repliconTasks,
      repliconActivity: 'Default Activity',
      intervals,
      isTaskVisible: () => true,
    })
    assert.deepStrictEqual(Object.keys(projectTasksViewItems), ['2026-03-02'])
    const [group] = projectTasksViewItems['2026-03-02']
    assert.strictEqual(group.taskIntId, 7)
    assert.strictEqual(group.taskName, 'Backend')
    assert.strictEqual(group.platformType, 'REPLICON')
    assert.strictEqual(group.taskActivity, 'Default Activity')
    assert.strictEqual(group.id, '7_Default Activity')
    assert.strictEqual(group.hours, 7)
    assert.deepStrictEqual(
      group.child?.map((c) => c.id),
      ['42', '44'],
    )
    assert.deepStrictEqual(
      ottTaskMissingRepliconTask.map((e) => e.id),
      ['55'],
    )
  })

  it('respects the visibility filter', () => {
    const { projectTasksViewItems, ottTaskMissingRepliconTask } = buildProjectViewGrouping({
      platformExport,
      repliconTasks,
      repliconActivity: 'Default Activity',
      intervals,
      isTaskVisible: (we) => we.taskIntId !== 44,
    })
    const [group] = projectTasksViewItems['2026-03-02']
    assert.strictEqual(group.hours, 4)
    assert.deepStrictEqual(
      group.child?.map((c) => c.id),
      ['42'],
    )
    assert.deepStrictEqual(
      ottTaskMissingRepliconTask.map((e) => e.id),
      ['55'],
    )
  })
})
