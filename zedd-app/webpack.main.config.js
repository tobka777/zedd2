module.exports = {
  entry: {
    index: './src/main.ts',
    'browser-worker': './src/browserWorker.ts',
  },
  output: {
    filename: '[name].js',
  },
  externals: {
    'playwright-core': 'commonjs playwright-core',
  },
  module: {
    rules: require('./webpack.rules'),
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.xml', '.jsx', '.css', '.json'],
  },
}
