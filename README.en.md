# NeonForge

> **AI Problem Workbench for DeepSeek** — say what's blocking you, get it solved. Anything a computer can do: file organization, small tools, websites, system fixes, 0-to-1 deliveries.

NeonForge is **not an IDE and not a chatbot**. You describe a problem in plain language; NeonForge drives the engineering/design/orchestration internally — every step is guarded by **confirmation cards**, **step-by-step approval**, and **verifiable results**; when something is beyond digital reach, it delivers digital artifacts + guided next steps (no overpromising).

**Who it's for**: non-coders (say the problem → get it solved → receive artifacts + guidance) · developers (bug fixes / 0-to-1 delivery with an approval loop).

> 中文: [README.md](README.md)

> **⚠️ Breaking changes**: NeonForge is under active development (V1, pre-1.0) — tool interfaces, system-prompt semantics, confirmation-card flows, and storage formats (session/ledger/config) **may change in breaking ways** with no backward-compatibility guarantee. Rely on Releases and commit messages when upgrading; please open an Issue (with your version) if a breaking change bites you.

<video controls width="720" src="demo/neonforge-demo.mov" title="NeonForge core flow demo (recorded against the real API — first-run config → open project → two-turn conversation)">
  Your browser doesn't support the video tag — <a href="demo/neonforge-demo.mov">download the demo video</a>.
</video>

---

## How it works

```
Say the problem → Clarify the goal (candidate buttons / free input) → [Goal confirm card] → Capability check → Execution plan → [Execution confirm card]
    → Produce (enforced: act, don't just promise) → Achievement report → [Achievement confirm card] → Deliver artifacts + feedback
```

- **Confirmation cards are the progression gate**: structured confirm/reject at goal / execution / achievement — until confirmed, the model stays at the confirmation point: no skipping, no wasted work
- **Step-by-step approval**: file writes and commands are approved individually (risk disclosed + pre-write snapshot, one-click rollback); "Allow and remember" reduces interruptions; high-risk commands are always confirmed individually
- **Host-enforced boundary**: the model can only write files in the approved plan (approve-files batch authorization); out-of-plan writes are rejected with the boundary stated
- **Problem = first-class citizen**: problem ledger + session snapshots (goal / decided / authorized / todo) + resume + re-run

## Highlights

1. **KV-cache preheating** — opening a project preheats the prompt prefix; first-token latency ~0.1s (measured: 275ms cold → 118ms on KV hit)
2. **Precise context** — real LSP (definition / references / type / diagnostics) + CodeRAG keyword search + `@mention` file injection — no token dumping
3. **Snapshot & rollback** — every write is snapshotted (`.nf-bak`) before applying; one-click revert per tool card; batch accept for delivery
4. **Trust-ladder authorization** — L1 observe → L2 suggest → L3 operate (per-item approval) → L4 delegate (revocable auto-approve for low-risk ops); fatigue protection (batch merge); stop/undo at any moment
5. **Session-level single PENDING** — confirm cards / approval cards share one "waiting for user decision" state machine — the user's decision is the only input to the next state
6. **Long conversations don't lose context** — automatic compaction (real summary + keep recent 20)
7. **Managed service lifecycle** — dedicated start/check/stop-server tools (auto port allocation, host port protection, process cleanup on exit)

## What the agent can do (tool surface)

| Tool | Purpose |
|------|---------|
| read / write / edit / bash | Core four (write/edit gated by execution-confirm + approved plan; read-only bash auto-approved) |
| search + LSP (find_definition / find_references / get_type_info / get_diagnostics / get_imports / get_call_chain) | Locate / query / diagnose — zero-token deterministic context |
| check-capability | Capability detection (runtime / deps / toolchain) — environment snapshot injected into the model |
| approve-files | Batch authorization (1-N files, append semantics) — approved files auto-approved on write |
| start-server / check-server / stop-server | Dev server lifecycle (dynamic port allocation; host ports 5173/5175 reserved) |
| open | Open a web page (default browser, http/https only) |

## Quick Start

> Requires a DeepSeek API Key (get one at `https://platform.deepseek.com`).

```bash
cd apps/desktop
npm install                # dependencies (Electron mirror fallback below)
npm run dev                # renderer dev server only (:5173)
npm run dev:electron       # full app (dev mode, connects to :5173)
```

- First launch: paste your API Key in Settings (stored via OS-level `safeStorage`, never uploaded)
- **Open existing project** → describe the problem in chat → confirmation cards + step-by-step approval → receive the delivery
- **Start from scratch** → auto-creates a project skeleton → 0-to-1 delivery

### Build & Package

```bash
cd apps/desktop
npm run dist               # outputs to release/ (macOS: .dmg + .zip; win: .nsis; linux: AppImage)
```

> **ExFAT/external volumes**: electron-builder produces a corrupted asar on ExFAT volumes (`chromium-pickle` offset error) — output to a local volume instead: `npm run build && npx electron-builder -c.directories.output=/tmp/nf-release`
>
> macOS unsigned builds require right-click → Open on first launch (Gatekeeper). Code signing/notarization is on the roadmap.

## Repository structure

```
neonforge/
├── apps/desktop/               # Electron desktop app (V1)
│   ├── src/domain/             # Domain layer (pure logic — Task aggregate / progress guarantee / stuck detection, L1-tested)
│   ├── src/main/               # Main process (Gateway / ToolRegistry / environment capability / timeline)
│   ├── src/renderer/           # React application layer (conversation / confirm cards / approval cards / tool cards)
│   ├── tests/                  # L1 unit + L3 interaction + L5 visual
│   └── e2e-*.mjs               # L4 real-API E2E (needs NF_TEST_KEY)
├── docs/product/               # Product design (D0-D9)
├── docs/domain/                # Domain design (A0-A9, A0 = implementation authority)
└── demo/                       # Demo video
```

## Architecture

**Stack**: Electron 36 + React 19 + TypeScript + Vite + esbuild + Monaco (artifact viewer) + Vitest + Playwright. DeepSeek-only gateway in V1 (params converge at `toDeepSeekParams` — V2 multi-model only touches the gateway).

**Domain architecture (stage-free, goal-driven)**:

```
Conversation BC (core) — goal state machine · confirmation points (goal/plan/resolution cards — system-triggered, model can only propose) · progress guarantee (force advancement ≠ force tool calls) · session-level single PENDING
Capability BC           — environment detection (source of truth) · capability views (derived) · Ledger feedback (self-learning)
Workspace BC            — project files · planned-files boundary (host-enforced) · authorization + task-level trust
Delivery BC             — delivery package (artifacts + acceptance + confirm-close) · DoD alignment · snapshot rollback
Session Timeline BC     — unified step log (observability — JSONL)
```

The domain layer is pure functions (no React dependency); L1 unit tests lock the 8-combination execution-policy enumeration and gate priority.

## Docs

| Doc | Description |
|-----|-------------|
| `docs/product/00-product-design.md` (D0 v2.2) | Product design authority (positioning / flows / components / metrics) |
| `docs/domain/00-domain-authority.md` (A0 v4.0) | Domain implementation authority (confirmation points / progress guarantee / host boundary) |
| `docs/product/`、`docs/domain/` | Full index (D0-D9 / A0-A9) |

## Testing

```bash
npx vitest run                            # L1 domain logic (344)
npx tsc -p tsconfig.json --noEmit         # L2 contracts (renderer + main)
npx playwright test --project=interaction # L3 component interaction (27)
npx playwright test                       # L5 visual + L3
NF_TEST_KEY=<key> node e2e-suite.mjs      # L4 real-API E2E (prereq: mkdir -p /tmp/nf-e2e-test)
```

CI (GitHub Actions): push runs L1+L2+L3 automatically; L4 needs repo Secret `NF_TEST_KEY` (manual trigger).

### Electron mirror (if download fails)

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js
```

## Roadmap

- **V1 (current)**: DeepSeek-only · single session · local-first · trust-ladder authorization · 0-to-1 delivery
- **V2 direction**: multi-model gateway (interface already converged for it) · plugin ecosystem (built-in plugin registry ready) · cloud sync / multi-device problem ledger · code signing & notarization

## Known Limitations (V1)

- **Resume scope**: after restart, the conversation history and problem ledger (goal / authorized) are restored, but **confirmation state and execution progress do not survive restarts** (resuming re-starts from goal clarification — safe fallback; session-snapshot persistence is planned for V2)
- **LSP in packaged builds**: full LSP in dev mode; if `typescript-language-server` isn't installed system-wide, LSP tools report "not connected" in packaged builds — chat/tools/delivery main flow unaffected
- macOS unsigned (see above); Windows/Linux packaging targets configured but not yet validated
- Single-instance lock is per-app-scope; watch for leftover test instances (see CI scripts)

## Contributing

1. Fork + feature branch (`feat/xxx` or `fix/xxx`)
2. Read `docs/domain/00-domain-authority.md` (A0 — implementation authority) and `docs/product/00-product-design.md` (D0) before changing behavior
3. Keep the quality chain green before PR: `npx vitest run` + `npx tsc -p tsconfig.json --noEmit` + relevant L3/L5
4. Safety conventions: keys never persisted or uploaded; writes are snapshotted first; IPC args validated

---

**License**: MIT (see [LICENSE](LICENSE)) · **Contact**: GitHub Issues
