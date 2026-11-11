import { Page } from 'playwright-core'

export class RepliconApi {
  public constructor(private readonly page: Page) {}

  private get servicesRoot(): string {
    const url = new URL(this.page.url())
    // zedd only talks to Replicon's own hosts
    if (!url.hostname.endsWith('.replicon.com')) {
      throw new Error(`The browser doesn't show Replicon (but ${url.hostname}). Is the login done?`)
    }
    const companyKey = url.pathname.split('/')[1]
    return `${url.origin}/${companyKey}/services/`
  }

  /**
   * Posts a request to one of Replicon's web services from inside the logged-in page and returns
   * the payload of the response. Throws if the request fails or Replicon reports an error.
   *
   * @param operation - path of the operation below the services root
   * @param body - the parameters of the operation, sent as JSON
   */
  public async request<T = any>(operation: string, body: unknown): Promise<T> {
    const result = await this.page.evaluate(
      async ({ url, body }) => {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const text = await response.text()
        let json: { d?: any; error?: unknown } | undefined
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        return { status: response.status, data: json?.d, error: json?.error, text }
      },
      { url: this.servicesRoot + operation, body },
    )
    console.log('[Replicon API]', operation, result.status)
    if (result.status !== 200 || (result.error !== undefined && result.error !== null)) {
      const details =
        result.error !== undefined && result.error !== null
          ? JSON.stringify(result.error)
          : result.text
      throw new Error(
        `Replicon ${operation} failed (HTTP ${result.status}): ${details.slice(0, 1000)}`,
      )
    }
    return result.data as T
  }
}
