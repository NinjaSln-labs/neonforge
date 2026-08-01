import { useState } from 'react'
import type { DeliveryPackage } from './types'

// 数字产物交付（ticket 13）：非技术主路径——文件整理/数据加工 → 变更预览 → L3 授权 → 交付
const DEMO_FILES = ['发票/2026-07-10-淘宝.pdf', '发票/2026-07-15-京东.pdf', '发票/2026-07-22-美团.pdf', '合同/2026-07-18-服务协议.docx', '合同/2026-07-25-采购单.pdf', '重复/2026-07-10-淘宝-副本.pdf']

const TASKS = [
  ['🗂', '按类型整理分类', '把文件按 发票/合同/其他 分文件夹'],
  ['🔀', '合并同类文件', '发票合并成一张表'],
  ['📄', '格式转换', 'docx → pdf'],
  ['🧹', '数据清洗', '去掉重复/补全格式']
]

export default function DigitalDeliveryPanel({ onDeliver }: { onDeliver: (pkg: DeliveryPackage) => void }) {
  const [task, setTask] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)

  const startProcess = () => {
    setPreview(true)
  }

  const confirmAndDeliver = () => {
    setProcessing(true)
    setTimeout(() => {
      setProcessing(false)
      setDone(true)
      onDeliver({
        status: 'delivered',
        summary: '已按类型整理 6 个文件：发票 4 份 →「发票」、合同 2 份 →「合同」，重复文件已标出（未删除）',
        artifacts: ['发票/（4 份）', '合同/（2 份）', '重复文件清单.csv'],
        acceptance: [
          { label: '发票都在「发票」文件夹', done: false },
          { label: '文件名含日期 + 商户', done: false },
          { label: '重复文件已标出（未删，待你确认）', done: false }
        ],
        nextSteps: ['重复文件确认后我帮你删（授权后）'],
        rerunLabel: '上次那个整理，再跑一遍'
      })
    }, 600)
  }

  return (
    <div className="nf-digital">
      <div className="nf-flow__head">
        <span className="nf-flow__title">📁 数字产物交付</span>
        <span className="nf-flow__model">{DEMO_FILES.length} 个文件 · 待处理</span>
      </div>

      {/* 文件列表 */}
      <ul className="nf-digital__files">
        {DEMO_FILES.map((f) => <li key={f}>📄 {f}</li>)}
      </ul>

      {/* 处理任务选择 */}
      {!task && (
        <div className="nf-flow__models">
          {TASKS.map(([icon, label, q]) => (
            <button key={label} type="button" className="nf-flow__model-btn" onClick={() => setTask(label)}>
              <span>{icon} {label}</span>
              <span className="nf-flow__hint">{q}</span>
            </button>
          ))}
        </div>
      )}

      {/* 变更预览（L3 授权） */}
      {task && !preview && !done && (
        <div className="nf-digital__preview">
          <p className="nf-flow__stage-label">将处理 {DEMO_FILES.length} 个文件：{task}——影响范围如上清单，确认后执行</p>
          <button type="button" className="nf-delivery__primary" onClick={startProcess}>开始处理（L3 授权）</button>
        </div>
      )}

      {/* 执行中 */}
      {preview && !done && (
        <div className="nf-digital__preview">
          <p className="nf-flow__stage-label">{processing ? '⏳ 处理中…' : '变更预览：按类型分类 → 发票 4 / 合同 2 / 重复标出（不删除）'}</p>
          {!processing && (
            <button type="button" className="nf-delivery__primary" onClick={confirmAndDeliver}>确认并交付</button>
          )}
        </div>
      )}

      {done && <div className="nf-flow__done">✅ 处理完成——交付包已在「产物」区，验收后确认关闭</div>}
    </div>
  )
}
