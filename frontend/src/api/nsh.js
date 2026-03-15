import { getJson, postJson } from './client'

export const getMatches = () => getJson('/api/matches')
export const getPerformances = (matchId) => getJson(`/api/performances/${matchId}`)
export const getOpponentPerformances = (matchId) => getJson(`/api/opponent-performances/${matchId}`)
export const getMatchResult = (matchId) => getJson(`/api/match-results/${matchId}`)
export const getEarliestMatchDate = () => getJson('/api/matches/earliest')

export function getAttendance({ start, end }) {
  const qs = new URLSearchParams({ start, end }).toString()
  return getJson(`/api/attendance?${qs}`)
}

export const getPlayers = () => getJson('/api/players')
export const getPlayerHistory = (playerId) => getJson(`/api/player_history/${playerId}`)
export const postPlayerHistoryByNames = (names) => postJson('/api/player_history', { names })
