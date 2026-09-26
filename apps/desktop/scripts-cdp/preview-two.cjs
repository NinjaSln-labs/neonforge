// 临时预览：配置页 vs 启动页 并排对比截图（不取证据、不入库）
// 用法：先起 vite dev（5175），再 node preview-two.cjs
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 2700, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => {
    const params = new URLSearchParams(location.search)
    const mode = params.get('mode')
    if (mode === 'start') {
      const bridge = {
        version: 'preview',
        config: {
          hasKey: async () => true,
          getKey: async () => 'test-key',
          setKey: async () => {},
          clearKey: async () => {},
        },
        workspace: { openFolder: async () => '/test', listDir: async () => [], readFile: async () => ({ ok: true, content: '' }) },
        gateway: { validate: async () => ({ ok: true }), streamChat: async () => ({ ok: true }), onStreamChunk: () => () => {} },
      }
      window.neonforge = bridge
    }
    // mode === 'config'：不注入 bridge —— App 走 config 分支（无 Key 首启）
  })
  const page = await ctx.newPage()
  await page.setContent(`
    <body style="margin:0;display:flex;background:#0d0b14;font-family:sans-serif">
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="padding:10px;text-align:center;color:#9ca3af;font-size:14px">① 首启 · 密钥页（无 Key）</div>
        <iframe src="http://localhost:5175/?mode=config" style="flex:1;border:1px solid #333;width:100%;height:860px"></iframe>
      </div>
      <div style="width:2px;background:#444"></div>
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="padding:10px;text-align:center;color:#9ca3af;font-size:14px">② 启动页（有 Key）</div>
        <iframe src="http://localhost:5175/?mode=start" style="flex:1;border:1px solid #333;width:100%;height:860px"></iframe>
      </div>
    </body>`)
  await page.waitForTimeout(2500)
  const confVisible = await page.frames()[1].locator('.nf-config').count()
  const startVisible = await page.frames()[2].locator('.nf-start').count()
  console.log('config frame ok:', confVisible > 0, '| start frame ok:', startVisible > 0)
  await page.screenshot({ path: '/tmp/nf-cdp/uat/config-vs-start.png' })
  await browser.close()
  console.log('saved /tmp/nf-cdp/uat/config-vs-start.png')
})()
