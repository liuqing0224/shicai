import { describe, expect, it } from 'vitest'
import { cleanJobProfile, validateJobProfile, weightPercent } from './jobProfileEditorUtils'
import type { JobProfile } from './types'

const profile = (): JobProfile => ({
  summary: '画像', seniority: '高级', responsibilities: [], mustHaves: [], niceToHaves: [],
  dimensions: Array.from({ length: 5 }, (_, index) => ({
    id: `dimension_${index + 1}`, name: `维度 ${index + 1}`, description: '说明', weight: 0.2,
    requirements: [' 要求 '], keywords: ['保留关键词'], mustHave: index === 0,
    criteria: [{ id: `c${index}`, text: ' 标准 ', priority: 'must', evidenceQuote: 'JD 原文' }],
  })),
})

describe('job profile editor validation', () => {
  it('accepts five complete dimensions whose weights total 100%', () => {
    expect(validateJobProfile(profile())).toEqual([])
    expect(weightPercent(profile())).toBe(100)
  })

  it('reports dimension count, weight and empty requirement errors', () => {
    const value = profile()
    value.dimensions.pop()
    value.dimensions[0].requirements = ['   ']
    expect(validateJobProfile(value)).toEqual(expect.arrayContaining([
      '岗位画像必须恰好包含 5 个评估维度',
      '维度权重合计需为 100%，当前为 80%',
      '维度 1至少需要一项评估要求',
    ]))
  })

  it('trims editable text without discarding detailed criteria', () => {
    const cleaned = cleanJobProfile(profile())
    expect(cleaned.dimensions[0].requirements).toEqual(['要求'])
    expect(cleaned.dimensions[0].criteria?.[0]).toMatchObject({ text: '标准', evidenceQuote: 'JD 原文' })
    expect(cleaned.dimensions[0].keywords).toEqual(['保留关键词'])
  })
})
