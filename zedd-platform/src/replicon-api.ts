import { Page } from 'playwright-core'

export interface RepliconApiResult<T = unknown> {
  status: number
  /** the `d` property of the response, Replicon's result payload */
  data?: T
  /** the `error` property of the response, if Replicon reports one */
  error?: unknown
  /** the raw response body, shortened */
  text: string
}

/**
 * Calls Replicon's JSON web services (`…/services/*.svc/<operation>`) from the logged-in page, so
 * the browser session of the SSO login authenticates them; no API token or password is needed.
 */
export class RepliconApi {
  /**
   * @param isAllowedHost - hosts the calls may go to; by default only Replicon's own, so nothing is
   *   sent elsewhere if the page shows e.g. the Microsoft login at that moment
   */
  public constructor(
    private readonly page: Page,
    private readonly isAllowedHost = (host: string) => host.endsWith('.replicon.com'),
  ) {}

  /**
   * The services root of the tenant, e.g. `https://eu3.replicon.com/CompanyKey/services/`, derived
   * from the URL of a Replicon page like `https://eu3.replicon.com/CompanyKey/my/timesheet/current`.
   */
  public get servicesRoot(): string {
    const url = new URL(this.page.url())
    if (!this.isAllowedHost(url.hostname)) {
      throw new Error(`The browser doesn't show Replicon (but ${url.hostname}). Is the login done?`)
    }
    const companyKey = url.pathname.split('/')[1]
    return `${url.origin}/${companyKey}/services/`
  }

  /**
   * @param operation - service and operation, e.g. `TimesheetService1.svc/GetStandardTimesheet2`
   * @param body - the request parameters
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

  /**
   * Like {@link call}, but returns the result payload and throws with Replicon's error message if
   * the call fails.
   */
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
