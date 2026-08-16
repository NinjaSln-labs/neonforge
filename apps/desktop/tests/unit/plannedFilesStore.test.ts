// L1 领域测试：PlannedFilesStore（IPlannedFilesRepository 实现——D3 计划清单持久化）
// ADR-005：main 权威 + 落盘持久化 + 批准事实跨重启；追加幂等（04 §1.3 不变式）；损坏容错（configStore 模式）
// 测试目标：纯 Node 类（构造注入路径——不依赖 electron）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PlannedFilesStore } from '../../src/main/plannedFilesStore'

let dir: string
let filePath: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nf-planned-'))
  filePath = path.join(dir, 'planned-files.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('PlannedFilesStore（D3——计划清单持久化仓库）', () => {
  it('初始 load：无文件 → 空清单 + 未批准', () => {
    const store = new PlannedFilesStore(filePath)
    expect(store.load()).toEqual({ files: [], approved: false })
  })

  it('add 追加：files 并入 + approved 置 true', () => {
    const store = new PlannedFilesStore(filePath)
    store.add(['/proj/src/app.ts', '/proj/src/utils.ts'])
    const data = store.load()
    expect(data.files).toEqual(['/proj/src/app.ts', '/proj/src/utils.ts'])
    expect(data.approved).toBe(true)
  })

  it('add 幂等去重：重复文件不重复（追加语义——04 §1.3 不变式）', () => {
    const store = new PlannedFilesStore(filePath)
    store.add(['/proj/src/app.ts'])
    store.add(['/proj/src/app.ts', '/proj/src/utils.ts'])
    expect(store.load().files).toEqual(['/proj/src/app.ts', '/proj/src/utils.ts'])
  })

  it('add 空数组：no-op（不置 approved——空清单无意义）', () => {
    const store = new PlannedFilesStore(filePath)
    expect(store.add([]).approved).toBe(false)
    store.add(['/proj/src/app.ts'])
    const after = store.add([])
    expect(after.files).toEqual(['/proj/src/app.ts'])
    expect(after.approved).toBe(true) // 已有批准保持
  })

  it('reset：清空清单 + approved 置 false', () => {
    const store = new PlannedFilesStore(filePath)
    store.add(['/proj/src/app.ts'])
    const data = store.reset()
    expect(data).toEqual({ files: [], approved: false })
  })

  it('持久化往返：add 后新实例 load 恢复（批准事实跨重启——ADR-005 ②）', () => {
    const s1 = new PlannedFilesStore(filePath)
    s1.add(['/proj/src/app.ts'])
    const s2 = new PlannedFilesStore(filePath)
    expect(s2.load()).toEqual({ files: ['/proj/src/app.ts'], approved: true })
  })

  it('reset 后新实例 load 恢复空（任务边界跨重启一致）', () => {
    const s1 = new PlannedFilesStore(filePath)
    s1.add(['/proj/src/app.ts'])
    s1.reset()
    const s2 = new PlannedFilesStore(filePath)
    expect(s2.load()).toEqual({ files: [], approved: false })
  })

  it('损坏 JSON 容错：load → 空清单不抛（configStore 模式）', () => {
    writeFileSync(filePath, '{broken json!!!', 'utf-8')
    const store = new PlannedFilesStore(filePath)
    expect(store.load()).toEqual({ files: [], approved: false })
  })

  it('损坏后 add 可恢复：覆盖损坏文件写入正常数据', () => {
    writeFileSync(filePath, '{broken json!!!', 'utf-8')
    const store = new PlannedFilesStore(filePath)
    store.add(['/proj/src/app.ts'])
    const s2 = new PlannedFilesStore(filePath)
    expect(s2.load()).toEqual({ files: ['/proj/src/app.ts'], approved: true })
  })

  it('相对路径原样保留（路径变换由调用方 trustPath 负责——store 不加工）', () => {
    const store = new PlannedFilesStore(filePath)
    store.add(['src/app.ts', './lib/util.ts'])
    expect(store.load().files).toEqual(['src/app.ts', './lib/util.ts'])
  })

  it('持久化目录不存在自动创建', () => {
    const nested = path.join(dir, 'no', 'such', 'dir', 'planned.json')
    const store = new PlannedFilesStore(nested)
    store.add(['/proj/src/app.ts'])
    expect(existsSync(nested)).toBe(true)
    expect(new PlannedFilesStore(nested).load().files).toEqual(['/proj/src/app.ts'])
  })

  it('落盘内容含完整状态（files + approved——审计可读）', () => {
    const store = new PlannedFilesStore(filePath)
    store.add(['/proj/src/app.ts'])
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      files: string[]
      approved: boolean
    }
    expect(raw.files).toEqual(['/proj/src/app.ts'])
    expect(raw.approved).toBe(true)
  })
})
