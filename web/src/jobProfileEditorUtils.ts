import type { JobProfile } from './types'

export function validateJobProfile(profile: JobProfile) {
  const errors: string[] = []
  if (profile.dimensions.length !== 5) errors.push('岗位画像必须恰好包含 5 个评估维度')
  const total = profile.dimensions.reduce((sum, item) => sum + Number(item.weight || 0), 0)
  if (Math.abs(total - 1) > 0.001) errors.push(`维度权重合计需为 100%，当前为 ${Math.round(total * 10000) / 100}%`)
  profile.dimensions.forEach((dimension, index) => {
    const label = `维度 ${index + 1}`
    if (!dimension.name.trim()) errors.push(`${label}名称不能为空`)
    if (!dimension.description.trim()) errors.push(`${label}描述不能为空`)
    if (!Number.isFinite(dimension.weight) || dimension.weight < 0.1 || dimension.weight > 0.35) errors.push(`${label}权重需在 10% 至 35% 之间`)
    if (!dimension.requirements.some((item) => item.trim())) errors.push(`${label}至少需要一项评估要求`)
    if (dimension.criteria?.some((item) => !item.text.trim())) errors.push(`${label}的细化评估标准不能为空`)
  })
  return errors
}

export function cleanJobProfile(profile: JobProfile): JobProfile {
  return {
    ...profile,
    dimensions: profile.dimensions.map((dimension) => ({
      ...dimension,
      name: dimension.name.trim(),
      description: dimension.description.trim(),
      requirements: dimension.requirements.map((item) => item.trim()).filter(Boolean),
      criteria: dimension.criteria?.map((criterion) => ({ ...criterion, text: criterion.text.trim() })),
    })),
  }
}

export const weightPercent = (profile: JobProfile) => Math.round(profile.dimensions.reduce((sum, item) => sum + Number(item.weight || 0), 0) * 10000) / 100
