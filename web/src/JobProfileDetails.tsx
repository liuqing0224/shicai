import type { Job } from './types'

export function JobProfileDetails({ job }: { job: Job }) {
  const profile = job.jobProfile
  if (!profile) return <div className="profile-fallback"><span>岗位画像尚未生成</span><p>{job.jd || '暂无职位描述'}</p></div>
  return <div className="job-profile">
    <div className="profile-summary"><span>{profile.seniority}</span><p>{profile.summary}</p></div>
    <ProfileList title="主要职责" items={profile.responsibilities} />
    <div className="profile-columns"><ProfileList title="必须条件" items={profile.mustHaves} tone="must" /><ProfileList title="加分条件" items={profile.niceToHaves} /></div>
    <div className="profile-dimensions"><h4>评估维度</h4>{profile.dimensions.map((dimension) => <div className="profile-dimension" key={dimension.id}><div><strong>{dimension.name}</strong>{dimension.mustHave && <span>关键项</span>}<b>{formatWeight(dimension.weight)}</b></div><p>{dimension.description}</p><ul>{dimension.requirements.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div>
  </div>
}

function ProfileList({ title, items, tone = '' }: { title: string; items: string[]; tone?: string }) {
  if (!items?.length) return null
  return <section className={`profile-list ${tone}`}><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
}

function formatWeight(weight: number) { return `${Math.round((weight || 0) * 100)}%` }
