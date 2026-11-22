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
    run: (root) =>
      fs.existsSync(path.join(root, file)) &&
      fs.readFileSync(path.join(root, file), 'utf8') === content
        ? { ok: true, detail: `${file} 内容匹配` }
        : {
            ok: false,
            detail: `${file} 缺失或内容不匹配`,
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
    id: 'script-bash',
    title: '两文件脚本 + bash 运行验证',
    prompt:
      '创建 calculator.js（导出 add(a,b)）和 check.js（验证 add(2,3)===5 并打印 PASS），然后运行 node check.js 验证。',
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
    prompt: '创建 index.html，包含 <h1>Task Delta</h1>，并在文件中写一句说明。',
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
]

function getTask(id) {
  return TASKS.find((t) => t.id === id) || null
}

module.exports = { TASKS, getTask }
