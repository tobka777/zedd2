export class InvalidPlatformUrlException extends Error {
  constructor(url: string) {
    super(`url ${JSON.stringify(url)} is not valid`)
  }
}
