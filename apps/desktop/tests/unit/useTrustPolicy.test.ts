import { describe, it, expect } from 'vitest'
import {
  LEGACY_DELEGATE_KEY,
  TRUST_MIGRATION_KEY,
  migrateLegacyTrustMode,
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
  it('旧 nf-delegate-lowrisk=1 → delegated，删除旧键并置迁移标记', () => {
    const s = storage({ [LEGACY_DELEGATE_KEY]: '1' })
    expect(migrateLegacyTrustMode(s)).toBe('delegated')
    expect(s.map.get(TRUST_MIGRATION_KEY)).toBe('1')
    expect(s.map.has(LEGACY_DELEGATE_KEY)).toBe(false)
  })

  it("旧键存在但不是 '1'（'0'）→ standard（关就是关，不因键存在而提权）", () => {
    const s = storage({ [LEGACY_DELEGATE_KEY]: '0' })
    expect(migrateLegacyTrustMode(s)).toBe('standard')
    expect(s.map.get(TRUST_MIGRATION_KEY)).toBe('1')
    expect(s.map.has(LEGACY_DELEGATE_KEY)).toBe(false)
  })

  it('无旧键 → null（不把默认 standard 写回 main——否则会覆盖已有的 strict/delegated）', () => {
    const s = storage()
    expect(migrateLegacyTrustMode(s)).toBeNull()
    expect(s.map.get(TRUST_MIGRATION_KEY)).toBe('1')
    expect(s.map.has(LEGACY_DELEGATE_KEY)).toBe(false)
  })

  it('已迁移过 → null（不重复写/不重复迁移）', () => {
    const s = storage({ [TRUST_MIGRATION_KEY]: '1', [LEGACY_DELEGATE_KEY]: '1' })
    expect(migrateLegacyTrustMode(s)).toBeNull()
    // 残留旧键清理但不改变已迁移状态
    expect(s.map.has(LEGACY_DELEGATE_KEY)).toBe(false)
  })

  it('存储抛错（隐私模式/配额）→ null，不阻塞启动', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(migrateLegacyTrustMode(broken)).toBeNull()
  })
})
