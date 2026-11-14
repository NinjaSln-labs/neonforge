// P1-05 阶段 3：对话输入区（textarea/@引用浮层/发送-停止按钮）。
// 仅管理输入区本地 UI 状态；发送/停止由面板回传，领域状态不在此组件内。
import { useEffect, useState, type RefObject } from 'react'
import { IconFile } from './icons'

export function ConversationComposer({
  input,
  setInput,
  inputRef,
  textareaRef,
  currentFile,
  availableFiles,
  working,
  pending,
  onSend,
  onStop,
}: {
  input: string
  setInput: (value: string) => void
  inputRef: RefObject<string>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  currentFile?: string | null
  availableFiles: string[]
  working: boolean
  pending: string
  onSend: () => void
  onStop: () => void
}) {
  const [mentionOpen, setMentionOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [mentionActive, setMentionActive] = useState(-1)
  // 浮层打开/内容变化时重置高亮（-1=未高亮）
  useEffect(() => {
    if (!mentionOpen) setMentionActive(-1)
    else setMentionActive(recentFiles.length > 0 ? 0 : -1)
  }, [mentionOpen, recentFiles])
  // 选择浮层项（输入框 @后插入文件名）——点击/Enter 共用
  const pickMention = (idx: number) => {
    const f = recentFiles[idx]
    if (!f) return
    const before = inputRef.current.replace(/@[^@]*$/, '')
    const next = before + '@' + f + ' '
    inputRef.current = next
    setInput(next)
    setMentionOpen(false)
    setMentionActive(-1)
    textareaRef.current?.focus()
  }
  return (
    <div className="nf-chat__input">
      {/* 2026-09-07 用户决策：发送/停止合并为一个按钮，置于输入框内右侧——working=停止（红），空闲=发送 */}
      <div className="nf-chat__field">
        <textarea
          ref={textareaRef}
          value={input}
          placeholder={
            pending === 'system_clarify'
              ? '请先在上方卡片做出选择（文字回复不能替代确认）'
              : '输入想法…（Enter 发送 · Shift+Enter 换行）'
          }
          aria-label="给搭档的消息"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={mentionOpen}
          aria-controls="nf-mention-list"
          aria-autocomplete="list"
          rows={2}
          onChange={(e) => {
            inputRef.current = e.target.value
            setInput(e.target.value)
            const v = e.target.value
            if (v.includes('@') && availableFiles.length > 0) {
              setRecentFiles(availableFiles)
              setMentionOpen(true)
            } else if (!v.includes('@')) {
              setMentionOpen(false)
            }
          }}
          onKeyDown={(e) => {
            // 输入法组合中（拼音/候选确认的回车 isComposing=true）——不拦截，交给输入法
            if (e.nativeEvent.isComposing) return
            // 08 快捷键（D0 §6）：Cmd/Ctrl+E = @引用当前选中文件
            if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (currentFile) {
                const name = currentFile.split('/').pop() ?? currentFile
                inputRef.current = inputRef.current + `@${name} `
                setInput(inputRef.current)
                if (inputRef.current.includes('@') && availableFiles.length > 0) {
                  setRecentFiles(availableFiles)
                  setMentionOpen(true)
                }
              }
              return
            }
            // 浮层打开时——方向键移动高亮 / Esc 关闭 / Enter 选择
            if (mentionOpen) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const len = recentFiles.length
                if (len === 0) return
                setMentionActive((cur) => {
                  if (cur === -1) return e.key === 'ArrowDown' ? 0 : len - 1
                  return e.key === 'ArrowDown' ? (cur + 1) % len : (cur - 1 + len) % len
                })
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMentionOpen(false)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey && mentionActive >= 0) {
                e.preventDefault()
                pickMention(mentionActive)
                return
              }
            }
            // Enter=发送；Shift+Enter=换行；⌘/Ctrl+Enter 也发送（兼容旧习惯）
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        {/* @引用浮层移到 textarea 之后（Tab 顺序 textarea→option→发送——修复键盘不可达） */}
        {mentionOpen && (
          <div id="nf-mention-list" className="nf-mention" role="listbox" aria-label="引用文件">
            <span className="nf-mention__title">引用文件</span>
            {recentFiles.map((f, i) => (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={i === mentionActive}
                className={`nf-mention__item${i === mentionActive ? ' nf-mention__item--active' : ''}`}
                onClick={() => pickMention(i)}
              >
                <IconFile size={12} /> {f}
              </button>
            ))}
          </div>
        )}
        {/* 单按钮双态——working=停止（打断当前流/杀 bash），空闲=发送 */}
        {working ? (
          <button
            type="button"
            className="nf-chat__send nf-chat__send--stop"
            onClick={onStop}
            aria-label="停止搭档当前工作"
          >
            ⏹ 停止
          </button>
        ) : (
          <button
            type="button"
            className="nf-chat__send"
            onClick={onSend}
            disabled={!input.trim()}
            aria-label="发送"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
