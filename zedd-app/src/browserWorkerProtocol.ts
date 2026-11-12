import type { PlatformOptions } from 'zedd-platform/out/src/model/platform.options.model'

export type BrowserWorkerPlatform = 'REPLICON' | 'OTT'

export type BrowserWorkerMethod =
  'importTasks' | 'importTaskActivities' | 'exportTasks' | 'quitBrowser'

export interface BrowserWorkerRequest {
  id: number
  platform: BrowserWorkerPlatform
  platformLink: string
  options: PlatformOptions
  method: BrowserWorkerMethod
  args: unknown[]
}

export type BrowserWorkerResponse =
  | { id: number; type: 'notify'; value: unknown }
  | { id: number; type: 'result'; value: unknown }
  | { id: number; type: 'error'; message: string }

export const BROWSER_WORKER_CONNECT = 'browser-worker-connect'
export const BROWSER_WORKER_PORT = 'browser-worker-port'
export const BROWSER_WORKER_EXIT = 'browser-worker-exit'
