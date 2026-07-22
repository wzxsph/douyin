import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  {
    path: '/home',
    name: 'recommendation',
    component: () => import('@/showcase/pages/FeedPage.vue')
  },
  {
    path: '/author/:authorSlug',
    name: 'author',
    component: () => import('@/showcase/pages/AuthorPage.vue')
  },
  { path: '/:pathMatch(.*)*', redirect: '/home' }
]

export default routes
