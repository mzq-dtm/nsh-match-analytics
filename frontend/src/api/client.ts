export async function getJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, options)

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }

  return res.json() as Promise<T>
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(body),
    ...options,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }

  return res.json() as Promise<T>
}
