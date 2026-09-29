// OpenAI Chat Completions 共享传输（四源共用——descriptor 只换 baseURL + model）

export type ValidateError =
  'key-invalid' | 'service-error' | 'timeout' | 'network' | 'region-blocked' | `http-${number}`

export async function postChatCompletions(
  baseURL: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  return fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/** GET /models → id 列表；失败抛错（调用方兜底 fallback） */
export async function listModels(
  baseURL: string,
  apiKey: string,
  timeoutMs = 15000,
): Promise<string[]> {
  const res = await fetch(`${baseURL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`models: http-${res.status}`)
  const j = (await res.json()) as { data?: Array<{ id?: string }> }
  return (j.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
}

/** 校验响应分类——403/RegionError 单独成 region-blocked，不混成 key-invalid */
export async function classifyValidateResponse(res: Response): Promise<{
  ok: boolean
  error?: ValidateError
}> {
  if (res.ok) return { ok: true }
  if (res.status === 401) return { ok: false, error: 'key-invalid' }
  if (res.status === 403) {
    const body = await res.text().catch(() => '')
    if (/RegionError|opt\s*in|workspace\/wrk_/i.test(body)) {
      return { ok: false, error: 'region-blocked' }
    }
    return { ok: false, error: 'http-403' }
  }
  if (res.status >= 500) return { ok: false, error: 'service-error' }
  return { ok: false, error: `http-${res.status}` }
}

export function classifyFetchError(e: unknown): ValidateError {
  if (e instanceof DOMException && e.name === 'TimeoutError') return 'timeout'
  return 'network'
}
