# K8 L5 视觉 harness 修复方案

**Goal:** 消掉 K8 两类假失败——(A) ADR-011 bridge/UI 扩张后 mock/基线滞后；(B) WSL↔macOS 基线宿主错位 + AA 贴边；并对 `.nf-start` 超时做一次可证伪的隔离复验。

**Architecture:** 不改产品门/成功语义。单点补齐测试桥契约（`mockBridge` 为权威），visual 手搓 mock 改为复用；基线更新纪律写进测试文档 + config 注释；截图前等稳态，不靠放宽全局 `maxDiff`。

**Tech Stack:** Playwright L5（`apps/desktop`）、既有 `tests/interaction/mockBridge.ts`、`playwright.config.ts`（`workers: 1`，基线声明 macOS）。

## Global Constraints

- 硬闸 ADR-012：本方案执行前须用户当轮裁决开修；测与修分离。
- 设计门槛 p000128 / d000002：**未达**——禁止借 flake 改产品确认门 / verifyCompletion。
- L5 基线权威宿主 = **macOS**（`playwright.config.ts` 已声明）；禁止在 WSL/Linux 上 `--update-snapshots` 入库。
- 不新增依赖；不把 L5 拉进 CI（Linux 渲染不同）。
- YAGNI：不引入重试框架、不抬全局像素阈值；单测可贴局部 `maxDiffPixels` 仅当 Mac 复验仍贴边。

## 根因 → 任务映射

| 根簇 | 任务 |
|------|------|
| A 契约滞后（config/settings/手搓 mock） | Task 1 |
| B 基线宿主 + AA | Task 2 |
| C `.nf-start` 超时（未能确认） | Task 3（取证后才准修） |

## File map

| 文件 | 职责 |
|------|------|
| `apps/desktop/tests/interaction/mockBridge.ts` | 权威 mock：补 `getWebAccess` / `setWebAccess` / `getModel` |
| `apps/desktop/tests/visual/visualBridge.ts`（新建） | 薄包装：`installVisualBridge(page, opts)` → 调 `installMockBridge` + 常用视觉预设 |
| `apps/desktop/tests/visual/*.visual.ts` | 删重复 `mockBridge`，改 `installVisualBridge` / `installMockBridge` |
| `apps/desktop/playwright.config.ts` | 强化「仅 macOS 更新基线」注释；可选 `forbidOnly` 无关 |
| `docs/tests/coverage-matrix.md` 或 `docs/tests/uat-tier-baseline.md` 旁新小节 | L5 基线更新纪律（一行指针即可） |
| `apps/desktop/snapshots/**` | **仅 Mac** 复验后按需更新 |

---

### Task 1: 测试桥契约单源（消 A）

**Files:**
- Modify: `apps/desktop/tests/interaction/mockBridge.ts`
- Create: `apps/desktop/tests/visual/visualBridge.ts`
- Modify: 所有仍手搓 `async function mockBridge` 的 `tests/visual/*.visual.ts`（start / config-page / settings / conversation / compact / …）
- Test: L3 既有 mock 用例不回归；L5 子集 config + settings + start

**Consumes:** `window.neonforge.config`（`types.d.ts`：`listProviders` / `getProvider` / `getWebAccess?` / `setWebAccess?` / `getModel?`）  
**Produces:** 任意 visual 启动路径上调用上述 API 不抛、不挂起

- [ ] **Step 1: 在 mockBridge 默认 config 补齐**

在 `installMockBridge` 生成的 `config` 对象内（约 L249–260）增加：

```ts
getModel: async () => null,
getWebAccess: async () => ({
  enabled: false,
  probeOk: false,
  searchUrl: null,
  searchKey: null,
  keenableApiKey: null,
  hasKeenableKey: false,
  keenablePublicTrial: false,
  builtinProvider: null,
}),
setWebAccess: async () => ({
  ok: true,
  config: {
    enabled: false,
    probeOk: false,
    searchUrl: null,
    searchKey: null,
    keenableApiKey: null,
    hasKeenableKey: false,
    keenablePublicTrial: false,
    builtinProvider: null,
  },
}),
```

可选：`MockBridgeOptions` 增加 `hasKey?: boolean`（默认 `true`），config-page 用 `hasKey: false` 共用工厂，删 config-page 私有 mock。

- [ ] **Step 2: 新建 visualBridge 薄封装**

```ts
// apps/desktop/tests/visual/visualBridge.ts
import type { Page } from '@playwright/test'
import { installMockBridge, type MockBridgeOptions } from '../interaction/mockBridge'

/** L5 统一入口——禁止再手搓缺字段的 config mock */
export async function installVisualBridge(page: Page, opts: MockBridgeOptions = {}) {
  await installMockBridge(page, opts)
}
```

- [ ] **Step 3: 迁移 visual 手搓 mock**

规则：
- 能直接 `installMockBridge` / `installVisualBridge` 的 → 删本地 `mockBridge`
- `config-page`：`installVisualBridge(page, { /* hasKey:false 若 Step1 已支持 */ })`；若暂无 `hasKey` 选项，保留最小本地 mock **但必须**含与工厂同形的 `listProviders`/`getProvider`/`getModel`
- `settings`：删掉重复的 `getWebAccess` 大块，改工厂默认
- `toolcalls` 里仍手搓的 read 卡 mock → 同样补齐或改工厂

验收 grep（应为 0 或仅 config 特例）：

```bash
rg -n 'async function mockBridge' apps/desktop/tests/visual/
```

- [ ] **Step 4: 验证**

```bash
cd apps/desktop
env -u NODE_ENV npx playwright test --project=interaction
# Mac:
env -u NODE_ENV npx playwright test --project=visual \
  tests/visual/config-page.visual.ts \
  tests/visual/settings.visual.ts \
  tests/visual/start.visual.ts
```

Expected: PASS（无 `.nf-config` 崩、无 settings 缺 API）

- [ ] **Step 5: Commit**

`test: L5/L3 mockBridge 补齐 webAccess/provider 契约，visual 复用单源`

---

### Task 2: 基线宿主纪律 + bash AA 稳态（消 B）

**Files:**
- Modify: `apps/desktop/playwright.config.ts`（注释）
- Modify: `docs/tests/coverage-matrix.md`（L5 小节加 3–5 行纪律）或 `docs/tests/uat-tier-baseline.md` 末尾「L5 指针」
- Modify: `apps/desktop/tests/visual/toolcalls.visual.ts`（bash 截图前稳态）
- Modify: `apps/desktop/snapshots/**` **仅当 Mac 复验失败且 diff 为产品 UI 真变**

- [ ] **Step 1: 写明纪律（config + 文档）**

`playwright.config.ts` 顶部注释补：

```ts
// L5 基线：只在 macOS 更新（npx playwright test --project=visual --update-snapshots）。
// WSL/Linux 渲染 ≠ 基线宿主——禁止在非 Mac 上 update 后入库（K8 / p0000xx）。
```

文档一行：`基线更新仅 Mac；与 UAT/eslint 等重任务串行（p000114）。`

- [ ] **Step 2: bash 审批截图前等稳态（先不抬阈值）**

在 `toolcall-bash-approval` 断言截图前：

```ts
await expect(page.locator('.nf-statusbar')).toContainText('待你批准')
await page.evaluate(() => document.fonts.ready)
await expect(bashCard.locator('.nf-toolcall__approve')).toBeVisible()
await expect(page.locator('.nf-chat')).toHaveScreenshot('toolcall-bash-approval.png')
```

若 Mac 单跑仍系统性超 `maxDiffPixels:100`：该条断言加局部 `{ maxDiffPixels: 200 }`，**禁止**改全局 `use.expect.toHaveScreenshot`。

- [ ] **Step 3: Mac 复验**

```bash
# 仅 Mac，且无并行 eslint/UAT
cd apps/desktop
env -u NODE_ENV npx playwright test --project=visual
```

Expected: 全绿。仅当 Keenable/设置等 UI 相对基线仍有真像素差 → 同机 `--update-snapshots` 后 `git diff --stat snapshots/` 人工过目再提交。

- [ ] **Step 4: Commit**

`test: L5 基线仅 Mac 更新；bash 审批截图等 fonts 稳态`

---

### Task 3: `.nf-start` 超时隔离取证（消 C，有证才修）

**Files:** 默认无代码；有证后再改（见下）

- [ ] **Step 1: 取证协议（Mac，串行）**

```bash
# A: 单独 L5 全量（记录 /tmp/nf-l5-solo.txt）
cd apps/desktop && env -u NODE_ENV npx playwright test --project=visual 2>&1 | tee /tmp/nf-l5-solo.txt

# B: 与重任务并行再跑一次（记录 /tmp/nf-l5-parallel.txt）——刻意与 eslint 或 UAT 并行以对照 p000114
```

分类：
- 仅 B 失败 → **根=资源竞争**：文档写「L5 禁止与重任务并行」；可选在 `package.json` 脚本加注释。不改产品。
- A 也失败且固定用例 → 打开该用例：是否停在 `boot`（空 `.nf-app`）、是否进了 `.nf-config`、console 是否 `hasKey failed` / `neonforge missing`。按日志修 **该用例 mock/goto**，不抬全局 timeout。
- A/B 均绿 → C 关闭为「未能复现」；handoff 记 outcome，不改码。

- [ ] **Step 2: 仅当 A 复现时的最小修**

优先序：
1. 截图/可见前 `await expect(page.locator('.nf-start')).toBeVisible({ timeout: 15000 })` 仍失败 → 查 mock `hasKey`
2. vite：确认无第二进程占 5175；`reuseExistingServer` 冲突时改测前 `lsof` 或文档要求独占
3. 最后才考虑单测超时上调

- [ ] **Step 3: Commit（仅有代码变更时）**

`test: L5 启动可见性超时取证后的最小稳定化` 或 `docs: K8 .nf-start 超时未能复现（solo 绿）`

---

### Task 4: 关单与交接

- [ ] 更新 `docs/audits/uat-e2e-issues-closeout-2026-09-30.md` K8 行：原根指向本方案 + 处置结果
- [ ] `handoff add action`（若尚未有）→ 完成后 `close`；pitfall 可选一条：「L5 基线禁止 WSL update」
- [ ] 全量 Mac：`npx playwright test --project=visual` 绿

---

## 明确不做

- 不改 ADR-011 / Keenable 产品行为  
- 不把 L5 送进 CI  
- 不全局抬 `maxDiffPixelRatio`  
- 不在测中途改码（ADR-012）

## 验收

| 项 | 标准 |
|----|------|
| 契约 | visual 无缺字段手搓 config；settings/config/start Mac 绿 |
| 基线 | 文档+config 写明仅 Mac update；无 WSL 新 PNG 入库 |
| AA | bash-approval Mac 稳定绿（fonts 等待或单条局部阈值） |
| 超时 | Task3 有 `/tmp/nf-l5-*.txt` 结论；复现则最小修，否则关闭未能复现 |

## Self-check

- A/B/C 三根均有任务；C 强制先取证  
- 无 TBD；关键代码块已写出  
- 未越设计门槛改产品门
