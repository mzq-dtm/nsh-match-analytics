import { ref } from 'vue'

export function useTableSort({ initialKey = '', initialAsc = true, compareMap = {} } = {}) {
  const sortKey = ref(initialKey)
  const sortAsc = ref(initialAsc)

  function sortBy(key) {
    // 同列再次点击：升降序互换；切到新列：默认降序（与业务表格默认习惯一致）。
    if (sortKey.value === key) {
      sortAsc.value = !sortAsc.value
      return
    }
    sortKey.value = key
    sortAsc.value = false
  }

  function sortRows(rows) {
    const arr = (rows || []).slice()
    if (!sortKey.value) return arr

    const key = sortKey.value
    const asc = sortAsc.value
    const custom = compareMap[key]

    return arr.sort((a, b) => {
      // compareMap 可针对特定字段注入自定义比较逻辑（例如时间、复杂对象、多字段排序）。
      if (typeof custom === 'function') return custom(a, b, asc)

      const va = a?.[key]
      const vb = b?.[key]
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
