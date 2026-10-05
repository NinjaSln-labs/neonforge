// S1b Task 0（A2 归档前置）：main 复用文件去旧域依赖——本模块自包含、不 import 旧 domain 面。
// 判定体与旧 src/domain/conversationState.ts 逐字等价（等价回归见 tests/unit/toolClassify.test.ts）。
// ActionKind 收窄为 classifyReadonly 实际产出的三值（旧四值中的 in-plan/out-of-plan 属旧规划门控，本函数从不返回）。
export type ActionKind = 'readonly' | 'network-read' | 'hazardous'

// —— 动作属性判定（设计 §3.3 classifyReadonly——粒度升级：bash 链递归/git 子命令/网络只读） ——

// 只读命令头白名单（继承 main isReadOnlyBash fail-closed 判定——列表唯一）
// #6 真机 2026-08-30（P2-5 授权疲劳）：补 ps/lsof 等诊断只读头——真机 `ps aux | grep …` 授权卡连弹
export const BASH_READONLY_HEADS: ReadonlySet<string> = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'wc',
  'pwd',
  'echo',
  'which',
  'find',
  'sed',
  'awk',
  'cd',
  'stat',
  'file',
  'du',
  'df',
  'sort',
  'uniq',
  'rg',
  'tree',
  'diff',
  'history',
  'ps',
  'lsof',
  'uname',
  'whoami',
  'hostname',
  'id',
  'date',
])

// 2026-08-22 #6 真机体验闭环（问题 4——P1 根因链）：危险命令的**只读形态**排除——
// 真机取证：`node -v 2>&1; echo ---npm---; npm -v 2>&1` 验证环境被 `;` 链递归误判 hazardous
// （node/npm 是危险词，但 -v/--version 查询只读）→ sessionGate 拦「方案未确认」→ 模型无法验证
// 环境 → 被迫进方案决策点 → 空方案卡（根因链源头）。段级判定：段首危险命令 + 只读参数形态 → 非危险
const BASH_DANGEROUS_READONLY_SHAPE =
  /^(?:sudo\s+)?(node|npm|pnpm|yarn|python|python3)\s+(-v|--version|-V|-h|--help)\b|^which\s+[a-zA-Z0-9._-]+$/

// 段首命令词是否为危险命令（链递归用——**段首**匹配，非任意子串：`echo ---npm---` 的 npm 是参数不判危险）
const BASH_SEGMENT_DANGEROUS_HEAD =
  /^(?:sudo\s+)?(rm|mv|cp|mkdir|touch|npm|pnpm|yarn|git|curl|wget|python|python3|node|install|unlink|ln|chmod|chown)\b/

// git 只读子命令（Codex is_safe_git_command 方向）
const GIT_READONLY_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'status',
  'log',
  'diff',
  'show',
  'branch',
  'ls-files',
  'remote',
])

/** 动作只读判定（升级版——设计 §3.3）：readonly / network-read / hazardous（fail-closed） */
export function classifyReadonly(name: string, command?: string): ActionKind {
  if (name === 'write' || name === 'edit') return 'hazardous'
  if (name !== 'bash') return 'readonly' // read/search/LSP/check-capability → 工具类型只读
  const c = String(command ?? '').trim()
  if (!c) return 'hazardous' // 空命令 fail-closed（非只读）
  // 网络只读（curl/wget GET/HEAD 无写副作用 → network-read；拍板 3：localhost 自动放行，外网 ask——S6 策略落地在 actionGate）
  const netMatch = c.match(/^(curl|wget)\s+/)
  if (netMatch) {
    const method = c.match(/-X\s+(GET|HEAD)\b|--request\s+(GET|HEAD)\b/)
    // 写副作用标志（S6 复审补全——curl -o/-O/-T/-a/-C/-J 与 wget -O 大小写敏感漏网→localhost 自动放行下成洞）：
    // -o/--output 输出文件；-O/--remote-name/-J 落盘 CWD；-T/--upload-file 上传（写远端）；-a/--append 追加；-C/--continue-at 续传
    // #6 真机 2026-08-30（P2-5）：`-o /dev/null` 例外——健康检查惯用法（不落盘），不计写副作用
    const hasBodyFlag =
      /-d\b|--data\b|--data-raw\b|-F\b|--form\b|-X\s+(POST|PUT|PATCH|DELETE)\b|-o(?!\s*\/dev\/null\b)|--output(?!\s*\/dev\/null\b)|--remote-name\b|-J\b|-T\b|--upload-file\b|-a\b|--append\b|-C\b|--continue-at\b|-O\b/.test(
        c,
      ) // -O 大写（wget -O file——大小写敏感补全）
    if (!hasBodyFlag && (!method || method[1] === 'GET' || method[1] === 'HEAD'))
      return 'network-read'
    return 'hazardous'
  }
  // 重定向到文件 → 写副作用（2026-08-22 问题 4：排除 stderr 重定向 `2>&1`/`2>>1`——不写文件）
  // A-020（S5 真机）：stderr 丢弃 `2>/dev/null`/`2>>/dev/null` 同为不落盘——一并排除
  //（真机实证：`head -20 README.md 2>/dev/null` 被判 hazardous → 兜底强置空方案卡冻结工具——P1 ①）
  const stripped = c.replace(/2>&1|2>>1|2>>?\/dev\/null/g, '')
  if (/>\s*[^|]*$/m.test(stripped)) return 'hazardous'
  // 链递归：& / ; / | 分隔的每一段——段首为危险命令且非只读形态 → hazardous
  // 2026-08-22 问题 4：段级只读形态排除（node -v / npm --version / which node 查询 → 非危险）；
  // 段首匹配（echo ---npm--- 的 npm 是参数——不误伤）；
  // 链分隔：`2>&1` 中的 `&` 是 stderr 重定向不是链分隔——先保护再分割（原 `[;&|]` 把 2>&1 误拆成 2> 和 1）
  const protectedCmd = c.replace(/2>&1|2>>1|2>>?\/dev\/null/g, '§§§') // 保护 stderr 重定向（§ 非链分隔符）
  const segments = protectedCmd.split(/[;&|]/).map((seg) => seg.trim().replace(/§§§/g, '2>&1'))
  if (
    segments.length > 1 &&
    segments.some(
      (seg) => BASH_SEGMENT_DANGEROUS_HEAD.test(seg) && !BASH_DANGEROUS_READONLY_SHAPE.test(seg),
    )
  )
    return 'hazardous'
  const head = segments[0].split(/\s+/)[0]?.replace(/^sudo\s+/, '') ?? ''
  // git 子命令级判定（git status/log/diff 只读；git push/commit 写）
  if (head === 'git') {
    const sub = segments[0].split(/\s+/)[1] ?? ''
    return GIT_READONLY_SUBCOMMANDS.has(sub) ? 'readonly' : 'hazardous'
  }
  // 2026-08-22 问题 4：危险命令的只读形态（node -v / npm --version / which node）→ readonly
  // （单段/链段均适用——head 匹配 + 只读参数形态）
  if (BASH_DANGEROUS_READONLY_SHAPE.test(segments[0])) return 'readonly'
  return BASH_READONLY_HEADS.has(head) ? 'readonly' : 'hazardous'
}

// S6（§8.1 A + 拍板 3）：classifyAction 兼容壳移除——由 classifyReadonly + isSideEffectAction 直连取代。
// network-read 语义升级：localhost 自动放行（非 side-effect）/ 外网 ask（side-effect——安全默认）。
// 判定统一领域层（坑 97——renderer 6 处 + main preApproval 全部同源消费）。

/** localhost 判定（拍板 3 单源——actionGate 与 isSideEffectAction 共享；S6 复审：**host 精确匹配**——
 * 防子串误报（127.0.0.1.attacker.com / localhost.evil.io 不得自动放行）——只认协议头后的 host 为
 * localhost/127.0.0.1/::1（可带端口） */
export function isLocalhostCommand(command: string): boolean {
  // 匹配 http(s):// 或裸 host 开头的 localhost/127.0.0.1/[::1]（host 段结束于 / : 空白——精确边界）
  return /(?:^|\s)(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$|\s)/.test(
    command,
  )
}
