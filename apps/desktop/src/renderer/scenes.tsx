// 场景卡共享数据（2026-08-04 启动页方案 A：从 ConversationPanel 抽出——启动页 + 对话空态共用）
// 用户零学习成本入口：点击预填问题（启动页预填输入框 / 对话空态直接预填发送）
import { IconFolder, IconWrench, IconSparkles, IconGamepad, IconRocket } from './icons'

export interface Scene {
  icon: (p: { size?: number; className?: string }) => React.ReactNode
  label: string
  q: string
}

export const SCENES: Scene[] = [
  { icon: IconFolder, label: '整理文件', q: '把 Downloads 里的发票和合同分类整理' },
  { icon: IconWrench, label: '做小工具', q: '帮我做一个每周记账的小工具' },
  { icon: IconSparkles, label: '修系统', q: 'X 系统今天出异常了，帮我看看' },
  { icon: IconGamepad, label: '做游戏', q: '我要做一个3D射击小游戏（第一人称，科幻风格）' },
  { icon: IconRocket, label: '做新项目', q: '我要做一个能发给朋友的旅行手册网页' },
]
