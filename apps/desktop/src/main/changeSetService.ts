// BC-10 变更集应用服务（main）：记录真实变更、基线校验、回滚。
// 领域状态机在 domain/changeSet.ts；文件快照复用 applyDiff 的 `.nf-bak`。
import {
  createHash,
} from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  createChangeSet,
  markConflict,
  revertChangeSet,
  type ChangeItem,
  type ChangeSet,
} from '../domain/changeSet.js'
import { revert as revertFile } from './applyDiff.js'

interface ChangeSetFile {
  sets: Record<string, ChangeSet>
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function itemIdFor(filePath: string): string {
  return `item-${createHash('sha1').update(path.resolve(filePath)).digest('hex').slice(0, 12)}`
}

function readText(filePath: string): string | null {
  try {
    return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null
  } catch {
    return null
  }
}

export interface RevertResult {
  ok: boolean
  reverted: string[]
  conflicted: string[]
  error?: string
}

export class ChangeSetService {
  constructor(private readonly filePath: string) {}

  private loadAll(): ChangeSetFile {
    try {
      if (!existsSync(this.filePath)) return { sets: {} }
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<ChangeSetFile>
      if (parsed && typeof parsed.sets === 'object' && parsed.sets) return { sets: parsed.sets }
    } catch {
      /* 损坏 → 空（后续可重建） */
    }
    return { sets: {} }
  }

  private saveAll(data: ChangeSetFile): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
      renameSync(tmp, this.filePath)
    } catch {
      /* 落盘失败不阻断业务 */
    }
  }

  get(sessionId: string): ChangeSet | null {
    return this.loadAll().sets[sessionId] ?? null
  }

  list(sessionId: string): ChangeSet | null {
    return this.get(sessionId)
  }

  /** 记录一次真实文件变更（write/edit/diff apply 后调用）。状态直接 applied（执行前已经过授权）。 */
  recordMutation(sessionId: string, filePath: string): ChangeSet {
    const data = this.loadAll()
    const existing = data.sets[sessionId]
    const at = new Date().toISOString()
    const afterContent = readText(filePath)
    const afterHash = afterContent === null ? null : hashContent(afterContent)
    const bakPath = `${filePath}.nf-bak`
    const baseContent = existsSync(bakPath) ? readText(bakPath) : null
    const baseHash = baseContent === null ? null : hashContent(baseContent)
    const item: ChangeItem = {
      id: itemIdFor(filePath),
      path: filePath,
      baseHash,
      afterHash,
      snapshotRef: existsSync(bakPath) ? bakPath : null,
      status: 'applied',
    }
    if (!existing) {
      const set = createChangeSet(`change-${Date.now()}`, [item], at)
      const applied: ChangeSet = {
        ...set,
        items: set.items.map((i) => ({ ...i, status: 'applied' })),
        status: 'applied',
        updatedAt: at,
      }
      data.sets[sessionId] = applied
      this.saveAll(data)
      return applied
    }
    let items = existing.items
    const found = items.some((i) => i.id === item.id)
    items = found
      ? items.map((i) =>
          i.id === item.id
            ? { ...i, afterHash, snapshotRef: item.snapshotRef, status: 'applied' as const }
            : i,
        )
      : [...items, item]
    const next: ChangeSet = {
      ...existing,
      items,
      status: 'applied',
      updatedAt: at,
    }
    data.sets[sessionId] = next
    this.saveAll(data)
    return next
  }

  /** 单文件回滚后同步状态。 */
  recordRevert(sessionId: string, filePath: string): ChangeSet | null {
    const set = this.get(sessionId)
    if (!set) return null
    const item = set.items.find((i) => path.resolve(i.path) === path.resolve(filePath))
    if (!item || item.status !== 'applied') return set
    const next = revertChangeSet(set, { [item.id]: true })
    const data = this.loadAll()
    data.sets[sessionId] = next
    this.saveAll(data)
    return next
  }

  /** 回滚整个变更集：先校验当前内容仍是本变更集产物，否则冲突且不覆盖。 */
  revert(sessionId: string): RevertResult {
    const set = this.get(sessionId)
    if (!set) return { ok: false, reverted: [], conflicted: [], error: '无变更集' }
    let current = set
    const reverted: string[] = []
    const conflicted: string[] = []
    const outcomes: Record<string, boolean> = {}
    for (const item of set.items) {
      if (item.status !== 'applied') continue
      const nowContent = readText(item.path)
      const nowHash = nowContent === null ? null : hashContent(nowContent)
      if (nowHash !== item.afterHash) {
        current = markConflict(current, item.id, item.baseHash, nowHash)
        conflicted.push(item.path)
        continue
      }
      if (item.baseHash === null) {
        // 新建文件：回滚 = 删除（仅当仍是本变更集产物）
        try {
          if (existsSync(item.path)) unlinkSync(item.path)
          outcomes[item.id] = true
          reverted.push(item.path)
        } catch {
          outcomes[item.id] = false
          conflicted.push(item.path)
        }
        continue
      }
      const r = revertFile(item.path)
      outcomes[item.id] = r.ok
      if (r.ok) reverted.push(item.path)
      else conflicted.push(item.path)
    }
    // 冲突项已是 conflicted（revertChangeSet 跳过非 applied 项）
    const next = revertChangeSet(current, outcomes)
    const data = this.loadAll()
    data.sets[sessionId] = next
    this.saveAll(data)
    return {
      ok: conflicted.length === 0 && reverted.length > 0,
      reverted,
      conflicted,
      ...(conflicted.length > 0 ? { error: `有 ${conflicted.length} 个文件与基线不一致，已拒绝覆盖` } : {}),
    }
  }

  clear(sessionId: string): void {
    const data = this.loadAll()
    delete data.sets[sessionId]
    this.saveAll(data)
  }
}
