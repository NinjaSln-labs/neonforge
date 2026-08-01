// Preheating（ticket 09）：项目打开 → 预热候选——首请求命中率优化
// 边界：Preheating=预热候选与触发时机；真实预热调用经 Gateway（02）——此模块不消耗 API

export interface PreheatPlan {
  shouldPreheat: boolean
  why: string
  actions: string[] // 预热动作（V1：上下文加载；真实 API 预热待 Key/网络）
}

// 打开项目时评估预热候选（触发点：workspace.openFolder）
export function planPreheat(rootPath: string | null): PreheatPlan {
  if (!rootPath) return { shouldPreheat: false, why: '无项目', actions: [] }
  return {
    shouldPreheat: true,
    why: `项目已打开（${rootPath}）——首请求前预热`,
    actions: [
      '加载搭档须知 .neonforge（08d 已就绪）',
      '索引项目结构（文件树——03 已就绪）',
      'V1 真实 API 预热（prewarm 请求）待 Key 校验后接入'
    ]
  }
}
