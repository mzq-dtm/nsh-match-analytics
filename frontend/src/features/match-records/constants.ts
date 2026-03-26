import type {
  AnalysisCheckConfig,
  AnalysisCheckKey,
  BarKey,
  ProfessionAnalysisRule,
} from '@/features/match-records/types'

export const ANALYSIS_CHECKS: Record<AnalysisCheckKey, AnalysisCheckConfig> = {
  kills: { key: 'kills', label: '击败' },
  damage_to_players: { key: 'damage_to_players', label: '对玩家伤害' },
  damage_to_structures: { key: 'damage_to_structures', label: '对建筑伤害' },
  healing_amount: { key: 'healing_amount', label: '治疗量' },
  skill_qingdeng: { key: 'skill_qingdeng', label: '青灯焚骨' },
  control_count: { key: 'control_count', label: '控制' },
}

export const ANALYSIS_PERCENTILE = 0.25
export const SUWEN_ANALYSIS_PERCENTILE = 0.25
export const SUWEN_THRESHOLD_MULTIPLIER = 0.5

export const PROFESSION_ANALYSIS_CONFIG: Record<
  '素问' | '九灵' | '铁衣' | 'default',
  ProfessionAnalysisRule
> = {
  素问: {
    mode: 'all_must_fail',
    checks: ['healing_amount'],
  },
  九灵: {
    mode: 'all_must_fail',
    checks: ['kills', 'damage_to_players', 'damage_to_structures', 'skill_qingdeng'],
  },
  铁衣: {
    mode: 'all_must_fail',
    checks: ['kills', 'damage_to_players', 'damage_to_structures', 'control_count'],
  },
  default: {
    mode: 'all_must_fail',
    checks: ['kills', 'damage_to_players', 'damage_to_structures'],
  },
}

export const BAR_COLORS = {
  red: 'rgba(255,65,65,0.4)',
  blue: 'rgba(24,97,255,0.25)',
  green: 'rgba(66,255,36,0.50)',
  yellow: 'rgba(255,184,23,0.40)',
} as const

export const redKeys = new Set<BarKey>([
  'kda',
  'damage_per_kill',
  'total_damage',
  'kills',
  'assists',
  'damage_to_players',
  'damage_to_structures',
])

export const blueKeys = new Set<BarKey>([
    'war_resources', 
    'skill_qingdeng', 
    'control_count'
])

export const greenKeys = new Set<BarKey>([
    'healing_amount', 
    'skill_huayu'
])

export const yellowKeys = new Set<BarKey>([
    'damage_taken', 
    'serious_injuries'
])
