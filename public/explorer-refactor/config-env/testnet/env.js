// eslint-disable-next-line func-names
(function(win) {
  const __env = {
    name: 'testnet',

    // API url
    apiUrl: 'http://localhost:12101',

    // Base url
    baseUrl: '/',

    // Whether or not to enable debug mode
    // Setting this to false will disable console output
    enableDebug: true,
  }
  // eslint-disable-next-line no-param-reassign
  win.__env = __env
}(window))
