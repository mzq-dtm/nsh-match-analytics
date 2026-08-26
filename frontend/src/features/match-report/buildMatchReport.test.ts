import { describe, expect, it } from 'vitest'

import type { NormalizedPerformance } from '@/features/match-records/types'
import { buildMatchReport } from '@/features/match-report/buildMatchReport'
import type { MatchReportInput } from '@/features/match-report/types'

const MATCH_ID = 42

function performance(
  overrides: Partial<NormalizedPerformance> = {},
): NormalizedPerformance {
  return {
    match_id: MATCH_ID,
    player_id: 1,
    recorded_nick: '默认玩家',
    level: 80,
    profession_name: '神相',
    leader_nick: '默认团长',
    equipment_score: 10_000,
    skill_score: 9_000,
    cultivation_score: 8_000,
    total_combat_power: 100_000,
    kills: 1,
    assists: 2,
    war_resources: 3,
    damage_to_players: 10,
    damage_to_structures: 20,
    healing_amount: 0,
    damage_taken: 30,
    serious_injuries: 4,
    skill_qingdeng: 5,
    skill_huayu: 6,
    control_count: 7,
    kda: 1.5,
    damage_per_kill: 30,
    total_damage: 30,
    row_id: 'default-row',
    ...overrides,
  }
}

function input(
  homePerformances: readonly NormalizedPerformance[],
  overrides: Partial<Omit<MatchReportInput, 'homePerformances'>> = {},
): MatchReportInput {
  return {
    matchId: MATCH_ID,
    matchName: '2026-08-23 20:00 主场帮会 vs 客场帮会',
    homePerformances,
    homeOutcome: 'win',
    note: '固定测试备注',
    ...overrides,
  }
}

function rowNames(
  rows: readonly (NormalizedPerformance & { sequence: number })[],
): string[] {
  return rows.map((row) => row.recorded_nick)
}

describe('buildMatchReport team modeling', () => {
  it('sorts teams by participant count, then by stable Chinese numeric collation', () => {
    const teamRows = (leaderNick: string | null, count: number, prefix: string) =>
      Array.from({ length: count }, (_, index) =>
        performance({
          leader_nick: leaderNick,
          recorded_nick: `${prefix}${index + 1}`,
          row_id: `${prefix}-${index + 1}`,
        }),
      )
    const rows = [
      ...teamRows('张三', 3, '张三成员'),
      ...teamRows('团长10', 2, '十团成员'),
      ...teamRows('团长2', 2, '二团成员'),
      ...teamRows('团长02', 2, '零二团成员'),
      ...teamRows('李四', 1, '李四成员'),
      ...teamRows('阿一', 1, '阿一成员'),
      ...teamRows(null, 5, '散人成员'),
    ]

    const report = buildMatchReport(input(rows))

    expect(report.teams.map((team) => team.leaderNick)).toEqual([
      '张三',
      '团长02',
      '团长2',
      '团长10',
      '阿一',
      '李四',
      '未分团',
    ])
    expect(report.teams.map((team) => team.participantCount)).toEqual([3, 2, 2, 2, 1, 1, 5])
    expect(report.teams.map((team) => team.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('normalizes empty or no-leader values while preserving a real leader named 未分团', () => {
    const rows = [
      performance({ leader_nick: null, recorded_nick: '空值', row_id: 'null' }),
      performance({ leader_nick: '', recorded_nick: '空串', row_id: 'empty' }),
      performance({ leader_nick: '   ', recorded_nick: '空白', row_id: 'space' }),
      performance({ leader_nick: '无', recorded_nick: '无团', row_id: 'none' }),
      performance({ leader_nick: '未分团', recorded_nick: '已有标签', row_id: 'label' }),
      performance({ leader_nick: '正常团长', recorded_nick: '正常成员', row_id: 'normal' }),
    ]

    const report = buildMatchReport(input(rows))
    const unassigned = report.teams.at(-1)
    const namedUnassigned = report.teams.find(
      (team) => !team.isUnassigned && team.leaderNick === '未分团',
    )
    const normalTeam = report.teams.find((team) => team.leaderNick === '正常团长')

    expect(report.teams).toHaveLength(3)
    expect(normalTeam).toMatchObject({
      leaderNick: '正常团长',
      isUnassigned: false,
      participantCount: 1,
    })
    expect(namedUnassigned).toMatchObject({
      leaderNick: '未分团',
      isUnassigned: false,
      participantCount: 1,
    })
    expect(unassigned).toMatchObject({
      leaderNick: '未分团',
      isUnassigned: true,
      participantCount: 4,
    })
  })
})

describe('buildMatchReport table modeling', () => {
  it('builds the four tables in the fixed order, filters professions, and sorts each metric descending', () => {
    const rows = [
      performance({
        player_id: 1,
        recorded_nick: 'A',
        row_id: 'A',
        damage_to_players: 100,
        damage_to_structures: 10,
        kills: 5,
      }),
      performance({
        player_id: 2,
        recorded_nick: 'B',
        row_id: 'B',
        damage_to_players: 50,
        damage_to_structures: 100,
        kills: 1,
      }),
      performance({
        player_id: 3,
        recorded_nick: 'C',
        row_id: 'C',
        damage_to_players: 100,
        damage_to_structures: 50,
        kills: 9,
      }),
      performance({
        player_id: 4,
        recorded_nick: '奶妈2',
        row_id: 'H2',
        profession_name: '素问',
        healing_amount: 500,
        damage_to_players: 99_999,
        damage_to_structures: 99_999,
        kills: 99,
      }),
      performance({
        player_id: 5,
        recorded_nick: '奶妈1',
        row_id: 'H1',
        profession_name: '素问',
        healing_amount: 800,
      }),
    ]

    const tables = buildMatchReport(input(rows)).teams[0]?.tables

    expect(tables?.map(({ kind, sortKey }) => ({ kind, sortKey }))).toEqual([
      { kind: 'playerDamage', sortKey: 'damage_to_players' },
      { kind: 'structureDamage', sortKey: 'damage_to_structures' },
      { kind: 'kills', sortKey: 'kills' },
      { kind: 'healing', sortKey: 'healing_amount' },
    ])
    expect(rowNames(tables?.[0]?.rows ?? [])).toEqual(['A', 'C', 'B'])
    expect(rowNames(tables?.[1]?.rows ?? [])).toEqual(['B', 'C', 'A'])
    expect(rowNames(tables?.[2]?.rows ?? [])).toEqual(['C', 'A', 'B'])
    expect(rowNames(tables?.[3]?.rows ?? [])).toEqual(['奶妈1', '奶妈2'])
    expect(tables?.slice(0, 3).every((table) =>
      table.rows.every((row) => row.profession_name !== '素问'),
    )).toBe(true)
    expect(tables?.[3]?.rows.every((row) => row.profession_name === '素问')).toBe(true)
    for (const table of tables ?? []) {
      expect(table.rows.map((row) => row.sequence)).toEqual(
        table.rows.map((_, index) => index + 1),
      )
    }
  })

  it('uses localized numeric nick ordering, raw-string fallback, and input order for exact ties', () => {
    const rows = [
      performance({ player_id: 10, recorded_nick: '玩家10', row_id: 'ten' }),
      performance({ player_id: 20, recorded_nick: '玩家2', row_id: 'two-first' }),
      performance({ player_id: 21, recorded_nick: '玩家2', row_id: 'two-second' }),
      performance({ player_id: 2, recorded_nick: '玩家02', row_id: 'zero-two' }),
    ].map((row) => ({
      ...row,
      damage_to_players: 100,
      damage_to_structures: 100,
      kills: 10,
    }))

    const tables = buildMatchReport(input(rows)).teams[0]?.tables.slice(0, 3) ?? []

    for (const table of tables) {
      expect(rowNames(table.rows)).toEqual(['玩家02', '玩家2', '玩家2', '玩家10'])
      expect(table.rows.map((row) => row.player_id)).toEqual([2, 20, 21, 10])
    }
  })

  it('keeps a correctly labeled empty healing table when a team has no Suwen', () => {
    const team = buildMatchReport(input([
      performance({ recorded_nick: '唯一输出', row_id: 'only' }),
    ])).teams[0]
    const healing = team?.tables[3]

    expect(team?.tables).toHaveLength(4)
    expect(healing).toMatchObject({
      kind: 'healing',
      title: '治疗量表',
      sortKey: 'healing_amount',
      emptyMessage: '本团无素问参赛数据',
      rows: [],
    })
    expect(Object.values(healing?.maxValues ?? {}).every((value) => value === 0)).toBe(true)
  })

  it('computes bar maxima from each table\'s own filtered rows', () => {
    const rows = [
      performance({
        recorded_nick: '输出一',
        row_id: 'dps-1',
        kda: 2,
        total_damage: 100,
        kills: 7,
        assists: 9,
        damage_to_players: 100,
        damage_to_structures: 4,
        damage_taken: 50,
        serious_injuries: 1,
        healing_amount: 900,
        skill_huayu: 1,
        skill_qingdeng: 3,
        control_count: 8,
        war_resources: 6,
      }),
      performance({
        recorded_nick: '输出二',
        row_id: 'dps-2',
        kda: 3,
        total_damage: 80,
        kills: 4,
        assists: 10,
        damage_to_players: 80,
        damage_to_structures: 200,
        damage_taken: 20,
        serious_injuries: 2,
        healing_amount: 999,
        skill_huayu: 2,
        skill_qingdeng: 2,
        control_count: 4,
        war_resources: 7,
      }),
      performance({
        recorded_nick: '治疗',
        row_id: 'healer',
        profession_name: '素问',
        kda: 9,
        total_damage: 999,
        kills: 99,
        assists: 5,
        damage_to_players: 1_000,
        damage_to_structures: 2_000,
        damage_taken: 10,
        serious_injuries: 4,
        healing_amount: 300,
        skill_huayu: 11,
        skill_qingdeng: 12,
        control_count: 13,
        war_resources: 14,
      }),
    ]

    const tables = buildMatchReport(input(rows)).teams[0]?.tables
    const damageMaxima = {
      kda: 3,
      total_damage: 100,
      kills: 7,
      assists: 10,
      damage_to_players: 100,
      damage_to_structures: 200,
      damage_taken: 50,
      serious_injuries: 2,
      healing_amount: 999,
      skill_huayu: 2,
      skill_qingdeng: 3,
      control_count: 8,
      war_resources: 7,
    }

    expect(tables?.[0]?.maxValues).toMatchObject(damageMaxima)
    expect(tables?.[1]?.maxValues).toMatchObject(damageMaxima)
    expect(tables?.[2]?.maxValues).toMatchObject(damageMaxima)
    expect(tables?.[3]?.maxValues).toMatchObject({
      kda: 9,
      total_damage: 999,
      kills: 99,
      assists: 5,
      damage_to_players: 1_000,
      damage_to_structures: 2_000,
      damage_taken: 10,
      serious_injuries: 4,
      healing_amount: 300,
      skill_huayu: 11,
      skill_qingdeng: 12,
      control_count: 13,
      war_resources: 14,
    })
  })

  it('uses the fixed public export columns in the required order', () => {
    const report = buildMatchReport(input([
      performance({ row_id: 'columns' }),
    ]))

    expect(report.columns.map((column) => column.key)).toEqual([
      'sequence',
      'recorded_nick',
      'profession_name',
      'leader_nick',
      'total_combat_power',
      'kda',
      'total_damage',
      'kills',
      'assists',
      'damage_to_players',
      'damage_to_structures',
      'damage_taken',
      'serious_injuries',
      'healing_amount',
      'skill_huayu',
      'skill_qingdeng',
      'control_count',
      'war_resources',
    ])
  })
})

describe('buildMatchReport safety and validation', () => {
  it('parses guilds, timestamp, outcome, and note from a real match filename', () => {
    const report = buildMatchReport(input([performance()], {
      matchName: '十月唱晚vs对手_2026_08_23_20_00_00.csv',
      homeOutcome: 'lose',
      note: '  决赛记录  ',
    }))

    expect(report.metadata).toMatchObject({
      matchName: '十月唱晚vs对手_2026_08_23_20_00_00.csv',
      homeGuild: '十月唱晚',
      awayGuild: '对手',
      matchup: '十月唱晚 vs 对手',
      matchTime: '2026年08月23日 20:00:00',
      homeOutcome: 'lose',
      outcomeLabel: '败北',
      note: '决赛记录',
    })
  })

  it('does not mutate the input array or rows and returns independent row objects', () => {
    const first = Object.freeze(performance({
      player_id: 1,
      recorded_nick: '较低',
      row_id: 'low',
      damage_to_players: 1,
    }))
    const second = Object.freeze(performance({
      player_id: 2,
      recorded_nick: '较高',
      row_id: 'high',
      damage_to_players: 2,
    }))
    const rows = Object.freeze([first, second])
    const before = JSON.stringify(rows)

    const report = buildMatchReport(input(rows))

    expect(JSON.stringify(rows)).toBe(before)
    expect(rows.map((row) => row.recorded_nick)).toEqual(['较低', '较高'])
    for (const table of report.teams[0]?.tables ?? []) {
      for (const reportRow of table.rows) {
        expect(rows.includes(reportRow)).toBe(false)
      }
    }
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid matchId %s',
    (matchId) => {
      expect(() => buildMatchReport(input([performance()], { matchId }))).toThrow()
    },
  )

  it.each(['', '   '])('rejects an empty matchName %#', (matchName) => {
    expect(() => buildMatchReport(input([performance()], { matchName }))).toThrow()
  })

  it('rejects missing, non-array, or empty performance data', () => {
    const valid = input([performance()])

    expect(() => buildMatchReport({
      ...valid,
      homePerformances: null as unknown as readonly NormalizedPerformance[],
    })).toThrow()
    expect(() => buildMatchReport({
      ...valid,
      homePerformances: {} as unknown as readonly NormalizedPerformance[],
    })).toThrow()
    expect(() => buildMatchReport(input([]))).toThrow()
  })

  it('rejects rows that do not belong to the selected match', () => {
    expect(() => buildMatchReport(input([
      performance({ match_id: MATCH_ID + 1 }),
    ]))).toThrow()
  })

  it('rejects an unsupported outcome but accepts a missing outcome and note', () => {
    expect(() => buildMatchReport(input([performance()], {
      homeOutcome: 'draw' as unknown as MatchReportInput['homeOutcome'],
    }))).toThrow()

    const report = buildMatchReport(input([performance()], {
      homeOutcome: null,
      note: null,
    }))
    expect(report.metadata).toMatchObject({
      homeOutcome: null,
      note: '',
    })
  })
})
