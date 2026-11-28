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
    // 重启语义：running 不假装仍在运行——首次访问转 blocked，等用户恢复
    expect(reopened.list('s1').entries[0].status).toBe('blocked')
    expect(reopened.list('s1').entries[0].blockReason).toMatch(/重启/)
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

  it('cancel：取消终态', () => {
    store.enqueue('s1', '任务')
    const id = store.list('s1').entries[0].id
    store.cancel('s1', id)
    expect(store.list('s1').entries[0].status).toBe('cancelled')
    // 2026-11-28 审计（D-1）：clear 方法与其 IPC 通道已删（无 UI 消费方）
  })

  it('commit 回调：enqueue 的状态与事件同一事务', () => {
    const commits: Array<{ writes: Array<{ content: string }>; events: Array<{ type: string }> }> =
      []
    let emitted = 0
    const txStore = new TaskQueueStore(
      path.join(TMP, 'queue.json'),
      () => {
        emitted += 1
      },
      (writes, events) => {
        commits.push({ writes, events })
      },
    )
    txStore.enqueue('s1', '任务')
    expect(emitted).toBe(0)
    expect(commits).toHaveLength(1)
    expect(commits[0].writes[0].content).toContain('任务')
    expect(commits[0].events.map((e) => e.type)).toEqual(['queue.entry_enqueued'])
  })

  // 2026-11-25 事件语义补课：队列八类事件的载荷字段（entryId/taskRef/position/reason/outcome）
  // 与状态转换一一对应——消费方（探针/时间线审计）无需反推代码。
  it('事件载荷语义：入队位置、启动 taskRef、阻塞原因、恢复/暂停、完成 outcome、失败原因、取消、重排', () => {
    const events: Array<{ type: string; detail?: Record<string, unknown> }> = []
    const s = new TaskQueueStore(path.join(TMP, 'queue-events.json'), (e) =>
      events.push(e as never),
    )
    const e1 = s.enqueue('s1', '任务一', 'ref-1').entries[0]
    const e2 = s.enqueue('s1', '任务二', 'ref-2').entries[1]
    const e3 = s.enqueue('s1', '任务三', 'ref-3').entries[2]
    const e4 = s.enqueue('s1', '任务四', 'ref-4').entries[3]
    s.start('s1', e1.id)
    s.block('s1', e1.id, '等待授权')
    s.resume('s1', e1.id)
    s.pause('s1', e1.id)
    s.start('s1', e2.id)
    s.complete('s1', e2.id)
    s.cancel('s1', e3.id)
    s.start('s1', e4.id)
    s.cancel('s1', e4.id)
    s.reorder('s1', e1.id, 2)

    const detailOf = (type: string, nth = 0): Record<string, unknown> | undefined =>
      events.filter((e) => e.type === type)[nth]?.detail
    expect(detailOf('queue.entry_enqueued', 0)).toMatchObject({
      entryId: e1.id,
      taskRef: 'ref-1',
      position: 0,
    })
    expect(detailOf('queue.entry_enqueued', 1)).toMatchObject({
      entryId: e2.id,
      taskRef: 'ref-2',
      position: 1,
    })
    expect(detailOf('queue.entry_started', 0)).toMatchObject({ entryId: e1.id, taskRef: 'ref-1' })
    expect(detailOf('queue.entry_blocked')).toMatchObject({
      entryId: e1.id,
      reason: '等待授权',
    })
    expect(detailOf('queue.entry_resumed')).toMatchObject({ entryId: e1.id })
    expect(detailOf('queue.entry_paused')).toMatchObject({ entryId: e1.id })
    expect(detailOf('queue.entry_started', 1)).toMatchObject({ entryId: e2.id, taskRef: 'ref-2' })
    expect(detailOf('queue.entry_completed', 0)).toMatchObject({
      entryId: e2.id,
      outcome: 'completed',
    })
    expect(detailOf('queue.entry_cancelled')).toMatchObject({ entryId: e3.id })
    expect(detailOf('queue.entry_enqueued', 3)).toMatchObject({
      entryId: e4.id,
      taskRef: 'ref-4',
      position: 3,
    })
    expect(detailOf('queue.entry_started', 2)).toMatchObject({ entryId: e4.id, taskRef: 'ref-4' })
    // 2026-11-28 审计（D-1）：fail 已删（无 UI 消费方）——取消语义由 entry_cancelled 覆盖
    expect(detailOf('queue.entry_cancelled', 1)).toMatchObject({ entryId: e4.id })
    expect(detailOf('queue.entry_reordered')).toMatchObject({ entryId: e1.id, position: 2 })
  })
})
