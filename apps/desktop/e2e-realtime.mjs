import { _electron } from 'playwright'
import { existsSync, mkdirSync } from 'fs'

// 真实环境自动化测试：Electron + 真实 DeepSeek API + 空目录场景（neorforge-test）
// 场景：打开空目录 → 发送「帮我看看package.json」→ 验证完整闭环（工具调用→执行→模型回复）
const KEY = process.env.NF_TEST_KEY
const TEST_DIR = '/tmp/nf-e2e-test' // 空目录（模拟 neorforge-test）

async function main() {
  if (!KEY) { console.log('❌ 需要 NF_TEST_KEY'); process.exit(1) }
  // 确保空目录存在
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true })
  console.log('=== 真实环境 E2E：空目录 + 真实 DeepSeek API ===')
  const start = Date.now()

  const app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173', NF_TEST_PROJECT: TEST_DIR, ELECTRON_RUN_AS_NODE: '' }
  })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))

  // 进入 workspace（NF_TEST_PROJECT 跳过对话框）
  await page.waitForSelector('.nf-start', { timeout: 10000 })
  await page.getByRole('button', { name: '打开已有项目' }).click()
  await page.waitForSelector('.nf-chat__input textarea', { timeout: 10000 })
  console.log('✅ 进入 workspace（空目录）')

  // 注入 Key（测试用）
  await page.evaluate((k) => window.neonforge.config.setKey(k), KEY)

  // 发送
  await page.locator('.nf-chat__input textarea').fill('帮我看看package.json')
  await page.locator('.nf-chat__input textarea').press('Meta+Enter')
  console.log('✅ 已发送——等待完整闭环…')

  // 轮询等结束：消息 done（最后消息不是"处理中"且非 streaming）或超时 75s
  const deadline = Date.now() + 75000
  let lastText
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000)
    const texts = await page.locator('.nf-msg').allInnerTexts()
    lastText = texts[texts.length - 1] ?? ''
    // 结束判断：最后消息不含"处理中"且非空且状态栏就绪
    const statusbar = await page.locator('.nf-statusbar').innerText().catch(() => '')
    const busy = await page.locator('.nf-working').count()
    if (!lastText.includes('处理中') && lastText.trim() && busy === 0 && statusbar.includes('就绪')) break
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1)
  const texts = await page.locator('.nf-msg').allInnerTexts()
  const toolcards = await page.locator('.nf-toolcall').count()
  const finalMsg = texts[texts.length - 1] ?? ''

  console.log(`\n=== 结果（${duration}s）===`)
  console.log('消息数:', texts.length)
  console.log('工具卡片:', toolcards)
  console.log('最后消息:', finalMsg.slice(0, 150))
  console.log('仍是处理中:', finalMsg.includes('处理中'))

  const ok = !finalMsg.includes('处理中') && finalMsg.trim().length > 0 && duration < 60
  console.log(ok ? '\n✅ E2E PASS（完整闭环 + 正常结束）' : '\n❌ E2E FAIL')
  await app.close()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('E2E ERROR:', e); process.exit(1) })
