const rules = require('./webpack.rules')

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
})

module.exports = {
  module: {
    rules,
  },
  target: 'electron-renderer',
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    // https://github.com/ZJONSSON/node-unzipper/issues/330 - bundle issue with unzipper
    alias: {
      '@aws-sdk/client-s3': false,
      // never load Playwright in the window, it runs in the browser worker process
      'playwright-core': false,
    },
  },
  externals: {
    'selenium-webdriver': 'commonjs selenium-webdriver',

    'selenium-webdriver/chrome': 'commonjs selenium-webdriver/chrome',

    'win-ca': 'commonjs win-ca',
  },
}
