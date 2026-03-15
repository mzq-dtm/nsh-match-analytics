export function formatMatchName(matchName) {
  const base = String(matchName || '').replace(/\.csv$/i, '')
  const parts = base.split('_')
  const teams = (parts[0] || '').replace(/vs/i, ' vs ')
  const [year, month, day, hour] = parts.slice(1, 5)
  return `${teams} ${year}年${month}月${day}日 ${hour}时联赛`
}
