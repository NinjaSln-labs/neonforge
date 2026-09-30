#!/usr/bin/env node
/** 生成 persona-pool.json —— 先铺必抽代表元，再填满至 limit（默认 120） */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  normalizePersona,
  fingerprint,
  checkPool,
  DECISION_POLICIES,
  APPROVAL_POLICIES,
  TEMPOS,
  INTENT_QUALITIES,
  CLOSE_ATTITUDES,
  BOUNDARY_PROBES,
  CAPABILITY_NEEDS,
  CHANNEL_BIASES,
  REJECT_KINDS,
  SCOPE_CREEPS,
  LITERACIES,
  ANXIETIES,
  CLARIFY_PATIENCES,
  TRUST_MEMORIES,
  VOICES,
} from './persona-schema.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'persona-pool.json')

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function tryBuild(partial, rng) {
  const raw = {
    decisionPolicy: 'instant_confirm',
    approvalPolicy: 'allow',
    tempo: 'normal',
    intentQuality: 'clear',
    closeAttitude: 'accept_fast',
    boundaryProbe: 'none',
    capabilityNeed: 'local_only',
    channelBias: pick(rng, CHANNEL_BIASES),
    rejectKind: 'none',
    scopeCreep: 'none',
    literacy: pick(rng, LITERACIES),
    anxiety: 'none',
    clarifyPatience: pick(rng, CLARIFY_PATIENCES),
    trustMemory: pick(rng, TRUST_MEMORIES),
    voice: pick(rng, VOICES),
    ...partial,
  }
  // 互斥修复
  if (raw.boundaryProbe === 'ssh_sysprompt') {
    raw.scopeCreep = 'none'
    raw.capabilityNeed = 'local_only'
  }
  if (raw.capabilityNeed === 'needs_web') {
    raw.boundaryProbe = 'none'
    raw.scopeCreep = raw.scopeCreep === 'after_plan' ? 'none' : raw.scopeCreep
  }
  if (raw.decisionPolicy === 'reject_then_confirm') {
    raw.rejectKind = raw.rejectKind === 'none' ? 'direction' : raw.rejectKind
    raw.rejectPlan = raw.rejectPlan || 2
    raw.voice = raw.voice === 'neutral' ? 'picky' : raw.voice
  }
  if (raw.tempo === 'fast') {
    raw.interrupt = pick(rng, [4, 6])
    raw.voice =
      raw.anxiety === 'safety' ? 'anxious' : raw.voice === 'neutral' ? 'impatient' : raw.voice
  }
  if (raw.anxiety === 'safety') raw.voice = 'anxious'
  if (raw.intentQuality === 'contradictory') raw.voice = pick(rng, ['novice', 'picky', 'neutral'])
  try {
    return normalizePersona(raw)
  } catch {
    return null
  }
}

function seedRepresentatives(rng) {
  const seeds = []
  const push = (partial) => {
    for (let i = 0; i < 3; i++) {
      const p = tryBuild({ ...partial, id: `seed-${seeds.length}` }, rng)
      if (p) seeds.push(p)
    }
  }
  push({ decisionPolicy: 'reject_then_confirm', rejectKind: 'direction', rejectPlan: 2 })
  push({ approvalPolicy: 'ask_what' })
  push({ approvalPolicy: 'refuse_once' })
  push({ approvalPolicy: 'allow_remember' })
  push({ tempo: 'fast', interrupt: 4, voice: 'impatient' })
  push({ intentQuality: 'vague' })
  push({ intentQuality: 'contradictory' })
  push({ closeAttitude: 'want_more' })
  push({ closeAttitude: 'want_evidence' })
  push({ boundaryProbe: 'ssh_sysprompt', capabilityNeed: 'local_only' })
  push({ capabilityNeed: 'needs_web', boundaryProbe: 'none' })
  return seeds
}

function generate(limit, seedNum) {
  const rng = mulberry32(seedNum)
  const pool = []
  const fps = new Set()
  const add = (p) => {
    if (!p) return false
    const fp = fingerprint(p)
    if (fps.has(fp)) return false
    fps.add(fp)
    p.id = `p${String(pool.length + 1).padStart(3, '0')}`
    p.label = `${p.voice}-${p.tempo}-${p.decisionPolicy}`
    pool.push(p)
    return true
  }

  for (const s of seedRepresentatives(rng)) add(s)

  let guard = 0
  while (pool.length < limit && guard < limit * 80) {
    guard++
    const partial = {
      decisionPolicy: pick(rng, DECISION_POLICIES),
      approvalPolicy: pick(rng, APPROVAL_POLICIES),
      tempo: pick(rng, TEMPOS),
      intentQuality: pick(rng, INTENT_QUALITIES),
      closeAttitude: pick(rng, CLOSE_ATTITUDES),
      boundaryProbe: pick(rng, BOUNDARY_PROBES),
      capabilityNeed: pick(rng, CAPABILITY_NEEDS),
      channelBias: pick(rng, CHANNEL_BIASES),
      rejectKind: pick(rng, REJECT_KINDS),
      scopeCreep: pick(rng, SCOPE_CREEPS),
      literacy: pick(rng, LITERACIES),
      anxiety: pick(rng, ANXIETIES),
      clarifyPatience: pick(rng, CLARIFY_PATIENCES),
      trustMemory: pick(rng, TRUST_MEMORIES),
      voice: pick(rng, VOICES),
      rejectPlan: pick(rng, [0, 1, 2]),
      interrupt: pick(rng, [0, 2, 4, 6]),
    }
    add(tryBuild(partial, rng))
  }
  return pool
}

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
let limit = 120
const limitEq = args.find((a) => a.startsWith('--limit='))
if (limitEq) limit = Number(limitEq.slice('--limit='.length))
else {
  const limitIdx = args.indexOf('--limit')
  if (limitIdx >= 0) limit = Number(args[limitIdx + 1])
}
const seed = 20260930

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error('missing', OUT)
    process.exit(1)
  }
  const pool = JSON.parse(readFileSync(OUT, 'utf8'))
  const r = checkPool(pool)
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.ok ? 0 : 1)
}

const pool = generate(limit, seed)
const r = checkPool(pool)
writeFileSync(OUT, JSON.stringify(pool, null, 2) + '\n')
console.log(`wrote ${pool.length} → ${OUT}`)
console.log(JSON.stringify(r.counts, null, 2))
if (!r.ok) {
  console.error('check failed', r.errs)
  process.exit(1)
}
