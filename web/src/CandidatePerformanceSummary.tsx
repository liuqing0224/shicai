import { AlertTriangle, CheckCircle2, ChevronDown, CircleDotDashed, HelpCircle } from 'lucide-react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { buildPerformanceSummary } from './performanceSummaryUtils'
import type { DimensionConcernGroup } from './performanceSummaryUtils'
import type { Candidate } from './types'

export function CandidatePerformanceSummary({ candidate }: { candidate: Candidate }) {
  const result = buildPerformanceSummary(candidate)
  if (!candidate.summary && !result.strengths.length && !result.confirmed.length && !result.pending.length) return null
  return <section className="detail-section performance-summary">
    <h3>评估结论</h3>
    {candidate.summary && <p className="summary-text">{candidate.summary}</p>}
    <div className="performance-layout">
      <CandidateRadar dimensions={candidate.dimensions || []} />
      <section className="performance-column strengths-column"><h4><CheckCircle2 size={15} />优势表现</h4><PerformanceList items={result.strengths} empty="暂无明确优势证据" /></section>
      <section className="dimension-concerns"><div className="concern-heading"><div><AlertTriangle size={15} /><h4>分维度风险与不足</h4></div><span>{result.dimensionGroups.length} 个需关注维度</span></div>{result.dimensionGroups.length ? result.dimensionGroups.map((group) => <DimensionConcern key={group.id} group={group} />) : <p className="performance-empty">暂无明确风险、不足或待核验项</p>}</section>
    </div>
  </section>
}

function CandidateRadar({ dimensions }: { dimensions: NonNullable<Candidate['dimensions']> }) {
  if (dimensions.length < 3) return null
  const data = dimensions.map((dimension) => ({ name: dimension.name, score: dimension.score }))
  const average = data.reduce((sum, item) => sum + item.score, 0) / data.length
  return <section className="candidate-radar"><div><h4>维度能力图</h4><span>均分 <b>{average.toFixed(1)}</b> / 10</span></div><div className="candidate-radar-chart" aria-label="候选人评估维度雷达图"><ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="60%" margin={{ left: 28, right: 28 }}><PolarGrid stroke="#dfe2de" /><PolarAngleAxis dataKey="name" tick={{ fill: '#59615c', fontSize: 10 }} /><PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={{ fill: '#929893', fontSize: 8 }} axisLine={false} /><Radar name="维度得分" dataKey="score" stroke="#d94418" fill="#ef7643" fillOpacity={0.32} strokeWidth={2} /><Tooltip formatter={(value) => [`${value} / 10`, '维度得分']} /></RadarChart></ResponsiveContainer></div></section>
}

function DimensionConcern({ group }: { group: DimensionConcernGroup }) {
  const count = group.gaps.length + group.risks.length + group.pending.length
  const labels = { high: '重点关注', medium: '需要关注', pending: '待核验' }
  return <details className={`risk-dimension risk-${group.severity}`}><summary><span className="risk-level">{labels[group.severity]}</span><strong>{group.name}</strong>{group.score !== null && <b>{group.score}<small>/10</small></b>}{group.weight !== null && <em>权重 {Math.round(group.weight * 100)}%</em>}<span className="risk-count">{count} 项</span><ChevronDown size={15} /></summary><div className="risk-detail"><ConcernList icon={<CircleDotDashed size={13} />} title="能力缺口" items={group.gaps} /><ConcernList icon={<AlertTriangle size={13} />} title="风险判断" items={group.risks} /><ConcernList icon={<HelpCircle size={13} />} title="待核验项" items={group.pending} pending /></div></details>
}

function ConcernList({ icon, title, items, pending = false }: { icon: React.ReactNode; title: string; items: string[]; pending?: boolean }) {
  if (!items.length) return null
  return <section className={pending ? 'concern-list pending' : 'concern-list'}><h5>{icon}{title}<span>{items.length}</span></h5><PerformanceList items={items} empty="" pending={pending} /></section>
}

function PerformanceList({ items, empty, pending = false }: { items: string[]; empty: string; pending?: boolean }) {
  if (!items.length) return <p className="performance-empty">{empty}</p>
  return <ul className={pending ? 'pending-list' : ''}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
}
