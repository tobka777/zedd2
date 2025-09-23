import { PlatformType } from './platform-type.model'

export interface WorkEntry {
  projectName: string
  projectIntId: number
  taskName: string
  taskIntId: number
  hours: number
  taskCode: string
  platformType: PlatformType
  comment?: string
  taskActivity?: string
  child?: WorkEntry[]
}
