import { PlatformType } from './platform-type.model'

export interface WorkEntry {
  id: string
  projectName: string
  projectIntId: number
  projectUri?: string
  taskName: string
  taskIntId: number
  hours: number
  taskCode: string
  platformType: PlatformType
  comment?: string
  taskActivity?: string
  taskActivityUri?: string
  child?: WorkEntry[]
}
