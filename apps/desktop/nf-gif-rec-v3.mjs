// demo 录屏 v3（2026-08-03——真录屏方案：macOS screencapture -v 录 H.264 mov + playwright 编排操作 app）
// 背景：GIF 256 色索引格式色带+文字发糊（格式天花板）→ 用户拍板真录屏 → README <video>（坑 26：手动动画容器均被拒）
// 用法：NF_TEST_KEY=<key> node nf-gif-rec-v3.mjs（需「屏幕录制」权限——已开通）
// 产物：demo/neonforge-demo.mov（H.264，Retina 2x 物理像素——高清）
// 前提：dev server :5173 在跑（VITE_DEV_SERVER_URL）；临时依赖 pngjs/gifenc 仅 v2 用，v3 不依赖
import { _electron } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const KEY = process.env.NF_TEST_KEY
if (!KEY) { console.error('缺少 NF_TEST_KEY'); process.exit(1) }

const OUT = path.resolve('/Volumes/NinjaSin/myself/neonforge/demo/neonforge-demo.mov')
// 窗口固定位置（避菜单栏/Dock）：1200x800 内容区（含标题栏）
const WIN = { x: 120, y: 80, w: 1200, h: 800 }
const TMP = '/tmp/nf-gif-frames'
fs.mkdirSync(TMP, { recursive: true })

// 录制前清理 userData（坑 23 目录）：
// ① Local Storage——清对话会话存档（sessionStore 持久化——避免旧会话消息入镜）
// ② config——清 Key 缓存（录制需从首次配置第一屏开始——用本次临时 Key 填，录后清理）
const UD = path.join(process.env.HOME, 'Library/Application Support/neonforge-desktop')
for (const p of [path.join(UD, 'Local Storage'), path.join(UD, 'config')]) {
  fs.rmSync(p, { recursive: true, force: true })
}
console.log('已清理 userData 会话存档 + Key 缓存（干净首启）')

const app = await _electron.launch({
  args: ['.'],
  cwd: '/Volumes/NinjaSin/myself/neonforge/apps/desktop',
  env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173', NF_TEST_PROJECT: '/tmp/nf-gif-demo' }
})
const win = await app.firstWindow()
await win.waitForSelector('.nf-app', { timeout: 20000 })
// 固定窗口尺寸 + 位置 + 置顶（录屏区域 = 窗口 bounds）
// 注意：必须先等 firstWindow（main 的 createWindow 在 whenReady 后异步——launch 返回时窗口可能未建，直接 evaluate 会 undefined）
await app.evaluate(({ BrowserWindow }, rect) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setSize(rect.w, rect.h)
  w.setPosition(rect.x, rect.y)
  w.moveTop()
  w.focus()
}, WIN)
await win.waitForTimeout(300) // 窗口几何生效（页面重新布局）

// 启动录屏（后台进程——screencapture -v 交互式，SIGINT 正常收尾落盘）
// 安全：ConfigPage 输入框 type=password——填 Key 显示圆点掩码，Key 明文不入镜（脱敏）
console.log('开始录屏 →', OUT)
// 2026-08-04 修复：screencapture -v 对已存在文件不覆盖（静默跳过）——录前必删旧产物，否则误报成功
fs.rmSync(OUT, { force: true })
const rec = spawn('screencapture', ['-v', '-R', `${WIN.x},${WIN.y},${WIN.w},${WIN.h}`, OUT])
rec.on('error', (e) => console.error('录屏启动失败', e.message))

// 首次启动：config 页（首次安装第一屏——输 Key，password 掩码入镜安全）→ 填 Key → 验证
await win.waitForSelector('.nf-config', { timeout: 12000 }).catch(() => console.log('no config (cached key)'))
if (await win.locator('.nf-config').count() > 0) {
  await win.waitForTimeout(700) // config 屏入镜（第一屏）
  console.log('[rec] 首次配置页')
  await win.locator('.nf-config__input').fill(KEY)
  await win.waitForTimeout(500) // 掩码输入入镜
  await win.locator('.nf-config__cta').click()
  await win.waitForSelector('.nf-start', { timeout: 30000 })
  console.log('Key 验证通过 → 启动页')
}
await win.waitForSelector('.nf-start')

await win.waitForTimeout(900) // 首帧停留（品牌入镜）
console.log('[rec] 启动页')

await win.getByRole('button', { name: '打开已有项目' }).click()
await win.waitForSelector('.nf-chat__input textarea', { timeout: 15000 })
await win.waitForTimeout(900)
console.log('[rec] 工作区')

// 错误检测 + 重发：一轮对话直到成功（无错误消息）或超时（同 v2）
// 2026-08-03 修正：用应用确定错误文案（finishError/empty-response 固定句）——模型回复可能含「再试一次/不可用」等词导致误报重发
const ERROR_TEXTS = ['API Key 好像失效了', '服务暂时不可用', '刚才出错了', '搭档没有返回内容']
async function sendAndRecord(question, maxMs) {
  const start = Date.now()
  let attempts = 0
  while (Date.now() - start < maxMs && attempts < 3) {
    await win.locator('.nf-chat__input textarea').fill(question)
    await win.locator('.nf-chat__input textarea').press('Enter')
    await win.waitForTimeout(300)
    const roundStart = Date.now()
    while (Date.now() - roundStart < 45000) {
      const status = await win.locator('.nf-statusbar').innerText().catch(() => '')
      if (status.includes('就绪')) {
        const bodyText = await win.locator('.nf-chat').innerText().catch(() => '')
        const hasError = ERROR_TEXTS.some((t) => bodyText.includes(t))
        if (hasError) {
          console.log('检测到错误消息，重发（attempt ' + (attempts + 1) + '）')
          attempts++
          break
        }
        await win.waitForTimeout(800) // 回复停留
        return true
      }
      await win.waitForTimeout(200)
    }
  }
  return false
}

console.log('第一轮：问我看看 package.json 有哪些依赖')
await sendAndRecord('帮我看看 package.json 有哪些依赖', 90000)
console.log('第二轮：那 src 目录结构呢')
await sendAndRecord('那 src 目录结构呢', 90000)

await win.waitForTimeout(1000) // 尾帧停留
// 停录屏（SIGINT 正常收尾 → mov 落盘）
rec.kill('SIGINT')
await new Promise((r) => setTimeout(r, 2500))
await app.close()
// 2026-08-04 修复：产物校验——不存在或 0 字节 = 录制失败（防静默失败误报成功）
const st = fs.existsSync(OUT) ? fs.statSync(OUT) : null
if (!st || st.size === 0) {
  console.error('录屏失败：产物未生成（检查屏幕录制权限 / screencapture 错误）')
  process.exit(1)
}
console.log('录屏结束，产物:', OUT, (st.size / 1024 / 1024).toFixed(1) + 'MB')
console.log('清 Key 缓存（坑 23）: rm -f ~/Library/Application Support/neonforge-desktop/config')
