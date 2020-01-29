'use strict'
const path = require('path')
const webpack = require('webpack')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const YFilesOptimizerPlugin = require('@yworks/optimizer/webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')

const config = {
  entry: {
    app: ['@babel/polyfill', path.resolve('app/app.ts')]
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  },

  module: {
    rules: [
      {
        // Include ts, tsx, js, and jsx files.
        test: /\.(ts|js)x?$/,
        exclude: /node_modules|app[/\\]data[/\\]|yfiles-typeinfo\.js/,
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env', '@babel/preset-typescript']
        }
      },
      {
        test: /\.css$/,
        // use: [MiniCssExtractPlugin.loader, 'css-loader']
        use: ['style-loader', 'css-loader'],
        sideEffects: true
      }
    ]
  },

  optimization: {
    splitChunks: {
      cacheGroups: {
        lib: {
          test: /([\\/]lib)|([\\/]node_modules[\\/])/,
          name: 'lib',
          chunks: 'all'
        }
      }
    }
  },
  plugins: [
    new CleanWebpackPlugin(),
    // https://stackoverflow.com/questions/28969861/managing-jquery-plugin-dependency-in-webpack
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery'
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css'
    }),
    new HtmlWebpackPlugin({
      template: 'app/index.html',
      alwaysWriteToDisk: true
    }),
    new CopyPlugin([
      { from: 'app/assets', to: 'assets' },
      { from: 'app/styles', to: 'styles' },
      { from: 'app/favicon.ico', to: 'favicon.ico' },
    ])
  ],
  performance: {
    hints: false
  }
}

module.exports = function(env, options) {
  console.log('Running webpack...')

  config.devServer = {
    contentBase: [path.join(__dirname, './app')],
    compress: true,
    port: 8085
  }
  if (options.mode === 'development') {
    config.entry.app.unshift(path.resolve('app/yfiles/yfiles-typeinfo.js'))

    // don't add the default SourceMapDevToolPlugin config
    config.devtool = false
    config.plugins.push(
      new webpack.SourceMapDevToolPlugin({
        filename: '[file].map',
        // add source maps for non-library code to enable convenient debugging
        exclude: ['lib.js']
      })
    )
  }

  if (options.mode === 'production') {
    config.plugins.unshift(
      new YFilesOptimizerPlugin({
        logLevel: 'info',
        blacklist: ['union', 'range']
      })
    )
  }

  return config
}
