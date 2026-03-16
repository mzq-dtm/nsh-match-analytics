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
            backgroundColor: jobColors[member.job] || '#fff',
            color: getContrastColor(jobColors[member.job])
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
                {{ columnTitles[idx] }} ({{ groups[idx].length }}/30，平均 {{ getColumnAverage(idx) }})
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
                backgroundColor: jobColors[member.job] || '#fff',
                color: getContrastColor(jobColors[member.job])
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
        v-for="(rec, idx) in (
          historyData[hoveredMember] && historyData[hoveredMember].length
          ? historyData[hoveredMember]
          : [{ empty: true }]
        )"
        :key="idx"
        class="record"
      >
        <!-- 无历史数据时显示 -->
        <p v-if="rec.empty">未找到历史数据</p>

        <!-- 有历史记录时正常渲染 -->
        <template v-else>
          <p>联赛场次：{{ formatMatchName(rec.match) }}</p>
          <p>所在团长：{{ rec.leader }}</p>
          <p>击杀：{{ rec.kills }}，KD：{{ rec.KD }}，击杀团内排名：{{ rec.rank_kills }}</p>
          <p>玩家伤害：{{ rec.damage_to_players }}，总伤害：{{ rec.total_damage }}，总伤团内排名：{{ rec.rank_damage }}</p>
          <p>治疗：{{ rec.healing }}，总治疗团内排名：{{ rec.rank_healing }}</p>
          <hr v-if="idx < (historyData[hoveredMember] || []).length - 1">
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

<script setup>
import { ref, computed, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import * as XLSX from 'xlsx'
import { JOB_COLORS } from '@/constants/profession'
import { getContrastColor } from '@/utils/color'
import { formatMatchName } from '@/utils/match'
import { postPlayerHistoryByNames } from '@/api/nsh'

const fileError = ref(null)
const fileSelected = ref(false)
const members = ref([])
const listMembers = ref([])
const selectedJobs = ref(['全体成员'])   // 默认全选
const minScore = ref(0)
const uniqueJobs = ref([])

// 用于记录当前悬停的玩家和浮窗位置
const hoveredMember = ref(null)
const tooltipPos = reactive({ x: 0, y: 0 })

const hoveredGroup = ref(null)
const groupTooltipPos = reactive({ x: 0, y: 0 })

const globalTooltip   = ref(null)
const groupTooltip    = ref(null)

function keepInsideViewport(elRef, pos, cursorX, cursorY) {
  nextTick(() => {
    const el = elRef.value
    if (!el) return
    const rect   = el.getBoundingClientRect()
    const margin = 10        // 与边界/指针的间距

    // ── 横向 ──
    if (cursorX + margin + rect.width > window.innerWidth) {
      pos.x = cursorX - rect.width - margin
    } else {
      pos.x = cursorX + margin
    }

    // ── 纵向 ──
    if (cursorY + margin + rect.height > window.innerHeight) {
      pos.y = cursorY - rect.height - margin
    } else {
      pos.y = cursorY + margin
    }
  })
}

function onMouseEnter(name) {
  hoveredMember.value = name
}

function onMouseMove(e) {
  keepInsideViewport(globalTooltip, tooltipPos, e.clientX, e.clientY)
}
function onMouseLeave() {
  hoveredMember.value = null
}

function onGroupEnter(idx, e) {
  hoveredGroup.value = idx
  keepInsideViewport(groupTooltip, groupTooltipPos, e.clientX, e.clientY)
}
function onGroupMove(e) {
  keepInsideViewport(groupTooltip, groupTooltipPos, e.clientX, e.clientY)
}
function onGroupLeave() {
  hoveredGroup.value = null
}

// 统计指定团内各职业人数
function getGroupJobCounts(idx) {
  const counts = {}
  groups.value[idx].forEach(m => {
    counts[m.job] = (counts[m.job] || 0) + 1
  })
  return counts
}

const historyData = ref({})

// 计算所有成员中的最大总战力，用于评分输入框的 max 属性
const maxScore = computed(() => {
  if (!members.value.length) return 0
  return Math.max(...members.value.map(m => m.totalPower))
})

// 5 团标题
const columnTitles = ['一团','二团','三团','四团','五团']

// 5 列数据结构
const groups = ref([[], [], [], [], []])

// 职业到背景色映射
const jobColors = JOB_COLORS

const groupJobDistAll = computed(() => {
  const counts = {}
  // 先把所有职业都初始化为 0（跳过“全体成员”）
  uniqueJobs.value.forEach(job => {
    if (job !== '全体成员') counts[job] = 0
  })
  // 再遍历所有团成员去累加
  groups.value.flat().forEach(m => {
    if (Object.prototype.hasOwnProperty.call(counts, m.job)) {
      counts[m.job]++
    }
  })
  return counts
})

// 读取并解析 CSV
function handleFileUpload(event) {
  // 重置状态
  fileError.value = null
  fileSelected.value = false
  listMembers.value = []
  groups.value = [[], [], [], [], []]
  minScore.value = 0
  uniqueJobs.value = []
  historyData.value = {}

  const file = event.target.files[0]
  if (!file || !file.name.endsWith('.csv')) {
    fileError.value = '请上传CSV格式的文件'
    return
  }
  fileSelected.value = true
  const reader = new FileReader()
  reader.onload = e => {
    const rows = e.target.result
        .split('\n')
        .map(r => r.trim())
        .filter(r => r !== '')
    const headers = rows[0].split(',')
    const nameIdx = headers.indexOf('名称')
    const jobIdx = headers.indexOf('职业')
    const powerIdx = headers.indexOf('总战力')
    if (nameIdx<0||jobIdx<0||powerIdx<0) {
      fileError.value = '文件格式不正确，请检查列名'
      return
    }
    members.value = rows.slice(1).map(r => {
      const cols = r.split(',')
      return {
        name: cols[nameIdx],
        job: cols[jobIdx],
        totalPower: parseInt(cols[powerIdx],10)
      }
    })
    listMembers.value = [...members.value].sort((a,b)=>b.totalPower-a.totalPower)
    uniqueJobs.value = ['全体成员', ...new Set(members.value.map(m=>m.job))]
    selectedJobs.value = [...uniqueJobs.value]
    groups.value = [[],[],[],[],[]]
    postPlayerHistoryByNames(members.value.map(m => m.name))
        .then(data => {
          historyData.value = data;  // 完整赋值后端返回的 { name: [records,…], … }
        })
        .catch(err => {
          console.error('获取玩家历史数据失败', err);
          fileError.value = '获取玩家历史数据失败，请稍后重试';
        });
    fileError.value = null
  }
  reader.readAsText(file)

  saveCache()
}

// 拖拽开始
function dragStart(e, member, from, colIndex=null) {
  e.dataTransfer.setData('member', JSON.stringify(member))
  e.dataTransfer.setData('from', from)
  if (from==='column') e.dataTransfer.setData('colIndex', colIndex)
}

// 从列拖回列表
function handleDropToList(e) {
  const member = getDraggedMember(e)
  if (!member) return
  if (e.dataTransfer.getData('from')==='column') {
    const idx = +e.dataTransfer.getData('colIndex')
    const i = groups.value[idx].findIndex(m=>m.name===member.name)
    if (i>-1) groups.value[idx].splice(i,1)
    listMembers.value.push(member)
    listMembers.value.sort((a,b)=>b.totalPower-a.totalPower)
  }
}

// 拖到某团（限制30人）
function handleDropToColumn(colIndex,e) {
  if (groups.value[colIndex].length>=30) return
  const member = getDraggedMember(e)
  if (!member) return
  const from = e.dataTransfer.getData('from')
  if (from==='list') {
    const i = listMembers.value.findIndex(m=>m.name===member.name)
    if (i>-1) listMembers.value.splice(i,1)
  } else {
    const f = +e.dataTransfer.getData('colIndex')
    const i = groups.value[f].findIndex(m=>m.name===member.name)
    if (i>-1) groups.value[f].splice(i,1)
  }
  groups.value[colIndex].push(member)
  groups.value[colIndex].sort((a, b)=>a.job.localeCompare(b.job))
}

// 计算某团平均总战力
function getColumnAverage(idx) {
  const col = groups.value[idx]
  if (!col.length) return 0
  const sum = col.reduce((acc,m)=>acc+m.totalPower,0)
  return (sum/col.length).toFixed(0)
}

const filteredMembers = computed(() =>
    listMembers.value
        .filter(m=>selectedJobs.value.includes('全体成员') || selectedJobs.value.includes(m.job))
        .filter(m=>m.totalPower>=minScore.value)
        .sort((a,b)=>b.totalPower-a.totalPower)
)


function onJobChange(changedJob) {
  // ① 点击“全体成员”
  if (changedJob === '全体成员') {
    if (selectedJobs.value.includes('全体成员')) {
      // 勾上全体 → 把所有职业都加入
      selectedJobs.value = ['全体成员', ...uniqueJobs.value.filter(j => j !== '全体成员')]
    } else {
      // 取消全体 → 清空所有勾选
      selectedJobs.value = []
    }
    return
  }

  // ② 点单个职业
  const allJobs = uniqueJobs.value.filter(j => j !== '全体成员')
  const hasAll = selectedJobs.value.includes('全体成员')

  // 如果曾经勾了“全体”，先去掉
  if (hasAll) {
    selectedJobs.value = selectedJobs.value.filter(j => j !== '全体成员')
  }

  // 若此时所有具体职业都勾上了 → 自动勾回“全体成员”
  const allChecked = allJobs.every(j => selectedJobs.value.includes(j))
  if (allChecked && !selectedJobs.value.includes('全体成员')) {
    selectedJobs.value.unshift('全体成员')
  }
}

function resetGroups() {
  // 清空所有团
  groups.value = [[], [], [], [], []]
  // 把所有成员重新放回列表，并按战力降序排序
  listMembers.value = [...members.value].sort((a, b) => b.totalPower - a.totalPower)
}

function clearGroup(idx) {
  // 先把该团成员回补到 listMembers
  listMembers.value.push(...groups.value[idx])
  // 再清空该团
  groups.value[idx] = []
  // 重新排序列表
  listMembers.value.sort((a, b) => b.totalPower - a.totalPower)
}

function getDraggedMember(e) {
  const raw = e.dataTransfer.getData('member')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null               // 非法 JSON：直接忽略这次 drop
  }
}

/* =========  保存本地：导出 Excel ========= */
function exportExcel () {
  const gap = 3;                        // 每团 2 列 + 1 空列 → A B | D E | G H …
  const wb  = XLSX.utils.book_new();
  const ws  = {};
  const merges = [];

  const maxRows = Math.max(...groups.value.map(g => g.length)); // 数据行 + 标题行

  /* —— 写入五团 —— */
  groups.value.forEach((group, gIdx) => {
    const baseCol = gIdx * gap;         // 0 / 3 / 6 …

    /* ① 标题行：合并两列，只写团名 */
    const header = columnTitles[gIdx];
    ws[XLSX.utils.encode_cell({ c: baseCol, r: 0 })] = { v: header, t: 's' };
    merges.push({ s: { c: baseCol, r: 0 }, e: { c: baseCol + 1, r: 0 } });

    /* ② 成员行：名称 | 职业 */
    group.forEach((m, rowIdx) => {
      const r = rowIdx + 1;             // 数据行从 1 开始
      ws[XLSX.utils.encode_cell({ c: baseCol,     r })] = { v: m.name, t: 's' };
      ws[XLSX.utils.encode_cell({ c: baseCol + 1, r })] = { v: m.job,  t: 's' };
    });
  });

  /* —— Sheet 范围、列宽、合并 —— */
  ws['!ref']    = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: groups.value.length * gap - 2, r: maxRows }
  });
  ws['!merges'] = merges;

  /* 每团 2 列：名称列宽 14（≈7 个中文），职业列宽 10，再加 1 空列 */
  ws['!cols'] = Array.from({ length: groups.value.length }, () => (
      [{ wch: 14 }, { wch: 10 }, { wch: 2 }]
  )).flat();

  /* —— 写文件 —— */
  XLSX.utils.book_append_sheet(wb, ws, '分团列表');
  XLSX.writeFile(wb, '分团配置.xlsx');   // 不再需要 cellStyles:true
}

/* =========  导出图片 ========= */
const exportedImgUrl = ref(null)
const exportedImgWidth = ref(0)
const exportedImgHeight = ref(0)
const showImageModal = ref(false)

function closeImageModal() {
  showImageModal.value = false
}

function exportImage () {
  // —— 布局参数（和右侧UI一致）——
  const colWidth = 300
  const gap = 10
  const padding = 20
  const rowHeight = 30
  const headerHeight = 44
  const cols = 5

  const maxRows = Math.max(0, ...groups.value.map(g => g.length))
  const widthCss  = padding * 2 + cols * colWidth + (cols - 1) * gap
  const heightCss = padding * 2 + headerHeight + maxRows * rowHeight

  exportedImgWidth.value  = widthCss
  exportedImgHeight.value = heightCss

  // —— 按设备像素比提高清晰度 ——
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(widthCss * dpr))
  canvas.height = Math.max(1, Math.floor(heightCss * dpr))
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  // 背景与通用样式
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthCss, heightCss)
  ctx.strokeStyle = '#dddddd'
  ctx.lineWidth = 1
  ctx.textBaseline = 'middle'

  const headerFont = '600 16px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans"'
  const rowFont    = '14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans"'

  function drawCenteredHeader(text, x0, y0, w, h) {
    ctx.font = headerFont
    ctx.fillStyle = '#111827'
    const tw = ctx.measureText(text).width
    ctx.fillText(text, x0 + w / 2 - tw / 2, y0 + h / 2)
  }
  function drawClippedRowText(text, x, y, maxWidth, color) {
    ctx.font = rowFont
    ctx.fillStyle = color
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y + rowHeight / 2)
      return
    }
    const ellipsis = '…'
    let t = text
    while (t.length > 0 && ctx.measureText(t + ellipsis).width > maxWidth) {
      t = t.slice(0, -1)
    }
    ctx.fillText(t + ellipsis, x, y + rowHeight / 2)
  }

  // —— 五团绘制 ——
  for (let gIdx = 0; gIdx < cols; gIdx++) {
    const group = groups.value[gIdx] || []
    const x0 = padding + gIdx * (colWidth + gap)
    const y0 = padding

    // 头部
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(x0, y0, colWidth, headerHeight)
    ctx.strokeRect(x0, y0, colWidth, headerHeight)
    const headerText = `${columnTitles[gIdx]} (${group.length}/30，平均 ${getColumnAverage(gIdx)})`
    drawCenteredHeader(headerText, x0, y0, colWidth, headerHeight)

    // 行
    for (let i = 0; i < group.length; i++) {
      const m = group[i]
      const yRow = y0 + headerHeight + i * rowHeight

      const bg = jobColors[m.job] || '#ffffff'
      ctx.fillStyle = bg
      ctx.fillRect(x0, yRow, colWidth, rowHeight)
      ctx.strokeRect(x0, yRow, colWidth, rowHeight)

      const fg = getContrastColor(bg)
      const text = `${m.name} - ${m.job} - ${m.totalPower}`
      const paddingX = 8
      drawClippedRowText(text, x0 + paddingX, yRow, colWidth - paddingX * 2, fg)
    }
  }

  exportedImgUrl.value = canvas.toDataURL('image/png')
  showImageModal.value = true

  // 让弹窗获得焦点以便接收 Esc
  nextTick(() => {
    document.querySelector('.modal-overlay')?.focus()
  })
}

/* ========= 缓存：保存/恢复 ========= */
const CACHE_KEY = 'nsh-match-configurator-cache/v1'

function buildStateSnapshot() {
  return {
    version: 1,
    ts: Date.now(),
    members:       members.value,
    listMembers:   listMembers.value,
    groups:        groups.value,
    selectedJobs:  selectedJobs.value,
    minScore:      minScore.value,
    uniqueJobs:    uniqueJobs.value,
    fileSelected:  fileSelected.value,
    historyData:   historyData.value,
  }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(buildStateSnapshot()))
  } catch (e) {
    console.warn('保存缓存失败：', e)
  }
}

function loadCache() {

  // 取某天所在“周日开头的一周”的周日 00:00（本地时区）。
  // 业务规则：缓存仅在“本周”有效，跨周自动失效并清除。
  function startOfSundayWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setHours(0, 0, 0, 0);
    const day = x.getDay(); // Sun=0 ... Sat=6
    x.setDate(x.getDate() - day); // 回退到本周日
    return x;
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)

    const thisSun = startOfSundayWeek(new Date());
    const t = new Date(data.ts || 0);
    if (t < thisSun) {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }

    if (!data || data.version !== 1) return false

    if (Array.isArray(data.members))      members.value = data.members
    if (Array.isArray(data.listMembers))  listMembers.value = data.listMembers
    if (Array.isArray(data.groups) && data.groups.length === 5) groups.value = data.groups
    if (Array.isArray(data.selectedJobs)) selectedJobs.value = data.selectedJobs
    if (typeof data.minScore === 'number') minScore.value = data.minScore
    if (Array.isArray(data.uniqueJobs))   uniqueJobs.value = data.uniqueJobs

    fileSelected.value = !!data.fileSelected || (members.value && members.value.length > 0)
    historyData.value  = data.historyData || {}

    return true
  } catch (e) {
    console.warn('读取缓存失败：', e)
    return false
  }
}

/* 页面离开时保存；进入时尝试恢复 */
const persistOnLeave = () => saveCache()
const onVisibilityChange = () => {
  if (document.visibilityState === 'hidden') saveCache()
}

onMounted(() => {
  loadCache()
  window.addEventListener('beforeunload', persistOnLeave)
  window.addEventListener('pagehide',     persistOnLeave)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  saveCache()
  window.removeEventListener('beforeunload', persistOnLeave)
  window.removeEventListener('pagehide',     persistOnLeave)
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
