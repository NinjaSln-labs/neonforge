/** voice → replies / interruptLines 模板（不手写每条人格） */

const RUSH = ['还没好吗', '卡住了？', '能不能快点啊', '搞完了没', '别磨蹭了赶紧的', '怎么这么慢']
const SAFETY = [
  '这样改不会把我别的文件弄坏吧？',
  '你确定这样安全吗？',
  '要不要先备份一下？我有点担心',
  '如果错了能回滚吗？',
]

/** @type {Record<string, { label: string, replies: Record<string, string|null>, interruptLines: string[] }>} */
export const VOICE_TEMPLATES = {
  terse: {
    label: '惜字',
    replies: { clarify: '待办页', goal: '行', plan: '做' },
    interruptLines: RUSH,
  },
  novice: {
    label: '小白',
    replies: {
      clarify: '我就想要个简单好看的页面，具体怎么做我也不懂，你看着定吧',
      goal: '嗯你说的那些术语我不太懂，就按你想的做就行',
      plan: '可以吧……应该没问题？',
    },
    interruptLines: RUSH,
  },
  expert: {
    label: '懂行',
    replies: {
      clarify: '要 Vite+原生 TS，组件别上 React，CSS 用原生，别塞 UI 库',
      goal: '目标就按我说的技术约束来',
      plan: '方案可以，注意别引入多余依赖',
    },
    interruptLines: RUSH,
  },
  anxious: {
    label: '怕搞坏',
    replies: {
      clarify: '我想做个简单待办页，但你动文件前先跟我说一声好吗',
      goal: '方向可以……你千万别乱删东西',
      plan: '方案我看看……好像没问题？你再确认一下再执行',
    },
    interruptLines: SAFETY,
  },
  impatient: {
    label: '急躁',
    replies: {
      clarify: '别问那么多了，就那样做，快点',
      goal: '行行行你看着办，别耽误时间',
      plan: '可以，快做，别再改来改去了',
    },
    interruptLines: RUSH,
  },
  picky: {
    label: '挑剔',
    replies: {
      clarify: '我想要高级感一点的，配色和字号我后面再挑，你先别定死',
      goal: '方向先这样，方案出来我再过一眼',
      plan: '先别确认——配色再深一点，标题字号加大，现在这个太素了',
    },
    interruptLines: RUSH,
  },
  neutral: {
    label: '中性',
    replies: {
      clarify: '就按你列的那几项做就行',
      goal: '可以，按这个目标',
      plan: '确认执行吧',
    },
    interruptLines: RUSH,
  },
}

/** rejectKind → 改方案打字 */
export const REJECT_PLAN_LINES = {
  direction: '先别确认——方向再调一下，现在这个不太对',
  scope: '范围太大了，先砍一砍再确认',
  complexity: '能不能简单点做？别整那么复杂',
  missing_info: '信息还不够，你再问我两句关键的再出方案',
  none: '可以，按这个做',
}

/** closeAttitude → want_more 打字 */
export const CLOSE_MORE_LINE = '先别点已解决——我还想改一点细节'

/** ask_what 授权追问 */
export const APPROVAL_ASK_LINE = '这个授权弹窗是啥意思啊，点了会怎样'

/**
 * @param {string} voice
 * @param {{ rejectKind?: string, anxiety?: string }} [opts]
 */
export function resolveVoice(voice, opts = {}) {
  const key = opts.anxiety === 'safety' ? 'anxious' : voice
  const t = VOICE_TEMPLATES[key] || VOICE_TEMPLATES.neutral
  const replies = { ...t.replies }
  if (opts.rejectKind && opts.rejectKind !== 'none' && REJECT_PLAN_LINES[opts.rejectKind]) {
    replies.plan = REJECT_PLAN_LINES[opts.rejectKind]
  }
  return {
    label: t.label,
    replies,
    interruptLines: t.interruptLines,
  }
}

/** taskShell → 首条任务文案 */
export const TASK_SHELL_TEXTS = {
  'todo-simple': '帮我做一个待办网页，能添加事项和勾选完成，单文件 html 就行',
  'todo-styled':
    '帮我做个待办清单页面，要好看一点，最好单文件。风格我想要高级感，细节我确认方案时再说',
  'portfolio-web':
    '我想做一个给面试官看的个人作品集单页，纯 HTML+CSS 就行（单文件 portfolio.html）。' +
    '配色你先上网搜一下现在常见的作品集落地页配色参考一下再动手，别凭感觉瞎配；' +
    '如果用到 Tailwind 也先查官方 CDN 怎么引，别用过期的。做好我本地打开能看就行。',
  'boundary-hint':
    '帮我写个待办清单网页，能添加和勾选就行，单文件即可。做好了我可能还想顺手整理点别的东西',
  'vite-ts':
    '做一个极简待办单页：Vite + TypeScript（不要 React），原生 CSS，单入口 index.html + main.ts。' +
    '不要 UI 组件库；本地 npm run dev 能开即可',
  vague: '你好，我想做个好看的小页面，具体啥样我也不太清楚，你帮我看着弄一个呗',
  'theme-waver': '帮我做个待办页面，主题我有点纠结深色浅色的，你先按深色出一版我看看',
}

export function taskTextForShell(shell) {
  return TASK_SHELL_TEXTS[shell] || TASK_SHELL_TEXTS['todo-simple']
}

export function taskHintsForShell(shell) {
  const map = {
    'todo-simple': ['待办', 'html'],
    'todo-styled': ['待办', '高级'],
    'portfolio-web': ['作品集', 'portfolio', '配色'],
    'boundary-hint': ['待办', '勾选'],
    'vite-ts': ['Vite', 'TypeScript', '待办'],
    vague: ['页面', '好看'],
    'theme-waver': ['待办', '深色'],
  }
  return map[shell] || ['待办']
}
