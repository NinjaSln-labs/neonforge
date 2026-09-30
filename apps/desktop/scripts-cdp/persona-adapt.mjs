/** schema PersonaSpec → autopilot 所需运行时对象 */
import { normalizePersona } from './persona-schema.mjs'
import { resolveVoice, taskTextForShell, taskHintsForShell } from './persona-voices.mjs'

const DELAY = {
  fast: [200, 1000],
  normal: [2000, 4000],
  slow: [8000, 20000],
}

/**
 * @param {import('./persona-schema.mjs').PersonaSpec} raw
 */
export function toAutopilotPersona(raw) {
  const p = normalizePersona(raw)
  const voice = resolveVoice(p.voice, { rejectKind: p.rejectKind, anxiety: p.anxiety })
  const channel = p.channelBias === 'button' ? 'button' : p.channelBias === 'both' ? 'both' : 'type'

  return {
    id: p.id,
    label: voice.label,
    spec: p,
    delay: DELAY[p.tempo] || DELAY.normal,
    channel,
    rejectPlan: p.rejectPlan ?? 0,
    interrupt: p.interrupt ?? 0,
    interruptLines: voice.interruptLines,
    replies: voice.replies,
    webAsk: p.capabilityNeed === 'needs_web',
    scopeAsk: p.scopeCreep === 'after_plan',
    boundary: p.boundaryProbe === 'ssh_sysprompt',
    approvalPolicy: p.approvalPolicy,
    closeAttitude: p.closeAttitude,
    trustMemory: p.trustMemory,
    clarifyPatience: p.clarifyPatience,
    pollMs: p.tempo === 'fast' ? 2500 : p.tempo === 'slow' ? 8000 : 5000,
    maxRounds: 80,
    task: taskTextForShell(p.taskShell),
    taskHints: taskHintsForShell(p.taskShell),
    __planRejects: 0,
    __interrupts: 0,
    __approvalAsked: false,
    __approvalRefused: false,
    __closeMoreSent: false,
  }
}
