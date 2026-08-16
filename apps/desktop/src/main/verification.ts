// S4 完成对账 V1a——系统代跑（应用层 IO——ADR-004：领域层同步消费快照，代跑执行在此）
// V1a：只代跑系统可核验（readonly/network-read）的只读验证命令 → verificationResults 快照
// V1b deriveDiffs 在领域层（conversationState.ts 单源——renderer 直接消费，此处不重复）
// 安全护栏：fail-closed（非只读命令不执行——判定由领域层 unverifiable 承担）+ 超时 5s + 输出截断 4KB + 串行执行
import { spawn } from 'node:child_process'
import { classifyReadonly } from '../domain/conversationState.js'

/** 命令是否系统可代跑（只读——与领域层 isSystemVerifiable 同源判定——main 侧再校验 fail-closed） */
function isSystemVerifiable(command: string): boolean {
  const kind = classifyReadonly('bash', command)
  return kind === 'readonly' || kind === 'network-read'
}

const RUN_TIMEOUT_MS = 5000
const MAX_OUTPUT = 4096

export interface VerificationResult {
  ok: boolean
  output?: string
}

/** 执行一条只读验证命令（超时 + 截断）——非只读命令由调用方过滤（fail-closed——不执行） */
function runOne(command: string, cwd?: string): Promise<VerificationResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let done = false
    const timer = setTimeout(() => finish(false, `(超时 ${RUN_TIMEOUT_MS}ms)`), RUN_TIMEOUT_MS)
    const finish = (ok: boolean, output?: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill('SIGKILL') // 防残留（正常退出时无副作用）
      resolve({ ok, output })
    }
    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString()
    })
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString()
    })
    child.on('error', (err) => finish(false, String(err.message)))
    child.on('close', (code) => {
      if (code === 0) finish(true, stdout.slice(0, MAX_OUTPUT))
      else finish(false, (stderr || stdout).slice(0, MAX_OUTPUT))
    })
  })
}

/** V1a：系统代跑只读验证命令（串行）→ verificationResults 快照（命令 → {ok, output}）。
 * 非只读命令跳过（结果表不含该项——判定由领域层 unverifiable 承担；不执行 = 安全） */
export async function runVerificationCommands(
  commands: string[],
  opts: { cwd?: string } = {},
): Promise<Record<string, VerificationResult>> {
  const results: Record<string, VerificationResult> = {}
  for (const command of commands) {
    if (!isSystemVerifiable(command)) continue // fail-closed：只跑系统可核验命令
    results[command] = await runOne(command, opts.cwd)
  }
  return results
}
