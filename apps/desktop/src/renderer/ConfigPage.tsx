import { useState } from 'react'

// 首次配置页（D0 §3.1）：粘贴 Key → 验证 → 启动页；失败红边/断网横幅/跳过
export default function ConfigPage({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'validating' | 'fail' | 'network'>('idle')
  const [errorText, setErrorText] = useState('')

  const validate = async (k: string) => {
    setStatus('validating')
    const res = await window.neonforge.gateway.validate(k)
    if (res.ok) {
      await window.neonforge.config.setKey(k)
      onDone()
      return
    }
    if (res.error === 'network' || res.error === 'timeout' || res.error === 'service-error') {
      setStatus('network')
      setErrorText(res.error === 'service-error' ? 'DeepSeek 服务暂时不可用，稍后重试。' : '无法连接，请检查网络。')
    } else {
      setStatus('fail')
      setErrorText('验证失败，请检查 Key')
    }
  }

  const submit = () => {
    const k = key.trim()
    if (!k) return
    void validate(k)
  }

  return (
    <div className="nf-config">
      <h1 className="nf-config__title">NeonForge</h1>
      <p className="nf-config__sub">需要 DeepSeek API Key</p>

      <input
        className={`nf-config__input${status === 'fail' ? ' nf-config__input--error' : ''}`}
        type="password"
        placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
        aria-label="DeepSeek API Key"
        autoComplete="current-password"
        value={key}
        onChange={(e) => { setKey(e.target.value); if (status !== 'idle') setStatus('idle') }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        autoFocus
      />

      {status === 'fail' && <p className="nf-config__err" aria-live="polite">{errorText}</p>}
      {status === 'network' && (
        <div className="nf-config__banner" aria-live="polite">
          <span>{errorText}</span>
          <button className="nf-config__link" onClick={onDone}>跳过（离线不可用）</button>
        </div>
      )}

      <button className="nf-config__cta" onClick={submit} disabled={status === 'validating'}>
        {status === 'validating' ? '验证中…' : '验证并开始'}
      </button>

      {/* 2026-08-03 v31 B3 审计修复：非技术用户首个障碍——「怎么获取 Key」操作引导（原只有「为什么需要」） */}
      <details className="nf-config__why">
        <summary>怎么获取 DeepSeek API Key？</summary>
        <p className="nf-config__why-text">
          ① 打开 platform.deepseek.com 注册/登录 → ② 左侧「API Keys」→ 新建 → ③ 复制 <em>sk-</em> 开头的 Key 粘贴到上方输入框。
        </p>
      </details>
      <details className="nf-config__why">
        <summary>为什么需要？</summary>
        <p className="nf-config__why-text">
          NeonForge 通过 DeepSeek API 提供 AI 能力，Key 存储在你本地（系统加密），仅用于请求 DeepSeek API。
        </p>
      </details>
    </div>
  )
}
