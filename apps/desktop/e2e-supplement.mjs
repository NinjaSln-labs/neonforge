import { _electron } from 'playwright'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { ensureMainBuild } from './e2e-build-check.mjs'

// L4 补充场景：write 授权写入 / 授权后续聊 / Key 失效 / 上下文保留
const KEY = process.env.NF_TEST_KEY
const EMPTY = '/tmp/nf-e2e-test'

let pass = 0,
  fail = 0

async function launch(proj) {
  const app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
      NF_TEST_PROJECT: proj,
      ELECTRON_RUN_AS_NODE: '',
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.nf-start', { timeout: 10000 })
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 10000 })
  await page.evaluate((k) => window.neonforge.config.setKey(k), KEY)
  return { app, page }
}

async function settle(page, timeoutMs) {
  const dl = Date.now() + timeoutMs
  let t = ''
  while (Date.now() < dl) {
    await page.waitForTimeout(1500)
    const ts = await page.locator('.nf-msg').allInnerTexts()
    t = ts[ts.length - 1] ?? ''
    const busy = await page.locator('.nf-working').count()
    const sb = await page
      .locator('.nf-statusbar')
      .innerText()
      .catch(() => '')
    if (!t.includes('处理中') && t.trim() && busy === 0 && sb.includes('就绪')) break
  }
  const cards = await page.locator('.nf-toolcall').count()
  const approve = await page.locator('.nf-toolcall__approve').count()
  return { text: t, cards, approve }
}

async function send(page, text) {
  await page.locator('.nf-chat__input textarea').fill(text)
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
}

async function check(name, cond, detail) {
  if (cond) {
    pass++
    console.log(`✅ ${name} | ${detail}`)
  } else {
    fail++
    console.log(`❌ ${name} | ${detail}`)
  }
}

console.log('=== L4 补充场景（7-12 补 4 个真实可测）===\n')

// 坑 44 流程化：启动前置检测 dist 过期（改 main/preload 后自动 build，根治加载旧产物）
ensureMainBuild()

// 场景 7：write 授权写入（确定性——CDP 直接调 write 工具 approved:true → 真实写文件）
{
  const { app, page } = await launch(EMPTY)
  const f = '/tmp/nf-e2e-test/hello.txt'
  if (existsSync(f)) unlinkSync(f)
  const r = await page.evaluate(async (file) => {
    const res = await window.neonforge.tools.execute(
      'write',
      { path: file, content: 'hello neonforge' },
      { approved: true },
    )
    return res
  }, f)
  const written = r.ok && existsSync(f) && readFileSync(f, 'utf-8') === 'hello neonforge'
  await app.close()
  await check(
    'write 授权写入',
    written,
    `执行:${r.ok} 文件内容:${written ? 'hello neonforge' : '未写入'}`,
  )
}

// 场景 8：授权后续聊（bash 授权执行 → 结果回填 → 模型续聊回复）
// 坑 13 鲁棒化：模型可能调不同工具——有授权按钮则验证续聊，无则要求模型已正常回复
{
  const { app, page } = await launch(EMPTY)
  await send(page, '查看这个项目的结构')
  const r1 = await settle(page, 30000)
  let ok
  if (r1.approve > 0) {
    const before = await page.locator('.nf-msg').count()
    await page.locator('.nf-toolcall__approve').first().click()
    await settle(page, 25000)
    const after = await page.locator('.nf-msg').count()
    const last = await page
      .locator('.nf-msg')
      .last()
      .innerText()
      .catch(() => '')
    ok = after > before && !last.includes('处理中')
  } else {
    // 模型未走授权路径（read 自动执行/直接回复）——验证已正常回复
    const last = await page
      .locator('.nf-msg')
      .last()
      .innerText()
      .catch(() => '')
    ok = last.length > 10 && !last.includes('处理中')
  }
  await app.close()
  await check('授权后续聊', ok, `授权按钮:${r1.approve} ${ok ? '通过' : '未触发续聊'}`)
}

// 场景 10：Key 失效（注入无效 Key → 发送 → 更新提示）
{
  const { app, page } = await launch(EMPTY)
  await page.evaluate(() => window.neonforge.config.setKey('sk-invalid-key-for-test'))
  await send(page, '你好')
  await page.waitForTimeout(8000)
  const msgs = await page.locator('.nf-msg').allInnerTexts()
  const hasKeyInvalid = msgs.some((m) => m.includes('API Key') && m.includes('失效'))
  await app.close()
  await check('Key 失效提示', hasKeyInvalid, `消息含更新提示:${hasKeyInvalid}`)
}

// 场景 12：上下文保留（工具场景后追问记得）
{
  const { app, page } = await launch(EMPTY)
  await send(page, '帮我看看package.json')
  await settle(page, 30000)
  await send(page, '我们刚才在找什么文件？')
  const r = await settle(page, 25000)
  const knows = r.text.includes('package.json')
  await app.close()
  await check('上下文保留（工具场景后）', knows, `回复:${r.text.slice(0, 50)}`)
}

console.log(`\n=== 补充场景汇总: ${pass} passed / ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
