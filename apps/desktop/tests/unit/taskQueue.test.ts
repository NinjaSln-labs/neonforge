import { describe, it, expect } from 'vitest'
import {
  emptyQueue,
  enqueueTask,
  startTask,
  blockTask,
  resumeTask,
  completeTask,
  failTask,
  cancelTask,
  reorderTask,
  activeTask,
} from '../../src/domain/taskQueue'

const at = '2026-11-14T00:00:00.000Z'

function q() {
  return emptyQueue()
}

describe('TaskQueue（BC-11）', () => {
  it('enqueue：排队、位置稳定；同 taskRef 不重复', () => {
    let s = enqueueTask(q(), { id: 'e1', taskRef: 't1', title: '任务一' }, at)
    s = enqueueTask(s, { id: 'e2', taskRef: 't2', title: '任务二' }, at)
    expect(s.entries.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(enqueueTask(s, { id: 'e3', taskRef: 't1', title: '重复' }, at).entries).toHaveLength(2)
  })

  it('start：每工作区单活跃；已有运行任务 → 拒绝', () => {
    let s = enqueueTask(q(), { id: 'e1', taskRef: 't1', title: '一' }, at)
    s = enqueueTask(s, { id: 'e2', taskRef: 't2', title: '二' }, at)
    s = startTask(s, 'e1', at)
    expect(activeTask(s)?.id).toBe('e1')
    expect(() => startTask(s, 'e2', at)).toThrow(/运行/)
  })

  it('blocked/resume：只在 running ↔ blocked 之间转换', () => {
    let s = startTask(enqueueTask(q(), { id: 'e1', taskRef: 't1', title: '一' }, at), 'e1', at)
    s = blockTask(s, 'e1', '等待授权', at)
    expect(s.entries[0].status).toBe('blocked')
    s = resumeTask(s, 'e1', at)
    expect(s.entries[0].status).toBe('running')
    expect(() => resumeTask(s, 'e1', at)).toThrow(/阻塞/)
  })

  it('complete/fail/cancel：终态；取消不破坏队列顺序', () => {
    let s = startTask(enqueueTask(q(), { id: 'e1', taskRef: 't1', title: '一' }, at), 'e1', at)
    s = completeTask(s, 'e1', at)
    expect(s.entries[0].status).toBe('completed')
    expect(activeTask(s)).toBeNull()
    let s2 = startTask(enqueueTask(q(), { id: 'e2', taskRef: 't2', title: '二' }, at), 'e2', at)
    s2 = failTask(s2, 'e2', '失败', at)
    expect(s2.entries[0].status).toBe('failed')
    let s3 = enqueueTask(q(), { id: 'e3', taskRef: 't3', title: '三' }, at)
    s3 = cancelTask(s3, 'e3', at)
    expect(s3.entries[0].status).toBe('cancelled')
  })

  it('reorder：显式重排；不能重排运行/终态项', () => {
    let s = enqueueTask(q(), { id: 'e1', taskRef: 't1', title: '一' }, at)
    s = enqueueTask(s, { id: 'e2', taskRef: 't2', title: '二' }, at)
    s = reorderTask(s, 'e2', 0, at)
    expect(s.entries.map((e) => e.id)).toEqual(['e2', 'e1'])
    s = startTask(s, 'e2', at)
    expect(() => reorderTask(s, 'e2', 1, at)).toThrow(/排队/)
  })
})
