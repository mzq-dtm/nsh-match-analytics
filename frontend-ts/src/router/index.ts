import { createRouter, createWebHistory } from 'vue-router'
import MatchRecordsPage from '@/views/MatchRecordsPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/match' },
    {
      path: '/match',
      name: 'match',
      component: MatchRecordsPage,
    },
  ],
})

export default router
