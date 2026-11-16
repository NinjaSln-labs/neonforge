// 信任模式持久化（BC-02 授权域——ADR-015 / GitHub #12）
// - userData/config/trust-policy.json：三档枚举（strict/standard/delegated）
// - 与 permissionRulesStore 同策略：0600、tmp + rename 原子写、目录 fsync 尽力而为
// - 缺失/损坏/非法值 → standard（安全与可用性折中：默认档不静默委托）
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
import { DEFAULT_TRUST_MODE, isTrustMode, type TrustMode } from '../domain/trustMode.js'

/** 校验并规范化模式；非法输入抛出（IPC/手工文件损坏都不把非法模式带进运行时）。 */
export function normalizeTrustMode(input: unknown): TrustMode {
  if (!isTrustMode(input)) throw new Error('信任模式必须为 strict/standard/delegated')
  return input
}

/** 信任策略文件读写（构造注入路径——单测不依赖 electron app.getPath）。 */
export class TrustPolicyStore {
  constructor(private readonly filePath: string) {}

  /** 读取当前模式；缺失/整体损坏/非法值 → standard（不因坏文件锁死或静默提权）。 */
  load(): TrustMode {
    try {
      if (!existsSync(this.filePath)) return DEFAULT_TRUST_MODE
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as unknown
      const mode =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as { mode?: unknown }).mode
          : undefined
      return isTrustMode(mode) ? mode : DEFAULT_TRUST_MODE
    } catch {
      return DEFAULT_TRUST_MODE
    }
  }

  /** 校验并落盘（非法模式抛出）；返回规范化后的模式。 */
  save(input: unknown): TrustMode {
    const mode = normalizeTrustMode(input)
    const dir = path.dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, JSON.stringify({ mode }, null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.filePath)
    syncDirBestEffort(dir)
    return mode
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
