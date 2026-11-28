# 证据卡：NeonForge 产品审批边界（L1 单测 + L3 UI）

> 本卡记录**产品自身**的授权/审批边界验证，不是外部基准成绩。
> 目的：把「真实 ToolRegistry / 审批 UI」与评估用 Python 策略门分开，避免把评估门结果当成产品审批链路的完整验证。

## 基本信息

| 字段              | 值                                                                        |
| ----------------- | ------------------------------------------------------------------------- |
| 产品版本 / commit | NeonForge `9701291`（main，`decide` 重构后）                              |
| 日期              | 2026-11-19                                                                |
| 证据类型          | L1 单元测试 + L3 Playwright interaction                                   |
| 关联决策          | ADR-015（信任模式与委托边界）、ADR-016（`gate.denied`）                   |
| 评估对象          | `apps/desktop/src/main/tools.ts` 的真实 `ToolRegistry` 与 renderer 授权卡 |

## 执行命令

```bash
cd apps/desktop
npx vitest run tests/unit/tools.test.ts
npx playwright test --project=interaction tests/interaction/trustModes.interaction.ts
```

## 结果

| 层  | 文件                                          | 结果                     | 覆盖重点                                                                                                                                                                                                                   |
| --- | --------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `tests/unit/tools.test.ts`                    | **44/44 通过**（1.2 秒） | 未授权 `needApproval`、`deny > allow`、`ask` fail-closed、`ask` 不被 `preApproval`/自动来源绕过、`allow read` 不能借 `..` 逃逸、symlink 根外逃逸、写前快照与回滚、计划门控、delegate 边界；新增 `decide` 只裁决不执行 4 项 |
| L3  | `tests/interaction/trustModes.interaction.ts` | **3/3 通过**（2.4 分钟） | 旧 delegate 开关迁移、设置页 strict/standard/delegated 切换与持久化、delegated 清单内 edit 自动放行（来源 `delegate`）、strict 方案确认后 write 仍弹“需要授权”卡                                                           |

## 关键边界验证

- **规则优先级**：`deny > allow > ask`，规则顺序不改变裁决；`ask` 只接受 `approvalSource=user`，`delegate`/自动来源不能绕过。
- **授权来源审计**：`delegate`、`auto`、`user` 均进入执行审计；delegate 仅限根内、已批准清单内的 write/edit，bash 与非文件动作永不委托。
- **路径边界**：`allow read` 前缀规则不能借 `..` 解析到项目根外；根内 symlink 指向根外也不会自动放行；交付 diff 目标同样拒绝 symlink 逃逸。
- **回滚**：write/edit 授权后执行前生成 `.nf-bak` 快照；回滚可恢复原内容，无快照时返回明确错误。
- **UI 语义**：strict 档在方案确认后仍展示授权卡；delegated 档清单内 edit 不弹卡并记录 delegate 来源。

## 与外部评估门的关系

- 外部 AgentDojo 能力卡使用 `evals/sandbox/neonforge_gate.py`，是 Python 进程内 monkey-patch，**不等于**本卡验证的产品 Electron ToolRegistry。
- 本卡证明产品自身的主进程授权边界与 renderer 授权卡有测试证据；`decide` 已抽出为可复用的裁决入口，但外部 harness 仍未直接调用 Electron ToolRegistry，也没有真实人类审批链路。
- 两者结论不可互换：本卡的 40+3 项通过，不代表 AgentDojo 注入测试的产品级结果；反之亦然。

## 限制

- Playwright 使用 mock bridge 驱动 renderer；主进程 ToolRegistry 的真实执行由 L1 单测覆盖，二者尚未在同一条端到端链路中合并验证。
- 未覆盖真实人类审批延迟、误拒率、审批疲劳等可用性指标（SUS/HEART 仍缺）。
- 仅在当前 WSL2 开发环境运行；macOS/Windows/Linux 打包后的审批链路未单独验证。
- 未接入外部基准（AgentDojo/BFCL）的容器化流程。

## 结论

- 可用结论：产品自身的授权规则、delegate 边界、路径逃逸防护、快照回滚与三档信任 UI 在当前测试集下通过（44 项单测 + 3 项 UI）。
- 不可用结论：不能据此声称外部基准已使用真实审批 UI；不能把评估门的 0% 注入成功直接归因于产品审批链路；不能声称已完成人类审批可用性评估。
- 下一步：评估是否把 AgentDojo 工具执行桥接到产品 ToolRegistry，或在产品层补充审批延迟/拒绝率指标。
