import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { HIGH_IMPACT_LIST } from '../../src/domain/authorization/highImpactList'

// S-3 高影响操作清单唯一源闸（段2 §4 语言表行＝唯一源／实现侧 HIGH_IMPACT_LIST＝运行期形状）。
// 多一条／少一条／改一字即红。测试内不复制清单文本（那＝第二源），只复制「如何定位唯一源」的解析规则。
const SRC = new URL('../../../../docs/neonforgeV1.0.0/02-domain-strategy.md', import.meta.url)
const ANCHOR = /^\| 高影响操作清单 \|/

// 三步解析：①取最外一层全角括号（条目自带内嵌括号，禁止按第一个「）」截断）②括号段内首个全角冒号取右
// ③按全角分号切分、逐项 trim、丢空项。解析不出＝抛（闸不得因文档改写而静默绿）。
export function parseHighImpactLine(line: string): string[] {
  const open = line.indexOf('（')
  const close = line.lastIndexOf('）')
  if (open < 0 || close < 0 || close <= open) throw new Error('S-3：找不到最外一层全角括号')
  const inner = line.slice(open + 1, close)
  const colon = inner.indexOf('：')
  if (colon < 0) throw new Error('S-3：括号段内找不到全角冒号')
  const items = inner
    .slice(colon + 1)
    .split('；')
    .map((s) => s.trim())
    .filter(Boolean)
  if (items.length === 0) throw new Error('S-3：切出空项')
  return items
}

function anchorLines(): string[] {
  return readFileSync(SRC, 'utf-8')
    .split('\n')
    .filter((l) => ANCHOR.test(l))
}

describe('S-3 高影响操作清单唯一源闸', () => {
  it('D1 逐字比对：唯一源行锚点恰一处 ∧ 解析五项与 HIGH_IMPACT_LIST 集合逐项逐字相等', () => {
    const lines = anchorLines()
    // 锚点匹配数必须恰＝1：0（唯一源行被删/改写锚点）与 >1（出现第二个自称唯一源的行）都判红
    expect(lines).toHaveLength(1)

    const fromDoc = parseHighImpactLine(lines[0])
    // 顺序无关、逐项逐字；`改写 git 历史（force push/reset --hard 类）` 整项含内嵌括号参与比较，不做二次拆分
    expect(new Set(fromDoc)).toEqual(new Set(HIGH_IMPACT_LIST))
  })

  it('D2① 可红自证（领域侧漂移）：清单多一条不在唯一源的项 ⇒ 同一集合比较判红', () => {
    const fromDoc = new Set(parseHighImpactLine(anchorLines()[0]))
    const drifted = [...HIGH_IMPACT_LIST, '不在附录 A 的一条'] as unknown as string[]

    // 红被断言：喂给 D1 同一个比较，结果不相等
    expect(fromDoc).not.toEqual(new Set(drifted))
    // 漂移面恰为那一条（少一条／改一字同理由 D1 的集合相等捕获）
    expect(drifted.filter((x) => !fromDoc.has(x))).toEqual(['不在附录 A 的一条'])
  })

  it('D2② 可红自证（解析侧漂移）：解析形状被改坏 ⇒ 判红，不静默绿', () => {
    const line = anchorLines()[0]
    const fromDoc = new Set(parseHighImpactLine(line))

    // 形状 A（任务书原例）：末项后多一个 `）`。实测 lastIndexOf 取到新增的那个 ⇒ 末项被污染成
    // `外发仓库内容出本机）`（不是少切一项）——仍是解析侧漂移，仍须红。
    const extraClose = line.replace('外发仓库内容出本机） |', '外发仓库内容出本机）） |')
    expect(extraClose).not.toBe(line)
    const parsedExtraClose = parseHighImpactLine(extraClose)
    expect(new Set(parsedExtraClose)).not.toEqual(fromDoc)

    // 形状 B（补上任务书声明的目的「证伪悄悄少切一项仍判绿」）：分隔符 `；` 丢失 ⇒ 真·少切一项。
    // 基准取自身解析长度（不引 HIGH_IMPACT_LIST），本条只证解析侧。
    const lostSeparator = line.replace(
      '修改凭据配置；外发仓库内容出本机',
      '修改凭据配置外发仓库内容出本机',
    )
    const parsedLost = parseHighImpactLine(lostSeparator)
    expect(parsedLost).toHaveLength(parseHighImpactLine(line).length - 1)
    expect(new Set(parsedLost)).not.toEqual(fromDoc)
  })
})
