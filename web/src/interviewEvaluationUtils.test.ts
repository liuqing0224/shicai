import { describe, expect, it } from 'vitest'
import { formatCoverage, formatInterviewDimensionScore, latestActiveInterviewEvaluationTask, waitForInterviewEvaluation } from './interviewEvaluationUtils'
import type { Candidate } from './types'

const base: Candidate = { id: '1', jobId: 'job-1', name: '候选人', status: 'reviewed' }

describe('interview evaluation polling', () => {
  it('returns when a newly created evaluation appears', async () => {
    const updated = { ...base, interviewEvaluationCreatedAt: '2026-09-08T10:00:00Z', interviewEvaluation: { recommendation: 'pass' as const, summary: '通过', strengths: [], concerns: [], notAssessed: [], claimVerifications: [], criticalGaps: [], assessedCoverageWeight: 0.75, weightedScore: 3.2, dimensions: [] } }
    await expect(waitForInterviewEvaluation({ load: async () => updated, initialCreatedAt: null, attempts: 1 })).resolves.toBe(updated)
  })

  it('reports failure from the current evaluation task', async () => {
    const failed = { ...base, tasks: [{ id: 'new-task', stage: 'interview-evaluate', status: 'failed' as const, error: '对话内容无法读取' }] }
    await expect(waitForInterviewEvaluation({ load: async () => failed, attempts: 1 })).rejects.toThrow('对话内容无法读取')
  })

  it('does not treat an old failed task as the current run', async () => {
    const task = { id: 'old-task', stage: 'interview-evaluate', status: 'failed' as const, error: '旧错误' }
    const failed = { ...base, tasks: [task] }
    await expect(waitForInterviewEvaluation({ load: async () => failed, initialTasks: [task], attempts: 1 })).rejects.toThrow('评价生成时间较长')
  })

  it('formats fractional and percentage coverage consistently', () => {
    expect(formatCoverage(0.72)).toBe('72%')
    expect(formatCoverage(72)).toBe('72%')
  })

  it('never assigns a numeric score to a dimension that was not assessed', () => {
    expect(formatInterviewDimensionScore('not_assessed', 2)).toBeNull()
    expect(formatInterviewDimensionScore('gap', 1)).toBe('1/4')
  })

  it('finds the latest queued or running interview evaluation for recovery', () => {
    const tasks = [
      { id: 'done', stage: 'interview-evaluate', status: 'completed' as const },
      { id: 'other', stage: 'evaluate', status: 'running' as const },
      { id: 'queued', stage: 'interview-evaluate', status: 'queued' as const },
      { id: 'running', stage: 'interview-evaluate', status: 'running' as const },
    ]
    expect(latestActiveInterviewEvaluationTask(tasks)?.id).toBe('running')
    expect(latestActiveInterviewEvaluationTask([{ id: 'failed', stage: 'interview-evaluate', status: 'failed' }])).toBeUndefined()
    expect(latestActiveInterviewEvaluationTask([{ id: 'running', stage: 'interview-evaluate', status: 'running' }, { id: 'done', stage: 'interview-evaluate', status: 'completed' }])).toBeUndefined()
  })
})
