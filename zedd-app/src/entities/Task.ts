import { observable, makeObservable } from 'mobx'
import { identifier, serializable } from 'serializr'
import { stringHashColor } from '../util'
import type { PlatformType } from 'zedd-platform'
import * as chroma from 'chroma.ts'

export class Task {
  @serializable(identifier())
  @observable
  public name: string

  @serializable
  @observable
  public platformTaskIntId: number | string | undefined

  @serializable
  @observable
  public taskActivityName: string | undefined

  @observable
  public taskActivities: string[]

  @serializable
  @observable
  public platformType: PlatformType | undefined

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
    taskActivities: string[],
    platformType?: PlatformType,
    taskActivityName?: string,
    intId?: number,
    key?: string,
    platformTaskComment?: string,
  ) {
    makeObservable(this)
    this.name = name
    this.platformTaskIntId = intId
    this.key = key
    this.platformTaskComment = platformTaskComment || ''
    this.platformType = platformType
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
