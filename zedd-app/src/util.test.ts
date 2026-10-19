import * as assert from 'assert'
import { parseISO } from 'date-fns'
import { promises as fsp } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { splitIntervalIntoCalendarDays, writeFileAtomic } from './util'

describe('splitIntervalIntoCalendarDays', () => {
  it('works', () => {
    assert.deepStrictEqual(
      splitIntervalIntoCalendarDays({
        start: parseISO('2019-10-20T11:35'),
        end: parseISO('2019-10-22T10:00'),
      }),
      [
        {
          start: parseISO('2019-10-20T11:35'),
          end: parseISO('2019-10-21T00:00'),
        },
        {
          start: parseISO('2019-10-21T00:00'),
          end: parseISO('2019-10-22T00:00'),
        },
        {
          start: parseISO('2019-10-22T00:00'),
          end: parseISO('2019-10-22T10:00'),
        },
      ],
    )
  })
})

describe('writeFileAtomic', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zedd-util-'))
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('writes the content and leaves no tmp file behind', async () => {
    const file = path.join(dir, 'data.json')
    await writeFileAtomic(file, '{"a":1}')
    assert.strictEqual(await fsp.readFile(file, 'utf8'), '{"a":1}')
    assert.deepStrictEqual(
      (await fsp.readdir(dir)).filter((f) => f.endsWith('.tmp')),
      [],
    )
  })

  it('replaces an existing target with the full new content', async () => {
    const file = path.join(dir, 'data.json')
    await fsp.writeFile(file, '{"old":true}')
    await writeFileAtomic(file, '{"new":true}')
    assert.strictEqual(await fsp.readFile(file, 'utf8'), '{"new":true}')
    assert.deepStrictEqual(await fsp.readdir(dir), ['data.json'])
  })
})
