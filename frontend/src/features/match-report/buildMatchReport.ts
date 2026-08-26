import { extractMatchGuildNames } from '@/utils/match'
import {
  MATCH_REPORT_BAR_KEYS,
  MATCH_REPORT_COLUMNS,
  MATCH_REPORT_TABLE_DEFINITIONS,
  SUWEN_PROFESSION,
  UNASSIGNED_TEAM_LABEL,
} from '@/features/match-report/constants'
import type { NormalizedPerformance } from '@/features/match-records/types'
import type {
  MatchReportBarMaxima,
  MatchReportInput,
  MatchReportMetadata,
  MatchReportModel,
  MatchReportOutcome,
  MatchReportRow,
  MatchReportTable,
  MatchReportTeam,
} from '@/features/match-report/types'

interface IndexedRow {
  index: number
  row: NormalizedPerformance
}

interface TeamBucket {
  leaderNick: string
  isUnassigned: boolean
  firstIndex: number
  rows: IndexedRow[]
}

const zhCnNumericCollator = new Intl.Collator('zh-CN', {
  usage: 'sort',
  numeric: true,
  sensitivity: 'variant',
})

function rawStringCompare(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * Chinese-friendly natural ordering with a deterministic code-unit fallback.
 * The fallback matters when Intl considers two distinct strings equivalent.
 */
function compareDisplayNames(left: string, right: string): number {
  const localized = zhCnNumericCollator.compare(left, right)
  return localized || rawStringCompare(left, right)
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function normalizeLeaderNick(value: unknown): string {
  const leaderNick = normalizeOptionalText(value)
  if (!leaderNick || leaderNick === '无') {
    return UNASSIGNED_TEAM_LABEL
  }
  return leaderNick
}

function isUnassignedLeader(value: unknown): boolean {
  const leaderNick = normalizeOptionalText(value)
  return !leaderNick || leaderNick === '无'
}

function normalizeRow(
  source: NormalizedPerformance,
  sourceIndex: number,
): NormalizedPerformance {
  const kills = toFiniteNumber(source.kills)
  const seriousInjuries = toFiniteNumber(source.serious_injuries)
  const playerDamage = toFiniteNumber(source.damage_to_players)
  const structureDamage = toFiniteNumber(source.damage_to_structures)
  const recordedNick = normalizeOptionalText(source.recorded_nick) ?? '未命名玩家'

  return {
    match_id: toFiniteNumber(source.match_id),
    player_id: toNullableFiniteNumber(source.player_id),
    recorded_nick: recordedNick,
    level: toFiniteNumber(source.level),
    profession_name: normalizeOptionalText(source.profession_name),
    leader_nick: normalizeLeaderNick(source.leader_nick),
    equipment_score: toNullableFiniteNumber(source.equipment_score),
    skill_score: toNullableFiniteNumber(source.skill_score),
    cultivation_score: toNullableFiniteNumber(source.cultivation_score),
    total_combat_power: toNullableFiniteNumber(source.total_combat_power),
    kills,
    assists: toFiniteNumber(source.assists),
    war_resources: toFiniteNumber(source.war_resources),
    damage_to_players: playerDamage,
    damage_to_structures: structureDamage,
    healing_amount: toFiniteNumber(source.healing_amount),
    damage_taken: toFiniteNumber(source.damage_taken),
    serious_injuries: seriousInjuries,
    skill_qingdeng: toFiniteNumber(source.skill_qingdeng),
    skill_huayu: toFiniteNumber(source.skill_huayu),
    control_count: toFiniteNumber(source.control_count),
    kda: toFiniteNumber(source.kda),
    damage_per_kill: toFiniteNumber(source.damage_per_kill),
    total_damage: toFiniteNumber(source.total_damage, playerDamage + structureDamage),
    row_id:
      normalizeOptionalText(source.row_id) ??
      `report-${toFiniteNumber(source.match_id)}-${recordedNick}-${sourceIndex}`,
  }
}

function emptyMaxValues(): MatchReportBarMaxima {
  const maxima = Object.create(null) as MatchReportBarMaxima
  for (const key of MATCH_REPORT_BAR_KEYS) maxima[key] = 0
  return maxima
}

function calculateMaxValues(rows: readonly MatchReportRow[]): MatchReportBarMaxima {
  const maxima = emptyMaxValues()

  for (const row of rows) {
    for (const key of MATCH_REPORT_BAR_KEYS) {
      const value = toFiniteNumber(row[key])
      if (value > maxima[key]) maxima[key] = value
    }
  }

  return maxima
}

function buildTable(
  bucketRows: readonly IndexedRow[],
  definition: (typeof MATCH_REPORT_TABLE_DEFINITIONS)[number],
): MatchReportTable {
  const matchingRows = bucketRows.filter(({ row }) =>
    definition.filter === 'suwen'
      ? row.profession_name === SUWEN_PROFESSION
      : row.profession_name !== SUWEN_PROFESSION,
  )

  matchingRows.sort((left, right) => {
    const valueDifference = right.row[definition.sortKey] - left.row[definition.sortKey]
    if (valueDifference !== 0) return valueDifference

    const nicknameDifference = compareDisplayNames(
      left.row.recorded_nick,
      right.row.recorded_nick,
    )
    if (nicknameDifference !== 0) return nicknameDifference

    // Exact duplicate nicknames retain their original API order.
    return left.index - right.index
  })

  const rows = matchingRows.map<MatchReportRow>(({ row }, index) => ({
    ...row,
    sequence: index + 1,
  }))

  return {
    kind: definition.kind,
    title: definition.title,
    sortKey: definition.sortKey,
    sortLabel: definition.sortLabel,
    emptyMessage: definition.emptyMessage,
    rows,
    maxValues: calculateMaxValues(rows),
  }
}

function parseMetadata(
  matchId: number,
  matchName: string,
  homeOutcome: MatchReportOutcome,
  note: string,
): MatchReportMetadata {
  const baseName = matchName.replace(/\.csv$/i, '')
  const timestampedName = baseName.match(
    /^(.*?)vs(.+?)_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/i,
  )
  const extractedGuilds = extractMatchGuildNames(matchName)
  const homeGuild = timestampedName?.[1]?.trim() || extractedGuilds.home
  const awayGuild = timestampedName?.[2]?.trim() || extractedGuilds.away
  const year = timestampedName?.[3]
  const month = timestampedName?.[4]
  const day = timestampedName?.[5]
  const hour = timestampedName?.[6]
  const minute = timestampedName?.[7]
  const second = timestampedName?.[8]
  const matchTime =
    year && month && day && hour && minute && second
      ? `${year}年${month}月${day}日 ${hour}:${minute}:${second}`
      : '时间未提供'
  const matchup = `${homeGuild} vs ${awayGuild}`
  const displayName =
    matchTime === '时间未提供' ? baseName.replace(/vs/i, ' vs ') : `${matchup} ${matchTime}`

  return {
    matchId,
    matchName,
    displayName,
    homeGuild,
    awayGuild,
    matchup,
    matchTime,
    homeOutcome,
    outcomeLabel:
      homeOutcome === 'win' ? '胜利' : homeOutcome === 'lose' ? '败北' : '结果未录入',
    note,
  }
}

function assertValidInput(input: MatchReportInput): void {
  if (!Number.isInteger(input?.matchId) || input.matchId <= 0) {
    throw new Error('无法生成团队战报：比赛 ID 无效')
  }
  if (typeof input.matchName !== 'string' || !input.matchName.trim()) {
    throw new Error('无法生成团队战报：比赛名称不存在')
  }
  if (!Array.isArray(input.homePerformances) || input.homePerformances.length === 0) {
    throw new Error('无法生成团队战报：本帮比赛数据尚未准备好或为空')
  }
  if (![null, undefined, 'win', 'lose'].includes(input.homeOutcome)) {
    throw new Error('无法生成团队战报：比赛结果无效')
  }

  input.homePerformances.forEach((row, index) => {
    if (!row || typeof row !== 'object') {
      throw new Error(`无法生成团队战报：第 ${index + 1} 条本帮数据无效`)
    }
    if (toFiniteNumber(row.match_id, Number.NaN) !== input.matchId) {
      throw new Error('无法生成团队战报：本帮数据不属于当前选择的比赛')
    }
  })
}

/**
 * Builds the complete, ordered export model without touching browser APIs or
 * mutating the array/objects owned by MatchRecords.vue.
 */
export function buildMatchReport(input: MatchReportInput): MatchReportModel {
  assertValidInput(input)

  const matchId = input.matchId
  const matchName = input.matchName.trim()
  const homeOutcome = input.homeOutcome ?? null
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  // `null` is the internal unassigned key so a real leader whose nickname is
  // literally “未分团” remains a distinct, normal team.
  const buckets = new Map<string | null, TeamBucket>()

  input.homePerformances.forEach((source, index) => {
    const row = normalizeRow(source, index)
    const leaderNick = row.leader_nick ?? UNASSIGNED_TEAM_LABEL
    const isUnassigned = isUnassignedLeader(source.leader_nick)
    const bucketKey = isUnassigned ? null : leaderNick
    let bucket = buckets.get(bucketKey)

    if (!bucket) {
      bucket = {
        leaderNick,
        isUnassigned,
        firstIndex: index,
        rows: [],
      }
      buckets.set(bucketKey, bucket)
    }

    bucket.rows.push({ index, row })
  })

  const orderedBuckets = Array.from(buckets.values()).sort((left, right) => {
    if (left.isUnassigned !== right.isUnassigned) return left.isUnassigned ? 1 : -1

    const participantDifference = right.rows.length - left.rows.length
    if (participantDifference !== 0) return participantDifference

    const leaderDifference = compareDisplayNames(left.leaderNick, right.leaderNick)
    if (leaderDifference !== 0) return leaderDifference
    return left.firstIndex - right.firstIndex
  })

  const teams = orderedBuckets.map<MatchReportTeam>((bucket, index) => ({
    sequence: index + 1,
    leaderNick: bucket.leaderNick,
    isUnassigned: bucket.isUnassigned,
    participantCount: bucket.rows.length,
    tables: MATCH_REPORT_TABLE_DEFINITIONS.map((definition) =>
      buildTable(bucket.rows, definition),
    ),
  }))

  return {
    metadata: parseMetadata(matchId, matchName, homeOutcome, note),
    columns: MATCH_REPORT_COLUMNS,
    teams,
  }
}
