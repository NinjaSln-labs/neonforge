# 代码审查修复审计（2026-11-17——PR #18 合并后）

> 审查范围：`bdf437b`（PR #18 `Merge pull request #18`）合并后的 `main`；修复分支 `fix/review-findings-2026-11`（工作区未提交）。
> 审查方式：code-review 独立审查（15 findings）→ 修复 → 定向回归 + 全链验证。
> 结论：**15/15 fixed，0 open**；无新增依赖、无协议/数据迁移。

## 一、全链验证（工作区实测）

| 层 | 结果 |
|----|------|
| L1 领域/应用逻辑 | ✅ **75 文件 / 902 用例**（修复批新增 18 条；`npx vitest run`） |
| L2 契约 | ✅ 双 tsc 0 错（`tsconfig.json` + `tsconfig.main.json`） |
| L3 交互 | ✅ **87/87**（`npx playwright test --project=interaction`；新增 `taskBoundary.interaction.ts` 2 场景） |
| Lint | ✅ 0 errors（6 条既有 React Hook 依赖 warning，非本批引入） |
| Format | ✅ Prettier 全过 |
| 构建 | ✅ `npm run build`（build:main + preload esbuild + vite renderer） |

## 二、发现与修复

| ID | 位置 | 问题 | 修复 | 回归断言 |
|----|------|------|------|----------|
| R-01 | `src/main/tools.ts` | `read` 的 `preApproval` 用与执行器不同的路径解析；根内 symlink 指向根外仍可自动放行 | `preApproval` 复用 `resolvePath`，并以 `isInSandboxRealpath` 实路径判定；解析失败一律不自动放行 | `tools.test.ts`：相对路径误带项目名 + 根内 symlink 指向根外 → 不放行 |
| R-02 | `src/domain/conversationState.ts` | `classifyReadonly` 只按空格/分号切分，换行、反引号、`$()` 可藏第二条命令 | 危险形态（`\n\r`、反引号、`$(`、`<(`、`>(`）直接 fail-closed 为 `hazardous` | `conversationState.test.ts`：换行/命令替换 → hazardous |
| R-03 | `src/domain/conversationState.ts` | `curl/wget` 快速路径在链、管道、重定向混合时仍判 `network-read` | 先剔除 `2>` 重定向，再检测 `;&|<>`；仅单条网络命令进入 `network-read` 分支 | `conversationState.test.ts`：网络命令与链/重定向/管道混合 → hazardous；单独 curl/wget 保持 network-read |
| R-04 | `src/main/serviceManager.ts`（及 `tools.ts`、`verification.ts` 同类路径） | spawn 失败时 `child.pid` 为空，`process.kill(-(pid ?? 0))` 可能命中当前进程组 | 新增 `killProcessGroupBestEffort`：仅正 PID 才尝试进程组信号，否则回退 `child.kill` | `tools.test.ts`：无效 pid 不调用 `kill`（防 `kill(-0)`） |
| R-05 | `src/main/webTools.ts` | SSRF 防护只检查字面量主机：IPv4-mapped IPv6、域名解析到私网、重定向到私网均可绕过 | `isPrivateIp` 覆盖 IPv4-mapped（点分/十六进制）与 IPv6 本地段；`assertPublicHost` 对域名做 DNS 全地址校验；重定向手动逐跳校验 | `webTools.test.ts`：mapped IPv6 字面量拒绝、DNS 私网拒绝、重定向私网阻断且只发第一跳 |
| R-06 | `src/domain/conversationState.ts` | 危险参数形态遗漏 `sed w`（地址/替换标志写文件）、`find -fprint0`、`sort --compress-program`、`git branch -u/--track/位置参数` | 扩展危险参数识别；`git branch` 改为只读旗标 allowlist，拒绝位置参数与未知旗标 | `conversationState.test.ts`：sed `w`、find `-fprint0`、sort `--compress-program`、git branch 写形态 → hazardous |
| R-07 | `src/main/mcpClient.ts`、`src/main/mcpConfig.ts` | MCP 子进程默认继承宿主完整 `process.env`，第三方服务器可读取全部凭据 | `buildMcpEnv` 只保留安全基础变量；服务器配置可声明 `envFrom`（仅变量名，≤32、合法名、去重、不存值）；设置页提示同步 | `mcpClient.test.ts`：宿主凭据不外泄；`mcpConfig.test.ts`：`envFrom` 校验/去重/非数组拒绝 |
| R-08 | `src/main/ipc.ts`、`ipcSchema.ts`、`preload.ts`、`DeliveryPanel.tsx` | `delivery:apply-diff`/`revert-diff` 只凭 renderer 的 `approved` 写模型给出的任意路径 | IPC 强制 `rootPath`；`resolveDeliveryTarget` 归一 + realpath 根内校验；apply/revert/快照/变更集统一使用归一目标 | `tools.test.ts`：`resolveDeliveryTarget` 边界/symlink/无根拒绝；预加载与 UI 全链接线 |
| R-09 | `src/main/tools.ts` | 权限规则用裸 `startsWith`：路径 `/proj/src` 放行 `/proj/src-evil`，URL `trusted.example` 放行 lookalike 域 | 路径用 `path.relative` 边界；URL 解析后协议/host/port 精确匹配、path 边界匹配 | `permissionRules.test.ts`：路径兄弟前缀拒绝、URL 假域/子域拒绝 |
| R-10 | `src/main/stateTransaction.ts` | WAL 读取失败时 commit 仍报 applied 成功；保留 WAL 重放可覆盖比记录更新的磁盘状态 | `StateDrainResult.pending` 显式可见；损坏 WAL 不报成功；`applyRecord` 增加 mtime 守卫，`writtenThisDrain` 避免自阻塞 | `stateTransaction.test.ts`：损坏 WAL → applied=false/pending=true；保留 WAL 不覆盖更新磁盘 |
| R-11 | `src/renderer/MainWorkspace.tsx` | 「新问题」只换会话/清消息，目标/方案确认位与主进程计划门残留 | `handleNew` 重置 `goalConfirmed`/`planConfirmed`、递增 `goalSeq`、清运行态与待授权、`plannedFiles.reset()` + `session.setPlanConfirmed(false)`、重挂聊天 | `taskBoundary.interaction.ts`：新任务后末次 `setPlanConfirmed(false)` 且新方案卡重新出现 |
| R-12 | `src/renderer/sessionStore.ts`、`MainWorkspace.tsx` | 会话 ID 未持久化，reload 后 queue/acceptance/changeset 记录无法再定位 | 按 `rootPath` 持久化会话 ID（`nf-session-id:<root>`），初始化优先读取，effect 内落盘；空/超长值拒绝 | `sessionStore.test.ts`：往返/隔离/非法值；`taskBoundary.interaction.ts`：reload 后 timeline 使用同一会话 ID |
| R-13 | `src/renderer/DeliveryPanel.tsx`、`src/main/acceptanceStore.ts` | 无验收来源的豁免按钮在 `acceptance.list` 失败时仍可点，竞态可把已有验收洗成豁免 | 仅在权威 `acceptance.list` 成功后渲染豁免入口；失败取消勾选并提示；store 对已有 items 的 `acceptEmpty` 不覆盖 | `acceptanceStore.test.ts`：已有验收项 → acceptEmpty 不覆盖 |
| R-14 | `src/renderer/useToolApproval.ts` | `approvePlan` 批准文件卡后未调用 `onApprovalResolved`，等待授权的队列条目永久 blocked | `approvePlan` 批准后调用 `onApprovalResolved('approved')`，与 `approveToolCall`/reject 同一回调 | 共用既有 `core.interaction.ts`「卡悬挂→批准后恢复续聊」与 `queue.interaction.ts` FIFO 回归；本修复不新增专用队列场景 |
| R-15 | `src/main/changeSetService.ts`、`stateTransaction.ts` | 回滚使用可预测 `.nf-restore` 临时路径（可预置 symlink）；恢复写入绕过事务，忽略 commit 结果 | 恢复内容作为同一事务的写入项；临时文件使用随机 UUID + `openSync('wx', 0o600)`；commit 非 applied 时返回错误 | `changeSetService.test.ts`：`.nf-restore` symlink 不跟随；事务提交 mock 覆盖恢复写入 |

## 三、残余风险（记录，不阻塞）

1. **DNS rebinding TOCTOU**：`assertPublicHost` 的解析校验与 `fetch` 的二次解析之间仍有时间窗；当前无自定义 dispatcher 依赖，本轮以逐跳解析检查降低风险。后续如需彻底固定，可引入支持自定义 `lookup` 的 HTTP 传输（需评估 Electron 内置 fetch 与依赖成本）。
2. **MCP `envFrom`**：变量值仍由宿主环境提供；配置只允许显式名称，泄露面从「全量环境」收敛到「用户点名变量」。
3. **工具沙箱**：仍为 lexical/realpath 边界 + 授权，不是 OS 级沙箱；本批未改变该既有边界。

## 四、文档同步

- `docs/tests/coverage-matrix.md`：快照更新为 L1 902 / L3 87，新增表 14（审查修复批 ↔ 回归断言）。
- `apps/desktop/src/renderer/SettingsPanel.tsx`：MCP 配置提示补充 `envFrom` 名称语义（不存值）。
- README / DDD 验证计数按当前全链结果刷新。
