import { describe, expect, it } from 'vitest'
import { jobProfileChartData, jobProfileChartMax } from './jobProfileUtils'
import type { JobProfile } from './types'

describe('jobProfileChartData', () => {
  it('uses dimension weight percentages for radar values', () => {
    const profile = { summary: '', seniority: '', responsibilities: [], mustHaves: [], niceToHaves: [], dimensions: [{ id: 'skills', name: '专业能力', description: '', weight: 0.35, requirements: [], mustHave: true }, { id: 'experience', name: '相关经验', description: '', weight: 0.65, requirements: [], mustHave: false }] } satisfies JobProfile
    expect(jobProfileChartData(profile)).toEqual([{ id: 'skills', name: '专业能力', weight: 35 }, { id: 'experience', name: '相关经验', weight: 65 }])
    expect(jobProfileChartMax(profile)).toBe(70)
  })

  it('uses a readable minimum radial maximum for balanced profiles', () => {
    const profile = { summary: '', seniority: '', responsibilities: [], mustHaves: [], niceToHaves: [], dimensions: [{ id: 'a', name: 'A', description: '', weight: 0.27, requirements: [], mustHave: true }] } satisfies JobProfile
    expect(jobProfileChartMax(profile)).toBe(30)
  })
})
