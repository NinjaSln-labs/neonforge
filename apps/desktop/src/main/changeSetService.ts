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
  rmSync,
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

/** 变更集自有基线文件（不再复用会被后续快照覆盖的 .nf-bak） */
function baselineFile(baseFilePath: string, sessionId: string, itemId: string): string {
  const safeSession = sessionId.replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(path.dirname(baseFilePath), 'changeset-baselines', safeSession, `${itemId}.base`)
}

function writeBaseline(target: string, content: string): void {
  const dir = path.dirname(target)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(target, content, { mode: 0o600 })
}

export interface RevertResult {
  ok: boolean
  reverted: string[]
  conflicted: string[]
  error?: string
}

export type ChangeSetEventSink = (event: {
  session: string
  type: string
  detail: Record<string, unknown>
}) => void

export class ChangeSetService {
  constructor(
    private readonly filePath: string,
    private readonly emit: ChangeSetEventSink = () => {},
  ) {}

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

  /** 记录一次真实文件变更（write/edit/diff apply 后调用）。状态直接 applied（执行前已经过授权）。
   * 首次写入时把写前内容复制为变更集自有基线；后续写入保留首次基线，避免 .nf-bak 被覆盖后回滚错版本。
   * preWrite：调用方在写入前捕获的原始内容（content=null=新建文件）。缺省时才回退读 .nf-bak——
   * 快照失败/被任务边界清理时，不能把已存在文件误判为新建（回滚会删文件而不是恢复）。 */
  recordMutation(
    sessionId: string,
    filePath: string,
    preWrite?: { content: string | null },
  ): ChangeSet {
    const data = this.loadAll()
    const existing = data.sets[sessionId]
    const at = new Date().toISOString()
    const itemId = itemIdFor(filePath)
    const afterContent = readText(filePath)
    const afterHash = afterContent === null ? null : hashContent(afterContent)
    const bakPath = `${filePath}.nf-bak`
    const existingItem = existing?.items.find((i) => i.id === itemId)
    const baselinePath = baselineFile(this.filePath, sessionId, itemId)

    let baseHash: string | null = existingItem?.baseHash ?? null
    let snapshotRef: string | null = null

    if (existingItem) {
      // 已有条目：保留首次基线；旧格式 snapshotRef 若仍与 baseHash 一致，可迁移到自有基线文件
      if (baseHash !== null) {
        if (existsSync(baselinePath)) {
          snapshotRef = baselinePath
        } else if (existingItem.snapshotRef && existsSync(existingItem.snapshotRef)) {
          const oldSnapshot = readText(existingItem.snapshotRef)
          if (oldSnapshot !== null && hashContent(oldSnapshot) === baseHash) {
            writeBaseline(baselinePath, oldSnapshot)
            snapshotRef = baselinePath
          }
        }
      }
    } else {
      // 新条目：优先用调用方写入前捕获的内容；缺省回退 .nf-bak（本次写入前的内容）
      let baseContent: string | null
      if (preWrite) {
        baseContent = preWrite.content
      } else {
        baseContent = existsSync(bakPath) ? readText(bakPath) : null
      }
      if (baseContent !== null) {
        baseHash = hashContent(baseContent)
        writeBaseline(baselinePath, baseContent)
        snapshotRef = baselinePath
      }
    }

    const item: ChangeItem = {
      id: itemId,
      path: filePath,
      baseHash,
      afterHash,
      snapshotRef,
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
      this.emit({
        session: sessionId,
        type: 'changeset.proposed',
        detail: { changeId: applied.id, files: [filePath], baseHash },
      })
      this.emit({
        session: sessionId,
        type: 'changeset.applied',
        detail: { changeId: applied.id, files: [filePath] },
      })
      return applied
    }
    const found = Boolean(existingItem)
    const items = found
      ? existing.items.map((i) =>
          i.id === item.id
            ? { ...i, afterHash, snapshotRef: item.snapshotRef, status: 'applied' as const }
            : i,
        )
      : [...existing.items, item]
    const next: ChangeSet = {
      ...existing,
      items,
      // 其他变更项仍有冲突时不得把整集状态洗成 applied（否则回滚会静默跳过冲突）
      status: items.some((i) => i.status === 'conflicted') ? 'conflicted' : 'applied',
      updatedAt: at,
    }
    data.sets[sessionId] = next
    this.saveAll(data)
    if (!found) {
      this.emit({
        session: sessionId,
        type: 'changeset.proposed',
        detail: { changeId: next.id, files: [filePath], baseHash },
      })
    }
    this.emit({
      session: sessionId,
      type: 'changeset.applied',
      detail: { changeId: next.id, files: [filePath] },
    })
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
    this.emit({
      session: sessionId,
      type: 'changeset.reverted',
      detail: { changeId: next.id, files: [filePath] },
    })
    return next
  }

  /** 回滚整个变更集：先校验当前内容仍是本变更集产物，否则冲突且不覆盖。 */
  revert(sessionId: string): RevertResult {
    const set = this.get(sessionId)
    if (!set) return { ok: false, reverted: [], conflicted: [], error: '无变更集' }
    let current = set
    const reverted: string[] = []
    // 已处于 conflicted 的项也必须在结果中暴露（不能因状态被洗掉而静默跳过）
    const conflicted: string[] = set.items
      .filter((i) => i.status === 'conflicted')
      .map((i) => i.path)
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
      // 只使用变更集自有基线（或旧格式快照且内容哈希仍等于 baseHash）
      const baseline = item.snapshotRef ? readText(item.snapshotRef) : null
      if (baseline === null || hashContent(baseline) !== item.baseHash) {
        current = markConflict(current, item.id, item.baseHash, nowHash)
        outcomes[item.id] = false
        conflicted.push(item.path)
        continue
      }
      try {
        const tmp = `${item.path}.nf-restore`
        const dir = path.dirname(item.path)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(tmp, baseline, { mode: 0o600 })
        renameSync(tmp, item.path)
        outcomes[item.id] = true
        reverted.push(item.path)
      } catch {
        outcomes[item.id] = false
        conflicted.push(item.path)
      }
    }
    // 冲突项已是 conflicted（revertChangeSet 跳过非 applied 项）
    const next = revertChangeSet(current, outcomes)
    const data = this.loadAll()
    data.sets[sessionId] = next
    this.saveAll(data)
    for (const file of reverted) {
      this.emit({
        session: sessionId,
        type: 'changeset.reverted',
        detail: { changeId: next.id, files: [file] },
      })
    }
    for (const file of conflicted) {
      this.emit({
        session: sessionId,
        type: 'changeset.conflict_detected',
        detail: { changeId: next.id, file },
      })
    }
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
    try {
      rmSync(
        path.join(
          path.dirname(this.filePath),
          'changeset-baselines',
          sessionId.replace(/[^A-Za-z0-9._-]/g, '_'),
        ),
        { recursive: true, force: true },
      )
    } catch {
      /* 清理失败不阻断 */
    }
  }
}
