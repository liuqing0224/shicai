import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, normalizeCandidatePayload } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('normalizeCandidatePayload', () => {
  it('maps backend status and report fields', () => {
    const dimensions = [{ id: 'skills', name: '专业能力', score: 8, weight: 0.6, requirements: ['React'], evidence: ['负责 React 项目'], gaps: [], risks: [], requirementMatches: [{ requirementId: 'skills_1', status: 'met' as const, evidence: ['负责 React 项目'], notes: '有直接证据' }] }]
    const candidate = normalizeCandidatePayload({ id: 42, name: '张然', positionId: 7, status: 'shortlisted', report: { score: 88, summary: '匹配度较高', recommendation: 'strong_yes', dimensions } })
    expect(candidate).toMatchObject({ id: '42', jobId: '7', status: 'passed', score: 88, recommendation: 'strong_yes', summary: '匹配度较高', dimensions })
  })

  it('queries candidates using the backend positionId parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)

    await api.candidates({ jobId: 'job-7', status: 'reviewed' })

    expect(fetchMock).toHaveBeenCalledWith('/api/candidates?positionId=job-7&status=reviewed', expect.any(Object))
  })

  it('calls candidate retry and job decision sync endpoints', async () => {
    const candidate = { id: 8, name: '林一', positionId: 3, status: 'passed', syncStatus: 'synced' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 'synced', candidate }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: 4, queued: 3, skipped: 1 }) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await api.retryCandidateSync('8')).toMatchObject({ id: '8', jobId: '3', syncStatus: 'synced' })
    expect(await api.syncDecisions('3')).toEqual({ candidates: 4, queued: 3, skipped: 1 })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/candidates/8/sync', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/jobs/3/sync-decisions', expect.objectContaining({ method: 'POST' }))
  })

  it('normalizes the updated candidate returned after a manual decision', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 9, name: '周宁', positionId: 3, status: 'shortlisted', syncStatus: 'pending' }) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await api.setCandidateStatus('9', 'passed')).toMatchObject({ id: '9', jobId: '3', status: 'passed', syncStatus: 'pending' })
    expect(fetchMock).toHaveBeenCalledWith('/api/candidates/9/status', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'passed' }) }))
  })

  it('forces a new evaluation run for manual recovery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ queued: 4 }) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await api.retryCandidateEvaluation('9')).toEqual({ queued: 4 })
    expect(fetchMock).toHaveBeenCalledWith('/api/candidates/9/evaluate', expect.objectContaining({ method: 'POST', body: JSON.stringify({ force: true }) }))
  })

  it('queues an interview evaluation without changing the manual decision', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ queued: 1 }) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await api.generateInterviewEvaluation('9', '面试官：请介绍项目。')).toEqual({ queued: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/candidates/9/interview-evaluation', expect.objectContaining({ method: 'POST', body: JSON.stringify({ transcript: '面试官：请介绍项目。', force: true }) }))
  })
})
