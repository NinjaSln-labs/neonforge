import { useEffect, useState } from 'react'

type ProviderOption = {
  id: string
  label: string
  howToGetKey: { zh: string; en: string }
  docsUrl?: string
}

const FALLBACK_PROVIDERS: ProviderOption[] = [
  { id: 'deepseek', label: 'DeepSeek 官方', howToGetKey: { zh: '', en: '' } },
  { id: 'commandcode', label: 'Command Code', howToGetKey: { zh: '', en: '' } },
  { id: 'opencode-zen', label: 'OpenCode Zen', howToGetKey: { zh: '', en: '' } },
  { id: 'opencode-go', label: 'OpenCode Go', howToGetKey: { zh: '', en: '' } },
]

// 首次配置页：选接入方 → 粘贴 Key → 验证 → 启动页
// 视觉对齐启动页：品牌渐变 + slogan 节奏 + 同宽圆角输入 + 全宽主 CTA
export default function ConfigPage({ onDone }: { onDone: () => void }) {
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [providerId, setProviderId] = useState('commandcode')
  const [key, setKey] = useState('')
  const [modelId, setModelId] = useState('')
  const [needModelId, setNeedModelId] = useState(false)
  const [status, setStatus] = useState<'idle' | 'validating' | 'fail' | 'network'>('idle')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    const cfg = window.neonforge?.config
    if (!cfg) return
    void cfg.listProviders?.().then((list) => {
      if (list?.length) {
        setProviders(list)
        setProviderId((cur) => (list.some((p) => p.id === cur) ? cur : list[0].id))
      }
    })
    void cfg.getProvider?.().then((id) => {
      if (id) setProviderId(id)
    })
    void cfg.getModel?.().then((m) => {
      if (m) {
        setModelId(m)
        setNeedModelId(true)
      }
    })
  }, [])

  const options = providers.length > 0 ? providers : FALLBACK_PROVIDERS
  const selected = options.find((p) => p.id === providerId)

  const validate = async (k: string) => {
    setStatus('validating')
    const mid = modelId.trim() || null
    const res = await window.neonforge.gateway.validate(k, providerId, mid)
    if (res.ok) {
      await window.neonforge.config.setKey(k, providerId, res.modelSource === 'manual' ? mid : null)
      onDone()
      return
    }
    if (res.error === 'needs-model-id') {
      setNeedModelId(true)
      if (!modelId.trim() && res.suggestModelId) setModelId(res.suggestModelId)
      setStatus('fail')
      setErrorText('该接入方无模型列表，请填写上游模型 ID 后再验证。')
      return
    }
    if (res.error === 'region-blocked') {
      setStatus('fail')
      setErrorText('该模型需在 OpenCode 工作区开通（浏览器点开通链接后再验）。')
      return
    }
    if (res.error === 'network' || res.error === 'timeout' || res.error === 'service-error') {
      setStatus('network')
      setErrorText(
        res.error === 'service-error' ? '服务暂时不可用，稍后重试。' : '无法连接，请检查网络。',
      )
    } else {
      setStatus('fail')
      setErrorText('验证失败，请检查 Key、接入方与模型 ID 是否匹配。')
    }
  }

  const submit = () => {
    const k = key.trim()
    if (!k) return
    if (needModelId && !modelId.trim()) {
      setStatus('fail')
      setErrorText('请填写上游模型 ID。')
      return
    }
    void validate(k)
  }

  const helpText =
    selected?.howToGetKey.zh?.trim() || '先选接入方，再按对应站点生成 API Key 粘贴到下方。'

  return (
    <div className="nf-config">
      <h1 className="nf-config__title">NeonForge</h1>
      <p className="nf-config__lead">连接你的 AI 搭档 · Key 只存本机</p>

      <div className="nf-config__compose">
        <label className="nf-config__field">
          <span className="nf-config__field-label">接入方</span>
          <div className="nf-config__select-wrap">
            <select
              className="nf-config__control nf-config__select"
              aria-label="接入方"
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value)
                setNeedModelId(false)
                if (status !== 'idle') setStatus('idle')
              }}
            >
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="nf-config__select-value" aria-hidden>
              {selected?.label ?? options[0]?.label}
            </span>
          </div>
        </label>

        <label className="nf-config__field">
          <span className="nf-config__field-label">API Key</span>
          <input
            className={`nf-config__control nf-config__input${status === 'fail' && !needModelId ? ' nf-config__control--error' : ''}`}
            type="password"
            placeholder="粘贴 API Key"
            aria-label="API Key"
            autoComplete="current-password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              if (status !== 'idle') setStatus('idle')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            autoFocus
          />
        </label>

        {needModelId && (
          <label className="nf-config__field">
            <span className="nf-config__field-label">上游模型 ID</span>
            <input
              className={`nf-config__control nf-config__input${status === 'fail' ? ' nf-config__control--error' : ''}`}
              type="text"
              placeholder="如 deepseek/deepseek-v4.1-flash"
              aria-label="模型 ID"
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value)
                if (status !== 'idle') setStatus('idle')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </label>
        )}

        {status === 'fail' && (
          <p className="nf-config__err" aria-live="polite">
            {errorText}
          </p>
        )}
        {status === 'network' && (
          <div className="nf-config__banner" aria-live="polite">
            <span>{errorText}</span>
            <button type="button" className="nf-config__link" onClick={onDone}>
              跳过（离线不可用）
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="nf-config__cta"
        onClick={submit}
        disabled={status === 'validating'}
      >
        {status === 'validating' ? '验证中…' : '验证并开始'}
      </button>

      <details className="nf-config__why">
        <summary>怎么获取 Key？</summary>
        <p className="nf-config__why-text">
          {helpText}
          {selected?.docsUrl ? (
            <>
              {' '}
              <a
                className="nf-config__link"
                href={selected.docsUrl}
                target="_blank"
                rel="noreferrer"
              >
                打开获取页
              </a>
            </>
          ) : null}
        </p>
      </details>
      <details className="nf-config__why">
        <summary>为什么需要？</summary>
        <p className="nf-config__why-text">
          NeonForge 经你选的接入方调用 DeepSeek V4
          系列模型。有模型列表时自动挑选；无列表时需手填上游模型 ID。Key
          只存本机（系统加密），不会上传到 NeonForge 服务器。
        </p>
      </details>
    </div>
  )
}
