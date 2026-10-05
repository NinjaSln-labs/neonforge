import DelegationCenter from './DelegationCenter'

// S1b Task 5：App 重写为委托单中心（旧对话中心由 A2.2 归档批 git rm）。
// S1b Task 6（F2）：顶部横幅显式呈现「未持久化」——S1 内存态重启即失，不得静默装作已保存（原则1 诚实面）。
export default function App() {
  return (
    <div className="nf-app">
      <div className="nf-unpersisted">
        未持久化 · 内存态 · 重启即失——本阶段不做持久化（S3 落地）
      </div>
      <DelegationCenter />
    </div>
  )
}
