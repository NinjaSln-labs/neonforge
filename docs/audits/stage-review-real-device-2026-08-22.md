# Stage Review（#6 真机体验闭环——2026-08-22 修复复审）

> 复审日期：2026-08-22
> 来源：#6 真机体验闭环（`.scratch/neonforge-v1/real-device-acceptance-20260822.md`）——用户真机实测发现
> 复审范围：isConfirmIntent 误判确认（P1）+ classifyReadonly 只读误伤（P1）+ 空方案卡（P2 根因链）+ rootPath 漂移（P2 recorded）
> 复审方式：双轴（Spec 轴对照契约/设计；Standards 轴单源/纯函数/回归）

## 结论

**2 fixed（P1）+ 1 fixed-根因（P2 随根因）+ 1 recorded（P2 设计——A-014）——无 open**

## Spec 轴

| 断言/契约 | 证据 | 判定 |
|-----------|------|------|
| ⑬⑭ 契约：用户确认只能点确认按钮（结构化确认）——用户消息「先给我清单」不得触发方案确认 | isConfirmIntent 修复（排除条件/顺序前缀）+ L1 +4 用例 | ✅ fixed |
| ⑭ 契约：方案卡应在模型给出【执行方案】清单后出现 | 问题 4 修复（node -v 只读放行）→ 模型可先验证再给方案 → 空卡路径消除 | ✅ fixed |
| 只读 bash 应放行（A0 §3.1 活动边界）——node -v 是只读验证 | classifyReadonly 段首匹配 + 只读形态排除 + 2>&1 保护 + L1 +2 + sessionGate 锁定 | ✅ fixed |
| 任务边界（ADR-006）——多任务目录切换 | A-014 recorded——设计问题待 ADR | ⏸ recorded |

## Standards 轴

| 规则 | 核查 | 判定 |
|------|------|------|
| 单源 | isConfirmIntent/classifyReadonly 仍在领域层唯一实现——修复未引入第二实现 | ✅ |
| TDD | 每个修复先写失败测试（红）→ 修复（绿）——agentLoop +4、conversationState +2/+1 sessionGate | ✅ |
| 回归 | L1 497 / L2 双 tsc 0 错 / L3 51（单 worker 全绿）/ L5（基线更新后） | ✅ |
| 副作用收敛 | 只读形态排除**不放宽危险面**（node script.js 仍 hazardous）——测试锁定 | ✅ |
| 诚实性 | 空方案卡根因 = 问题 4（已修）；占位卡（write 拦截路径）保留为设计行为——不掩盖 | ✅ |

## 风险核查

1. **isConfirmIntent 排除词过宽**：排除正则含 `不` 等——可能误伤「没问题吧」类。已用「纯确认词精确优先」缓解（第一类 `^...$` 先匹配）。L1 覆盖常见确认词。**recorded**——真实场景观察
2. **S7-1/O2 interaction 并发 flaky**：全量跑偶发失败、单 worker 全绿——**既有 flaky**（非本次改动引入），建议后续专项治理（streamDelay 已修 S7-1 但未根治并发）
3. **config-page visual 基线过期**：08-04 基线 vs 08-21 渲染环境（1% 差异）——已更新基线（非代码 bug）
4. **A-014 rootPath 漂移**：真机现场未污染（文件未落盘）——需 ADR 裁决「任务-目录绑定」

## 结论

P1 双问题（误判确认 + 只读误伤）已修且测试锁定——**V1 收尾关键体验闭环达成**。1 recorded（A-014 设计问题）待 ADR；2 既有 flaky/基线观察项记录。**可验收。**
