import { json, mapJob } from './db.js';
import { synchronizeManualProfile } from './job-profile.js';
import { jobProfilePatchSchema } from './schema.js';

const decisionStatuses = new Set(['shortlisted', 'hold', 'rejected']);

function reevaluateCandidates({ db, queue, jobId, strategy }) {
  const all = db.prepare('SELECT id,status FROM candidates WHERE position_id=? ORDER BY created_at').all(jobId);
  const selected = strategy === 'none'
    ? []
    : strategy === 'all' ? all : all.filter((candidate) => !decisionStatuses.has(candidate.status));
  let queued = 0;
  let skipped = 0;
  let preservedDecisions = 0;
  for (const candidate of selected) {
    const preserveDecision = decisionStatuses.has(candidate.status);
    if (preserveDecision) preservedDecisions += 1;
    const taskCount = queue.enqueue(candidate.id, { force: true, preserveDecision });
    taskCount ? queued += 1 : skipped += 1;
  }
  return {
    strategy,
    candidates: all.length,
    selected: selected.length,
    queued,
    skipped,
    preservedDecisions,
  };
}

export function registerJobProfileRoutes({ app, db, queue, notFound }) {
  const patchProfile = (req, res) => {
    const current = mapJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id));
    if (!current) throw notFound('职位');
    const parsed = jobProfilePatchSchema.parse(req.body);
    const jobProfile = synchronizeManualProfile(parsed.jobProfile);
    const { reevaluateStrategy } = parsed;
    const updatedAt = new Date().toISOString();
    const version = current.jobProfileVersion + 1;
    db.prepare(`UPDATE jobs SET job_profile=?,job_profile_version=?,job_profile_source='manual',
      job_profile_updated_at=?,updated_at=? WHERE id=?`)
      .run(json(jobProfile), version, updatedAt, updatedAt, current.id);
    const reevaluation = reevaluateCandidates({ db, queue, jobId: current.id, strategy: reevaluateStrategy });
    const job = mapJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(current.id));
    res.json({ job, reevaluation });
  };
  app.patch('/api/jobs/:id/profile', patchProfile);
  app.patch('/api/positions/:id/profile', patchProfile);
}
