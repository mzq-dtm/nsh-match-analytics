import { ref } from 'vue'

type SortableValue = string | number | null | undefined

export type CompareFn<T> = (a: T, b: T, asc: boolean) => number

export interface UseTableSortOptions<T extends Record<string, unknown>> {
  initialKey?: keyof T | ''
  initialAsc?: boolean
  compareMap?: Partial<Record<keyof T, CompareFn<T>>>
}

export function useTableSort<T extends Record<string, unknown>>(
  { initialKey = '', initialAsc = true, compareMap = {} }: UseTableSortOptions<T> = {},
) {
  const sortKey = ref<keyof T | ''>(initialKey)
  const sortAsc = ref(initialAsc)

  function sortBy(key: keyof T) {
    if (sortKey.value === key) {
      sortAsc.value = !sortAsc.value
      return
    }

    sortKey.value = key
    sortAsc.value = false
  }

  function sortRows(rows: T[]): T[] {
    const arr = (rows || []).slice()
    if (!sortKey.value) return arr

    const key = sortKey.value
    const asc = sortAsc.value
    const custom = compareMap[key]

    return arr.sort((a, b) => {
      if (typeof custom === 'function') {
        return custom(a, b, asc)
      }

      const va = a[key] as SortableValue
      const vb = b[key] as SortableValue

      if (typeof va === 'number' && typeof vb === 'number') {
        return asc ? va - vb : vb - va
      }

      const cmp = String(va).localeCompare(String(vb), 'zh-CN')
      return asc ? cmp : -cmp
    })
  }

  return {
    sortKey,
    sortAsc,
    sortBy,
    sortRows,
  }
}
