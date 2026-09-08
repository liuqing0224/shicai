import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react'
import { decisionSyncLabel } from './decisionSyncUtils'
import type { Candidate } from './types'

export function DecisionSyncBadge({ candidate }: { candidate: Candidate }) {
  const label = decisionSyncLabel(candidate)
  if (!label) return null
  const icon = candidate.syncStatus === 'pending'
    ? <LoaderCircle className="spin" size={13} />
    : candidate.syncStatus === 'synced' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />
  return <span className={`sync-badge sync-${candidate.syncStatus}`}>{icon}{label}</span>
}
