declare const MAIN_WINDOW_WEBPACK_ENTRY: string
declare module '*.xml' {
  export default string
}

declare module '*.md' {
  export default string
}

declare namespace NodeJS {
  interface Global {
    isDev: boolean
    appUserModelId: string
  }
}
