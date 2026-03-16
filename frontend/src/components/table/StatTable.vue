<template>
  <div v-if="rows.length" class="table-wrapper">
    <table class="results">
      <thead>
        <tr>
          <th>序号</th>
          <template v-for="col in columns" :key="col.key">
            <th
              v-if="isVisible(col.key)"
              :class="{ 'ctx-highlight': isColHighlighted(col.key) }"
              @click="col.sortable !== false && emit('sort', col.key)"
              @contextmenu.prevent="emit('header-context', col.key)"
            >
              {{ col.label }}
              <span v-if="sortKey === col.key">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="row[rowKey] ?? i">
          <td
            :class="{ 'ctx-highlight': isRowHighlighted(row[rowKey]) }"
            @contextmenu.prevent="emit('row-context', row[rowKey])"
          >
            {{ i + 1 }}
          </td>
          <template v-for="col in columns" :key="col.key">
            <td
              v-if="isVisible(col.key)"
              :class="cellClasses(row, col)"
              :style="cellStyle(row, col)"
              @click="onCellClick(row, col)"
              @contextmenu.prevent="emit('cell-context', { rowId: row[rowKey], colKey: col.key })"
            >
              {{ row[col.key] }}
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="empty">暂无数据</div>
</template>

<script setup>
const props = defineProps({
  // columns 支持约定字段：
  // - key/label/sortable：基础列配置
  // - clickable：点击单元格时触发 open-history
  // - professionColor/bar：通过注入样式函数扩展单元格渲染
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'player_id' },
  sortKey: { type: String, default: '' },
  sortAsc: { type: Boolean, default: true },
  historyClickable: { type: Boolean, default: true },
  historyIdKey: { type: String, default: 'player_id' },
  visibleColumns: { type: Object, default: () => ({}) },
  barStyleFn: { type: Function, default: null },
  professionStyleFn: { type: Function, default: null },
  isColHighlightedFn: { type: Function, default: () => false },
  isRowHighlightedFn: { type: Function, default: () => false },
  cellClassFn: { type: Function, default: () => ({}) },
})

const emit = defineEmits(['sort', 'open-history', 'header-context', 'row-context', 'cell-context'])

function isVisible(colKey) {
  if (Object.prototype.hasOwnProperty.call(props.visibleColumns, colKey)) {
    return !!props.visibleColumns[colKey]
  }
  return true
}

function isColHighlighted(colKey) {
  return props.isColHighlightedFn(colKey)
}

function isRowHighlighted(rowId) {
  return props.isRowHighlightedFn(rowId)
}

function onCellClick(row, col) {
  if (!col.clickable || !props.historyClickable) return
  emit('open-history', row[props.historyIdKey])
}

function cellStyle(row, col) {
  const styles = {}
  if (col.professionColor && typeof props.professionStyleFn === 'function') {
    Object.assign(styles, props.professionStyleFn(row[col.key]) || {})
  }
  if (col.bar && typeof props.barStyleFn === 'function') {
    Object.assign(styles, props.barStyleFn(row[col.key], col.key) || {})
  }
  if (col.clickable && props.historyClickable) styles.cursor = 'pointer'
  return styles
}

function cellClasses(row, col) {
  const list = []
  if (col.bar) list.push('bar-cell')
  const extra = props.cellClassFn(row[props.rowKey], col.key)
  if (typeof extra === 'string') list.push(extra)
  else if (extra && typeof extra === 'object') {
    Object.entries(extra).forEach(([key, active]) => {
      if (active) list.push(key)
    })
  }
  return list
}
</script>

<style scoped>
.table-wrapper {
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
}

.results th {
  background: #fafafa;
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 10;
}

.bar-cell {
  background-clip: padding-box;
}

.ctx-highlight {
  box-shadow: inset 4px 0 0 0 #ff0000;
  color: #ff0000;
  text-underline-offset: 3px;
}

.empty {
  padding: 2rem;
  text-align: center;
  color: #888;
}
</style>
