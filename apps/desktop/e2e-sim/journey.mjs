// e2e 模拟器域：旅程状态机（设计 §3/§5——决策点驱动 · 无阶段 · PHASE 终止点映射）
// 产品语义：无阶段目标驱动（goal → plan → approval → resolution → deliver——A0 决策点）
// 纯状态对象——工厂 + transition——L1 可测

import { Signal } from './signals.mjs'

/** PHASE → 终止点（无阶段——旅程决策点） */
export const PHASE_END = {
  req: 'goal', // 目标确认后停
  design: 'plan', // 方案确认后停
  dev: 'produced', // 首个产物确认后停
  all: 'delivered', // 交付（产物 + 解决确认 + 试玩）
}

/**
 * 创建旅程
 * @param {'req'|'design'|'dev'|'all'} [phase]
 */
export function createJourney(phase = 'all') {
  return {
    phase,
    confirmed: { goal: false, plan: false, resolution: false },
    produced: false, // 首个副作用产物（write/edit/bash done）
    delivered: false, // 交付完成（产物验证通过 + 解决确认）
    decisionPoints: [], // 决策点轨迹（可复现）
    phaseEnd: PHASE_END[phase] ?? 'delivered',
  }
}

/**
 * 推进旅程（信号 + 用户决策 → 新旅程状态）
 * @param {ReturnType<typeof createJourney>} j
 * @param {{ signal: string, action: string, text?: string }} turn
 * @returns {ReturnType<typeof createJourney>} 新旅程（不可变）
 */
export function advance(j, { signal, action }) {
  const next = {
    ...j,
    confirmed: { ...j.confirmed },
    decisionPoints: [...j.decisionPoints],
  }
  if (action === 'confirm-goal') {
    next.confirmed.goal = true
    next.decisionPoints.push('goal')
  }
  if (action === 'confirm-plan') {
    next.confirmed.plan = true
    next.decisionPoints.push('plan')
  }
  if (action === 'approve') next.decisionPoints.push('approval')
  if (action === 'confirm-resolution') {
    next.confirmed.resolution = true
    next.decisionPoints.push('resolution')
  }
  if (signal === Signal.PRODUCING) next.produced = true
  if (next.confirmed.resolution && next.produced) next.delivered = true
  return next
}

/** 旅程是否到达 PHASE 终止点（收敛——可停） */
export function terminated(j) {
  if (j.phaseEnd === 'goal') return j.confirmed.goal
  if (j.phaseEnd === 'plan') return j.confirmed.plan
  if (j.phaseEnd === 'produced') return j.produced
  return j.delivered
}
