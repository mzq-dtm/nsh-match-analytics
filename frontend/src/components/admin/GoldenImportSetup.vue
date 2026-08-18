<template>
  <section class="panel golden-setup">
    <div class="section-heading">
      <div>
        <p class="eyebrow">黄金畅玩服</p>
        <h2>2. 确认真实团队团长</h2>
      </div>
      <span>{{ analysis.divisions.length }} 个分堂</span>
    </div>

    <p class="hint">
      已根据分堂主和总战力生成默认名单。你可以更换、新增或删除团长；每名团长只能管辖一个分堂，一个分堂也只能对应一名团长。
    </p>

    <ul v-if="analysis.warnings.length" class="warning-list">
      <li v-for="warning in analysis.warnings" :key="warning">{{ warning }}</li>
    </ul>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>团队团长</th>
            <th>管辖分堂</th>
            <th>当前依据</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="config in leaderConfigs" :key="config.id">
            <td>
              <select
                v-model="config.leaderNickname"
                :disabled="disabled"
                @change="onLeaderChanged(config)"
              >
                <option value="" disabled>请选择参赛玩家</option>
                <option
                  v-for="candidate in analysis.leaderCandidates"
                  :key="candidate.nickname"
                  :value="candidate.nickname"
                  :disabled="isLeaderUsedByOther(candidate.nickname, config.id)"
                >
                  {{ candidate.nickname }}（{{ candidate.division ?? '分堂未知' }}）
                </option>
              </select>
            </td>
            <td>
              <select
                v-model="config.division"
                :disabled="disabled"
                @change="config.source = 'manual'"
              >
                <option value="" disabled>请选择分堂</option>
                <option
                  v-for="division in analysis.divisions"
                  :key="division"
                  :value="division"
                  :disabled="isDivisionUsedByOther(division, config.id)"
                >
                  {{ division }}
                </option>
              </select>
            </td>
            <td>{{ sourceLabel(config.source) }}</td>
            <td>
              <button
                type="button"
                class="remove-button"
                :disabled="disabled"
                @click="removeLeader(config.id)"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="form-actions leader-actions">
      <button type="button" class="secondary-button" :disabled="disabled" @click="addLeader">
        新增团长
      </button>
      <button
        type="button"
        class="primary-button"
        :disabled="disabled || !!leaderConfigError"
        @click="calculateTeams"
      >
        确认团长并计算小队归属
      </button>
    </div>

    <p v-if="leaderConfigError" class="inline-error" role="alert">{{ leaderConfigError }}</p>
    <p v-if="localError" class="inline-error" role="alert">{{ localError }}</p>

    <template v-if="inference">
      <div class="section-heading squad-heading">
        <div>
          <h2>3. 检查小队归属</h2>
          <p class="hint">
            已自动确定 {{ inference.automaticAssignments.length }} 个小队，待人工选择
            {{ inference.pendingTeams.length }} 个；原“所在团长”为“无”的
            {{ inference.noLeaderPlayerCount }} 人保持不变。
          </p>
        </div>
      </div>

      <details v-if="inference.automaticAssignments.length" class="automatic-details">
        <summary>查看自动确定的小队</summary>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>原小队长</th>
                <th>人数</th>
                <th>推断分堂</th>
                <th>真实团长</th>
                <th>依据</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="team in inference.automaticAssignments" :key="team.originalLeader">
                <td>{{ team.originalLeader }}</td>
                <td>{{ team.members.length }}</td>
                <td>{{ team.division }}</td>
                <td>{{ team.leaderNickname }}</td>
                <td>{{ automaticReasonLabel(team.reason) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <div v-if="inference.pendingTeams.length" class="pending-list">
        <article
          v-for="team in inference.pendingTeams"
          :key="team.originalLeader"
          class="pending-card"
        >
          <div class="pending-header">
            <div>
              <h3>原小队长：{{ team.originalLeader }}</h3>
              <p>{{ pendingReasonLabel(team) }}</p>
            </div>
            <label>
              <span>选择真实团长</span>
              <select
                v-model="manualAssignments[team.originalLeader]"
                :disabled="disabled"
                @change="finalizationError = ''"
              >
                <option value="" disabled>请选择</option>
                <option
                  v-for="config in leaderConfigs"
                  :key="config.id"
                  :value="config.leaderNickname"
                >
                  {{ config.leaderNickname }}（{{ config.division }}）
                </option>
              </select>
            </label>
          </div>

          <div class="table-wrap">
            <table class="member-table">
              <thead>
                <tr>
                  <th>玩家</th>
                  <th>当场职业</th>
                  <th>成员表分堂</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="member in team.members" :key="member.nickname">
                  <td>{{ member.nickname }}</td>
                  <td>{{ member.profession }}</td>
                  <td>{{ member.division ?? '未匹配' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div v-else class="ready-box">所有小队均已自动确定真实团长，无需人工分配。</div>

      <p v-if="finalizationError" class="inline-error finalization-error" role="alert">
        {{ finalizationError }}
      </p>

      <div class="submit-area">
        <p>确认后只会改写本帮数据的“所在团长”；对方帮会数据保持原样。</p>
        <button
          type="button"
          class="primary-button"
          :disabled="disabled || !canSubmit"
          @click="submitRewrittenCsv"
        >
          生成结果并进入后端预检
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  finalizeGoldenLeaderAssignments,
  inferGoldenTeamAssignments,
  validateLeaderDivisionConfigs,
  type GoldenImportAnalysis,
  type GoldenTeamInference,
  type LeaderDivisionConfig,
  type PendingSmallTeam,
  type RecommendationReason,
} from '@/features/admin-import/adaptiveImport'

interface EditableLeaderConfig extends LeaderDivisionConfig {
  id: number
  source: RecommendationReason | 'manual'
}

const props = defineProps<{
  analysis: GoldenImportAnalysis
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [csvText: string]
}>()

let nextConfigId = 1
const leaderConfigs = ref<EditableLeaderConfig[]>(
  props.analysis.recommendations.map((recommendation) => ({
    id: nextConfigId++,
    leaderNickname: recommendation.leaderNickname,
    division: recommendation.division,
    source: recommendation.reason,
  })),
)
const inference = ref<GoldenTeamInference | null>(null)
const manualAssignments = ref<Record<string, string>>({})
const localError = ref('')
const finalizationError = ref('')

const coreConfigs = computed<LeaderDivisionConfig[]>(() =>
  leaderConfigs.value.map(({ leaderNickname, division }) => ({ leaderNickname, division })),
)

const leaderConfigError = computed(() => {
  try {
    validateLeaderDivisionConfigs(props.analysis, coreConfigs.value)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : '团长配置无效'
  }
})

const canSubmit = computed(() => {
  if (!inference.value || leaderConfigError.value) return false
  const validLeaders = new Set(coreConfigs.value.map((config) => config.leaderNickname))
  return inference.value.pendingTeams.every((team) =>
    validLeaders.has(manualAssignments.value[team.originalLeader] ?? ''),
  )
})

watch(
  leaderConfigs,
  () => {
    inference.value = null
    manualAssignments.value = {}
    localError.value = ''
    finalizationError.value = ''
  },
  { deep: true },
)

function sourceLabel(source: EditableLeaderConfig['source']): string {
  if (source === 'division_master') return '参赛分堂主'
  if (source === 'highest_power') return '分堂参赛者中总战力最高'
  return '管理员调整'
}

function automaticReasonLabel(reason: 'configured_leader_team' | 'division_consensus'): string {
  return reason === 'configured_leader_team' ? '所选团长所在小队' : '至少 4 人来自同一堂'
}

function pendingReasonLabel(team: PendingSmallTeam): string {
  if (team.reason === 'member_count_lt_4') return `小队只有 ${team.members.length} 人，需人工确定`
  if (team.reason === 'division_without_leader') {
    return `多数成员来自 ${team.inferredDivision ?? '未知分堂'}，但该分堂没有配置团长`
  }
  const distribution = team.divisionCounts.length
    ? team.divisionCounts.map((item) => `${item.division} ${item.count} 人`).join('，')
    : '没有可用分堂信息'
  return `没有任何分堂达到 4 人（${distribution}）`
}

function isLeaderUsedByOther(nickname: string, configId: number): boolean {
  return leaderConfigs.value.some(
    (config) => config.id !== configId && config.leaderNickname === nickname,
  )
}

function isDivisionUsedByOther(division: string, configId: number): boolean {
  return leaderConfigs.value.some(
    (config) => config.id !== configId && config.division === division,
  )
}

function onLeaderChanged(config: EditableLeaderConfig): void {
  const candidate = props.analysis.leaderCandidates.find(
    (item) => item.nickname === config.leaderNickname,
  )
  config.division = candidate?.division ?? ''
  config.source = 'manual'
}

function addLeader(): void {
  leaderConfigs.value.push({
    id: nextConfigId++,
    leaderNickname: '',
    division: '',
    source: 'manual',
  })
}

function removeLeader(id: number): void {
  leaderConfigs.value = leaderConfigs.value.filter((config) => config.id !== id)
}

function calculateTeams(): void {
  localError.value = ''
  finalizationError.value = ''
  try {
    const result = inferGoldenTeamAssignments(props.analysis, coreConfigs.value)
    inference.value = result
    manualAssignments.value = Object.fromEntries(
      result.pendingTeams.map((team) => [team.originalLeader, '']),
    )
  } catch (error) {
    localError.value = error instanceof Error ? error.message : '无法计算小队归属'
  }
}

function submitRewrittenCsv(): void {
  if (!canSubmit.value) return
  finalizationError.value = ''
  try {
    const result = finalizeGoldenLeaderAssignments(
      props.analysis,
      coreConfigs.value,
      manualAssignments.value,
    )
    emit('submit', result.csvText)
  } catch (error) {
    finalizationError.value = error instanceof Error ? error.message : '生成联赛数据失败'
  }
}
</script>

<style scoped>
.panel {
  max-width: 1100px;
  margin: 0 auto 1rem;
  box-sizing: border-box;
  border: 1px solid #dce4df;
  border-radius: 10px;
  background: #fff;
  padding: 1.25rem;
  box-shadow: 0 4px 18px rgb(31 67 47 / 7%);
}

.eyebrow,
h2,
h3,
p {
  margin-top: 0;
}

.eyebrow {
  margin-bottom: 0.25rem;
  color: #a36a12;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.hint,
.submit-area p,
.pending-header p {
  color: #68756d;
}

.section-heading,
.pending-header,
.submit-area {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.section-heading > span {
  flex: none;
  border-radius: 999px;
  background: #f1e7cf;
  padding: 0.2rem 0.65rem;
  color: #775b22;
}

.warning-list,
.inline-error {
  border: 1px solid #e7c47c;
  border-radius: 7px;
  background: #fff8e7;
  color: #795816;
  padding: 0.75rem 1rem;
}

.warning-list {
  padding-left: 2rem;
}

.inline-error {
  border-color: #e3aaa6;
  background: #fff3f2;
  color: #9b2f28;
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid #e1e7e3;
  padding: 0.7rem;
  text-align: left;
  white-space: nowrap;
}

th {
  background: #f6f8f7;
}

select {
  box-sizing: border-box;
  min-width: 190px;
  width: 100%;
  border: 1px solid #bcc9c1;
  border-radius: 6px;
  padding: 0.58rem 0.65rem;
  background: #fff;
  font: inherit;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 0.68rem 1.2rem;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.primary-button {
  background: #268957;
  color: #fff;
}

.secondary-button {
  background: #e8eeea;
  color: #34463b;
}

.remove-button {
  padding: 0.55rem 0.8rem;
  background: #f7e5e3;
  color: #9b2f28;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.leader-actions,
.squad-heading,
.automatic-details,
.pending-list,
.finalization-error,
.submit-area {
  margin-top: 1.25rem;
}

.automatic-details {
  border: 1px solid #dce4df;
  border-radius: 7px;
  padding: 0.8rem;
}

.automatic-details summary {
  cursor: pointer;
  font-weight: 700;
}

.pending-list {
  display: grid;
  gap: 1rem;
}

.pending-card {
  border: 1px solid #e1d4b5;
  border-radius: 8px;
  padding: 1rem;
  background: #fffdf8;
}

.pending-header label {
  display: flex;
  min-width: 260px;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
}

.ready-box {
  margin-top: 1.25rem;
  border: 1px solid #9fd2b4;
  border-radius: 7px;
  background: #effaf3;
  color: #247044;
  padding: 0.9rem;
}

.submit-area {
  align-items: center;
  border-top: 1px solid #e0e7e2;
  padding-top: 1rem;
}

.submit-area p {
  margin-bottom: 0;
}

@media (max-width: 720px) {
  .section-heading,
  .pending-header,
  .submit-area,
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
