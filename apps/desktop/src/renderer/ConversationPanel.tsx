import { useEffect, useRef, useState } from 'react'
import DeliveryFlowPanel from './DeliveryFlowPanel'
import DigitalDeliveryPanel from './DigitalDeliveryPanel'
import TrustLadderPanel from './TrustLadderPanel'
import DoDAlignPanel from './DoDAlignPanel'
import type { DeliveryPackage } from './types'

// ticket 04：对话最小闭环（D0 §2/§3.4）——输入发送 → Gateway 流式 → 消息/呼吸光条/推理展示
// 消费 02：streamChat（四档 basic）+ ModelRouter（默认 Flash）；错误分支：Key 失效内嵌更新 / 服务故障提示

interface ToolCallMsg {
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'done' | 'need-approval' | 'error'
  result?: string
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  status: 'streaming' | 'done' | 'error'
  error?: string
  toolCalls?: ToolCallMsg[]
}

export default function ConversationPanel({
  rootPath,
  onKeyExpired,
  onReasoning,
  onWorkingChange
}: {
  rootPath?: string | null
  onKeyExpired: () => void
  onReasoning?: (text: string) => void
  onWorkingChange?: (working: boolean) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const messagesRef = useRef<Msg[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  const chatRef = useRef<{ msgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }>; depth: number } | null>(null)
  const [input, setInput] = useState('')
  const [working, setWorking] = useState(false)
  const [workingStage, setWorkingStage] = useState('等待回复…')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const demoFiles = (window.neonforge as unknown as { demo?: { recentFiles?: string[] } }).demo?.recentFiles ?? []

  // 处理单个流式事件（当前轮次——写入最后一条 assistant 消息）
  const applyChunk = (chunk: { type: string; text?: string; toolCall?: { name: string; args: Record<string, unknown> } }) => {
    console.log('[conv] chunk', chunk.type)
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      if (chunk.type !== 'tool-call' && last.status !== 'streaming') return prev
      const next = { ...last }
      if (chunk.type === 'reasoning') {
        next.reasoning = (next.reasoning ?? '') + (chunk.text ?? '')
        onReasoning?.(next.reasoning)
        setWorkingStage('思考中…')
      }
      if (chunk.type === 'content') {
        next.content = next.content + (chunk.text ?? '')
        setWorkingStage('生成回复…')
      }
      if (chunk.type === 'done') {
        next.status = 'done'
        if (!next.content && !(next.toolCalls && next.toolCalls.length > 0)) {
          next.error = 'empty-response'
        }
      }
      if (chunk.type === 'tool-call' && chunk.toolCall) {
        const tc = chunk.toolCall
        setWorkingStage(`调用工具 ${tc.name}…`)
        next.toolCalls = [...(next.toolCalls ?? []), { name: tc.name, args: tc.args, status: 'pending' }]
        void (window.neonforge.tools?.execute?.(tc.name, tc.args, { approved: tc.name === 'read', rootPath: rootPath ?? undefined }) ?? Promise.resolve({ ok: false, error: 'tools 通道未就绪' })).then((r) => {
          setMessages((prev) => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            const calls = (last.toolCalls ?? []).map((c) => {
              if (c.name !== tc.name || c.status !== 'pending') return c
              return r.ok
                ? { ...c, status: 'done' as const, result: typeof r.data === 'string' ? r.data.slice(0, 400) : JSON.stringify(r.data).slice(0, 400) }
                : { ...c, status: (r.error ?? '').includes('授权') ? ('need-approval' as const) : ('error' as const), result: r.error }
            })
            return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
          })
        })
      }
      return [...prev.slice(0, -1), next]
    })
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, working])

  // 工具完成后触发续聊：轮询等工具执行（自动/授权）完成，全 done → 回填模型继续
  const maybeContinue = async (depth: number) => {
    const ctx = chatRef.current
    if (!ctx || depth >= 2) return
    // 等待自动执行（pending）完成——最多 8s；待授权（need-approval）立即停止（等用户点允许）
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const latest = messagesRef.current
      const lastMsg = latest[latest.length - 1]
      if (!lastMsg || !lastMsg.toolCalls || lastMsg.toolCalls.length === 0) return
      const pending = lastMsg.toolCalls.filter((c) => c.status === 'pending')
      const needsApproval = lastMsg.toolCalls.some((c) => c.status === 'need-approval')
      if (needsApproval) return // 有待授权——等用户点允许（approveToolCall 后触发续聊）
      if (pending.length === 0) break // 全部执行完成
    }
    const latest = messagesRef.current
    const lastMsg = latest[latest.length - 1]
    if (!lastMsg) return
    const calls = lastMsg.toolCalls ?? []
    if (calls.length === 0) return
    // 组装 tool 消息序列
    const toolMsgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }> = [
      ...ctx.msgs,
      {
        role: 'assistant',
        content: null,
        reasoning_content: lastMsg.reasoning ?? '',
        tool_calls: calls.map((c, i) => ({ id: `call_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }))
      },
      ...calls.map((c, i) => ({ role: 'tool', tool_call_id: `call_${i}`, content: c.result ?? '执行失败' }))
    ]
    chatRef.current = { msgs: toolMsgs, depth: depth + 1 }
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])
    await new Promise((r) => setTimeout(r, 50))
    await runChat(toolMsgs, depth + 1)
  }

  // 多轮工具循环：模型返回 tool_call → 执行 → 结果回填 → 续聊（最多 4 轮）
  const runChat = async (msgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }>, depth: number) => {
    if (depth > 4) return
    const key = await window.neonforge.config.getKey()
    if (!key) { finishError('key-invalid'); return }
    // 系统提示：引导直接 read（项目根相对路径）——避免 bash 全局搜索/工具循环（提速）
    const sysHint = { role: 'system', content: `你是 NeonForge 搭档。当前项目根目录：${rootPath ?? '(未指定)'}。规则：① 读文件用 read 工具（路径用项目根下的相对路径，如 package.json）② 不要用 bash find 全局搜索（直接 read 目标文件）③ 工具一次调用一个，执行完看结果再决定 ④ 找不到文件就直接告诉用户。` }
    // 本轮临时监听
    const off = window.neonforge.gateway.onStreamChunk(applyChunk)
    try {
      const res = await window.neonforge.gateway.streamChat({
        apiKey: key,
        level: 'basic',
        tools: true,
        messages: [sysHint, ...msgs]
      })
      if (!res.ok) { finishError(res.error ?? 'gateway-error'); return }
    } catch { finishError('network'); return } finally { off() }

    // 记录本轮上下文 → 由 maybeContinue 轮询工具完成（自动执行）→ 续聊
    chatRef.current = { msgs, depth }
    await new Promise((r) => setTimeout(r, 1000))
    await maybeContinue(depth)
  }

  const send = async () => {
    const text = inputRef.current.trim()
    if (!text || working) return
    inputRef.current = ''
    setInput('')
    setWorking(true)
    onWorkingChange?.(true)
    const history = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status === 'done' && m.content))
      .map((m) => ({ role: m.role, content: m.content }))
    setMessages((p) => [...p, { role: 'user', content: text, status: 'done' }])
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])
    setWorkingStage('已发送，等待搭档…')

    try {
      await runChat([...history, { role: 'user', content: text }], 0)
    } catch {
      finishError('network')
    } finally {
      setWorking(false)
      onWorkingChange?.(false)
    }
  }

  // L3 授权：允许执行（approved=true）/ 拒绝（标记拒绝）
  const approveToolCall = (calls: ToolCallMsg[], idx: number, tc: ToolCallMsg) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      const updated = (last.toolCalls ?? []).map((c, i) => i === idx ? { ...c, status: 'pending' as const } : c)
      return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
    })
    void window.neonforge.tools?.execute?.(tc.name, tc.args, { approved: true, rootPath: rootPath ?? undefined }).then((r) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        const calls = (last.toolCalls ?? []).map((c, i) => {
          if (i !== idx) return c
          return r.ok
            ? { ...c, status: 'done' as const, result: typeof r.data === 'string' ? r.data.slice(0, 400) : JSON.stringify(r.data).slice(0, 400) }
            : { ...c, status: 'error' as const, result: r.error }
        })
        return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
      })
      setTimeout(() => void maybeContinue(chatRef.current?.depth ?? 0), 150)
    })
  }
  const rejectToolCall = (calls: ToolCallMsg[], idx: number) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      const updated = (last.toolCalls ?? []).map((c, i) => i === idx ? { ...c, status: 'error' as const, result: '已拒绝授权——未执行' } : c)
      return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
    })
  }

  const finishError = (err: string) => {
    setMessages((p) => {
      const last = p[p.length - 1]
      if (!last || last.role !== 'assistant') return p
      const next: Msg = { ...last, status: 'error' }
      if (err === 'key-invalid' || String(err).includes('401')) {
        next.error = 'key-invalid'
        next.content = 'API Key 好像失效了。'
      } else if (String(err).includes('5') || err === 'timeout' || err === 'network' || String(err).includes('gateway')) {
        next.error = 'service'
        next.content = '服务暂时不可用，稍后重试。'
      } else {
        next.error = 'unknown'
        next.content = '出错了，请重试。'
      }
      return [...p.slice(0, -1), next]
    })
  }

  const demoEnv = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_NF_DEMO_DELIVERY === '1'
  const d = (window.neonforge as unknown as { demo?: Record<string, unknown> }).demo ?? {}
  const demoFlow = !!d.deliveryFlow
  const demoDigital = !!d.digitalDelivery
  const demoTrust = !!d.trustLadder
  const demoDod = !!d.dodAlign
  const compactCount = (d.compactHistory as number) ?? (demoEnv ? 30 : 0)
  const compactNote = compactCount > 24 ? `对话已超过 24 条——将压缩前 ${compactCount - 12} 条为摘要（上下文不丢）` : null
  const onDeliver = (pkg: DeliveryPackage) => {
    const w = window as unknown as { neonforge: { demo?: { onDeliver?: (p: DeliveryPackage) => void } } }
    w.neonforge.demo?.onDeliver?.(pkg)
  }

  return (
    <div className="nf-chat">
      {demoFlow && <DeliveryFlowPanel />}
      {demoDigital && <DigitalDeliveryPanel onDeliver={onDeliver} />}
      {demoTrust && <TrustLadderPanel />}
      {demoDod && <DoDAlignPanel />}
      {compactNote && <div className="nf-compact">🗜 {compactNote}</div>}
      <div className="nf-chat__list" ref={listRef} aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && (
          <div className="nf-scenes">
            <p className="nf-placeholder">说出你当前的问题——或者从这些开始：</p>
            <div className="nf-scenes__grid">
              {[
                ['📁', '整理文件', '把 Downloads 里的发票和合同分类整理'],
                ['🔧', '做小工具', '帮我做一个每周记账的小工具'],
                ['🛠', '修系统', 'X 系统今天出异常了，帮我看看'],
                ['🚀', '0-1 交付', '我要做一个能发给朋友的旅行手册网页']
              ].map(([icon, label, q]) => (
                <button
                  key={label}
                  type="button"
                  className="nf-scene"
                  onClick={() => setInput(q)}
                >
                  <span className="nf-scene__icon">{icon}</span>
                  <span className="nf-scene__label">{label}</span>
                  <span className="nf-scene__q">{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`nf-msg nf-msg--${m.role}`}>
            {m.role === 'assistant' && m.status === 'streaming' && (
              <span className="nf-breath" />
            )}
            {m.role === 'user' && <span className="nf-msg__role">你</span>}
            <div className={`nf-msg__body${m.role === 'assistant' && m.status === 'streaming' && !m.content ? ' nf-msg__body--thinking' : ''}`}>
              {m.content || (m.status === 'streaming' ? '🧠 搭档处理中…' : m.error === 'empty-response' ? '⚠️ 搭档没有返回内容——请重试或换个说法' : m.status === 'error' ? '⚠️ 处理失败' : '')}
              {m.error === 'key-invalid' && (
                <button type="button" className="nf-config__link" onClick={onKeyExpired}>
                  要不要更新一下？
                </button>
              )}
            </div>
            {m.role === 'user' && <span className="nf-msg__sent">✓ 已发送</span>}
            {m.reasoning && m.role === 'assistant' && m.status === 'done' && (
              <details className="nf-msg__reasoning">
                <summary>🧠 推理</summary>
                <p className="nf-meta">{m.reasoning}</p>
              </details>
            )}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="nf-toolcalls">
                {m.toolCalls.map((tc, i) => (
                  <div key={i} className={`nf-toolcall nf-toolcall--${tc.status}`}>
                    <span className="nf-toolcall__icon">
                      {tc.status === 'done' ? '✅' : tc.status === 'need-approval' ? '🔒' : tc.status === 'error' ? '❌' : '⏳'}
                    </span>
                    <span className="nf-toolcall__name">🔧 {tc.name}</span>
                    <span className="nf-toolcall__args">{JSON.stringify(tc.args).slice(0, 80)}</span>
                    {tc.result && <span className="nf-toolcall__result">{tc.result}</span>}
                    {tc.status === 'need-approval' && (
                      <>
                        <span className="nf-toolcall__hint">需 L3 授权</span>
                        <div className="nf-toolcall__actions">
                          <button
                            type="button"
                            className="nf-toolcall__approve"
                            onClick={() => approveToolCall(m.toolCalls ?? [], i, tc)}
                          >
                            允许执行
                          </button>
                          <button
                            type="button"
                            className="nf-toolcall__reject"
                            onClick={() => rejectToolCall(m.toolCalls ?? [], i)}
                          >
                            拒绝
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {working && (
          <div className="nf-working">
            <span className="nf-working__dot">🔵</span>
            <span>搭档处理中：{workingStage}</span>
          </div>
        )}
      </div>

      <div className="nf-chat__input">
        {mentionOpen && (
          <div className="nf-mention">
            <span className="nf-mention__title">引用文件</span>
            {recentFiles.map((f) => (
              <button
                key={f}
                type="button"
                className="nf-mention__item"
                onClick={() => {
                  const before = input.replace(/@[^@]*$/, '')
                  setInput(before + '@' + f + ' ')
                  setMentionOpen(false)
                }}
              >
                📄 {f}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={input}
          placeholder="输入想法…（Enter 换行 · ⌘+Enter 发送）"
          aria-label="给搭档的消息"
          rows={2}
          onChange={(e) => {
            inputRef.current = e.target.value
            setInput(e.target.value)
            const v = e.target.value
            if (v.includes('@') && demoFiles.length > 0) { setRecentFiles(demoFiles); setMentionOpen(true) }
            else if (!v.includes('@')) { setMentionOpen(false) }
          }}
          onKeyDown={(e) => {
            // 输入法组合中（拼音/候选确认的回车 isComposing=true）——不拦截，交给输入法
            if (e.nativeEvent.isComposing) return
            // Enter = 换行（内容保留）；Cmd/Ctrl+Enter = 发送
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() }
          }}
        />
        <button type="button" className="nf-config__cta" onClick={() => void send()} disabled={working || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
