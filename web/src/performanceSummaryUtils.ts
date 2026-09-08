import type { Candidate } from './types'

const uncertaintyPattern = /待核验|待确认|待验证|需.{0,16}(核验|确认|复核|验证)|证据不足|证据不充分|缺乏.{0,4}证据|缺少.{0,4}证据|未.{0,6}(识别|明确|展示|提供|说明|证明|体现)|不明确|unknown/i
const unique = (items: string[]) => [...new Set(items.filter(Boolean))]

export interface DimensionConcernGroup {
  id: string
  name: string
  score: number | null
  weight: number | null
  gaps: string[]
  risks: string[]
  pending: string[]
  severity: 'high' | 'medium' | 'pending'
}

export function buildPerformanceSummary(candidate: Candidate) {
  const dimensions = candidate.dimensions || []
  const allIssues = [...(candidate.gaps || []), ...(candidate.risks || []), ...dimensions.flatMap((item) => [...(item.gaps || []), ...(item.risks || [])])]
  const requirementItems = dimensions.flatMap((dimension) => dimension.requirementMatches.map((match, index) => ({
    status: match.status,
    label: dimension.requirements[index] || match.requirementId,
    notes: match.notes,
  })))
  const pending = allIssues.filter((item) => uncertaintyPattern.test(item))
  pending.push(...requirementItems.filter((item) => item.status === 'unknown').map((item) => item.notes || `${item.label}：暂无充分证据`))
  const confirmed = allIssues.filter((item) => !uncertaintyPattern.test(item))
  confirmed.push(...requirementItems.filter((item) => item.status === 'not_met').map((item) => item.notes || item.label))
  return { strengths: unique(candidate.strengths || []), confirmed: unique(confirmed), pending: unique(pending), dimensionGroups: buildDimensionConcernGroups(candidate) }
}

export function buildDimensionConcernGroups(candidate: Candidate): DimensionConcernGroup[] {
  const dimensions = candidate.dimensions || []
  const groupedItems = new Set<string>()
  const groups = dimensions.map((dimension) => {
    const requirements = dimension.requirementMatches || []
    const rawGaps = [...(dimension.gaps || []), ...requirements.filter((item) => item.status === 'not_met').map((item, index) => item.notes || dimension.requirements[index] || item.requirementId)]
    const rawRisks = dimension.risks || []
    const pending = unique([...rawGaps, ...rawRisks].filter(isUncertain).concat(requirements.filter((item) => item.status === 'unknown').map((item, index) => item.notes || `${dimension.requirements[index] || item.requirementId}：暂无充分证据`)))
    const gaps = unique(rawGaps.filter((item) => !isUncertain(item)))
    const risks = unique(rawRisks.filter((item) => !isUncertain(item)))
    ;[...rawGaps, ...rawRisks].forEach((item) => groupedItems.add(item))
    return createGroup(dimension.id || dimension.name, dimension.name, dimension.score, dimension.weight, gaps, risks, pending)
  }).filter(hasConcerns)

  const generalIssues = [...(candidate.gaps || []), ...(candidate.risks || [])].filter((item) => !groupedItems.has(item))
  const general = createGroup('general', '综合与跨维度事项', null, null,
    unique((candidate.gaps || []).filter((item) => generalIssues.includes(item) && !isUncertain(item))),
    unique((candidate.risks || []).filter((item) => generalIssues.includes(item) && !isUncertain(item))),
    unique(generalIssues.filter(isUncertain)))
  if (hasConcerns(general)) groups.push(general)
  return groups.sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || (left.score ?? 11) - (right.score ?? 11))
}

function createGroup(id: string, name: string, score: number | null, weight: number | null, gaps: string[], risks: string[], pending: string[]): DimensionConcernGroup {
  const severity = score !== null && score < 6 || gaps.length + risks.length >= 3 ? 'high' : gaps.length || risks.length ? 'medium' : 'pending'
  return { id, name, score, weight, gaps, risks, pending, severity }
}

function hasConcerns(group: DimensionConcernGroup) { return group.gaps.length + group.risks.length + group.pending.length > 0 }
function isUncertain(value: string) { return uncertaintyPattern.test(value) }
function severityRank(value: DimensionConcernGroup['severity']) { return value === 'high' ? 0 : value === 'medium' ? 1 : 2 }
