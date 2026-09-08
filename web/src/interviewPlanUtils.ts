import type { InterviewQuestion } from './types'

const priorityRank = { high: 0, medium: 1, low: 2 }

export function groupInterviewQuestions(questions: InterviewQuestion[]) {
  const sorted = questions.map((question, index) => ({ question, index }))
    .sort((a, b) => Number(b.question.required) - Number(a.question.required) || priorityRank[a.question.priority] - priorityRank[b.question.priority] || a.index - b.index)
  const groups = new Map<string, { dimensionId: string; dimensionName: string; questions: InterviewQuestion[] }>()
  sorted.forEach(({ question }) => {
    const key = question.dimensionId || question.dimensionName
    const group = groups.get(key) || { dimensionId: question.dimensionId, dimensionName: question.dimensionName, questions: [] }
    group.questions.push(question)
    groups.set(key, group)
  })
  return [...groups.values()]
}
