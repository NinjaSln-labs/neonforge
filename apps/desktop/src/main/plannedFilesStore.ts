// PlannedFilesStore：计划清单持久化仓库（IPlannedFilesRepository 实现——D3 / ADR-005）
// PlannedFiles 聚合（04 §1.3——Workspace BC 宿主强制边界的数据源）权威落点：
// - main 进程持有 + userData 落盘（configStore 模式：同步写/损坏容错）
// - 追加幂等（04 §1.3 不变式——分批 approve-files 合并）；approved 联动（add → true；reset → false）
// - 路径原样保留（绝对化由调用方 trustPath 负责——store 不加工）
// 构造注入存储路径（可测——不依赖 electron app.getPath）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export interface PlannedFilesData {
  files: string[]
  approved: boolean
  updatedAt?: string
}

const EMPTY: PlannedFilesData = { files: [], approved: false }

export class PlannedFilesStore {
  constructor(private readonly filePath: string) {}

  /** 读当前清单（损坏/缺失容错 → 空清单）——最小契约 { files, approved }（updatedAt 仅落盘审计） */
  load(): PlannedFilesData {
    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<PlannedFilesData>
        if (Array.isArray(parsed.files)) {
          return { files: parsed.files, approved: Boolean(parsed.approved) }
        }
      }
    } catch {
      /* 损坏——忽略（configStore 模式） */
    }
    return { ...EMPTY }
  }

  /** 追加批准（不覆盖——Set 幂等去重）；置 approved；落盘 */
  add(files: string[]): PlannedFilesData {
    if (files.length === 0) return this.load() // no-op（空清单无意义——不置 approved）
    const prev = this.load()
    const merged = [...new Set([...prev.files, ...files])]
    return this.persist({ files: merged, approved: true })
  }

  /** 清空 + 未批准（任务边界） */
  reset(): PlannedFilesData {
    return this.persist({ ...EMPTY })
  }

  private persist(data: PlannedFilesData): PlannedFilesData {
    const out = { ...data, updatedAt: new Date().toISOString() }
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(out, null, 2), { mode: 0o600 })
    } catch {
      /* 落盘失败忽略——内存态仍工作（与 localStorage 断点续做同策略） */
    }
    return { files: out.files, approved: out.approved } // 最小契约（updatedAt 仅落盘审计）
  }
}
