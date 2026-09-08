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
})
