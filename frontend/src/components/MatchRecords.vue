<template>
  <div class="match-records">
    <div class="controls">
      <label>
        选择联赛：
        <select v-model="selectedMatch" @change="loadPerformances">
          <option value="" disabled>-- 请选择 --</option>
          <option v-for="m in matches" :key="m.match_id" :value="m.match_id">
            {{ formatMatchName(m.match_name) }}
          </option>
        </select>
      </label>

      <span v-if="selectedMatch" class="outcome-text">{{ matchOutcomeText }}</span>

      <button class="toggle-side-btn" :disabled="!selectedMatch" @click="toggleViewSide">
        {{ isAwayView ? '显示本帮数据' : '显示对手数据' }}
      </button>

      <button class="analysis-btn" :disabled="!selectedMatch" @click="openAnalysisModal">
        自动分析
      </button>

      <button class="clear-btn" :disabled="!hasHighlights" @click="clearHighlights">
        清除标记
      </button>

      <span v-if="selectedMatch && matchNote" class="match-note">
        备注：{{ matchNote }}
      </span>
    </div>

    <div v-if="!selectedMatch" class="empty">请选择一个联赛查看数据</div>

    <div v-else class="data-display">
      <div class="sub-tabs">
        <button
          v-for="tab in subTabs"
          :key="tab.key"
          :class="{ active: activeSubTab === tab.key }"
          @click="activateSubTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeSubTab === 'summary'" class="summary-container">
        <div v-if="sortedAggregated.length" class="table-wrapper">
          <table class="results">
            <thead>
            <tr>
              <th @click="aggregatedSort.sortBy('leader_nick')">团长 <span v-if="aggregatedSort.sortKey.value==='leader_nick'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('total_count')">总人数 <span v-if="aggregatedSort.sortKey.value==='total_count'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('avg_total_combat_power')">平均总战力 <span v-if="aggregatedSort.sortKey.value==='avg_total_combat_power'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('kills')">总击败 <span v-if="aggregatedSort.sortKey.value==='kills'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('assists')">总助攻 <span v-if="aggregatedSort.sortKey.value==='assists'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('damage_to_players')">总对玩家伤害 <span v-if="aggregatedSort.sortKey.value==='damage_to_players'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('damage_to_structures')">总对建筑伤害 <span v-if="aggregatedSort.sortKey.value==='damage_to_structures'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('total_damage')">团总伤害 <span v-if="aggregatedSort.sortKey.value==='total_damage'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('healing_amount')">总治疗 <span v-if="aggregatedSort.sortKey.value==='healing_amount'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('damage_taken')">总承受伤害 <span v-if="aggregatedSort.sortKey.value==='damage_taken'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('serious_injuries')">总重伤 <span v-if="aggregatedSort.sortKey.value==='serious_injuries'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('kda')">团KD <span v-if="aggregatedSort.sortKey.value==='kda'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="aggregatedSort.sortBy('damage_per_kill')">单次击杀所需伤害 <span v-if="aggregatedSort.sortKey.value==='damage_per_kill'">{{ aggregatedSort.sortAsc.value?'▲':'▼' }}</span></th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="r in sortedAggregated" :key="r.leader_nick ?? 'unknown-leader'">
              <td>{{ r.leader_nick }}</td>
              <td>{{ r.total_count }}</td>
              <td>{{ r.avg_total_combat_power.toFixed(0) }}</td>
              <td>{{ r.kills }}</td>
              <td>{{ r.assists }}</td>
              <td>{{ r.damage_to_players }}</td>
              <td>{{ r.damage_to_structures }}</td>
              <td>{{ r.total_damage }}</td>
              <td>{{ r.healing_amount }}</td>
              <td>{{ r.damage_taken }}</td>
              <td>{{ r.serious_injuries }}</td>
              <td>{{ r.kda.toFixed(2) }}</td>
              <td>{{ r.damage_per_kill.toFixed(0) }}</td>
            </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty">暂无数据</div>
      </div>

      <div v-else-if="activeSubTab === 'profSummary'" class="summary-container">
        <div v-if="sortedProfAggregated.length" class="table-wrapper">
          <table class="results">
            <thead>
            <tr>
              <th @click="professionSort.sortBy('profession_name')">职业 <span v-if="professionSort.sortKey.value==='profession_name'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('total_count')">总人数 <span v-if="professionSort.sortKey.value==='total_count'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_total_combat_power')">平均总战力 <span v-if="professionSort.sortKey.value==='avg_total_combat_power'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_kills')">人均击败 <span v-if="professionSort.sortKey.value==='avg_kills'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_assists')">人均助攻 <span v-if="professionSort.sortKey.value==='avg_assists'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_damage_to_players')">人均玩家伤害 <span v-if="professionSort.sortKey.value==='avg_damage_to_players'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_damage_to_structures')">人均建筑伤害 <span v-if="professionSort.sortKey.value==='avg_damage_to_structures'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_healing_amount')">人均治疗 <span v-if="professionSort.sortKey.value==='avg_healing_amount'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_damage_taken')">人均承受伤害 <span v-if="professionSort.sortKey.value==='avg_damage_taken'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_serious_injuries')">人均重伤 <span v-if="professionSort.sortKey.value==='avg_serious_injuries'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
              <th @click="professionSort.sortBy('avg_control_count')">人均控制 <span v-if="professionSort.sortKey.value==='avg_control_count'">{{ professionSort.sortAsc.value?'▲':'▼' }}</span></th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="r in sortedProfAggregated" :key="r.profession_name ?? 'unknown-profession'">
              <td>{{ r.profession_name }}</td>
              <td>{{ r.total_count }}</td>
              <td>{{ r.avg_total_combat_power.toFixed(0) }}</td>
              <td>{{ r.avg_kills.toFixed(2) }}</td>
              <td>{{ r.avg_assists.toFixed(2) }}</td>
              <td>{{ r.avg_damage_to_players.toFixed(0) }}</td>
              <td>{{ r.avg_damage_to_structures.toFixed(0) }}</td>
              <td>{{ r.avg_healing_amount.toFixed(0) }}</td>
              <td>{{ r.avg_damage_taken.toFixed(0) }}</td>
              <td>{{ r.avg_serious_injuries.toFixed(2) }}</td>
              <td>{{ r.avg_control_count.toFixed(2) }}</td>
            </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty">暂无数据</div>
      </div>

      <div v-else class="detailed-container">
        <div v-if="showNestedTabs" class="nested-tabs">
          <button
            v-for="nt in nestedTabs"
            :key="nt.key"
            :class="{ active: activeNestedTab === nt.key }"
            @click="activeNestedTab = nt.key"
          >
            {{ nt.label }}
          </button>
        </div>

        <div v-if="!isAwayView" class="column-controls">
          <label v-for="col in columnsDef" :key="col.key">
            <input v-model="visibleColumns[col.key]" type="checkbox">
            {{ col.label }}
          </label>
        </div>

        <div v-else class="column-controls">
          <label v-for="col in awayColumnsDefForControl" :key="col.key">
            <input v-model="awayVisibleColumns[col.key]" type="checkbox">
            {{ col.label }}
          </label>
        </div>

        <StatTable
          :columns="columnsDef"
          :rows="detailedRows"
          row-key="row_id"
          history-id-key="player_id"
          :history-clickable="!isAwayView"
          :sort-key="detailSort.sortKey.value"
          :sort-asc="detailSort.sortAsc.value"
          :visible-columns="tableVisibleColumns"
          :bar-style-fn="barStyle"
          :profession-style-fn="professionStyle"
          :is-col-highlighted-fn="isColHighlighted"
          :is-row-highlighted-fn="isRowHighlighted"
          :cell-class-fn="cellClass"
          @sort="handleDetailSort"
          @open-history="gotoHistory"
          @header-context="onHeaderContext"
          @row-context="onRowContext"
          @cell-context="onCellContextByPayload"
        />
      </div>
    </div>

    <div
      v-if="showAnalysisModal"
      ref="analysisModalOverlayRef"
      class="modal-overlay"
      tabindex="0"
      @click.self="closeAnalysisModal"
      @keydown.esc="closeAnalysisModal"
    >
      <div class="modal analysis-modal">
        <button class="modal-close" aria-label="关闭" @click="closeAnalysisModal">×</button>
        <header class="analysis-header">
          <h3>{{ selectedMatchLabel }} 自动分析结果</h3>
          <p class="analysis-tip">
            <span style="font-weight: bold">考察指标：</span>除铁衣、九灵、素问外的职业考察指标为“击败”、“对玩家伤害”、“对建筑伤害”；铁衣额外新增考察指标“控制”；九灵额外新增考察指标“青灯焚骨”；素问考察指标只包含“治疗量”。
          </p>
          <p class="analysis-tip">
            <span style="font-weight: bold">指标阈值：</span>治疗量以外的指标阈值为{{ analysisPercentLabel }}分位数，治疗量指标阈值为{{ suwenAnalysisPercentLabel }}分位数的一半。（备注：一批数据中有{{ suwenAnalysisPercentLabel }}的数据小于等于{{ suwenAnalysisPercentLabel }}分位数）
          </p>
          <p class="analysis-tip">
            <span style="font-weight: bold">筛选条件：</span>所有考察指标均低于阈值的角色会出现在下表中。
          </p>
          <p> <span class="analysis-tip-warning">注意事项：对于眼位、资源位、连枝鸿等功能位角色存在假阳性，注意鉴别！</span></p>
        </header>

        <section v-if="analysisFailures.length" class="analysis-results">
          <table class="results analysis-table">
            <thead>
            <tr>
              <th>序号</th>
              <th>昵称</th>
              <th>职业</th>
              <th>所在团长</th>
              <th>击败 (&lt;{{ formatThresholdValue(analysisThresholds.global.kills) }})</th>
              <th>对玩家伤害 (&lt;{{ formatThresholdValue(analysisThresholds.global.damage_to_players) }})</th>
              <th>对建筑伤害 (&lt;{{ formatThresholdValue(analysisThresholds.global.damage_to_structures) }})</th>
              <th>治疗量 (&lt;{{ formatThresholdValue(analysisThresholds.suwen.healing_amount) }})</th>
              <th>青灯焚骨 (&lt;{{ formatThresholdValue(analysisThresholds.jiuling.skill_qingdeng) }})</th>
              <th>控制 (&lt;{{ formatThresholdValue(analysisThresholds.tieyi.control_count) }})</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(row, idx) in analysisFailures" :key="row.row_id">
              <td>{{ idx + 1 }}</td>
              <td>{{ row.recorded_nick }}</td>
              <td :style="professionStyle(row.profession_name)">{{ row.profession_name }}</td>
              <td>{{ row.leader_nick }}</td>
              <td>{{ row.profession_name === '素问' ? '非考察指标' : formatAnalysisValue(row.kills) }}</td>
              <td>{{ row.profession_name === '素问' ? '非考察指标' : formatAnalysisValue(row.damage_to_players) }}</td>
              <td>{{ row.profession_name === '素问' ? '非考察指标' : formatAnalysisValue(row.damage_to_structures) }}</td>
              <td>{{ row.profession_name === '素问' ? formatAnalysisValue(row.healing_amount) : '非考察指标' }}</td>
              <td>{{ row.profession_name === '九灵' ? formatAnalysisValue(row.skill_qingdeng) : '非考察指标' }}</td>
              <td>{{ row.profession_name === '铁衣' ? formatAnalysisValue(row.control_count) : '非考察指标' }}</td>
            </tr>
            </tbody>
          </table>
        </section>

        <div v-else class="empty analysis-empty">本场暂无数据不达标人员</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import StatTable from '@/components/table/StatTable.vue'
import {
  getMatches,
  getMatchResult,
  getOpponentPerformances,
  getPerformances,
  type MatchItem,
  type MatchResult,
} from '@/api/nsh'
import {formatMatchName} from '@/utils/match'
import {getContrastColor, getJobColor} from '@/utils/color'
import {useTableSort} from '@/composables/table/useTableSort'
import {useVisibleColumns} from '@/composables/table/useVisibleColumns'
import {useTableHighlight} from '@/composables/table/useTableHighlight'
import type {
  AggregatedPerformanceRow,
  AnalysisFailureRow,
  AnalysisThresholds,
  BarKey,
  CachedMatchResult,
  CellContextPayload,
  NormalizedPerformance,
  ProfessionAggregatedRow,
  SubTab,
  TableColumnConfig,
  ViewSide,
  AnalysisResultCheck
} from '@/features/match-records/types'
import {
  ANALYSIS_CHECKS,
  ANALYSIS_PERCENTILE,
  SUWEN_ANALYSIS_PERCENTILE,
  PROFESSION_ANALYSIS_CONFIG,
  BAR_COLORS,
  blueKeys,
  greenKeys,
  redKeys,
  yellowKeys,
} from '@/features/match-records/constants'
import {
  buildAnalysisThresholds,
  getThresholdForCheck,
  normalizePerformances,
  buildLeaderAggregation,
  buildProfessionAggregations,
} from '@/features/match-records/analysis'


const emit = defineEmits<{
  (e: 'open-history', playerId: string): void
}>()

const matches = ref<MatchItem[]>([])
const selectedMatch = ref<string>('')
const performances = ref<NormalizedPerformance[]>([])
const homePerformances = ref<NormalizedPerformance[]>([])
const viewSide = ref<ViewSide>('home')
const matchOutcome = ref<MatchResult['home_outcome']>(null)
const matchNote = ref<string>('')
const showAnalysisModal = ref<boolean>(false)
const analysisModalOverlayRef = ref<HTMLElement | null>(null)

const subTabs = ref<SubTab[]>([])
const activeSubTab = ref<string>('all')
const nestedTabs = ref<SubTab[]>([])
const activeNestedTab = ref<string>('')

const columnsDef: TableColumnConfig[] = [
  { key: 'player_id', label: '玩家ID', clickable: true },
  { key: 'recorded_nick', label: '昵称', clickable: true },
  { key: 'level', label: '等级' },
  { key: 'profession_name', label: '职业', professionColor: true },
  { key: 'leader_nick', label: '所在团长' },
  { key: 'equipment_score', label: '装备评分' },
  { key: 'skill_score', label: '技能评分' },
  { key: 'cultivation_score', label: '修炼' },
  { key: 'total_combat_power', label: '总战力' },
  { key: 'kda', label: 'KD', bar: true },
  { key: 'damage_per_kill', label: '单次击杀所用伤害', bar: true },
  { key: 'total_damage', label: '总伤害', bar: true },
  { key: 'kills', label: '击败', bar: true },
  { key: 'assists', label: '助攻', bar: true },
  { key: 'damage_to_players', label: '对玩家伤害', bar: true },
  { key: 'damage_to_structures', label: '对建筑伤害', bar: true },
  { key: 'damage_taken', label: '承受伤害', bar: true },
  { key: 'serious_injuries', label: '重伤', bar: true },
  { key: 'healing_amount', label: '治疗值', bar: true },
  { key: 'skill_huayu', label: '化羽', bar: true },
  { key: 'skill_qingdeng', label: '青灯焚骨', bar: true },
  { key: 'control_count', label: '控制', bar: true },
  { key: 'war_resources', label: '战备资源', bar: true },
]

const defaultHiddenKeys: string[] = [
  'player_id',
  'level',
  'equipment_score',
  'skill_score',
  'cultivation_score',
  'damage_per_kill',
]

const awayDisabledKeys = new Set<string>([
  'player_id',
  'equipment_score',
  'skill_score',
  'cultivation_score',
  'total_combat_power',
])

const { visibleColumns } = useVisibleColumns(columnsDef, defaultHiddenKeys)
const { visibleColumns: awayVisibleColumns } = useVisibleColumns(columnsDef, [
  ...defaultHiddenKeys,
  ...Array.from(awayDisabledKeys),
])

const detailSort = useTableSort<NormalizedPerformance>()
const aggregatedSort = useTableSort<AggregatedPerformanceRow>()
const professionSort = useTableSort<ProfessionAggregatedRow>()

const {
  onHeaderContext,
  onRowContext,
  onCellContext,
  isColHighlighted,
  isRowHighlighted,
  cellClass,
  clearHighlights,
  hasHighlights,
} = useTableHighlight()

const origRankRaw = ref<Map<string, number>>(new Map())
const lastRankRaw = ref<Map<string, number>>(new Map())
const homeCache = ref<Map<number, NormalizedPerformance[]>>(new Map())
const awayCache = ref<Map<number, NormalizedPerformance[]>>(new Map())
const resultCache = ref<Map<number, CachedMatchResult>>(new Map())

const isAwayView = computed<boolean>(() => viewSide.value === 'away')

const awayColumnsDefForControl = computed<TableColumnConfig[]>(() =>
  columnsDef.filter((col) => !awayDisabledKeys.has(col.key)),
)

const tableVisibleColumns = computed<Record<string, boolean>>(() => {
  if (!isAwayView.value) return visibleColumns

  const v: Record<string, boolean> = { ...awayVisibleColumns }
  for (const key of awayDisabledKeys) {
    v[key] = false
  }
  return v
})

const matchOutcomeText = computed<string>(() => {
  if (matchOutcome.value === 'win') return '胜利'
  if (matchOutcome.value === 'lose') return '败北'
  return '结果未录入'
})

const selectedMatchLabel = computed<string>(() => {
  const matchId = Number(selectedMatch.value)
  const match = matches.value.find((item) => Number(item.match_id) === matchId)
  return match ? formatMatchName(match.match_name) : '未选择联赛'
})

const analysisPercentLabel = computed<string>(() => `${Math.round(ANALYSIS_PERCENTILE * 100)}%`)

const suwenAnalysisPercentLabel = computed<string>(
  () => `${Math.round(SUWEN_ANALYSIS_PERCENTILE * 100)}%`,
)

const analysisThresholds = computed(() => buildAnalysisThresholds(homePerformances.value))
const analysisFailures = computed(() =>
  analyzePerformances(homePerformances.value, analysisThresholds.value),
)

function gotoHistory(playerId: string | number | null | undefined): void {
  if (isAwayView.value || playerId == null) return
  emit('open-history', String(playerId))
}

function activateSubTab(key: string): void {
  activeSubTab.value = key
}

function handleDetailSort(key: string): void {
  if (activeSubTab.value !== 'summary' && activeSubTab.value !== 'profSummary') {
    lastRankRaw.value = new Map((detailedRows.value || []).map((p, idx) => [p.row_id, idx]))
  }
  detailSort.sortBy(key as keyof NormalizedPerformance & string)
}

watch(activeSubTab, (key) => {
  if (key.startsWith('leader-')) {
    const leader = key.slice(7)
    const profs = Array.from(
      new Set(
        performances.value
          .filter((p) => p.leader_nick === leader)
          .map((p) => p.profession_name)
          .filter((pf): pf is string => !!pf),
      ),
    )

    nestedTabs.value = [
      { key: 'groupData', label: '团数据' },
      ...profs.map((pf) => ({ key: `gprof-${pf}`, label: pf })),
    ]
    activeNestedTab.value = nestedTabs.value[0]?.key || ''
    return
  }

  if (key.startsWith('prof-')) {
    const prof = key.slice(5)
    const leads = Array.from(
      new Set(
        performances.value
          .filter((p) => p.profession_name === prof)
          .map((p) => p.leader_nick)
          .filter((leader): leader is string => !!leader),
      ),
    )

    nestedTabs.value = [
      { key: 'profTotal', label: '总数据' },
      ...leads.map((leader) => ({ key: `plead-${leader}`, label: `${leader}团` })),
    ]
    activeNestedTab.value = nestedTabs.value[0]?.key || ''
    return
  }

  nestedTabs.value = []
  activeNestedTab.value = ''
})

function applyPerformances(nextRows: NormalizedPerformance[]): void {
  performances.value = nextRows
  origRankRaw.value = new Map(nextRows.map((p, idx) => [p.row_id, idx]))
  lastRankRaw.value = new Map(origRankRaw.value)

  const leads = Array.from(
    new Set(
      nextRows
        .map((p) => p.leader_nick)
        .filter((leader): leader is string => !!leader),
    ),
  )

  const profs = Array.from(
    new Set(
      nextRows
        .map((p) => p.profession_name)
        .filter((profession): profession is string => !!profession),
    ),
  )

  subTabs.value = [
    { key: 'all', label: '全帮数据' },
    { key: 'summary', label: '团总数据' },
    { key: 'profSummary', label: '职业总数据' },
    ...leads.map((leader) => ({ key: `leader-${leader}`, label: `${leader}团` })),
    ...profs.map((profession) => ({ key: `prof-${profession}`, label: profession })),
  ]

  activateSubTab('all')
}

function analyzePerformances(
  rows: NormalizedPerformance[] | null | undefined,
  thresholds: AnalysisThresholds,
): AnalysisFailureRow[] {
  return (rows || []).flatMap((row) => {
    const profession = row.profession_name
    const config =
      (profession ? PROFESSION_ANALYSIS_CONFIG[profession as keyof typeof PROFESSION_ANALYSIS_CONFIG] : undefined) ||
      PROFESSION_ANALYSIS_CONFIG.default

    const consideredChecks = config.checks
      .map((checkKey): AnalysisResultCheck | null => {
        const threshold = getThresholdForCheck(checkKey, thresholds)
        if (threshold == null) return null

        const actual = Number(row[checkKey] ?? 0)

        return {
          key: checkKey,
          label: ANALYSIS_CHECKS[checkKey].label,
          actual,
          threshold,
          passed: actual >= threshold,
        }
      })
      .filter((check): check is AnalysisResultCheck => check !== null)

    if (!consideredChecks.length) return []

    const failedChecks = consideredChecks.filter((check) => !check.passed)
    if (failedChecks.length !== consideredChecks.length) return []

    return [
      {
        ...row,
        failedChecks,
      },
    ]
  })
}

function formatThresholdValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return String(Math.round(value))
}

function formatAnalysisValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0'
  return String(Math.round(value))
}

async function fetchHomeData(matchId: number): Promise<NormalizedPerformance[]> {
  if (homeCache.value.has(matchId)) {
    return homeCache.value.get(matchId) ?? []
  }

  const rows = await getPerformances(matchId)
  const normalized = normalizePerformances(rows, 'home')
  homeCache.value.set(matchId, normalized)
  return normalized
}

async function fetchMatchResult(matchId: number): Promise<CachedMatchResult> {
  if (resultCache.value.has(matchId)) {
    return resultCache.value.get(matchId) ?? { home_outcome: null, note: '' }
  }

  const res = await getMatchResult(matchId)
  const result: CachedMatchResult = {
    home_outcome: res?.home_outcome ?? null,
    note: String(res?.note ?? '').trim(),
  }

  resultCache.value.set(matchId, result)
  return result
}

async function loadPerformances(): Promise<void> {
  if (!selectedMatch.value) return

  const matchId = Number(selectedMatch.value)
  viewSide.value = 'home'

  const [homeData, matchResult] = await Promise.all([
    fetchHomeData(matchId),
    fetchMatchResult(matchId),
  ])

  matchOutcome.value = matchResult.home_outcome ?? null
  matchNote.value = matchResult.note ?? ''
  homePerformances.value = homeData
  applyPerformances(homeData)
}

async function toggleViewSide(): Promise<void> {
  if (!selectedMatch.value) return

  const matchId = Number(selectedMatch.value)

  if (!isAwayView.value) {
    const data = awayCache.value.has(matchId)
      ? (awayCache.value.get(matchId) ?? [])
      : await getOpponentPerformances(matchId).then((rows) => {
          const normalized = normalizePerformances(rows, 'away')
          awayCache.value.set(matchId, normalized)
          return normalized
        })

    viewSide.value = 'away'
    applyPerformances(data)
    return
  }

  const data = homeCache.value.get(matchId) ?? homePerformances.value
  viewSide.value = 'home'
  applyPerformances(data)
}

function closeAnalysisModal(): void {
  showAnalysisModal.value = false
}

async function openAnalysisModal(): Promise<void> {
  if (!selectedMatch.value) return

  const matchId = Number(selectedMatch.value)
  const homeData = await fetchHomeData(matchId)
  homePerformances.value = homeData
  showAnalysisModal.value = true
}

function onAnalysisModalDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeAnalysisModal()
}

const sortedRaw = computed<NormalizedPerformance[]>(() => {
  const arr = performances.value.slice()
  if (!detailSort.sortKey.value) return arr

  const k = detailSort.sortKey.value
  const asc = detailSort.sortAsc.value

  return arr.sort((a, b) => {
    const va = a[k as keyof NormalizedPerformance]
    const vb = b[k as keyof NormalizedPerformance]

    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return asc ? va - vb : vb - va
    } else {
      const cmp = String(va).localeCompare(String(vb), 'zh-CN')
      if (cmp !== 0) return asc ? cmp : -cmp
    }

    const ra = lastRankRaw.value.get(a.row_id)
    const rb = lastRankRaw.value.get(b.row_id)
    if (ra != null && rb != null && ra !== rb) return ra - rb

    const oa = origRankRaw.value.get(a.row_id) ?? 0
    const ob = origRankRaw.value.get(b.row_id) ?? 0
    return oa - ob
  })
})

const displayedPerformances = computed<NormalizedPerformance[]>(() => {
  if (activeSubTab.value === 'all') return sortedRaw.value

  if (activeSubTab.value.startsWith('leader-')) {
    const leader = activeSubTab.value.slice(7)
    return sortedRaw.value.filter((p) => p.leader_nick === leader)
  }

  if (activeSubTab.value.startsWith('prof-')) {
    const prof = activeSubTab.value.slice(5)
    return sortedRaw.value.filter((p) => p.profession_name === prof)
  }

  return []
})

const groupRaw = computed<NormalizedPerformance[]>(() => displayedPerformances.value)

const groupProfessionRaw = computed<NormalizedPerformance[]>(() => {
  const pf = activeNestedTab.value.slice(6)
  return groupRaw.value.filter((p) => p.profession_name === pf)
})

const professionLeaderRaw = computed<NormalizedPerformance[]>(() => {
  const leader = activeNestedTab.value.slice(6)
  return displayedPerformances.value.filter((p) => p.leader_nick === leader)
})

const detailedRows = computed<NormalizedPerformance[]>(() => {
  if (activeSubTab.value === 'all') return displayedPerformances.value

  if (activeSubTab.value.startsWith('leader-')) {
    if (activeNestedTab.value === 'groupData') return groupRaw.value
    if (activeNestedTab.value.startsWith('gprof-')) return groupProfessionRaw.value
    return groupRaw.value
  }

  if (activeSubTab.value.startsWith('prof-')) {
    if (activeNestedTab.value === 'profTotal') return displayedPerformances.value
    if (activeNestedTab.value.startsWith('plead-')) return professionLeaderRaw.value
    return displayedPerformances.value
  }

  return []
})

const showNestedTabs = computed<boolean>(() =>
  activeSubTab.value.startsWith('leader-') || activeSubTab.value.startsWith('prof-'),
)

const aggregatedPerformances = computed<AggregatedPerformanceRow[]>(() => 
  buildLeaderAggregation(sortedRaw.value),
)

const sortedAggregated = computed<AggregatedPerformanceRow[]>(() =>
  aggregatedSort.sortRows(aggregatedPerformances.value),
)

const profAggregated = computed<ProfessionAggregatedRow[]>(() => 
  buildProfessionAggregations(sortedRaw.value),
)

const sortedProfAggregated = computed<ProfessionAggregatedRow[]>(() =>
  professionSort.sortRows(profAggregated.value),
)

const barKeys = new Set<BarKey>([
  'kda',
  'damage_per_kill',
  'total_damage',
  'kills',
  'assists',
  'war_resources',
  'damage_to_players',
  'damage_to_structures',
  'healing_amount',
  'damage_taken',
  'serious_injuries',
  'skill_qingdeng',
  'skill_huayu',
  'control_count',
])

const barMaxMap = computed<Record<BarKey, number>>(() => {
  const m = Object.create(null) as Record<BarKey, number>

  for (const key of barKeys) {
    m[key] = 0
  }

  for (const row of detailedRows.value) {
    for (const key of barKeys) {
      const v = row[key]
      if (typeof v === 'number' && Number.isFinite(v) && v > m[key]) {
        m[key] = v
      }
    }
  }

  return m
})

function getFillColor(key: BarKey): string {
  if (redKeys.has(key)) return BAR_COLORS.red
  if (blueKeys.has(key)) return BAR_COLORS.blue
  if (greenKeys.has(key)) return BAR_COLORS.green
  if (yellowKeys.has(key)) return BAR_COLORS.yellow
  return 'rgba(0,0,0,0.12)'
}

function barStyle(
  val: string | number | null | undefined,
  key: string,
): Record<string, string> | null {
  if (!barKeys.has(key as BarKey)) return null

  const barKey = key as BarKey
  const max = barMaxMap.value[barKey] || 0

  if (!max || typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
    return null
  }

  const pct = Math.max(0, Math.min(100, (val / max) * 100))
  const fill = getFillColor(barKey)

  return {
    background: `linear-gradient(90deg, ${fill} 0%, ${fill} ${pct}%, transparent ${pct}%)`,
  }
}

function professionStyle(
  profName: string | null | undefined,
): Record<string, string> | null {
  if (!profName) return null

  const color = getJobColor(profName)
  if (!color) return null

  return {
    backgroundColor: color,
    color: getContrastColor(color),
  }
}

function onCellContextByPayload(payload: CellContextPayload | null | undefined): void {
  if (!payload) return
  onCellContext(payload.rowId, payload.colKey)
}

onMounted(async () => {
  matches.value = await getMatches()
})

watch(showAnalysisModal, (visible) => {
  if (visible) {
    document.addEventListener('keydown', onAnalysisModalDocumentKeydown)
    nextTick(() => {
      analysisModalOverlayRef.value?.focus()
    })
    return
  }

  document.removeEventListener('keydown', onAnalysisModalDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onAnalysisModalDocumentKeydown)
})

</script>

<style scoped>
.match-records {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.data-display {
  width: 100%;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.summary-container,
.detailed-container {
  width: 100%;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.table-wrapper {
  flex: 0 1 auto;
  overflow: auto;
  min-height: 0;
}

.controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.controls select {
  margin-left: 0.5rem;
  padding: 0.4rem 0.6rem;
  font-size: 1rem;
}

.outcome-text {
  font-weight: bold;
  color: #333;
}

.match-note {
  color: #555;
  white-space: nowrap;
}

.analysis-btn {
  padding: 0.35rem 0.75rem;
  border: 1px solid #e6a23c;
  background: #e6a23c;
  border-radius: 4px;
  cursor: pointer;
  color: #fff;
}

.sub-tabs {
  flex: 0 0 auto;
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  overflow: auto;
}

.sub-tabs button {
  padding: 0.4rem 0.8rem;
  border: none;
  background: #f0f0f0;
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  white-space: nowrap;
}

.sub-tabs button.active {
  background: #fff;
  border-bottom: 2px solid #42b983;
  font-weight: bold;
}

.nested-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  overflow-x: auto;
  flex: 0 0 auto;
}

.nested-tabs button {
  padding: 0.3rem 0.6rem;
  border: none;
  background: #e0e0e0;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
}

.nested-tabs button.active {
  background: #fff;
  border: 1px solid #ccc;
  font-weight: bold;
}

.column-controls {
  overflow-x: auto;
  overflow-y: hidden;
  flex: 0 0 auto;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.column-controls label{
  flex: 0 0 auto;
  white-space: nowrap;
}

.results {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-family: "Courier New", Courier, monospace;
  font-weight: bold;
}

.results th,
.results td {
  border: 1px solid #eee;
  padding: 0.6rem;
  text-align: center;
  white-space: nowrap;
  font-family: "Courier New", Courier, monospace;
  font-weight: bold;
}

.results th {
  background: #fafafa;
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 10;
}

.empty {
  padding: 2rem;
  text-align: center;
  color: #888;
}

:deep(.bar-cell) {
  background-clip: padding-box;
}

:deep(.ctx-highlight) {
  box-shadow: inset 4px 0 0 0 #ff0000;
  color: #ff0000;
  text-underline-offset: 3px;
}

.clear-btn {
  padding: 0.35rem 0.75rem;
  border: 1px solid #409eff;
  background: #409eff;
  border-radius: 4px;
  cursor: pointer;
  color: #fff;
}

.toggle-side-btn {
  padding: 0.35rem 0.75rem;
  border: 1px solid #67c23a;
  background: #67c23a;
  border-radius: 4px;
  cursor: pointer;
  color: #fff;
}

.toggle-side-btn:disabled,
.clear-btn:disabled,
.analysis-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  outline: none;
}

.modal {
  position: relative;
  background: #fff;
  border-radius: 10px;
  width: 90vw;
  height: 90vh;
  padding: 16px 20px 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  overflow: auto;
}

.modal-close {
  position: absolute;
  top: 8px;
  right: 10px;
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.analysis-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.analysis-header h3 {
  margin: 0 0 0.35rem;
}

.analysis-header p {
  margin: 0.15rem 0;
  color: #555;
}

.analysis-tip {
  font-size: 0.95rem;
}

.analysis-tip-warning {
  color: #c0392b;
  font-weight: 700;
}

.analysis-results {
  min-height: 0;
}

.analysis-table {
  min-width: 100%;
}

.analysis-table th {
  cursor: default;
  position: static;
  top: auto;
  z-index: auto;
  background: #f7f7f7;
}

.analysis-empty {
  padding: 3rem 1rem;
}

:deep(.results tbody tr:nth-child(5n) td) {
  border-bottom: 2px solid #616161;
}
</style>
