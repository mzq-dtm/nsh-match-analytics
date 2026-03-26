<template>
  <PlayerAttendance @open-history="openHistory" />
</template>

<script setup lang="ts">
import PlayerAttendance from '@/components/PlayerAttendance.vue'
import { useOpenHistoryRoute } from '@/composables/useOpenHistoryRoute'

const { openHistory } = useOpenHistoryRoute()
</script>
