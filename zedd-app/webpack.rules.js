module.exports = [
  {
    test: /\.(txt|xml)$/i,
    use: 'raw-loader',
  },
  // Add support for native node modules
  {
    test: /\.node$/,
    use: 'node-loader',
  },
  {
    test: /\.(m?js|node|selenium-webdriver)$/,
    parser: { amd: false },
    use: {
      loader: '@marshallofsound/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|.webpack)/,
    loaders: [
      // use babel-plugin-import to convert import {...} from '@material-ui/icons'
      // to default icons. REMOVING THIS WILL LEAD TO LONG REBUILD TIMES!
      // see https://material-ui.com/guides/minimizing-bundle-size/
      {
        loader: 'babel-loader',
        options: {
          presets: [],
          plugins: [
            [
              'babel-plugin-import',
              {
                libraryName: '@material-ui/core',
                libraryDirectory: 'esm',
                camel2DashComponentName: false,
              },
              'core',
            ],
            [
              'babel-plugin-import',
              {
                libraryName: '@material-ui/icons',
                libraryDirectory: 'esm',
                camel2DashComponentName: false,
              },
              'icons',
            ],
          ],
        },
      },
      {
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
]
