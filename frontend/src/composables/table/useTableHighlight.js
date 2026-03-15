import { computed, ref } from 'vue'

export function useTableHighlight() {
  const highlightedCols = ref(new Set())
  const highlightedRows = ref(new Set())
  const highlightedCells = ref(new Set())

  function toggleSet(setRef, key) {
    const next = new Set(setRef.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setRef.value = next
  }

  function onHeaderContext(colKey) {
    if (!colKey) return
    toggleSet(highlightedCols, colKey)
  }

  function onRowContext(rowId) {
    if (rowId == null) return
    toggleSet(highlightedRows, String(rowId))
  }

  function onCellContext(rowId, colKey) {
    if (rowId == null || !colKey) return
    toggleSet(highlightedCells, `${rowId}::${colKey}`)
  }

  function isColHighlighted(colKey) {
    return highlightedCols.value.has(colKey)
  }

  function isRowHighlighted(rowId) {
    return highlightedRows.value.has(String(rowId))
  }

  function isCellHighlighted(rowId, colKey) {
    return highlightedCells.value.has(`${rowId}::${colKey}`)
  }

  function cellClass(rowId, colKey) {
    return {
      'ctx-highlight':
        isColHighlighted(colKey) ||
        isRowHighlighted(rowId) ||
        isCellHighlighted(rowId, colKey),
    }
  }

  function clearHighlights() {
    highlightedCols.value = new Set()
    highlightedRows.value = new Set()
    highlightedCells.value = new Set()
  }

  const hasHighlights = computed(
    () =>
      highlightedCols.value.size > 0 ||
      highlightedRows.value.size > 0 ||
      highlightedCells.value.size > 0,
  )

  return {
    highlightedCols,
    highlightedRows,
    highlightedCells,
    onHeaderContext,
    onRowContext,
    onCellContext,
    isColHighlighted,
    isRowHighlighted,
    isCellHighlighted,
    cellClass,
    clearHighlights,
    hasHighlights,
  }
}
