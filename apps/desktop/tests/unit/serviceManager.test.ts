import { describe, it, expect } from 'vitest'
import { parseLocalUrl, isServerCommand } from '../../src/main/serviceManager'

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
})
