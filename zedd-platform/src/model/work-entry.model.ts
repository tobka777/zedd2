export interface WorkEntry {
  projectName: string
  taskName: string
  taskIntId: number
  projectIntId: number
  hours: number
  taskCode: string
  platformType: string
  comment?: string
  taskActivity?: string
}
