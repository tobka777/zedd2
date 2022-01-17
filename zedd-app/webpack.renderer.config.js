const rules = require('./webpack.rules')

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
})
module.exports = {
  // Put your normal webpack config below here
  target: 'node',
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js', '.xml', '.jsx', '.css'],
    fallback: {
      fs: false,
      tls: false,
      net: false,
      path: false,
      zlib: false,
      http: false,
      https: false,
      stream: false,
      crypto: false,
      util: false,
      asserts: false,
      assert: false,
      os: false,
      url: false,
      buffer: false,
      util: false,
      querystring: false,
      constants: false,
      child_process: false,
      browser: false,
    },
  },
  module: {
    rules,
  },
  externals: [
    ({ context, request }, callback) => {
      if (
        [
          'bindings',
          // 'mobx-react',
          // 'mobx',
          //   'react-dom',
          //   'react',
          'selenium-webdriver',
          'selenium-webdriver/chrome',
          'electron-windows-notifications',
          'zedd-win32',
          'win-ca',
        ].includes(request) ||
        /^\w:\\.*/.test(request)
      ) {
        return callback(null, 'commonjs ' + request)
      }
      callback()
    },
  ],
}
