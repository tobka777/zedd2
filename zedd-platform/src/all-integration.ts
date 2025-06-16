import { PlatformExportFormat, Task } from './model'
import { PlatformOptions } from './model/platform.options.model'
import { PlatformIntegration } from './platform-integration'
import { OTTIntegration } from './ott-integration'
import { RepliconIntegration } from './replicon-integration'

export class AllIntegration extends PlatformIntegration {
  private static ottLink: string
  private static repliconLink: string
  private static platformOptions: PlatformOptions

  private constructor() {
    super()
  }

  private ottIntegration: PlatformIntegration | undefined
  private repliconIntegration: PlatformIntegration | undefined

  static async create(
    ottLink: string,
    repliconLink: string,
    options: PlatformOptions,
  ): Promise<AllIntegration> {
    this.ottLink = ottLink
    this.repliconLink = repliconLink
    this.platformOptions = options

    return new AllIntegration()
  }

  async importTasks(notifyTasks?: (p: Task[]) => void): Promise<Task[]> {
    this.ottIntegration = await OTTIntegration.create(
      AllIntegration.ottLink,
      AllIntegration.platformOptions,
    )
    this.repliconIntegration = await RepliconIntegration.create(
      AllIntegration.repliconLink,
      AllIntegration.platformOptions,
    )
    let ottTasks = await this.ottIntegration.importTasks()
    let repliconTasks = await this.repliconIntegration.importTasks()
    const tasks = ottTasks
      .concat(repliconTasks)
      .sort((t1, t2) => t1.projectName.localeCompare(t2.projectName))
    notifyTasks && notifyTasks(tasks)
    return tasks
  }

  async exportTasks(
    platformExportFormat: PlatformExportFormat,
    submitTimesheets: boolean,
  ): Promise<void> {
    this.ottIntegration = await OTTIntegration.create(
      AllIntegration.ottLink,
      AllIntegration.platformOptions,
    )
    this.repliconIntegration = await RepliconIntegration.create(
      AllIntegration.repliconLink,
      AllIntegration.platformOptions,
    )

    await this.ottIntegration.exportTasks(platformExportFormat, submitTimesheets)
    await this.repliconIntegration.exportTasks(platformExportFormat, submitTimesheets)
  }

  async quitBrowser(): Promise<void> {
    await this.ottIntegration?.quitBrowser()
    await this.repliconIntegration?.quitBrowser()
  }
}
