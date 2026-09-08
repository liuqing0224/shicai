import { useState } from 'react'
import { ArrowLeft, Check, CirclePause, LoaderCircle, RefreshCw, Sparkles, UserRound, X } from 'lucide-react'
import { api } from './api'
import { InterviewPlanView } from './InterviewPlan'
import { InterviewEvaluationView } from './InterviewEvaluation'
import { CandidatePerformanceSummary } from './CandidatePerformanceSummary'
import { DecisionSyncBadge } from './DecisionSyncBadge'
import { isDecisionSyncEligible } from './decisionSyncUtils'
import type { Candidate, CandidateStatus, Job } from './types'

const statusMeta: Record<CandidateStatus, { label: string; className: string }> = {
  pending: { label: '待评估', className: 'status-neutral' }, processing: { label: '评估中', className: 'status-processing' },
  reviewed: { label: '已评估', className: 'status-reviewed' }, passed: { label: '通过', className: 'status-passed' },
  hold: { label: '待定', className: 'status-hold' }, rejected: { label: '淘汰', className: 'status-rejected' }, failed: { label: '评估失败', className: 'status-rejected' },
}

export function CandidateDrawer({ candidate, job, onClose, onStatus, onSyncUpdated }: { candidate: Candidate; job?: Job; onClose: () => void; onStatus: (candidate: Candidate, status: CandidateStatus) => void; onSyncUpdated: (candidate: Candidate) => void }) {
  const [retrying, setRetrying] = useState(false)
  const [syncError, setSyncError] = useState('')
  const retrySync = async () => {
    setRetrying(true); setSyncError('')
    try { onSyncUpdated(await api.retryCandidateSync(candidate.id)) }
    catch (cause) { setSyncError(cause instanceof Error ? cause.message : '同步未能完成，请稍后重试') }
    finally { setRetrying(false) }
  }
  return <div className="candidate-detail-page page-content"><div className="candidate-detail-back"><button className="text-button" onClick={onClose}><ArrowLeft size={16} />返回候选人列表</button></div><article className="candidate-detail-shell"><div className="candidate-hero"><Avatar name={candidate.name} /><div><h2>{candidate.name}</h2><p>{candidate.currentTitle || '职位待补充'}{candidate.currentCompany ? ` · ${candidate.currentCompany}` : ''}</p><div className="hero-tags"><span className="manual-status-label">人工状态</span><Status status={candidate.status} /><Recommendation value={candidate.recommendation} /><span>{candidate.jobName || job?.name || '未关联职位'}</span></div></div><div className="hero-score"><strong>{typeof candidate.score === 'number' ? candidate.score : '-'}</strong><span>匹配分</span><b>{candidate.level || ''}</b></div></div>
    <div className="decision-bar"><button className="decision-pass" onClick={() => onStatus(candidate, 'passed')}><Check size={17} />通过</button><button className="decision-hold" onClick={() => onStatus(candidate, 'hold')}><CirclePause size={17} />待定</button><button className="decision-reject" onClick={() => onStatus(candidate, 'rejected')}><X size={17} />淘汰</button></div>
    {isDecisionSyncEligible(candidate) && <div className="drawer-sync"><div><span>飞书同步</span><DecisionSyncBadge candidate={candidate} /></div>{candidate.syncStatus === 'failed' && <button className="secondary-button" disabled={retrying} onClick={() => void retrySync()}>{retrying ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{retrying ? '正在重试…' : '重试同步'}</button>}{syncError && <p role="alert">{syncError}</p>}</div>}
    <div className="drawer-content"><CandidatePerformanceSummary candidate={candidate} />
    {candidate.dimensions?.length ? <DetailSection title="逐维评估" className="dimension-assessment-full"><div className="dimension-list">{candidate.dimensions.map((dimension) => <DimensionAssessment key={dimension.id || dimension.name} dimension={dimension} />)}</div></DetailSection> : null}
    {candidate.interviewPlan ? <InterviewPlanView plan={candidate.interviewPlan} /> : candidate.interviewQuestions?.length ? <DetailSection title="建议面试问题"><ol className="question-list">{candidate.interviewQuestions.map((item, index) => <li key={index}><span>{index + 1}</span>{item}</li>)}</ol></DetailSection> : null}
    <InterviewEvaluationView candidate={candidate} onUpdated={onSyncUpdated} />
    {!candidate.summary && !candidate.dimensions?.length && !candidate.strengths?.length && !candidate.risks?.length && !candidate.gaps?.length && !candidate.interviewPlan && !candidate.interviewQuestions?.length && <div className="pending-detail"><Sparkles size={24} /><strong>{candidate.status === 'processing' ? '正在生成评估报告' : '暂无评估详情'}</strong><span>完成 AI 评估后，此处会展示维度得分、优势、风险和面试建议。</span></div>}</div>
  </article></div>
}

function DimensionAssessment({ dimension }: { dimension: NonNullable<Candidate['dimensions']>[number] }) {
  return <article className="dimension-card"><div className="dimension-heading"><div><strong>{dimension.name}</strong><span>权重 {formatWeight(dimension.weight)}</span></div><b>{dimension.score}<small>/10</small></b></div><div className="dimension-track"><i style={{ width: `${Math.min(100, Math.max(0, dimension.score * 10))}%` }} /></div>{dimension.comment && <p className="dimension-comment">{dimension.comment}</p>}
    {dimension.requirementMatches?.length ? <div className="requirement-list"><h4>逐项核验</h4>{dimension.requirementMatches.map((match, index) => <div className="requirement-row" key={`${match.requirementId}-${index}`}><RequirementBadge status={match.status} /><div><strong>{dimension.requirements?.[index] || match.requirementId}</strong>{match.notes && <p>{match.notes}</p>}{match.evidence?.length ? <ul>{match.evidence.map((item, evidenceIndex) => <li key={evidenceIndex}>{item}</li>)}</ul> : <span className="no-evidence">暂无直接证据</span>}</div></div>)}</div> : null}
    <DimensionEvidence title="命中证据" items={dimension.evidence} tone="evidence" /><DimensionEvidence title="缺口" items={dimension.gaps} tone="gap" /><DimensionEvidence title="风险" items={dimension.risks} tone="risk" />
  </article>
}

function RequirementBadge({ status }: { status: NonNullable<Candidate['dimensions']>[number]['requirementMatches'][number]['status'] }) {
  const labels = { met: '满足', partial: '部分满足', not_met: '不满足', unknown: '待核验' }
  return <span className={`requirement-badge requirement-${status}`}>{labels[status]}</span>
}

function DimensionEvidence({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items?.length) return null
  return <div className={`dimension-evidence ${tone}`}><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
}

function DetailSection({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <section className={`detail-section ${className}`}><h3>{title}</h3>{children}</section> }
function Avatar({ name }: { name: string }) { return <span className="avatar large">{name?.trim().slice(0, 1) || <UserRound size={16} />}</span> }
function Status({ status }: { status: CandidateStatus }) { const meta = statusMeta[status]; return <span className={`status ${meta.className}`}>{status === 'processing' && <i />}{meta.label}</span> }
function Recommendation({ value }: { value?: Candidate['recommendation'] }) { if (!value) return null; const labels = { strong_yes: '建议通过', yes: '建议通过', hold: '建议待定', no: '建议淘汰' }; return <span className={`recommendation recommendation-${value}`}><Sparkles size={11} />{labels[value]}</span> }
function formatWeight(weight: number) { return `${Math.round((weight || 0) * 100)}%` }
