// e2e 模拟器域：决策策略（设计 §3——信号 × 旅程 × 画像 → 用户决策）
// 收编原 UserAgent.decide/classify/matchOption/typeAnswer/verifyEcho（e2e-0to1.mjs）——
// 问题分类/画像匹配/答案映射 = 领域规则，归领域层；纯函数——L1 可测
// LLM 增强（自由文本意图）在应用层注入——本模块为确定性兜底与主路径

import { Signal } from './signals.mjs'

// —— 标准 4 问（需求澄清域——Q 值对象演进） ——
export const Question = {
  WHAT: '做什么',
  AUDIENCE: '给谁玩',
  PLATFORM: '在哪儿玩',
  DONE: '做成什么样',
  UNKNOWN: '?',
}

/** 问题分类（领域规则——DONE 强特征优先：「做成什么样算完成」含「网页上玩」会误判 PLATFORM） */
export function classifyQuestion(content = '') {
  const c = content
  if (/(做成什么样|算完成|算完|做到哪|完成标准|做完|什么时候算|做到什么程度)/.test(c))
    return Question.DONE
  if (/(给谁玩|谁玩|面向|玩家|对象)/.test(c)) return Question.AUDIENCE
  if (/(在哪|哪儿玩|平台|网页|电脑|手机|浏览器|运行|设备)/.test(c)) return Question.PLATFORM
  if (/(设计|意思|理解|指什么|哪个意思|什么游戏|哪种|哪一档)/.test(c)) return Question.WHAT
  if (/(完成|满意|程度|标准|需求|够)/.test(c)) return Question.DONE
  return Question.UNKNOWN
}

/** 画像是否 4 问齐（核心需求完整——附加问题可放权收敛） */
export function profileComplete(profile) {
  return !!(
    profile[Question.WHAT] &&
    profile[Question.AUDIENCE] &&
    profile[Question.PLATFORM] &&
    profile[Question.DONE]
  )
}

/** 候选选项匹配（画像意图——同音泛化选「射击」，其余贴合画像） */
export function matchOption(question, options) {
  const clean = options.map((o) =>
    String(o)
      .replace(/^[①-⑩]\s*\n?\s*/, '')
      .trim(),
  )
  const patterns = {
    [Question.WHAT]: /射击/,
    [Question.AUDIENCE]: /大众|普通|随便谁|自己|单人|朋友/,
    [Question.PLATFORM]: /网页|浏览器/,
    [Question.DONE]: /简单|能玩|先|基础|够|开局/,
  }
  const pat = patterns[question]
  if (!pat) return -1
  return clean.findIndex((o) => pat.test(o))
}

/** 选择该选项的含义（供打印——真人知道自己为什么选这个） */
export function understandOption(question, text) {
  const t = text.slice(0, 12)
  const map = {
    [Question.WHAT]: {
      understanding: '这是「做什么」——我本意是射击游戏（设计≈射击，打字谐音）',
      reason: `选「${t}」——射击符合我的本意`,
    },
    [Question.AUDIENCE]: {
      understanding: '这是「给谁玩」——选择目标玩家',
      reason: `选「${t}」——贴合我的场景`,
    },
    [Question.PLATFORM]: {
      understanding: '这是「在哪儿玩」——选择运行平台',
      reason: `选「${t}」——网页最方便`,
    },
    [Question.DONE]: {
      understanding: '这是「做成什么样算完」——选择完成标准',
      reason: `选「${t}」——先跑起来就行`,
    },
  }
  return map[question] ?? { understanding: '选择该项', reason: `选「${t}」` }
}

/** 无候选时打字回答（画像答案映射） */
export function typeAnswer(question) {
  if (question === Question.WHAT) return '射击游戏'
  if (question === Question.AUDIENCE) return '随便谁都能玩，简单易上手'
  if (question === Question.PLATFORM) return '在网页浏览器里玩，打开就能玩'
  if (question === Question.DONE) return '能玩就行——能开枪打中、有得分，界面简单'
  return ''
}

/**
 * 决策策略（确定性主路径）——信号 × 上下文 → 用户决策
 * @param {string} signal Signal 常量
 * @param {{ content?: string, candidates?: string[], profile?: Record<string,string> }} ctx
 * @returns {{ action: string, text?: string, understanding: string, reason: string, question?: string, profilePatch?: Record<string,string> }}
 */
export function decide(signal, { content = '', candidates = [], profile = {} } = {}) {
  const c = content
  // —— 决策点提议 → 确认卡动作 ——
  if (signal === Signal.GOAL_PROPOSED) {
    return {
      action: 'confirm-goal',
      understanding: '模型提议目标——点「确认目标」',
      reason: '目标确认 = 需求收敛（无阶段语义）',
    }
  }
  if (signal === Signal.PLAN_PROPOSED) {
    return {
      action: 'confirm-plan',
      understanding: '模型输出方案——点「确认执行」',
      reason: '方案确认 = 进入执行',
    }
  }
  if (signal === Signal.COMPLETION_CLAIMED) {
    return {
      action: 'confirm-resolution',
      understanding: '模型声明完成——确认解决',
      reason: '解决确认（交付≠解决——以确认关闭为准）',
    }
  }
  if (signal === Signal.APPROVAL_REQUESTED) {
    return { action: 'approve', understanding: '授权待批——批准', reason: '批量授权/授权卡批准' }
  }
  if (signal === Signal.PROMISING) {
    return {
      action: 'nudge',
      understanding: '模型说要做但没动手',
      reason: '回复「继续」让它接着干',
    }
  }
  if (signal === Signal.INVITING_TEST) {
    return {
      action: 'playtest-feedback',
      understanding: '模型给地址让我试玩',
      reason: '打开验证——真实 HTTP',
    }
  }
  // —— 澄清（候选/提问/4 问） ——
  if (signal === Signal.CLARIFYING || signal === Signal.ASKING_DECISION) {
    // 候选块 → 语义匹配选择
    if (candidates.length > 0) {
      const qClass = classifyQuestion(c)
      const idx = matchOption(qClass, candidates)
      if (idx >= 0) {
        const text = candidates[idx].replace(/^[①-⑩]\s*\n?\s*/, '').trim()
        const u = understandOption(qClass, text)
        return {
          action: 'choose',
          text,
          understanding: u.understanding,
          reason: u.reason,
          question: qClass,
          profilePatch: { [qClass]: text },
        }
      }
      // 附加问题（非标准 4 问）：核心已问全 → 放权收敛；否则兜底选第一个
      if (profileComplete(profile)) {
        return {
          action: 'answer',
          text: '都行，你按合适的来',
          understanding: '附加问题（核心 4 问已确认完）',
          reason: '放权给模型决定——让它收敛到需求确认',
        }
      }
      const text = candidates[0].replace(/^[①-⑩]\s*\n?\s*/, '').trim()
      return {
        action: 'choose',
        text,
        understanding: '附加问题（核心 4 问未问全）',
        reason: `先选第一个：${text.slice(0, 15)}`,
        question: qClass,
        profilePatch: { [qClass]: text },
      }
    }
    // 无候选——模型确认方案方向（不答非所问——A7 教训）
    if (
      /(没意见|可以吗|行吗|好不好|按这个|按常规定|方向.*吗|这样.*吗|同意|没问题吧|你看行|你看怎么样|按你说的)/.test(
        c,
      ) &&
      /[?？]|吧|吗/.test(c)
    ) {
      return {
        action: 'answer',
        text: 'OK，按你这个方向来，没问题——还有要确认的吗？没有就确认需求吧',
        understanding: '模型在确认方案方向',
        reason: '真实用户确认方向并推动收敛',
      }
    }
    // 无候选但模型在问（4 问分类）→ 打字回答
    const qClass = classifyQuestion(c)
    if (qClass !== Question.UNKNOWN) {
      const answer = typeAnswer(qClass)
      if (answer) {
        return {
          action: 'answer',
          text: answer,
          understanding: `模型在问「${qClass}」`,
          reason: `打字回答：${answer.slice(0, 15)}`,
          question: qClass,
          profilePatch: { [qClass]: answer },
        }
      }
    }
    return {
      action: 'answer',
      text: '好的，继续',
      understanding: '模型提问但未归类——口语回应',
      reason: '推动对话',
    }
  }
  // —— 探索/产出/陈述 ——
  return { action: 'wait', understanding: '模型在推进/陈述', reason: '暂不需要我操作——等它下一步' }
}

/** 验证模型是否复述了用户选择（语义核心词命中——防假阳性） */
export function verifyGoalEcho(reply, chosenText) {
  if (!chosenText) return true
  const sem =
    chosenText.match(
      /(射击|解谜|建造|网页|浏览器|大众|普通|随便|简单|能玩|单机|朋友|得分|自己|电脑|手机|闯关|对战|开枪|分数|打中|练手|学习|键盘|鼠标|调试|关卡|怪)/g,
    ) ?? []
  const phrases = chosenText.match(/[^：:、\-—()（）\s]{2,8}/g) ?? []
  const tests = [...new Set([...sem, ...phrases])]
  return tests.some((k) => k && reply.includes(k))
}
