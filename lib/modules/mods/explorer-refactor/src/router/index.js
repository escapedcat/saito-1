import Vue from 'vue'
import VueRouter from 'vue-router'
// import { routes } from '@vuecmp/routes'

Vue.use(VueRouter)

const router = new VueRouter({
  mode: 'history',
  // routes,
  scrollBehavior (to) {
    // scroll to anchor
    if (to.hash) {
      return {
        selector: to.hash,
      }
    }
    // scroll to top
    return { x: 0, y: 0 }
  },
  linkActiveClass: 'is-active',
  linkExactActiveClass: 'is-exact-active',
})

export default router
