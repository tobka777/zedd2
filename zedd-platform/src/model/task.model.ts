import { PlatformType } from './platform-type.model'

export interface Task {
  name: string
  intId: number
  projectIntId: number
  projectName: string
  start?: Date
  end?: Date
  taskCode: string
  typ: PlatformType

  /**
   * @deprecated only needed for clarity
   */
  sortNo?: number

  /**
   * @deprecated only needed for clarity
   */
  strId?: string

  /**
   * @deprecated only needed for clarity
   */
  openForTimeEntry?: boolean
}
