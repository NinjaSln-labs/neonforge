// 测试/演示注入通道访问（2026-08-15 Q10——原 4 处散落类型断言收敛单例）
// 仅测试 mock bridge 存在（e2e/L5 注入 window.neonforge.demo.*）；产品运行时无 demo 字段 → undefined
import type { DemoBridge } from './types'

export function getDemoBridge(): DemoBridge | undefined {
  return (window.neonforge as unknown as { demo?: DemoBridge }).demo
}
