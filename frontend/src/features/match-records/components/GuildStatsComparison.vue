<template>
  <div
    ref="overlayRef"
    class="comparison-overlay"
    tabindex="0"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div
      class="comparison-modal"
      role="dialog"
      aria-modal="true"
      aria-label="敌我统计对比"
    >
      <button class="modal-close" aria-label="关闭" @click="emit('close')">×</button>

      <header class="guild-header">
        <span class="home-guild-name">
          {{ homeGuildName }}（总战力：{{ formatValue(homeStats.totalCombatPower, 0) }}）
        </span>
        <span class="away-guild-name">{{ awayGuildName }}</span>
      </header>

      <div v-if="loading" class="comparison-state">正在加载双方数据…</div>
      <div v-else-if="errorMessage" class="comparison-state comparison-error" role="alert">
        {{ errorMessage }}
      </div>

      <section v-else class="comparison-metrics">
        <article v-for="metric in metrics" :key="metric.key" class="comparison-metric">
          <div class="comparison-values">
            <span class="home-value">
              {{ formatValue(metric.leftValue, metric.decimals) }}
            </span>
            <span class="metric-label">{{ metric.label }}</span>
            <span class="away-value">
              {{ formatValue(metric.rightValue, metric.decimals) }}
            </span>
          </div>

          <div class="comparison-track" aria-hidden="true">
            <div class="comparison-half home-half">
              <div
                v-if="metric.leftBarPercent > 0"
                class="comparison-bar home-bar"
                :style="{ width: `${metric.leftBarPercent}%` }"
              ></div>
            </div>
            <div class="comparison-half away-half">
              <div
                v-if="metric.rightBarPercent > 0"
                class="comparison-bar away-bar"
                :style="{ width: `${metric.rightBarPercent}%` }"
              ></div>
            </div>
          </div>
        </article>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { buildGuildMatchStatistics } from '@/features/match-records/analysis'
import type {
  GuildMatchStatisticKey,
  NormalizedPerformance,
} from '@/features/match-records/types'

interface ComparisonMetricDefinition {
  key: GuildMatchStatisticKey
  label: string
  decimals: number
}

interface ComparisonMetricRow extends ComparisonMetricDefinition {
  leftValue: number | null
  rightValue: number | null
  leftBarPercent: number
  rightBarPercent: number
}

const METRIC_DEFINITIONS: ComparisonMetricDefinition[] = [
  { key: 'participantCount', label: '联赛人数', decimals: 0 },
  { key: 'totalDamageToPlayers', label: '总对玩家伤害', decimals: 0 },
  { key: 'totalDamageToStructures', label: '总对建筑伤害', decimals: 0 },
  { key: 'totalKills', label: '总击杀', decimals: 0 },
  { key: 'kd', label: 'KD', decimals: 2 },
  { key: 'totalHealing', label: '总治疗', decimals: 0 },
  { key: 'totalHuayu', label: '总化羽', decimals: 0 },
  { key: 'totalQingdeng', label: '总青灯焚骨', decimals: 0 },
  { key: 'totalControl', label: '总控制', decimals: 0 },
  { key: 'totalWarResources', label: '总战备资源', decimals: 0 },
]

const props = defineProps<{
  homeGuildName: string
  awayGuildName: string
  homeRows: NormalizedPerformance[]
  awayRows: NormalizedPerformance[]
  loading: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const overlayRef = ref<HTMLElement | null>(null)
const homeStats = computed(() => buildGuildMatchStatistics(props.homeRows))
const awayStats = computed(() => buildGuildMatchStatistics(props.awayRows))

const metrics = computed<ComparisonMetricRow[]>(() =>
  METRIC_DEFINITIONS.map((definition) => {
    const leftValue = homeStats.value[definition.key]
    const rightValue = awayStats.value[definition.key]
    const canCompare = leftValue != null && rightValue != null
    const maximum = canCompare ? Math.max(leftValue, rightValue) : 0

    return {
      ...definition,
      leftValue,
      rightValue,
      leftBarPercent:
        canCompare && maximum > 0 && leftValue > 0
          ? Math.min(100, (leftValue / maximum) * 100)
          : 0,
      rightBarPercent:
        canCompare && maximum > 0 && rightValue > 0
          ? Math.min(100, (rightValue / maximum) * 100)
          : 0,
    }
  }),
)

function formatValue(value: number | null, decimals: number): string {
  if (value == null || !Number.isFinite(value)) return '暂无数据'

  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown)
  nextTick(() => overlayRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<style scoped>
.comparison-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  outline: none;
}

.comparison-modal {
  position: relative;
  width: min(680px, 90vw);
  height: auto;
  max-height: 88vh;
  padding: 0.8rem 1.4rem 1rem;
  overflow: auto;
  box-sizing: border-box;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.modal-close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: 0;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.guild-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 2rem;
  padding: 0 1.75rem 0.25rem;
  border-bottom: 1px solid #e7e9ed;
  font-size: 1rem;
  font-weight: 700;
}

.home-guild-name {
  color: #2878d0;
  text-align: left;
}

.away-guild-name {
  color: #171a1f;
  text-align: right;
}

.comparison-state {
  padding: 4rem 1rem;
  color: #68717d;
  text-align: center;
}

.comparison-error {
  color: #c0392b;
}

.comparison-metrics {
  display: flex;
  flex-direction: column;
}

.comparison-metric {
  padding: 0.28rem 0;
  border-bottom: 1px solid #f0f1f3;
}

.comparison-metric:last-child {
  border-bottom: 0;
}

.comparison-metric:first-child {
  padding-top: 0.18rem;
}

.comparison-values {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: baseline;
  gap: 0.8rem;
  margin-bottom: 0.08rem;
  font-variant-numeric: tabular-nums;
}

.home-value,
.away-value {
  font-family: "Courier New", Courier, monospace;
  font-size: 0.98rem;
  font-weight: 700;
}

.home-value {
  color: #2878d0;
  text-align: left;
}

.away-value {
  color: #171a1f;
  text-align: right;
}

.metric-label {
  min-width: 8.5rem;
  color: #4c5561;
  text-align: center;
  white-space: nowrap;
}

.comparison-track {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 6px;
  height: 8px;
  margin: 0 5%;
  overflow: hidden;
  border-radius: 999px;
  background: #e7e9ed;
}

.comparison-track::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: #aeb5bf;
  content: "";
  transform: translateX(-50%);
}

.comparison-half {
  display: flex;
  min-width: 0;
}

.home-half {
  justify-content: flex-end;
}

.away-half {
  justify-content: flex-start;
}

.comparison-bar {
  height: 100%;
  transition: width 0.25s ease;
}

.home-bar {
  border-radius: 999px 2px 2px 999px;
  background: #409eff;
}

.away-bar {
  border-radius: 2px 999px 999px 2px;
  background: #171a1f;
}

@media (max-width: 640px) {
  .comparison-modal {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .guild-header {
    padding-right: 0.5rem;
    padding-left: 0.5rem;
  }

  .comparison-values {
    gap: 0.4rem;
  }

  .metric-label {
    min-width: 6.5rem;
    font-size: 0.88rem;
  }
}
</style>
