export default [
  {
    path: '/blocks',
    name: 'blocks',
    component: () => import('./views/blocks.vue'),
  },
  {
    path: '/blocks/:blockId',
    name: 'block',
    component: () => import('./views/block.vue'),
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
