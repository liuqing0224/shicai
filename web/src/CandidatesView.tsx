import { useState } from 'react'
import { ArrowLeft, Check, ChevronRight, CirclePause, Filter, LoaderCircle, RefreshCw, Search, Sparkles, UserRound, X } from 'lucide-react'
import { api } from './api'
import { DecisionSyncBadge } from './DecisionSyncBadge'
import { decisionSyncSummary } from './decisionSyncUtils'
import type { Candidate, CandidateStatus, DecisionSyncResult, Job } from './types'

const statusMeta: Record<CandidateStatus, { label: string; className: string }> = {
  pending: { label: '待评估', className: 'status-neutral' }, processing: { label: '评估中', className: 'status-processing' },
  reviewed: { label: '已评估', className: 'status-reviewed' }, passed: { label: '通过', className: 'status-passed' },
  hold: { label: '待定', className: 'status-hold' }, rejected: { label: '淘汰', className: 'status-rejected' }, failed: { label: '评估失败', className: 'status-rejected' },
}

interface CandidatesViewProps {
  candidates: Candidate[]
  job: Job
  statusFilter: string
  search: string
  onBack: () => void
  onStatusFilter: (value: string) => void
  onSearch: (value: string) => void
  onOpen: (candidate: Candidate) => void
  onStatus: (candidate: Candidate, status: CandidateStatus) => void
  onSyncComplete: (result: DecisionSyncResult) => void
  onSyncError: (message: string) => void
}

export function CandidatesView(props: CandidatesViewProps) {
  const [syncing, setSyncing] = useState(false)
  const [syncSummary, setSyncSummary] = useState('')
  const sync = async () => {
    setSyncing(true)
    try {
      const result = await api.syncDecisions(props.job.id)
      setSyncSummary(decisionSyncSummary(result))
      props.onSyncComplete(result)
    } catch (cause) {
      props.onSyncError(cause instanceof Error ? cause.message : '同步未能完成，请稍后重试')
    } finally { setSyncing(false) }
  }
  return <div className="page-content">
    <div className="candidate-context"><button className="text-button" onClick={props.onBack}><ArrowLeft size={16} />返回职位列表</button><span>{props.job.department || '未设置部门'} · {props.candidates.length} 位候选人</span><button className="secondary-button sync-command" disabled={syncing} onClick={() => void sync()}>{syncing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{syncing ? '正在同步…' : '同步决策'}</button></div>
    {syncSummary && <div className="sync-summary" role="status">{syncSummary}</div>}
    <div className="filters"><div className="search-field"><Search size={17} /><input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="搜索姓名、公司或当前职位" /></div><div className="select-wrap"><Filter size={16} /><select value={props.statusFilter} onChange={(event) => props.onStatusFilter(event.target.value)}><option value="">全部状态</option>{Object.entries(statusMeta).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div></div>
    <div className="table-panel"><div className="table-meta"><span>{props.job.name} · 共 {props.candidates.length} 位候选人</span></div>{props.candidates.length ? <div className="table-scroll"><table><thead><tr><th>候选人</th><th>应聘职位</th><th>匹配度</th><th>AI 建议</th><th>人工状态</th><th>飞书同步</th><th>最近更新</th><th className="actions-head">操作</th></tr></thead><tbody>{props.candidates.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} job={props.job} onOpen={props.onOpen} onStatus={props.onStatus} />)}</tbody></table></div> : <EmptyMini />}</div>
  </div>
}

function CandidateRow({ candidate, job, onOpen, onStatus }: { candidate: Candidate; job: Job; onOpen: (candidate: Candidate) => void; onStatus: (candidate: Candidate, status: CandidateStatus) => void }) {
  return <tr><td><button className="candidate-cell" onClick={() => onOpen(candidate)}><Avatar name={candidate.name} /><span><strong>{candidate.name}</strong><small>{candidate.currentCompany || candidate.currentTitle || candidate.source || '飞书招聘'}</small></span></button></td><td>{candidate.jobName || job.name || '-'}</td><td><Score score={candidate.score} level={candidate.level} /></td><td><Recommendation value={candidate.recommendation} /></td><td><Status status={candidate.status} /></td><td><DecisionSyncBadge candidate={candidate} /></td><td className="muted">{formatDate(candidate.updatedAt)}</td><td><div className="row-actions"><button title="通过" className={candidate.status === 'passed' ? 'chosen pass' : ''} onClick={() => onStatus(candidate, 'passed')}><Check size={16} /></button><button title="待定" className={candidate.status === 'hold' ? 'chosen hold' : ''} onClick={() => onStatus(candidate, 'hold')}><CirclePause size={16} /></button><button title="淘汰" className={candidate.status === 'rejected' ? 'chosen reject' : ''} onClick={() => onStatus(candidate, 'rejected')}><X size={16} /></button><button title="查看详情" onClick={() => onOpen(candidate)}><ChevronRight size={17} /></button></div></td></tr>
}

function Avatar({ name }: { name: string }) { return <span className="avatar">{name?.trim().slice(0, 1) || <UserRound size={16} />}</span> }
function Status({ status }: { status: CandidateStatus }) { const meta = statusMeta[status]; return <span className={`status ${meta.className}`}>{status === 'processing' && <i />}{meta.label}</span> }
function Recommendation({ value }: { value?: Candidate['recommendation'] }) { if (!value) return null; const labels = { strong_yes: '建议通过', yes: '建议通过', hold: '建议待定', no: '建议淘汰' }; return <span className={`recommendation recommendation-${value}`}><Sparkles size={11} />{labels[value]}</span> }
function Score({ score, level }: { score?: number | null; level?: string | null }) { if (typeof score !== 'number') return <span className="score-empty">-</span>; return <span className={`score ${score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low'}`}><b>{score}</b>{level && <small>{level}</small>}</span> }
function EmptyMini() { return <div className="empty-mini"><span>该职位下没有符合当前筛选条件的候选人</span></div> }
function formatDate(value?: string) { if (!value) return '-'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) }
