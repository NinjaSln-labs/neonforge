import DelegationCenter from './DelegationCenter'

// S1b Task 5：App 重写为委托单中心（旧对话中心由 A2.2 归档批 git rm）。
// Task 6 在本壳上追加「未持久化」横幅（F2）；本任务先挂六件主面。
export default function App() {
  return (
    <div className="nf-app">
      <DelegationCenter />
    </div>
  )
}
