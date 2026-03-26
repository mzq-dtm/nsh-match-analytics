import {
  ANALYSIS_PERCENTILE,
  SUWEN_ANALYSIS_PERCENTILE,
  SUWEN_THRESHOLD_MULTIPLIER,
} from '@/features/match-records/constants'
import type {
  AggregatedPerformanceRow,
  AnalysisCheckKey,
  AnalysisThresholds,
  NormalizedPerformance,
  ProfessionAggregatedRow,
  RawPerformance,
  ViewSide,
} from '@/features/match-records/types'

export function normalizePerformances(
  data: RawPerformance[] | null | undefined,
  side: ViewSide,
): NormalizedPerformance[] {
  return (data || []).map((p, idx) => {
    const kills = Number(p.kills ?? 0) || 0
    const seriousInjuries = Number(p.serious_injuries ?? 0) || 0
    const damageToPlayers = Number(p.damage_to_players ?? 0) || 0
    const damageToStructures = Number(p.damage_to_structures ?? 0) || 0
    const playerId = p.player_id == null ? null : Number(p.player_id)

    return {
      ...p,
      player_id: playerId,
      level: Number(p.level ?? 0) || 0,
      equipment_score: p.equipment_score == null ? null : Number(p.equipment_score),
      skill_score: p.skill_score == null ? null : Number(p.skill_score),
      cultivation_score: p.cultivation_score == null ? null : Number(p.cultivation_score),
      total_combat_power: p.total_combat_power == null ? null : Number(p.total_combat_power),
      kills,
      assists: Number(p.assists ?? 0) || 0,
      war_resources: Number(p.war_resources ?? 0) || 0,
      damage_to_players: damageToPlayers,
      damage_to_structures: damageToStructures,
      healing_amount: Number(p.healing_amount ?? 0) || 0,
      damage_taken: Number(p.damage_taken ?? 0) || 0,
      serious_injuries: seriousInjuries,
      skill_qingdeng: Number(p.skill_qingdeng ?? 0) || 0,
      skill_huayu: Number(p.skill_huayu ?? 0) || 0,
      control_count: Number(p.control_count ?? 0) || 0,
      kda: Number((kills / Math.max(seriousInjuries, 1)).toFixed(2)),
      damage_per_kill: Math.floor((damageToPlayers) / Math.max(kills, 1)),
      total_damage: damageToPlayers + damageToStructures,
      row_id: `${side}-${playerId ?? p.recorded_nick ?? 'unknown'}-${idx}`,
    }
  })
}

function computeNearestRankThreshold(
  rows: NormalizedPerformance[] | null | undefined,
  key: AnalysisCheckKey,
  percentile: number = ANALYSIS_PERCENTILE,
): number | null {
  const values = (rows || [])
    .map((row) => Number(row[key] ?? 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!values.length) return null

  const index = Math.max(0, Math.ceil(values.length * percentile) - 1)
  return values[index] ?? null
}

export function buildAnalysisThresholds(
  rows: NormalizedPerformance[] | null | undefined,
): AnalysisThresholds {
  const nonSuwenRows = (rows || []).filter((row) => row.profession_name !== '素问')
  const suwenRows = (rows || []).filter((row) => row.profession_name === '素问')
  const jiulingRows = (rows || []).filter((row) => row.profession_name === '九灵')
  const tieyiRows = (rows || []).filter((row) => row.profession_name === '铁衣')

  const suwenHealingBase = computeNearestRankThreshold(
    suwenRows,
    'healing_amount',
    SUWEN_ANALYSIS_PERCENTILE,
  )

  return {
    global: {
      kills: computeNearestRankThreshold(nonSuwenRows, 'kills'),
      damage_to_players: computeNearestRankThreshold(nonSuwenRows, 'damage_to_players'),
      damage_to_structures: computeNearestRankThreshold(nonSuwenRows, 'damage_to_structures'),
    },
    suwen: {
      healing_amount:
        suwenHealingBase == null ? null : suwenHealingBase * SUWEN_THRESHOLD_MULTIPLIER,
    },
    jiuling: {
      skill_qingdeng: computeNearestRankThreshold(jiulingRows, 'skill_qingdeng'),
    },
    tieyi: {
      control_count: computeNearestRankThreshold(tieyiRows, 'control_count'),
    },
  }
}

export function getThresholdForCheck(
  checkKey: AnalysisCheckKey,
  thresholds: AnalysisThresholds,
): number | null | undefined {
  if (checkKey === 'healing_amount') return thresholds.suwen.healing_amount
  if (checkKey === 'skill_qingdeng') return thresholds.jiuling.skill_qingdeng
  if (checkKey === 'control_count') return thresholds.tieyi.control_count
  return thresholds.global[checkKey]
}

export function buildLeaderAggregation(
    rows: NormalizedPerformance[],
): AggregatedPerformanceRow[] {
    const map = new Map<string | null, Omit<AggregatedPerformanceRow, 'total_damage' | 'kda' | 'damage_per_kill' | 'avg_total_combat_power'>>()

  rows.forEach((p) => {
    const key = p.leader_nick

    if (!map.has(key)) {
      map.set(key, {
        leader_nick: key,
        total_combat_power: 0,
        total_count: 0,
        kills: 0,
        assists: 0,
        damage_to_players: 0,
        damage_to_structures: 0,
        healing_amount: 0,
        damage_taken: 0,
        serious_injuries: 0,
      })
    }

    const a = map.get(key)
    if (!a) return

    a.total_count += 1
    a.kills += p.kills
    a.assists += p.assists
    a.damage_to_players += p.damage_to_players
    a.damage_to_structures += p.damage_to_structures
    a.healing_amount += p.healing_amount
    a.damage_taken += p.damage_taken
    a.serious_injuries += p.serious_injuries
    a.total_combat_power += p.total_combat_power ?? 0
  })

  return Array.from(map.values()).map((a) => ({
    ...a,
    total_damage: a.damage_to_players + a.damage_to_structures,
    kda: a.kills / Math.max(a.serious_injuries, 1),
    damage_per_kill: a.damage_to_players / Math.max(a.kills, 1),
    avg_total_combat_power: a.total_combat_power / a.total_count,
  }))
}

export function buildProfessionAggregations(
    rows: NormalizedPerformance[],
): ProfessionAggregatedRow[] {
    const map = new Map<
    string | null,
    Omit<
      ProfessionAggregatedRow,
      | 'avg_kills'
      | 'avg_assists'
      | 'avg_damage_to_players'
      | 'avg_damage_to_structures'
      | 'avg_healing_amount'
      | 'avg_damage_taken'
      | 'avg_serious_injuries'
      | 'avg_control_count'
      | 'avg_total_combat_power'
    >
  >()

  rows.forEach((p) => {
    const key = p.profession_name

    if (!map.has(key)) {
      map.set(key, {
        profession_name: key,
        total_combat_power: 0,
        total_count: 0,
        kills: 0,
        assists: 0,
        damage_to_players: 0,
        damage_to_structures: 0,
        healing_amount: 0,
        damage_taken: 0,
        serious_injuries: 0,
        control_count: 0,
      })
    }

    const a = map.get(key)
    if (!a) return

    a.total_count += 1
    a.kills += p.kills
    a.assists += p.assists
    a.damage_to_players += p.damage_to_players
    a.damage_to_structures += p.damage_to_structures
    a.healing_amount += p.healing_amount
    a.damage_taken += p.damage_taken
    a.serious_injuries += p.serious_injuries
    a.control_count += p.control_count
    a.total_combat_power += p.total_combat_power ?? 0
  })

  return Array.from(map.values()).map((a) => ({
    ...a,
    avg_kills: a.kills / a.total_count,
    avg_assists: a.assists / a.total_count,
    avg_damage_to_players: a.damage_to_players / a.total_count,
    avg_damage_to_structures: a.damage_to_structures / a.total_count,
    avg_healing_amount: a.healing_amount / a.total_count,
    avg_damage_taken: a.damage_taken / a.total_count,
    avg_serious_injuries: a.serious_injuries / a.total_count,
    avg_control_count: a.control_count / a.total_count,
    avg_total_combat_power: a.total_combat_power / a.total_count,
  }))
}