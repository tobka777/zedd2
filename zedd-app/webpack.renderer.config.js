const rules = require('./webpack.rules')

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
})
module.exports = {
  // Put your normal webpack config below here
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js', '.xml'],
  },
  module: {
    rules,
  },
  externals: [
    function (context, request, callback) {
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
