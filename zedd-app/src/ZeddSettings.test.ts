import * as assert from 'assert'
import { promises as fsp } from 'fs'
import * as os from 'os'
import * as path from 'path'

import { ZeddSettings } from './ZeddSettings'

describe('ZeddSettings', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zedd-settings-'))
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('saveToFile leaves no tmp files and the content round-trips', async () => {
    const file = path.join(dir, 'zeddconfig.json')
    const settings = new ZeddSettings(file)
    settings.startHour = 7
    await settings.saveToFile()

    assert.deepStrictEqual(
      (await fsp.readdir(dir)).filter((f) => f.endsWith('.tmp')),
      [],
    )
    const loaded = await ZeddSettings.readFromFile(file)
    assert.strictEqual(loaded.startHour, 7)
  })
})
