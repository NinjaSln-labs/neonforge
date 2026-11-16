// P1-04 IPC 契约漂移护栏：main handler / preload invoke / 推送事件通道静态对齐。
// 目的：新增或改名 IPC 时，preload 与 main 任一侧漏改会在这里直接失败，而不是等到运行时。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const MAIN_IPC = path.join(APP_ROOT, 'src/main/ipc.ts')
const PRELOAD = path.join(APP_ROOT, 'src/preload/preload.ts')

function readSource(file: string): string {
  return readFileSync(file, 'utf-8')
}

function extract(source: string, pattern: string): string[] {
  const names: string[] = []
  for (const match of source.matchAll(new RegExp(pattern, 'g'))) names.push(match[1])
  return names
}

function extractUniqueSorted(source: string, pattern: string): string[] {
  return [...new Set(extract(source, pattern))].sort()
}

const mainSource = readSource(MAIN_IPC)
const preloadSource = readSource(PRELOAD)

const mainHandles = extract(mainSource, String.raw`ipcMain\.handle\(\s*'([^']+)'`)
const mainSends = extract(mainSource, String.raw`\.send\(\s*'([^']+)'`)
const preloadInvokes = extract(preloadSource, String.raw`ipcRenderer\.invoke\(\s*'([^']+)'`)
const preloadListeners = extract(preloadSource, String.raw`ipcRenderer\.on\(\s*'([^']+)'`)

describe('IPC 契约漂移护栏（P1-04）', () => {
  it('preload invoke 的每个通道都在 main 注册了 handler（且无重复注册）', () => {
    const handlers = new Set(mainHandles)
    expect(mainHandles.length).toBe(handlers.size)
    for (const channel of preloadInvokes) {
      expect(handlers.has(channel), `main 缺少 handler：${channel}`).toBe(true)
    }
  })

  it('main 注册的每个 handler 都有 preload 调用方（防止死通道）', () => {
    const invokes = new Set(preloadInvokes)
    expect(preloadInvokes.length).toBe(invokes.size)
    for (const channel of mainHandles) {
      expect(invokes.has(channel), `preload 缺少 invoke：${channel}`).toBe(true)
    }
  })

  it('preload 监听的推送通道都由 main 发送', () => {
    const sends = new Set(mainSends)
    for (const channel of preloadListeners) {
      expect(sends.has(channel), `main 未发送推送通道：${channel}`).toBe(true)
    }
  })

  it('IPC 通道名遵循 domain:action 命名', () => {
    const all = new Set([...mainHandles, ...mainSends, ...preloadInvokes, ...preloadListeners])
    for (const channel of all) {
      expect(channel, `非法通道名：${channel}`).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/)
    }
  })

  it('main handle 与 preload invoke 的通道集合完全一致', () => {
    expect(extractUniqueSorted(mainSource, String.raw`ipcMain\.handle\(\s*'([^']+)'`)).toEqual(
      extractUniqueSorted(preloadSource, String.raw`ipcRenderer\.invoke\(\s*'([^']+)'`),
    )
  })
})
