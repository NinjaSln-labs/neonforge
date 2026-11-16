// BC-02 信任模式 renderer 镜像（ADR-015 / GitHub #12）
// - main 是权威（trust:get/trust:set）；renderer 只缓存展示与判定用的模式
// - 旧 L4 localStorage 布尔（nf-delegate-lowrisk）一次性迁移：'1' → delegated，否则 standard
// - 迁移只在 main 持久化成功后才置标记/删旧键——写失败保留旧键供下次启动重试，不静默丢用户设置
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

/** 读取尚未迁移的旧开关模式（无旧键/已迁移/存储不可用 → null）。只读，不写标记。 */
export function readLegacyTrustMode(storage: TrustStorageLike): TrustMode | null {
  try {
    if (storage.getItem(TRUST_MIGRATION_KEY) === '1') return null
    const legacy = storage.getItem(LEGACY_DELEGATE_KEY)
    if (legacy === null) return null
    return legacy === '1' ? 'delegated' : DEFAULT_TRUST_MODE
  } catch {
    return null
  }
}

/** 标记迁移完成：删除旧键并置标记。仅在 main 持久化成功（或没有 main 通道）后调用。 */
export function markLegacyTrustMigrated(storage: TrustStorageLike): void {
  try {
    storage.setItem(TRUST_MIGRATION_KEY, '1')
    storage.removeItem(LEGACY_DELEGATE_KEY)
  } catch {
    /* 存储不可用——不影响本次会话 */
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
      const api = window.neonforge?.trust
      let legacy: TrustMode | null = null
      try {
        legacy = readLegacyTrustMode(localStorage)
      } catch {
        /* 存储不可用——按 main 当前模式 */
      }
      let migratedForSession = false
      if (legacy) {
        if (!api?.set) {
          // demo/测试降级：无 main 通道，按旧值会话生效并完成本地迁移
          markLegacyTrustMigrated(localStorage)
          if (alive) setModeState(legacy)
          migratedForSession = true
        } else {
          try {
            const result = await api.set(legacy)
            if (!alive) return
            if (result?.ok && isTrustMode(result.mode)) {
              markLegacyTrustMigrated(localStorage)
              setModeState(result.mode)
              broadcastTrustMode(result.mode)
              migratedForSession = true
            }
            // 写失败：保留旧键 + 不置标记 → 下次启动重试；本次按 main 现有模式（fail-closed）
          } catch {
            // IPC 异常同上——不丢用户旧设置
          }
        }
      } else {
        markLegacyTrustMigrated(localStorage)
      }
      try {
        const stored = await api?.get?.()
        if (alive && isTrustMode(stored) && !migratedForSession) setModeState(stored)
        if (alive && !api?.get && legacy && migratedForSession) setModeState(legacy)
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
