// Tests for the persistence seam: serializer (AppState <-> plain data) and the
// JsonFileAppDataStore implementation (atomic writes, load fallback).
import * as assert from 'assert'
import { promises as fsp } from 'fs'
import * as os from 'os'
import * as path from 'path'

import { AppState, formatInterval, TimeSlice } from '../AppState'
import { hydrateAppState, migrateData, SCHEMA_VERSION, serializeAppState } from './serializer'
import { JsonFileAppDataStore } from './jsonFileStore'

async function makeTmpDir(): Promise<string> {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'zedd-persist-'))
}

function stateWithSlices(...slices: string[]): AppState {
  const state = new AppState()
  for (const s of slices) {
    const [start, end, taskName] = TimeSlice.parse(s)
    state.addSlice(new TimeSlice(start, end, state.getTaskForName(taskName)))
  }
  const [, , firstTaskName] = TimeSlice.parse(slices[0])
  state.currentTask = state.getTaskForName(firstTaskName)
  return state
}

function sliceStrs(state: AppState): string[] {
  return [...state.slices]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((s) => formatInterval(s) + ' ' + s.task.name)
}

describe('persistence serializer', () => {
  it('round-trips slices via plain data', () => {
    const state = stateWithSlices(
      '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
      '2020-01-01 11:00 - 2020-01-01 12:00 daily',
    )
    const data = serializeAppState(state)
    const json = JSON.stringify(data)
    assert.ok(json.length > 0)
    const rehydrated = hydrateAppState(JSON.parse(json))
    assert.deepStrictEqual(sliceStrs(rehydrated), sliceStrs(state))
  })
})

describe('JsonFileAppDataStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeTmpDir()
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('save then load returns the same slices and leaves no tmp files', async () => {
    const store = new JsonFileAppDataStore(dir)
    const state = stateWithSlices(
      '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
      '2020-01-01 11:00 - 2020-01-01 12:00 daily',
    )
    await store.save(state)

    const loaded = await store.load()
    assert.ok(loaded, 'state loads back')
    assert.deepStrictEqual(sliceStrs(loaded), sliceStrs(state))

    const files = await fsp.readdir(dir)
    assert.deepStrictEqual(
      files.filter((f) => f.endsWith('.tmp')),
      [],
    )
    assert.deepStrictEqual(
      files,
      files.filter((f) => /^data_.+\.json$/.test(f)),
    )
  })

  it('falls back to an older file if the newest file is corrupted', async () => {
    const store = new JsonFileAppDataStore(dir)
    const state = stateWithSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    await fsp.writeFile(
      path.join(dir, 'data_20200101T0900.json'),
      JSON.stringify(serializeAppState(state)),
    )
    await fsp.writeFile(path.join(dir, 'data_20200101T0930.json'), '{ this is not json')

    const loaded = await store.load()
    assert.ok(loaded, 'older state loads despite corrupted newest file')
    assert.deepStrictEqual(sliceStrs(loaded), sliceStrs(state))
  })

  it('returns null if no file can be loaded', async () => {
    const store = new JsonFileAppDataStore(dir)
    await fsp.writeFile(path.join(dir, 'data_20200101T0900.json'), '{ not json')
    assert.strictEqual(await store.load(), null)
  })

  it('returns null for an empty or missing directory', async () => {
    assert.strictEqual(await new JsonFileAppDataStore(dir).load(), null)
    await fsp.rm(dir, { recursive: true, force: true })
    assert.strictEqual(await new JsonFileAppDataStore(dir).load(), null)
  })

  it('clean() removes old files, keeping one per day for older dates', async () => {
    const store = new JsonFileAppDataStore(dir)
    for (const name of [
      'data_20200101T0900.json',
      'data_20200101T1500.json',
      'data_20200102T1000.json',
    ]) {
      await fsp.writeFile(path.join(dir, name), '{}')
    }

    const deleted = await store.clean()
    assert.strictEqual(deleted, 1)
    const files = (await fsp.readdir(dir)).sort()
    assert.deepStrictEqual(files, ['data_20200101T1500.json', 'data_20200102T1000.json'])
  })
})

describe('stable ids and schema versioning', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeTmpDir()
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('mints a unique id per TimeSlice and Task at creation', () => {
    const state = stateWithSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    const slice = state.slices[0]
    assert.ok(typeof slice.id === 'string' && slice.id.length > 0, 'slice has an id')
    assert.notStrictEqual(slice.id, new TimeSlice(slice.start, slice.end, slice.task).id)
    assert.ok(typeof state.currentTask.id === 'string' && state.currentTask.id.length > 0)
  })

  it('slice and task ids survive save -> load', async () => {
    const store = new JsonFileAppDataStore(dir)
    const state = stateWithSlices(
      '2020-01-01 10:00 - 2020-01-01 11:00 rebasing',
      '2020-01-01 11:00 - 2020-01-01 12:00 daily',
    )
    state.notifyTaskInteraction(state.currentTask)
    await store.save(state)

    const loaded = await store.load()
    assert.ok(loaded)
    assert.deepStrictEqual(
      loaded.slices.map((s) => s.id),
      state.slices.map((s) => s.id),
    )
    assert.strictEqual(loaded.slices[0].task.id, state.slices[0].task.id)
  })

  it('loads legacy data (string slices, no ids, no version) and mints stable ids', async () => {
    const store = new JsonFileAppDataStore(dir)
    const state = stateWithSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    const v1 = {
      ...(serializeAppState(state) as Record<string, unknown>),
      schemaVersion: 1,
      slices: state.slices.map((s) => s.toString()),
    }
    await fsp.writeFile(path.join(dir, 'data_20200101T0900.json'), JSON.stringify(v1))

    const loaded = await store.load()
    assert.ok(loaded, 'legacy data loads')
    assert.deepStrictEqual(sliceStrs(loaded), sliceStrs(state))
    assert.ok(
      loaded.slices.every((s) => s.id.length > 0),
      'ids are minted on load',
    )

    await store.save(loaded)
    const reloaded = await store.load()
    assert.deepStrictEqual(
      reloaded!.slices.map((s) => s.id),
      loaded.slices.map((s) => s.id),
      'ids are stable after the next round-trip',
    )
  })

  it('writes the schema version and migrateData strips it', () => {
    assert.strictEqual(SCHEMA_VERSION, 2)
    const state = stateWithSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    const data = serializeAppState(state) as Record<string, unknown>
    assert.strictEqual(data.schemaVersion, SCHEMA_VERSION)

    assert.deepStrictEqual(migrateData({ schemaVersion: 2, foo: 'bar' }), { foo: 'bar' })
    assert.deepStrictEqual(migrateData({ foo: 'bar' }), { foo: 'bar' })
  })
})

describe('currentTask outside the serialized graph', () => {
  let dir: string

  beforeEach(async () => {
    dir = await makeTmpDir()
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('saves and loads when the current task has no slice and no lastInteractedTasks entry', async () => {
    const store = new JsonFileAppDataStore(dir)
    const state = new AppState()
    state.currentTask = state.getUndefinedTask()
    await store.save(state)

    const loaded = await store.load()
    assert.ok(loaded, 'state loads despite currentTask missing from the object graph')
    assert.strictEqual(loaded.currentTask.name, 'UNDEFINED')
  })

  it('loads the newest snapshot instead of falling back to an older one', async () => {
    const store = new JsonFileAppDataStore(dir)
    const older = stateWithSlices('2020-01-01 10:00 - 2020-01-01 11:00 rebasing')
    await fsp.writeFile(
      path.join(dir, 'data_20200101T0900.json'),
      JSON.stringify(serializeAppState(older)),
    )
    await store.save(new AppState())

    const loaded = await store.load()
    assert.ok(loaded)
    assert.strictEqual(loaded.currentTask.name, 'UNDEFINED')
    assert.strictEqual(loaded.slices.length, 0, 'the newest snapshot wins, no fallback')
  })
})
