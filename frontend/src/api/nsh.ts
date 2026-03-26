import { getJson, postJson } from './client'

export interface MatchItem {
  match_id: number
  match_name: string
}

export interface MatchResult {
  match_id: number
  home_outcome: 'win' | 'lose' | null
  note: string | null
}

export interface PlayerItem {
  player_id: number
  nicknames: string[]
}

export interface PerformanceItem {
  match_id: number
  player_id: number
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
}

export interface OpponentPerformanceItem {
  match_id: number
  player_id: null
  recorded_nick: string
  level: number | null
  profession_name: string | null
  leader_nick: string | null
  equipment_score: null
  skill_score: null
  cultivation_score: null
  total_combat_power: null
  kills: number | null
  assists: number | null
  war_resources: number | null
  damage_to_players: number | null
  damage_to_structures: number | null
  healing_amount: number | null
  damage_taken: number | null
  serious_injuries: number | null
  skill_qingdeng: number | null
  skill_huayu: number | null
  control_count: number | null
}

export interface AttendanceItem {
  player_id: number
  nicknames: string
  total_combat_power: number
  attended: number
  total_matches: number
  attendance_rate: number
  first_match_time: string | null
  last_match_time: string | null
  total_damage_to_players: number
  total_damage_to_structures: number
  total_kills: number
  total_kd: number
  total_healing: number
  total_control: number
  total_qingdeng: number
}

export interface PlayerHistoryItem {
  match_name: string
  match_time: string
  nickname: string
  profession: string | null
  equipment_score: number | null
  skill_score: number | null
  cultivation_score: number | null
  total_combat_power: number | null
  leader: string | null
  kills: number
  assists: number
  war_resources: number
  damage_to_players: number
  damage_to_structures: number
  healing: number
  damage_taken: number
  serious_injuries: number
  skill_qingdeng: number
  skill_huayu: number
  control_count: number
  KD: number
  total_damage: number
  rank_kills: number
  rank_damage: number
  rank_damage_to_players: number
  rank_damage_to_structures: number
  rank_healing: number
}

export interface PlayerHistoryByNameItem {
  match: string
  nickname: string
  profession: string | null
  equipment_score: number | null
  skill_score: number | null
  cultivation_score: number | null
  total_combat_power: number | null
  leader: string | null
  kills: number
  assists: number
  war_resources: number
  damage_to_players: number
  damage_to_structures: number
  healing: number
  damage_taken: number
  serious_injuries: number
  skill_qingdeng: number
  skill_huayu: number
  control_count: number
  KD: number
  total_damage: number
  rank_kills: number
  rank_damage: number
  rank_healing: number
}

export type PlayerHistoryByName = Record<string, PlayerHistoryByNameItem[]>

export const getMatches = () => getJson<MatchItem[]>('/api/matches')
export const getPerformances = (matchId: number) =>
  getJson<PerformanceItem[]>(`/api/performances/${matchId}`)
export const getOpponentPerformances = (matchId: number) =>
  getJson<OpponentPerformanceItem[]>(`/api/opponent-performances/${matchId}`)
export const getMatchResult = (matchId: number) =>
  getJson<MatchResult>(`/api/match-results/${matchId}`)
export const getEarliestMatchDate = () =>
  getJson<{ earliest: string }>('/api/matches/earliest')

export function getAttendance({ start, end }: { start: string; end: string }) {
  const qs = new URLSearchParams({ start, end }).toString()
  return getJson<AttendanceItem[]>(`/api/attendance?${qs}`)
}

export const getPlayers = () => getJson<PlayerItem[]>('/api/players')
export const getPlayerHistory = (playerId: number) =>
  getJson<PlayerHistoryItem[]>(`/api/player_history/${playerId}`)
export const postPlayerHistoryByNames = (names: string[]) =>
  postJson<PlayerHistoryByName>('/api/player_history', { names })
