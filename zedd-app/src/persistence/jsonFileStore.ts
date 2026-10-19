import { format as formatDate } from 'date-fns'
import { promises as fsp } from 'fs'
import * as path from 'path'

import { AppState } from '../AppState'
import {
  FILE_DATE_FORMAT,
  filterDatesFalloff,
  mkdirIfNotExists,
  readFilesWithDate,
  tryWithFilesInDir,
  writeFileAtomic,
} from '../util'
import { hydrateAppState, serializeAppState } from './serializer'
import { AppDataStore } from './types'

const DATA_FILE_REGEX = /^data_(.*).json$/

export class JsonFileAppDataStore implements AppDataStore {
  constructor(private readonly dir: string) {}

  public async load(): Promise<AppState | null> {
    try {
      return await tryWithFilesInDir(this.dir, DATA_FILE_REGEX, async (file) => {
        const json = await fsp.readFile(path.join(this.dir, file), 'utf8')
        return hydrateAppState(JSON.parse(json))
      })
    } catch (e) {
      console.warn('JsonFileAppDataStore: no loadable state in ' + this.dir, e)
      return null
    }
  }

  public async save(state: AppState): Promise<void> {
    await mkdirIfNotExists(this.dir)
    const json = JSON.stringify(serializeAppState(state), undefined, '  ')
    const target = path.join(this.dir, 'data_' + formatDate(new Date(), FILE_DATE_FORMAT) + '.json')
    await writeFileAtomic(target, json)
  }

  /**
   * Delete old files in the directory. (Keeping some, the more recent, the more frequently).
   * @returns The number of deleted files.
   */
  public async clean(): Promise<number> {
    const filesWithDate = await readFilesWithDate(this.dir, DATA_FILE_REGEX)
    const datesToKeep = filesWithDate.map(([_f, date]) => date)
    filterDatesFalloff(datesToKeep)
    const pathsToDelete = filesWithDate
      .filter(([_f, date]) => !datesToKeep.includes(date))
      .map(([f]) => path.join(this.dir, f))
    await Promise.all(pathsToDelete.map(fsp.unlink))
    return pathsToDelete.length
  }
}
