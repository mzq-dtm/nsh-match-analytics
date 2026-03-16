<template>
  <div class="match-visualization">
    <!-- 选择联赛 -->
    <div class="controls">
      <label>
        选择联赛：
        <select v-model="selectedMatch" @change="onMatchChange">
          <option value="" disabled>-- 请选择 --</option>
          <option
            v-for="m in matches"
            :key="m.match_id"
            :value="m.match_id"
          >
            {{ formatMatchName(m.match_name) }}
          </option>
        </select>
      </label>
    </div>

    <!-- 未选中时的占位 -->
    <div v-if="!selectedMatch" class="empty">
      请选择一个联赛查看可视化
    </div>

    <!-- 选中后左右布局 -->
    <div v-else class="visualization-container">
      <!-- 左侧：控制面板 -->
      <div class="sidebar">
        <!-- 成员筛选器 -->
        <div class="member-filter">
          <h4>成员筛选器</h4>
          <label v-for="opt in memberOptions" :key="opt.value">
            <input v-model="selectedMember" type="radio" :value="opt.value"> {{ opt.label }}
          </label>
        </div>
        <!-- 数据筛选器 -->
        <div class="data-filter">
          <h4>数据筛选器</h4>
          <label v-for="opt in dataOptions" :key="opt.value">
            <input v-model="selectedData" type="radio" :value="opt.value"> {{ opt.label }}
          </label>
        </div>
      </div>

      <!-- 右侧：渲染图表 -->
      <div class="main-chart">
        <canvas
          id="matchChart"
          ref="chartCanvas"
          :width="fixedWidth"
          :height="canvasHeight"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, nextTick, onUnmounted } from 'vue'
import Chart from 'chart.js/auto'
import { getMatches, getPerformances } from '@/api/nsh'
import { formatMatchName } from '@/utils/match'

const fixedWidth = 1600
const barHeight = 30 // 每条数据条的高度
const padding = 100  // 顶部和底部额外空间

const matches = ref([])
const selectedMatch = ref('')
const performances = ref([])
const selectedMember = ref('all')
const selectedData = ref('total_damage')

// 成员筛选项
const memberOptions = computed(() => {
  const opts = [{ value: 'all', label: '全帮数据' }]
  const leads = Array.from(new Set(performances.value.map(p => p.leader_nick)))
  leads.forEach(l => opts.push({ value: `leader-${l}`, label: `${l}团` }))
  const profs = Array.from(new Set(performances.value.map(p => p.profession_name)))
  profs.forEach(pf => opts.push({ value: `prof-${pf}`, label: pf }))
  return opts
})

// 数据筛选项
const dataOptions = [
  { value: 'total_combat_power', label: '总战力' },
  { value: 'kda', label: 'KD' },
  { value: 'kills', label: '击败' },
  { value: 'serious_injuries', label: '重伤' },
  { value: 'total_damage', label: '总伤害' },
  { value: 'damage_per_kill', label: '单次击杀所用伤害' },
  { value: 'damage_to_players', label: '对玩家伤害' },
  { value: 'damage_to_structures', label: '对建筑伤害' },
  { value: 'healing_amount', label: '治疗值' },
  { value: 'damage_taken', label: '承受伤害' },
  { value: 'skill_qingdeng', label: '青灯焚骨' },
  { value: 'skill_huayu', label: '化羽' },
  { value: 'control_count', label: '控制' }
]
// 数据过滤与排序
const filteredData = computed(() => {
  let arr = performances.value.map(p => ({
    name: p.recorded_nick,
    leader: p.leader_nick,
    profession: p.profession_name,
    total_damage: p.damage_to_players + p.damage_to_structures,
    damage_to_players: p.damage_to_players,
    damage_to_structures: p.damage_to_structures,
    kills: p.kills,
    serious_injuries: p.serious_injuries,
    total_combat_power: p.total_combat_power,
    kda: (p.kills)/Math.max(p.serious_injuries,1),
    damage_per_kill: p.damage_to_players/Math.max(p.kills,1),
    healing_amount: p.healing_amount,
    damage_taken: p.damage_taken,
    skill_qingdeng: p.skill_qingdeng,
    skill_huayu: p.skill_huayu,
    control_count: p.control_count
  }))
  if (selectedMember.value !== 'all') {
    if (selectedMember.value.startsWith('leader-')) {
      const lead = selectedMember.value.slice(7)
      arr = arr.filter(d => d.leader === lead)
    } else if (selectedMember.value.startsWith('prof-')) {
      const pf = selectedMember.value.slice(5)
      arr = arr.filter(d => d.profession === pf)
    }
  }
  return arr.sort((a, b) => b[selectedData.value] - a[selectedData.value])
})

// canvas高度跟随数据条数
const canvasHeight = computed(() => {
  const count = filteredData.value.length
  return count * barHeight + padding
})

let chartInstance = null
const chartCanvas = ref(null)

async function renderChart() {
  if (!chartCanvas.value) return

  // 销毁旧实例
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  // 动态设置canvas高度
  chartCanvas.value.height = canvasHeight.value

  // nextTick保证DOM更新后再绘制
  await nextTick()

  const ctx = chartCanvas.value.getContext('2d')
  const data = filteredData.value
  const labels = data.map(d => d.name)
  const values = data.map(d => d[selectedData.value])

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: dataOptions.find(o => o.value === selectedData.value).label,
        data: values,
        backgroundColor: '#007498',
        barPercentage: 0.6,
        categoryPercentage: 0.8
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, position: 'top' },
        y: { ticks: { autoSkip: false }, grid: { display: false } }
      }
    }
  })
}

onMounted(async () => {
  matches.value = await getMatches()
})

// 只要filteredData或selectedData变化，重绘图表
watch([filteredData, selectedData], renderChart)


watch(selectedMatch, async matchId => {
  if (!matchId) {
    performances.value = []
  } else {
    performances.value = await getPerformances(matchId)
    selectedMember.value = 'all'
  }
})

function onMatchChange() {}

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>

<style scoped>
.match-visualization { width: 100%; height: 100%; }
.controls { margin-bottom: 1rem; }
.empty { padding: 2rem; text-align: center; color: #888; }
.visualization-container { display: flex; height: calc(100% - 3rem); }
.sidebar { width: 200px; padding: 1rem; border-right: 1px solid #ddd; background: #fafafa; overflow-y: auto; }
.sidebar h4 { margin-bottom: 0.5rem; font-size: 1rem; }
.member-filter, .data-filter { margin-bottom: 1rem; }
.member-filter label, .data-filter label { display: block; margin: 0.3rem 0; white-space: nowrap; }
.main-chart { flex: 1; padding: 1rem; overflow: auto; width: 100%; }
/* 可选：让canvas最大宽度适应父容器 */
.main-chart canvas { display: block; }
</style>
