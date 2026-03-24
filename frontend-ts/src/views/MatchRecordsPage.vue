<template>
  <MatchRecords @open-history="openHistory" />
</template>

<script setup lang="ts">
import MatchRecords from '@/components/MatchRecords.vue'
import { useOpenHistoryRoute } from '@/composables/useOpenHistoryRoute'

const { openHistory } = useOpenHistoryRoute()
</script>
