import { _electron } from 'playwright'

// NeonForge 真实环境 E2E 套件：真实 Electron + 真实 DeepSeek API
// 场景矩阵：主链路 / 工具待授权 / 多轮对话 / 纯文本 / 异常 / 空回复 / 超时
const KEY = process.env.NF_TEST_KEY
const EMPTY_DIR = '/tmp/nf-e2e-test'
const REAL_PROJ = '/workspace/neonforge/apps/desktop' // 有 package.json

let pass = 0, fail = 0
const results = []

async function launch(proj) {
  const app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173', NF_TEST_PROJECT: proj, ELECTRON_RUN_AS_NODE: '' }
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.nf-start', { timeout: 10000 })
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 10000 })
  await page.evaluate((k) => window.neonforge.config.setKey(k), KEY)
  return { app, page }
}

async function waitSettle(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastText = ''
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500)
    const texts = await page.locator('.nf-msg').allInnerTexts()
    lastText = texts[texts.length - 1] ?? ''
    const busy = await page.locator('.nf-working').count()
    const sb = await page.locator('.nf-statusbar').innerText().catch(() => '')
    if (!lastText.includes('处理中') && lastText.trim() && busy === 0 && sb.includes('就绪')) break
  }
  const dur = ((Date.now() - (deadline - timeoutMs)) / 1000).toFixed(1)
  const cards = await page.locator('.nf-toolcall').count()
  const approve = await page.locator('.nf-toolcall__approve').count()
  return { text: lastText, dur, cards, approve }
}

async function send(page, text) {
  await page.locator('.nf-chat__input textarea').fill(text)
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
}

async function case_(name, fn) {
  const t0 = Date.now()
  try {
    const info = await fn()
    const ok = info.ok
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    if (ok) { pass++; console.log(`✅ ${name} (${secs}s)${info.detail ?? ''}`) }
    else { fail++; console.log(`❌ ${name} (${secs}s) ${info.detail ?? ''}`) }
    results.push({ name, ok, secs })
  } catch (e) {
    fail++; console.log(`❌ ${name} 异常: ${String(e).slice(0, 120)}`)
    results.push({ name, ok: false, secs: '-' })
  }
}

console.log('=== NeonForge 真实环境 E2E 套件 ===\n')

// 场景 1：空目录「帮我看看package.json」——主链路（工具→执行→模型回复）
await case_('空目录主链路（read 找不到→模型回复）', async () => {
  const { app, page } = await launch(EMPTY_DIR)
  await send(page, '帮我看看package.json')
  const r = await waitSettle(page, 30000)
  await app.close()
  const ok = !r.text.includes('处理中') && r.text.trim().length > 20 && parseFloat(r.dur) < 25
  return { ok, detail: `| ${r.dur}s | 卡片:${r.cards} | ${r.text.slice(0, 40)}` }
})

// 场景 2：空目录「查看项目结构」——工具执行不卡死（🔒 授权或 read 自动均可——坑 13 模型工具选择不稳定）
await case_('工具执行不卡死（授权/自动）', async () => {
  const { app, page } = await launch(EMPTY_DIR)
  await send(page, '查看这个项目的结构')
  const r = await waitSettle(page, 30000)
  await app.close()
  const ok = !r.text.includes('处理中') && (r.approve >= 1 || r.cards > 0) && parseFloat(r.dur) < 25
  return { ok, detail: `| ${r.dur}s | 授权按钮:${r.approve} | 卡片:${r.cards}` }
})

// 场景 3：真实项目（有 package.json）——read 命中
await case_('真实项目 read（package.json 内容）', async () => {
  const { app, page } = await launch(REAL_PROJ)
  await send(page, '读取 package.json 并总结')
  const r = await waitSettle(page, 30000)
  await app.close()
  const ok = !r.text.includes('处理中') && r.text.length > 20 && parseFloat(r.dur) < 25
  return { ok, detail: `| ${r.dur}s | ${r.text.slice(0, 40)}` }
})

// 场景 4：多轮对话（连续 3 条——会话隔离）
await case_('多轮对话（连续 3 条）', async () => {
  const { app, page } = await launch(EMPTY_DIR)
  await send(page, '帮我看看package.json')
  const r1 = await waitSettle(page, 30000)
  await send(page, '那有什么配置文件吗')
  const r2 = await waitSettle(page, 35000)
  await send(page, '好的谢谢')
  const r3 = await waitSettle(page, 20000)
  await app.close()
  const ok = !r1.text.includes('处理中') && !r2.text.includes('处理中') && !r3.text.includes('处理中')
  return { ok, detail: `| 3 条全部结束 | ${r1.dur}s/${r2.dur}s/${r3.dur}s` }
})

// 场景 5：纯文本对话（模型应正常回复；工具调用与否是模型行为——不断言强制 0，坑 13 鲁棒化）
await case_('纯文本（模型正常回复）', async () => {
  const { app, page } = await launch(EMPTY_DIR)
  await send(page, '你好，介绍一下你自己')
  const r = await waitSettle(page, 25000)
  await app.close()
  const ok = !r.text.includes('处理中') && r.text.length > 15
  return { ok, detail: `| ${r.dur}s | 卡片:${r.cards}(模型行为) | ${r.text.slice(0, 30)}` }
})

// 场景 6：快速连续发送（第二条在第一条处理中时发送——并发）
await case_('快速连发（并发保护）', async () => {
  const { app, page } = await launch(EMPTY_DIR)
  await send(page, '帮我看看package.json')
  await page.waitForTimeout(800)
  await send(page, '再看看当前目录') // 第一条还在处理中
  const r = await waitSettle(page, 40000)
  await app.close()
  const ok = !r.text.includes('处理中')
  return { ok, detail: `| ${r.dur}s | ${r.text.slice(0, 40)}` }
})

console.log(`\n=== 汇总: ${pass} passed / ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
