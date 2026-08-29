export function formatMatchName(matchName: string): string {
  const base = String(matchName || '').replace(/\.csv$/i, '')
  const parts = base.split('_')
  const teams = (parts[0] || '').replace(/vs/i, ' vs ')
  const [year, month, day, hour] = parts.slice(1, 5)
  return `${teams} ${year}年${month}月${day}日 ${hour}时联赛`
}

export interface MatchGuildNames {
  home: string
  away: string
}

export function extractMatchGuildNames(
  matchName: string | null | undefined,
): MatchGuildNames {
  const fallback = { home: '本帮', away: '对方帮会' }
  if (!matchName) return fallback

  const base = matchName.replace(/\.csv$/i, '')
  const timedMatch = base.match(
    /^(.*?)vs(.+?)_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}$/i,
  )
  const home = timedMatch?.[1]?.trim()
  const away = timedMatch?.[2]?.trim()

  if (!home || !away) return fallback
  return { home, away }
}
