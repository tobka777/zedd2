import { Page } from 'playwright-core'

export interface RepliconApiResult<T = unknown> {
  status: number
  data?: T
  error?: unknown
  text: string
}

export class RepliconApi {
  public constructor(
    private readonly page: Page,
    private readonly isAllowedHost = (host: string) => host.endsWith('.replicon.com'),
  ) {}

  public get servicesRoot(): string {
    const url = new URL(this.page.url())
    if (!this.isAllowedHost(url.hostname)) {
      throw new Error(`The browser doesn't show Replicon (but ${url.hostname}). Is the login done?`)
    }
    const companyKey = url.pathname.split('/')[1]
    return `${url.origin}/${companyKey}/services/`
  }

  /**
   * Posts a request to one of Replicon's web services and returns the response.
   *
   * @param operation - path of the operation below the services root
   * @param body - the parameters of the operation, sent as JSON
   */
  public async call<T = unknown>(operation: string, body: unknown): Promise<RepliconApiResult<T>> {
    return this.page.evaluate(
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
        return {
          status: response.status,
          data: json?.d,
          error: json?.error,
          text: text.slice(0, 20_000),
        }
      },
      { url: this.servicesRoot + operation, body },
    )
  }

  public async request<T = any>(operation: string, body: unknown): Promise<T> {
    const result = await this.call<T>(operation, body)
    console.log('[Replicon API]', operation, result.status)
    if (result.status !== 200 || (result.error !== undefined && result.error !== null)) {
      const details = result.error !== undefined ? JSON.stringify(result.error) : result.text
      throw new Error(
        `Replicon ${operation} failed (HTTP ${result.status}): ${details.slice(0, 1000)}`,
      )
    }
    return result.data as T
  }
}
