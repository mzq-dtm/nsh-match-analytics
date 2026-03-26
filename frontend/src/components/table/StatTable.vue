<template>
  <div v-if="props.rows.length" class="table-wrapper">
    <table class="results">
      <thead>
      <tr>
        <th>序号</th>
        <template v-for="col in props.columns" :key="col.key">
          <th
            v-if="isVisible(col.key)"
            :class="{ 'ctx-highlight': isColHighlighted(col.key) }"
            @click="col.sortable !== false && emit('sort', col.key)"
            @contextmenu.prevent="emit('header-context', col.key)"
          >
            {{ col.label }}
            <span v-if="props.sortKey === col.key">{{ props.sortAsc ? '▲' : '▼' }}</span>
          </th>
        </template>
      </tr>
      </thead>
      <tbody>
      <tr v-for="(row, i) in props.rows" :key="row[props.rowKey] ?? i">
        <td
          :class="{ 'ctx-highlight': isRowHighlighted(row[props.rowKey] ?? '') }"
          @contextmenu.prevent="emit('row-context', row[props.rowKey] ?? '')"
        >
          {{ i + 1 }}
        </td>
        <template v-for="col in props.columns" :key="col.key">
          <td
            v-if="isVisible(col.key)"
            :class="cellClasses(row, col)"
            :style="cellStyle(row, col)"
            @click="onCellClick(row, col)"
            @contextmenu.prevent="emit('cell-context', { rowId: row[props.rowKey] ?? '', colKey: col.key })"
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

<script setup lang="ts">
type TableCellValue = string | number | null | undefined
type RowIdValue = string | number
type TableRow = Record<string, TableCellValue>

interface TableColumn {
  key: string
  label: string
  sortable?: boolean
  clickable?: boolean
  professionColor?: boolean
  bar?: boolean
}

type StyleObject = Record<string, string | number>
type CellClassValue = string | Record<string, boolean> | null | undefined

const props = withDefaults(defineProps<{
  columns: TableColumn[]
  rows: TableRow[]
  rowKey?: string
  sortKey?: string
  sortAsc?: boolean
  historyClickable?: boolean
  historyIdKey?: string
  visibleColumns?: Record<string, boolean>
  barStyleFn?: ((value: TableCellValue, colKey: string) => StyleObject | null | undefined) | null
  professionStyleFn?: ((value: string | null | undefined) => StyleObject | null | undefined) | null
  isColHighlightedFn?: (colKey: string) => boolean
  isRowHighlightedFn?: (rowId: RowIdValue) => boolean
  cellClassFn?: (rowId: RowIdValue, colKey: string) => CellClassValue
}>(), {
  rowKey: 'player_id',
  sortKey: '',
  sortAsc: true,
  historyClickable: true,
  historyIdKey: 'player_id',
  visibleColumns: () => ({}),
  barStyleFn: null,
  professionStyleFn: null,
  isColHighlightedFn: () => false,
  isRowHighlightedFn: () => false,
  cellClassFn: () => ({}),
})

const emit = defineEmits<{
  (e: 'sort', key: string): void
  (e: 'open-history', playerId: TableCellValue): void
  (e: 'header-context', colKey: string): void
  (e: 'row-context', rowId: TableCellValue): void
  (e: 'cell-context', payload: { rowId: TableCellValue; colKey: string }): void
}>()

function isVisible(colKey: string): boolean {
  if (Object.prototype.hasOwnProperty.call(props.visibleColumns, colKey)) {
    return !!props.visibleColumns[colKey]
  }
  return true
}

function isColHighlighted(colKey: string): boolean {
  return props.isColHighlightedFn(colKey)
}

function isRowHighlighted(rowId: RowIdValue): boolean {
  return props.isRowHighlightedFn(rowId)
}

function onCellClick(row: TableRow, col: TableColumn): void {
  if (!col.clickable || !props.historyClickable) return
  emit('open-history', row[props.historyIdKey])
}

function cellStyle(row: TableRow, col: TableColumn): StyleObject {
  const styles: StyleObject = {}

  if (col.professionColor && typeof props.professionStyleFn === 'function') {
    Object.assign(
      styles,
      props.professionStyleFn(row[col.key] == null ? undefined : String(row[col.key])) || {}
    )
  }

  if (col.bar && typeof props.barStyleFn === 'function') {
    Object.assign(styles, props.barStyleFn(row[col.key], col.key) || {})
  }

  if (col.clickable && props.historyClickable) {
    styles.cursor = 'pointer'
  }

  return styles
}

function cellClasses(row: TableRow, col: TableColumn): string[] {
  const list: string[] = []

  if (col.bar) {
    list.push('bar-cell')
  }

  const extra = props.cellClassFn(row[props.rowKey] ?? '', col.key)

  if (typeof extra === 'string') {
    list.push(extra)
  } else if (extra && typeof extra === 'object') {
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

