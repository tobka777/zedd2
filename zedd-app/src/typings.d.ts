declare const MAIN_WINDOW_WEBPACK_ENTRY: string
declare module '*.xml' {
  export default string
}

declare module '*.md' {
  export default string
}

// Side-effect CSS imports (index.css, react-date-range styles) have no type info.
declare module '*.css'

// `var` (not `let`) so these are exposed as properties of globalThis / Node's `global`,
// which the code accesses as `global.isDev` / `global.appUserModelId`.
declare var isDev: boolean
declare var appUserModelId: string
