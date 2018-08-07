import Vue from 'vue'
import ENV from './utils/getEnv'
import router from './router'
import App from './app.vue'

Vue.config.silent = !ENV.enableDebug // silent will be set to false in debugging is enabled
Vue.config.performance = ENV.enableDebug
Vue.config.productionTip = ENV.enableDebug

// eslint-disable-next-line no-new
new Vue({
  el: '#app',
  router,
  render: h => h(App),
})
