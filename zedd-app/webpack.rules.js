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
                libraryName: '@mui/material',
                libraryDirectory: '',
                camel2DashComponentName: false,
              },
              'core',
            ],
            [
              'babel-plugin-import',
              {
                libraryName: '@mui/icons-material',
                libraryDirectory: '',
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
