import { json } from './db.js';
import { analyzeJobMock } from './providers/mock.js';
import { jobProfileSchema } from './schema.js';

export async function generateJobProfile({ db, provider, job, persist = true }) {
  const raw = provider.analyzeJob
    ? await provider.analyzeJob({ job })
    : analyzeJobMock({ job });
  const profile = jobProfileSchema.parse(raw);
  const analyzedAt = new Date().toISOString();
  const version = (job.jobProfileVersion ?? 0) + 1;
  if (persist) {
    db.prepare(`UPDATE jobs SET job_profile=?,job_profile_version=?,job_profile_analyzed_at=?,
      job_profile_source='agent',job_profile_updated_at=?,updated_at=? WHERE id=?`)
      .run(json(profile), version, analyzedAt, analyzedAt, analyzedAt, job.id);
  }
  return { profile, version, analyzedAt, source: 'agent', updatedAt: analyzedAt };
}

export function synchronizeManualProfile(profile) {
  const dimensions = profile.dimensions.map((dimension) => {
    const usedCriterionIds = new Set();
    const criteria = dimension.requirements.map((requirement, index) => {
      const existing = dimension.criteria.find((criterion) => criterion.text === requirement && !usedCriterionIds.has(criterion.id))
        ?? (usedCriterionIds.has(dimension.criteria[index]?.id) ? null : dimension.criteria[index]);
      let id = existing?.id ?? `${dimension.id}_criterion_${index + 1}`;
      while (usedCriterionIds.has(id)) id = `${dimension.id}_criterion_${index + 2}`;
      usedCriterionIds.add(id);
      return {
        id,
        text: requirement,
        priority: existing?.priority ?? (dimension.mustHave ? 'must' : 'preferred'),
        proficiency: existing?.proficiency ?? null,
        minYears: existing?.minYears ?? null,
        evidenceQuote: existing?.text === requirement ? existing.evidenceQuote : `人工修订：${requirement}`,
      };
    });
    const source = dimension.requirements.join(' ');
    const retained = dimension.keywords.filter((keyword) => source.toLowerCase().includes(keyword.toLowerCase()));
    const derived = source.match(/[A-Za-z][A-Za-z0-9+#.-]{1,20}|[\u4e00-\u9fa5]{2,8}/g) ?? [];
    const keywords = [...new Set([...retained, ...derived])].slice(0, 12);
    return { ...dimension, criteria, keywords: keywords.length ? keywords : [dimension.name] };
  });
  const mustHaves = dimensions.filter((dimension) => dimension.mustHave).flatMap((dimension) => dimension.requirements);
  const niceToHaves = dimensions.filter((dimension) => !dimension.mustHave).flatMap((dimension) => dimension.requirements);
  return jobProfileSchema.parse({ ...profile, mustHaves, niceToHaves, dimensions });
}
