import { describe, it, expect } from 'vitest'
import { parseLocalUrl, isServerCommand } from '../../src/main/serviceManager'
// 2026-08-06 环境单源（d4c6e2c）：normalizeServerCommand/HOST_RESERVED_PORTS 移到 envManager（显式端口替换 --port 0——坑 77 vite 忽略 0）
import { normalizeServerCommand, HOST_RESERVED_PORTS } from '../../src/main/envManager'

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

  it('normalizeServerCommand：vite 类命令注入/替换显式端口（--port 0 无效——vite 忽略 0 落默认 5173，坑 77 实测；显式端口有效）', () => {
    expect(normalizeServerCommand('npx vite', 5190)).toBe('npx vite --port 5190')
    expect(normalizeServerCommand('vite', 5191)).toBe('vite --port 5191')
    expect(normalizeServerCommand('vite --port 0', 5192)).toBe('vite --port 5192') // --port 0 替换为显式
    expect(normalizeServerCommand('npx vite --port 5199', 5193)).toBe('npx vite --port 5199') // 已有显式端口尊重
    expect(normalizeServerCommand('npm run dev', 5194)).toBe('npm run dev') // 脚本类不动（无法注入）
    expect(normalizeServerCommand('  npx vite  ', 5195)).toBe('npx vite --port 5195') // trim
    expect(HOST_RESERVED_PORTS.has(5173)).toBe(true)
    expect(HOST_RESERVED_PORTS.has(5175)).toBe(true)
    expect(HOST_RESERVED_PORTS.has(5174)).toBe(false)
  })
})
