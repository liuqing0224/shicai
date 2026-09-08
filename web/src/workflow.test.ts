import { describe, expect, it } from 'vitest'
import { candidatesForJob } from './workflow'
import type { Candidate } from './types'

const candidates = [
  { id: '1', name: '甲', jobId: 'job-a', status: 'pending', score: 72 },
  { id: '2', name: '乙', jobId: 'job-b', status: 'reviewed', score: 95 },
  { id: '3', name: '丙', jobId: 'job-a', status: 'reviewed', score: 91 },
  { id: '4', name: '丁', jobId: 'job-a', status: 'pending', score: null },
  { id: '5', name: '戊', jobId: 'job-a', status: 'reviewed', score: 72 },
] satisfies Candidate[]

describe('candidatesForJob', () => {
  it('returns candidates only within the selected job context', () => {
    expect(candidatesForJob(candidates, 'job-a').map((item) => item.id)).toEqual(['3', '1', '5', '4'])
  })

  it('does not expose candidates without a selected job', () => {
    expect(candidatesForJob(candidates, '')).toEqual([])
  })
})
