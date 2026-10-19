import { observable, makeObservable } from 'mobx'
import { identifier, serializable } from 'serializr'
import { stringHashColor } from '../util'
import type { PlatformType, TaskActivity } from 'zedd-platform'
import * as chroma from 'chroma.ts'
import { randomUUID } from 'crypto'

export class Task {
  @serializable(identifier())
  @observable
  public name: string

  @serializable
  public id: string
  @serializable
  @observable
  public intId: number | string | undefined

  @serializable
  @observable
  public taskActivityName: string | undefined

  @observable
  public taskActivities: TaskActivity[] = []

  /**
   * The platform this task accounts for (matches the platform task's `typ`).
   */
  @serializable
  @observable
  public typ: PlatformType | undefined

  /**
   * The internal key for JIRA-Issues.
   * Used to prevent multiple tasks being created for the same issue.
   */
  @serializable
  @observable
  public key: string | undefined

  @serializable
  @observable
  public platformTaskComment: string = ''

  constructor(
    name: string = '',
    taskActivities: TaskActivity[] = [],
    typ?: PlatformType,
    taskActivityName?: string,
    intId?: number | string,
    key?: string,
    platformTaskComment?: string,
  ) {
    makeObservable(this)
    this.name = name
    this.id = randomUUID()
    this.intId = intId
    this.key = key
    this.platformTaskComment = platformTaskComment || ''
    this.typ = typ
    this.taskActivityName = taskActivityName
    this.taskActivities = taskActivities
  }

  public static same(a: Task, b: Task): boolean {
    return (a.key && b.key && a.key === b.key) || a.name === b.name
  }

  public getColor(): chroma.Color {
    return stringHashColor(this.name)
  }
}
