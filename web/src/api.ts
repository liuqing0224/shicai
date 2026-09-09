import type { Candidate, CandidateStatus, CollectResult, DecisionSyncResult, Job, JobProfile, JobProfileUpdateResult, ReevaluateStrategy } from './types'

type RawCandidate = Omit<Partial<Candidate>, 'id' | 'status'> & { id: string | number; positionId?: string | number; status?: string; grade?: string; report?: Partial<Candidate> }
const statusAliases: Record<string, CandidateStatus> = { evaluating: 'processing', evaluated: 'reviewed', shortlisted: 'passed' }

export const normalizeCandidatePayload = (raw: RawCandidate): Candidate => {
  const report = raw.report || {}
  const allowed = ['pending', 'processing', 'reviewed', 'passed', 'hold', 'rejected', 'failed']
  const status = statusAliases[raw.status || ''] || (allowed.includes(raw.status || '') ? raw.status : 'pending')
  return { ...raw, ...report, id: String(raw.id), jobId: String(raw.jobId ?? raw.positionId ?? ''), name: raw.name || '未命名候选人', status, level: raw.level ?? raw.grade ?? report.level ?? null } as Candidate
}

const asArray = <T,>(payload: unknown, keys: string[]): T[] => {
  if (Array.isArray(payload)) return payload as T[]
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  for (const key of keys) if (Array.isArray(record[key])) return record[key] as T[]
  if (record.data && typeof record.data === 'object') return asArray<T>(record.data, keys)
  return []
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.message || body?.error || `请求失败（${response.status}）`
    throw new Error(message)
  }
  return body as T
}

export const api = {
  async jobs() {
    return asArray<Job>(await request<unknown>('/jobs'), ['jobs', 'items', 'results'])
  },
  async createJob(input: Pick<Job, 'name' | 'department' | 'jd'>) {
    const result = await request<Job | { data: Job }>('/jobs', { method: 'POST', body: JSON.stringify(input) })
    return 'data' in result ? result.data : result
  },
  async candidates(filters?: { jobId?: string; status?: string }) {
    const query = new URLSearchParams()
    if (filters?.jobId) query.set('positionId', filters.jobId)
    if (filters?.status) query.set('status', filters.status)
    const suffix = query.size ? `?${query}` : ''
    return asArray<RawCandidate>(await request<unknown>(`/candidates${suffix}`), ['candidates', 'items', 'results']).map(normalizeCandidatePayload)
  },
  async candidate(id: string) {
    const result = await request<RawCandidate | { data: RawCandidate }>(`/candidates/${id}`)
    return normalizeCandidatePayload('data' in result ? result.data : result)
  },
  async setCandidateStatus(id: string, status: CandidateStatus) {
    const result = await request<RawCandidate | { data: RawCandidate }>(`/candidates/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    return normalizeCandidatePayload('data' in result ? result.data : result)
  },
  async retryCandidateEvaluation(id: string) {
    return request<{ queued: number }>(`/candidates/${id}/evaluate`, { method: 'POST', body: JSON.stringify({ force: true }) })
  },
  async collect(jobId: string) {
    const result = await request<CollectResult | { data: CollectResult }>(`/jobs/${jobId}/collect`, { method: 'POST' })
    return 'data' in result ? result.data : result
  },
  async updateJobProfile(jobId: string, jobProfile: JobProfile, reevaluateStrategy: ReevaluateStrategy) {
    const result = await request<JobProfileUpdateResult | { data: JobProfileUpdateResult }>(`/jobs/${jobId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({ jobProfile, reevaluateStrategy }),
    })
    return 'data' in result ? result.data : result
  },
  async retryCandidateSync(id: string) {
    const result = await request<RawCandidate | { data: RawCandidate } | { result: string; candidate: RawCandidate }>(`/candidates/${id}/sync`, { method: 'POST' })
    if ('candidate' in result) return normalizeCandidatePayload(result.candidate)
    return normalizeCandidatePayload('data' in result ? result.data : result)
  },
  async syncDecisions(jobId: string) {
    const result = await request<DecisionSyncResult | { data: DecisionSyncResult }>(`/jobs/${jobId}/sync-decisions`, { method: 'POST' })
    return 'data' in result ? result.data : result
  },
  async generateInterviewEvaluation(id: string, transcript: string) {
    return request<{ queued: 0 | 1 }>(`/candidates/${id}/interview-evaluation`, { method: 'POST', body: JSON.stringify({ transcript, force: true }) })
  },
}
