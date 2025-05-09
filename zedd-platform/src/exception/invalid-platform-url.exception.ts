export class InvalidPlattformUrlException extends Error {
  constructor(url: string) {
    super(`url ${JSON.stringify(url)} is not valid`)
  }
}
