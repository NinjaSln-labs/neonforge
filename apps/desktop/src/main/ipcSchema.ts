// IPC 运行时契约校验（P1-04 基础设施）：preload/types/main 三方漂移时 fail-fast。
// 轻量 schema 子集（不引入 zod）——字符串/数字/布尔/对象/数组/枚举/可选字段；未知字段忽略。
export type IpcSchema =
  | { type: 'string'; enum?: readonly string[]; minLength?: number; maxLength?: number }
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'boolean' }
  | { type: 'object'; properties?: Record<string, IpcSchema>; required?: readonly string[]; allowUnknown?: boolean }
  | { type: 'array'; items?: IpcSchema; maxItems?: number }
  | { type: 'null' }
  | { type: 'any' }

export type IpcValidationResult = { ok: true } | { ok: false; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateAt(value: unknown, schema: IpcSchema, path: string): IpcValidationResult {
  switch (schema.type) {
    case 'any':
      return { ok: true }
    case 'null':
      return value === null ? { ok: true } : { ok: false, error: `${path} 必须为 null` }
    case 'string': {
      if (typeof value !== 'string') return { ok: false, error: `${path} 必须为字符串` }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return { ok: false, error: `${path} 长度不足 ${schema.minLength}` }
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return { ok: false, error: `${path} 长度超过 ${schema.maxLength}` }
      }
      if (schema.enum && !schema.enum.includes(value)) {
        return { ok: false, error: `${path} 不在允许值：${schema.enum.join('/')}` }
      }
      return { ok: true }
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return { ok: false, error: `${path} 必须为数字` }
      }
      if (schema.integer && !Number.isInteger(value)) {
        return { ok: false, error: `${path} 必须为整数` }
      }
      if (schema.min !== undefined && value < schema.min) {
        return { ok: false, error: `${path} 小于 ${schema.min}` }
      }
      if (schema.max !== undefined && value > schema.max) {
        return { ok: false, error: `${path} 大于 ${schema.max}` }
      }
      return { ok: true }
    }
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true } : { ok: false, error: `${path} 必须为布尔` }
    case 'array': {
      if (!Array.isArray(value)) return { ok: false, error: `${path} 必须为数组` }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        return { ok: false, error: `${path} 超过 ${schema.maxItems} 项` }
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const r = validateAt(value[i], schema.items, `${path}[${i}]`)
          if (!r.ok) return r
        }
      }
      return { ok: true }
    }
    case 'object': {
      if (!isPlainObject(value)) return { ok: false, error: `${path} 必须为对象` }
      for (const key of schema.required ?? []) {
        if (!(key in value)) return { ok: false, error: `${path}.${key} 为必填` }
      }
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (value[key] === undefined) continue
        const r = validateAt(value[key], sub, `${path}.${key}`)
        if (!r.ok) return r
      }
      return { ok: true }
    }
  }
}

export function validateIpc(value: unknown, schema: IpcSchema): IpcValidationResult {
  return validateAt(value, schema, '参数')
}

// —— 关键 IPC 契约（新增 handler 应优先复用/扩展；未迁移的既有 handler 见 08 P1-04 说明） ——
export const IPC_SCHEMAS = {
  toolsExecute: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      args: { type: 'object' },
      approved: { type: 'boolean' },
      rootPath: { type: 'string' },
      sessionId: { type: 'string' },
    },
    required: ['name'],
  },
  streamChat: {
    type: 'object',
    properties: {
      apiKey: { type: 'string' },
      level: { type: 'string', enum: ['none', 'basic', 'medium', 'high'] as const },
      tools: { type: 'boolean' },
      forceTool: { type: 'boolean' },
      progressMode: {
        type: 'string',
        enum: ['auto', 'require-action', 'require-advance'] as const,
      },
      sessionId: { type: 'string' },
      messages: {
        type: 'array',
        maxItems: 500,
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', minLength: 1 },
            content: { type: 'any' },
            tool_calls: { type: 'any' },
            tool_call_id: { type: 'string' },
            reasoning_content: { type: 'string' },
          },
          required: ['role'],
        },
      },
    },
    required: ['apiKey', 'messages'],
  },
  sessionId: { type: 'string', minLength: 1, maxLength: 200 },
  queueSession: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      entryId: { type: 'string', minLength: 1, maxLength: 200 },
      title: { type: 'string', minLength: 1, maxLength: 2000 },
      reason: { type: 'string', maxLength: 2000 },
      position: { type: 'number', integer: true, min: 0, max: 10000 },
    },
    required: ['sessionId'],
  },
} satisfies Record<string, IpcSchema>
