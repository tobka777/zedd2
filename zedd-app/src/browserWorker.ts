/**
 * Runs in a separate Electron utility process: drives Edge through Playwright for the Replicon and
 * OTT integrations. The renderer talks to it through a MessagePort (see RemotePlatformIntegration).
 */
import type { MessagePortMain } from 'electron'
import { OTTIntegration } from 'zedd-platform/out/src/ott/ott-integration'
import type { PlatformIntegration } from 'zedd-platform/out/src/platform-integration'
import { RepliconIntegration } from 'zedd-platform/out/src/replicon/replicon-integration'
import type {
  BrowserWorkerPlatform,
  BrowserWorkerRequest,
  BrowserWorkerResponse,
} from './browserWorkerProtocol'

interface Entry {
  key: string
  integration: PlatformIntegration
}

const integrations = new Map<BrowserWorkerPlatform, Entry>()

/**
 * Returns the integration of the platform, created anew if its link or options changed.
 */
async function getIntegration(request: BrowserWorkerRequest): Promise<PlatformIntegration> {
  const key = JSON.stringify([request.platformLink, request.options])
  const entry = integrations.get(request.platform)
  if (entry?.key === key) return entry.integration
  await entry?.integration.quitBrowser().catch((e) => console.error('Error quitting browser', e))
  const integration =
    request.platform === 'REPLICON'
      ? new RepliconIntegration(request.platformLink, request.options)
      : new OTTIntegration(request.platformLink, request.options)
  integrations.set(request.platform, { key, integration })
  return integration
}

async function handle(
  request: BrowserWorkerRequest,
  notify: (value: unknown) => void,
): Promise<unknown> {
  const integration = await getIntegration(request)
  switch (request.method) {
    case 'importTasks':
      return integration.importTasks(notify)
    case 'importTaskActivities':
      return (integration as RepliconIntegration).importTaskActivities(notify)
    case 'exportTasks':
      return integration.exportTasks(
        request.args[0] as Parameters<PlatformIntegration['exportTasks']>[0],
        request.args[1] as boolean,
      )
    case 'recordApiCalls':
      return (integration as RepliconIntegration).recordApiCalls(request.args[0] as string)
    case 'quitBrowser':
      return integration.quitBrowser()
  }
}

function serve(port: MessagePortMain) {
  const send = (response: BrowserWorkerResponse) => port.postMessage(response)
  port.on('message', ({ data }) => {
    const request = data as BrowserWorkerRequest
    handle(request, (value) => send({ id: request.id, type: 'notify', value }))
      .then((value) => send({ id: request.id, type: 'result', value }))
      .catch((e) =>
        send({
          id: request.id,
          type: 'error',
          message: e instanceof Error ? e.message : String(e),
        }),
      )
  })
  port.start()
}

// the main process hands over a port for every renderer that connects
process.parentPort.on('message', ({ ports }) => ports.forEach(serve))

// close the browsers before this process ends, so no Edge keeps running with the profile
process.on('SIGTERM', async () => {
  await Promise.all([...integrations.values()].map(({ integration }) => integration.quitBrowser()))
  process.exit(0)
})
