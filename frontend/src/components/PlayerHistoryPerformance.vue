<template>
  <div class="player-history-performance-container">
    <div class="controls">
      <label class="search-label">
        请输入昵称搜索：
        <div
          class="autocomplete"
          role="combobox"
          :aria-expanded="showDropdown"
          :aria-owns="'player-listbox'"
        >
          <input
            ref="searchInputRef"
            v-model="searchText"
            class="search-input"
            type="text"
            placeholder="输入昵称（可多关键词，用空格分隔）"
            @focus="openDropdown"
            @keydown="onKeydown"
            @compositionstart="composing = true"
            @compositionend="onCompositionEnd"
          >
          <ul
            v-show="showDropdown"
            id="player-listbox"
            class="dropdown"
            role="listbox"
          >
            <li
              v-for="(p, i) in filteredPlayers"
              :key="p.player_id"
              :class="['option', { active: i === activeIndex }]"
              role="option"
              :aria-selected="i === activeIndex"
              @mousedown.prevent="selectPlayer(p)"
              @mousemove="activeIndex = i"
            >
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-html="highlightLabel(p)" />
            </li>
            <li v-if="!filteredPlayers.length" class="no-data">无匹配结果</li>
          </ul>
        </div>
      </label>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="selectedPlayer" class="table-with-column-control">
      <div class="column-controls">
        <label v-for="col in columnsDef" :key="col.key">
          <input v-model="visibleColumns[col.key]" type="checkbox">
          {{ col.label }}
        </label>
      </div>
      <div class="history-table-wrapper">
        <table class="results">
          <thead>
          <tr>
            <th>序号</th>
            <th v-if="visibleColumns.match_name" @click="sortBy('match_name')">
              对阵双方 <span v-if="sortKey==='match_name'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.match_time" @click="sortBy('match_time')">
              结束时间 <span v-if="sortKey==='match_time'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.nickname" @click="sortBy('nickname')">
              昵称 <span v-if="sortKey==='nickname'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.profession" @click="sortBy('profession')">
              职业 <span v-if="sortKey==='profession'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.leader" @click="sortBy('leader')">
              所在团长 <span v-if="sortKey==='leader'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.equipment_score" @click="sortBy('equipment_score')">
              装备评分 <span v-if="sortKey==='equipment_score'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.skill_score" @click="sortBy('skill_score')">
              技能评分 <span v-if="sortKey==='skill_score'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.cultivation_score" @click="sortBy('cultivation_score')">
              修炼 <span v-if="sortKey==='cultivation_score'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.total_combat_power" @click="sortBy('total_combat_power')">
              总战力 <span v-if="sortKey==='total_combat_power'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.KD" @click="sortBy('KD')">
              KD <span v-if="sortKey==='KD'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.total_damage" @click="sortBy('total_damage')">
              总伤害 <span v-if="sortKey==='total_damage'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.rank_damage" @click="sortBy('rank_damage')">
              排名 <span v-if="sortKey==='rank_damage'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.kills" @click="sortBy('kills')">
              击败 <span v-if="sortKey==='kills'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.rank_kills" @click="sortBy('rank_kills')">
              排名 <span v-if="sortKey==='rank_kills'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.damage_to_players" @click="sortBy('damage_to_players')">
              对玩家伤害 <span v-if="sortKey==='damage_to_players'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.rank_damage_to_players" @click="sortBy('rank_damage_to_players')">
              排名 <span v-if="sortKey==='rank_damage_to_players'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.damage_to_structures" @click="sortBy('damage_to_structures')">
              对建筑伤害 <span v-if="sortKey==='damage_to_structures'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.rank_damage_to_structures" @click="sortBy('rank_damage_to_structures')">
              排名 <span v-if="sortKey==='rank_damage_to_structures'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.healing" @click="sortBy('healing')">
              治疗值 <span v-if="sortKey==='healing'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.rank_healing" @click="sortBy('rank_healing')">
              排名 <span v-if="sortKey==='rank_healing'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.assists" @click="sortBy('assists')">
              助攻 <span v-if="sortKey==='assists'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.war_resources" @click="sortBy('war_resources')">
              战备资源 <span v-if="sortKey==='war_resources'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.damage_taken" @click="sortBy('damage_taken')">
              承受伤害 <span v-if="sortKey==='damage_taken'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.serious_injuries" @click="sortBy('serious_injuries')">
              重伤 <span v-if="sortKey==='serious_injuries'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.skill_qingdeng" @click="sortBy('skill_qingdeng')">
              青灯焚骨 <span v-if="sortKey==='skill_qingdeng'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.skill_huayu" @click="sortBy('skill_huayu')">
              化羽 <span v-if="sortKey==='skill_huayu'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th v-if="visibleColumns.control_count" @click="sortBy('control_count')">
              控制 <span v-if="sortKey==='control_count'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(item,index) in sortedHistoryData" :key="item.match_name">
            <td>{{ index + 1 }}</td>
            <td v-if="visibleColumns.match_name">{{ extractTeams(item.match_name) }}</td>
            <td v-if="visibleColumns.match_time">{{ formatDate(item.match_time) }}</td>
            <td v-if="visibleColumns.nickname">{{ item.nickname }}</td>
            <td v-if="visibleColumns.profession">{{ item.profession }}</td>
            <td v-if="visibleColumns.leader">{{ item.leader }}</td>
            <td v-if="visibleColumns.equipment_score">{{ item.equipment_score }}</td>
            <td v-if="visibleColumns.skill_score">{{ item.skill_score }}</td>
            <td v-if="visibleColumns.cultivation_score">{{ item.cultivation_score }}</td>
            <td v-if="visibleColumns.total_combat_power">{{ item.total_combat_power }}</td>
            <td v-if="visibleColumns.KD">{{ item.KD }}</td>
            <td v-if="visibleColumns.total_damage">{{ item.total_damage }}</td>
            <td v-if="visibleColumns.rank_damage">{{ item.rank_damage }}</td>
            <td v-if="visibleColumns.kills">{{ item.kills }}</td>
            <td v-if="visibleColumns.rank_kills">{{ item.rank_kills }}</td>
            <td v-if="visibleColumns.damage_to_players">{{ item.damage_to_players }}</td>
            <td v-if="visibleColumns.rank_damage_to_players">{{ item.rank_damage_to_players }}</td>
            <td v-if="visibleColumns.damage_to_structures">{{ item.damage_to_structures }}</td>
            <td v-if="visibleColumns.rank_damage_to_structures">{{ item.rank_damage_to_structures }}</td>
            <td v-if="visibleColumns.healing">{{ item.healing }}</td>
            <td v-if="visibleColumns.rank_healing">{{ item.rank_healing }}</td>
            <td v-if="visibleColumns.assists">{{ item.assists }}</td>
            <td v-if="visibleColumns.war_resources">{{ item.war_resources }}</td>
            <td v-if="visibleColumns.damage_taken">{{ item.damage_taken }}</td>
            <td v-if="visibleColumns.serious_injuries">{{ item.serious_injuries }}</td>
            <td v-if="visibleColumns.skill_qingdeng">{{ item.skill_qingdeng }}</td>
            <td v-if="visibleColumns.skill_huayu">{{ item.skill_huayu }}</td>
            <td v-if="visibleColumns.control_count">{{ item.control_count }}</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { pinyin as _pinyin } from 'pinyin-pro'
import { useTableSort } from '@/composables/table/useTableSort'
import { useVisibleColumns } from '@/composables/table/useVisibleColumns'
import {
  getPlayerHistory,
  getPlayers,
  type PlayerHistoryItem,
  type PlayerItem,
} from '@/api/nsh'

const props = defineProps<{
  externalPlayerId: string
}>()

const players = ref<PlayerItem[]>([])
const selectedPlayer = ref<string>('')
const historyData = ref<PlayerHistoryItem[]>([])
const loading = ref<boolean>(false)

const searchText = ref<string>('')
const debouncedText = ref<string>('')
const showDropdown = ref<boolean>(false)
const activeIndex = ref<number>(-1)
const composing = ref<boolean>(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

const extractTeams = (name: string): string =>
  name.replace(/\.csv$/i, '').split('_')[0] ?? ''

const formatDate = (ts: string): string => {
  const d = new Date(ts)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}`
}

function openDropdown(): void {
  showDropdown.value = true
}

function closeDropdown(): void {
  showDropdown.value = false
  activeIndex.value = -1
}

function onCompositionEnd(): void {
  composing.value = false
}

async function fetchPlayers(): Promise<void> {
  try {
    const data = await getPlayers()
    data.sort((a, b) => (a.nicknames[0] || '').localeCompare(b.nicknames[0] || '', 'zh-CN'))
    players.value = data
  } catch (error) {
    console.error('获取玩家列表失败：', error)
  } finally {
    if (props.externalPlayerId && /^ID:\s*/.test(searchText.value)) {
      syncSearchLabelFromProps()
    }
  }
}

async function onPlayerChange(): Promise<void> {
  if (!selectedPlayer.value) return

  loading.value = true
  historyData.value = []

  try {
    const data = await getPlayerHistory(Number(selectedPlayer.value))
    historyData.value = data
  } catch (error) {
    console.error('获取历史数据失败：', error)
  } finally {
    loading.value = false
  }
}

const columnsDef = [
  { key: 'match_name', label: '对阵双方' },
  { key: 'match_time', label: '结束时间' },
  { key: 'nickname', label: '昵称' },
  { key: 'profession', label: '职业' },
  { key: 'leader', label: '所在团长' },
  { key: 'equipment_score', label: '装备评分' },
  { key: 'skill_score', label: '技能评分' },
  { key: 'cultivation_score', label: '修炼' },
  { key: 'total_combat_power', label: '总战力' },
  { key: 'KD', label: 'KD' },
  { key: 'total_damage', label: '总伤害' },
  { key: 'rank_damage', label: '总伤害排名' },
  { key: 'kills', label: '击败' },
  { key: 'rank_kills', label: '击败排名' },
  { key: 'assists', label: '助攻' },
  { key: 'war_resources', label: '战备资源' },
  { key: 'damage_to_players', label: '对玩家伤害' },
  { key: 'rank_damage_to_players', label: '对玩家伤害排名' },
  { key: 'damage_to_structures', label: '对建筑伤害' },
  { key: 'rank_damage_to_structures', label: '对建筑伤害排名' },
  { key: 'healing', label: '治疗值' },
  { key: 'rank_healing', label: '治疗排名' },
  { key: 'damage_taken', label: '承受伤害' },
  { key: 'serious_injuries', label: '重伤' },
  { key: 'skill_qingdeng', label: '青灯焚骨' },
  { key: 'skill_huayu', label: '化羽' },
  { key: 'control_count', label: '控制' },
]

const { visibleColumns } = useVisibleColumns(columnsDef)

columnsDef.forEach((col) => {
  visibleColumns[col.key] = true
})

visibleColumns.equipment_score = false
visibleColumns.skill_score = false
visibleColumns.cultivation_score = false
visibleColumns.assists = false
visibleColumns.war_resources = false

const { sortKey, sortAsc, sortBy, sortRows } = useTableSort<PlayerHistoryItem>()

const sortedHistoryData = computed(() => {
  return sortRows(historyData.value)
})

// 将中文转为无声调全拼（合并为一个连续字符串）
function toPinyin(text: string): string {
  if (!text) return ''
  return _pinyin(text, { toneType: 'none', type: 'array' }).join('')
}

// 获取首字母缩写（例如 “张三丰” -> “zsf”）
function toInitials(text: string): string {
  if (!text) return ''
  return _pinyin(text, { toneType: 'none', pattern: 'first' }).replace(/\s+/g, '')
}

const formatPlayerLabel = (player: PlayerItem): string =>
  `${player.nicknames.join(' / ')} (ID: ${player.player_id})`

const filteredPlayers = computed<PlayerItem[]>(() => {
  const q = debouncedText.value
  const list = players.value || []

  if (!q) return list

  const tokens = q.split(/\s+/).filter(Boolean).map((s) => s.toLowerCase())

  return list.filter((p) => {
    const nicks = p.nicknames || []
    const fullName = nicks.join(' ')
    const hay = (
      fullName + ' ' +
      toPinyin(fullName) + ' ' +
      toInitials(fullName) +
      ` id:${p.player_id}`
    ).toLowerCase()

    return tokens.every((tok) => hay.includes(tok))
  })
})

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m] || m,
  )
}

function highlightLabel(player: PlayerItem): string {
  const label = formatPlayerLabel(player)
  const q = debouncedText.value

  if (!q) return escapeHtml(label)

  const tokens = q.split(/\s+/).filter(Boolean)
  if (!tokens.length) return escapeHtml(label)

  const re = new RegExp(
    tokens
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'gi',
  )

  const markedPlain = label.replace(re, (m) => `\u0000${m}\u0001`)
  const escaped = escapeHtml(markedPlain)

  return escaped
    .replaceAll('\u0000', '<mark>')
    .replaceAll('\u0001', '</mark>')
}

function selectPlayer(player: PlayerItem): void {
  selectedPlayer.value = String(player.player_id)
  searchText.value = formatPlayerLabel(player)
  closeDropdown()
  onPlayerChange()
}

function onClickOutside(e: MouseEvent): void {
  const root = searchInputRef.value?.closest('.autocomplete')
  const target = e.target

  if (root && target instanceof Node && !root.contains(target)) {
    closeDropdown()
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (composing.value) return
  if (!showDropdown.value) showDropdown.value = true

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % Math.max(filteredPlayers.value.length, 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value =
      activeIndex.value <= 0
        ? filteredPlayers.value.length - 1
        : activeIndex.value - 1
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const p = filteredPlayers.value[activeIndex.value] || filteredPlayers.value[0]
    if (p) selectPlayer(p)
  } else if (e.key === 'Escape') {
    closeDropdown()
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchText, (v) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(() => {
    debouncedText.value = (v || '').trim()
  }, 200)
})

function syncSearchLabelFromProps(): void {
  const id = props.externalPlayerId
  if (!id) return

  const player = players.value.find((x) => String(x.player_id) === String(id))

  if (player) {
    searchText.value = formatPlayerLabel(player)
  } else {
    searchText.value = `ID: ${id}`
  }
}

onMounted(() => {
  fetchPlayers()
  document.addEventListener('mousedown', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
})

watch(
  () => props.externalPlayerId,
  (id) => {
    if (!id) return

    selectedPlayer.value = String(id)
    onPlayerChange()
    syncSearchLabelFromProps()
  },
  { immediate: true },
)

</script>

<style scoped>
.controls {
  margin-bottom: 1rem;
}
.loading {
  font-style: italic;
}

.player-history-performance-container{
  width: 100%;
  height: 100%;
}

.table-with-column-control{
  width: 100%;
  height: calc(100% - 25px - 1rem);
  display: flex;
  flex-direction: column;
}
.column-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.history-table-wrapper {
  flex: 0 1 auto;
  overflow: auto;
  min-height: 0;
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
  position: sticky;
  top: 0;
  z-index: 1;
  cursor: pointer;
}

/* === 自动完成 === */
.search-label { display: block; }
.autocomplete { position: relative; display: inline-block; min-width: 500px; }
.search-input {
  width: 100%; padding: 0.5rem 0.6rem; border: 1px solid #ddd; border-radius: 6px;
  outline: none;
}
.search-input:focus { border-color: #999; }
.dropdown {
  list-style: none; padding-left: 0;
  position: absolute; z-index: 10; left: 0; right: 0; max-height: 320px; overflow: auto;
  margin-top: 0.25rem; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.06);
}
.option { padding: 0.5rem 0.75rem; cursor: pointer; }
.option:hover, .option.active { background: #f5f7ff; }
.no-data { color: #999; padding: 0.6rem 0.75rem; }
mark { background: #fff2a8; padding: 0 2px; }

:deep(.results tbody tr:nth-child(5n) td) {
  border-bottom: 2px solid #616161;
}
</style>
