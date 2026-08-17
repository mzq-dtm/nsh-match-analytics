<template>
  <main class="admin-import-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">管理员操作</p>
        <h1>导入联赛数据</h1>
        <p class="intro">
          先上传并预检文件，确认异常昵称对应的玩家 ID 后再写入数据库；比赛时间必须晚于数据库中的最新比赛。
        </p>
      </div>
      <RouterLink to="/match" class="back-link">返回联赛数据</RouterLink>
    </header>

    <section class="panel">
      <h2>1. 上传数据</h2>
      <form class="upload-form" @submit.prevent="runPreview">
        <label class="field">
          <span>本帮帮会名</span>
          <input v-model.trim="targetGuild" required :disabled="isBusy || !!preview" />
        </label>

        <fieldset class="outcome-field" :disabled="isBusy">
          <legend>本帮比赛结果</legend>
          <label><input v-model="homeOutcome" type="radio" value="win" /> 胜利</label>
          <label><input v-model="homeOutcome" type="radio" value="lose" /> 败北</label>
        </fieldset>

        <label class="field field-wide">
          <span>备注</span>
          <input v-model.trim="note" :disabled="isBusy" placeholder="可选" />
        </label>

        <label class="file-field">
          <span>联赛数据 CSV</span>
          <input
            ref="matchInput"
            type="file"
            accept=".csv,text/csv"
            required
            :disabled="isBusy || !!preview"
            @change="matchFile = getSelectedFile($event)"
          />
          <small>
            文件名必须包含 YYYY_MM_DD_HH_MM_SS 时间戳；预检后如需更换，请先清空。
          </small>
        </label>

        <label class="file-field">
          <span>帮会成员 CSV</span>
          <input
            ref="personalInput"
            type="file"
            accept=".csv,text/csv"
            required
            :disabled="isBusy || !!preview"
            @change="personalFile = getSelectedFile($event)"
          />
          <small>用于补充装评、修为、修炼和总战力；预检后如需更换，请先清空。</small>
        </label>

        <div class="form-actions field-wide">
          <button
            class="primary-button"
            type="submit"
            :disabled="isBusy || !!preview || !canPreview"
          >
            {{ previewing ? '正在预检…' : '预检数据' }}
          </button>
          <button type="button" class="secondary-button" :disabled="isBusy" @click="resetPage">
            清空
          </button>
        </div>
      </form>
    </section>

    <p v-if="errorMessage" class="message error-message" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="message success-message" role="status">
      {{ successMessage }}
    </p>

    <section v-if="preview" class="panel preview-panel">
      <h2>2. 检查预检结果</h2>
      <dl class="summary-grid">
        <div><dt>比赛名称</dt><dd>{{ preview.match_name }}</dd></div>
        <div><dt>比赛时间</dt><dd>{{ preview.match_time }}</dd></div>
        <div><dt>本帮</dt><dd>{{ preview.home_guild }}（{{ preview.home_count }} 人）</dd></div>
        <div><dt>对方</dt><dd>{{ preview.opponent_guild }}（{{ preview.opponent_count }} 人）</dd></div>
      </dl>

      <div v-if="preview.prompt_items.length" class="resolution-section">
        <div class="section-heading">
          <h3>需要确认的玩家 ID</h3>
          <span>{{ preview.prompt_items.length }} 项</span>
        </div>
        <p class="hint">长期未参赛的玩家已预填原 ID；确认不是同一玩家时请修改。</p>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>昵称</th>
                <th>原因</th>
                <th>原玩家 ID</th>
                <th>确认后的玩家 ID</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in preview.prompt_items" :key="item.nickname">
                <td>{{ item.nickname }}</td>
                <td>{{ promptReason(item) }}</td>
                <td>{{ item.existing_id ?? '—' }}</td>
                <td>
                  <input
                    v-model.trim="playerIds[item.nickname]"
                    class="id-input"
                    inputmode="numeric"
                    pattern="[0-9]+"
                    :aria-label="`${item.nickname}的玩家 ID`"
                    :disabled="isBusy"
                    placeholder="请输入数字 ID"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="ready-box">所有本帮玩家昵称均已匹配，可以直接提交。</div>

      <div class="commit-area">
        <p>提交后会在一个事务中写入比赛、胜负、双方战绩和昵称历史。</p>
        <button
          class="danger-button"
          type="button"
          :disabled="isBusy || !canCommit"
          @click="commitImport"
        >
          {{ committing ? '正在写入数据库…' : '确认并导入' }}
        </button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  commitMatchImport,
  previewMatchImport,
  type ImportPreview,
  type ImportPromptItem,
} from '@/api/admin'

const targetGuild = ref('十月唱晚')
const homeOutcome = ref<'win' | 'lose'>('win')
const note = ref('')
const matchFile = ref<File | null>(null)
const personalFile = ref<File | null>(null)
const matchInput = ref<HTMLInputElement | null>(null)
const personalInput = ref<HTMLInputElement | null>(null)

const preview = ref<ImportPreview | null>(null)
const playerIds = ref<Record<string, string>>({})
const previewing = ref(false)
const committing = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const isBusy = computed(() => previewing.value || committing.value)
const canPreview = computed(
  () => !!targetGuild.value && !!homeOutcome.value && !!matchFile.value && !!personalFile.value,
)
const canCommit = computed(() => {
  if (!preview.value) return false
  return preview.value.prompt_items.every((item) => /^\d+$/.test(playerIds.value[item.nickname] || ''))
})

function getSelectedFile(event: Event): File | null {
  return (event.target as HTMLInputElement).files?.[0] ?? null
}

function promptReason(item: ImportPromptItem): string {
  if (item.reason === 'not_found') return '数据库中没有有效昵称记录'
  return `距上次参赛 ${item.days_diff ?? 0} 天（${item.last_time ?? '未知'}）`
}

function clearMessages(): void {
  errorMessage.value = ''
  successMessage.value = ''
}

async function runPreview(): Promise<void> {
  if (!matchFile.value || !personalFile.value) return
  clearMessages()
  preview.value = null
  playerIds.value = {}
  previewing.value = true

  const formData = new FormData()
  formData.append('target_guild', targetGuild.value)
  formData.append('match_file', matchFile.value)
  formData.append('personal_file', personalFile.value)

  try {
    const result = await previewMatchImport(formData)
    preview.value = result
    playerIds.value = Object.fromEntries(
      result.prompt_items.map((item) => [
        item.nickname,
        item.existing_id == null ? '' : String(item.existing_id),
      ]),
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '预检失败'
  } finally {
    previewing.value = false
  }
}

async function commitImport(): Promise<void> {
  if (!preview.value || !canCommit.value) return
  clearMessages()
  committing.value = true

  try {
    const submittedIds = Object.fromEntries(
      Object.entries(playerIds.value).map(([nickname, id]) => [nickname, id.trim()]),
    )
    const result = await commitMatchImport(
      preview.value.token,
      submittedIds,
      homeOutcome.value,
      note.value,
    )
    successMessage.value = `导入成功：${result.match_name}，本帮 ${result.home_count} 条，对方 ${result.opponent_count} 条。`
    preview.value = null
    playerIds.value = {}
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '导入失败'
  } finally {
    committing.value = false
  }
}

function resetPage(): void {
  clearMessages()
  preview.value = null
  playerIds.value = {}
  note.value = ''
  matchFile.value = null
  personalFile.value = null
  if (matchInput.value) matchInput.value.value = ''
  if (personalInput.value) personalInput.value.value = ''
}
</script>

<style scoped>
.admin-import-page {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 0.25rem 0.5rem 2rem;
  color: #243129;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 2rem;
  align-items: flex-start;
  max-width: 1100px;
  margin: 0 auto 1rem;
}

.eyebrow {
  margin: 0 0 0.25rem;
  color: #278a5a;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.4rem;
}

.intro,
.hint,
.commit-area p {
  color: #68756d;
}

.back-link {
  flex: none;
  margin-top: 0.5rem;
  color: #287d55;
}

.panel,
.message {
  max-width: 1100px;
  margin: 0 auto 1rem;
  box-sizing: border-box;
  border: 1px solid #dce4df;
  border-radius: 10px;
  background: #fff;
  padding: 1.25rem;
  box-shadow: 0 4px 18px rgb(31 67 47 / 7%);
}

.upload-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.25rem;
}

.field,
.file-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-weight: 600;
}

.field-wide,
.form-actions {
  grid-column: 1 / -1;
}

input[type='text'],
.field input,
.id-input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #bcc9c1;
  border-radius: 6px;
  padding: 0.62rem 0.7rem;
  font: inherit;
}

.file-field {
  padding: 0.9rem;
  border: 1px dashed #a9bcb0;
  border-radius: 8px;
  background: #f8fbf9;
}

.file-field small {
  color: #748078;
  font-weight: 400;
}

.outcome-field {
  display: flex;
  gap: 1.25rem;
  align-items: center;
  border: 1px solid #dce4df;
  border-radius: 8px;
}

.outcome-field legend {
  font-weight: 600;
}

.form-actions,
.commit-area {
  display: flex;
  gap: 0.75rem;
  align-items: center;
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

.danger-button {
  background: #b43a32;
  color: #fff;
}

.message {
  padding: 0.85rem 1.1rem;
}

.error-message {
  border-color: #e3aaa6;
  background: #fff3f2;
  color: #9b2f28;
}

.success-message,
.ready-box {
  border-color: #9fd2b4;
  background: #effaf3;
  color: #247044;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.summary-grid div {
  border-radius: 7px;
  background: #f5f8f6;
  padding: 0.8rem;
}

.summary-grid dt {
  color: #748078;
  font-size: 0.82rem;
}

.summary-grid dd {
  margin: 0.25rem 0 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.resolution-section {
  margin-top: 1.25rem;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-heading span {
  border-radius: 999px;
  background: #f1e7cf;
  padding: 0.2rem 0.65rem;
  color: #775b22;
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

.id-input {
  min-width: 190px;
}

.ready-box {
  margin-top: 1.25rem;
  border: 1px solid;
  border-radius: 7px;
  padding: 0.9rem;
}

.commit-area {
  justify-content: space-between;
  margin-top: 1.25rem;
  border-top: 1px solid #e0e7e2;
  padding-top: 1rem;
}

.commit-area p {
  margin-bottom: 0;
}

@media (max-width: 720px) {
  .page-header,
  .commit-area {
    align-items: stretch;
    flex-direction: column;
  }

  .upload-form,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .field-wide,
  .form-actions {
    grid-column: auto;
  }
}
</style>
