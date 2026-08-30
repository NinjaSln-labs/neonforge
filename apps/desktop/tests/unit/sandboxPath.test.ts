// 沙箱路径规范化单测（#6 真机 2026-08-30——P1-6/P2-8 双重嵌套根因的单源修复）
// 真机证据：approve-files 传「任务目录/style.css」→ 注册 `/root/任务目录/任务目录/style.css`
// → 实际 write 真实路径被 gate 判清单外 → 批准被架空
import { describe, expect, it } from 'vitest'
import { resolveSandboxPath } from '../../src/domain/sandboxPath.js'

const ROOT = '/Users/sin/Documents/NeonForge/写一个番茄钟计时器页面-单html文件-'

describe('resolveSandboxPath——双重嵌套剥离（P1-6）', () => {
  it('相对路径带任务目录前缀（模型 cwd 语义混淆）→ 剥前缀拼 rootPath', () => {
    expect(resolveSandboxPath(ROOT, '写一个番茄钟计时器页面-单html文件-/style.css')).toBe(
      `${ROOT}/style.css`,
    )
  })
  it('前缀不带尾斜杠（整目录名等同路径本身）→ rootPath 本身', () => {
    expect(resolveSandboxPath(ROOT, '写一个番茄钟计时器页面-单html文件-')).toBe(ROOT)
  })
  it('普通相对路径 → 拼 rootPath（原行为保持）', () => {
    expect(resolveSandboxPath(ROOT, 'index.html')).toBe(`${ROOT}/index.html`)
    expect(resolveSandboxPath(ROOT, 'src/a.ts')).toBe(`${ROOT}/src/a.ts`)
  })
  it('已是 rootPath 子路径（绝对）→ 原样', () => {
    expect(resolveSandboxPath(ROOT, `${ROOT}/index.html`)).toBe(`${ROOT}/index.html`)
    expect(resolveSandboxPath(ROOT, ROOT)).toBe(ROOT)
  })
  it('沙箱外绝对路径 → 原样（沙箱判定由调用方承担）', () => {
    expect(resolveSandboxPath(ROOT, '/tmp/nf-e2e-test/x.json')).toBe('/tmp/nf-e2e-test/x.json')
  })
  it('类绝对单段（/package.json）→ 原样（util 契约=绝对不加工；join 由 main resolvePath 预处理剥根斜杠）', () => {
    expect(resolveSandboxPath(ROOT, '/package.json')).toBe('/package.json')
  })
  it('rootPath 缺省 → 原样返回（调用方自行处理无沙箱语义）', () => {
    expect(resolveSandboxPath('', 'a/b.js')).toBe('a/b.js')
  })
  it('空路径 → 空串', () => {
    expect(resolveSandboxPath(ROOT, '')).toBe('')
  })
  it('批批准侧与门控侧同基准：同一路径两种写法规范化后一致', () => {
    // 注册时模型带前缀，写入时不带——规范化后必须相等（批准生效的关键）
    const registered = resolveSandboxPath(ROOT, '写一个番茄钟计时器页面-单html文件-/style.css')
    const written = resolveSandboxPath(ROOT, 'style.css')
    expect(registered).toBe(written)
  })
})
