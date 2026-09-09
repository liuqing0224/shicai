import { describe, expect, it } from 'vitest'
import { candidatesForJob } from './workflow'
import type { Candidate } from './types'

const candidates = [
  { id: '1', name: '甲', jobId: 'job-a', status: 'pending', score: 72 },
  { id: '2', name: '乙', jobId: 'job-b', status: 'reviewed', score: 95 },
  { id: '3', name: '丙', jobId: 'job-a', status: 'reviewed', score: 91 },
  { id: '4', name: '丁', jobId: 'job-a', status: 'pending', score: null },
  { id: '5', name: '戊', jobId: 'job-a', status: 'passed', score: 96 },
  { id: '6', name: '己', jobId: 'job-a', status: 'hold', score: 80 },
  { id: '7', name: '庚', jobId: 'job-a', status: 'failed', score: null },
  { id: '8', name: '辛', jobId: 'job-a', status: 'rejected', score: 63 },
] satisfies Candidate[]

describe('candidatesForJob', () => {
  it('prioritizes candidates awaiting a manual decision, then sorts each group by score', () => {
    expect(candidatesForJob(candidates, 'job-a').map((item) => item.id)).toEqual(['3', '1', '4', '7', '5', '6', '8'])
  })

  it('does not expose candidates without a selected job', () => {
    expect(candidatesForJob(candidates, '')).toEqual([])
  })
})
