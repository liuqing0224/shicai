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
    db.prepare(`UPDATE jobs SET job_profile = ?, job_profile_version = ?, job_profile_analyzed_at = ?, updated_at = ? WHERE id = ?`)
      .run(json(profile), version, analyzedAt, analyzedAt, job.id);
  }
  return { profile, version, analyzedAt };
}
