module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: {
    index: './src/main.ts',
    // the platform integrations (Playwright + Edge), run in a separate utility process
    'browser-worker': './src/browserWorker.ts',
  },
  output: {
    filename: '[name].js',
  },
  externals: {
    'playwright-core': 'commonjs playwright-core',
  },
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.xml', '.jsx', '.css', '.json'],
  },
}
