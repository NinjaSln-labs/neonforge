// P0-04：进程清理守卫（纯函数，tools/serviceManager 共用）
// 无效 pid 一律跳过：kill(0)/kill(-0) 会向当前进程组发送信号（可杀死应用自身或误杀用户进程）。
export function isKillablePid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 0
}

/** 只对有效 pid 发进程组信号；无效/0/NaN 一律不调用 kill（防 kill(-0) 打当前进程组）。 */
export function killProcessGroupBestEffort(pid: unknown): boolean {
  if (!isKillablePid(pid)) return false
  try {
    process.kill(-pid, 'SIGKILL')
    return true
  } catch {
    return false
  }
}
