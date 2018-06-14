export default [
  {
    path: 'blocks',
    name: 'blocks',
    component: () => import('./views/blocks.vue'),
  },
  {
    path: '/',
    redirect: {
      name: 'blocks',
    },
  },
  {
    path: '*',
    redirect: '/',
  },
]
