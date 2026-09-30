# 013 — 搭档 Busy 边界与 silent 通道（输入≠打断补全）

- Status: accepted
- Date: 2026-10-01
- 相关：`docs/domain/02-domain-model.md` §4.12；调研 `docs/audits/research-busy-scope-interrupt-vs-queue-2026-10-01.md`；本地竞品 `/mnt/f/neonforge-competitors`（Goose/Pi/Aider/Codex）

## Context

§4.12 已规定：模型产出中用户发送 → 排队；打断＝显式停止。但未钉死 **busy 覆盖范围**，且写有 **「silent 例外可直接打断」**。

取证与调研表明：

1. UAT/产品把 `working` 早释或仅扫「搭档处理中」文案，导致回合未收口仍可点确认/发 nudge——像「思考没完就被打断」。
2. silent 本职是**非用户通道**（不进气泡/`message_sent`），不是打断语义；实现却 `working && silent → stopGeneration`，与对账引导「busy 时排队」自相矛盾。
3. 竞品（Cursor Queue、Claude Enter 排队/Esc 打断、Goose Enter 排队/Send 打断、Pi steer|followUp 排队）一致：**busy＝整段在飞 agent 回合（含工具）**；硬打断显式；HITL 确认/授权＝非 busy。

## Decision

1. **Partner busy（搭档忙碌）**＝存在未收口的在飞 agent 回合：思考 ∪ 流式输出 ∪ 工具执行 ∪ `maybeContinue` 续链。  
   - **计入 busy**：streaming / reasoning、tool pending/执行中、续聊链未停。  
   - **不计 busy**：授权卡/确认卡/强制澄清已弹出且续聊已停（decision-pending——等人决策）；idle/ready。  
   - UI `working` / UAT `modelBusy` **必须与本定义同源**，禁止为「快速确认」在工具链未收口时提前释放 busy。

2. **输入≠打断（保留并收窄）**  
   - busy 时：**用户普通发送** → 排队，当前回合收口后 flush。  
   - **打断** → 仅显式停止（`.nf-chat__stop` / 等价 abort）。  
   - **待授权**时用户发送仍可直接处理（既有例外——排队会卡在授权等待；非本 ADR 推翻）。

3. **silent＝通道，≠默认打断**  
   - silent / `isSystemNudgeText`：不进用户气泡与 `message_sent`；API 走 system；时间线 `conversation.system_nudge`。  
   - **busy 时 silent 默认与用户相同：排队**（含协议催、对账引导、UAT「系统提示：」）。  
   - **废除**「凡 silent 即可 `stopGeneration`」的默认真义。  
   - 若 StuckDetector escalate 等确需硬恢复：必须走**显式恢复打断**路径（可复用停止语义），并在时间线标 `conversation.interrupted` + 恢复来源；**不得**冒充普通 silent send 的默认行为。

4. 本裁定写入领域 §4.12 正文；其它文档只引用 **ADR-013**，不另写细则。

## Consequences

- 产品须改：`working` 生命周期对齐 busy；silent 在 busy 时入 `pendingSend`（或等价），不再默认 `stopGeneration('silent')`。  
- UAT harness：`modelBusy` 与产品 busy 同源后再 `continue` 跳过决策/nudge。  
- escalate 硬恢复若保留，须单独入口与审计字段——实现批另开，不在本 ADR 展开代码。  
- 与 ADR-012 无关：本条是设计补全；开修仍须用户裁决修批。

## Evidence

- 领域原 §4.12；调研 `research-busy-scope-interrupt-vs-queue-2026-10-01.md`（含本地 Goose/Pi/Aider/Codex 源码节）  
- 实现偏离点：`ConversationPanel` 流式 done「及时释放 working」；`working && silent → stopGeneration`
