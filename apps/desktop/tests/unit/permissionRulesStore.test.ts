import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  MAX_PERMISSION_RULES,
  MAX_RULE_SPECIFIER_LENGTH,
  PermissionRulesStore,
  normalizePermissionRules,
} from '../../src/main/permissionRulesStore'

const TMP = '/tmp/nf-permission-rules-test'
const FILE = path.join(TMP, 'permission-rules.json')

describe('permissionRulesStore（BC-02 权限规则持久化）', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('缺失文件 → 空规则', () => {
    expect(new PermissionRulesStore(FILE).load()).toEqual([])
  })

  it('保存后落盘并可重新加载（tool 去空白 + 相同规则去重）', () => {
    const store = new PermissionRulesStore(FILE)
    const saved = store.save([
      { action: 'allow', tool: ' bash ', specifier: 'npm run ' },
      { action: 'allow', tool: 'bash', specifier: 'npm run ' },
    ])
    expect(saved).toEqual([{ action: 'allow', tool: 'bash', specifier: 'npm run ' }])
    expect(JSON.parse(readFileSync(FILE, 'utf-8'))).toEqual(saved)
    expect(new PermissionRulesStore(FILE).load()).toEqual(saved)
    expect(existsSync(`${FILE}.tmp`)).toBe(false)
  })

  it('损坏 JSON → 空规则（不阻断启动）', () => {
    writeFileSync(FILE, '{broken')
    expect(new PermissionRulesStore(FILE).load()).toEqual([])
  })

  it('非法 action/tool/specifier 拒绝入队', () => {
    const store = new PermissionRulesStore(FILE)
    expect(() => store.save([{ action: 'ok', tool: 'bash', specifier: '' }])).toThrow(
      /action 必须为 allow\/deny\/ask/,
    )
    expect(() => store.save([{ action: 'allow', tool: '   ', specifier: '' }])).toThrow(
      /tool 必须为非空字符串/,
    )
    expect(() => store.save([{ action: 'allow', tool: 'bash', specifier: 1 }])).toThrow(
      /specifier 必须为字符串/,
    )
    expect(() => store.save('not-array')).toThrow(/规则必须为数组/)
    expect(() => store.save([null])).toThrow(/必须为对象/)
  })

  it('数量与前缀长度边界', () => {
    const rule = { action: 'allow' as const, tool: 'bash', specifier: '' }
    expect(() =>
      normalizePermissionRules(Array.from({ length: MAX_PERMISSION_RULES + 1 }, () => rule)),
    ).toThrow(/数量不能超过/)
    expect(
      normalizePermissionRules(
        Array.from({ length: MAX_PERMISSION_RULES }, (_, i) => ({
          action: 'allow' as const,
          tool: 'bash',
          specifier: `prefix-${i}`,
        })),
      ),
    ).toHaveLength(MAX_PERMISSION_RULES)
    expect(() =>
      normalizePermissionRules([
        { action: 'allow', tool: 'bash', specifier: 'x'.repeat(MAX_RULE_SPECIFIER_LENGTH + 1) },
      ]),
    ).toThrow(/最长/)
  })
})
