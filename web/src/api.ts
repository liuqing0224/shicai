import type { Candidate, CandidateStatus, CollectResult, Job } from './types'

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
    return request(`/candidates/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  async collect(jobId: string) {
    const result = await request<CollectResult | { data: CollectResult }>(`/jobs/${jobId}/collect`, { method: 'POST' })
    return 'data' in result ? result.data : result
  },
}
