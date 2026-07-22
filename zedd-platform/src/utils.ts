import * as url from 'url'
import { ElementHandle, Page, WaitForSelectorOptions } from 'puppeteer'
import { InvalidPlattformUrlException } from './exception'

export function checkPlatformUrl(urlToCheck: any) {
  if (!urlToCheck) {
    throw new InvalidPlattformUrlException(urlToCheck)
  }

  let parsed: URL
  try {
    parsed = new URL(urlToCheck)
  } catch {
    throw new InvalidPlattformUrlException(urlToCheck)
  }

  if (!parsed.protocol || !parsed.host || !parsed.pathname) {
    throw new InvalidPlattformUrlException(urlToCheck)
  }
}

export async function clearInput(input: ElementHandle<any> | null) {
  await input?.click({ count: 3 })
  await input?.press('Backspace')
}

// Puppeteer removed page.$x / elementHandle.$x, page.waitForXPath and page.waitForTimeout
// (deprecated since v18, removed in v22+). These helpers reproduce the old behaviour on top
// of the built-in `xpath/` query handler so the integration code can stay XPath-based.
type XPathContext = { $$(selector: string): Promise<ElementHandle<Element>[]> }

export function $x(ctx: XPathContext, expression: string): Promise<ElementHandle<Element>[]> {
  return ctx.$$('xpath/' + expression)
}

export function waitForXPath(
  page: Page,
  expression: string,
  options?: WaitForSelectorOptions,
): Promise<ElementHandle<Element> | null> {
  return page.waitForSelector('xpath/' + expression, options)
}

export function waitForTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
