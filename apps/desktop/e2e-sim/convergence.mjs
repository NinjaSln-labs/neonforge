// e2e 模拟器域：收敛守卫（设计 §3——#9 域对象化）
// 探索容忍：进展轮（指纹变化——消息/工具卡）不消耗轮次上限；连续停滞轮判死；总轮硬上限
// 纯状态对象——工厂函数创建——L1 可测
// 原实现：e2e-0to1.mjs 四阶段各一份 staleRounds 拷贝（#9 9604016）——本模块单一实现

/**
 * 创建收敛守卫
 * @param {{ staleLimit?: number, totalLimit?: number }} [cfg]
 *   staleLimit：连续停滞轮判死阈值（原需求 20 / 设计开发测试 15——配置化）
 *   totalLimit：总轮硬上限（防无限提问）
 */
export function createGuard({ staleLimit = 20, totalLimit = 60 } = {}) {
  let staleCount = 0
  let totalRounds = 0
  let lastFp = ''
  return {
    get staleCount() {
      return staleCount
    },
    get totalRounds() {
      return totalRounds
    },
    /** 观察一轮（传消息/工具卡指纹）——返回 'progressing'（有新进展）| 'stale'（内容重复）| 'exceeded'（判死） */
    observe(fp) {
      totalRounds++
      if (totalRounds > totalLimit) return 'exceeded'
      if (fp === lastFp) {
        staleCount++
        return staleCount >= staleLimit ? 'exceeded' : 'stale'
      }
      lastFp = fp
      staleCount = 0 // 有新进展——重置停滞计数（探索容忍）
      return 'progressing'
    },
    /** 重置（阶段切换时） */
    reset() {
      staleCount = 0
      totalRounds = 0
      lastFp = ''
    },
  }
}
