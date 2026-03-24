<template>
  <div class="dev-placeholder">
    PlayerHistoryPerformance migration in progress
    <div v-if="externalPlayerId">playerId: {{ externalPlayerId }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  externalPlayerId: string
}>()
</script>
