// IPC 运行时契约校验（P1-04 基础设施）：preload/types/main 三方漂移时 fail-fast。
// 轻量 schema 子集（不引入 zod）——字符串/数字/布尔/对象/数组/枚举/可选字段；未知字段忽略。
export type IpcSchema =
  | {
      type: 'string'
      enum?: readonly string[]
      minLength?: number
      maxLength?: number
      /** 允许 null（用于可清空的可选字段：URL/密钥/模型 id） */
      nullable?: boolean
    }
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'boolean' }
  | {
      type: 'object'
      properties?: Record<string, IpcSchema>
      required?: readonly string[]
      allowUnknown?: boolean
    }
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
      if (value === null) {
        return schema.nullable
          ? { ok: true }
          : { ok: false, error: `${path} 必须为字符串（不可为 null）` }
      }
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
        // undefined 同样视为缺失（仅 key in value 会让 {name: undefined} 通过必填）
        if (value[key] === undefined) return { ok: false, error: `${path}.${key} 为必填` }
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
const PERMISSION_RULE_SCHEMA: IpcSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['allow', 'deny', 'ask'] as const },
    tool: { type: 'string', minLength: 1, maxLength: 200 },
    specifier: { type: 'string', maxLength: 4000 },
  },
  required: ['action', 'tool', 'specifier'],
}
const PERMISSION_RULE_LIST_SCHEMA: IpcSchema = {
  type: 'array',
  maxItems: 200, // 与 permissionRulesStore.MAX_PERMISSION_RULES 对齐
  items: PERMISSION_RULE_SCHEMA,
}
export const IPC_SCHEMAS = {
  permissionsSet: {
    type: 'object',
    properties: { rules: PERMISSION_RULE_LIST_SCHEMA },
    required: ['rules'],
  },
  toolsExecute: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      args: { type: 'object' },
      approved: { type: 'boolean' },
      approvalSource: { type: 'string', enum: ['user', 'auto', 'delegate'] as const },
      rootPath: { type: 'string' },
      sessionId: { type: 'string' },
    },
    required: ['name'],
  },
  // ADR-015：三档信任模式（main 持久化；非法模式在 IPC 边界拒绝）
  trustSet: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['strict', 'standard', 'delegated'] as const },
    },
    required: ['mode'],
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
  queueEnqueue: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      title: { type: 'string', minLength: 1, maxLength: 2000 },
    },
    required: ['sessionId', 'title'],
  },
  // P1-04 第二批：队列命令/验收/变更集/配置入口的载荷校验
  webAccessPatch: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      searchUrl: { type: 'string', maxLength: 4000, nullable: true },
      searchKey: { type: 'string', maxLength: 8192, nullable: true },
      keenableApiKey: { type: 'string', maxLength: 8192, nullable: true },
      keenablePublicTrial: { type: 'boolean' },
      probe: { type: 'boolean' },
    },
  },
  apiKey: { type: 'string', minLength: 1, maxLength: 8192 },
  apiKeySet: {
    type: 'object',
    properties: {
      key: { type: 'string', minLength: 1, maxLength: 8192 },
      providerId: { type: 'string', maxLength: 100 },
      modelId: { type: 'string', maxLength: 500, nullable: true },
    },
    required: ['key'],
  },
  completionVerify: {
    type: 'object',
    properties: {
      commands: {
        type: 'array',
        maxItems: 100,
        items: { type: 'string', minLength: 1, maxLength: 4000 },
      },
      rootPath: { type: 'string', maxLength: 4000, nullable: true },
    },
    required: ['commands'],
  },
  fileList: {
    type: 'array',
    maxItems: 1000,
    items: { type: 'string', minLength: 1, maxLength: 4000 },
  },
  contextResolve: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        maxItems: 100,
        items: { type: 'string', minLength: 1, maxLength: 4000 },
      },
    },
    required: ['files'],
  },
  ragSearch: {
    type: 'object',
    properties: { query: { type: 'string', minLength: 1, maxLength: 2000 } },
    required: ['query'],
  },
  pluginToggle: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 500 },
      active: { type: 'boolean' },
    },
    required: ['name', 'active'],
  },
  queueEntry: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      entryId: { type: 'string', minLength: 1, maxLength: 200 },
    },
    required: ['sessionId', 'entryId'],
  },
  queueEntryReason: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      entryId: { type: 'string', minLength: 1, maxLength: 200 },
      reason: { type: 'string', minLength: 1, maxLength: 2000 },
    },
    required: ['sessionId', 'entryId', 'reason'],
  },
  queueReorder: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      entryId: { type: 'string', minLength: 1, maxLength: 200 },
      position: { type: 'number', integer: true, min: 0, max: 10000 },
    },
    required: ['sessionId', 'entryId', 'position'],
  },
  acceptanceDerive: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      verificationPlan: {
        type: 'array',
        maxItems: 100,
        items: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      source: { type: 'string', enum: ['plan-verification', 'user-dod', 'manual'] as const },
    },
    required: ['sessionId'],
  },
  acceptanceMark: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      itemId: { type: 'string', minLength: 1, maxLength: 200 },
      status: { type: 'string', enum: ['passed', 'failed', 'waived'] as const },
      evidenceRef: { type: 'string', maxLength: 2000 },
      manualReason: { type: 'string', maxLength: 4000 },
      reason: { type: 'string', maxLength: 4000 },
    },
    required: ['sessionId', 'itemId', 'status'],
  },
  acceptanceWaive: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      itemId: { type: 'string', minLength: 1, maxLength: 200 },
      reason: { type: 'string', minLength: 1, maxLength: 4000 },
    },
    required: ['sessionId', 'itemId', 'reason'],
  },
  acceptanceEvidence: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      evidenceRefs: {
        type: 'array',
        maxItems: 500,
        items: { type: 'string', minLength: 1, maxLength: 4000 },
      },
    },
    required: ['sessionId', 'evidenceRefs'],
  },
  toolsRevert: {
    type: 'object',
    properties: {
      path: { type: 'string', minLength: 1, maxLength: 4000 },
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
    },
    required: ['path'],
  },
  deliveryApplyDiff: {
    type: 'object',
    properties: {
      path: { type: 'string', minLength: 1, maxLength: 4000 },
      diff: { type: 'string', minLength: 1, maxLength: 2_000_000 },
      approved: { type: 'boolean' },
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      rootPath: { type: 'string', minLength: 1, maxLength: 4000 },
    },
    required: ['path', 'diff', 'rootPath'],
  },
  deliveryRevertDiff: {
    type: 'object',
    properties: {
      path: { type: 'string', minLength: 1, maxLength: 4000 },
      sessionId: { type: 'string', minLength: 1, maxLength: 200 },
      rootPath: { type: 'string', minLength: 1, maxLength: 4000 },
    },
    required: ['path', 'rootPath'],
  },
  // P1-04 收尾：工作区/网关/日志入口的结构校验
  gatewayValidate: {
    type: 'object',
    properties: {
      apiKey: { type: 'string', minLength: 1, maxLength: 8192 },
      providerId: { type: 'string', maxLength: 100 },
      modelId: { type: 'string', maxLength: 500, nullable: true },
    },
    required: ['apiKey'],
  },
  gatewayListModels: {
    type: 'object',
    properties: {
      providerId: { type: 'string', maxLength: 100 },
    },
  },
  gatewaySetModel: {
    type: 'object',
    properties: {
      providerId: { type: 'string', maxLength: 100 },
      modelId: { type: 'string', maxLength: 500, nullable: true },
    },
    required: ['modelId'],
  },
  workspacePath: { type: 'string', minLength: 1, maxLength: 4000 },
  // init-project/update-title 的 title 来自用户首条需求（可能较长）——上限与路径同级，避免长需求被误拒
  workspaceTitle: { type: 'string', minLength: 1, maxLength: 4000 },
  workspaceUpdateTitle: {
    type: 'object',
    properties: {
      path: { type: 'string', minLength: 1, maxLength: 4000 },
      title: { type: 'string', minLength: 1, maxLength: 4000 },
    },
    required: ['path', 'title'],
  },
  notebookRoot: { type: 'string', maxLength: 4000, nullable: true },
  chatLogEntry: {
    type: 'object',
    properties: {
      ts: { type: 'string', minLength: 1, maxLength: 100 },
      role: { type: 'string', enum: ['user', 'assistant'] as const },
      content: { type: 'string', maxLength: 2_000_000 },
      toolCalls: {
        type: 'array',
        maxItems: 1000,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            status: { type: 'string', maxLength: 100 },
          },
          required: ['name'],
        },
      },
      error: { type: 'string', maxLength: 2000 },
      session: { type: 'string', maxLength: 200 },
    },
    required: ['ts', 'role'],
  },
  timelineLogEvent: {
    type: 'object',
    properties: {
      session: { type: 'string', maxLength: 200 },
      type: { type: 'string', minLength: 1, maxLength: 200 },
      role: { type: 'string', enum: ['user', 'assistant', 'system', 'tool'] as const },
      detail: { type: 'object' },
    },
    required: ['type'],
  },
  timelineQuery: {
    type: 'object',
    properties: {
      session: { type: 'string', maxLength: 200 },
      // string | string[]——轻量校验器不支持联合类型，元素形态由 timelineLogger.query 消费
      type: { type: 'any' },
      from: { type: 'string', maxLength: 100 },
      to: { type: 'string', maxLength: 100 },
      limit: { type: 'number', integer: true, min: 0, max: 10000 },
    },
  },
} satisfies Record<string, IpcSchema>
