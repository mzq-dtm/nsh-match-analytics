<template>
  <div class="match-configurator-container">
    <!-- 文件上传 -->
    <div class="file-upload-container">
      <label for="file-upload">请上传帮会成员数据：</label>
      <input id="file-upload" type="file" @change="handleFileUpload">
      <p v-if="fileError" class="error">{{ fileError }}</p>
    </div>

    <!-- 配置区域：文件上传成功后显示 -->
    <div v-if="fileSelected && !fileError" class="configurator-container">
      <!-- 左侧筛选器（固定宽度） -->
      <div class="filter">
        <div class="filter-section">
          <h2>职业筛选</h2>
          <div v-for="(job, i) in uniqueJobs" :key="i">
            <input
              :id="job"
              v-model="selectedJobs"
              type="checkbox"
              :value="job"
              @change="onJobChange(job)"
            >
            <label :for="job">{{ job }}</label>
          </div>
        </div>
        <div class="filter-section">
          <h2>最低评分</h2>
          <input
            v-model="minScore"
            style="width: 80%; margin-top: 10px;"
            type="number"
            placeholder="输入最小评分"
            min="0"
            :max="maxScore"
          >
        </div>
        <div class="job-statistics">
          <h2>职业分布</h2>
          <h3 v-for="(count, job) in groupJobDistAll" :key="job">
            {{ job }} : {{ count }}
          </h3>
        </div>
        <button style="margin-top: 30px; width: 100%;" @click="exportImage">保存图片</button>
        <button style="margin-top: 30px; width: 100%;" @click="exportExcel">保存表格</button>
        <button style="margin-top: 30px; width: 100%;" @click="resetGroups">重置</button>
      </div>

      <!-- 中间替补席列表（固定宽度，可垂直滚动） -->
      <div
        class="member-list"
        @dragover.prevent
        @drop="handleDropToList"
      >
        <h3 class="list-title">
          替补席 ({{ filteredMembers.length }})
        </h3>
        <div
          v-for="member in filteredMembers"
          :key="member.name"
          class="member-item"
          draggable="true"
          :style="{
            backgroundColor: getJobColor(member.job),
            color: getContrastColor(getJobColor(member.job))
          }"
          @dragstart="e => dragStart(e, member, 'list')"
          @mouseenter="onMouseEnter(member.name)"
          @mousemove="onMouseMove"
          @mouseleave="onMouseLeave"
        >
          {{ member.name }} - {{ member.job }} - {{ member.totalPower }}
        </div>
      </div>

      <!-- 右侧 5 团容器（横向滚动） -->
      <div class="groups-wrapper">
        <div class="groups">
          <div
            v-for="(col, idx) in groups"
            :key="idx"
            class="group"
            @dragover.prevent
            @drop="e => handleDropToColumn(idx, e)"
          >
            <h4 
              @mouseenter="onGroupEnter(idx, $event)"
              @mousemove="onGroupMove"
              @mouseleave="onGroupLeave"
            >
              <span>
                {{ columnTitles[idx] }} ({{ col.length }}/30，平均 {{ getColumnAverage(idx) }})
              </span>
              <button
                style="font-size:12px; padding:2px 6px;"
                @click.stop="clearGroup(idx)"
              >
                清空
              </button>
            </h4>
            <div
              v-for="member in col"
              :key="member.name"
              class="member-item"
              draggable="true"
              :style="{
                backgroundColor: getJobColor(member.job),
                color: getContrastColor(getJobColor(member.job))
              }"
              @dragstart="e => dragStart(e, member, 'column', idx)"
              @mouseenter="onMouseEnter(member.name)"
              @mousemove="onMouseMove"
              @mouseleave="onMouseLeave"
            >
              {{ member.name }} - {{ member.job }} - {{ member.totalPower }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 全局浮窗 -->
    <div
      v-if="hoveredMember"
      ref="globalTooltip"
      class="global-tooltip"
      :style="{ top: tooltipPos.y + 'px', left: tooltipPos.x + 'px' }"
    >
      <div
        v-for="(rec, idx) in hoveredHistoryRecords"
        :key="idx"
        class="record"
      >
        <!-- 无历史数据时显示 -->
        <p v-if="'empty' in rec">未找到历史数据</p>

        <!-- 有历史记录时正常渲染 -->
        <template v-else>
          <p>联赛场次：{{ formatMatchName(rec.match) }}</p>
          <p>所在团长：{{ rec.leader }}</p>
          <p>击杀：{{ rec.kills }}，KD：{{ rec.KD }}，击杀团内排名：{{ rec.rank_kills }}</p>
          <p>玩家伤害：{{ rec.damage_to_players }}，总伤害：{{ rec.total_damage }}，总伤团内排名：{{ rec.rank_damage }}</p>
          <p>治疗：{{ rec.healing }}，总治疗团内排名：{{ rec.rank_healing }}</p>
          <hr v-if="idx < hoveredHistoryRecords.length - 1">
        </template>
      </div>
    </div>

    <!-- 团内职业分布浮窗 -->
    <div
      v-if="hoveredGroup !== null"
      ref="groupTooltip"
      class="group-tooltip"
      :style="{ top: groupTooltipPos.y + 'px', left: groupTooltipPos.x + 'px' }"
    >
      <div class="record">
        <h2 style="margin:0 0 6px;">职业分布</h2>
        <h3
          v-for="(count, job) in getGroupJobCounts(hoveredGroup)"
          :key="job"
        >
          {{ job }}：{{ count }}
        </h3>
      </div>
    </div>

    <!-- 图片预览弹窗 -->
    <div
      v-if="showImageModal"
      class="modal-overlay"
      tabindex="0"
      @click.self="closeImageModal"
      @keydown.esc="closeImageModal"
    >
      <div class="modal">
        <button class="modal-close" aria-label="关闭" @click="closeImageModal">×</button>
        <h3 style="margin:0 0 10px;">分团配置导出图</h3>
        <div v-if="exportedImgUrl">
          <img
            :src="exportedImgUrl"
            :width="exportedImgWidth"
            :height="exportedImgHeight"
            alt="分团配置导出图"
          >
        </div>
        <div v-else style="padding: 20px 0;">正在生成图片…</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as XLSX from 'xlsx'
import { postPlayerHistoryByNames, type PlayerHistoryByName, type PlayerHistoryByNameItem } from '@/api/nsh'
import { getContrastColor, getJobColor } from '@/utils/color'
import { formatMatchName } from '@/utils/match'

type EmptyHistoryItem = {
  empty: true
}

type TooltipHistoryItem = PlayerHistoryByNameItem | EmptyHistoryItem

interface Member {
  name: string
  job: string
  totalPower: number
}

interface TooltipPosition {
  x: number
  y: number
}

const fileError = ref<string | null>(null)
const fileSelected = ref(false)
const members = ref<Member[]>([])
const listMembers = ref<Member[]>([])
const selectedJobs = ref<string[]>(['全体成员'])
const minScore = ref(0)
const uniqueJobs = ref<string[]>([])

const hoveredMember = ref<string | null>(null)
const tooltipPos = reactive<TooltipPosition>({ x: 0, y: 0 })

const hoveredGroup = ref<number | null>(null)
const groupTooltipPos = reactive<TooltipPosition>({ x: 0, y: 0 })

const globalTooltip = ref<HTMLElement | null>(null)
const groupTooltip = ref<HTMLElement | null>(null)

function keepInsideViewport(
  elRef: { value: HTMLElement | null },
  pos: TooltipPosition,
  cursorX: number,
  cursorY: number,
): void {
  nextTick(() => {
    const el = elRef.value
    if (!el) return

    const rect = el.getBoundingClientRect()
    const margin = 10

    if (cursorX + margin + rect.width > window.innerWidth) {
      pos.x = cursorX - rect.width - margin
    } else {
      pos.x = cursorX + margin
    }

    if (cursorY + margin + rect.height > window.innerHeight) {
      pos.y = cursorY - rect.height - margin
    } else {
      pos.y = cursorY + margin
    }
  })
}

function onMouseEnter(name: string): void {
  hoveredMember.value = name
}

function onMouseMove(e: MouseEvent): void {
  keepInsideViewport(globalTooltip, tooltipPos, e.clientX, e.clientY)
}

function onMouseLeave(): void {
  hoveredMember.value = null
}

function onGroupEnter(idx: number, e: MouseEvent): void {
  hoveredGroup.value = idx
  keepInsideViewport(groupTooltip, groupTooltipPos, e.clientX, e.clientY)
}

function onGroupMove(e: MouseEvent): void {
  keepInsideViewport(groupTooltip, groupTooltipPos, e.clientX, e.clientY)
}

function onGroupLeave(): void {
  hoveredGroup.value = null
}

const historyData = ref<PlayerHistoryByName>({})

const hoveredHistoryRecords = computed<TooltipHistoryItem[]>(() => {
  const name = hoveredMember.value
  if (!name) return []

  const records = historyData.value[name]
  if (records && records.length > 0) {
    return records
  }

  return [{ empty: true }]
})

// 计算所有成员中的最大总战力，用于评分输入框的 max 属性
const maxScore = computed((): number => {
  if (!members.value.length) return 0
  return Math.max(...members.value.map((member) => member.totalPower))
})

// 5 团标题
const columnTitles = ['一团', '二团', '三团', '四团', '五团']

// 5 列数据结构
const groups = ref<Member[][]>([[], [], [], [], []])

const groupJobDistAll = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}

  uniqueJobs.value.forEach((job) => {
    if (job !== '全体成员') counts[job] = 0
  })

  groups.value.flat().forEach((member) => {
    if (Object.prototype.hasOwnProperty.call(counts, member.job)) {
      counts[member.job] = (counts[member.job] ?? 0) + 1
    }
  })

  return counts
})

function getGroupJobCounts(idx: number): Record<string, number> {
  const counts: Record<string, number> = {}

  const group = groups.value[idx]
  if (!group) return counts

  group.forEach((member) => {
    counts[member.job] = (counts[member.job] || 0) + 1
  })

  return counts
}


function handleFileUpload(event: Event): void {
  fileError.value = null
  fileSelected.value = false
  listMembers.value = []
  groups.value = [[], [], [], [], []]
  minScore.value = 0
  uniqueJobs.value = []
  historyData.value = {}

  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]

  if (!file || !file.name.endsWith('.csv')) {
    fileError.value = '请上传CSV格式的文件'
    return
  }

  fileSelected.value = true

  const reader = new FileReader()

  reader.onload = (loadEvent: ProgressEvent<FileReader>) => {
    const result = loadEvent.target?.result

    if (typeof result !== 'string') {
      fileError.value = '文件读取失败'
      fileSelected.value = false
      return
    }

    const rows = result
      .split('\n')
      .map((row) => row.trim())
      .filter((row) => row !== '')

    const headerRow = rows[0]
    if (!headerRow) {
      fileError.value = '文件内容为空'
      fileSelected.value = false
      return
    }
    
    const headers = headerRow.split(',')
    const nameIdx = headers.indexOf('名称')
    const jobIdx = headers.indexOf('职业')
    const powerIdx = headers.indexOf('总战力')

    if (nameIdx < 0 || jobIdx < 0 || powerIdx < 0) {
      fileError.value = '文件格式不正确，请检查列名'
      fileSelected.value = false
      return
    }

    const parsedMembers: Member[] = rows.slice(1).map((row) => {
      const cols = row.split(',')

      return {
        name: cols[nameIdx] ?? '',
        job: cols[jobIdx] ?? '',
        totalPower: Number.parseInt(cols[powerIdx] ?? '0', 10),
      }
    })

    members.value = parsedMembers
    listMembers.value = [...parsedMembers].sort((a, b) => b.totalPower - a.totalPower)
    uniqueJobs.value = ['全体成员', ...new Set(parsedMembers.map((member) => member.job))]
    selectedJobs.value = [...uniqueJobs.value]
    groups.value = [[], [], [], [], []]

    postPlayerHistoryByNames(parsedMembers.map((member) => member.name))
      .then((data) => {
        historyData.value = data
      })
      .catch((err) => {
        console.error('获取玩家历史数据失败', err)
        fileError.value = '获取玩家历史数据失败，请稍后重试'
      })

    fileError.value = null
  }

  reader.readAsText(file)

  saveCache()
}

function getDraggedMember(e: DragEvent): Member | null {
  const dataTransfer = e.dataTransfer
  if (!dataTransfer) return null

  const raw = dataTransfer.getData('member')
  if (!raw) return null

  try {
    return JSON.parse(raw) as Member
  } catch {
    return null
  }
}

function dragStart(
  e: DragEvent,
  member: Member,
  from: 'list' | 'column',
  colIndex: number | null = null,
): void {
  const dataTransfer = e.dataTransfer
  if (!dataTransfer) return

  dataTransfer.setData('member', JSON.stringify(member))
  dataTransfer.setData('from', from)

  if (from === 'column' && colIndex !== null) {
    dataTransfer.setData('colIndex', String(colIndex))
  }
}

function handleDropToList(e: DragEvent): void {
  const member = getDraggedMember(e)
  if (!member) return

  const dataTransfer = e.dataTransfer
  if (!dataTransfer) return

  if (dataTransfer.getData('from') === 'column') {
    const idx = Number(dataTransfer.getData('colIndex'))
    const group = groups.value[idx]

    if (!group) return

    const memberIndex = group.findIndex((item) => item.name === member.name)
    if (memberIndex > -1) {
      group.splice(memberIndex, 1)
    }

    listMembers.value.push(member)
    listMembers.value.sort((a, b) => b.totalPower - a.totalPower)
  }
}

function handleDropToColumn(colIndex: number, e: DragEvent): void {
  const targetGroup = groups.value[colIndex]
  if (!targetGroup || targetGroup.length >= 30) return

  const member = getDraggedMember(e)
  if (!member) return

  const dataTransfer = e.dataTransfer
  if (!dataTransfer) return

  const from = dataTransfer.getData('from')

  if (from === 'list') {
    const memberIndex = listMembers.value.findIndex((item) => item.name === member.name)
    if (memberIndex > -1) {
      listMembers.value.splice(memberIndex, 1)
    }
  } else if (from === 'column') {
    const fromIndex = Number(dataTransfer.getData('colIndex'))
    const fromGroup = groups.value[fromIndex]

    if (fromGroup) {
      const memberIndex = fromGroup.findIndex((item) => item.name === member.name)
      if (memberIndex > -1) {
        fromGroup.splice(memberIndex, 1)
      }
    }
  }

  targetGroup.push(member)
  targetGroup.sort((a, b) => a.job.localeCompare(b.job))
}

function getColumnAverage(idx: number): string | number {
  const group = groups.value[idx]
  if (!group || !group.length) return 0

  const sum = group.reduce((acc, member) => acc + member.totalPower, 0)
  return (sum / group.length).toFixed(0)
}

const filteredMembers = computed<Member[]>(() =>
  listMembers.value
    .filter(
      (member) =>
        selectedJobs.value.includes('全体成员') || selectedJobs.value.includes(member.job),
    )
    .filter((member) => member.totalPower >= minScore.value)
    .sort((a, b) => b.totalPower - a.totalPower),
)

function onJobChange(changedJob: string): void {
  if (changedJob === '全体成员') {
    if (selectedJobs.value.includes('全体成员')) {
      selectedJobs.value = ['全体成员', ...uniqueJobs.value.filter((job) => job !== '全体成员')]
    } else {
      selectedJobs.value = []
    }
    return
  }

  const allJobs = uniqueJobs.value.filter((job) => job !== '全体成员')
  const hasAll = selectedJobs.value.includes('全体成员')

  if (hasAll) {
    selectedJobs.value = selectedJobs.value.filter((job) => job !== '全体成员')
  }

  const allChecked = allJobs.every((job) => selectedJobs.value.includes(job))
  if (allChecked && !selectedJobs.value.includes('全体成员')) {
    selectedJobs.value.unshift('全体成员')
  }
}

function resetGroups(): void {
  groups.value = [[], [], [], [], []]
  listMembers.value = [...members.value].sort((a, b) => b.totalPower - a.totalPower)
}

function clearGroup(idx: number): void {
  const group = groups.value[idx]
  if (!group) return

  listMembers.value.push(...group)
  groups.value[idx] = []
  listMembers.value.sort((a, b) => b.totalPower - a.totalPower)
}

function exportExcel(): void {
  const gap = 3
  const wb = XLSX.utils.book_new()
  const ws: Record<string, unknown> = {}
  const merges: XLSX.Range[] = []

  const maxRows = Math.max(...groups.value.map((group) => group.length))

  groups.value.forEach((group, groupIndex) => {
    const baseCol = groupIndex * gap

    const header = columnTitles[groupIndex]
    ws[XLSX.utils.encode_cell({ c: baseCol, r: 0 })] = { v: header, t: 's' }
    merges.push({
      s: { c: baseCol, r: 0 },
      e: { c: baseCol + 1, r: 0 },
    })

    group.forEach((member, rowIndex) => {
      const r = rowIndex + 1
      ws[XLSX.utils.encode_cell({ c: baseCol, r })] = { v: member.name, t: 's' }
      ws[XLSX.utils.encode_cell({ c: baseCol + 1, r })] = { v: member.job, t: 's' }
    })
  })

  ws['!ref'] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: groups.value.length * gap - 2, r: maxRows },
  })
  ws['!merges'] = merges

  ws['!cols'] = Array.from({ length: groups.value.length }, () => [
    { wch: 14 },
    { wch: 10 },
    { wch: 2 },
  ]).flat()

  XLSX.utils.book_append_sheet(wb, ws as XLSX.WorkSheet, '分团列表')
  XLSX.writeFile(wb, '分团配置.xlsx')
}

const exportedImgUrl = ref<string | null>(null)
const exportedImgWidth = ref(0)
const exportedImgHeight = ref(0)
const showImageModal = ref(false)

function closeImageModal(): void {
  showImageModal.value = false
}

function exportImage(): void {
  const colWidth = 300
  const gap = 10
  const padding = 20
  const rowHeight = 30
  const headerHeight = 44
  const cols = 5

  const maxRows = Math.max(0, ...groups.value.map((group) => group.length))
  const widthCss = padding * 2 + cols * colWidth + (cols - 1) * gap
  const heightCss = padding * 2 + headerHeight + maxRows * rowHeight

  exportedImgWidth.value = widthCss
  exportedImgHeight.value = heightCss

  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(widthCss * dpr))
  canvas.height = Math.max(1, Math.floor(heightCss * dpr))

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale(dpr, dpr)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthCss, heightCss)
  ctx.strokeStyle = '#dddddd'
  ctx.lineWidth = 1
  ctx.textBaseline = 'middle'

  const headerFont =
    '600 16px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans"'
  const rowFont =
    '14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans"'

  function drawCenteredHeader(
    ctx:CanvasRenderingContext2D,
    text: string, 
    x0: number, 
    y0: number, 
    w: number, 
    h: number
  ): void {
    ctx.font = headerFont
    ctx.fillStyle = '#111827'
    const textWidth = ctx.measureText(text).width
    ctx.fillText(text, x0 + w / 2 - textWidth / 2, y0 + h / 2)
  }

  function drawClippedRowText(
    ctx:CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    color: string,
  ): void {
    ctx.font = rowFont
    ctx.fillStyle = color

    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y + rowHeight / 2)
      return
    }

    const ellipsis = '…'
    let clippedText = text

    while (
      clippedText.length > 0 &&
      ctx.measureText(clippedText + ellipsis).width > maxWidth
    ) {
      clippedText = clippedText.slice(0, -1)
    }

    ctx.fillText(clippedText + ellipsis, x, y + rowHeight / 2)
  }

  for (let groupIndex = 0; groupIndex < cols; groupIndex++) {
    const group = groups.value[groupIndex] || []
    const x0 = padding + groupIndex * (colWidth + gap)
    const y0 = padding

    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(x0, y0, colWidth, headerHeight)
    ctx.strokeRect(x0, y0, colWidth, headerHeight)

    const headerText = `${columnTitles[groupIndex]} (${group.length}/30，平均 ${getColumnAverage(groupIndex)})`
    drawCenteredHeader(ctx, headerText, x0, y0, colWidth, headerHeight)

    group.forEach((member, index) => {
      const yRow = y0 + headerHeight + index * rowHeight

      const bg = getJobColor(member.job)
      ctx.fillStyle = bg
      ctx.fillRect(x0, yRow, colWidth, rowHeight)
      ctx.strokeRect(x0, yRow, colWidth, rowHeight)

      const fg = getContrastColor(bg)
      const text = `${member.name} - ${member.job} - ${member.totalPower}`
      const paddingX = 8
      drawClippedRowText(ctx, text, x0 + paddingX, yRow, colWidth - paddingX * 2, fg)
    })
  }

  exportedImgUrl.value = canvas.toDataURL('image/png')
  showImageModal.value = true

  nextTick(() => {
    const modalOverlay = document.querySelector('.modal-overlay') as HTMLElement | null
    modalOverlay?.focus()
  })
}

interface CacheSnapshot {
  version: number
  ts: number
  members: Member[]
  listMembers: Member[]
  groups: Member[][]
  selectedJobs: string[]
  minScore: number
  uniqueJobs: string[]
  fileSelected: boolean
  historyData: PlayerHistoryByName
}

const CACHE_KEY = 'nsh-match-configurator-cache/v1'

function buildStateSnapshot(): CacheSnapshot {
  return {
    version: 1,
    ts: Date.now(),
    members: members.value,
    listMembers: listMembers.value,
    groups: groups.value,
    selectedJobs: selectedJobs.value,
    minScore: minScore.value,
    uniqueJobs: uniqueJobs.value,
    fileSelected: fileSelected.value,
    historyData: historyData.value,
  }
}

function saveCache(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(buildStateSnapshot()))
  } catch (error) {
    console.warn('保存缓存失败：', error)
  }
}

function loadCache(): boolean {
  function startOfSundayWeek(date: Date): Date {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    result.setHours(0, 0, 0, 0)

    const day = result.getDay()
    result.setDate(result.getDate() - day)
    return result
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return false

    const data = JSON.parse(raw) as Partial<CacheSnapshot> & { version?: number; ts?: number }

    const thisSunday = startOfSundayWeek(new Date())
    const cacheTime = new Date(data.ts || 0)

    if (cacheTime < thisSunday) {
      localStorage.removeItem(CACHE_KEY)
      return false
    }

    if (!data || data.version !== 1) return false

    if (Array.isArray(data.members)) {
      members.value = data.members
    }

    if (Array.isArray(data.listMembers)) {
      listMembers.value = data.listMembers
    }

    if (Array.isArray(data.groups) && data.groups.length === 5) {
      groups.value = data.groups
    }

    if (Array.isArray(data.selectedJobs)) {
      selectedJobs.value = data.selectedJobs
    }

    if (typeof data.minScore === 'number') {
      minScore.value = data.minScore
    }

    if (Array.isArray(data.uniqueJobs)) {
      uniqueJobs.value = data.uniqueJobs
    }

    fileSelected.value = !!data.fileSelected || members.value.length > 0
    historyData.value = data.historyData ?? {}

    return true
  } catch (error) {
    console.warn('读取缓存失败：', error)
    return false
  }
}

const persistOnLeave = (): void => {
  saveCache()
}

const onVisibilityChange = (): void => {
  if (document.visibilityState === 'hidden') {
    saveCache()
  }
}

onMounted((): void => {
  loadCache()
  window.addEventListener('beforeunload', persistOnLeave)
  window.addEventListener('pagehide', persistOnLeave)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount((): void => {
  saveCache()
  window.removeEventListener('beforeunload', persistOnLeave)
  window.removeEventListener('pagehide', persistOnLeave)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

</script>

<style scoped>
.match-configurator-container {
  width: 100%;
  height: 100%;
}
.file-upload-container {
  width: 100%;
}
.configurator-container {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  width: 100%;
  height: calc(100% - 30px);
}
.filter {
  width: 150px;
  border: 1px solid #ddd;
  padding: 20px;
  border-radius: 8px;
  background: #f9f9f9;
  box-sizing: border-box;
  overflow-y: auto;
  max-height: 100%;
}
.filter-section { margin-bottom: 15px; }
.filter > .filter-section:nth-of-type(2) { margin-top: 30px; }
.member-list {
  width: 300px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #f9f9f9;
  box-sizing: border-box;
}
.list-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: bold;
}
.groups-wrapper {
  flex: 1;
  overflow-x: auto;
}
.groups {
  display: grid;
  grid-template-columns: repeat(5, 300px);
  gap: 10px;
  height: 100%;
}
.group {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #f9f9f9;
  box-sizing: border-box;
  overflow-y: auto;
}
.group h4 {
  margin: 0 0 10px;
  font-size: 16px;
  text-align: center;
}
.member-item {
  position: relative;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 14px;
  cursor: move;
}
.member-item:hover { background-color: inherit; }

/* 浮窗：浅色半透明背景 */
.global-tooltip {
  position: fixed;
  pointer-events: none;
  width: 380px;
  background-color: rgba(255, 250, 115, 0.8);
  border: 1px solid rgba(200, 200, 180, 0.8);
  padding: 8px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  z-index: 1000;
}
.record { font-size: 12px; line-height: 1.4; }
.record + .record {
  margin-top: 6px;
  border-top: 1px dashed #ddd;
  padding-top: 6px;
}
.error { color: red; }

.job-statistics{
  margin-top: 30px;
}

.group-tooltip {
  position: fixed;
  pointer-events: none;
  background-color: rgba(200, 230, 255, 0.9);
  border: 1px solid #99ccee;
  padding: 8px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  z-index: 1000;
}
.group-tooltip .record { font-size: 12px; line-height: 1.4; }

/* 弹窗遮罩 */
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

/* 弹窗主体：固定为视口的 90% 尺寸，并允许内部水平+垂直滚动 */
.modal {
  position: relative;
  background: #fff;
  border-radius: 10px;
  width: 90vw;          /* 固定，不用 max-width，确保小窗时不压缩图片而是出现滚动条 */
  height: 90vh;         /* 固定，不用 max-height */
  padding: 16px 20px 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  overflow: auto;       /* 同时支持横向与纵向滚动 */
}

/* 关闭按钮 */
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

/* 关键：图片不做任何自适应，按导出时的逻辑尺寸显示；需要滚动时由 .modal 承担 */
.modal img {
  display: block;
  max-width: none;
  max-height: none;
  margin: 0 auto;
}

</style>
