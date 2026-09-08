import type { Candidate, DecisionSyncResult } from './types'

export function isDecisionSyncEligible(candidate: Candidate) {
  return candidate.status === 'passed' || candidate.status === 'rejected'
}

export function decisionSyncLabel(candidate: Candidate) {
  if (!isDecisionSyncEligible(candidate)) return null
  if (candidate.syncStatus === 'pending') return '同步中'
  if (candidate.syncStatus === 'synced') return '已同步'
  if (candidate.syncStatus === 'failed') return '同步失败'
  return null
}

export function decisionSyncSummary(result: DecisionSyncResult) {
  if (result.synced !== undefined || result.failed !== undefined) {
    return `同步完成：成功 ${result.synced ?? 0} 人，跳过 ${result.skipped ?? 0} 人，失败 ${result.failed ?? 0} 人`
  }
  return `已提交 ${result.queued ?? result.candidates ?? 0} 人同步，跳过 ${result.skipped ?? 0} 人`
}
