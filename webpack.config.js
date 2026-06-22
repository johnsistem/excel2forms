const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: {
    popup: './src/popup.js',
    background: './src/background.js',
    content: './src/content.js'
  },
  output: {
    filename: 'src/[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        exclude: /tesseract[/\\]/
      })
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' },
        { from: 'src/popup.html', to: 'src/popup.html' },
        { from: 'src/popup.css', to: 'src/popup.css' },
        { from: 'sandbox.html', to: 'sandbox.html' },
        { from: '_locales', to: '_locales' }
      ]
    })
  ],
  target: 'web',
  resolve: {
    extensions: ['.js']
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'asset/resource'
      }
    ]
  }
};
