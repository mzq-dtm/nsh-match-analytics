import { computed, ref } from 'vue'

export function useTableHighlight() {
  const highlightedCols = ref<Set<string>>(new Set())
  const highlightedRows = ref<Set<string>>(new Set())
  const highlightedCells = ref<Set<string>>(new Set())

  function toggleSet(setRef: { value: Set<string> }, key: string) {
    const next = new Set(setRef.value)

    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }

    setRef.value = next
  }

  function onHeaderContext(colKey: string) {
    if (!colKey) return
    toggleSet(highlightedCols, colKey)
  }

  function onRowContext(rowId: string | number | null | undefined) {
    if (rowId == null) return
    toggleSet(highlightedRows, String(rowId))
  }

  function onCellContext(
    rowId: string | number | null | undefined,
    colKey: string,
  ) {
    if (rowId == null || !colKey) return
    toggleSet(highlightedCells, `${rowId}::${colKey}`)
  }

  function isColHighlighted(colKey: string) {
    return highlightedCols.value.has(colKey)
  }

  function isRowHighlighted(rowId: string | number) {
    return highlightedRows.value.has(String(rowId))
  }

  function isCellHighlighted(rowId: string | number, colKey: string) {
    return highlightedCells.value.has(`${rowId}::${colKey}`)
  }

  function cellClass(rowId: string | number, colKey: string) {
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
