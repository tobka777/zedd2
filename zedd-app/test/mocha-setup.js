// mocha bootstrap: stub non-JS asset imports (e.g. `import './index.css'` in PlatformState)
// so that modules can be loaded in a plain Node process.
require.extensions['.css'] = () => {}
