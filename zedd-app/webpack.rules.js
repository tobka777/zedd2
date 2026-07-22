module.exports = [
  // Add support for native node modules
  {
    test: /\.(txt|xml|md)$/i,
    use: 'raw-loader',
  },
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules\/.+\.node$/,
    use: 'node-loader',
  },
  {
    test: /\.(m?js|node|selenium-webdriver)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: [
      // MUI v5+ supports tree-shaking of named imports directly, so the previous
      // babel-plugin-import step is no longer required (it was also incompatible with Babel 8).
      {
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
]
