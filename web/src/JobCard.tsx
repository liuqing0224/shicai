import { BriefcaseBusiness, ChevronRight, LoaderCircle, RefreshCw, UsersRound } from 'lucide-react'
import type { Job } from './types'

interface JobCardProps {
  job: Job
  candidateCount: number
  reviewedCount: number
  passedCount: number
  collecting: boolean
  onOpenCandidates: () => void
  onOpenProfile: () => void
  onCollect: () => void
}

export function JobCard({
  job,
  candidateCount,
  reviewedCount,
  passedCount,
  collecting,
  onOpenCandidates,
  onOpenProfile,
  onCollect,
}: JobCardProps) {
  const paused = job.status === 'paused'

  return (
    <article className="job-card">
      <header className="job-card-header">
        <div className="job-icon"><BriefcaseBusiness size={20} /></div>
        <div className="job-identity">
          <h3>{job.name}</h3>
          <p className="department">{job.department || '未设置部门'}</p>
        </div>
        <span className={`job-state ${paused ? 'paused' : ''}`}>{paused ? '已暂停' : '招聘中'}</span>
      </header>

      <div className="job-stats" aria-label="职位招聘进展">
        <div><span>候选人</span><strong>{candidateCount}</strong></div>
        <div><span>已评估</span><strong>{reviewedCount}</strong></div>
        <div><span>已通过</span><strong>{passedCount}</strong></div>
      </div>

      <div className="job-card-footer">
        <button className="jd-toggle" onClick={onOpenProfile}>岗位画像 <ChevronRight size={15} /></button>
        <div className="job-actions">
          <button className="candidate-button" onClick={onOpenCandidates}>
            <UsersRound size={17} />查看候选人<ChevronRight size={15} />
          </button>
          <button className="collect-button" disabled={collecting || paused} onClick={onCollect}>
            {collecting ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
            {collecting ? '正在采集…' : '采集简历'}
          </button>
        </div>
      </div>
    </article>
  )
}
