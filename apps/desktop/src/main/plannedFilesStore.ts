// PlannedFilesStore：计划清单持久化仓库（IPlannedFilesRepository 实现——D3 / ADR-005 / ADR-015）
// PlannedFiles 聚合（04 §1.3——Workspace BC 宿主强制边界的数据源）权威落点：
// - main 进程持有 + userData 落盘（configStore 模式：同步写/损坏容错）
// - 追加幂等（04 §1.3 不变式——分批 approve-files 合并）
// - `approved` = approve-files 已批准（布尔镜像驱动 write 规划门控）
// - `planConfirmed` = 用户确认过方案清单（ADR-015 委托边界二次校验依据，不等同 approve-files）
// - 进程内 cache 兜底：落盘失败时 reset 仍立即撤销授权（下一条委托请求不得读回旧 approved）
// 构造注入存储路径（可测——不依赖 electron app.getPath）
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

export interface PlannedFilesData {
  files: string[]
  approved: boolean
  planConfirmed?: boolean
  updatedAt?: string
}

const EMPTY: PlannedFilesData = { files: [], approved: false, planConfirmed: false }

export class PlannedFilesStore {
  // 进程内权威快照：落盘失败（只读/磁盘满/rename EPERM）时仍然反映最后一次用户意图——
  // 尤其 reset 撤销必须立即生效，不能从旧磁盘读回 approved:true 让委托继续放行。
  private cache: PlannedFilesData | null = null

  constructor(private readonly filePath: string) {}

  /** 读当前清单（损坏/缺失容错 → 空清单）——最小契约 { files, approved }（updatedAt 仅落盘审计） */
  load(): { files: string[]; approved: boolean } {
    const data = this.read()
    return { files: [...data.files], approved: data.approved }
  }

  /** ADR-015：含方案确认事实的完整读取（委托边界二次校验用——不暴露给 renderer 镜像契约） */
  loadPlan(): { files: string[]; approved: boolean; planConfirmed: boolean } {
    const data = this.read()
    return {
      files: [...data.files],
      approved: data.approved,
      planConfirmed: Boolean(data.planConfirmed),
    }
  }

  /** 追加批准（不覆盖——Set 幂等去重）；置 approved；保留 planConfirmed；落盘 */
  add(files: string[]): { files: string[]; approved: boolean } {
    if (files.length === 0) return this.load() // no-op（空清单无意义——不置 approved）
    const prev = this.read()
    const merged = [...new Set([...prev.files, ...files])]
    return this.persist({
      files: merged,
      approved: true,
      planConfirmed: prev.planConfirmed,
    }).loaded
  }

  /** ADR-015：方案确认同步清单——只置 planConfirmed，不置 approved（approve-files 仍独立） */
  addPlan(files: string[]): { files: string[]; approved: boolean; planConfirmed: boolean } {
    const prev = this.read()
    const merged = [...new Set([...prev.files, ...files])]
    const data = this.persist({
      files: merged,
      approved: prev.approved,
      planConfirmed: true,
    })
    return { ...data.loaded, planConfirmed: true }
  }

  /** 清空 + 未批准 + 未确认（任务边界）——即使落盘失败，进程内 cache 也已撤销 */
  reset(): { files: string[]; approved: boolean } {
    return this.persist({ ...EMPTY }).loaded
  }

  private read(): PlannedFilesData {
    if (this.cache) return this.cache
    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<PlannedFilesData>
        if (Array.isArray(parsed.files)) {
          this.cache = {
            files: parsed.files,
            approved: Boolean(parsed.approved),
            planConfirmed: Boolean(parsed.planConfirmed),
          }
          return this.cache
        }
      }
    } catch {
      /* 损坏——忽略（configStore 模式） */
    }
    this.cache = { ...EMPTY }
    return this.cache
  }

  private persist(data: { files: string[]; approved: boolean; planConfirmed?: boolean }): {
    loaded: { files: string[]; approved: boolean }
  } {
    const out: PlannedFilesData = {
      files: [...data.files],
      approved: data.approved,
      planConfirmed: Boolean(data.planConfirmed),
    }
    // 先更新进程内权威，再尝试落盘——写失败不回滚内存（安全撤销优先）
    this.cache = { ...out }
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      // P2-04 / ADR-015：临时文件 + fsync + rename 原子写（防崩溃/断电留下半截 JSON 或旧批准事实）
      const tmp = `${this.filePath}.tmp`
      const fd = openSync(tmp, 'w', 0o600)
      try {
        writeSync(fd, JSON.stringify({ ...out, updatedAt: new Date().toISOString() }, null, 2))
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(tmp, this.filePath)
      syncDirBestEffort(dir)
    } catch {
      /* 落盘失败忽略——进程内 cache 仍是权威；内存态工作（与 localStorage 断点续做同策略） */
    }
    return { loaded: { files: [...out.files], approved: out.approved } }
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
