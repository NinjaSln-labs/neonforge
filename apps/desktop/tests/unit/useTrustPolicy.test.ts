import { describe, it, expect } from 'vitest'
import {
  LEGACY_DELEGATE_KEY,
  TRUST_MIGRATION_KEY,
  markLegacyTrustMigrated,
  readLegacyTrustMode,
} from '../../src/renderer/useTrustPolicy'

function storage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    map,
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  }
}

describe('useTrustPolicy 旧开关迁移（ADR-015）', () => {
  it('旧 nf-delegate-lowrisk=1 → delegated（读取阶段不写标记/不删旧键——等 main 持久化成功）', () => {
    const s = storage({ [LEGACY_DELEGATE_KEY]: '1' })
    expect(readLegacyTrustMode(s)).toBe('delegated')
    expect(s.map.get(TRUST_MIGRATION_KEY)).toBeUndefined()
    expect(s.map.get(LEGACY_DELEGATE_KEY)).toBe('1')
  })

  it("旧键存在但不是 '1'（'0'）→ standard（关就是关，不因键存在而提权）", () => {
    const s = storage({ [LEGACY_DELEGATE_KEY]: '0' })
    expect(readLegacyTrustMode(s)).toBe('standard')
  })

  it('标记迁移完成：写标记 + 删除旧键（绑定成功后才调用）', () => {
    const s = storage({ [LEGACY_DELEGATE_KEY]: '1' })
    markLegacyTrustMigrated(s)
    expect(s.map.get(TRUST_MIGRATION_KEY)).toBe('1')
    expect(s.map.has(LEGACY_DELEGATE_KEY)).toBe(false)
  })

  it('已迁移过 → null（不重复迁移；不覆盖 main 已有模式）', () => {
    const s = storage({ [TRUST_MIGRATION_KEY]: '1', [LEGACY_DELEGATE_KEY]: '1' })
    expect(readLegacyTrustMode(s)).toBeNull()
  })

  it('无旧键 → null（默认由 main store 决定，renderer 不再写第二副本）', () => {
    expect(readLegacyTrustMode(storage())).toBeNull()
  })

  it('存储抛错（隐私模式/配额）→ null，不阻塞启动', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(readLegacyTrustMode(broken)).toBeNull()
    expect(() => markLegacyTrustMigrated(broken)).not.toThrow()
  })
})
