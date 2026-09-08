export type CandidateStatus = 'pending' | 'processing' | 'reviewed' | 'passed' | 'hold' | 'rejected' | 'failed'
export type CandidateRecommendation = 'strong_yes' | 'yes' | 'hold' | 'no'
export type DecisionSyncStatus = 'idle' | 'pending' | 'synced' | 'failed' | 'skipped'

export interface DecisionSyncError {
  type: string
  message: string
  missingScopes: string[]
  consoleUrl: string | null
}

export interface Job {
  id: string
  name: string
  department?: string
  jd: string
  status?: 'active' | 'paused' | 'closed'
  candidateCount?: number
  createdAt?: string
  jobProfile?: JobProfile | null
}

export interface JobDimension {
  id: string
  name: string
  description: string
  weight: number
  requirements: string[]
  mustHave: boolean
}

export interface JobProfile {
  summary: string
  seniority: string
  responsibilities: string[]
  mustHaves: string[]
  niceToHaves: string[]
  dimensions: JobDimension[]
}

export type RequirementMatchStatus = 'met' | 'partial' | 'not_met' | 'unknown'

export interface RequirementMatch {
  requirementId: string
  status: RequirementMatchStatus
  evidence: string[]
  notes: string
}

export type InterviewPriority = 'high' | 'medium' | 'low'

export interface InterviewQuestion {
  id: string
  dimensionId: string
  dimensionName: string
  priority: InterviewPriority
  required: boolean
  expectedMinutes: number
  question: string
  purpose: string
  profileRequirements: string[]
  resumeEvidence: string[]
  strongSignals: string[]
  warningSignals: string[]
  followUps: Array<string | { trigger: string; prompt: string }>
}

export interface InterviewPlan {
  durationMinutes: number
  strategy: {
    summary: string
    priorities: string[]
    timeAllocation: Array<{ section: string; minutes: number }>
  }
  questions: InterviewQuestion[]
  caseExercise: { title: string; prompt: string; durationMinutes: number; deliverables: string[]; evaluationCriteria: string[] } | null
  scorecard: {
    scale: '1-4'
    evidenceRequired: true
    dimensions: Array<{ dimensionId: string; dimensionName: string; weight: number; anchors: { one: string; two: string; three: string; four: string } }>
    recommendationRule: string
  }
}

export interface ScoreDimension {
  id?: string
  name: string
  score: number
  weight: number
  requirements: string[]
  evidence: string[]
  gaps: string[]
  risks: string[]
  requirementMatches: RequirementMatch[]
  comment?: string
}

export type InterviewEvaluationRecommendation = 'pass' | 'conditional_pass' | 'reject'
export type InterviewEvaluationDimensionStatus = 'demonstrated' | 'partial' | 'gap' | 'not_assessed'
export type ClaimVerificationStatus = 'verified' | 'partially_verified' | 'insufficient_evidence' | 'not_assessed' | 'contradicted'

export interface InterviewEvaluation {
  recommendation: InterviewEvaluationRecommendation
  summary: string
  strengths: string[]
  concerns: string[]
  notAssessed: string[]
  criticalGaps: string[]
  assessedCoverageWeight: number
  weightedScore: number | null
  dimensions: Array<{ id: string; name: string; weight: number; status: InterviewEvaluationDimensionStatus; score: number | null; evidence: string[]; assessment: string }>
  claimVerifications: Array<{ claim: string; status: ClaimVerificationStatus; evidence: string[]; assessment: string }>
}

export interface CandidateTask {
  id: string
  stage: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  error?: string | null
  createdAt?: string
}

export interface Candidate {
  id: string
  name: string
  jobId: string
  jobName?: string
  status: CandidateStatus
  score?: number | null
  level?: string | null
  recommendation?: CandidateRecommendation | null
  source?: string
  currentCompany?: string
  currentTitle?: string
  yearsOfExperience?: number
  education?: string
  updatedAt?: string
  strengths?: string[]
  risks?: string[]
  gaps?: string[]
  interviewQuestions?: string[]
  interviewPlan?: InterviewPlan | null
  dimensions?: ScoreDimension[]
  summary?: string
  resumeUrl?: string
  syncStatus?: DecisionSyncStatus | null
  syncTarget?: 'passed' | 'rejected' | null
  syncError?: DecisionSyncError | null
  syncAt?: string | null
  interviewTranscript?: string | null
  interviewEvaluation?: InterviewEvaluation | null
  interviewEvaluationCreatedAt?: string | null
  tasks?: CandidateTask[]
}

export interface CollectResult {
  imported?: number
  skipped?: number
  queued?: number
  message?: string
}

export interface DecisionSyncResult {
  candidates?: number
  queued?: number
  synced?: number
  skipped?: number
  failed?: number
}
