import { PlatformType } from './platform-type.model'
import { TaskActivity } from './task-activity.model'

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
   * TaskActivities for Replicon tasks
   */
  taskActivities?: TaskActivity[]

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
