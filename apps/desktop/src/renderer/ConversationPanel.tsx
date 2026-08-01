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
  onKeyExpired,
  onReasoning,
  onWorkingChange
}: {
  onKeyExpired: () => void
  onReasoning?: (text: string) => void
  onWorkingChange?: (working: boolean) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [working, setWorking] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const demoFiles = (window.neonforge as unknown as { demo?: { recentFiles?: string[] } }).demo?.recentFiles ?? []

  useEffect(() => {
    const off = window.neonforge.gateway.onStreamChunk((chunk) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant' || last.status !== 'streaming') return prev
        const next = { ...last }
        if (chunk.type === 'reasoning') {
          next.reasoning = (next.reasoning ?? '') + (chunk.text ?? '')
          onReasoning?.(next.reasoning)
        }
        if (chunk.type === 'content') next.content = next.content + (chunk.text ?? '')
        if (chunk.type === 'done') next.status = 'done'
        if (chunk.type === 'tool-call' && chunk.toolCall) {
          const tc = chunk.toolCall
          next.toolCalls = [...(next.toolCalls ?? []), { name: tc.name, args: tc.args, status: 'pending' }]
          // 执行（read 自动；write/edit/bash 需 L3 授权——V1 标记待授权）
          // 纯 prev 计算更新（不依赖外层闭包引用——防消息覆盖/丢失）
          void window.neonforge.tools.execute(tc.name, tc.args, { approved: tc.name === 'read' }).then((r) => {
            setMessages((prev) => {
              if (prev.length === 0) return prev
              const last = prev[prev.length - 1]
              if (!last || last.role !== 'assistant') return prev
              const calls = (last.toolCalls ?? []).map((c) => {
                if (c.name !== tc.name || c.status !== 'pending') return c
                return r.ok
                  ? { ...c, status: 'done' as const, result: typeof r.data === 'string' ? r.data.slice(0, 300) : JSON.stringify(r.data).slice(0, 300) }
                  : { ...c, status: (r.error ?? '').includes('授权') ? ('need-approval' as const) : ('error' as const), result: r.error }
              })
              return [...prev.slice(0, -1), { ...last, toolCalls: calls }]
            })
          })
        }
        return [...prev.slice(0, -1), next]
      })
    })
    return off
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, working])

  const send = async () => {
    const text = input.trim()
    if (!text || working) return
    setInput('')
    setWorking(true)
    onWorkingChange?.(true)
    const history = messages
      .filter((m) => m.role === 'user' || m.status === 'done')
      .map((m) => ({ role: m.role, content: m.content }))
    setMessages((p) => [...p, { role: 'user', content: text, status: 'done' }])
    setMessages((p) => [...p, { role: 'assistant', content: '', reasoning: '', status: 'streaming' }])

    try {
      const key = await window.neonforge.config.getKey()
      if (!key) {
        finishError('key-invalid')
        return
      }
      const res = await window.neonforge.gateway.streamChat({
        apiKey: key,
        level: 'basic', // V1 固定 basic 档（04 专家评审）
        tools: true, // 真实执行：模型可返回工具调用（ToolRegistry 执行）
        messages: [...history, { role: 'user', content: text }]
      })
      if (!res.ok) finishError(res.error ?? 'gateway-error')
    } catch {
      finishError('network')
    } finally {
      setWorking(false)
      onWorkingChange?.(false)
    }
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
  const demoDigital = demoEnv || !!d.digitalDelivery
  const demoTrust = demoEnv || !!d.trustLadder
  const demoDod = demoEnv || !!d.dodAlign
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
              {m.content || (m.status === 'streaming' ? '🧠 思考中…' : '')}
              {m.error === 'key-invalid' && (
                <button type="button" className="nf-config__link" onClick={onKeyExpired}>
                  要不要更新一下？
                </button>
              )}
            </div>
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
                    {tc.status === 'need-approval' && <span className="nf-toolcall__hint">（需 L3 授权——V1 暂不自动执行）</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {working && <p className="nf-meta">搭档工作中…</p>}
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
