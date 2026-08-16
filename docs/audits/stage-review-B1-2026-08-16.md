# 阶段末即时评审：流程重构阶段 1（B1 lint 工具链）——2026-08-16

> 模式：code-review 阶段末评审（P1-6 审计前移——阶段完成立即增量评审，不攒批）
> 固定点：`83a716c`（阶段首 commit `8a4e4c1` 的父）→ HEAD `91a95af`
> 范围：6 commit（工具链配置 / 51 处 lint 修复 / 99 文件格式化 / CI 门禁 / devDependencies 补回 / timeline.ts 折行补修）
> Spec 来源：`docs/audits/process-industry-research-20260816.md` §一 P1-3 + §四 落地顺序第 4 项（B1 无独立 stage-spec——流程重构任务）
> 方法：双轴并行子代理（Standards = 仓库规范 + Fowler smell 基线；Spec = 调研文档 P1-3 逐条核对）
> 结论：**无硬违规 / 无 spec 违背**；4 判断项 + 2 轻微 wrong——2 入账（open），4 裁决（recorded）

---

## Standards 轴

**无硬违规**（仓库无 CODING_STANDARDS/CONTRIBUTING；eslint/prettier/tsc 强制项跳过）。

重点核查均通过：
- e2e-0to1.mjs 删 `lastReal = lastMsg`：原文紧接 `return lastMsg`，死赋值，无行为变更；`lastReal` 由 `real` 分支维护，超时容错保留 ✓
- nf-gif-rec-v3.mjs 补 `import { fileURLToPath }`：原文件已用未导入（Node ESM ReferenceError），修复正确 ✓
- timeline.ts detectProposed 重折行（91a95af）：仅签名格式，无语义变化 ✓
- bb110df 抽查 KEY/SEM_* 常量重折行：纯格式，无字符串/逻辑改动 ✓
- qa.yml：eslint 全量与本地 `npm run lint` 作用域一致；prettier check glob 与本地 format:check 一致 ✓
- lefthook `root: apps/desktop`：源码/package.json 均在此下，glob 覆盖充分 ✓

**判断项（judgement call，非硬违规）**：
1. **format 脚本覆盖缺口**（package.json）：format/format:check glob 不含 repo-root 的 `.prettierrc.json`/`.prettierignore`/`lefthook.yml`/`qa.yml`——新引入的标准文件自身不在 coverage 内，依赖手动一致
2. **Duplicated Code**（eslint.config.js）：Node globals 两段近乎重复可合并；且给**所有** `.mjs` 顶层放行 `window/document`，过度宽松（顶层误用不会被拦）
3. **mjs 规则冗余**（eslint.config.js 43 行）：`'**/*.mjs'` 已全含 e2e-* 与 nf-gif-rec，后两条路径完全冗余
4. **门禁一致性**：react-hooks/exhaustive-deps 为 warn——不阻断 exit code，CI 实际放行该违规；与「门禁拦确定性项」意图略有张力（注释已声明取舍，属有意识决策）

## Spec 轴

**结论：spec 忠实实现**——五件套齐（eslint flat config / typescript-eslint / prettier / lefthook / lint-staged）、recommended+少量 strict 取舍合理、门禁只拦快且确定项（lefthook 仅 lint-staged 增量；复杂度交 CI——qa.yml 全量）、格式化独立 commit（bb110df）、eslint-config-prettier 关冲突、lint-staged glob 覆盖 mjs/json/md/yml、prettier 对齐既有风格（singleQuote/semi:false 与 baseline 一致）。**无 missing、无 scope-creep**（qa.yml paths/workflow_dispatch 本就存在于 baseline，diff 仅追加 ESLint/Prettier 两步）。

**轻微 wrong（非阻断）**：
- [wrong·轻微] `no-unused-vars` 在 tseslint recommended（v8）已默认启用，配置重复声明 + ignore pattern——语义更严不冲突，建议注释「重申门禁意图」
- [wrong·轻微] `format`/`format:check` 不显式列 `eslint.config.js`，依赖 `*.config.*` 通配（能命中）；CI 显式追加——行为一致，仅表达不统一

---

## 状态化清单

| # | 来源 | 发现 | 状态 | 处置 |
|---|------|------|------|------|
| S-1 | Standards 判断项 1 | format glob 不含 repo-root 配置文件（.prettierrc/.prettierignore/lefthook.yml/qa.yml 自身不在 coverage） | **open** | 入账 audit-item |
| S-2 | Standards 判断项 2 | eslint.config.js 两处 globals 重复 + window/document 对全部 .mjs 过度放行 | **open** | 入账 audit-item |
| S-3 | Standards 判断项 3 | eslint.config.js mjs 段三条 glob 冗余（'**/*.mjs' 已含） | recorded | 裁决不修：纯清理、零行为影响，下轮顺手 |
| S-4 | Standards 判断项 4 | exhaustive-deps warn 不阻断 CI | recorded | 裁决不修：有意识取舍（注释已声明）；修需全量清 useEffect 依赖，属 S3 renderer 接线阶段工作 |
| P-1 | Spec 轻微 wrong 1 | no-unused-vars 重复声明 | recorded | 裁决不修：语义一致，仅注释建议；下轮加注释 |
| P-2 | Spec 轻微 wrong 2 | format glob 表达不统一（CI 显式 vs 本地通配） | recorded | 裁决不修：行为一致；与 S-1 合并处置 |

## 下游

- open 2 项 → `.scratch/neonforge-v1/audit-items/`（A-001/A-002）
- S2 stage-gate 时枚举审计状态核对（应只剩 closed 或带 fixed/recorded 证据）
