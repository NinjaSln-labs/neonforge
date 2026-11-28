// 2026-11-28 审计（D-4）：e2e-sim/*.mjs 的类型声明（测试侧 import 用的最小契约）。
// e2e 模拟器域是纯 JS（.mjs），L1 单测直接 import；没有声明文件时 TS 报 TS7016，
// 测试类型检查无法开启。此文件只声明测试实际引用的符号形状。
// 注意：declare module 的通配必须相对「模块路径模式」，不能写成 import 时的相对路径。

declare module '*/e2e-sim/signals.mjs' {
  export const Signal: Record<string, string>
  export function deriveModelSignal(
    input?: { content?: string; candidates?: unknown[]; tools?: unknown[] },
    statusBar?: string,
    toolCards?: string[],
  ): string
  export function hasPlanMarkWithoutLines(content?: string): boolean
}

declare module '*/e2e-sim/convergence.mjs' {
  export function createGuard(opts?: { staleLimit?: number; totalLimit?: number }): {
    readonly staleCount: number
    readonly totalRounds: number
    observe(fp: string): 'progressing' | 'stale' | 'exceeded'
    reset(): void
  }
}

declare module '*/e2e-sim/decide.mjs' {
  export const Question: Record<string, string>
  export function classifyQuestion(content?: string): string | null
  export function profileComplete(profile: Record<string, unknown>): boolean
  export function matchOption(question: unknown, options: unknown): unknown
  export function understandOption(question: unknown, text: string): unknown
  export function typeAnswer(question: unknown): string | null
  export function decide(
    signal: string,
    ctx?: { content?: string; candidates?: unknown[]; profile?: Record<string, unknown> },
  ): {
    action: string
    reason?: string
    understanding?: string
    text?: string
    profilePatch?: Record<string, string[]>
    [k: string]: unknown
  }
  export function verifyGoalEcho(reply: string, chosenText: string): boolean
}

declare module '*/e2e-sim/journey.mjs' {
  export const UNTIL_END: Record<string, unknown>
  export function createJourney(until?: string): {
    confirmed: Record<string, boolean>
    decisionPoints: string[]
    [k: string]: unknown
  }
  export function advance(
    j: { confirmed: Record<string, boolean>; decisionPoints: string[]; [k: string]: unknown },
    input: { signal: string; action: string },
  ): { confirmed: Record<string, boolean>; decisionPoints: string[]; [k: string]: unknown }
  export function terminated(j: unknown): boolean
}

declare module '*/e2e-sim/verify.mjs' {
  export function verifyPlanComplete(content?: string): {
    ok: boolean
    length: number
    hasKeywords: boolean
  }
  export function verifyArtifacts(
    planned?: string[],
    produced?: string[],
  ): { ok: boolean; missing: string[] }
  export function verifyPlayable(input: { status: number; bytes: number }): {
    ok: boolean
    status: number
    bytes: number
  }
  export function verifyRequirementsComplete(profile?: Record<string, unknown>): {
    ok: boolean
    missing: string[]
  }
}
