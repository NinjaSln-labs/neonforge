// S1b Task 7（E1）：流状态条——发起流并暴露 Stop。Stop⇒gateway.stop(streamId) 转投取消通道（Task 2 的 gateway.abort）。
// S1 最简：streamId 本地生成，Stop 后复位。真流发起/收流接线随 Task 8 e2e。
import { useState } from 'react'

export default function StreamBar() {
  const [streamId, setStreamId] = useState<string | null>(null)
  const start = () => setStreamId(`s-${Date.now()}`)
  const stop = () => {
    if (!streamId) return
    void window.neonforge?.gateway?.stop?.(streamId)
    setStreamId(null)
  }
  return (
    <div className="nf-streambar">
      {streamId === null ? (
        <button type="button" className="nf-streambar__start" onClick={start}>
          发起流
        </button>
      ) : (
        <button type="button" className="nf-streambar__stop" onClick={stop}>
          停止
        </button>
      )}
    </div>
  )
}
