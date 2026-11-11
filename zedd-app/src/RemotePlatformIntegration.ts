import { ipcRenderer } from 'electron'
import type { PlatformExportFormat, Task, TaskActivity } from 'zedd-platform'
import type { PlatformOptions } from 'zedd-platform/out/src/model/platform.options.model'
import type { RepliconApiRecording } from 'zedd-platform/out/src/replicon/replicon-integration'
import {
  BROWSER_WORKER_CONNECT,
  BROWSER_WORKER_EXIT,
  BROWSER_WORKER_PORT,
  BrowserWorkerMethod,
  BrowserWorkerPlatform,
  BrowserWorkerRequest,
  BrowserWorkerResponse,
} from './browserWorkerProtocol'

interface Pending {
  resolve: (value: any) => void
  reject: (error: Error) => void
  notify?: (value: any) => void
}

/**
 * Connection to the browser worker process. Connects on first use and again after the worker
 * stopped; requests of a stopped worker fail with an error instead of hanging.
 */
class BrowserWorkerClient {
  private port?: Promise<MessagePort>
  private nextId = 1
  private pending = new Map<number, Pending>()

  public constructor() {
    ipcRenderer.on(BROWSER_WORKER_EXIT, (_e, code: number) => {
      this.port = undefined
      const error = new Error(
        `The browser process stopped unexpectedly (exit code ${code}). Please try again.`,
      )
      this.pending.forEach(({ reject }) => reject(error))
      this.pending.clear()
    })
  }

  private connect(): Promise<MessagePort> {
    return new Promise((resolve) => {
      ipcRenderer.once(BROWSER_WORKER_PORT, (event) => {
        const [port] = event.ports
        port.onmessage = ({ data }) => this.receive(data as BrowserWorkerResponse)
        resolve(port)
      })
      ipcRenderer.send(BROWSER_WORKER_CONNECT)
    })
  }

  private receive(response: BrowserWorkerResponse) {
    const pending = this.pending.get(response.id)
    if (!pending) return
    if (response.type === 'notify') {
      pending.notify?.(response.value)
      return
    }
    this.pending.delete(response.id)
    if (response.type === 'result') pending.resolve(response.value)
    else pending.reject(new Error(response.message))
  }

  public async call<T>(
    request: Omit<BrowserWorkerRequest, 'id'>,
    notify?: (value: any) => void,
  ): Promise<T> {
    this.port ??= this.connect()
    const port = await this.port
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, notify })
      port.postMessage({ ...request, id })
    })
  }
}

let client: BrowserWorkerClient | undefined

/**
 * Stands in for a platform integration of zedd-platform, which runs in the browser worker process.
 */
export class RemotePlatformIntegration {
  public constructor(
    private readonly platform: BrowserWorkerPlatform,
    private readonly platformLink: string,
    private readonly options: PlatformOptions,
  ) {}

  private call<T>(method: BrowserWorkerMethod, args: unknown[] = [], notify?: (v: any) => void) {
    client ??= new BrowserWorkerClient()
    return client.call<T>(
      {
        platform: this.platform,
        platformLink: this.platformLink,
        options: this.options,
        method,
        args,
      },
      notify,
    )
  }

  public importTasks(notifyTasks?: (tasks: Task[]) => void): Promise<Task[]> {
    return this.call('importTasks', [], notifyTasks)
  }

  public importTaskActivities(
    notifyTaskActivities?: (activities: TaskActivity[]) => void,
  ): Promise<TaskActivity[]> {
    return this.call('importTaskActivities', [], notifyTaskActivities)
  }

  public exportTasks(data: PlatformExportFormat, submitTimesheets: boolean): Promise<void> {
    return this.call('exportTasks', [data, submitTimesheets])
  }

  public recordApiCalls(outFile: string): Promise<RepliconApiRecording> {
    return this.call('recordApiCalls', [outFile])
  }

  public quitBrowser(): Promise<void> {
    // nothing to quit if the worker isn't running
    return client ? this.call('quitBrowser') : Promise.resolve()
  }
}
