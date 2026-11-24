// 问题台账 main 权威存储 + 同步编排（ADR-018 / GitHub #15）。
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
  closeSync,
} from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  mergeProblemLedgers,
  normalizeProblemLedger,
  type LedgerProblem,
  type MergeConflict,
  type ProblemLedgerPayload,
} from '../domain/problemLedger.js'
import {
  SYNC_MAX_BYTES,
  decryptLedgerPayload,
  encryptLedgerPayload,
  resolveSyncPassphrase,
  type PassphraseResolution,
} from './problemSyncCrypto.js'

export const LEDGER_FILE = 'problem-ledger.json'
export const SYNC_CONFIG_FILE = 'problem-sync.json'
export const SYNC_SNAPSHOT_FILE = 'neonforge-problem-ledger.sync'

interface SyncConfig {
  deviceId: string
  folder?: string
  lastSyncAt?: string
}

export interface ProblemStoreOptions {
  baseDir: string
  env?: NodeJS.ProcessEnv
  now?: () => Date
}

export interface SyncStatus {
  deviceId: string
  folder: string | null
  lastSyncAt: string | null
  snapshotPath: string
  passphraseSource: PassphraseResolution['source']
}

export interface SyncNowResult {
  ok: boolean
  error?: string
  message?: string
  syncedAt?: string
  merged?: number
  localOnly?: number
  remoteOnly?: number
  conflicts?: number
  /** ADR-018 §3：冲突摘要保留 id/revision（不丢数据；UI 可展示（当前只展示计数）） */
  conflictDetails?: MergeConflict[]
  total?: number
  /** 合并后的权威台账——renderer 必须以此刷新内存态（防陈旧副本回写覆盖远端赢家，ADR-018） */
  problems?: LedgerProblem[]
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf-8')) as unknown
}

function writeAtomic(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  const fd = openSync(tmp, 'wx', 0o600)
  try {
    writeFileSync(fd, content, 'utf-8')
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
}

/** 路径本身或任意祖先处于 git 仓库 → 视为受版本控制目录（ADR-018 §5）。 */
function insideGitRepo(target: string): boolean {
  let current = path.resolve(target)
  for (;;) {
    if (existsSync(path.join(current, '.git'))) return true
    const parent = path.dirname(current)
    if (parent === current) return false
    current = parent
  }
}

export class ProblemLedgerStore {
  constructor(private readonly opts: ProblemStoreOptions) {}

  ledgerPath(): string {
    return path.join(this.opts.baseDir, LEDGER_FILE)
  }

  syncConfigPath(): string {
    return path.join(this.opts.baseDir, SYNC_CONFIG_FILE)
  }

  private env(): NodeJS.ProcessEnv {
    return this.opts.env ?? process.env
  }

  private nowIso(): string {
    return (this.opts.now?.() ?? new Date()).toISOString()
  }

  private config(): SyncConfig {
    try {
      if (existsSync(this.syncConfigPath())) {
        const raw = readJson(this.syncConfigPath()) as Partial<SyncConfig>
        const deviceId =
          typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : randomUUID()
        return {
          deviceId,
          ...(typeof raw.folder === 'string' && raw.folder ? { folder: raw.folder } : {}),
          ...(typeof raw.lastSyncAt === 'string' ? { lastSyncAt: raw.lastSyncAt } : {}),
        }
      }
    } catch {
      /* 损坏回退新配置 */
    }
    return { deviceId: randomUUID() }
  }

  private saveConfig(config: SyncConfig): void {
    writeAtomic(this.syncConfigPath(), JSON.stringify(config, null, 2))
  }

  /** 读取本地台账；损坏/缺失返回空列表与错误（不阻断启动）。 */
  load(): { problems: LedgerProblem[]; error?: string } {
    if (!existsSync(this.ledgerPath())) return { problems: [] }
    try {
      const raw = readJson(this.ledgerPath()) as { problems?: unknown } | unknown[]
      const list = Array.isArray(raw) ? raw : raw?.problems
      return { problems: normalizeProblemLedger(list) }
    } catch (e) {
      return {
        problems: [],
        error: `台账读取失败：${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  private writeLedger(problems: LedgerProblem[]): void {
    const config = this.config()
    if (!existsSync(this.syncConfigPath())) this.saveConfig(config)
    writeAtomic(
      this.ledgerPath(),
      JSON.stringify({ schemaVersion: 1, deviceId: config.deviceId, problems }, null, 2),
    )
  }

  /** renderer 保存：保留未提交的 tombstone；内容变化递增 revision。 */
  save(problems: LedgerProblem[]): { ok: boolean; problems: LedgerProblem[]; error?: string } {
    try {
      const incoming = normalizeProblemLedger(problems)
      const existing = this.load().problems
      const oldById = new Map(existing.map((p) => [p.id, p]))
      const incomingIds = new Set(incoming.map((p) => p.id))
      // ADR-018 审计修复：renderer 全量保存时，main 中不在本次列表内的条目也必须保留——
      // 同步刚合并进来的远端新增/删除 tombstone 若被下一次陈旧保存省略，会静默丢失。
      // 删除走显式 tombstone（ADR-018 §3），「缺席」不等于删除。
      const keepExisting = existing.filter((p) => !incomingIds.has(p.id))
      const bumped = incoming.map((p) => {
        const old = oldById.get(p.id)
        if (!old) return { ...p, revision: Math.max(1, p.revision ?? 0) }
        // 删除是终态：main 权威 tombstone 不被 renderer 的旧副本复活
        if (old.deletedAt && !p.deletedAt) return old
        const changed =
          p.title !== old.title ||
          p.status !== old.status ||
          (p.updatedAtIso ?? p.updatedAt) !== (old.updatedAtIso ?? old.updatedAt) ||
          JSON.stringify(p.snapshot ?? null) !== JSON.stringify(old.snapshot ?? null) ||
          Boolean(p.deletedAt) !== Boolean(old.deletedAt)
        // ADR-018 审计修复：陈旧副本不得覆盖更高 revision 的 main 权威。
        // 同步（或其它设备写入）后 main revision 可能已高于 renderer 内存里的副本；若内容不同且
        // incoming revision 低于现有，视为陈旧（renderer 尚未刷新）→ 保留 main 版本，不再抬 revision。
        const incomingRevision = p.revision ?? 0
        if (changed && incomingRevision > 0 && incomingRevision < (old.revision ?? 0)) return old
        const revision = changed
          ? Math.max((old.revision ?? 0) + 1, incomingRevision)
          : Math.max(old.revision ?? 0, incomingRevision)
        return { ...p, revision }
      })
      const next = normalizeProblemLedger([...bumped, ...keepExisting])
      this.writeLedger(next)
      return { ok: true, problems: next }
    } catch (e) {
      return {
        ok: false,
        problems: [],
        error: `台账保存失败：${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  status(): SyncStatus {
    const config = this.config()
    return {
      deviceId: config.deviceId,
      folder: config.folder ?? null,
      lastSyncAt: config.lastSyncAt ?? null,
      snapshotPath: config.folder ? path.join(config.folder, SYNC_SNAPSHOT_FILE) : '',
      passphraseSource: resolveSyncPassphrase(this.env()).source,
    }
  }

  setSyncFolder(folder: string | null): { ok: boolean; error?: string; status?: SyncStatus } {
    let resolved: string | null = null
    if (folder !== null) {
      const target = path.resolve(folder)
      if (!existsSync(target) || !statSync(target).isDirectory()) {
        return { ok: false, error: '同步目录不存在或不是目录' }
      }
      try {
        resolved = realpathSync(target)
      } catch {
        return { ok: false, error: '同步目录 realpath 解析失败' }
      }
      if (insideGitRepo(resolved) || existsSync(path.join(resolved, 'package.json'))) {
        return { ok: false, error: '同步目录不能是项目根/代码仓库目录' }
      }
    }
    const config = this.config()
    this.saveConfig({
      ...config,
      ...(resolved ? { folder: resolved } : { folder: undefined }),
    })
    return { ok: true, status: this.status() }
  }

  private readRemote(passphrase: string): {
    payload: ProblemLedgerPayload | null
    error?: string
  } {
    const config = this.config()
    if (!config.folder) return { payload: null }
    const snapshot = path.join(config.folder, SYNC_SNAPSHOT_FILE)
    if (!existsSync(snapshot)) return { payload: null }
    const size = statSync(snapshot).size
    if (size > SYNC_MAX_BYTES) return { payload: null, error: '同步快照超过大小上限' }
    try {
      const raw = readFileSync(snapshot, 'utf-8')
      const decoded = decryptLedgerPayload(raw, passphrase) as Partial<ProblemLedgerPayload>
      if (decoded?.schemaVersion !== 1 || !Array.isArray(decoded.problems)) {
        return { payload: null, error: '同步快照 schema 不支持' }
      }
      return {
        payload: {
          schemaVersion: 1,
          deviceId:
            typeof decoded.deviceId === 'string' && decoded.deviceId ? decoded.deviceId : 'remote',
          exportedAt: typeof decoded.exportedAt === 'string' ? decoded.exportedAt : '',
          problems: normalizeProblemLedger(decoded.problems),
        },
      }
    } catch (e) {
      return {
        payload: null,
        error: e instanceof Error ? e.message : '同步快照读取失败',
      }
    }
  }

  syncNow(): SyncNowResult {
    const pass = resolveSyncPassphrase(this.env())
    if (!pass.value) {
      return {
        ok: false,
        error: 'passphrase-missing',
        message: pass.error ?? '未配置同步口令（NEONFORGE_SYNC_PASSPHRASE 或 _FILE）',
      }
    }
    const config = this.config()
    if (!config.folder) {
      return { ok: false, error: 'folder-missing', message: '未选择同步目录' }
    }
    const remote = this.readRemote(pass.value)
    if (remote.error) return { ok: false, error: 'remote-invalid', message: remote.error }
    const local = this.load()
    if (local.error) return { ok: false, error: 'local-invalid', message: local.error }
    const remoteProblems = remote.payload?.problems ?? []
    const localIds = new Set(local.problems.map((p) => p.id))
    const remoteIds = new Set(remoteProblems.map((p) => p.id))
    const merged = mergeProblemLedgers(
      local.problems,
      remoteProblems,
      config.deviceId,
      remote.payload?.deviceId ?? 'remote',
    )
    const syncedAt = this.nowIso()
    const payload: ProblemLedgerPayload = {
      schemaVersion: 1,
      deviceId: config.deviceId,
      exportedAt: syncedAt,
      problems: merged.problems,
    }
    try {
      this.writeLedger(merged.problems)
      writeAtomic(
        path.join(config.folder, SYNC_SNAPSHOT_FILE),
        encryptLedgerPayload(payload, pass.value),
      )
      this.saveConfig({ ...config, lastSyncAt: syncedAt })
    } catch (e) {
      return {
        ok: false,
        error: 'write-failed',
        message: e instanceof Error ? e.message : String(e),
      }
    }
    return {
      ok: true,
      syncedAt,
      merged: merged.problems.length,
      localOnly: [...localIds].filter((id) => !remoteIds.has(id)).length,
      remoteOnly: [...remoteIds].filter((id) => !localIds.has(id)).length,
      conflicts: merged.conflicts.length,
      conflictDetails: merged.conflicts,
      total: merged.problems.length,
      problems: merged.problems,
    }
  }
}
