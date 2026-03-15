<template>
  <MatchRecords @openHistory="openHistory" />
</template>

<script setup>
import MatchRecords from '@/components/MatchRecords.vue'
import { useOpenHistoryRoute } from '@/composables/useOpenHistoryRoute'

const { openHistory } = useOpenHistoryRoute()
</script>
