import { describe, expect, it } from 'vitest'
import { groupInterviewQuestions } from './interviewPlanUtils'
import type { InterviewPlan, InterviewQuestion } from './types'

const question = (id: string, dimensionId: string, priority: InterviewQuestion['priority']): InterviewQuestion => ({
  id, dimensionId, dimensionName: dimensionId, priority, required: priority === 'high', expectedMinutes: 5, question: id, purpose: '', profileRequirements: [], resumeEvidence: [], strongSignals: [], warningSignals: [], followUps: [],
})

const backendPlan: InterviewPlan = {
  durationMinutes: 60,
  strategy: { summary: '先核验关键门槛，再深挖项目证据。', priorities: ['硬技能', '项目深度'], timeAllocation: [{ section: '背景核验', minutes: 10 }, { section: '能力深挖', minutes: 40 }, { section: '候选人提问', minutes: 10 }] },
  questions: [{ ...question('q1', 'skills', 'high'), followUps: [{ trigger: '只描述团队成果', prompt: '请说明你个人负责的部分。' }] }],
  caseExercise: { title: '方案设计', prompt: '设计一个交付方案。', durationMinutes: 15, deliverables: ['结构化方案'], evaluationCriteria: ['逻辑完整'] },
  scorecard: { scale: '1-4', evidenceRequired: true, dimensions: [{ dimensionId: 'skills', dimensionName: 'skills', weight: 1, anchors: { one: '无证据', two: '基础', three: '熟练', four: '专家' } }], recommendationRule: '关键项均达到 3 分以上方可建议通过。' },
}

describe('groupInterviewQuestions', () => {
  it('groups by dimension and orders questions by priority', () => {
    const groups = groupInterviewQuestions([question('low', 'skills', 'low'), question('medium', 'experience', 'medium'), question('high', 'skills', 'high')])
    expect(groups.map((group) => group.dimensionId)).toEqual(['skills', 'experience'])
    expect(groups[0].questions.map((item) => item.id)).toEqual(['high', 'low'])
  })

  it('accepts the final backend payload shape and triggered follow-ups', () => {
    const groups = groupInterviewQuestions(backendPlan.questions)
    expect(groups[0].questions[0].followUps[0]).toEqual({ trigger: '只描述团队成果', prompt: '请说明你个人负责的部分。' })
    expect(backendPlan.scorecard.dimensions[0].anchors.four).toBe('专家')
    expect(backendPlan.strategy.timeAllocation).toHaveLength(3)
  })
})
