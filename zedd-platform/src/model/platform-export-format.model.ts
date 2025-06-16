import { WorkEntry } from './work-entry.model'

export type PlatformExportFormat = {
  [day: string]: WorkEntry[]
}
