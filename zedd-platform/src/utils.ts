import * as url from 'url'
import { ElementHandle } from 'puppeteer'
import { InvalidPlattformUrlException } from './exception'

export function checkPlatformUrl(urlToCheck: any) {
  if (!urlToCheck) {
    throw new InvalidPlattformUrlException(urlToCheck)
  }
  const urlParts = url.parse(urlToCheck)
  if (!urlParts.protocol || !urlParts.host || !urlParts.path) {
    throw new InvalidPlattformUrlException(urlToCheck)
  }
}

export async function clearInput(input: ElementHandle<any> | null) {
    await input?.click({clickCount: 3});
    await input?.press('Backspace');
}
