import type { AppState } from '../AppState'

export interface AppDataStore {

  load(): Promise<AppState | null>

  save(state: AppState): Promise<void>
}
