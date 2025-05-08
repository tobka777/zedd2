import { Task } from './task.model'

/**
 * @deprecated
 */
export interface Project {
  name: string
  intId: number
  tasks: Task[]
}
