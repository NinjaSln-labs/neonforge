import { describe, it, expect } from 'vitest'
import {
  parsePlanProposal,
  isLikelyPath,
  splitPathReason,
} from '../../src/domain/planProposalParser'

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
    expect(r.proposal.files.map((f) => f.path)).toEqual([
      'src/',
      'game.js',
      'build/',
      '我的 项目.md',
    ])
  })

  // 2026-08-22 #6 真机复验（问题 B）：中文无空格长句非路径——关键假设/验证计划节行不污染清单
  it('坑 102 延伸：中文无空格长句（假设/验证节内容）→ 非路径（真机取证——plan.approved 污染）', () => {
    expect(isLikelyPath('数据用浏览器自带的本地存储（localStorage），关掉网页再开，待办还在')).toBe(
      false,
    )
    expect(isLikelyPath('数据用浏览器自带的本地存储')).toBe(false)
    expect(isLikelyPath('写完用编辑器检查一遍文件内容')).toBe(false)
    expect(isLikelyPath('导入的文件格式：纯文本，每行一条待办，空行自动跳过')).toBe(false)
    expect(isLikelyPath('界面用中文，简洁')).toBe(false)
    // 合法路径不误伤
    expect(isLikelyPath('index.html')).toBe(true)
    expect(isLikelyPath('src/main.ts')).toBe(true)
    expect(isLikelyPath('docs/我的 文件.md')).toBe(true)
    expect(isLikelyPath('game.js')).toBe(true)
  })

  it('坑 102 延伸：模型输出【执行方案】+ 假设/验证节 → 只抓文件路径', () => {
    const text = `好，方案定了。下面是我的计划：

【目标确认：做一个待办小工具】

【执行方案】
要写的文件：
- index.html（唯一一个文件——页面样式、待办列表界面、添加/删除功能、本地保存逻辑全在里面）

做法：打开这个文件就是完整小工具。

关键假设：
- 数据用浏览器自带的本地存储（localStorage），关掉网页再开，待办还在
- 界面用中文，简洁

验证计划：
- 写完用编辑器检查一遍文件内容
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.proposal.files.map((f) => f.path)).toEqual(['index.html'])
    expect(r.proposal.assumptions.length).toBe(2) // 假设节仍正确提取
    expect(r.proposal.verificationPlan.length).toBe(1)
  })
})

// ============================================================================
// #6 真机复验轮回归（2026-08-31）：文件行两种新形态（此前 malformed → 空方案卡）
// ============================================================================
describe('splitPathReason 候选制——复验轮真机形态', () => {
  it('冒号在括号内：「index.html（新建：完整的便签页面…）」→ path=index.html', () => {
    const r = splitPathReason(
      'index.html（新建：完整的便签页面，HTML + CSS + JS 全部内联，零依赖）',
    )
    expect(r.path).toBe('index.html')
    expect(r.reason).toContain('完整的便签页面')
  })
  it('原因在冒号后 + 行首动词：「新建 index.html（单文件）：顶部输入框」→ path=index.html', () => {
    const r = splitPathReason('新建 index.html（单文件，样式和逻辑都写里面）：顶部输入框+添加按钮')
    expect(r.path).toBe('index.html')
  })
  it('传统形态保持：尾括号注释', () => {
    expect(splitPathReason('a.js（改入口）')).toEqual({ path: 'a.js', reason: '改入口' })
    expect(splitPathReason('src/b.ts')).toEqual({ path: 'src/b.ts', reason: '' })
  })
  it('真机整块：parsePlanProposal 解析成功（复验轮原始消息形状）', () => {
    const text = `【目标确认：做一个便签页面】

【执行方案】

- index.html（新建：完整的便签页面，HTML + CSS + JS 全部内联，零依赖）

关键假设：
- 便签只存文本内容
`
    const r = parsePlanProposal(text)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.proposal.files[0]?.path).toBe('index.html')
  })
})
