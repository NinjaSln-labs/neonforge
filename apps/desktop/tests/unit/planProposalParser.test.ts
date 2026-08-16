import { describe, it, expect } from 'vitest'
import { parsePlanProposal } from '../../src/domain/planProposalParser'

// S2 spec TDD 网格：parsePlanProposal（设计 §3.3 + §8.1 C ⑭）
// 契约（oracle 对照设计原文）：
// - 结构化解析【执行方案】块 → PlanProposal（summary + files[{path,reason}] + assumptions + verificationPlan）
// - 坑 102 路径过滤继承（垃圾条目不进清单：无空白=合法；含空白须带扩展名）
// - 失败降级：{ ok: false, reason: 'no-block' | 'malformed' }

describe('parsePlanProposal（方案提议解析——S2）', () => {
  it('合法块 → 完整 PlanProposal（summary/files 含 reason/assumptions/verificationPlan）', () => {
    const text = `【执行方案】
- src/main.ts（核心逻辑——替换现有实现）
- src/utils.ts（新增工具函数）
关键假设：
- 使用 Node 22 的 ESM 语法
- 不引入新依赖
验证计划：
- npx tsc --noEmit
- npx vitest run
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // summary 可选：块内首行即文件清单时为空（一句话方案非必填——§8.1 C「+ 一句话方案」为引导非强制）
    expect(typeof r.proposal.summary).toBe('string')
    expect(r.proposal.files).toEqual([
      { path: 'src/main.ts', reason: '核心逻辑——替换现有实现' },
      { path: 'src/utils.ts', reason: '新增工具函数' },
    ])
    expect(r.proposal.assumptions).toEqual(['使用 Node 22 的 ESM 语法', '不引入新依赖'])
    expect(r.proposal.verificationPlan).toEqual(['npx tsc --noEmit', 'npx vitest run'])
  })

  it('块内开头一句话方案 → summary 捕获（非列表行）', () => {
    const text = `【执行方案】
整体重构入口模块，拆分工具函数。
- src/main.ts（核心逻辑）
- src/utils.ts（新增工具函数）
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.proposal.summary).toContain('整体重构入口模块')
  })

  it('缺假设行 → assumptions 空数组（不误判失败——假设非必填）', () => {
    const text = `【执行方案】
- a.js（改入口）
验证计划：
- node a.js
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.proposal.files).toEqual([{ path: 'a.js', reason: '改入口' }])
    expect(r.proposal.assumptions).toEqual([])
    expect(r.proposal.verificationPlan).toEqual(['node a.js'])
  })

  it('缺验证计划 → verificationPlan 空数组', () => {
    const text = `【执行方案】
- a.js（改入口）
关键假设：
- 假设一
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.proposal.verificationPlan).toEqual([])
  })

  it('无【执行方案】标记 → { ok: false, reason: "no-block" }（不产生决策点）', () => {
    const r = parsePlanProposal('我先看看项目结构，再给你方案。')
    expect(r).toEqual({ ok: false, reason: 'no-block' })
  })

  it('有标记但块内无合法文件行 → { ok: false, reason: "malformed" }', () => {
    const r = parsePlanProposal('【执行方案】\n我打算先分析一下，然后动手。')
    expect(r).toEqual({ ok: false, reason: 'malformed' })
  })

  it('坑 102 过滤：垃圾条目不进清单（备注/说明句/含空白无扩展名）', () => {
    const text = `【执行方案】
- README.md（更新文档）
- 项目说明 README 保持不动
- 这是临时备注 不带扩展名
- docs/我的 文件.md（中文文件名含空格带扩展名——合法）
- assets/（目录——无空白合法）
验证计划：
- npm test
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const paths = r.proposal.files.map((f) => f.path)
    expect(paths).toEqual(['README.md', 'docs/我的 文件.md', 'assets/'])
  })

  it('原因括号提取：路径后带（原因）只取路径', () => {
    const text = `【执行方案】
- src/App.tsx（重构组件——拆分）
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.proposal.files[0]).toEqual({ path: 'src/App.tsx', reason: '重构组件——拆分' })
  })

  it('无原因文件行 → reason 空字符串', () => {
    const text = `【执行方案】
- src/App.tsx
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.proposal.files[0]).toEqual({ path: 'src/App.tsx', reason: '' })
  })

  it('无空白 = 合法路径（含 / 结尾目录）；含空白必须带扩展名（坑 102 判定）', () => {
    const text = `【执行方案】
- src/
- game.js
- build/
- 我的 项目.md
- 没有扩展名的 说明句
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.proposal.files.map((f) => f.path)).toEqual(['src/', 'game.js', 'build/', '我的 项目.md'])
  })
})
