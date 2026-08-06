import { describe, it, expect } from 'vitest'
import { parseLocalUrl, isServerCommand, normalizeServerCommand, HOST_RESERVED_PORTS } from '../../src/main/serviceManager'

// ServiceManager（2026-08-06 设计层升级——服务生命周期独立）：解析/白名单纯函数
// startServer 真实起进程 → 集成验证（L4/实测）；此处测确定性逻辑

describe('ServiceManager 服务管理（2026-08-06 设计层升级）', () => {
  it('parseLocalUrl：解析 vite/构建工具输出里的本地地址', () => {
    expect(parseLocalUrl('  VITE v5.4.21  ready in 975 ms\n  ➜  Local:   http://localhost:5174/\n')).toBe('http://localhost:5174/')
    expect(parseLocalUrl('Local: http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080/')
    expect(parseLocalUrl('plain text no url')).toBeNull()
    expect(parseLocalUrl('')).toBeNull()
  })

  it('isServerCommand：只接受服务类命令（命令选择白名单——模型不能任意命令起服务）', () => {
    expect(isServerCommand('npx vite')).toBe(true)
    expect(isServerCommand('vite')).toBe(true)
    expect(isServerCommand('npm run dev')).toBe(true)
    expect(isServerCommand('pnpm dev')).toBe(true)
    expect(isServerCommand('yarn preview')).toBe(true)
    expect(isServerCommand('rm -rf /')).toBe(false) // 非服务命令拒绝
    expect(isServerCommand('curl http://x.com')).toBe(false)
    expect(isServerCommand('')).toBe(false)
  })

  it('normalizeServerCommand：vite 类命令强制 --port 0（绝不碰宿主 5173/5175——用户「一直用 5173」根因）', () => {
    expect(normalizeServerCommand('npx vite')).toBe('npx vite --port 0')
    expect(normalizeServerCommand('vite')).toBe('vite --port 0')
    expect(normalizeServerCommand('npx vite --port 5199')).toBe('npx vite --port 5199') // 已有 --port 不重复
    expect(normalizeServerCommand('npm run dev')).toBe('npm run dev') // 脚本类不动（无法注入）
    expect(normalizeServerCommand('  npx vite  ')).toBe('npx vite --port 0') // trim
    expect(HOST_RESERVED_PORTS.has(5173)).toBe(true)
    expect(HOST_RESERVED_PORTS.has(5175)).toBe(true)
    expect(HOST_RESERVED_PORTS.has(5174)).toBe(false)
  })
})
