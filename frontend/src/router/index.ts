import { createRouter, createWebHistory } from 'vue-router'
import MatchRecordsPage from '@/views/MatchRecordsPage.vue'
import PlayerAttendancePage from '@/views/PlayerAttendancePage.vue'
import PlayerHistoryPage from '@/views/PlayerHistoryPage.vue'
import MatchConfiguratorPage from '@/views/MatchConfiguratorPage.vue'
import HelpPage from '@/views/HelpPage.vue'


const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/match' },
    {
      path: '/match',
      name: 'match',
      component: MatchRecordsPage,
    },
    {
      path: '/attendance',
      name: 'attendance',
      component: PlayerAttendancePage,
    },
    {
      path: '/player-history',
      name: 'player-history',
      component: PlayerHistoryPage,
    },
    {
      path: '/match-configurator',
      name: 'match-configurator',
      component: MatchConfiguratorPage,
    },
    {
      path: '/help',
      name: 'help',
      component: HelpPage,
    },
  ],
})

export default router
