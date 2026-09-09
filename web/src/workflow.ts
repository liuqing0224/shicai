import type { Candidate } from './types'

const completedManualStatuses = new Set<Candidate['status']>(['passed', 'hold', 'rejected'])

export function candidatesForJob(candidates: Candidate[], jobId: string): Candidate[] {
  if (!jobId) return []
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.jobId === jobId)
    .sort((left, right) => {
      const leftCompleted = Number(completedManualStatuses.has(left.candidate.status))
      const rightCompleted = Number(completedManualStatuses.has(right.candidate.status))
      const leftScore = typeof left.candidate.score === 'number' ? left.candidate.score : Number.NEGATIVE_INFINITY
      const rightScore = typeof right.candidate.score === 'number' ? right.candidate.score : Number.NEGATIVE_INFINITY
      return leftCompleted - rightCompleted || rightScore - leftScore || left.index - right.index
    })
    .map(({ candidate }) => candidate)
}
