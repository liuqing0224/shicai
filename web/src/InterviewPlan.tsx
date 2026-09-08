import { ArrowRight, Clock, FileCheck2, ListChecks, MessageSquareMore, Target } from 'lucide-react'
import { groupInterviewQuestions } from './interviewPlanUtils'
import type { InterviewPlan, InterviewQuestion } from './types'

const priorityLabel = { high: '高优先级', medium: '中优先级', low: '低优先级' }

export function InterviewPlanView({ plan }: { plan: InterviewPlan }) {
  const groups = groupInterviewQuestions(plan.questions || [])
  return <section className="detail-section interview-guide">
    <div className="interview-title"><div><h3>结构化面试指南</h3><span><Clock size={13} />{plan.durationMinutes} 分钟</span></div><p>{plan.strategy.summary}</p><div className="strategy-priorities">{plan.strategy.priorities.map((item, index) => <span key={index}>{item}</span>)}</div><div className="time-allocation">{plan.strategy.timeAllocation.map((item) => <span key={item.section}>{item.section}<b>{item.minutes} 分钟</b></span>)}</div></div>
    <div className="interview-groups">{groups.map((group) => <section className="interview-group" key={group.dimensionId || group.dimensionName}><h4><Target size={14} />{group.dimensionName}<span>{group.questions.length} 题</span></h4>{group.questions.map((question) => <InterviewQuestionView key={question.id} question={question} />)}</section>)}</div>
    {plan.caseExercise && <section className="case-exercise"><h4><FileCheck2 size={15} />案例练习 · {plan.caseExercise.title}<span>{plan.caseExercise.durationMinutes} 分钟</span></h4><p>{plan.caseExercise.prompt}</p><div className="question-basis"><SignalList title="交付内容" items={plan.caseExercise.deliverables} /><SignalList title="评估标准" items={plan.caseExercise.evaluationCriteria} /></div></section>}
    {plan.scorecard?.dimensions?.length ? <section className="scorecard"><h4><ListChecks size={15} />面试评分卡<span>{plan.scorecard.scale} 分制 · {plan.scorecard.evidenceRequired ? '须有证据' : ''}</span></h4><div className="scorecard-scroll"><table><thead><tr><th>维度</th><th>权重</th><th>1 分</th><th>2 分</th><th>3 分</th><th>4 分</th></tr></thead><tbody>{plan.scorecard.dimensions.map((item) => <tr key={item.dimensionId}><td><strong>{item.dimensionName}</strong></td><td>{formatWeight(item.weight)}</td><td>{item.anchors.one}</td><td>{item.anchors.two}</td><td>{item.anchors.three}</td><td>{item.anchors.four}</td></tr>)}</tbody></table></div><p className="recommendation-rule"><b>推荐规则</b>{plan.scorecard.recommendationRule}</p></section> : null}
  </section>
}

function InterviewQuestionView({ question }: { question: InterviewQuestion }) {
  return <article className={`interview-question question-${question.priority} ${question.required ? 'question-required' : 'question-optional'}`}><div className="question-heading"><span className={`priority priority-${question.priority}`}>{question.required ? '必问' : priorityLabel[question.priority]}</span><strong>{question.question}</strong><span className="question-time"><Clock size={11} />{question.expectedMinutes} 分钟</span></div><div className="question-purpose"><MessageSquareMore size={13} /><span><b>考察目的</b>{question.purpose}</span></div>
    <div className="question-basis"><SignalList title="岗位依据" items={question.profileRequirements} /><SignalList title="简历依据" items={question.resumeEvidence} empty="简历暂无直接依据" /></div>
    <FollowUps items={question.followUps} />
    <div className="question-signals"><SignalList title="积极信号" items={question.strongSignals} tone="positive" /><SignalList title="预警信号" items={question.warningSignals} tone="warning" /></div>
  </article>
}

function FollowUps({ items }: { items: InterviewQuestion['followUps'] }) {
  if (!items?.length) return null
  return <div className="signal-list follow-ups"><h5>建议追问</h5><ul>{items.map((item, index) => typeof item === 'string' ? <li key={index}>{item}</li> : <li className="trigger-follow-up" key={index}><span>当出现“{item.trigger}”</span><ArrowRight size={11} /><strong>{item.prompt}</strong></li>)}</ul></div>
}

function SignalList({ title, items, tone = '', empty, numbered = false }: { title: string; items: string[]; tone?: string; empty?: string; numbered?: boolean }) {
  if (!items?.length && !empty) return null
  return <div className={`signal-list ${tone}`}><h5>{title}</h5>{items?.length ? <ul className={numbered ? 'numbered' : ''}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>{empty}</p>}</div>
}

function formatWeight(weight: number) { return `${Math.round((weight || 0) * 100)}%` }
