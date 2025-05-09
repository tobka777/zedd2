import * as url from 'url'
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
