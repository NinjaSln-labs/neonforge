import { describe, it, expect } from 'vitest'
import { shouldQueueWhileBusy } from '../../src/renderer/busyGate'

describe('shouldQueueWhileBusy (ADR-013)', () => {
  it('busy + silent → queue', () => {
    expect(shouldQueueWhileBusy({ working: true, silent: true, pending: 'none' })).toBe(true)
  })
  it('busy + user → queue', () => {
    expect(shouldQueueWhileBusy({ working: true, silent: false, pending: 'none' })).toBe(true)
  })
  it('busy + user + approval pending → 不排队（直送例外）', () => {
    expect(shouldQueueWhileBusy({ working: true, silent: false, pending: 'approval' })).toBe(false)
  })
  it('busy + silent + approval → 仍排队（silent 不走授权直送）', () => {
    expect(shouldQueueWhileBusy({ working: true, silent: true, pending: 'approval' })).toBe(true)
  })
  it('not working → 不排队', () => {
    expect(shouldQueueWhileBusy({ working: false, silent: true, pending: 'none' })).toBe(false)
  })
})
