import { reactive } from 'vue'

export interface ColumnDef {
  key: string
  label: string
}

export function useVisibleColumns(
  columnsDef: ColumnDef[],
  defaultHiddenKeys: string[] = [],
) {
  const hiddenSet = new Set(defaultHiddenKeys)
  const visibleColumns = reactive<Record<string, boolean>>({})

  columnsDef.forEach((col) => {
    visibleColumns[col.key] = !hiddenSet.has(col.key)
  })

  return { visibleColumns }
}
