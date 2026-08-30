// 协议工具 schema 单源 + 参数校验器（V1.5 S1 Task 1.1）
// 四个协议工具（模型主动产出决策内容的通道——§3.2 值对象对齐）：
//   propose_goal    → GoalProposal（statement + assumptions）
//   propose_plan    → PlanProposal（summary + files[{path,reason}] + assumptions + verificationPlan）
//   report_completion → CompletionClaim（summary + verification[{command,output,passed}] + pending_questions）
//   ask_user        → 提问/给选项（missing_info / approach_choice / risk_confirmation / suggestion）
// 硬约束：
// - 数组一层为限：任何 items.properties 内不得再含 type:'array'（防深层嵌套压垮模型生成质量）
// - parameters 全部 additionalProperties:false + required 齐全（schema 即文档——模型端字段白名单）
// - files[].path 校验先过 splitPathReason 候选拆分再 isLikelyPath（Spike-2b 结论：
//   硬化文案仍兜不住模型漂移——动词前缀/尾括号/冒号说明允许落地拆分，拆不出路径形态才报错）
// 纯逻辑无 React/node 依赖——L1 可测。
// 注意：JSON 解析失败的重试语义（「JSON 解析失败——重试 1 次后仍失败」）由调用方处理，本模块只做参数级校验。

import { isLikelyPath, splitPathReason } from './planProposalParser.js'

// ============================================================================
// JSON Schema 类型（轻量手写——不引入 ajv/zod 依赖）
// ============================================================================

/** 参数属性节点（数组一层为限——items.properties 内不得再含 array 类型属性） */
export interface ProtocolParamSchema {
  type: 'string' | 'boolean' | 'object' | 'array'
  description: string
  enum?: string[]
  items?: ProtocolItemSchema
}

/** 数组条目节点（type 不得为 'array'——扁平约束的类型层承载） */
export interface ProtocolItemSchema {
  type: 'string' | 'boolean' | 'object'
  description: string
  enum?: string[]
  properties?: Record<string, ProtocolParamSchema>
  required?: string[]
}

/** 工具参数根 schema（object + required + 白名单） */
export interface ProtocolToolParameters {
  type: 'object'
  properties: Record<string, ProtocolParamSchema>
  required: string[]
  additionalProperties: false
}

export interface ProtocolToolDef {
  name: string
  description: string
  parameters: ProtocolToolParameters
}

// ============================================================================
// PROTOCOL_TOOL_DEFS（schema 单源——提示词注入与参数校验共用此常量）
// ============================================================================

const PATH_FIELD_DESCRIPTION =
  '只填一个真实存在的或将创建的文件路径本身（如 index.html、src/App.jsx）。禁止：附注/括号说明/『A 或 B』候选/『所有…的文件』这类集合描述；还没定位到的具体文件不要猜——写进 assumptions 字段说明定位策略'

export const PROTOCOL_TOOL_DEFS: readonly ProtocolToolDef[] = [
  {
    name: 'propose_goal',
    description: '目标确认提议：statement 一句话准确目标',
    parameters: {
      type: 'object',
      properties: {
        statement: {
          type: 'string',
          description: '一句话准确目标（用户确认后成为本次会话的目标）',
        },
        assumptions: {
          type: 'array',
          description: '关键假设（用户从未确认过的细节——必须显式列出）',
          items: { type: 'string', description: '一条假设' },
        },
      },
      required: ['statement'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_plan',
    description:
      '执行方案提议：files[{path,reason}] 文件清单 + summary 一句话方案；assumptions 放定位策略等假设，verification_plan 写明怎么证明做成了',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '一句话方案' },
        files: {
          type: 'array',
          description: '文件清单（每条 = 一个文件路径 + 为什么动它）',
          items: {
            type: 'object',
            description: '一个文件条目',
            properties: {
              path: { type: 'string', description: PATH_FIELD_DESCRIPTION },
              reason: { type: 'string', description: '为什么动这个文件（一句话）' },
            },
            required: ['path', 'reason'],
          },
        },
        assumptions: {
          type: 'array',
          description: '方案假设（技术选型/行为细节/文件定位策略——用户审阅点）',
          items: { type: 'string', description: '一条假设' },
        },
        verification_plan: {
          type: 'array',
          description: '验证计划（怎么证明做成了——「已解决」的证据承诺）',
          items: { type: 'string', description: '一条验证步骤（如 npx vitest run）' },
        },
      },
      required: ['summary', 'files'],
      additionalProperties: false,
    },
  },
  {
    name: 'report_completion',
    description: '完成声明：verification 只列真实跑过的命令',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '一句话完成声明' },
        verification: {
          type: 'array',
          description: '可核验证据（真实跑过的命令 + 输出 + 是否通过）',
          items: {
            type: 'object',
            description: '一条验证记录',
            properties: {
              command: { type: 'string', description: '真实执行过的验证命令' },
              output: { type: 'string', description: '命令输出（关键行摘录）' },
              passed: { type: 'boolean', description: '是否通过（true/false——不许 omit）' },
            },
            required: ['command', 'passed'],
          },
        },
        pending_questions: {
          type: 'array',
          description: '自己不确定/需要用户判断的事项（不足项显式声明）',
          items: { type: 'string', description: '一条待确认问题' },
        },
      },
      required: ['summary', 'verification'],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_user',
    description: '向用户提问/给选项',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '问题本身（一句话明确）' },
        type: {
          type: 'string',
          description: '提问种类',
          enum: ['missing_info', 'approach_choice', 'risk_confirmation', 'suggestion'],
        },
        options: {
          type: 'array',
          description: '候选选项（可选——给了则用户可直接点选）',
          items: {
            type: 'object',
            description: '一个候选选项',
            properties: {
              label: { type: 'string', description: '选项短标签' },
              description: { type: 'string', description: '选项说明' },
            },
            required: ['label'],
          },
        },
      },
      required: ['question', 'type'],
      additionalProperties: false,
    },
  },
]

/** 协议工具名集合（运行时白名单——与 PROTOCOL_TOOL_DEFS 单源派生） */
export const PROTOCOL_TOOL_NAMES: ReadonlySet<string> = new Set(
  PROTOCOL_TOOL_DEFS.map((d) => d.name),
)

// ============================================================================
// validateProtocolArgs（参数校验器——路径化错误，调用方直接回灌给模型修参）
// ============================================================================

export type ProtocolArgsValidationResult = { ok: true } | { ok: false; errors: string[] }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 校验可选的字符串数组字段（存在时必须为 string[]） */
function checkStringArray(args: Record<string, unknown>, key: string, errors: string[]): void {
  const v = args[key]
  if (v === undefined) return
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    errors.push(`${key}: 期望字符串数组（["条目一","条目二"] 形态）`)
  }
}

/** files[].path 校验（Spike-2b：先 splitPathReason 候选拆分再 isLikelyPath） */
function checkPlanFilePath(rawPath: unknown, index: number, errors: string[]): void {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    errors.push(`files[${index}].path: 必填字符串（文件路径本身）`)
    return
  }
  const { path } = splitPathReason(rawPath)
  if (!isLikelyPath(path)) {
    errors.push(`files[${index}].path: 期望文件路径形态——示例：index.html（新建首页）`)
  }
}

/** 按 PROTOCOL_TOOL_DEFS 校验参数（tool 未知名 → ok:false 防御） */
export function validateProtocolArgs(tool: string, args: unknown): ProtocolArgsValidationResult {
  if (!PROTOCOL_TOOL_NAMES.has(tool)) {
    return { ok: false, errors: [`unknown tool: ${tool}（非协议工具）`] }
  }
  if (!isPlainObject(args)) {
    return { ok: false, errors: [`${tool}: 参数必须为 JSON 对象`] }
  }
  const errors: string[] = []

  if (tool === 'propose_goal') {
    if (typeof args.statement !== 'string' || !args.statement.trim()) {
      errors.push('statement: 必填字符串（一句话准确目标）')
    }
    checkStringArray(args, 'assumptions', errors)
  }

  if (tool === 'propose_plan') {
    if (typeof args.summary !== 'string' || !args.summary.trim()) {
      errors.push('summary: 必填字符串（一句话方案）')
    }
    if (!Array.isArray(args.files) || args.files.length === 0) {
      errors.push('files: 必填非空数组（至少一个 {path, reason} 文件条目）')
    } else {
      args.files.forEach((f, i) => {
        if (!isPlainObject(f)) {
          errors.push(`files[${i}]: 必须为对象 {path, reason}`)
          return
        }
        checkPlanFilePath(f.path, i, errors)
        if (typeof f.reason !== 'string') {
          errors.push(`files[${i}].reason: 必填字符串（为什么动这个文件）`)
        }
      })
    }
    checkStringArray(args, 'assumptions', errors)
    checkStringArray(args, 'verification_plan', errors)
  }

  if (tool === 'report_completion') {
    if (typeof args.summary !== 'string' || !args.summary.trim()) {
      errors.push('summary: 必填字符串（一句话完成声明）')
    }
    if (!Array.isArray(args.verification) || args.verification.length === 0) {
      errors.push('verification: 必填非空数组（至少一条真实跑过的验证记录）')
    } else {
      args.verification.forEach((v, i) => {
        if (!isPlainObject(v)) {
          errors.push(`verification[${i}]: 必须为对象 {command, output?, passed}`)
          return
        }
        if (typeof v.command !== 'string' || !v.command.trim()) {
          errors.push(`verification[${i}].command: 必填字符串（真实执行过的命令）`)
        }
        if (typeof v.passed !== 'boolean') {
          errors.push(`verification[${i}].passed: 必填布尔值（true=通过/false=未通过——不许 omit）`)
        }
        if (v.output !== undefined && typeof v.output !== 'string') {
          errors.push(`verification[${i}].output: 可选，但必须为字符串`)
        }
      })
    }
    checkStringArray(args, 'pending_questions', errors)
  }

  if (tool === 'ask_user') {
    if (typeof args.question !== 'string' || !args.question.trim()) {
      errors.push('question: 必填字符串（问题本身）')
    }
    const askTypeDef = PROTOCOL_TOOL_DEFS.find((d) => d.name === 'ask_user')
    const enumValues = askTypeDef?.parameters.properties.type?.enum ?? []
    if (typeof args.type !== 'string' || !enumValues.includes(args.type)) {
      errors.push(`type: 必填枚举之一（${enumValues.join('/')}）`)
    }
    if (args.options !== undefined) {
      if (!Array.isArray(args.options)) {
        errors.push('options: 可选，但必须为对象数组 [{label, description}]')
      } else {
        args.options.forEach((o, i) => {
          if (!isPlainObject(o)) {
            errors.push(`options[${i}]: 必须为对象 {label, description?}`)
            return
          }
          if (typeof o.label !== 'string' || !o.label.trim()) {
            errors.push(`options[${i}].label: 必填字符串（选项短标签）`)
          }
          if (o.description !== undefined && typeof o.description !== 'string') {
            errors.push(`options[${i}].description: 可选，但必须为字符串`)
          }
        })
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
