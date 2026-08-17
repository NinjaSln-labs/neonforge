// e2e 模拟器域：防假阳性验证（设计 §3——Verifier 纯函数）
// 每决策点确定性验证：目标回显 / 方案要素 / 产物齐全 / 试玩判定（HTTP 由驱动层执行——判定归领域）
// 收编原 e2e-0to1.mjs 内联验证（okLen/okKw/echoed/文件检查）——L1 可测

/** 方案完整性（长度 + 要素——原 okLen/okKw 演进：内容够长 + 含方案要素词） */
export function verifyPlanComplete(content = '') {
  const okLen = content.length >= 60
  const okKw = /(方案|技术|用|结构|界面|页面|模块|整体)/.test(content)
  return { ok: okLen && okKw, length: content.length, hasKeywords: okKw }
}

/** 产物齐全（计划清单 ⊆ 实际文件——write/edit 成功记录 vs 已产出） */
export function verifyArtifacts(planned = [], produced = []) {
  if (planned.length === 0) return { ok: produced.length > 0, missing: [] }
  const missing = planned.filter((p) => !produced.includes(p))
  return { ok: missing.length === 0, missing }
}

/** 试玩 HTTP 判定（驱动层传入真实结果——判定归领域：状态码 + 内容量） */
export function verifyPlayable({ status, bytes }) {
  return { ok: status >= 200 && status < 300 && bytes > 50, status, bytes }
}

/** 需求收敛判定（标准 4 问是否齐——画像完整性） */
export function verifyRequirementsComplete(profile = {}) {
  const keys = ['做什么', '给谁玩', '在哪儿玩', '做成什么样']
  const missing = keys.filter((k) => !profile[k])
  return { ok: missing.length === 0, missing }
}
