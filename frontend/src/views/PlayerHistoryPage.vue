<template>
  <PlayerHistoryPerformance :external-player-id="externalPlayerId" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PlayerHistoryPerformance from '@/components/PlayerHistoryPerformance.vue'

const route = useRoute()

const externalPlayerId = computed(() => {
  const raw = route.query.playerId

  if (Array.isArray(raw)) return String(raw[0] || '')
  return String(raw || '')
})
</script>
