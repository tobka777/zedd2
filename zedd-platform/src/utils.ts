import { ElementHandle, Page, WaitForSelectorOptions } from 'puppeteer'
import { InvalidPlattformUrlException } from './exception'

export function checkPlatformUrl(urlToCheck: any) {
  if (!urlToCheck) {
    throw new InvalidPlattformUrlException(urlToCheck)
  }
    const urlParsed = new URL(urlToCheck)

  if (!urlParsed.protocol || !urlParsed.host || !urlParsed.pathname) {
    throw new InvalidPlattformUrlException(urlToCheck)
  }
}

export async function clearInput(input: ElementHandle<any> | null) {
  await input?.click({ count: 3 })
  await input?.press('Backspace')
}

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
