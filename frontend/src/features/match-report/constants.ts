import {
  BAR_COLORS,
} from '@/features/match-records/constants'
import type {
  MatchReportBarKey,
  MatchReportColumn,
  MatchReportTableDefinition,
} from '@/features/match-report/types'

export const UNASSIGNED_TEAM_LABEL = '未分团'
export const SUWEN_PROFESSION = '素问'

export const MATCH_REPORT_TABLE_DEFINITIONS = [
  {
    kind: 'playerDamage',
    title: '对玩家伤害表',
    sortKey: 'damage_to_players',
    sortLabel: '对玩家伤害',
    filter: 'nonSuwen',
    emptyMessage: '本团无非素问参赛数据',
  },
  {
    kind: 'structureDamage',
    title: '对建筑伤害表',
    sortKey: 'damage_to_structures',
    sortLabel: '对建筑伤害',
    filter: 'nonSuwen',
    emptyMessage: '本团无非素问参赛数据',
  },
  {
    kind: 'kills',
    title: '击杀数表',
    sortKey: 'kills',
    sortLabel: '击败',
    filter: 'nonSuwen',
    emptyMessage: '本团无非素问参赛数据',
  },
  {
    kind: 'healing',
    title: '治疗量表',
    sortKey: 'healing_amount',
    sortLabel: '治疗值',
    filter: 'suwen',
    emptyMessage: '本团无素问参赛数据',
  },
] as const satisfies readonly MatchReportTableDefinition[]

/** Fixed public export columns. Their widths add up to REPORT_TABLE_WIDTH. */
export const MATCH_REPORT_COLUMNS = [
  { key: 'sequence', label: '序号', width: 70, format: 'integer', align: 'center' },
  { key: 'recorded_nick', label: '昵称', width: 210, format: 'text', align: 'left' },
  {
    key: 'profession_name',
    label: '职业',
    width: 110,
    format: 'text',
    align: 'center',
    professionColor: true,
  },
  { key: 'leader_nick', label: '所在团长', width: 170, format: 'text', align: 'left' },
  { key: 'total_combat_power', label: '总战力', width: 150, format: 'integer', align: 'right' },
  { key: 'kda', label: 'KD', width: 90, format: 'decimal2', align: 'right', barKey: 'kda' },
  {
    key: 'total_damage',
    label: '总伤害',
    width: 170,
    format: 'integer',
    align: 'right',
    barKey: 'total_damage',
  },
  { key: 'kills', label: '击败', width: 100, format: 'integer', align: 'right', barKey: 'kills' },
  { key: 'assists', label: '助攻', width: 100, format: 'integer', align: 'right', barKey: 'assists' },
  {
    key: 'damage_to_players',
    label: '对玩家伤害',
    width: 180,
    format: 'integer',
    align: 'right',
    barKey: 'damage_to_players',
  },
  {
    key: 'damage_to_structures',
    label: '对建筑伤害',
    width: 180,
    format: 'integer',
    align: 'right',
    barKey: 'damage_to_structures',
  },
  {
    key: 'damage_taken',
    label: '承受伤害',
    width: 180,
    format: 'integer',
    align: 'right',
    barKey: 'damage_taken',
  },
  {
    key: 'serious_injuries',
    label: '重伤',
    width: 100,
    format: 'integer',
    align: 'right',
    barKey: 'serious_injuries',
  },
  {
    key: 'healing_amount',
    label: '治疗值',
    width: 170,
    format: 'integer',
    align: 'right',
    barKey: 'healing_amount',
  },
  {
    key: 'skill_huayu',
    label: '化羽',
    width: 100,
    format: 'integer',
    align: 'right',
    barKey: 'skill_huayu',
  },
  {
    key: 'skill_qingdeng',
    label: '青灯焚骨',
    width: 140,
    format: 'integer',
    align: 'right',
    barKey: 'skill_qingdeng',
  },
  {
    key: 'control_count',
    label: '控制',
    width: 100,
    format: 'integer',
    align: 'right',
    barKey: 'control_count',
  },
  {
    key: 'war_resources',
    label: '战备资源',
    width: 140,
    format: 'integer',
    align: 'right',
    barKey: 'war_resources',
  },
] as const satisfies readonly MatchReportColumn[]

export const MATCH_REPORT_BAR_KEYS = [
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
] as const satisfies readonly MatchReportBarKey[]

// This is intentionally the same object used by the on-page match table.
export const MATCH_REPORT_BAR_COLORS = BAR_COLORS

export const MATCH_REPORT_LAYOUT = {
  horizontalMargin: 64,
  topMargin: 56,
  bottomMargin: 56,
  titleFontSize: 44,
  titleLineHeight: 62,
  displayNameFontSize: 30,
  displayNameLineHeight: 46,
  metadataFontSize: 25,
  metadataLineHeight: 38,
  noteFontSize: 24,
  noteLineHeight: 36,
  noteLabelGap: 8,
  headerBottomGap: 34,
  teamBannerHeight: 62,
  teamBannerFontSize: 29,
  tableTitleHeight: 52,
  tableTitleFontSize: 25,
  tableHeaderHeight: 54,
  tableHeaderFontSize: 21,
  rowHeight: 48,
  rowFontSize: 21,
  emptyRowHeight: 66,
  tableGap: 28,
  teamGap: 50,
  cellPadding: 10,
  gridLineWidth: 1,
  sortBorderWidth: 5,
} as const

export const MATCH_REPORT_COLORS = {
  background: '#f4f6fa',
  text: '#1d2433',
  mutedText: '#586174',
  title: '#17213a',
  teamBanner: '#243a63',
  teamBannerText: '#ffffff',
  tableTitle: '#dfe8f7',
  tableHeader: '#edf1f7',
  sortHeader: '#aebfdc',
  sortBorder: '#305b9b',
  rowEven: '#ffffff',
  rowOdd: '#f7f9fc',
  emptyRow: '#fffaf0',
  grid: '#c5ccd8',
} as const

export const MATCH_REPORT_FONT_FAMILY =
  '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'

export const MATCH_REPORT_TABLE_WIDTH = MATCH_REPORT_COLUMNS.reduce(
  (sum, column) => sum + column.width,
  0,
)
export const MATCH_REPORT_IMAGE_WIDTH =
  MATCH_REPORT_TABLE_WIDTH + MATCH_REPORT_LAYOUT.horizontalMargin * 2

export const MATCH_REPORT_MAX_CANVAS_WIDTH = 8192
export const MATCH_REPORT_MAX_CANVAS_HEIGHT = 32767
export const MATCH_REPORT_MAX_CANVAS_AREA = 80_000_000

export const MATCH_REPORT_FILENAME_SUFFIX = '_团队战报.png'
