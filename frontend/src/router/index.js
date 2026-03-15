import { createRouter, createWebHistory } from 'vue-router'
import MatchRecordsPage from '@/views/MatchRecordsPage.vue'
import MatchVisualization from '@/components/MatchVisualization.vue'
import PlayerAttendancePage from '@/views/PlayerAttendancePage.vue'
import PlayerHistoryPage from '@/views/PlayerHistoryPage.vue'
import MatchConfigurator from '@/components/MatchConfigurator.vue'
import Help from '@/components/Help.vue'

const routes = [
  { path: '/', redirect: '/match' },
  {
    path: '/match',
    name: 'match',
    component: MatchRecordsPage,
  },
  {
    path: '/match-visual',
    name: 'match-visual',
    component: MatchVisualization,
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
    component: MatchConfigurator,
  },
  {
    path: '/help',
    name: 'help',
    component: Help,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
