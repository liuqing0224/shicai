import { ArrowLeft, BriefcaseBusiness, CheckCircle2, FileSearch, Sparkles } from 'lucide-react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { jobProfileChartData, jobProfileChartMax } from './jobProfileUtils'
import type { Job, JobDimension } from './types'

export function JobProfilePage({ job, onBack }: { job: Job; onBack: () => void }) {
  const profile = job.jobProfile
  if (!profile) return <div className="page-content profile-page"><ProfileBack job={job} onBack={onBack} /><div className="profile-empty"><FileSearch size={26} /><h2>岗位画像尚未生成</h2><p>职位已保留原始 JD，画像生成完成后会在这里展示评估维度和权重。</p></div></div>
  const chartData = jobProfileChartData(profile)
  const chartMax = jobProfileChartMax(profile)
  return <div className="page-content profile-page">
    <ProfileBack job={job} onBack={onBack} />
    <section className="profile-intro"><div><span className="seniority-tag">{profile.seniority}</span><h2>岗位画像概览</h2><p>{profile.summary}</p></div><div className="profile-chart-wrap"><div className="profile-radar" aria-label="岗位画像维度权重雷达图"><ResponsiveContainer width="100%" height="100%"><RadarChart data={chartData} outerRadius="68%"><PolarGrid stroke="#dfe2de" /><PolarAngleAxis dataKey="name" tick={{ fill: '#535b56', fontSize: 11 }} /><PolarRadiusAxis domain={[0, chartMax]} tickCount={4} tick={{ fill: '#8a908c', fontSize: 9 }} axisLine={false} /><Radar name="权重" dataKey="weight" stroke="#d94418" fill="#ef7643" fillOpacity={0.38} strokeWidth={2} /><Tooltip formatter={(value) => [`${value}%`, '权重']} /></RadarChart></ResponsiveContainer></div><div className="radar-legend">{chartData.map((item) => <span key={item.id}><i />{item.name}<b>{item.weight}%</b></span>)}</div></div></section>
    <section className="profile-criteria"><ProfileList icon={<BriefcaseBusiness size={15} />} title="主要职责" items={profile.responsibilities} /><ProfileList icon={<CheckCircle2 size={15} />} title="必须条件" items={profile.mustHaves} tone="must" /><ProfileList icon={<Sparkles size={15} />} title="加分条件" items={profile.niceToHaves} /></section>
    <section className="profile-dimension-section"><div className="section-heading"><h2>评估维度</h2><p>维度权重之和为 100%，评估结果按以下标准对齐。</p></div><div className="profile-dimension-grid">{profile.dimensions.map((dimension) => <DimensionDetail key={dimension.id} dimension={dimension} />)}</div></section>
  </div>
}

function ProfileBack({ job, onBack }: { job: Job; onBack: () => void }) { return <div className="profile-back-row"><button className="text-button" onClick={onBack}><ArrowLeft size={16} />返回职位列表</button><span>{job.department || '未设置部门'} · {job.name}</span></div> }
function ProfileList({ icon, title, items, tone = '' }: { icon: React.ReactNode; title: string; items: string[]; tone?: string }) { return <section className={`profile-page-list ${tone}`}><h3>{icon}{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>暂无内容</p>}</section> }
function DimensionDetail({ dimension }: { dimension: JobDimension }) { return <article className="profile-dimension-detail"><div><strong>{dimension.name}</strong>{dimension.mustHave && <span>关键项</span>}<b>{Math.round(dimension.weight * 100)}%</b></div><p>{dimension.description}</p><h4>评估要求</h4><ul>{dimension.requirements.map((item, index) => <li key={index}>{item}</li>)}</ul></article> }
