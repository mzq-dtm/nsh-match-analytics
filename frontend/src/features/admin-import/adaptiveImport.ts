export const NO_LEADER = '无'

const MATCH_COLUMNS = ['帮会名', '玩家', '职业', '所在团长'] as const
const MEMBER_COLUMNS = ['名称', '分堂', '职位', '总战力'] as const

export type LeagueMode = 'classic' | 'golden'

export class AdaptiveImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdaptiveImportError'
  }
}

export interface CsvDocument {
  rows: string[][]
  headerRowIndex: number
  headers: string[]
}

export interface MatchParticipant {
  rowIndex: number
  guild: string
  nickname: string
  profession: string
  originalLeader: string
}

export interface LeaderCount {
  leaderNickname: string
  playerCount: number
}

export interface LeagueDetection {
  mode: LeagueMode
  targetGuild: string
  homePlayerCount: number
  ignoredNoLeaderCount: number
  distinctLeaderCount: number
  maxLeaderPlayerCount: number
  leaderCounts: LeaderCount[]
  matchDocument: CsvDocument
  participants: MatchParticipant[]
  matchColumnIndexes: MatchColumnIndexes
}

export interface GuildMember {
  rowIndex: number
  nickname: string
  division: string | null
  positions: string[]
  totalPower: string | null
}

export interface LeaderCandidate {
  nickname: string
  division: string | null
  profession: string
  originalLeader: string
  totalPower: string | null
}

export type RecommendationReason = 'division_master' | 'highest_power'

export interface LeaderRecommendation {
  leaderNickname: string
  division: string
  reason: RecommendationReason
  totalPower: string | null
}

export interface GoldenImportAnalysis {
  detection: LeagueDetection
  memberDocument: CsvDocument
  members: GuildMember[]
  memberByNickname: Map<string, GuildMember>
  divisions: string[]
  leaderCandidates: LeaderCandidate[]
  recommendations: LeaderRecommendation[]
  warnings: string[]
}

export interface LeaderDivisionConfig {
  leaderNickname: string
  division: string
}

export interface SmallTeamMember {
  nickname: string
  profession: string
  division: string | null
}

export interface SmallTeam {
  originalLeader: string
  members: SmallTeamMember[]
  divisionCounts: Array<{ division: string; count: number }>
}

export type AutomaticAssignmentReason = 'configured_leader_team' | 'division_consensus'
export type PendingAssignmentReason =
  | 'member_count_lt_4'
  | 'no_division_consensus'
  | 'division_without_leader'

export interface AutomaticSmallTeamAssignment extends SmallTeam {
  division: string
  leaderNickname: string
  reason: AutomaticAssignmentReason
}

export interface PendingSmallTeam extends SmallTeam {
  inferredDivision: string | null
  reason: PendingAssignmentReason
}

export interface GoldenTeamInference {
  automaticAssignments: AutomaticSmallTeamAssignment[]
  pendingTeams: PendingSmallTeam[]
  noLeaderPlayerCount: number
}

export interface FinalizedGoldenAssignments {
  csvText: string
  effectiveLeaders: Map<string, string>
  leaderPlayerCounts: Map<string, number>
  leaderTeamCounts: Map<string, number>
  inference: GoldenTeamInference
}

interface MatchColumnIndexes {
  guild: number
  nickname: number
  profession: number
  leader: number
}

interface MemberColumnIndexes {
  nickname: number
  division: number
  positions: number
  totalPower: number
}

function isBlankRow(row: string[]): boolean {
  return row.every((value) => value.trim() === '')
}

function normalizedHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim()
}

function findHeaderRow(rows: string[][]): number {
  const index = rows.findIndex((row) => !isBlankRow(row))
  if (index === -1) throw new AdaptiveImportError('CSV 文件为空')
  return index
}

export function parseCsv(text: string): CsvDocument {
  const input = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r' || char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (char === '\r' && input[index + 1] === '\n') index += 1
    } else {
      field += char
    }
  }

  if (inQuotes) throw new AdaptiveImportError('CSV 存在未闭合的引号字段')
  if (row.length > 0 || field !== '') {
    row.push(field)
    rows.push(row)
  }

  const headerRowIndex = findHeaderRow(rows)
  const headerRow = rows[headerRowIndex]
  if (!headerRow) throw new AdaptiveImportError('CSV 缺少表头')
  const headers = headerRow.map(normalizedHeader)
  return { rows, headerRowIndex, headers }
}

function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

export function serializeCsv(rows: string[][]): string {
  const body = rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
  return `\uFEFF${body}\r\n`
}

export async function readCsvBlob(blob: Blob): Promise<CsvDocument> {
  return parseCsv(await blob.text())
}

export function createCsvBlob(csvText: string): Blob {
  return new Blob([csvText], { type: 'text/csv;charset=utf-8' })
}

function requireColumnIndexes(
  document: CsvDocument,
  required: readonly string[],
  label: string,
): Map<string, number> {
  const indexes = new Map<string, number>()
  for (const column of required) {
    const index = document.headers.indexOf(column)
    if (index === -1) throw new AdaptiveImportError(`${label}缺少列：${column}`)
    indexes.set(column, index)
  }
  return indexes
}

function getRequiredIndex(indexes: Map<string, number>, column: string): number {
  const value = indexes.get(column)
  if (value == null) throw new AdaptiveImportError(`缺少列：${column}`)
  return value
}

function getMatchColumnIndexes(document: CsvDocument): MatchColumnIndexes {
  const indexes = requireColumnIndexes(document, MATCH_COLUMNS, '联赛数据文件')
  return {
    guild: getRequiredIndex(indexes, '帮会名'),
    nickname: getRequiredIndex(indexes, '玩家'),
    profession: getRequiredIndex(indexes, '职业'),
    leader: getRequiredIndex(indexes, '所在团长'),
  }
}

function getMemberColumnIndexes(document: CsvDocument): MemberColumnIndexes {
  const indexes = requireColumnIndexes(document, MEMBER_COLUMNS, '帮会成员文件')
  return {
    nickname: getRequiredIndex(indexes, '名称'),
    division: getRequiredIndex(indexes, '分堂'),
    positions: getRequiredIndex(indexes, '职位'),
    totalPower: getRequiredIndex(indexes, '总战力'),
  }
}

function cell(row: string[], index: number): string {
  return (row[index] ?? '').trim()
}

function isEmbeddedMatchHeader(row: string[], columns: MatchColumnIndexes): boolean {
  return cell(row, columns.guild) === '帮会名' && cell(row, columns.nickname) === '玩家'
}

export function detectLeagueMode(matchDocument: CsvDocument, targetGuild: string): LeagueDetection {
  const normalizedGuild = targetGuild.trim()
  if (!normalizedGuild) throw new AdaptiveImportError('本帮帮会名不能为空')

  const columns = getMatchColumnIndexes(matchDocument)
  const participants: MatchParticipant[] = []

  matchDocument.rows.forEach((row, rowIndex) => {
    if (rowIndex === matchDocument.headerRowIndex || isBlankRow(row)) return
    if (isEmbeddedMatchHeader(row, columns)) return
    const guild = cell(row, columns.guild)
    if (guild !== normalizedGuild) return

    const nickname = cell(row, columns.nickname)
    const profession = cell(row, columns.profession)
    const originalLeader = cell(row, columns.leader)
    if (!nickname) throw new AdaptiveImportError(`联赛数据第 ${rowIndex + 1} 行的玩家昵称为空`)
    if (!profession) throw new AdaptiveImportError(`联赛数据第 ${rowIndex + 1} 行的职业为空`)
    if (!originalLeader) {
      throw new AdaptiveImportError(`联赛数据第 ${rowIndex + 1} 行的所在团长为空`)
    }
    participants.push({ rowIndex, guild, nickname, profession, originalLeader })
  })

  if (participants.length === 0) {
    throw new AdaptiveImportError(`联赛数据中没有找到本帮“${normalizedGuild}”的数据`)
  }

  const counts = new Map<string, number>()
  let ignoredNoLeaderCount = 0
  for (const participant of participants) {
    if (participant.originalLeader === NO_LEADER) {
      ignoredNoLeaderCount += 1
      continue
    }
    counts.set(participant.originalLeader, (counts.get(participant.originalLeader) ?? 0) + 1)
  }

  const leaderCounts = Array.from(counts, ([leaderNickname, playerCount]) => ({
    leaderNickname,
    playerCount,
  }))
  const maxLeaderPlayerCount = Math.max(0, ...leaderCounts.map((item) => item.playerCount))
  const distinctLeaderCount = leaderCounts.length
  const mode: LeagueMode =
    maxLeaderPlayerCount >= 7 || distinctLeaderCount <= 6 ? 'classic' : 'golden'

  return {
    mode,
    targetGuild: normalizedGuild,
    homePlayerCount: participants.length,
    ignoredNoLeaderCount,
    distinctLeaderCount,
    maxLeaderPlayerCount,
    leaderCounts,
    matchDocument,
    participants,
    matchColumnIndexes: columns,
  }
}

function normalizeUnsignedInteger(value: string): string | null {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return null
  return normalized.replace(/^0+(?=\d)/, '')
}

function compareUnsignedIntegers(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length
  if (left === right) return 0
  return left > right ? 1 : -1
}

function parseGuildMembers(document: CsvDocument): {
  members: GuildMember[]
  memberByNickname: Map<string, GuildMember>
  divisions: string[]
} {
  const columns = getMemberColumnIndexes(document)
  const members: GuildMember[] = []
  const memberByNickname = new Map<string, GuildMember>()
  const divisions: string[] = []
  const divisionSet = new Set<string>()

  document.rows.forEach((row, rowIndex) => {
    if (rowIndex === document.headerRowIndex || isBlankRow(row)) return
    const nickname = cell(row, columns.nickname)
    if (!nickname || nickname === '名称') return
    if (memberByNickname.has(nickname)) {
      throw new AdaptiveImportError(`帮会成员文件中昵称“${nickname}”重复，无法唯一判断分堂`)
    }

    const rawDivision = cell(row, columns.division)
    const division = rawDivision.endsWith('堂') ? rawDivision : null
    const positions = cell(row, columns.positions)
      .split(/[;；]/)
      .map((position) => position.trim())
      .filter(Boolean)
    const totalPower = normalizeUnsignedInteger(cell(row, columns.totalPower))
    const member: GuildMember = {
      rowIndex,
      nickname,
      division,
      positions,
      totalPower,
    }
    members.push(member)
    memberByNickname.set(nickname, member)

    if (division && !divisionSet.has(division)) {
      divisionSet.add(division)
      divisions.push(division)
    }
  })

  if (divisions.length === 0) throw new AdaptiveImportError('帮会成员文件中没有找到以“堂”结尾的有效分堂')
  return { members, memberByNickname, divisions }
}

function buildLeaderRecommendations(
  detection: LeagueDetection,
  members: GuildMember[],
  memberByNickname: Map<string, GuildMember>,
  divisions: string[],
  candidates: LeaderCandidate[],
): { recommendations: LeaderRecommendation[]; warnings: string[] } {
  const candidateByNickname = new Map(candidates.map((candidate) => [candidate.nickname, candidate]))
  const recommendations: LeaderRecommendation[] = []
  const warnings: string[] = []

  for (const division of divisions) {
    const masters = members.filter((member) => member.positions.includes(`${division}主`))
    if (masters.length === 0) {
      warnings.push(`${division}没有找到“${division}主”职位，请手动新增团长。`)
      continue
    }
    const eligibleMasters = masters.filter((member) => candidateByNickname.has(member.nickname))

    if (eligibleMasters.length === 1) {
      const master = eligibleMasters[0]
      if (!master) continue
      if (master.division !== division) {
        warnings.push(
          `${master.nickname}的职位包含“${division}主”，但成员分堂为“${master.division ?? '无有效分堂'}”；已按职位推荐为${division}团长，请管理员确认。`,
        )
      }
      recommendations.push({
        leaderNickname: master.nickname,
        division,
        reason: 'division_master',
        totalPower: master.totalPower,
      })
      continue
    }

    if (eligibleMasters.length > 1) {
      warnings.push(
        `${division}有多名符合条件的参赛堂主（${eligibleMasters.map((item) => item.nickname).join('、')}），请手动新增团长。`,
      )
      continue
    }

    const eligibleMembers = detection.participants
      .filter((participant) => participant.originalLeader !== NO_LEADER)
      .map((participant) => memberByNickname.get(participant.nickname))
      .filter((member): member is GuildMember => member?.division === division)

    if (eligibleMembers.length === 0) {
      warnings.push(`${division}没有符合条件的参赛成员，未能自动推荐团长。`)
      continue
    }

    const invalidPower = eligibleMembers.filter((member) => member.totalPower == null)
    if (invalidPower.length > 0) {
      warnings.push(
        `${division}需要按总战力推荐团长，但 ${invalidPower.map((item) => item.nickname).join('、')} 的总战力无效，请手动新增团长。`,
      )
      continue
    }

    const sorted = [...eligibleMembers].sort((left, right) => {
      const leftPower = left.totalPower ?? '0'
      const rightPower = right.totalPower ?? '0'
      return compareUnsignedIntegers(rightPower, leftPower)
    })
    const highest = sorted[0]
    if (!highest?.totalPower) continue
    const tied = sorted.filter(
      (member) => member.totalPower != null && compareUnsignedIntegers(member.totalPower, highest.totalPower ?? '0') === 0,
    )
    if (tied.length > 1) {
      warnings.push(
        `${division}最高总战力并列（${tied.map((item) => item.nickname).join('、')}），请手动新增团长。`,
      )
      continue
    }
    recommendations.push({
      leaderNickname: highest.nickname,
      division,
      reason: 'highest_power',
      totalPower: highest.totalPower,
    })
  }

  return { recommendations, warnings }
}

export function prepareGoldenImport(
  detection: LeagueDetection,
  memberDocument: CsvDocument,
): GoldenImportAnalysis {
  if (detection.mode !== 'golden') throw new AdaptiveImportError('经典服数据不需要执行黄金服团长推断')

  const duplicateParticipants = new Set<string>()
  const seenParticipants = new Set<string>()
  for (const participant of detection.participants) {
    if (seenParticipants.has(participant.nickname)) duplicateParticipants.add(participant.nickname)
    seenParticipants.add(participant.nickname)
  }
  if (duplicateParticipants.size > 0) {
    throw new AdaptiveImportError(
      `本帮联赛数据中存在重复昵称：${Array.from(duplicateParticipants).join('、')}`,
    )
  }

  const { members, memberByNickname, divisions } = parseGuildMembers(memberDocument)
  const leaderCandidates = detection.participants
    .filter((participant) => participant.originalLeader !== NO_LEADER)
    .map((participant): LeaderCandidate => {
      const member = memberByNickname.get(participant.nickname)
      return {
        nickname: participant.nickname,
        division: member?.division ?? null,
        profession: participant.profession,
        originalLeader: participant.originalLeader,
        totalPower: member?.totalPower ?? null,
      }
    })

  if (leaderCandidates.length === 0) {
    throw new AdaptiveImportError('没有可选的团长：本帮所有玩家的“所在团长”均为“无”')
  }

  const { recommendations, warnings } = buildLeaderRecommendations(
    detection,
    members,
    memberByNickname,
    divisions,
    leaderCandidates,
  )
  return {
    detection,
    memberDocument,
    members,
    memberByNickname,
    divisions,
    leaderCandidates,
    recommendations,
    warnings,
  }
}

export function validateLeaderDivisionConfigs(
  analysis: GoldenImportAnalysis,
  configs: LeaderDivisionConfig[],
): LeaderDivisionConfig[] {
  if (configs.length === 0) throw new AdaptiveImportError('至少需要配置一名团长')
  const candidateNames = new Set(analysis.leaderCandidates.map((candidate) => candidate.nickname))
  const divisions = new Set(analysis.divisions)
  const seenLeaders = new Set<string>()
  const seenDivisions = new Set<string>()

  return configs.map((config, index) => {
    const leaderNickname = config.leaderNickname.trim()
    const division = config.division.trim()
    if (!leaderNickname || !division) throw new AdaptiveImportError(`第 ${index + 1} 个团队的团长和分堂都必须选择`)
    if (!candidateNames.has(leaderNickname)) {
      throw new AdaptiveImportError(`团长“${leaderNickname}”不是本场参赛且原“所在团长”非“无”的玩家`)
    }
    if (!divisions.has(division)) throw new AdaptiveImportError(`“${division}”不是有效分堂`)
    if (seenLeaders.has(leaderNickname)) throw new AdaptiveImportError(`团长“${leaderNickname}”被重复选择`)
    if (seenDivisions.has(division)) throw new AdaptiveImportError(`分堂“${division}”不能由多名团长管辖`)
    seenLeaders.add(leaderNickname)
    seenDivisions.add(division)
    return { leaderNickname, division }
  })
}

function buildSmallTeams(analysis: GoldenImportAnalysis): SmallTeam[] {
  const grouped = new Map<string, SmallTeamMember[]>()
  for (const participant of analysis.detection.participants) {
    if (participant.originalLeader === NO_LEADER) continue
    const members = grouped.get(participant.originalLeader) ?? []
    members.push({
      nickname: participant.nickname,
      profession: participant.profession,
      division: analysis.memberByNickname.get(participant.nickname)?.division ?? null,
    })
    grouped.set(participant.originalLeader, members)
  }

  return Array.from(grouped, ([originalLeader, members]) => {
    const counts = new Map<string, number>()
    for (const member of members) {
      if (member.division) counts.set(member.division, (counts.get(member.division) ?? 0) + 1)
    }
    return {
      originalLeader,
      members,
      divisionCounts: Array.from(counts, ([division, count]) => ({ division, count })).sort(
        (left, right) => right.count - left.count,
      ),
    }
  })
}

export function inferGoldenTeamAssignments(
  analysis: GoldenImportAnalysis,
  rawConfigs: LeaderDivisionConfig[],
): GoldenTeamInference {
  const configs = validateLeaderDivisionConfigs(analysis, rawConfigs)
  const configByDivision = new Map(configs.map((config) => [config.division, config]))
  const participantByNickname = new Map(
    analysis.detection.participants.map((participant) => [participant.nickname, participant]),
  )
  const automaticAssignments: AutomaticSmallTeamAssignment[] = []
  const pendingTeams: PendingSmallTeam[] = []

  for (const team of buildSmallTeams(analysis)) {
    const configuredLeadersInTeam = configs.filter(
      (config) => participantByNickname.get(config.leaderNickname)?.originalLeader === team.originalLeader,
    )
    if (configuredLeadersInTeam.length > 1) {
      throw new AdaptiveImportError(
        `原小队“${team.originalLeader}”同时包含多名已配置团长（${configuredLeadersInTeam.map((item) => item.leaderNickname).join('、')}），无法确定小队归属`,
      )
    }
    const configuredLeader = configuredLeadersInTeam[0]
    if (configuredLeader) {
      automaticAssignments.push({
        ...team,
        division: configuredLeader.division,
        leaderNickname: configuredLeader.leaderNickname,
        reason: 'configured_leader_team',
      })
      continue
    }

    const consensus = team.divisionCounts.find((item) => item.count >= 4)
    if (team.members.length >= 4 && consensus) {
      const config = configByDivision.get(consensus.division)
      if (config) {
        automaticAssignments.push({
          ...team,
          division: consensus.division,
          leaderNickname: config.leaderNickname,
          reason: 'division_consensus',
        })
      } else {
        pendingTeams.push({
          ...team,
          inferredDivision: consensus.division,
          reason: 'division_without_leader',
        })
      }
      continue
    }

    pendingTeams.push({
      ...team,
      inferredDivision: null,
      reason: team.members.length < 4 ? 'member_count_lt_4' : 'no_division_consensus',
    })
  }

  return {
    automaticAssignments,
    pendingTeams,
    noLeaderPlayerCount: analysis.detection.ignoredNoLeaderCount,
  }
}

function incrementCount(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

export function finalizeGoldenLeaderAssignments(
  analysis: GoldenImportAnalysis,
  rawConfigs: LeaderDivisionConfig[],
  manualAssignments: Record<string, string>,
): FinalizedGoldenAssignments {
  const configs = validateLeaderDivisionConfigs(analysis, rawConfigs)
  const leaderNames = new Set(configs.map((config) => config.leaderNickname))
  const inference = inferGoldenTeamAssignments(analysis, configs)
  const effectiveLeaders = new Map<string, string>()
  const leaderPlayerCounts = new Map<string, number>()
  const leaderTeamCounts = new Map<string, number>()

  for (const participant of analysis.detection.participants) {
    if (participant.originalLeader === NO_LEADER) effectiveLeaders.set(participant.nickname, NO_LEADER)
  }

  for (const assignment of inference.automaticAssignments) {
    incrementCount(leaderTeamCounts, assignment.leaderNickname)
    for (const member of assignment.members) {
      effectiveLeaders.set(member.nickname, assignment.leaderNickname)
      incrementCount(leaderPlayerCounts, assignment.leaderNickname)
    }
  }

  for (const team of inference.pendingTeams) {
    const selectedLeader = (manualAssignments[team.originalLeader] ?? '').trim()
    if (!leaderNames.has(selectedLeader)) {
      throw new AdaptiveImportError(`请为待定小队“${team.originalLeader}”选择有效团长`)
    }
    incrementCount(leaderTeamCounts, selectedLeader)
    for (const member of team.members) {
      effectiveLeaders.set(member.nickname, selectedLeader)
      incrementCount(leaderPlayerCounts, selectedLeader)
    }
  }

  for (const [leaderNickname, teamCount] of leaderTeamCounts) {
    if (teamCount > 5) {
      throw new AdaptiveImportError(`团长“${leaderNickname}”共分配了 ${teamCount} 个小队，超过每团最多 5 个小队的限制`)
    }
  }

  if (effectiveLeaders.size !== analysis.detection.participants.length) {
    throw new AdaptiveImportError('真实团长映射不完整，请重新计算小队归属')
  }

  const rewrittenRows = analysis.detection.matchDocument.rows.map((row) => [...row])
  const leaderColumn = analysis.detection.matchColumnIndexes.leader
  for (const participant of analysis.detection.participants) {
    const leaderNickname = effectiveLeaders.get(participant.nickname)
    if (!leaderNickname) throw new AdaptiveImportError(`玩家“${participant.nickname}”缺少真实团长`)
    const row = rewrittenRows[participant.rowIndex]
    if (!row) throw new AdaptiveImportError(`联赛数据第 ${participant.rowIndex + 1} 行不存在`)
    while (row.length <= leaderColumn) row.push('')
    row[leaderColumn] = leaderNickname
  }

  return {
    csvText: serializeCsv(rewrittenRows),
    effectiveLeaders,
    leaderPlayerCounts,
    leaderTeamCounts,
    inference,
  }
}

export function createRewrittenMatchFile(originalFile: File, csvText: string): File {
  return new File([csvText], originalFile.name, {
    type: 'text/csv;charset=utf-8',
    lastModified: originalFile.lastModified,
  })
}
