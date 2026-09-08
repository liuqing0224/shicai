import { describe, expect, it } from 'vitest'
import { decisionSyncLabel, decisionSyncSummary, isDecisionSyncEligible } from './decisionSyncUtils'
import type { Candidate } from './types'

const candidate = (status: Candidate['status'], syncStatus: Candidate['syncStatus']): Candidate => ({ id: '1', jobId: 'job-1', name: '候选人', status, syncStatus })

describe('decision sync presentation', () => {
  it('shows sync state only for passed and rejected decisions', () => {
    expect(decisionSyncLabel(candidate('passed', 'pending'))).toBe('同步中')
    expect(decisionSyncLabel(candidate('rejected', 'synced'))).toBe('已同步')
    expect(decisionSyncLabel(candidate('passed', 'failed'))).toBe('同步失败')
    expect(decisionSyncLabel(candidate('reviewed', 'pending'))).toBeNull()
    expect(decisionSyncLabel(candidate('hold', 'failed'))).toBeNull()
    expect(isDecisionSyncEligible(candidate('hold', 'failed'))).toBe(false)
  })

  it('formats both completed and queued batch results', () => {
    expect(decisionSyncSummary({ synced: 2, skipped: 1, failed: 1 })).toBe('同步完成：成功 2 人，跳过 1 人，失败 1 人')
    expect(decisionSyncSummary({ candidates: 4, queued: 3, skipped: 1 })).toBe('已提交 3 人同步，跳过 1 人')
  })
})
