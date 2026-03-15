import { reactive } from 'vue'

export function useVisibleColumns(columnsDef, defaultHiddenKeys = []) {
  const hiddenSet = new Set(defaultHiddenKeys)
  const visibleColumns = reactive({})

  ;(columnsDef || []).forEach((col) => {
    visibleColumns[col.key] = !hiddenSet.has(col.key)
  })

  return { visibleColumns }
}
