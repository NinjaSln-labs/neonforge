// S1b Task 0（A2 归档前置）：协议工具 schema 本地常量表——gateway 不再 import 旧 domain/protocolTools。
// 表体与旧 PROTOCOL_TOOL_DEFS 逐字等价；旧参数校验器 validateProtocolArgs 属旧 app 面（随归档批移除）。
const PATH_FIELD_DESCRIPTION =
  '只填一个真实存在的或将创建的文件路径本身（如 index.html、src/App.jsx）。禁止：附注/括号说明/『A 或 B』候选/『所有…的文件』这类集合描述；还没定位到的具体文件不要猜——写进 assumptions 字段说明定位策略'

export const PROTOCOL_TOOL_DEFS = [
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
