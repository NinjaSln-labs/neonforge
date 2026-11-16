// 权限规则持久化（BC-02 授权域）：规则引擎（Tool(specifier)）跨重启保留。
// - 与 configStore 同策略：userData 落盘、损坏容错、0600、tmp + rename 原子写
// - 校验在写入边界做（IPC/手工文件损坏都不把非法 action/tool 带进规则引擎）
// - 规则优先级由 tools.ts 的 selectRule 裁决（deny > allow > ask），存储顺序不改变语义
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import type { PermissionRule, RuleAction } from './tools.js'

const ACTIONS: readonly RuleAction[] = ['allow', 'deny', 'ask']
export const MAX_PERMISSION_RULES = 200
export const MAX_RULE_SPECIFIER_LENGTH = 4000

/** 校验并规范化规则数组；非法输入抛出（IPC 边界 fail-closed）。完全相同的规则去重。 */
export function normalizePermissionRules(input: unknown): PermissionRule[] {
  if (!Array.isArray(input)) throw new Error('规则必须为数组')
  if (input.length > MAX_PERMISSION_RULES) {
    throw new Error(`规则数量不能超过 ${MAX_PERMISSION_RULES}`)
  }
  const rules: PermissionRule[] = []
  const seen = new Set<string>()
  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`规则[${index}] 必须为对象`)
    }
    const value = raw as Record<string, unknown>
    if (!ACTIONS.includes(value.action as RuleAction)) {
      throw new Error(`规则[${index}] action 必须为 allow/deny/ask`)
    }
    if (typeof value.tool !== 'string' || !value.tool.trim()) {
      throw new Error(`规则[${index}] tool 必须为非空字符串`)
    }
    if (typeof value.specifier !== 'string') {
      throw new Error(`规则[${index}] specifier 必须为字符串`)
    }
    if (value.specifier.length > MAX_RULE_SPECIFIER_LENGTH) {
      throw new Error(`规则[${index}] specifier 最长 ${MAX_RULE_SPECIFIER_LENGTH} 字符`)
    }
    const rule: PermissionRule = {
      action: value.action as RuleAction,
      tool: value.tool.trim(),
      specifier: value.specifier,
    }
    const key = JSON.stringify([rule.action, rule.tool, rule.specifier])
    if (!seen.has(key)) {
      seen.add(key)
      rules.push(rule)
    }
  })
  return rules
}

/** 规则文件读写（构造注入路径——单测不依赖 electron app.getPath）。 */
export class PermissionRulesStore {
  constructor(private readonly filePath: string) {}

  /** 读取规则；缺失/整体损坏 → 空规则；单条非法只丢弃该条（不因一条坏记录清空全部 deny 规则）。 */
  load(): PermissionRule[] {
    try {
      if (!existsSync(this.filePath)) return []
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as unknown
      if (!Array.isArray(parsed)) return []
      const valid: unknown[] = []
      for (const item of parsed.slice(0, MAX_PERMISSION_RULES)) {
        try {
          normalizePermissionRules([item])
          valid.push(item)
        } catch {
          /* 单条非法——跳过 */
        }
      }
      return normalizePermissionRules(valid)
    } catch {
      return []
    }
  }

  /** 校验并落盘（非法输入抛出）；返回规范化后的规则。 */
  save(input: unknown): PermissionRule[] {
    const rules = normalizePermissionRules(input)
    const dir = path.dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, JSON.stringify(rules, null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.filePath)
    syncDirBestEffort(dir)
    return rules
  }
}

/** 目录 fsync 尽力而为（Windows 不支持目录 fsync 时忽略）。 */
function syncDirBestEffort(dir: string): void {
  let fd: number | null = null
  try {
    fd = openSync(dir, 'r')
    fsyncSync(fd)
  } catch {
    /* 平台不支持——忽略 */
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* 忽略 */
      }
    }
  }
}
