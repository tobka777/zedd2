import { ElementHandle, Page } from 'playwright-core'
import { InvalidPlatformUrlException } from './exception'

export function checkPlatformUrl(urlToCheck: unknown): asserts urlToCheck is string {
  if (typeof urlToCheck !== 'string') {
    throw new InvalidPlatformUrlException(String(urlToCheck))
  }
  try {
    new URL(urlToCheck)
  } catch {
    throw new InvalidPlatformUrlException(urlToCheck)
  }
}

type QueryContext = { $$(selector: string): Promise<ElementHandle<SVGElement | HTMLElement>[]> }

export function $x(ctx: QueryContext, expression: string): Promise<ElementHandle<Element>[]> {
  return ctx.$$('xpath=' + expression) as Promise<ElementHandle<Element>[]>
}

export function waitForSelector(
  page: Page,
  selector: string,
  options: { timeout?: number } = {},
): Promise<ElementHandle<SVGElement | HTMLElement>> {
  return page.waitForSelector(selector, { state: 'attached', ...options })
}

export function waitForTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Converts an string into the
 * colon-separated ASCII representation.
 *
 */
export function magicToken(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0))
    .join(':')
}

import { endOfMonth, format, startOfMonth } from 'date-fns'

/**
 * Returns the current month as date path:
 * yyyyMMdd/yyyyMMdd
 *
 * Example:
 * 20260801/20260831
 */
export function getCurrentMonthDatePath(): string {
  const now = new Date()

  return [format(startOfMonth(now), 'yyyyMMdd'), format(endOfMonth(now), 'yyyyMMdd')].join('/')
}
