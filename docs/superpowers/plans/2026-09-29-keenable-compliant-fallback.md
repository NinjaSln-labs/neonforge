# Keenable 合规内置回退 — 方案定稿

> **For agentic workers:** implement task-by-task; checkbox steps for tracking.  
> Spec：`.scratch/neonforge-v1/research/keenable-compliance-2026-09-29.md`  
> 现状债：`webTools.ts` 仍静默 `POST /v1/search/public` —— 本方案改掉。

**Goal:** 保留「按可连性：先 DDG、再 Keenable」；**生产搜索只走带 Key 的 `/v1/search`**；禁止静默 `/public`；设置可配 `keen_` + 赴美披露；可选显式「公共试用」。

**Architecture:**

```
开启外网（无 searchUrl 覆盖）
  probe:  DDG 真搜路径 → 失败则 Keenable
            · 已有 keen_ Key → POST /v1/search（ADR-011 真探活）
            · 无 Key → GET /health（只判可达，不刷 public 配额）
          落盘 builtinProvider = ddg | keenable

  search: searchUrl? → override
          builtin=ddg → DDG Instant Answer
          builtin=keenable →
            · 有 keenableApiKey → POST /v1/search + X-API-Key
            · 无 Key 且 publicTrial=true → POST /v1/search/public + X-Keenable-Title: NeonForge
            · 否则 policy 拒绝 + 引导配 Key / 开试用 / 填自有端点
```

**Tech Stack:** `apps/desktop` — `configStore` / `webTools` / `ipc` / `SettingsPanel` / Vitest。

## Global Constraints

- 不合规红线：全用户默认静默 `/public`（官方：「past a first look 请用 Key」）。
- 探测顺序固定：**DDG → Keenable**。
- 不向仓库写入任何 `keen_` 值；不内置 NeonForge 组织 Key（防滥用与配额共用）。
- Key / trial 存本机 `neonforge-config.json`（0600），与 `webSearchKey` 同级。
- 赴美处理：设置文案必须可见（Privacy：US processing）。
- Conventional Commits；未要求则不 commit。

## 产品行为（验收口径）

| 场景 | 期望 |
|------|------|
| DDG 通 | `builtin=ddg`；搜索走 DDG；可不配 Keenable Key |
| DDG 不通、Keenable 通、**已配 Key** | `builtin=keenable`；搜索 `/v1/search` |
| DDG 不通、Keenable 通、**无 Key、试用关** | 开启可成功（探活过）；**第一次 web_search 拒绝**并提示配 Key |
| 同上 + **试用开** | 允许 `/public`（文案含限额 + 赴美） |
| 有 `searchUrl` | 仍覆盖内置；跳过 builtin 探测分配 |

---

### Task 1: configStore + IPC + 类型

**Files:**
- Modify: `apps/desktop/src/main/configStore.ts`
- Modify: `apps/desktop/src/main/ipc.ts`（get/set-web-access 透传新字段）
- Modify: `apps/desktop/src/renderer/types.d.ts`
- Modify: `apps/desktop/src/preload/preload.ts`（若需类型对齐；invoke 透传即可）

**Interfaces — `WebAccessConfig` 增补：**

```ts
keenableApiKey: string | null      // 明文本机；UI 可回填编辑（同 searchKey）
hasKeenableKey: boolean            // 派生
keenablePublicTrial: boolean       // 默认 false
```

持久化字段名：`webKeenableApiKey`、`webKeenablePublicTrial`。

- [ ] **Step 1:** 扩展 `NeonForgeConfig` / `getWebAccess` / `setWebAccess`；`enabled===false` 时 `probeOk=false`、清 `builtin`（现有逻辑保留）；**不必**强清 Key（用户重开可复用）。
- [ ] **Step 2:** IPC get 返回新字段；set 接受 `keenableApiKey?`、`keenablePublicTrial?`。
- [ ] **Step 3:** `types.d.ts` 同步。

---

### Task 2: Settings UI

**Files:**
- Modify: `apps/desktop/src/renderer/SettingsPanel.tsx`

- [ ] **Step 1:** 外网区块增加：
  - 输入：`Keenable API Key`（`type=password`，placeholder `keen_…`）
  - 说明一句：`DDG 不可达时使用；查询由 Keenable 在美国处理。免费额度见 keenable.ai（需账号）。`
  - 勾选（默认关）：`允许无 Key 公共试用（每 IP 约 1000 次/小时，共享池，仅评估）`
- [ ] **Step 2:** `saveWebAccess` 把 Key / trial 一并提交。
- [ ] **Step 3:** 成功文案：
  - ddg → `已开启（内置：DuckDuckGo）`
  - keenable + hasKey → `已开启（内置：Keenable，已配置 Key）`
  - keenable + !hasKey + trial → `已开启（内置：Keenable 公共试用）`
  - keenable + !hasKey + !trial → `已开启（Keenable 可达；搜索前请配置 Key 或开启试用）`

---

### Task 3: webTools 合规路由 + 测试

**Files:**
- Modify: `apps/desktop/src/main/webTools.ts`
- Modify: `apps/desktop/tests/unit/webTools.test.ts`

**常量：**

```ts
const KEENABLE_SEARCH = 'https://api.keenable.ai/v1/search'         // keyed
const KEENABLE_SEARCH_PUBLIC = 'https://api.keenable.ai/v1/search/public'
const KEENABLE_HEALTH = 'https://api.keenable.ai/health'
const KEENABLE_TITLE = 'NeonForge'
```

**`probeWebAccess(cfg?: { keenableApiKey?: string | null })`：**

1. `probeDdg(timeout)` → ok → `{ ok:true, provider:'ddg' }`
2. else if key → `POST /v1/search` body `{ query:'neonforge-probe', mode:'realtime', max_results:1 }` + `X-API-Key` → ok → `keenable`
3. else `GET /health` → 2xx → `keenable`
4. else `{ ok:false, error }`

IPC 调用 probe 时传入当前 patch/cur 的 keenableApiKey。

**`searchKeenable(query, cfg)`：**

- key → keyed search；`source: 'keenable'`
- else if `cfg.keenablePublicTrial` → public + Title；`source: 'keenable-public'`
- else → `{ ok:false, policy:true, error: '…' }`（中文引导）

- [ ] **Step 1: 写失败单测（再实现）**
  - 无 Key、trial=false、provider=keenable → 不出现 `search/public` URL；`policy` 错
  - 有 Key → 请求 `.../v1/search` 且 header 含 `X-API-Key`
  - trial=true 无 Key → 允许 `.../search/public` + `X-Keenable-Title`
  - probe：DDG 抛错后无 Key 时请求 `health`；有 Key 时请求 `/v1/search`
  - probe：DDG 成功则不请求 keenable
- [ ] **Step 2: 实现**
- [ ] **Step 3:** `cd apps/desktop && npx vitest run tests/unit/webTools.test.ts` → PASS

---

### Task 4: 文档 / handoff

**Files:**
- Modify: `.scratch/neonforge-v1/research/keenable-web-search-2026-09-29.md` §5 实现现状
- `handoff add pitfall`：`禁止静默 Keenable /public 作生产默认；须 Key 或用户显式试用`（若尚无）

- [ ] **Step 1–2:** 如上；不写 ADR 除非用户要求。

---

### Task 5: 验证

- [ ] **本地:** `npx vitest run tests/unit/webTools.test.ts`
- [ ] **Mac（有网）:**  
  - 无 Key / 试用关 / DDG 不通：开启外网成功；`web_search` 得引导错，且抓包无 public 搜索  
  - 配真实 `keen_`：中文 query 有 `results`

---

## Self-review

| 合规原则 | 任务 |
|----------|------|
| 禁静默 public | Task 3 |
| DDG→Keenable 探测 | Task 3 |
| Key 生产路径 | Task 1–3 |
| 显式试用可选 | Task 1–2 |
| 赴美披露 | Task 2 |

无 TBD；probe 策略已钉死（health vs keyed search）。

---

**执行选项：**

1. **Subagent-Driven（推荐）** — 每任务新开子代理  
2. **Inline** — 本会话连续做完  

选哪个？
