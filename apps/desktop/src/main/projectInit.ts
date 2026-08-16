// 0-1 项目初始化（ticket 07 真实执行地基）：从零开始 → 创建真实项目目录 + 骨架
// 纯逻辑模块（无 electron 依赖——可独立测试）；workspace 调用
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 需求标题常见开头语气词（2026-08-04：从零开始整句需求 → 目录名去口语前缀——目录名应简洁可识别；长词在前优先匹配）
const PHRASE_PREFIXES = [
  '我想做一个',
  '我想做个',
  '我想做',
  '我要做一个',
  '我要做个',
  '我要做',
  '请帮我做一个',
  '请帮我做个',
  '请帮我做',
  '请帮我',
  '帮我做一个',
  '帮我做个',
  '帮我做',
  '帮我',
  '做一个',
  '做个',
  '做',
  '请',
]

// 标题 → 目录 slug（小写/非字母数字转 -/限 20 字符；中文保留；去口语前缀——目录名简洁可识别）
export function slugify(title: string): string {
  let s = String(title ?? '')
  // 去开头语气词（长优先——「我想做一个」先于「我想做」匹配）
  for (const p of PHRASE_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length)
      break
    }
  }
  s = s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
  return s || 'untitled'
}

// V1 项目基目录：用户 Documents/NeonForge（持久——非临时目录）
export function projectBaseDir(): string {
  return path.join(os.homedir(), 'Documents', 'NeonForge')
}

// 创建项目目录 + 基础骨架（README 仅标记项目存在——2026-08-04 用户反馈：需求/技术栈未定时不应创建 package.json/src 等工程文件）
export function initProjectFiles(dir: string, title: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'README.md'),
    `# ${title}\n\n> NeonForge 0-1 项目——需求驱动交付\n> 需求确认、技术栈确定后，搭档会在这里创建工程文件\n`,
    'utf-8',
  )
  // 2026-08-05 项目上下文（竞品共识：CLAUDE.md/AGENTS.md 启动注入精炼项目规则——不塞文件清单，避免上下文滥用）：
  // .neonforge 骨架——通用精炼规则（用户可编辑；send 时 readNotebook 注入）；不写文件清单/具体结构（让模型 search 定位）
  const nfPath = path.join(dir, '.neonforge')
  if (!existsSync(nfPath)) {
    writeFileSync(
      nfPath,
      `# NeonForge 搭档须知（项目规则——可编辑）\n\n## 常用命令\n- 依赖安装：npm install（或 pnpm/yarn）\n- 开发服务器：npm run dev / vite（**端口不固定**——vite 自动递增，以工具输出里的实际地址为准）\n\n## 开发约定\n- 排查问题：先 search/LSP 定位到文件和行号，再 read 目标（不盲读）\n- 用户明确要求操作（打开/起服务/继续）：立即调工具执行，不只说「我去做」\n`,
      'utf-8',
    )
  }
}

// 2026-08-14 缝隙 6 根因修复：npm package name 必须合法（URL-safe 小写）——slugify 保留中文（目录名用户可读），
// 中文 title 直接当 name 会产出非法 name（「3d设计游戏」→ npm Invalid name）→ npm init/install 链条失败
// （冒烟实测：模型 npm init 中文目录 exit-1 + 空错误 → 13 次原样重试死循环）。name 与目录名解耦：ASCII 安全名
export function safePkgName(title: string): string {
  const ascii = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[._]+/, '') // npm 不允许 . / _ 开头
    .slice(0, 200)
  return ascii || 'neonforge-app'
}

// 2026-08-04：需求确认后回写项目标题（README 首行 + package.json name）——目录名保持稳定（防路径断裂），标题跟随澄清结果
// 纯逻辑模块——workspace 调用（读现有 README 保留其余内容）
export function updateProjectTitle(dir: string, title: string): void {
  const readmePath = path.join(dir, 'README.md')
  const pkgPath = path.join(dir, 'package.json')
  const readme = readFileSync(readmePath, 'utf-8')
  // 替换首行 # 标题（保留后续正文）
  const nextReadme = readme.replace(/^# .+$/m, `# ${title}`) || `# ${title}\n`
  writeFileSync(readmePath, nextReadme, 'utf-8')
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string }
    // 2026-08-14 缝隙 6：name 用安全名（原 slugify(title) 保留中文 → 非法 npm name）
    writeFileSync(
      pkgPath,
      JSON.stringify({ ...pkg, name: safePkgName(title) }, null, 2) + '\n',
      'utf-8',
    )
  } catch {
    /* package.json 缺失/损坏——README 已更新，忽略 */
  }
}
