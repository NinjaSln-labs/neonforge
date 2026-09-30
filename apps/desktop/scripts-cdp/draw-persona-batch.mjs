#!/usr/bin/env node
/** 种子分层抽 12 → /tmp/nf-uat-draw.json（或 --out） */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { assertProfile, stratifiedCoverageOk, normalizePersona } from './persona-schema.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POOL = join(__dirname, 'persona-pool.json')
const DEFAULT_OUT = '/tmp/nf-uat-draw.json'

function hashSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(rng, arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 分层：依次保证 7 条必抽规则各至少 1，再随机填满至 n */
function drawStratified(pool, n, rng) {
  const used = new Set()
  const batch = []
  const take = (pred) => {
    const candidates = shuffle(
      rng,
      pool.filter((p) => !used.has(p.id) && pred(p)),
    )
    if (!candidates.length) return null
    const p = candidates[0]
    used.add(p.id)
    batch.push(p)
    return p
  }

  take((p) => p.decisionPolicy === 'reject_then_confirm')
  take((p) => p.approvalPolicy !== 'allow')
  take((p) => p.tempo === 'fast')
  take((p) => p.intentQuality === 'vague' || p.intentQuality === 'contradictory')
  take((p) => p.closeAttitude !== 'accept_fast')
  take((p) => p.boundaryProbe === 'ssh_sysprompt')
  take((p) => p.capabilityNeed === 'needs_web')

  const rest = shuffle(
    rng,
    pool.filter((p) => !used.has(p.id)),
  )
  for (const p of rest) {
    if (batch.length >= n) break
    used.add(p.id)
    batch.push(p)
  }
  return batch.slice(0, n)
}

const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const outIdx = args.indexOf('--out')
const out = outIdx >= 0 ? args[outIdx + 1] : DEFAULT_OUT
const nIdx = args.indexOf('--n')
const n = nIdx >= 0 ? Number(args[nIdx + 1]) : 12

const seedStr = process.env.NF_UAT_SEED || new Date().toISOString().slice(0, 10).replace(/-/g, '')
const seedNum = hashSeed(String(seedStr))

if (!existsSync(POOL)) {
  console.error('missing', POOL)
  process.exit(1)
}
const pool = JSON.parse(readFileSync(POOL, 'utf8')).map((p) => normalizePersona(p))
const rng = mulberry32(seedNum)
const batch = drawStratified(pool, n, rng)
const ok = stratifiedCoverageOk(batch)

const payload = {
  seed: seedStr,
  seedNum,
  n: batch.length,
  stratifiedOk: ok,
  drawnAt: new Date().toISOString(),
  personas: batch.map((p) => {
    const { tags, require } = assertProfile(p)
    return {
      id: p.id,
      label: p.label,
      fingerprint: [
        p.decisionPolicy,
        p.approvalPolicy,
        p.tempo,
        p.intentQuality,
        p.closeAttitude,
        p.boundaryProbe,
        p.capabilityNeed,
        p.taskShell,
        p.voice,
      ].join('|'),
      tags,
      require,
    }
  }),
}

if (!ok) {
  console.error('stratified coverage FAILED', JSON.stringify(payload, null, 2))
  process.exit(1)
}

if (!dry) writeFileSync(out, JSON.stringify(payload, null, 2) + '\n')
console.log(
  dry
    ? `[dry-run] seed=${seedStr} n=${batch.length}`
    : `wrote ${batch.length} → ${out} seed=${seedStr}`,
)
for (const row of payload.personas) {
  console.log(`  ${row.id}\t${row.tags.join(',')}\t${row.label}`)
}
