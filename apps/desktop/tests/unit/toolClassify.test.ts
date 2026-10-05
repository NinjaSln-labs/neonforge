// S1b Task 0：main/toolClassify 等价回归——用例取自旧 domain/conversationState 同名判定（继承锁定），
// 落点迁移不得改语义；localhost 边界四条源自该函数 doc 的 fail-closed 要求。
import { describe, expect, it } from 'vitest'
import { classifyReadonly, isLocalhostCommand } from '../../src/main/toolClassify.js'

describe('toolClassify 等价回归（classifyReadonly）', () => {
  it('工具类型：write/edit hazardous；read/search/LSP/check-capability readonly', () => {
    expect(classifyReadonly('write')).toBe('hazardous')
    expect(classifyReadonly('edit')).toBe('hazardous')
    expect(classifyReadonly('read')).toBe('readonly')
    expect(classifyReadonly('search')).toBe('readonly')
    expect(classifyReadonly('check-capability')).toBe('readonly')
    expect(classifyReadonly('find_definition')).toBe('readonly')
  })

  it('命令头白名单：ls/cat 只读；npm install 与 sudo rm 高危', () => {
    expect(classifyReadonly('bash', 'ls -la')).toBe('readonly')
    expect(classifyReadonly('bash', 'cd /test && cat package.json')).toBe('readonly')
    expect(classifyReadonly('bash', 'npm install three')).toBe('hazardous')
    expect(classifyReadonly('bash', 'sudo rm -rf /')).toBe('hazardous')
  })

  it('链递归：链中任一危险段 → hazardous', () => {
    expect(classifyReadonly('bash', 'ls -la && npm install')).toBe('hazardous')
    expect(classifyReadonly('bash', 'cat a.txt; git push')).toBe('hazardous')
    expect(classifyReadonly('bash', 'ls -la && cat a.txt')).toBe('readonly')
    expect(classifyReadonly('bash', 'ls -la | grep x')).toBe('readonly')
  })

  it('只读形态不误伤（node -v / which）与真写操作仍拦', () => {
    expect(classifyReadonly('bash', 'node -v')).toBe('readonly')
    expect(classifyReadonly('bash', 'node -v 2>&1; echo ---npm---; npm -v 2>&1')).toBe('readonly')
    expect(classifyReadonly('bash', 'which node && node --version')).toBe('readonly')
    expect(classifyReadonly('bash', 'ls node_modules/.bin/vite 2>&1')).toBe('readonly')
    expect(classifyReadonly('bash', 'node script.js')).toBe('hazardous')
    expect(classifyReadonly('bash', 'npm install three && node main.js')).toBe('hazardous')
  })

  it('stderr 重定向不落盘（2>&1／2>/dev/null）；真写重定向拦', () => {
    expect(classifyReadonly('bash', 'head -20 README.md 2>/dev/null')).toBe('readonly')
    expect(classifyReadonly('bash', 'cat config.yaml 2>>/dev/null')).toBe('readonly')
    expect(classifyReadonly('bash', 'echo hi > out.txt 2>/dev/null')).toBe('hazardous')
  })

  it('git 子命令级：status/log/diff 只读；push/commit 写', () => {
    expect(classifyReadonly('bash', 'git status')).toBe('readonly')
    expect(classifyReadonly('bash', 'git log --oneline')).toBe('readonly')
    expect(classifyReadonly('bash', 'git diff HEAD')).toBe('readonly')
    expect(classifyReadonly('bash', 'git push origin main')).toBe('hazardous')
    expect(classifyReadonly('bash', 'git commit -m x')).toBe('hazardous')
  })

  it('网络只读 curl/wget GET·HEAD → network-read；带 body 或写方法 → hazardous', () => {
    expect(classifyReadonly('bash', 'curl -s http://localhost:6696')).toBe('network-read')
    expect(classifyReadonly('bash', 'curl -s -X HEAD https://example.com')).toBe('network-read')
    expect(classifyReadonly('bash', 'curl -X POST -d x http://localhost')).toBe('hazardous')
    expect(classifyReadonly('bash', 'wget -q https://example.com')).toBe('network-read')
    expect(classifyReadonly('bash', 'curl -o out.html http://localhost')).toBe('hazardous')
    expect(classifyReadonly('bash', 'curl -o /dev/null http://localhost')).toBe('network-read')
  })

  it('空命令与写重定向 fail-closed', () => {
    expect(classifyReadonly('bash', '')).toBe('hazardous')
    expect(classifyReadonly('bash', '   ')).toBe('hazardous')
    expect(classifyReadonly('bash', 'ls -la > out.txt')).toBe('hazardous')
  })
})

describe('toolClassify 等价回归（isLocalhostCommand 精确 host 边界）', () => {
  it('localhost／127.0.0.1／[::1]（可带端口）→ 放行', () => {
    expect(isLocalhostCommand('curl -s http://localhost:6696')).toBe(true)
    expect(isLocalhostCommand('curl http://127.0.0.1/health')).toBe(true)
    expect(isLocalhostCommand('curl http://[::1]:8080')).toBe(true)
    expect(isLocalhostCommand('curl localhost')).toBe(true)
  })

  it('子串伪装不得自动放行（127.0.0.1.attacker.com／localhost.evil.io）', () => {
    expect(isLocalhostCommand('curl http://127.0.0.1.attacker.com/')).toBe(false)
    expect(isLocalhostCommand('curl http://localhost.evil.io/')).toBe(false)
    expect(isLocalhostCommand('curl https://notlocalhost.example.com')).toBe(false)
    expect(isLocalhostCommand('curl http://example.com')).toBe(false)
  })
})
