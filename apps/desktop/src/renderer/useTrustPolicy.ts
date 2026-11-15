// BC-02 信任模式 renderer 镜像（ADR-015 / GitHub #12）
// - main 是权威（trust:get/trust:set）；renderer 只缓存展示与判定用的模式
// - 旧 L4 localStorage 布尔（nf-delegate-lowrisk）一次性迁移：'1' → delegated，否则 standard
// - 设置页与对话面板通过 DOM 事件 nf-trust-changed 实时联动（无第二持久化副本）
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_TRUST_MODE, isTrustMode, type TrustMode } from '../domain/trustMode'

export const LEGACY_DELEGATE_KEY = 'nf-delegate-lowrisk'
export const TRUST_MIGRATION_KEY = 'nf-trust-v2'
export const TRUST_CHANGED_EVENT = 'nf-trust-changed'

export interface TrustStorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/**
 * 纯迁移函数：首次加载（无 nf-trust-v2 标记）时把旧布尔开关转换成模式。
 * 返回：旧键 '1' → delegated；旧键存在但非 '1' → standard；
 * 无旧键/已迁移过 → null（不写 main——避免用默认值覆盖 main 已有的 strict/delegated）。
 * 迁移后删除旧键并置标记——旧事件/旧读取不会再影响行为。
 */
export function migrateLegacyTrustMode(storage: TrustStorageLike): TrustMode | null {
  try {
    if (storage.getItem(TRUST_MIGRATION_KEY) === '1') {
      storage.removeItem(LEGACY_DELEGATE_KEY)
      return null
    }
    const legacy = storage.getItem(LEGACY_DELEGATE_KEY)
    storage.setItem(TRUST_MIGRATION_KEY, '1')
    storage.removeItem(LEGACY_DELEGATE_KEY)
    if (legacy === null) return null
    return legacy === '1' ? 'delegated' : DEFAULT_TRUST_MODE
  } catch {
    return null
  }
}

function broadcastTrustMode(mode: TrustMode): void {
  try {
    window.dispatchEvent(new CustomEvent(TRUST_CHANGED_EVENT, { detail: mode }))
  } catch {
    /* 非浏览器环境（单测）——忽略 */
  }
}

export interface UseTrustPolicyResult {
  mode: TrustMode
  ready: boolean
  error: string | null
  setMode: (mode: TrustMode) => Promise<{ ok: boolean; error?: string }>
}

export function useTrustPolicy(): UseTrustPolicyResult {
  const [mode, setModeState] = useState<TrustMode>(DEFAULT_TRUST_MODE)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const init = async () => {
      let migrated: TrustMode | null = null
      try {
        migrated = migrateLegacyTrustMode(localStorage)
      } catch {
        /* 存储不可用——保持默认 */
      }
      const api = window.neonforge?.trust
      if (migrated) {
        if (alive) setModeState(migrated)
        if (api?.set) {
          try {
            await api.set(migrated)
          } catch {
            /* 迁移写失败——仍按迁移结果展示本次会话；下次启动会重试（旧键已删） */
          }
        }
      }
      try {
        const stored = await api?.get?.()
        if (alive && isTrustMode(stored)) setModeState(stored)
      } catch {
        /* 读取失败——使用迁移/默认值 */
      }
      if (alive) setReady(true)
    }
    void init()
    const onChanged = (event: Event) => {
      const next = (event as CustomEvent).detail
      if (isTrustMode(next)) setModeState(next)
    }
    window.addEventListener(TRUST_CHANGED_EVENT, onChanged)
    return () => {
      alive = false
      window.removeEventListener(TRUST_CHANGED_EVENT, onChanged)
    }
  }, [])

  const setMode = useCallback(async (next: TrustMode) => {
    setError(null)
    const api = window.neonforge?.trust
    if (api?.set) {
      try {
        const result = await api.set(next)
        if (result?.ok && isTrustMode(result.mode)) {
          setModeState(result.mode)
          broadcastTrustMode(result.mode)
          return { ok: true }
        }
        const message = result?.error ?? '信任模式保存失败'
        setError(message)
        return { ok: false, error: message }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
        return { ok: false, error: message }
      }
    }
    // 无 main 通道（demo/测试降级）——内存会话仍生效，不静默写入第二个持久化副本
    setModeState(next)
    broadcastTrustMode(next)
    return { ok: true }
  }, [])

  return { mode, ready, error, setMode }
}
