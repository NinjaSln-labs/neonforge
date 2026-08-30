// 沙箱路径规范化（单一来源——renderer trustPath / main resolvePath 共用）
// #6 真机 2026-08-30（P1-6/P2-8）：模型传「任务目录/文件」形态相对路径（cwd 语义混淆）时，
// 两侧各自无脑拼 rootPath → 双重嵌套（批准注册的路径 ≠ 实际写入路径 → 批量批准被架空；edit ENOENT）。
// 纯字符串逻辑无 node 依赖——L1 可测、双端可导入。

/**
 * 规范化模型提供的文件路径 → rootPath 基准路径：
 * ① 绝对路径（含沙箱外）→ 原样（沙箱判定由调用方承担；类绝对单段 /package.json 由 main resolvePath 预处理）
 * ② 相对路径以 rootPath 目录名开头（模型误带 cwd 前缀——双重嵌套根因）→ 剥前缀再拼 rootPath
 * ③ 其余相对路径 → 拼 rootPath
 * rootPath 缺省时原样返回（调用方自行处理无沙箱语义）
 */
export function resolveSandboxPath(rootPath: string, p: string): string {
  const s = String(p ?? '').trim()
  if (!s) return s
  if (!rootPath) return s
  if (s.startsWith('/')) return s
  if (s === rootPath || s.startsWith(rootPath + '/')) return s
  const base = rootPath.slice(rootPath.lastIndexOf('/') + 1)
  if (base && (s === base || s.startsWith(base + '/'))) {
    const rest = s.slice(base.length)
    return rest ? `${rootPath}/${rest.replace(/^\/+/, '')}` : rootPath
  }
  return `${rootPath}/${s.replace(/^\/+/, '')}`
}
