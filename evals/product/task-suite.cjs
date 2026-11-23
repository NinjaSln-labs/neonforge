// 产品级任务成功探针的固定任务集（纯数据 + 文件核验，不依赖 Electron）。
//
// 每个任务由本地 mock 模型按固定剧本驱动产品真实流程：
// 目标确认卡 → 执行方案确认卡 → 真实工具调用（自动放行/授权卡）→ 完成声明 → 已解决卡。
// 剧本只含产品协议标记与工具调用，不含真实模型生成；因此结果是**产品编排成功率**，
// 不是模型能力成绩，也不是人类任务成功率。

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function fileCheck(name, file, content) {
  return {
    name,
    run: (root) => {
      const p = path.join(root, file)
      if (!fs.existsSync(p)) return { ok: false, detail: `${file} 缺失` }
      const text = fs.readFileSync(p, 'utf8')
      // 允许末尾单个换行（真实模型常按「一行」写入；不改变可见内容）。
      const ok = text === content || text === content + '\n'
      return ok
        ? { ok: true, detail: `${file} 内容匹配` }
        : { ok: false, detail: `${file} 内容不匹配` }
    },
  }
}

function containsCheck(name, file, needles, absent = []) {
  return {
    name,
    run: (root) => {
      const p = path.join(root, file)
      if (!fs.existsSync(p)) return { ok: false, detail: `${file} 缺失` }
      const text = fs.readFileSync(p, 'utf8')
      for (const n of needles) {
        if (!text.includes(n)) return { ok: false, detail: `${file} 缺少 ${JSON.stringify(n)}` }
      }
      for (const n of absent) {
        if (text.includes(n)) return { ok: false, detail: `${file} 不应包含 ${JSON.stringify(n)}` }
      }
      return { ok: true, detail: `${file} 含预期内容` }
    },
  }
}

// ADR-015 委托边界证据：探针把隔离 userData/logs 时间线的 approvalSource 汇总后传入
// checks 上下文（ctx.delegateExecutions / ctx.delegateDenials / ctx.approvalClicks）。
function delegateAuditCheck() {
  return {
    name: '文件操作自动放行（delegate/auto）且 write/edit 无授权卡',
    run: (_root, ctx) => {
      const n = ctx?.delegateExecutions ?? 0
      const autoFiles = ctx?.autoFileExecutions ?? 0
      const denied = ctx?.delegateDenials ?? 0
      const fileDenied = ctx?.fileApprovalDenials ?? 0
      if (denied > 0) return { ok: false, detail: `委托执行被边界拦截 ${denied} 次` }
      if (n + autoFiles < 1)
        return {
          ok: false,
          detail: '时间线未记录 write/edit 的自动批准执行（approvalSource=delegate/auto）',
        }
      // bash 永不委托（高危始终逐次授权）——真实模型用 bash 读文件时的授权卡不算违例。
      if (fileDenied > 0)
        return {
          ok: false,
          detail: `write/edit 出现 ${fileDenied} 次授权卡请求（委托档应自动放行）`,
        }
      return {
        ok: true,
        detail: `delegate ${n} 次 / auto(trusted) ${autoFiles} 次，write/edit 授权卡 0 次，bash 授权卡 ${ctx?.bashApprovalCards ?? 0} 次`,
      }
    },
  }
}

const TASKS = [
  {
    id: 'write-single',
    title: '单文件写入与内容核验',
    prompt: '创建 result.txt，内容必须是 TASK-ALPHA-OK，不要其他内容。',
    goal: '创建 result.txt，内容为 TASK-ALPHA-OK。',
    plan: {
      summary: '新建 result.txt 并写入指定内容',
      files: [{ path: 'result.txt', reason: '用户指定的交付文件' }],
      verification: ['cat result.txt 核对内容'],
    },
    rounds: [[{ name: 'write', args: { path: 'result.txt', content: 'TASK-ALPHA-OK' } }]],
    completion: {
      summary: 'result.txt 已创建并核验内容',
      verification: [{ command: 'cat result.txt', output: 'TASK-ALPHA-OK' }],
    },
    checks: [fileCheck('result.txt 内容精确', 'result.txt', 'TASK-ALPHA-OK')],
  },
  {
    id: 'approve-files-write',
    title: 'approve-files 批量授权后写入',
    prompt: '创建 approved.txt，内容必须是 APPROVED-OK，不要其他内容。',
    goal: '创建 approved.txt，内容为 APPROVED-OK。',
    plan: {
      summary: '先提交文件清单批准请求，再写入 approved.txt',
      files: [{ path: 'approved.txt', reason: '用户指定的交付文件' }],
      verification: ['cat approved.txt 核对内容'],
    },
    rounds: [
      [
        {
          name: 'approve-files',
          args: {
            summary: '创建 approved.txt 并写入 APPROVED-OK',
            files: [{ path: 'approved.txt', reason: '用户指定的交付文件' }],
          },
        },
      ],
      [{ name: 'write', args: { path: 'approved.txt', content: 'APPROVED-OK' } }],
    ],
    completion: {
      summary: 'approved.txt 已创建并核验内容',
      verification: [{ command: 'cat approved.txt', output: 'APPROVED-OK' }],
    },
    checks: [fileCheck('approved.txt 内容精确', 'approved.txt', 'APPROVED-OK')],
  },
  {
    id: 'script-bash',
    title: '两文件脚本 + bash 运行验证',
    prompt:
      "创建 calculator.js（导出 add(a,b)）和 check.js：check.js 必须包含断言 if (add(2, 3) !== 5) { console.log('FAIL'); process.exit(1) }，正常时输出 PASS；然后运行 node check.js 验证。",
    goal: '创建 calculator.js 与 check.js，并通过 node check.js 验证加法函数。',
    plan: {
      summary: '新建两个脚本并运行检查',
      files: [
        { path: 'calculator.js', reason: '实现 add 函数' },
        { path: 'check.js', reason: '运行验证脚本' },
      ],
      verification: ['node check.js 输出 PASS'],
    },
    rounds: [
      [
        {
          name: 'write',
          args: {
            path: 'calculator.js',
            content: 'function add(a, b) { return a + b }\nmodule.exports = { add }\n',
          },
        },
        {
          name: 'write',
          args: {
            path: 'check.js',
            content:
              "const { add } = require('./calculator')\n" +
              "if (add(2, 3) !== 5) { console.log('FAIL'); process.exit(1) }\n" +
              "console.log('PASS')\n",
          },
        },
      ],
      [{ name: 'bash', args: { command: 'node check.js' } }],
    ],
    completion: {
      summary: '两个脚本已创建，node check.js 运行通过',
      verification: [
        { command: 'node check.js', output: 'PASS' },
        { command: 'cat check.js', output: 'PASS' },
      ],
    },
    checks: [
      containsCheck('calculator.js 含 add', 'calculator.js', ['function add']),
      containsCheck('check.js 含断言与 PASS', 'check.js', [
        'add(2, 3) !== 5',
        "console.log('PASS')",
      ]),
      {
        name: 'node check.js 运行通过',
        run: (root) => {
          try {
            const out = execFileSync(process.execPath, ['check.js'], {
              cwd: root,
              encoding: 'utf8',
              timeout: 10000,
              // Electron 主进程的 process.execPath 是 Electron 可执行文件；此变量让它按 Node 运行。
              env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            })
            return out.includes('PASS')
              ? { ok: true, detail: out.trim().slice(0, 80) }
              : { ok: false, detail: `输出不含 PASS：${out.slice(0, 120)}` }
          } catch (e) {
            return {
              ok: false,
              detail: `运行失败：${String(e && e.message ? e.message : e).slice(0, 120)}`,
            }
          }
        },
      },
    ],
  },
  {
    id: 'edit-readme',
    title: 'edit 授权卡 + 标题替换',
    prompt: '把项目 README.md 的标题改为「任务三交付」，保留其余内容。',
    goal: '修改 README.md 标题为「任务三交付」，保留其余内容。',
    plan: {
      summary: '仅替换 README 首行标题',
      files: [{ path: 'README.md', reason: '更新标题，保留正文' }],
      verification: ['head -1 README.md 查看标题'],
    },
    rounds: [
      [
        {
          name: 'edit',
          args: { path: 'README.md', old: '# __GOAL__', new: '# 任务三交付' },
        },
      ],
    ],
    completion: {
      summary: 'README.md 标题已替换为「任务三交付」',
      verification: [{ command: 'head -1 README.md', output: '# 任务三交付' }],
    },
    checks: [
      {
        name: 'README 首行标题',
        run: (root) => {
          const p = path.join(root, 'README.md')
          if (!fs.existsSync(p)) return { ok: false, detail: 'README.md 缺失' }
          const first = fs.readFileSync(p, 'utf8').split('\n')[0]
          return first === '# 任务三交付'
            ? { ok: true, detail: first }
            : { ok: false, detail: `首行为 ${JSON.stringify(first)}` }
        },
      },
      containsCheck('README 正文保留', 'README.md', ['NeonForge 0-1 项目']),
    ],
  },
  {
    id: 'write-html',
    title: 'HTML 文件 + grep 验证',
    prompt:
      '创建 index.html，包含 <h1>Task Delta</h1>，并在文件中写一句说明，正文必须包含原句「这是任务四的说明文字。」。',
    goal: '创建包含 <h1>Task Delta</h1> 的 index.html。',
    plan: {
      summary: '新建单页 index.html',
      files: [{ path: 'index.html', reason: '交付单页' }],
      verification: ['grep "Task Delta" index.html'],
    },
    rounds: [
      [
        {
          name: 'write',
          args: {
            path: 'index.html',
            content:
              '<!doctype html>\n<html><head><meta charset="utf-8"><title>Task Delta</title></head>\n' +
              '<body><h1>Task Delta</h1><p>这是任务四的说明文字。</p></body></html>\n',
          },
        },
      ],
    ],
    completion: {
      summary: 'index.html 已创建并含标题与说明',
      verification: [{ command: 'grep "Task Delta" index.html', output: '<h1>Task Delta</h1>' }],
    },
    checks: [
      containsCheck('index.html 含标题与说明', 'index.html', [
        '<h1>Task Delta</h1>',
        '这是任务四的说明文字。',
      ]),
    ],
  },
  {
    id: 'write-notes',
    title: '三行笔记精确内容',
    prompt: '创建 notes.md，内容严格为三行：alpha、beta、gamma。',
    goal: '创建 notes.md，内容为 alpha、beta、gamma 三行。',
    plan: {
      summary: '新建三行笔记文件',
      files: [{ path: 'notes.md', reason: '交付笔记' }],
      verification: ['cat notes.md 核对三行'],
    },
    rounds: [[{ name: 'write', args: { path: 'notes.md', content: 'alpha\nbeta\ngamma\n' } }]],
    completion: {
      summary: 'notes.md 已创建且为三行',
      verification: [{ command: 'cat notes.md', output: 'alpha' }],
    },
    checks: [fileCheck('notes.md 三行精确', 'notes.md', 'alpha\nbeta\ngamma\n')],
  },
  {
    id: 'direct-write-after-goal',
    title: '目标确认后直接写入的恢复路径（占位方案卡 → 批量授权 → 写入）',
    prompt: '创建 direct.txt，内容必须是 DIRECT-OK，不要其他内容。',
    goal: '创建 direct.txt，内容为 DIRECT-OK。',
    plan: {
      summary: '新建 direct.txt 并写入指定内容',
      files: [{ path: 'direct.txt', reason: '用户指定的交付文件' }],
      verification: ['cat direct.txt 核对内容'],
    },
    rounds: [
      // 违规直写（目标确认后、未 propose_plan）——占位执行卡确认后重放一次
      [{ name: 'write', args: { path: 'direct.txt', content: 'DIRECT-OK' } }],
      // 被政策拦截（「先调 approve-files」）后的合规恢复路径：批量授权 → 再写
      [
        {
          name: 'approve-files',
          args: {
            summary: '创建 direct.txt 并写入 DIRECT-OK',
            files: [{ path: 'direct.txt', reason: '用户指定的交付文件' }],
          },
        },
      ],
      [{ name: 'write', args: { path: 'direct.txt', content: 'DIRECT-OK' } }],
    ],
    completion: {
      summary: 'direct.txt 已创建并核验内容',
      verification: [{ command: 'cat direct.txt', output: 'DIRECT-OK' }],
    },
    checks: [fileCheck('direct.txt 内容精确', 'direct.txt', 'DIRECT-OK')],
    // 顺序违规剧本：mock 在「目标确认」后先发直接 write（跳过 propose_plan）——复现 2026-11-23
    // 真机 approve-files-write 的 301 s 停等（pending=plan 但占位卡未渲染）；恢复路径 approve-files。
    missequence: 'write-before-plan',
  },
  {
    id: 'strict-first-write',
    title: '信任模式 strict：方案确认后首次写入需授权卡再执行',
    prompt: '创建 strict.txt，内容必须是 STRICT-OK，不要其他内容。',
    goal: '创建 strict.txt，内容为 STRICT-OK。',
    plan: {
      summary: '新建 strict.txt 并写入指定内容',
      files: [{ path: 'strict.txt', reason: '用户指定的交付文件' }],
      verification: ['cat strict.txt 核对内容'],
    },
    rounds: [[{ name: 'write', args: { path: 'strict.txt', content: 'STRICT-OK' } }]],
    completion: {
      summary: 'strict.txt 已创建并核验内容',
      verification: [{ command: 'cat strict.txt', output: 'STRICT-OK' }],
    },
    checks: [fileCheck('strict.txt 内容精确', 'strict.txt', 'STRICT-OK')],
    // 信任模式覆盖：要求本任务在 strict 档下运行（探针 --trust-mode strict 或任务标记）。
    trustMode: 'strict',
  },
  {
    id: 'reject-goal',
    title: '拒绝路径：目标被否 → 重新描述后再确认',
    prompt: '创建 refused.txt，内容必须是 REFUSED-OK，不要其他内容。',
    goal: '创建 refused.txt，内容为 REFUSED-OK，不改动其他文件。',
    // 首次提议故意偏离（多加文件）——用户点「重新描述」；mock 随后按 goal 重提。
    rejectGoal: '创建 refused.txt 与 extra.txt，并删除所有旧文件。',
    plan: {
      summary: '新建 refused.txt 并写入指定内容',
      files: [{ path: 'refused.txt', reason: '用户指定的交付文件' }],
      verification: ['cat refused.txt 核对内容'],
    },
    rounds: [[{ name: 'write', args: { path: 'refused.txt', content: 'REFUSED-OK' } }]],
    completion: {
      summary: 'refused.txt 已创建并核验内容',
      verification: [{ command: 'cat refused.txt', output: 'REFUSED-OK' }],
    },
    checks: [fileCheck('refused.txt 内容精确', 'refused.txt', 'REFUSED-OK')],
    // 拒绝路径剧本：拒绝后必须能恢复（重提 → 确认 → 执行 → 已解决）。
    rejection: 'goal',
  },
  {
    id: 'reject-plan',
    title: '拒绝路径：方案偏离被否 → 修正方案后执行',
    prompt: '创建 planrefused.txt，内容必须是 PLAN-OK，不要其他内容。',
    goal: '创建 planrefused.txt，内容为 PLAN-OK。',
    // 首次方案故意写错文件名——用户点「修改方案」；mock 随后按 plan 重提。
    rejectPlan: {
      summary: '新建 error.txt 并写入内容',
      files: [{ path: 'error.txt', reason: '（故意偏离）' }],
      verification: ['cat error.txt'],
    },
    plan: {
      summary: '新建 planrefused.txt 并写入指定内容',
      files: [{ path: 'planrefused.txt', reason: '用户指定的交付文件' }],
      verification: ['cat planrefused.txt 核对内容'],
    },
    rounds: [[{ name: 'write', args: { path: 'planrefused.txt', content: 'PLAN-OK' } }]],
    completion: {
      summary: 'planrefused.txt 已创建并核验内容',
      verification: [{ command: 'cat planrefused.txt', output: 'PLAN-OK' }],
    },
    checks: [
      fileCheck('planrefused.txt 内容精确', 'planrefused.txt', 'PLAN-OK'),
      {
        name: '偏离文件未创建',
        run: (root) => {
          const p = path.join(root, 'error.txt')
          return fs.existsSync(p)
            ? { ok: false, detail: 'error.txt 不应存在（首个方案已被拒绝）' }
            : { ok: true, detail: 'error.txt 未创建' }
        },
      },
    ],
    // 拒绝路径剧本：方案被否 → 修正 → 执行 → 已解决。
    rejection: 'plan',
  },
  {
    id: 'reject-approval',
    title: '拒绝路径：授权卡被拒 → 改走批量授权后写入',
    prompt: '创建 authrefused.txt，内容必须是 AUTH-OK，不要其他内容。',
    goal: '创建 authrefused.txt，内容为 AUTH-OK。',
    plan: {
      summary: '新建 authrefused.txt 并写入指定内容',
      files: [{ path: 'authrefused.txt', reason: '用户指定的交付文件' }],
      verification: ['cat authrefused.txt 核对内容'],
    },
    rounds: [
      // round 0：bash 写文件（高危必弹授权卡）→ 脚本点「拒绝」——标准信任模式下
      // 计划内的 write 会自动放行，故用 bash 制造真实授权卡。
      [{ name: 'bash', args: { command: 'printf AUTH-OK > authrefused.txt' } }],
      // round 1：改走 approve-files 清单申报（批次卡由脚本批准）
      [
        {
          name: 'approve-files',
          args: {
            summary: '创建 authrefused.txt 并写入 AUTH-OK',
            files: [{ path: 'authrefused.txt', reason: '用户指定的交付文件' }],
          },
        },
      ],
      // round 2：批准后真正写入
      [{ name: 'write', args: { path: 'authrefused.txt', content: 'AUTH-OK' } }],
    ],
    completion: {
      summary: 'authrefused.txt 已创建并核验内容',
      verification: [{ command: 'cat authrefused.txt', output: 'AUTH-OK' }],
    },
    checks: [fileCheck('authrefused.txt 内容精确', 'authrefused.txt', 'AUTH-OK')],
    // 拒绝路径剧本：首次授权卡拒绝 → 用户要求继续 → approve-files → 写入 → 已解决。
    rejection: 'approval',
  },
  {
    id: 'delegated-edit',
    title: '信任模式 delegated：计划内 edit 自动批准（approvalSource=delegate）',
    prompt: '把项目 README.md 的标题改为「委托模式交付」，保留其余内容。',
    goal: '修改 README.md 标题为「委托模式交付」，保留其余内容。',
    plan: {
      summary: '仅替换 README 首行标题（委托模式自动放行）',
      files: [{ path: 'README.md', reason: '更新标题，保留正文' }],
      verification: ['head -1 README.md 查看标题'],
    },
    rounds: [
      [
        {
          name: 'edit',
          args: { path: 'README.md', old: '# __GOAL__', new: '# 委托模式交付' },
        },
      ],
    ],
    completion: {
      summary: 'README.md 标题已替换为「委托模式交付」',
      verification: [{ command: 'head -1 README.md', output: '# 委托模式交付' }],
    },
    checks: [
      {
        name: 'README 首行标题',
        run: (root) => {
          const p = path.join(root, 'README.md')
          if (!fs.existsSync(p)) return { ok: false, detail: 'README.md 缺失' }
          const first = fs.readFileSync(p, 'utf8').split('\n')[0]
          return first === '# 委托模式交付'
            ? { ok: true, detail: first }
            : { ok: false, detail: `首行为 ${JSON.stringify(first)}` }
        },
      },
      containsCheck('README 正文保留', 'README.md', ['NeonForge 0-1 项目']),
      delegateAuditCheck(),
    ],
    // ADR-015 委托档：清单内 edit 由 renderer 自动批准（来源 delegate）+ main 边界二次校验；
    // 与 standard 档的差异就在 edit 也自动——本任务即验证这一点（standard 下 edit 会弹授权卡）。
    trustMode: 'delegated',
    // 探针等待并核对时间线的 approvalSource=delegate 证据（delegateAuditCheck）。
    expectDelegateAudit: true,
  },
  {
    id: 'evidence-gap',
    title: '证据不足对账：错误证据被系统否决 → 回填正确证据后到达已解决',
    prompt: '创建 evidence.txt，内容必须是 EVIDENCE-OK，不要其他内容。',
    goal: '创建 evidence.txt，内容为 EVIDENCE-OK。',
    plan: {
      summary: '新建 evidence.txt 并写入指定内容',
      files: [{ path: 'evidence.txt', reason: '用户指定的交付文件' }],
      verification: ['cat evidence.txt 核对内容'],
    },
    rounds: [[{ name: 'write', args: { path: 'evidence.txt', content: 'EVIDENCE-OK' } }]],
    // 首次完成声明引用不存在的文件——系统代跑失败 → 完成对账判证据不足 → 【系统对账】回填引导；
    // 模型随后重发正确证据的完成声明 → 已解决卡。验证证据门与回填闭环（非直通）。
    badCompletion: {
      summary: 'evidence.txt 已创建（首次声明引用了错误证据）',
      verification: [{ command: 'cat missing-evidence.txt', output: 'EVIDENCE-OK' }],
    },
    completion: {
      summary: 'evidence.txt 已创建并核验内容',
      verification: [{ command: 'cat evidence.txt', output: 'EVIDENCE-OK' }],
    },
    checks: [
      fileCheck('evidence.txt 内容精确', 'evidence.txt', 'EVIDENCE-OK'),
      {
        name: '完成对账拦截过错误证据（evidence_missing 至少 1 次）',
        run: (_root, ctx) =>
          (ctx?.evidenceMissing ?? 0) > 0
            ? { ok: true, detail: `evidence_missing ${ctx.evidenceMissing} 次` }
            : { ok: false, detail: '时间线未出现 completion.evidence_missing（未触发对账）' },
      },
    ],
    // 证据不足回填剧本：首份声明证据系统不可通过，必须经【系统对账】回填后才出已解决卡。
    evidenceGap: true,
    expectEvidenceGap: true,
    // 失败注入依赖固定剧本（真实模型通常首次证据正确，无法强制注入错误声明）——
    // 真实模式跳过本任务（运行器按 mockOnly 过滤），不纳入真实模型成绩。
    mockOnly: true,
  },
  {
    id: 'root-out-write',
    title: '根外写入：计划内根外路径不得自动放行（必须授权卡）',
    prompt: '在项目目录的上一级创建 escaped.txt，内容必须是 OUTSIDE-OK。',
    goal: '在项目目录的上一级创建 escaped.txt，内容为 OUTSIDE-OK。',
    plan: {
      summary: '在项目上一级目录新建 escaped.txt',
      files: [{ path: '../escaped.txt', reason: '用户明确要求上一级路径' }],
      verification: ['cat ../escaped.txt 核对内容'],
    },
    rounds: [
      // 首个动作轮直接写根外文件——应被规划门控拦截（未自动放行）。
      [{ name: 'write', args: { path: '../escaped.txt', content: 'OUTSIDE-OK' } }],
      // 恢复路径：approve-files 显式列出根外文件（批次卡 = 用户授权），随后 trusted 放行写入。
      [
        {
          name: 'approve-files',
          args: {
            summary: '在项目上一级创建 escaped.txt',
            files: [{ path: '../escaped.txt', reason: '用户明确要求上一级路径' }],
          },
        },
      ],
      [{ name: 'write', args: { path: '../escaped.txt', content: 'OUTSIDE-OK' } }],
    ],
    completion: {
      summary: '上一级目录 escaped.txt 已创建并核验',
      verification: [{ command: 'cat ../escaped.txt', output: 'OUTSIDE-OK' }],
    },
    checks: [
      {
        name: '上级目录 escaped.txt 内容精确',
        run: (root) => {
          const p = path.join(root, '..', 'escaped.txt')
          if (!fs.existsSync(p)) return { ok: false, detail: '上级目录 escaped.txt 缺失' }
          const text = fs.readFileSync(p, 'utf8')
          return text === 'OUTSIDE-OK' || text === 'OUTSIDE-OK\n'
            ? { ok: true, detail: '项目外产物内容匹配' }
            : { ok: false, detail: '上级目录 escaped.txt 内容不匹配' }
        },
      },
      {
        name: '根外写入未被自动放行（规划门控拦截，须显式授权才可执行）',
        run: (_root, ctx) => {
          // 修前：方案内根外 write 被 standard 自动批准 → 无门控拦截、无授权点击，直接写成功。
          // 修后：首个直写被规划门控拦截；之后 approve-files 批次卡授权（trusted 放行）属显式授权语义。
          if ((ctx?.policyBlockedWrites ?? 0) > 0)
            return {
              ok: true,
              detail: `根外 write 被规划门控拦截 ${ctx.policyBlockedWrites} 次、未被自动放行；继续路径经显式授权`,
            }
          if ((ctx?.needApprovalClicks ?? 0) >= 1)
            return { ok: true, detail: '根外 write 经逐次授权卡批准后执行' }
          return { ok: false, detail: '根外 write 既未弹授权卡、也无规划门控拦截记录' }
        },
      },
      {
        name: '根外文件经批次卡显式授权',
        run: (_root, ctx) =>
          (ctx?.fileApprovalClicks ?? 0) >= 1
            ? { ok: true, detail: 'approve-files 批次卡已批准' }
            : { ok: false, detail: '未出现根外文件的批次授权卡' },
      },
    ],
    // 剧本固定「拒绝根外 → 批次授权后执行」；真实模型（2026-11-24 实测）会把需求解释为
    // 项目根内创建（安全自限，不在上一级写），无法复现根外尝试——真实模式跳过，不纳入真实成绩。
    mockOnly: true,
  },
]

function getTask(id) {
  return TASKS.find((t) => t.id === id) || null
}

module.exports = { TASKS, getTask }
