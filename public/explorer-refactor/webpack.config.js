const path = require('path');
const webpack = require('webpack')
const {
  VueLoaderPlugin
} = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin')

function resolve(dir) {
  return path.join(__dirname, '.', dir)
}

module.exports = {
  // mode: 'development',
  entry: {
    app: ['./src/index.js'],
    // base: ['./src/stylesheets/base.scss'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: process.env.PUBLIC_PATH || '/', // path where to find the bundled assets and chunks
    filename: '[name].[hash].js',
  },
  module: {
    rules: [{
        test: /\.vue$/,
        loader: 'vue-loader'
      },
      // this will apply to both plain .js files
      // AND <script> blocks in vue files
      {
        test: /\.js$/,
        exclude: /node_modules\/.*/,
        loader: 'babel-loader'
      },
      /*
      // this will apply to both plain .scss files
      // AND <style lang="scss"> blocks in vue files
      {
        test: /\.scss$/,
        // exclude: /node_modules/,
        use: [
          'vue-style-loader',
          MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader',
          'sass-loader'
        ]
      },
      {
        // needed to import css-files from vue-components
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader'
        ]
      },
      */
    ]
  },
  plugins: [
    // make sure to include the plugin for the vue single-file-components magic
    new VueLoaderPlugin(),

    new HtmlWebpackPlugin({
      inject: false,
      hash: true,
      template: './src/index.tmpl',
      filename: 'index.html',
      inject: 'body',
      showErrors: true,
      minify: {
        minifyCSS: true,
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
      },
    }),
   ],
  devServer: {
    contentBase: [resolve('src'), resolve('config-env/dev/')],
    historyApiFallback: true,
    compress: true,
    port: 9000,
    host: '0.0.0.0',
    disableHostCheck: true,
    overlay: {
      warnings: false,
      errors: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    stats: {
      color: true,
      modules: false,
      chunks: false,
    },
  },
  devtool: 'source-map',
};
