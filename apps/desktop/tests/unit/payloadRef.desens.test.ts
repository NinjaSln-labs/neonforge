import { describe, it, expect } from 'vitest'
import { EvidenceItem } from '../../src/domain/evidence/EvidenceItem'

const mk = (content: string) =>
  EvidenceItem.record({ evidenceId: 'e1', delegationId: 'd1', type: '命令输出', content })

describe('PayloadRef 落账前脱敏（S-4，与 desens-scan 同族）', () => {
  const rejected: Array<[string, string]> = [
    ['sk 型密钥', `done sk-${'A'.repeat(20)}`],
    ['AWS 访问键', `env AKIA${'B'.repeat(12)} set`],
    ['Bearer 令牌', `auth Bearer ${'x'.repeat(25)}`],
    ['私钥块', '-----BEGIN ' + 'RSA PRIVATE KEY-----'], // 拆拼避免闸按字面命中（运行期拼接后仍触发 S-4）
    ['键值赋值', `api_key = "${'z'.repeat(14)}"`],
  ]

  for (const [name, content] of rejected) {
    it(`${name} ⇒ 拒绝落账（throw）`, () => {
      expect(() => mk(content)).toThrow(/S-4/)
    })
  }

  it('良性内容放行', () => {
    expect(() => mk('vitest 42 passed, no secrets here')).not.toThrow()
  })
})
