import { describe, it, expect } from 'vitest'
import { Scope } from '../../src/domain/authorization/Scope'

// 命中判据按资源类型分流（详设 §8 表）：正例／反例逐字取自该表。
describe('Scope.covers 按资源类型分流的 glob（详设 §8）', () => {
  it('1. 仓库：src/** 命中 src/a/b.ts，不命中 test/a.ts', () => {
    const scope = Scope.initial('d1', [{ kind: '仓库', pattern: 'src/**' }])
    expect(scope.covers('仓库', 'src/a/b.ts')).toBe(true)
    expect(scope.covers('仓库', 'test/a.ts')).toBe(false)
  })

  it('2. 目录：docs/*/x.md 命中 docs/a/x.md，不命中 docs/a/b/x.md', () => {
    const scope = Scope.initial('d1', [{ kind: '目录', pattern: 'docs/*/x.md' }])
    expect(scope.covers('目录', 'docs/a/x.md')).toBe(true)
    expect(scope.covers('目录', 'docs/a/b/x.md')).toBe(false)
  })

  it('3. 命令前缀支：npm* 命中 npm install，不命中 nodepm x', () => {
    const scope = Scope.initial('d1', [{ kind: '命令', pattern: 'npm*' }])
    expect(scope.covers('命令', 'npm install')).toBe(true)
    expect(scope.covers('命令', 'nodepm x')).toBe(false)
  })

  it('4. 命令字面支：git status 命中自身，不命中 git push', () => {
    const scope = Scope.initial('d1', [{ kind: '命令', pattern: 'git status' }])
    expect(scope.covers('命令', 'git status')).toBe(true)
    expect(scope.covers('命令', 'git push')).toBe(false)
  })

  it('5. 网络后缀支：*.githubusercontent.com 命中 a.githubusercontent.com；*.github.com 不命中 evilgithub.com（点即边界）', () => {
    expect(
      Scope.initial('d1', [{ kind: '网络', pattern: '*.githubusercontent.com' }]).covers(
        '网络',
        'a.githubusercontent.com',
      ),
    ).toBe(true)
    expect(
      Scope.initial('d1', [{ kind: '网络', pattern: '*.github.com' }]).covers(
        '网络',
        'evilgithub.com',
      ),
    ).toBe(false)
  })

  it('6. 网络字面支＋** 全放行：example.com:443 只命中自身；** 命中任意资源', () => {
    const literal = Scope.initial('d1', [{ kind: '网络', pattern: 'example.com:443' }])
    expect(literal.covers('网络', 'example.com:443')).toBe(true)
    expect(literal.covers('网络', 'example.com')).toBe(false)
    const all = Scope.initial('d1', [{ kind: '命令', pattern: '**' }])
    expect(all.covers('命令', 'rm -rf /')).toBe(true)
  })
})
