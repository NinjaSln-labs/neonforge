# NeonForge

> **AI Problem Workbench for DeepSeek** — say what's blocking you, get it solved. Anything a computer can do: file organization, small tools, websites, system fixes, 0-to-1 deliveries.

NeonForge is not an IDE and not a chatbot. You describe a problem in plain language; NeonForge drives the engineering/design/orchestration internally — with **step-by-step approval**, **verifiable results**, and **guided handoff** when something is beyond digital reach (no overpromising).

**Who it's for**: non-coders (say the problem → get a result + guidance) · developers (bug fixes / 0-to-1 delivery with an approval loop).

**Core loop**: `Say the problem → Clarify → Approve step-by-step → Solve → Deliver (artifact / fix) → Feedback + guidance`

<video controls width="720" src="demo/neonforge-demo.mov" title="NeonForge core flow demo (recorded against the real API — first-run config → open project → two-turn conversation)">
  Your browser doesn't support the video tag — <a href="demo/neonforge-demo.mov">download the demo video</a>.
</video>

---

## Highlights

1. **KV-cache preheating** — opening a project preheats the prompt prefix; first-token latency ~0.1s (measured: 275ms cold → 118ms on KV hit)
2. **Precise context (1M-budget mindset)** — real LSP (definition/references/type/diagnostics) + CodeRAG keyword search + `@mention` file injection — no token dumping
3. **Snapshot & rollback** — every write is snapshotted (`.nf-bak`) before applying; one-click revert per write; batch accept for delivery
4. **Trust-ladder authorization** — L1 observe → L2 suggest → L3 operate (per-item approval + risk disclosure) → L4 delegate (revocable auto-approve for low-risk ops); fatigue protection (batch merge, high-risk commands always confirmed individually); stop/undo at any moment
5. **Problem = first-class citizen** — problem ledger + session snapshots (goal / decided / authorized / todo) + resume + re-run
6. **Long conversations don't lose context** — automatic compaction (real summary + keep recent 20)
7. **Single instance** — second launch focuses the existing window

## Quick Start

> Requires a DeepSeek API Key (get one at `https://platform.deepseek.com`).

```bash
cd apps/desktop
npm install                # dependencies (Electron mirror fallback below)
npm run dev                # renderer dev server only (:5173)
npm run dev:electron       # full app (dev mode, connects to :5173)
```

- First launch: paste your API Key in Settings (stored via OS-level `safeStorage`, never uploaded)
- **Open existing project** → describe the problem in chat → approve step-by-step → receive the delivery
- **Start from scratch** → auto-creates a project skeleton → 0-to-1 delivery

### Build & Package

```bash
cd apps/desktop
npm run dist               # outputs to release/ (macOS: .dmg + .zip; win: .nsis; linux: AppImage)
```

> **ExFAT/external volumes**: electron-builder produces a corrupted asar on ExFAT volumes (`chromium-pickle` offset error) — output to a local volume instead: `npm run build && npx electron-builder -c.directories.output=/tmp/nf-release`
>
> macOS unsigned builds require right-click → Open on first launch (Gatekeeper). Code signing/notarization is on the roadmap.

### Testing

```bash
npx vitest run                            # L1 domain logic (257)
npx tsc -p tsconfig.json --noEmit         # L2 contracts (renderer + main)
npx playwright test --project=interaction # L3 component interaction (25)
npx playwright test                       # L5 visual + L3
NF_TEST_KEY=<key> node e2e-suite.mjs      # L4 real-API E2E (prereq: mkdir -p /tmp/nf-e2e-test)
```

### Electron mirror (if download fails)

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js
```

## Tech Stack & Architecture

**Stack**: Electron 36 + React 19 + TypeScript + Vite + esbuild + Monaco (artifact viewer) + Vitest + Playwright. DeepSeek-only gateway (V1).

**Domain architecture (stage-free, goal-driven)**:

```
Conversation BC (core) — goal state machine · confirmation points (goal/execution/achievement cards) · execution policy (forceTool) · session-level single PENDING
Capability BC           — environment detection (source of truth) · capability views (derived)
Workspace BC            — project files · planned-files boundary (host-enforced) · authorization + task-level trust
Delivery BC             — delivery package (artifacts + acceptance + confirm-close) · DoD alignment · snapshot rollback
Session Timeline BC     — unified step log (observability)
```

## Docs

| Doc | Description |
|-----|-------------|
| `docs/product/00-product-design.md` (D0) | Product design authority |
| `docs/domain/00-domain-authority.md` (A0) | Domain implementation authority |
| `.agents/product-marketing.md` | Positioning / ICP / differentiation |

Full index: `docs/product/` (D0–D9) and `docs/domain/` (A0–A9).

## Known Limitations (V1)

- **LSP in packaged builds**: full LSP in dev mode; if `typescript-language-server` isn't installed system-wide, LSP tools report "not connected" in packaged builds — chat/tools/delivery main flow unaffected
- macOS unsigned (see above); Windows/Linux packaging targets configured but not yet validated
- Single-instance lock is per-app-scope; watch for leftover test instances (see CI scripts)

## Contributing

1. Fork + feature branch (`feat/xxx` or `fix/xxx`)
2. Read `docs/domain/00-domain-authority.md` (A0 — implementation authority) before changing behavior
3. Keep the quality chain green before PR: `npx vitest run` + `npx tsc -p tsconfig.json --noEmit` + relevant L3/L5
4. Safety conventions: keys never persisted or uploaded; writes are snapshotted first; IPC args validated

---

**License**: MIT (see [LICENSE](LICENSE)) · **Contact**: GitHub Issues
