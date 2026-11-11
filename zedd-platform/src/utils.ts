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

export interface WaitOptions {
  /** wait until the element is visible */
  visible?: boolean
  /** wait until the element is hidden or detached; resolves to null then */
  hidden?: boolean
  timeout?: number
}

type WaitContext = Pick<Page, 'waitForSelector'> | Pick<ElementHandle, 'waitForSelector'>

/**
 * Waits for a selector like puppeteer did: by default only until the element is in the DOM, while
 * Playwright waits until it is visible.
 */
export async function waitForSelector(
  ctx: WaitContext,
  selector: string,
  { visible, hidden, timeout }: WaitOptions = {},
): Promise<ElementHandle<Element> | null> {
  const state = hidden ? 'hidden' : visible ? 'visible' : 'attached'
  return (await ctx.waitForSelector(selector, { state, timeout })) as ElementHandle<Element> | null
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
