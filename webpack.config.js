const path = require('path');
const glob = require("glob");
const {testGlob} = require('./package.json');
const testFiles = glob.sync(testGlob);

const publicPath = path.join(__dirname, 'public');
const distPath = path.join(__dirname, 'dist');

const mainPath = [path.join(__dirname, 'dist', 'index.js')];
module.exports = {
    mode: 'development',
    devtool: 'eval',
    entry: {
        main: mainPath
    },
    output: {
        path: distPath,
        filename: '[name].bundle.js',
        libraryTarget: 'umd',
        pathinfo: true,
        library: 'dist'
    },
    devServer: {
        watchFiles: ['src/**/*.ts', 'public/**/*'],
        static: {
          directory: publicPath,
        },
        compress: true
    },
    module: {
        noParse: [/\.min\.js$/, /\.bundle\.js$/]
    }
};
