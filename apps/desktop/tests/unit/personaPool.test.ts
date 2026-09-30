import { describe, it, expect } from 'vitest'
import {
  normalizePersona,
  fingerprint,
  assertProfile,
  validatePersona,
  checkPool,
  stratifiedCoverageOk,
} from '../../scripts-cdp/persona-schema.mjs'
import { resolveVoice, taskTextForShell } from '../../scripts-cdp/persona-voices.mjs'
import { toAutopilotPersona } from '../../scripts-cdp/persona-adapt.mjs'

const base = {
  id: 't1',
  label: 't',
  decisionPolicy: 'instant_confirm',
  approvalPolicy: 'allow',
  tempo: 'normal',
  intentQuality: 'clear',
  closeAttitude: 'accept_fast',
  boundaryProbe: 'none',
  capabilityNeed: 'local_only',
  channelBias: 'type',
  rejectKind: 'none',
  scopeCreep: 'none',
  literacy: 'nontech',
  anxiety: 'none',
  clarifyPatience: 'normal',
  trustMemory: 'session_default',
  voice: 'neutral',
}

describe('persona-schema', () => {
  it('normalize instant_confirm 清零 reject', () => {
    const p = normalizePersona({ ...base, rejectPlan: 2, rejectKind: 'direction' })
    expect(p.rejectPlan).toBe(0)
    expect(p.rejectKind).toBe('none')
  })

  it('reject_then_confirm normalize 补齐 reject', () => {
    const p = normalizePersona({
      ...base,
      decisionPolicy: 'reject_then_confirm',
      rejectKind: 'none',
      rejectPlan: 0,
    })
    expect(p.rejectPlan).toBe(2)
    expect(p.rejectKind).toBe('direction')
  })

  it('validatePersona reject_then_confirm 未补齐时报错', () => {
    const errs = validatePersona({
      ...base,
      decisionPolicy: 'reject_then_confirm',
      rejectKind: 'none',
      rejectPlan: 0,
    })
    expect(errs.some((e) => e.includes('reject'))).toBe(true)
  })

  it('boundary 与 scopeCreep 互斥', () => {
    const errs = validatePersona({
      ...base,
      boundaryProbe: 'ssh_sysprompt',
      scopeCreep: 'after_plan',
    })
    expect(errs.some((e) => e.includes('互斥'))).toBe(true)
  })

  it('fingerprint 稳定', () => {
    const p = normalizePersona(base)
    expect(fingerprint(p)).toBe(fingerprint(normalizePersona(base)))
  })

  it('assertProfile web/boundary/reject tags', () => {
    const web = assertProfile(normalizePersona({ ...base, capabilityNeed: 'needs_web', id: 'w' }))
    expect(web.tags).toContain('web')
    expect(web.require.webToolUsed).toBe(true)

    const b = assertProfile(
      normalizePersona({
        ...base,
        boundaryProbe: 'ssh_sysprompt',
        capabilityNeed: 'local_only',
        id: 'b',
      }),
    )
    expect(b.tags).toContain('boundary')

    const r = assertProfile(
      normalizePersona({
        ...base,
        decisionPolicy: 'reject_then_confirm',
        rejectKind: 'scope',
        rejectPlan: 2,
        id: 'r',
      }),
    )
    expect(r.require.planRejectsAtLeast).toBe(2)
  })

  it('stratifiedCoverageOk', () => {
    const batch = [
      normalizePersona({
        ...base,
        id: '1',
        decisionPolicy: 'reject_then_confirm',
        rejectKind: 'direction',
        rejectPlan: 2,
      }),
      normalizePersona({ ...base, id: '2', approvalPolicy: 'ask_what' }),
      normalizePersona({ ...base, id: '3', tempo: 'fast', interrupt: 4, voice: 'impatient' }),
      normalizePersona({ ...base, id: '4', intentQuality: 'vague' }),
      normalizePersona({ ...base, id: '5', closeAttitude: 'want_more' }),
      normalizePersona({
        ...base,
        id: '6',
        boundaryProbe: 'ssh_sysprompt',
        capabilityNeed: 'local_only',
      }),
      normalizePersona({ ...base, id: '7', capabilityNeed: 'needs_web' }),
    ]
    expect(stratifiedCoverageOk(batch)).toBe(true)
    expect(stratifiedCoverageOk(batch.slice(0, 3))).toBe(false)
  })

  it('checkPool 撞指纹报错', () => {
    const a = normalizePersona({ ...base, id: 'a' })
    const b = normalizePersona({ ...base, id: 'b' })
    const r = checkPool([a, b])
    expect(r.ok).toBe(false)
    expect(r.errs.some((e) => e.includes('collision'))).toBe(true)
  })
})

describe('persona-voices', () => {
  it('resolveVoice + rejectKind 改 plan 文案', () => {
    const v = resolveVoice('neutral', { rejectKind: 'complexity' })
    expect(v.replies.plan).toMatch(/简单/)
  })
  it('taskTextForShell portfolio', () => {
    expect(taskTextForShell('portfolio-web')).toMatch(/作品集/)
  })
})

describe('persona-adapt', () => {
  it('maps tempo/fast → interrupt+delay', () => {
    const ap = toAutopilotPersona(
      normalizePersona({ ...base, tempo: 'fast', voice: 'impatient', id: 'f' }),
    )
    expect(ap.interrupt).toBeGreaterThanOrEqual(4)
    expect(ap.delay[1]).toBeLessThanOrEqual(1500)
    expect(ap.pollMs).toBe(2500)
  })
  it('maps web + boundary flags', () => {
    const w = toAutopilotPersona(
      normalizePersona({ ...base, capabilityNeed: 'needs_web', id: 'w' }),
    )
    expect(w.webAsk).toBe(true)
    expect(w.task).toMatch(/作品集/)
    const b = toAutopilotPersona(
      normalizePersona({
        ...base,
        boundaryProbe: 'ssh_sysprompt',
        capabilityNeed: 'local_only',
        id: 'b',
      }),
    )
    expect(b.boundary).toBe(true)
  })
})
