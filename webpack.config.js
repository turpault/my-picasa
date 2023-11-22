const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: './client/app.ts',
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'app.js',
    sourceMapFilename: 'app.js.map',
    path: path.resolve(__dirname, 'public', 'dist'),
  }
};
