import { PlatformType } from './platform-type.model'

export interface WorkEntry {
  id: string
  projectName: string
  projectIntId: number
  /** URI of the Replicon project, see Task.projectUri */
  projectUri?: string
  taskName: string
  taskIntId: number
  hours: number
  taskCode: string
  platformType: PlatformType
  comment?: string
  taskActivity?: string
  /** URI of the Replicon activity, for the export via Replicon's web services */
  taskActivityUri?: string
  child?: WorkEntry[]
}
