import { describe, expect, it } from 'vitest'
import { buildPerformanceSummary } from './performanceSummaryUtils'
import type { Candidate } from './types'

describe('buildPerformanceSummary', () => {
  it('keeps unknown requirements separate from confirmed shortcomings', () => {
    const candidate = { id: '1', name: '候选人', jobId: 'job', status: 'reviewed', strengths: ['交付经验'], gaps: ['缺少管理经验'], risks: ['关键必须项证据不足，需人工复核'], dimensions: [{ id: 'skills', name: '技能', score: 6, weight: 1, requirements: ['TypeScript'], evidence: [], gaps: [], risks: [], requirementMatches: [{ requirementId: 'skills_1', status: 'unknown', evidence: [], notes: '未提供代码样例' }] }] } satisfies Candidate
    const result = buildPerformanceSummary(candidate)
    expect(result.confirmed).toContain('缺少管理经验')
    expect(result.confirmed).not.toContain('未提供代码样例')
    expect(result.pending).toEqual(expect.arrayContaining(['关键必须项证据不足，需人工复核', '未提供代码样例']))
  })

  it('classifies an uncertain top-level gap only as pending verification', () => {
    const candidate = { id: '2', name: '候选人', jobId: 'job', status: 'reviewed', gaps: ['管理经验待核验', '未展示课程体系', '缺乏直接证据', '该能力需验证', '未完整体现授课闭环', '相关数字需通过技术材料或案例追问验证', '明确缺少团队管理经验'] } satisfies Candidate
    const result = buildPerformanceSummary(candidate)
    expect(result.pending).toEqual(expect.arrayContaining(['管理经验待核验', '未展示课程体系', '缺乏直接证据', '该能力需验证', '未完整体现授课闭环', '相关数字需通过技术材料或案例追问验证']))
    expect(result.confirmed).not.toEqual(expect.arrayContaining(['未展示课程体系', '缺乏直接证据', '该能力需验证']))
    expect(result.confirmed).toContain('明确缺少团队管理经验')
  })

  it('groups shortcomings and risks under their assessment dimension', () => {
    const candidate = { id: '3', name: '候选人', jobId: 'job', status: 'reviewed', risks: ['跨团队协作存在风险'], dimensions: [{ id: 'delivery', name: '项目交付', score: 5, weight: .6, requirements: ['独立交付'], evidence: [], gaps: ['缺少完整交付案例'], risks: ['项目规模偏小'], requirementMatches: [{ requirementId: 'delivery_1', status: 'unknown', evidence: [], notes: '交付结果待核验' }] }] } satisfies Candidate
    const result = buildPerformanceSummary(candidate)
    expect(result.dimensionGroups[0]).toMatchObject({ id: 'delivery', name: '项目交付', severity: 'high', gaps: ['缺少完整交付案例'], risks: ['项目规模偏小'], pending: ['交付结果待核验'] })
    expect(result.dimensionGroups.at(-1)).toMatchObject({ id: 'general', risks: ['跨团队协作存在风险'] })
  })
})
