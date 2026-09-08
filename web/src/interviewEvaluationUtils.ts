import type { Candidate, CandidateTask, InterviewEvaluationDimensionStatus } from './types'

interface PollOptions {
  load: () => Promise<Candidate>
  initialCreatedAt?: string | null
  initialTasks?: CandidateTask[]
  attempts?: number
  intervalMs?: number
  wait?: (ms: number) => Promise<void>
}

export async function waitForInterviewEvaluation(options: PollOptions) {
  const initial = new Map((options.initialTasks || []).map((task) => [task.id, task.status]))
  const attempts = options.attempts ?? 40
  const wait = options.wait ?? ((ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms)))
  for (let index = 0; index < attempts; index += 1) {
    const candidate = await options.load()
    if (candidate.interviewEvaluation && candidate.interviewEvaluationCreatedAt !== options.initialCreatedAt) return candidate
    const task = [...(candidate.tasks || [])].reverse().find((item) => item.stage === 'interview-evaluate')
    const isCurrent = task && (!initial.has(task.id) || ['queued', 'running'].includes(initial.get(task.id) || ''))
    if (isCurrent && ['failed', 'cancelled'].includes(task.status)) throw new Error(task.error || '面试评价生成失败，请重试')
    if (index < attempts - 1) await wait(options.intervalMs ?? 1500)
  }
  throw new Error('评价生成时间较长，请稍后刷新查看')
}

export function formatCoverage(value: number) {
  const percentage = value <= 1 ? value * 100 : value
  return `${Math.round(Math.max(0, Math.min(100, percentage)))}%`
}

export function formatInterviewDimensionScore(status: InterviewEvaluationDimensionStatus, score: number | null) {
  return status === 'not_assessed' || score == null ? null : `${score}/4`
}

export function latestActiveInterviewEvaluationTask(tasks: CandidateTask[] = []) {
  const latest = [...tasks].reverse().find((task) => task.stage === 'interview-evaluate')
  return latest && ['queued', 'running'].includes(latest.status) ? latest : undefined
}

export function hasInterviewEvaluationWork(candidate: Candidate) {
  return Boolean(candidate.interviewTranscript?.trim() || candidate.interviewEvaluation || latestActiveInterviewEvaluationTask(candidate.tasks))
}
