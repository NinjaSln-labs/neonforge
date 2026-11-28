# ADR-015：信任模式预设与低危委托边界（GitHub #12）

- 状态: accepted
- 日期: 2026-11-16
- 相关: GitHub #12（信任分级——授权疲劳治理）；README Roadmap V2 #2；docs/ddd-rebuild/09-openspec/specs/execution-trust/spec.md；stage-specs/V2-trust-modes.md

## Context

现有授权体系已具备：只读自动放行、方案确认、approve-files 批量批准、允许并记住（任务信任路径）、权限规则（deny > allow > ask，main 持久化）。但信任分级仍不完整：

1. L4 低危委托只有 renderer 的一个 localStorage 布尔值（`nf-delegate-lowrisk`），跨设备/主进程无权威、无迁移、无审计；
2. 该委托实现过宽：`delegateLowRisk && toolRisk === 'low'` 会为任意 write/edit 自动批准——**清单外文件与项目根外文件也会被放行**，违背 execution-trust spec「清单外/沙箱外永不因委托自动放行」；
3. 信任阶梯面板（`TrustLadderPanel`）的等级/升级/授权记录是演示数据，产品运行时没有真实模式（该面板已于 2026-11-28 审计 D-2 删除——生产入口只剩设置页三档选择与问题台账的已授权行）；
4. 设置页与对话面板用 localStorage 事件联动，缺少 main 侧持久化与运行时契约校验。

## Decision

**把 L4 低危委托升级为 main 持久化的三档信任模式，并在 main 执行边界二次校验委托范围。**

1. **领域语义（BC-02）**：`TrustMode = 'strict' | 'standard' | 'delegated'`
   - `strict`（谨慎）：写入/编辑逐次授权；方案确认与 approve-files 仍可显式批准，但确认本身不自动放行文件；bash 按规则/只读判定。
   - `standard`（标准，默认）：方案确认后清单内 `write` 自动放行（现状）；`edit` 仍需逐次授权或任务信任；approve-files/允许并记住照常生效。
   - `delegated`（低危委托）：在 `standard` 基础上，方案确认后清单内 `write`/`edit` 都自动放行（低危文件操作委托）；**清单外文件、项目根外文件、bash 永不因委托自动放行**；权限规则 `ask/deny` 仍优先。
   - 任务信任（允许并记住、单次批准绑定文件）在三种模式下都自动放行其路径——那是用户显式授权，不属于委托。
2. **持久化与 IPC（main）**：
   - `src/main/trustPolicyStore.ts`：`userData/config/trust-policy.json`，0600 + tmp/rename 原子写；损坏/缺失回退 `standard`；只接受三档枚举。
   - IPC：`trust:get` / `trust:set`（运行时 schema 校验 + 静态契约 parity）；preload 暴露 `trust.get/set`。
   - 迁移：renderer 首次加载时若存在旧 `nf-delegate-lowrisk='1'` 且无 `nf-trust-v2` 标记 → 写 `delegated`，删除旧键并置迁移标记；否则默认 `standard`。
3. **renderer 判定单源（`authModel.ts`）**：
   - 新增纯函数 `shouldAutoApproveTool({mode, name, path, planConfirmed, plannedFiles, trusted})`：
     - `trusted`（任务信任路径）→ true；
     - `strict` → false；
     - `standard` → `write && planConfirmed && inPlannedFiles(path)`；
     - `delegated` → `(write|edit) && planConfirmed && inPlannedFiles(path)`；
     - `bash` → false。
   - `useChatStream` 使用该函数；委托自动批准的 `approvalSource='delegate'`（`delegated` 模式下清单内 write/edit 都标 delegate；任务信任自动仍为 `'auto'`），供 main 二次校验与审计。
   - `inPlannedFiles` 判定要求**同一路径基准的绝对化**：renderer 先用 `trustPath` 绝对化清单与目标，只做规范化精确比较（禁止 `endsWith` 末段匹配——相对 `game.js` 不得放行 `/tmp/game.js`）。
4. **main 执行边界（`tools.ts`）**：
   - `approvalSource:'delegate'` 时仅接受 `write/edit`，且必须：有 rootPath、路径 realpath 在项目根内、`plannedFilesStore.loadPlan().planConfirmed || approved`（approve-files 是更强的显式批准；兼容旧存档）且清单包含该绝对路径；否则返回 `needApproval`（不执行）。realpath 异常同样收敛为 `needApproval`，不得让 IPC 拒绝导致工具卡悬挂。
   - 方案确认时 renderer 经 `planned-files:sync-plan` 记录清单（置 `planConfirmed`，**不置 approve-files 的 `approved`**）；`PlannedFilesStore` 进程内缓存确保 reset 落盘失败时也立即撤销。
   - `permission rule ask` 继续只接受 `approvalSource:'user'`；deny 优先。
   - `tool.executing` 时间线载荷增加 `approvalSource`（审计自动批准来源）；新增 `security.trust_delegation_denied` 事件记录被拒的委托尝试。
5. **UI**：
   - 设置页：把旧勾选框替换为三档模式选择（谨慎/标准/低危委托）并显示各档说明；`trust:set` 成功后广播 `nf-trust-changed`。
   - `TrustLadderPanel`：展示真实 `trustMode`（strict/standard→L3、delegated→L4），移除假升级按钮/假等级状态；授权记录仍取真实问题快照，空则显示暂无。（2026-11-28 审计 D-2：该面板整体删除，L1–L4 阶梯叙事保留在本文；生产 UI 为设置页三档选择 + 问题台账已授权行。）
   - 旧 `nf-delegate-changed` 事件由 `nf-trust-changed` 取代（保留一次性兼容监听不影响行为）。

## Consequences

- 积极：低危委托有 main 权威、跨重启保留、可审计；修复「委托绕过计划清单/项目根」的安全缺口；三档预设让用户按任务风险选择授权疲劳/安全平衡；信任阶梯面板反映真实状态（面板本身 2026-11-28 D-2 删除，模式语义不变）。
- 代价：`approvalSource` 枚举扩展（preload/types/schema）；设置页与面板交互需迁移旧 localStorage；委托行为比旧版更严格（清单外文件仍需授权），可能让既有用户感到变化——用迁移说明与设置页文案解释。
- 边界：不实现自动按模型自评提升信任/机器学习信任分；不改变权限规则引擎；不实现跨设备同步（#15）。
