import type {
    MatchResult,
    OpponentPerformanceItem,
    PerformanceItem,
} from '@/api/nsh'

export type RawPerformance = PerformanceItem | OpponentPerformanceItem

export interface SubTab {
  key: string
  label: string
}

export type NormalizedPerformance = {
  match_id: number
  player_id: number | null
  recorded_nick: string
  level: number
  profession_name: string | null
  leader_nick: string | null
  equipment_score: number | null
  skill_score: number | null
  cultivation_score: number | null
  total_combat_power: number | null
  kills: number
  assists: number
  war_resources: number
  damage_to_players: number
  damage_to_structures: number
  healing_amount: number
  damage_taken: number
  serious_injuries: number
  skill_qingdeng: number
  skill_huayu: number
  control_count: number
  kda: number
  damage_per_kill: number
  total_damage: number
  row_id: string
}

export interface AggregatedPerformanceRow {
  leader_nick: string | null
  total_combat_power: number
  total_count: number
  kills: number
  assists: number
  damage_to_players: number
  damage_to_structures: number
  healing_amount: number
  damage_taken: number
  serious_injuries: number
  total_damage: number
  kda: number
  damage_per_kill: number
  avg_total_combat_power: number
}

export interface ProfessionAggregatedRow {
  profession_name: string | null
  total_combat_power: number
  total_count: number
  kills: number
  assists: number
  damage_to_players: number
  damage_to_structures: number
  healing_amount: number
  damage_taken: number
  serious_injuries: number
  control_count: number
  avg_kills: number
  avg_assists: number
  avg_damage_to_players: number
  avg_damage_to_structures: number
  avg_healing_amount: number
  avg_damage_taken: number
  avg_serious_injuries: number
  avg_control_count: number
  avg_total_combat_power: number
}

export interface TableColumnConfig {
  key: string
  label: string
  clickable?: boolean
  professionColor?: boolean
  bar?: boolean
  sortable?: boolean
}

export type ViewSide = 'home' | 'away'

export type AnalysisCheckKey =
  | 'kills'
  | 'damage_to_players'
  | 'damage_to_structures'
  | 'healing_amount'
  | 'skill_qingdeng'
  | 'control_count'

export interface AnalysisCheckConfig {
  key: AnalysisCheckKey
  label: string
}

export type AnalysisThresholdGroup = Partial<Record<AnalysisCheckKey, number | null>>

export interface AnalysisThresholds {
  global: AnalysisThresholdGroup
  suwen: AnalysisThresholdGroup
  jiuling: AnalysisThresholdGroup
  tieyi: AnalysisThresholdGroup
}

export interface ProfessionAnalysisRule {
  mode: 'all_must_fail'
  checks: AnalysisCheckKey[]
}

export interface AnalysisResultCheck {
  key: AnalysisCheckKey
  label: string
  actual: number
  threshold: number
  passed: boolean
}

export type AnalysisFailureRow = NormalizedPerformance & {
  failedChecks: AnalysisResultCheck[]
}

export interface CachedMatchResult {
  home_outcome: MatchResult['home_outcome']
  note: string
}

export type BarKey =
  | 'kda'
  | 'damage_per_kill'
  | 'total_damage'
  | 'kills'
  | 'assists'
  | 'war_resources'
  | 'damage_to_players'
  | 'damage_to_structures'
  | 'healing_amount'
  | 'damage_taken'
  | 'serious_injuries'
  | 'skill_qingdeng'
  | 'skill_huayu'
  | 'control_count'

export interface CellContextPayload {
  rowId: string | number | null | undefined
  colKey: string
}
