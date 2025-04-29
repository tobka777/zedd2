const rules = require('./webpack.rules')

rules.push({
    test: /\.css$/,
    use: [{loader: 'style-loader'}, {loader: 'css-loader'}],
})

module.exports = {
    module: {
        rules,
    },
    target: 'electron-renderer',
    resolve: {
        extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    },
    externals: {
        'puppeteer': 'commonjs puppeteer',

        'selenium-webdriver': 'commonjs selenium-webdriver',

        'selenium-webdriver/chrome': 'commonjs selenium-webdriver/chrome',

        'win-ca': 'commonjs win-ca',
    },
}
