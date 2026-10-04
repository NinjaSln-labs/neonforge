# Research: Partner/Agent “Busy” — Interrupt vs Queue vs Allow

> 日期：2026-10-01  
> 问题：AI 编程搭档的 **busy** 应覆盖哪些时段？用户/系统在 busy 时排队还是打断？  
> 对照用户主张：busy＝思考 + 流式输出完整期间（输出链收口前）；普通发送排队；打断＝显式停止。  
> 方法：竞品官方/一线社区 + 工业 UI 共识 + 学术 turn-taking / barge-in；标注一级/二级来源。  
> **设计落位：** 结论已写入 **ADR-013** + `docs/domain/02-domain-model.md` §4.12（2026-10-01）。

---

## 1. Executive summary

1. **Coding agents treat “busy” as the whole in-flight agent turn** — model generation *and* tool/edit/shell execution — not “first text stream finished.” Evidence: Cursor Agent docs (queue while Agent works; steer at next *tool call*), Claude Code (Esc stops response *or tool call*; Enter queues until tools finish), Windsurf Cascade (queue while Cascade finishes *task*), VS Code Copilot Chat (steer after current *tool execution*).
2. **Default user-send during busy is queue (or steer-at-safe-boundary), not hard interrupt.** Hard stop is a separate explicit control (Stop / Esc / Ctrl+C / Stop&Send).
3. **Classic chat UIs (ChatGPT / Gemini-class):** Stop replaces or disables Send while generating; no agent queue story. Busy ≈ streaming/submitted generation.
4. **HITL approval/confirm cards are *not* busy:** agent run is paused waiting for a human decision; UI must accept approve/reject (OpenAI Agents SDK, LangChain HITL). Neonforge `pending` maps here.
5. **Academic barge-in / full-duplex** applies mainly to *spoken* dialogue; text coding agents remain half-duplex turn systems. Literature still supports separating intentional interrupt from non-interrupt input.
6. **Vs user claim:** Agree on queue-by-default + explicit interrupt; **refine** “output complete” to **agent-turn complete (think + stream + tools/maybeContinue)**, and treat **decision-pending as not busy**.

---

## 2. Competitor matrix

Legend for “send while generating”:

| Symbol | Meaning |
|--------|---------|
| **Queue** | Message waits; current turn finishes first |
| **Steer** | Delivered at safe boundary (e.g. next tool call) without hard abort |
| **Stop&Send** | Abort current turn, then send |
| **Disable** | Input/send blocked; only Stop available |
| **Hard stop** | Esc / Stop / Ctrl+C cancels in-flight work |

| Product | Busy includes tools? | Send during busy | Stop control shown when | Primary sources |
|---------|----------------------|------------------|-------------------------|-----------------|
| **Cursor Agent** | **Yes** — “while Agent is working”; steer at next tool call; docs mention thinking/editing as interrupt-sensitive | Default **Queue** (Enter); **Cmd+Enter** immediate/bypass; **Steer** (“Send now” / Enter twice) at next tool call; settings Queue vs Steer (forum history also documents Stop&Send) | **Stop** mid-task (help) | [cursor.com/docs/agent/overview](https://cursor.com/docs/agent/overview) · [cursor.com/help/ai-features/agent](https://cursor.com/help/ai-features/agent) · [Forum: Queue vs Steer](https://forum.cursor.com/t/options-to-queue-requests-like-it-was-before/172313) *(staff primary)* · [Forum: Send / Queue / Stop&send](https://forum.cursor.com/t/1-4-queueing-bug-all-messages-are-in-queue-mode-even-when-disabled/126214) *(staff primary)* |
| **Claude Code** | **Yes** — Esc stops “response or tool call mid-turn”; queue applies while tool calls run | **Type+Enter = queue / steer within turn** (reads after tools finish); **Esc** hard interrupt (then sends queued) | Esc / Ctrl+C while running; no separate web Stop button (CLI) | [code.claude.com interactive-mode](https://code.claude.com/docs/en/interactive-mode) · [how-claude-code-works — Interrupt and steer](https://code.claude.com/docs/en/how-claude-code-works) |
| **GitHub Copilot / VS Code Chat** | **Yes** — Steer yields after finishing current **tool execution** | Dropdown: **Add to Queue** / **Steer with Message** / **Stop and Send**; default `chat.requestQueuing.defaultAction` = `steer` or `queue` | Stop & Send cancels request; Stop implied while request in progress | [code.visualstudio.com Use chat](https://code.visualstudio.com/docs/copilot/chat/copilot-chat) · [AI settings — requestQueuing](https://code.visualstudio.com/docs/agents/reference/ai-settings) |
| **ChatGPT (web)** | N/A for local tools; busy = generating/thinking/working | Practical pattern: Stop while generating; send blocked until idle *(UI behavior; OpenAI help documents “Stop generating”)* | **Stop generating** while hung/generating | [help.openai.com troubleshooting](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages) *(mentions Stop generating)* · **Secondary:** community/automation infer busy from stop-button presence |
| **Gemini** | Product-dependent. Gemini Apps / Chrome auto-browse: **Stop** for in-flight tasks. Earth Engine Ask (Gemini): Send toggles to **Stop** while generation in progress | Earth Engine: cancel via Stop toggle; no documented queue. Gemini in Chrome: Stop task / Take over | Stop icon while generating or task running | [Earth Engine Code Editor assistant](https://developers.google.com/earth-engine/guides/code_editor_assistant) · [Gemini Apps Help — auto browse Stop](https://support.google.com/gemini/answer/16821166) |
| **Windsurf / Cascade** | **Yes** — queue “while Cascade is working” / finishes “current task”; tool-calling limits + continue | **Queue** on Enter; empty Enter again = send immediately | Product shows queue UI when messaging while working; cancel of WIP was the old pain (blog) | [docs.devin.ai Cascade — Queued Messages](https://docs.devin.ai/desktop/cascade/cascade) · [devin.ai/blog/queued-messages](https://devin.ai/blog/queued-messages) *(first-party blog)* |
| **Aider** | Generation interrupt documented; tools are sequential in chat | No first-class queue docs; interrupt then re-instruct | **Ctrl-C** interrupt; partial response kept | [aider.chat commands — Interrupting](https://aider.chat/docs/usage/commands.html) · [aider tips](https://aider.chat/docs/usage/tips.html) |
| **Continue.dev** | Streaming + compaction treated as wait states in CLI | CLI: **Enter during streaming → enqueue**; **Esc → interrupt** streaming | IDE: stop button while streaming *(issues/PRs)*; docs “How Chat Works” do not detail stop/queue | [PR #7632 message queueing](https://github.com/continuedev/continue/pull/7632) *(primary OSS)* · [UserInput.tsx Escape interrupt](https://github.com/continuedev/continue/blob/cf48e740/extensions/cli/src/ui/UserInput.tsx) · [docs.continue.dev How Chat Works](https://docs.continue.dev/ide-extensions/chat/how-it-works) *(no queue/stop section — gap)* |
| **Devin** | **Yes** — cancel “running agent”; web: stop session before IDE takeover; side chat can stop mid-answer without stopping main | Side chat = ask **without interrupting** main work; main: stop then redirect | CLI: **Esc** / **Ctrl+C** cancel running agent; web: Stop session | [docs.devin.ai keyboard shortcuts](https://docs.devin.ai/cli/reference/keyboard-shortcuts) · [Devin Session Tools](https://docs.devin.ai/work-with-devin/devin-session-tools) · [subagents — Interrupting a Turn](https://docs.devin.ai/cli/subagents) |

### 2.1 Product notes (evidence-backed)

#### Cursor

- Official: two talk-while-working modes — **queue until task finishes** vs **steer at next tool call** (preserves in-flight work). Keyboard: Enter queues; Cmd+Enter sends immediately. Stop button interrupts mid-task.  
  Sources: [Agent overview — Queued messages](https://cursor.com/docs/agent/overview), [Help — interrupt / queue](https://cursor.com/help/ai-features/agent).
- Staff forum: Settings → Agents → Conversation → New Messages **Queue** vs **Steer**; Ctrl+Enter overrides per message; earlier Chat settings documented **Send** (next opportune time), **Queue**, **Stop & send**; default moved away from Stop&send because mid-tool abort “can result in degraded output.”  
  Sources: [forum 172313](https://forum.cursor.com/t/options-to-queue-requests-like-it-was-before/172313), [forum 126214](https://forum.cursor.com/t/1-4-queueing-bug-all-messages-are-in-queue-mode-even-when-disabled/126214).

#### Claude Code

- Esc: “Stop the current response or tool call mid-turn… Claude keeps the work done so far. If you have messages queued, Claude Code sends them next.”  
- Ctrl+C: interrupt running operation.  
- Official “Interrupt and steer”: Esc = hard stop; type+Enter without stopping = queued; if tools running, message is read when those calls finish **within the same turn**.  
  Sources: [interactive-mode](https://code.claude.com/docs/en/interactive-mode), [how-claude-code-works](https://code.claude.com/docs/en/how-claude-code-works).

#### VS Code Copilot Chat

- While request in progress, Send becomes a dropdown: **Add to Queue** / **Steer with Message** (yield after current tool) / **Stop and Send**. Stopping does not undo completed edits.  
  Source: [Use chat in VS Code](https://code.visualstudio.com/docs/copilot/chat/copilot-chat).

#### ChatGPT

- Help center instructs users stuck on Thinking/Generating/Working to click **“Stop generating,”** then Regenerate — establishes Stop as the generation-time control. No official queue-while-generating doc found.  
  Source: [Troubleshooting ChatGPT Error Messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages).

#### Gemini

- Earth Engine Ask (Gemini): Send button **toggles to stop icon** while generation in progress to cancel.  
- Gemini in Chrome auto browse: **Stop** on task; Take over / Resume for human control.  
  Sources: [Earth Engine assistant](https://developers.google.com/earth-engine/guides/code_editor_assistant), [Gemini Apps Help](https://support.google.com/gemini/answer/16821166).  
- **Gap:** consumer gemini.google.com chat stop/queue not covered by a dedicated public help article in this pass; Earth Engine + Chrome docs are the strongest primary Gemini UX evidence.

#### Windsurf / Cascade

- Official: while waiting for Cascade to finish its **current task**, Enter queues; Enter again on empty box sends immediately. Composes with tool calling.  
  Sources: [Cascade overview](https://docs.devin.ai/desktop/cascade/cascade), [Queued Messages release](https://devin.ai/blog/queued-messages).

#### Aider

- “It’s always safe to use Control-C to interrupt aider… The partial response remains in the conversation.” No queue-while-streaming primary doc.  
  Source: [In-chat commands](https://aider.chat/docs/usage/commands.html).

#### Continue.dev

- Merged CLI feature: Enter during streaming **queues**; Esc interrupts streaming (`isWaitingForResponse`). IDE docs do not document the same. Treat IDE stop as observed in issues, not as polished product help.  
  Sources: [PR #7632](https://github.com/continuedev/continue/pull/7632), [UserInput.tsx](https://github.com/continuedev/continue/blob/cf48e740/extensions/cli/src/ui/UserInput.tsx).

#### Devin

- CLI: Esc / Ctrl+C **cancel the running agent**. Web: stop session before taking over IDE; side chats ask without interrupting main work; can stop side-chat mid-answer while main continues. Interrupting parent does not kill subagents (they park).  
  Sources: [keyboard shortcuts](https://docs.devin.ai/cli/reference/keyboard-shortcuts), [session tools](https://docs.devin.ai/work-with-devin/devin-session-tools), [subagents](https://docs.devin.ai/cli/subagents).

---

## 3. Industry patterns (streaming LLM + agent HITL)

### 3.1 Streaming chat UI

| Pattern | Claim | Source class |
|---------|-------|--------------|
| **status ∈ {submitted, streaming} ⇒ show Stop** | Vercel AI SDK `useChat` / `useCompletion`: show Stop while submitted/streaming; `stop()` aborts client request | **Primary:** [AI SDK Stopping Streams](https://ai-sdk.dev/docs/advanced/stopping-streams), [AI SDK UI Chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) |
| **Busy = generation pipeline, not only visible tokens** | Stop enabled for both `submitted` (waiting for first token) and `streaming` | Same |
| **Client stop ≠ server cancel unless AbortSignal forwarded** | Explicit: without cancellation support, generation may continue server-side | Same |
| **Send/Stop mutual exclusion** | ChatGPT/Gemini-class UIs expose Stop while generating; automation treats stop-button presence as “still typing” | ChatGPT help (primary for Stop); **Secondary:** DOM-stop-button heuristics in third-party writeups |

### 3.2 Agent loop + HITL (approval ≠ generation)

| Pattern | Claim | Source |
|---------|-------|--------|
| **Approval pause** | Tool needing approval **pauses** the run; `interruptions` / `stream.interrupt` surface pending decisions; resume after approve/reject | **Primary:** [OpenAI Agents SDK HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/), [LangChain frontend HITL](https://docs.langchain.com/oss/javascript/langchain/frontend/human-in-the-loop) |
| **Paused ≠ streaming busy** | While interrupted for approval, the agent is **not** generating; UI must accept human decision (`resume`), not treat as “still streaming” | Same |
| **VS Code notifies separately** | `chat.notifyWindowOnConfirmation` when agent needs input/confirmation vs `…OnResponseReceived` when response arrives | **Primary:** [Use chat in VS Code](https://code.visualstudio.com/docs/copilot/chat/copilot-chat) |
| **Neonforge alignment** | Domain: under `pending`, model tools do not execute; user decision is the only next state input | **Internal primary:** `docs/domain/00-domain-authority.md` §3.2–3.4 |

**Industry conclusion:** Two orthogonal “waits”:

1. **In-flight generation/tools** → busy → queue or explicit stop.  
2. **Decision-pending (HITL)** → not busy for generation → allow card actions / redirect messages.

---

## 4. Academic / HCI literature

Focus: turn-taking, barge-in, interruption management. Most empirical work is **spoken** SDS; transfer conceptual layers, not default UX.

| Work | Venue / ID | Relevance |
|------|------------|-----------|
| Sacks, Schegloff & Jefferson, *A simplest systematics for the organization of turn-taking for conversation* | *Language* 50(4), 1974 · [DOI:10.2307/412243](https://doi.org/10.2307/412243) | Foundational CA: turns are locally managed; overlap/interrupt are organized phenomena, not noise |
| Clark, *Using Language* | Cambridge UP, 1996 · [DOI:10.1017/CBO9780511620539](https://doi.org/10.1017/CBO9780511620539) | Dialogue as **joint action** + **grounding**; speakers coordinate when to speak and how to recover from uncertainty |
| Skantze & Schlangen, incremental dialogue (EACL 2009) | [PDF](https://clp.ling.uni-potsdam.de/publications/Skantze-2009.pdf) | Critiques strict turn-taking SDS; barge-in often treated as “interrupted utterance unsaid”; human dialogue is incremental |
| Skantze, *Towards Incremental Speech Generation in Dialogue Systems* | SIGDIAL 2010 · [ACL Anthology W10-4301](https://aclanthology.org/W10-4301.pdf) | Incremental output + self-monitoring when user may barge mid-utterance |
| Full-Duplex-Bench / v1.5 | [arXiv:2503.04721](https://arxiv.org/abs/2503.04721), [arXiv:2507.23159](https://arxiv.org/abs/2507.23159) | Benchmarks **user interruption** vs **backchannel** vs talking-to-others vs background speech — interruptions must be classified |
| FireRedChat (full-duplex voice) | [arXiv:2509.06502](https://arxiv.org/abs/2509.06502) | Controllable barge-in via turn-taking controller; metrics for barge-in / EoT / latency |
| HumDial-FDBench / ICASSP 2026 track | [arXiv:2604.21406](https://arxiv.org/abs/2604.21406) | Traditional SDS = rigid turns; full-duplex = listen while generating |
| DuplexPO (decouple when-to-speak vs what-to-say) | [arXiv HTML 2607.07148](https://arxiv.org/html/2607.07148v1) | Conversational dynamics (yield / barge-in) as a **separate policy** from content generation |

### Transfer to text coding agents

- Academic full-duplex ≠ industry coding-agent default. Competitors above implement **half-duplex agent turns** with optional **safe-boundary steering**.
- Useful imports: (1) **interrupt is intentional and distinct** from other input; (2) **floor control** (who may speak) is a policy separate from content; (3) mid-action abort has cost (Cursor staff: mid-tool Stop&send degrades output) — parallel to spoken “interrupted utterance.”

---

## 5. Recommended busy definition for Neonforge

Compared to user claim *“busy = entire think + stream + output complete.”*

### 5.1 Definition

> **Partner busy** ≔ an **agent turn is in flight**: reasoning/thinking **or** token streaming **or** tool/shell/edit execution **or** automatic continue (`maybeContinue`) of that same turn — until the turn **naturally ends**, hits a **decision-pending** gate, or the user issues an **explicit stop**.

### 5.2 In busy vs out of busy

| Situation | Busy? | Ordinary user send | Explicit Stop | Notes |
|-----------|-------|--------------------|---------------|-------|
| Thinking / submitted (no tokens yet) | **In** | **Queue** | Abort turn | Matches AI SDK `submitted` |
| Streaming assistant text | **In** | **Queue** | Abort turn | Classic Stop window |
| Tool call pending / executing (bash, write, MCP, …) | **In** | **Queue** (or optional Steer-at-boundary later) | Abort in-flight tool + turn | Matches Cursor/Claude/Copilot |
| `maybeContinue` / auto tool-loop continuation | **In** | **Queue** | Abort | Same turn, not idle |
| **Approval card** (tool need-approval) shown; model frozen | **Out** | **Allow** (redirect / new instruction; do not treat as stream) | n/a (already paused) | HITL pause |
| **Confirm card** (goal / plan / resolution) shown; wait for user | **Out** | **Allow** card click or typed decision per product rules | n/a | Domain `pending` |
| Forced clarify / candidates requiring decision | **Out** | **Allow** decision path | n/a | Same |
| Idle / ready for next user turn | **Out** | Immediate send | n/a | |

### 5.3 Comparison to user claim

| User claim | Verdict |
|------------|---------|
| Busy covers think + stream until “output complete” | **Mostly yes** — but **must include tool chain / continue loop**, else “output complete” is misread as “first assistant text done” |
| Ordinary send queues while busy | **Yes** — Cursor Queue, Claude Enter, Windsurf queue, Continue CLI queue, Neonforge §4.12 |
| Interrupt = explicit stop only | **Yes** — Stop / Esc / Ctrl+C / Stop&Send; not Enter |
| (Implied) decision cards during generation | **Clarify:** once the product has entered **decision-pending**, that is **not** busy; cards must remain clickable |

### 5.4 Mapping to Neonforge surfaces

| Surface | Busy implication |
|---------|------------------|
| Streaming chat | Busy; show Stop; queue Enter |
| Tool pills / bash running | Busy; queue |
| Approval cards | **Not busy**; accept approve/reject; optional free-text redirect per §4.12 “待授权时发送＝直接处理” product comment |
| Confirm cards | **Not busy**; accept confirm/reject |
| Silent / system inject | Channel ≠ interrupt policy; industry default for *user* input is queue. Escalation interrupt should be labeled as **explicit recovery**, not as “send” |

### 5.5 Local domain already aligned (internal)

`docs/domain/02-domain-model.md` §4.12:

- Queue while model producing (stream + tool chain).  
- Interrupt = explicit stop (`.nf-chat__stop`).  
- Documents a **silent exception** (StuckDetector escalate interrupts) — call out as **policy exception**, not as the definition of busy.

---

## 6. Source grading

| Grade | Materials |
|-------|-----------|
| **Primary** | Cursor docs + staff forum posts; Claude Code docs; VS Code Copilot docs; Aider docs; Windsurf/Devin docs + Cognition blog; Continue PR/source; OpenAI Help (Stop generating); Gemini Earth Engine / Apps Help; Vercel AI SDK docs; OpenAI Agents SDK; LangChain HITL docs; peer-reviewed / arXiv papers with IDs |
| **Secondary** | Third-party tips (e.g. wmedia Claude interrupt guide); community “stuck Stop button” threads; DOM automation blogs inferring busy from stop-button CSS |
| **Internal** | Neonforge domain §4.12 / authority pending semantics — product truth for Neonforge, not competitor evidence |

### Gaps / limits

- Consumer **gemini.google.com** chat: no dedicated stop/queue help article located this pass (Earth Engine + Chrome used instead).  
- **Continue IDE** official chat docs omit stop/queue; CLI source is stronger.  
- ChatGPT has no official “queue while generating” doc; behavior inferred from Stop generating help + common UI pattern.

---

## 7. Implications (research only — not a fix batch)

1. Product/UAT `modelBusy` should mean **in-flight agent turn (stream ∪ tools ∪ continue)**, not “some assistant text visible.”  
2. Confirm/approval interaction must run when **not busy** (decision-pending).  
3. Prefer **queue** for ordinary send; keep **Stop** as the only default interrupt. Optional later: Cursor/Copilot-style **steer-at-tool-boundary**.  
4. Do not cite spoken full-duplex papers as proof that silent system injections should abort tools by default.

---

## 8. 本地竞品源码实证（`/mnt/f/neonforge-competitors` · 2026-10-01）

> 路径惯例 `F:\neonforge-competitors\`（WSL：`/mnt/f/neonforge-competitors`）。补强 §2 网络文档。

### 8.1 Goose — Enter 排队 / Send 打断

- `goose/documentation/docs/guides/sessions/in-session-actions.md`：processing 时 **Enter→Queue**，**点 Send→Interrupt**；队列头在每轮结束后自动发送；stop/wait 等关键词也会打断。Busy 措辞：**「while goose is processing a task」**。
- `goose/ui/desktop/src/utils/interruptionDetector.ts`：关键词分级 → `shouldInterrupt`，与普通排队分流。

### 8.2 Pi — busy 时禁止裸 prompt，须 steer/followUp 或 abort

- `pi/packages/coding-agent/test/agent-session-concurrent.test.ts`：已 processing 再 prompt → *「Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue」*；另有 `abort()` 硬停与 steering 队列事件。
- `pi/.../utils/abort.ts`：`AbortSignal` 取消在飞操作——打断＝显式 signal。

### 8.3 Aider — Ctrl-C 硬打断；Waiting for LLM

- `aider/aider/waiting.py` + `coders/base_coder.py`：`WaitingSpinner("Waiting for LLM")`；流式循环捕获 `KeyboardInterrupt`，保留部分回复。无「发送即打断」默认。

### 8.4 Codex / Continue / OpenHands

- Codex `_goal.py`：`interrupt_requested` / `begin_interrupt` / `confirm_interrupt`——打断状态机与普通投递分离。
- Continue `core/core.ts`：每消息 `AbortController`；`on("abort")` → `abortById`。
- OpenHands：`status: "running" | "complete" | "capped" | "interrupted"` —— **running＝busy**。

### 8.5 对齐用户主张

本地源码一致支持：**busy＝任务/回合在飞**；**普通发送排队**；**打断＝显式（Send-as-interrupt / abort / Ctrl-C / 关键词）**。silent 默认不应等同硬打断。
