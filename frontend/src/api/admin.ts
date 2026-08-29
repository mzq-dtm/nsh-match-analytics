export interface ImportPromptItem {
  nickname: string
  reason: 'not_found' | 'inactive'
  existing_id: string | null
  last_time: string | null
  days_diff: number | null
}

export interface ImportPreview {
  token: string
  expires_in: number
  match_name: string
  match_time: string
  home_guild: string
  opponent_guild: string
  home_count: number
  opponent_count: number
  prompt_items: ImportPromptItem[]
}

export interface ImportCommitResult {
  match_id: number
  match_name: string
  home_count: number
  opponent_count: number
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new Error(data.error || `请求失败（HTTP ${response.status}）`)
  }
  return data as T
}

export async function previewMatchImport(formData: FormData): Promise<ImportPreview> {
  const response = await fetch('/admin-api/import/preview', {
    method: 'POST',
    body: formData,
  })
  return parseResponse<ImportPreview>(response)
}

export async function commitMatchImport(
  token: string,
  playerIds: Record<string, string>,
  homeOutcome: 'win' | 'lose',
  note: string,
): Promise<ImportCommitResult> {
  const response = await fetch('/admin-api/import/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      player_ids: playerIds,
      home_outcome: homeOutcome,
      note,
    }),
  })
  return parseResponse<ImportCommitResult>(response)
}
