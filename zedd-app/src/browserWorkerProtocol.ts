import type { PlatformOptions } from 'zedd-platform/out/src/model/platform.options.model'

/**
 * Messages between the renderer and the browser worker, a separate process which runs Playwright
 * and Edge for the platform integrations, so a crash there doesn't take down the zedd window.
 */

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

/** ipc channels between renderer and main process, to hand the renderer a port to the worker */
export const BROWSER_WORKER_CONNECT = 'browser-worker-connect'
export const BROWSER_WORKER_PORT = 'browser-worker-port'
export const BROWSER_WORKER_EXIT = 'browser-worker-exit'
