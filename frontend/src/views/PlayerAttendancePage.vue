<template>
  <PlayerAttendance @openHistory="openHistory" />
</template>

<script setup>
import PlayerAttendance from '@/components/PlayerAttendance.vue'
import { useOpenHistoryRoute } from '@/composables/useOpenHistoryRoute'

const { openHistory } = useOpenHistoryRoute()
</script>
