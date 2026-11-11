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
    alias: {
      '@aws-sdk/client-s3': false,
      'playwright-core': false,
    },
  },
  externals: {
    // for Clarity, which is inactive (see zedd-platform/src/clarity/clarity-integration.ts)
    // 'selenium-webdriver': 'commonjs selenium-webdriver',
    // 'selenium-webdriver/chrome': 'commonjs selenium-webdriver/chrome',
    'win-ca': 'commonjs win-ca',
  },
}
