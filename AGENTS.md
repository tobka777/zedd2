# AGENTS.md

This repository contains **Zedd-App**, a Grindstone-like time planning/tracking desktop app that automates booking to **Replicon** and **OTT** and supports multiple accounts.

The codebase is primarily **TypeScript** and is split into:

- `zedd-app/`: Electron + React (renderer) + MobX state
- `zedd-platform/`: automation/integration library (Puppeteer/Selenium) used by the app
- `zedd-win32/`: native Windows addon (C++/node-gyp) (rarely touched)
- `OTTZTalker/`: git submodule containing a Tampermonkey user script that can talk to the app via a local REST server (implemented in `zedd-app/src/ottzTalkerServer.ts`) to exchange platform tasks / booking data

Use this document as the “how to work here” guide for AI coding agents.

## Repository layout

- `README.md`: user-facing overview and usage
- `CHANGELOG.md`: release notes
- `CONTRIBUTING.md`: basic contributor instructions
- `.github/workflows/release.yml`: GitHub Actions release pipeline

### `zedd-app/` (Electron app)

- **Main process** entry: `zedd-app/src/main.ts`
- **Renderer** entry: `zedd-app/src/renderer.ts` (creates React root)
- Core state:
  - `zedd-app/src/AppState.ts`
  - `zedd-app/src/PlatformState.ts`
- Settings/config: `zedd-app/src/ZeddSettings.ts`

### `zedd-platform/` (automation/integration library)

Exports from `zedd-platform/src/index.ts`.

Key abstractions:

- `PlatformIntegration` (abstract): `zedd-platform/src/platform-integration.ts`
- Concrete integrations:
  - `OTTIntegration`: `zedd-platform/src/ott-integration.ts`
  - `RepliconIntegration`: `zedd-platform/src/replicon-integration.ts`

## Environment prerequisites

- **Node.js**: repo docs say **Node 16+** (`CONTRIBUTING.md`).
- **Chrome**: required for the automation flows. The app enforces **Chrome 115+** (`zedd-app/src/renderer.ts`).

Notes:

- This repo currently contains `package-lock.json` files; prefer `npm` over `yarn/pnpm` unless you intentionally migrate tooling.

## Install & run (local development)

The app depends on `zedd-platform` via a local file dependency (`"zedd-platform": "file:../zedd-platform"`), so you generally:

1. Build `zedd-platform`
2. Start `zedd-app`

### Build platform library

From `zedd-platform/`:

- `npm install`
- `npm run build`

### Run the Electron app

From `zedd-app/`:

- `npm install`
- `npm run start`

`start` runs Electron Forge with webpack in dev mode.

## Common commands

### `zedd-platform/`

- `npm run build`
- `npm run watch`
- `npm run prettier`

### `zedd-app/`

- `npm run start`
- `npm run typecheck`
- `npm run lint` (ESLint with `--fix`)
- `npm run prettier`
- `npm test` (Mocha; currently targets `src/**/Undoer.test.ts`)

### Release / packaging (`zedd-app/`)

- `npm run make`: build distributables
- `npm run publish`: Electron Forge publish

GitHub Actions release workflow (`.github/workflows/release.yml`) runs on tag push and:

- installs + builds `zedd-platform`
- installs `zedd-app`
- runs `npm run make`
- uploads artifacts to a draft GitHub release

## Coding conventions (follow what’s in the repo)

- **Language**: TypeScript
- **UI**: React + MUI
- **State**: MobX
- **Formatting**: Prettier configs live in `package.json` in both `zedd-app/` and `zedd-platform/`
- **Linting**:
  - `zedd-app/`: ESLint (`zedd-app/.eslintrc.js`)
  - `zedd-app/`: legacy `tslint` script exists; avoid introducing new TSLint rules unless required
- **Type checking**: `zedd-app/tsconfig.json` uses strict-ish flags (e.g. `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`).

When making changes:

- Keep changes minimal and localized.
- Avoid reformatting unrelated files.
- Prefer existing patterns in `AppState` / `PlatformState` for state updates and persistence.

## How the app works (high level)

- The Electron **main process** creates the `BrowserWindow` and handles a minimal IPC channel for quitting.
- The **renderer** (`renderer.ts`) initializes:
  - a local config directory under `~/zedd/`
  - `PlatformState` (automation/bookings)
  - `AppState` (calendar/time slices, persistence, UI state)
  - Jira integration (optional)
  - Chrome / chromedriver checks and installation
  - tray/menu behaviors

The integrations (Replicon/OTT) live in `zedd-platform` and are driven from `PlatformState`.

## Working on integrations (Puppeteer/Selenium)

- Expect fragile selectors and timing dependencies.
- When changing selectors, prefer:
  - stable attributes (`data-*`, `role`, ids)
  - explicit waits (`waitForSelector`, `waitForXPath`) already used by the code
- Avoid changing unrelated flows; integration regressions are easy.

## Testing

Current tests are Mocha-based and live under `zedd-app/src/*/*.test.ts`.

- Run: `zedd-app`: `npm test`

If you add logic-heavy behavior (especially in `AppState`, `Undoer`, or utilities), add/extend tests in the same style.

## Security / secrets

- Do **not** commit tokens.
- Publishing requires `GITHUB_TOKEN` (see `CONTRIBUTING.md`).

## Agent workflow expectations

When you (as an AI agent) are asked to implement something:

- Start by locating the authoritative code path:
  - UI/state: `zedd-app/src`
  - Integrations: `zedd-platform/src`
- Make the smallest change that achieves the goal.
- Use existing scripts for formatting/linting rather than introducing new tooling.
- If a change affects packaging/release artifacts, cross-check `.github/workflows/release.yml`.
