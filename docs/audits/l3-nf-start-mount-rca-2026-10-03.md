# t000076 归因：`.nf-start` 挂载红族＝外部网络变更打断资源请求（非编译慢、非产品时序）

日期：2026-10-03（深夜）· 分支 `test/uat-persona-3round` @ `0a8f6b1`（HEAD 三刀已入库）
触发：同日 HEAD 对照 3 轮 6 例 ＋ 三刀批 3 轮 7 例 ＋ 本归因轮 2 例 ＝ **今日 15 例同签名**，而 d000048 曾判「治理刀 L1+L2 后 3 轮合计 1 离群案」→ 表面「压住率退化」，实为**该类从未被治理刀覆盖**。
批纪律：只记不改（产品/harness/断言零改动），遵 ADR-012。

## 1 Fact（现场直取）

归因轮命令：`npx playwright test --project=interaction --reporter=line --trace=retain-on-failure`（74 passed / 2 failed，6.3m）。两例失败签名一致：

| 用例 | 断言 | 现场 console |
|---|---|---|
| `core.interaction.ts:766` 启动页方案 A | `locator('.nf-start')` 5000ms `element(s) not found` | **25 条 `Failed to load resource: net::ERR_NETWORK_CHANGED`**，全部打在 monaco 的 CSS 请求上（`.../vs/editor/**/*.css`）；error-context **无页面快照**（DOM 无内容） |
| `cards-from-decision-content:321` S4-3 | `locator('.nf-start')` 15000ms `element(s) not found` | **1 条 `ERR_NETWORK_CHANGED`**，打在预打包依赖 `node_modules/.vite/deps/chunk-F5U3VJ4X.js?v=b66d663c` |

要点：请求是被**中止**（aborted），不是慢；`[App] window.neonforge missing` 等自报错误**未出现**，说明 React 根本没跑到挂载判定。

## 2 Fact（挂载路径不可能"慢 15 秒"）

`src/renderer/App.tsx:19-35`：`screen='boot'` → effect 内 `bridge.config.hasKey()` → resolve 后置 `'start'`。L3 的 mock `hasKey: async () => true` 即时 resolve；`.nf-start` 缺席只能是 **bundle 未执行**（资源请求失败），不是等待链过长。故 L1（expect 定向超时 15s）与 L2（warmup 预热）**对这一类无效**——再多等待救不回已中止的请求。

## 3 Inference（分类，非定论）

`ERR_NETWORK_CHANGED` 是 Chromium 收到「网络变更」通知后放弃在途连接的通用行为。宿主侧观测支持外因：`ip -br addr` 显示 WSL2 今日 **eth0 DOWN / eth1 UP / loopback0 UP**（多适配器并存，接口翻动会向 Windows 网络栈发变更事件）；同时段机器空闲（可用内存 21G、load 0.34、无 memory PSI）→ 不能用负载解释；两例被中断的资源分属完全不同模块（monaco CSS vs vite deps）→ 不是某个特定依赖或某条产品路径。

## 4 Assumption（未证，留给修法批次）

- 15 例同签名红是否**全部**由该外因造成（本轮只坐实 2 例，其余 13 例按签名同族处理，未逐个开 trace）；
- vite 中途重优化依赖（`?v=` 哈希变更触发 full-reload）是否也在部分红里叠加（本轮 reporter 输出未见 `new dependencies optimized`，但 line reporter 可能吞掉 webServer stdout）。

## 5 候选修法（待裁，均为 harness/infra，不动产品与断言）

| 方案 | 做法 | 代价与风险 |
|---|---|---|
| A 挂载门重导航 | 在 `tests/interaction/scenarios.ts` 的 `gotoApp/startFromScratch` 里，`.nf-start` 未在阈值内出现则 `page.reload()` 一次再等 | 最小面；只重导航不重断言 ⇒ `retries` 仍 0、不掩盖真实缺陷；但会掩盖"真·不挂载"产品缺陷一次（需保留 reload 后的硬失败） |
| B 去 dev-server 依赖 | L3 改跑 `vite build` ＋ 静态 preview | 请求数与 dep 重载归零，最根治；改动 `webServer` 配置与构建耗时进测前流程，成本中 |
| C 浏览器参数 | chromium 加 `--disable-background-networking`、`--host-resolver-rules="MAP localhost 127.0.0.1"` 等 | 一行配置；能否压住需实测（不保证，属概率削减） |
| D 口径分类 | 把该类红在覆盖率/门禁口径里单列为「环境类」，与 CI 对照（CI 无 WSL 网络栈，红率应显著低） | 不改稳定性，只改判读——但能止住「治理失效」的误判 |

建议次序：**先 C（一行、可即测）→ 再 A（兜底）→ B 视效果决定是否值得**；D 无论如何都做（否则后续每次外部网络抖动都会被误读成质量退化）。

## 6 对既有结论的修正

d000048「`.nf-start` 挂载家族**基本消灭**」应更正为：「L1+L2 消灭的是**冷编译等待型**挂载红；**请求中止型**（`ERR_NETWORK_CHANGED`）从未被覆盖，今日以 2 例/轮的频率再现 15 例」。`T6 retries:1` 仍不应为此类开启（重试会掩盖，且不解决归属问题）。
