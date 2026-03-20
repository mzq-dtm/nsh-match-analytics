<template>
  <div class="attendance-wrapper">
    <!-- 日期区间选择 -->
    <div class="date-range">
      <label>
        开始日期：
        <input
          v-model="startDate"
          type="date"
          :min="earliest"
          :max="today"
        >
      </label>

      <label>
        结束日期：
        <input
          v-model="endDate"
          type="date"
          :min="startDate"
          :max="today"
        >
      </label>

      <button class="btn-refresh" @click="loadAttendance">刷新</button>
    </div>

    <!-- 出勤统计表 -->
    <div class="attendance-table-wrapper">
      <table class="results">
        <thead>
          <tr>
            <th>序号</th>
            <th @click="sortBy('player_id')">
              玩家&nbsp;ID
              <span v-if="sortKey === 'player_id'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('nicknames')">
              历史昵称
              <span v-if="sortKey === 'nicknames'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_combat_power')">
              总战力
              <span v-if="sortKey === 'total_combat_power'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('attendance_rate')">
              出勤率
              <span v-if="sortKey === 'attendance_rate'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('first_match_time')">
              首次联赛时间
              <span v-if="sortKey === 'first_match_time'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('last_match_time')">
              最后联赛时间
              <span v-if="sortKey === 'last_match_time'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_damage_to_players')">
              总对玩家伤害
              <span v-if="sortKey === 'total_damage_to_players'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_damage_to_structures')">
              总对建筑伤害
              <span v-if="sortKey === 'total_damage_to_structures'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_kills')">
              总击杀
              <span v-if="sortKey === 'total_kills'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_kd')">
              总KD
              <span v-if="sortKey === 'total_kd'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_healing')">
              总治疗
              <span v-if="sortKey === 'total_healing'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_control')">
              总控制
              <span v-if="sortKey === 'total_control'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th @click="sortBy('total_qingdeng')">
              总青灯焚骨
              <span v-if="sortKey === 'total_qingdeng'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in sortedRows" :key="row.player_id">
            <td>{{ idx + 1 }}</td>
            <td style="cursor:pointer" @click="gotoHistory(row.player_id)">{{ row.player_id }}</td>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <td style="cursor:pointer" @click="gotoHistory(row.player_id)" v-html="row.nicknames.replace(/\n/g, '<br>')" />
            <td>{{ row.total_combat_power }}</td>
            <td>
              {{ row.attended }}&nbsp;/&nbsp;{{ row.total_matches }}
              <span class="rate">({{ (row.attendance_rate * 100).toFixed(0) }}%)</span>
            </td>
            <td>{{ formatDateTime(row.first_match_time) }}</td>
            <td>{{ formatDateTime(row.last_match_time) }}</td>
            <td>{{ fmtWanIfBig(row.total_damage_to_players) }}</td>
            <td>{{ fmtWanIfBig(row.total_damage_to_structures) }}</td>
            <td>{{ row.total_kills }}</td>
            <td>{{ row.total_kd.toFixed(2) }}</td>
            <td>{{ fmtWanIfBig(row.total_healing) }}</td>
            <td>{{ row.total_control }}</td>
            <td>{{ row.total_qingdeng }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTableSort } from '@/composables/table/useTableSort'
import { getAttendance, getEarliestMatchDate } from '@/api/nsh'

const emit = defineEmits(['openHistory'])
const gotoHistory = (id) => { if (id == null) return; emit('openHistory', String(id)) }


/* ---------- 基本状态 ---------- */
const earliest  = ref('')
const today     = new Date().toISOString().slice(0, 10)
const startDate = ref('')
const endDate   = ref(today)
const rows      = ref([])

/* ---------- 排序状态 ---------- */
const { sortKey, sortAsc, sortBy, sortRows } = useTableSort({
  initialKey: 'attendance_rate',
  initialAsc: false,
})

const sortedRows = computed(() => {
  const base = rows.value.filter(r => Number(r.attendance_rate) > 0)
  return sortRows(base)
})

/* ---------- 工具 ---------- */
const formatDateTime = (ts) => {
  if (!ts)
    return '-';
  const d = new Date(ts);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
};

// >= 10000 显示为 “XXXX万”（直接截断，不四舍五入）；否则显示原数值
const fmtWanIfBig = (n) => {
  if (typeof n !== 'number' || isNaN(n)) return '-'
  if (n >= 10000) return `${Math.trunc(n / 10000)}万`
  // 小于 1 万，保持原值（可按需加千分位）
  return n
}

/* ---------- 数据加载 ---------- */
const loadEarliest = async () => {
  const data       = await getEarliestMatchDate()
  earliest.value   = data.earliest
  startDate.value  = data.earliest
}

const loadAttendance = async () => {
  if (!startDate.value || !endDate.value) return
  rows.value = await getAttendance({
    start: startDate.value,
    end: endDate.value,
  })
}

/* ---------- 初始化 ---------- */
onMounted(async () => {
  try {
    await loadEarliest()
    await loadAttendance()
  } catch (e) {
    console.error(e)
  }
})
</script>


<style scoped>
.attendance-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.date-range {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.btn-refresh {
  padding: 0.35rem 0.75rem;
  border: 1px solid #409eff;
  background: #409eff;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
}

.btn-refresh:hover {
  opacity: 0.85;
}

.attendance-table-wrapper {
  flex: 0 1 auto;
  overflow: auto;
  min-height: 0;
}

.results {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
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
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fafafa;
}

.rate {
  font-family: "Courier New", Courier, monospace;
  font-weight: bold;
  margin-left: 4px;
  font-size: 1rem;
}

:deep(.results tbody tr:nth-child(5n) td) {
  border-bottom: 2px solid #616161;
}
</style>
