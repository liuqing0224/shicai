import type { JobProfile } from './types'

export function jobProfileChartData(profile: JobProfile) {
  return profile.dimensions.map((dimension) => ({
    id: dimension.id,
    name: dimension.name,
    weight: Math.round(dimension.weight * 100),
  }))
}

export function jobProfileChartMax(profile: JobProfile) {
  const maxWeight = Math.max(0, ...jobProfileChartData(profile).map((item) => item.weight))
  return Math.max(30, Math.ceil(maxWeight / 10) * 10)
}
