## Prerequisites

1. Node 25+
2. Microsoft Edge (for the Replicon and OTT import/export)

## Development

```sh
git clone https://github.com/tobka777/zedd2.git
cd zedd2

# install and build the platform package
cd zedd-platform
npm install --workspaces=false
npm run build

# install and start the app
cd ../zedd-app
npm install --workspaces=false
npm start
```

After changes in `zedd-platform`, run `npm run build` there again before starting the app.

## Checks

In `zedd-app`:

```sh
npm test           # unit tests (mocha)
npm run typecheck  # TypeScript
npm run lint       # ESLint 
```

## Publishing

Releases are built by GitHub Actions ([release.yml](.github/workflows/release.yml)): pushing a tag builds the Windows (x64) and macOS (arm64) app and creates a **draft** release on GitHub. No local build or GitHub token is needed.

1. Set the version in `zedd-app/package.json` (without creating a git tag in the subfolder):

   ```sh
   cd zedd-app
   npm version 3.2.0 --no-git-tag-version   # or: patch / minor
   ```

2. In `CHANGELOG.md`, rename `[Unreleased]` to the version and date, e.g. `## [x.x.x] - YYYY-MM-DD`
3. Commit both files and push the commit
4. Tag the commit and push the tag:

   ```sh
   git tag v3.2.0
   git push origin v3.2.0
   ```

5. Wait for the `Release` workflow on GitHub, check the draft release and its files, then publish it

Pushes to `develop` and `hotfix/**` build a beta version ([beta.yml](.github/workflows/beta.yml)).
