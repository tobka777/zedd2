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
    },
  },
  externals: {
    'playwright-core': 'commonjs playwright-core',

    'selenium-webdriver': 'commonjs selenium-webdriver',

    'selenium-webdriver/chrome': 'commonjs selenium-webdriver/chrome',

    'win-ca': 'commonjs win-ca',
  },
}
