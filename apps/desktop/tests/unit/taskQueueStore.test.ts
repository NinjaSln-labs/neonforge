import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { TaskQueueStore } from '../../src/main/taskQueueStore'

const TMP = '/tmp/nf-unit-queue'

describe('TaskQueueStore（BC-11 持久化）', () => {
  let store: TaskQueueStore
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
    store = new TaskQueueStore(path.join(TMP, 'queue.json'))
  })
  afterEach(() => rmSync(TMP, { recursive: true, force: true }))

  it('enqueue/start/list：跨实例恢复；单活跃', () => {
    store.enqueue('s1', '任务一')
    store.enqueue('s1', '任务二')
    expect(store.list('s1').entries).toHaveLength(2)
    const started = store.start('s1', store.list('s1').entries[0].id)
    expect(started.entries[0].status).toBe('running')
    expect(() => store.start('s1', started.entries[1].id)).toThrow(/运行/)
    const reopened = new TaskQueueStore(path.join(TMP, 'queue.json'))
    expect(reopened.list('s1').entries[0].status).toBe('running')
  })

  it('block/resume/complete：阻塞原因与终态', () => {
    store.enqueue('s1', '任务')
    const id = store.list('s1').entries[0].id
    store.start('s1', id)
    store.block('s1', id, '等待授权')
    expect(store.list('s1').entries[0].blockReason).toBe('等待授权')
    store.resume('s1', id)
    expect(store.list('s1').entries[0].status).toBe('running')
    store.complete('s1', id)
    expect(store.list('s1').entries[0].status).toBe('completed')
  })

  it('cancel/clear：取消终态；clear 移除会话', () => {
    store.enqueue('s1', '任务')
    const id = store.list('s1').entries[0].id
    store.cancel('s1', id)
    expect(store.list('s1').entries[0].status).toBe('cancelled')
    store.clear('s1')
    expect(store.list('s1').entries).toHaveLength(0)
  })
})
