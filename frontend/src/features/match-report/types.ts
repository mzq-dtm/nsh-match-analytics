import type { MatchResult } from '@/api/nsh'
import type {
  BarKey,
  NormalizedPerformance,
} from '@/features/match-records/types'

export type MatchReportOutcome = MatchResult['home_outcome']

export interface MatchReportInput {
  matchId: number
  matchName: string
  homePerformances: readonly NormalizedPerformance[]
  homeOutcome: MatchReportOutcome
  note?: string | null
}

export type MatchReportTableKind =
  | 'playerDamage'
  | 'structureDamage'
  | 'kills'
  | 'healing'

export type MatchReportSortKey =
  | 'damage_to_players'
  | 'damage_to_structures'
  | 'kills'
  | 'healing_amount'

export type MatchReportColumnKey =
  | 'sequence'
  | 'recorded_nick'
  | 'profession_name'
  | 'leader_nick'
  | 'total_combat_power'
  | 'kda'
  | 'total_damage'
  | 'kills'
  | 'assists'
  | 'damage_to_players'
  | 'damage_to_structures'
  | 'damage_taken'
  | 'serious_injuries'
  | 'healing_amount'
  | 'skill_huayu'
  | 'skill_qingdeng'
  | 'control_count'
  | 'war_resources'

export type MatchReportColumnFormat = 'integer' | 'decimal2' | 'text'

export type MatchReportBarKey = Exclude<BarKey, 'damage_per_kill'>

export interface MatchReportColumn {
  key: MatchReportColumnKey
  label: string
  width: number
  format: MatchReportColumnFormat
  align: 'left' | 'center' | 'right'
  barKey?: MatchReportBarKey
  professionColor?: boolean
}

export interface MatchReportTableDefinition {
  kind: MatchReportTableKind
  title: string
  sortKey: MatchReportSortKey
  sortLabel: string
  filter: 'nonSuwen' | 'suwen'
  emptyMessage: string
}

/**
 * A report row is deliberately a copy of the normalized page row. `sequence`
 * is the continuous, display-only number for its containing table.
 */
export type MatchReportRow = NormalizedPerformance & {
  sequence: number
}

export type MatchReportBarMaxima = Record<MatchReportBarKey, number>

export interface MatchReportTable {
  kind: MatchReportTableKind
  title: string
  sortKey: MatchReportSortKey
  sortLabel: string
  emptyMessage: string
  rows: MatchReportRow[]
  maxValues: MatchReportBarMaxima
}

export interface MatchReportTeam {
  sequence: number
  leaderNick: string
  isUnassigned: boolean
  participantCount: number
  tables: MatchReportTable[]
}

export interface MatchReportMetadata {
  matchId: number
  matchName: string
  displayName: string
  homeGuild: string
  awayGuild: string
  matchup: string
  matchTime: string
  homeOutcome: MatchReportOutcome
  outcomeLabel: string
  note: string
}

export interface MatchReportModel {
  metadata: MatchReportMetadata
  columns: readonly MatchReportColumn[]
  teams: MatchReportTeam[]
}

export interface MatchReportHeaderLayout {
  top: number
  titleTop: number
  displayNameTop: number
  detailsTop: number
  noteLabelTop: number | null
  noteLinesTop: number | null
  noteLines: string[]
  bottom: number
}

export interface MatchReportTableLayout {
  table: MatchReportTable
  top: number
  titleTop: number
  headerTop: number
  bodyTop: number
  bodyHeight: number
  bodyBottom: number
  bottom: number
  sortColumnX: number
  sortColumnWidth: number
}

export interface MatchReportTeamLayout {
  team: MatchReportTeam
  top: number
  bannerTop: number
  tables: MatchReportTableLayout[]
  bottom: number
}

export interface MatchReportCanvasLayout {
  width: number
  height: number
  contentX: number
  contentWidth: number
  header: MatchReportHeaderLayout
  teams: MatchReportTeamLayout[]
}

export interface MatchReportImageResult {
  blob: Blob
  filename: string
  width: number
  height: number
}
