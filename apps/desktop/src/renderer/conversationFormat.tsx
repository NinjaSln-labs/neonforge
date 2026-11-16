// P1-05 阶段 1：ConversationPanel 纯格式化/展示辅助提取（无行为变更）。
// 目标：面板组件只保留编排与布局；这些无状态函数/小组件可独立复用与测试。
import { isCommunicationLike, isDoneLike, isQuestionLike } from '../domain/agentLoop'

// 工具结果展示清洗：bash 只显示 stdout 摘要；write/edit 显示路径；read 长内容摘要化
export function fmtToolResult(r: { ok: boolean; data?: unknown }): string {
  if (typeof r.data === 'string') {
    return `已读取（${r.data.length} 字符）`
  }
  const d = r.data as Record<string, unknown> | undefined
  if (d && typeof d === 'object') {
    if ('stdout' in d) {
      const lines = String(d.stdout ?? '')
        .split('\n')
        .filter((l) => l.trim()).length
      return `执行完成（输出 ${lines} 行）`
    }
    if ('file' in d) return `已写入：${String(d.file)}`
  }
  return '完成'
}

// A-008：关键假设/验证计划列表渲染共享（目标卡 + 方案卡共用）
function assumptionSourceLabel(source: string | undefined): string {
  // 只认三个已知来源；用 switch 避免原型链键（__proto__/constructor）被当成标签渲染成对象
  switch (source) {
    case 'user_choice':
      return '你的选择'
    case 'clarification':
      return '你的澄清'
    case 'model_inference':
      return '模型推断'
    default:
      return ''
  }
}

export function AssumptionList({
  items,
}: {
  items: Array<string | { text: string; source?: string }>
}): React.ReactElement | null {
  if (!items || items.length === 0) return null
  return (
    <div className="nf-confirmcard__plan-section">
      <div className="nf-confirmcard__plan-label">关键假设</div>
      <ul>
        {items.map((a, idx) => {
          // ADR-014：结构化假设带来源标签；旧 string[]（旧存档/旧模型输出）防御性兼容
          const text = typeof a === 'string' ? a : a?.text
          if (!text) return null
          const label = typeof a === 'string' ? '' : assumptionSourceLabel(a.source)
          return (
            <li key={idx}>
              {text}
              {label ? <span className="nf-assumption__source">{label}</span> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// 工具卡参数人类化（「读取 xxx / 执行 xxx」）
export function fmtToolArgs(tc: { name: string; args: Record<string, unknown> }): string {
  const a = tc.args
  switch (tc.name) {
    case 'read':
      return a.path ? `读取 ${String(a.path)}` : '读取文件'
    case 'write':
      return a.path ? `写入 ${String(a.path)}` : '写入文件'
    case 'edit':
      return a.path ? `修改 ${String(a.path)}` : '修改文件'
    case 'bash':
      return a.command ? `执行 ${String(a.command).slice(0, 60)}` : '执行命令'
    case 'search':
      return a.query ? `搜索 ${String(a.query)}` : '搜索代码'
    case 'web_search':
      return a.query ? `联网搜索：${String(a.query)}` : '联网搜索'
    case 'web_fetch':
      return a.url ? `读取网页：${String(a.url)}` : '读取网页'
    case 'approve-files':
      return `批量授权 ${((a.files ?? []) as unknown[]).length} 个文件`
    case 'get_diagnostics':
      return a.path ? `检查代码错误：${String(a.path)}` : '检查代码错误'
    case 'get_imports':
      return a.path ? `查看文件依赖：${String(a.path)}` : '查看文件依赖'
    case 'find_definition':
      return a.path ? `定位定义：${String(a.symbol ?? a.path)}` : '定位代码定义'
    case 'find_references':
      return a.path ? `查找引用：${String(a.symbol ?? a.path)}` : '查找代码引用'
    case 'get_type_info':
      return a.path ? `查看类型：${String(a.symbol ?? a.path)}` : '查看类型信息'
    case 'get_call_chain':
      return a.path ? `查看代码结构：${String(a.path)}` : '查看代码结构'
    case 'open':
      return a.url ? `打开网页：${String(a.url)}` : '打开网页'
    case 'check-capability':
      return a.dir ? `检查能力：${String(a.dir)}` : '检查能力'
    case 'start-server':
      return a.dir ? `启动服务器：${String(a.dir)}` : '启动服务器'
    case 'check-server':
      return a.dir ? `检查服务：${String(a.dir)}` : '检查服务状态'
    case 'stop-server':
      return a.dir ? `停止服务：${String(a.dir)}` : '停止服务'
    default:
      return tc.name
  }
}

// A-017 渲染信号单源：消息是否含指定协议工具调用
export function hasProtoCall(
  msg: { toolCalls?: Array<{ name: string }> },
  ...names: string[]
): boolean {
  return (msg.toolCalls ?? []).some((c) => names.includes(c.name))
}

// 模型「承诺行动但未调工具」结构判定（非问句/非沟通/非完成态）
export function isActionPromise(content: string): boolean {
  if (!content) return false
  const t = content.trim()
  if (!t) return false
  if (isQuestionLike(t)) return false
  if (isCommunicationLike(t)) return false
  if (isDoneLike(t)) return false
  return true
}
