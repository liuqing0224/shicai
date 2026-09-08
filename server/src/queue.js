import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { json, mapCandidate, mapJob, mapTask, parseJson } from './db.js';
import { designInterviewMock } from './providers/mock.js';
import { alignedInterviewPlanSchema, normalizeAlignedReport, parsedProfileSchema } from './schema.js';

const stages = ['parse', 'evaluate', 'review', 'interview'];

export class EvaluationQueue extends EventEmitter {
  constructor({ db, provider, generateJobProfile, concurrency = 1, autoStart = true }) {
    super();
    this.db = db;
    this.provider = provider;
    this.generateJobProfile = generateJobProfile;
    this.concurrency = concurrency;
    this.autoStart = autoStart;
    this.active = 0;
    this.scheduled = false;
    db.prepare("UPDATE tasks SET status = 'queued', started_at = NULL WHERE status = 'running'").run();
    db.prepare("UPDATE candidates SET status = 'pending' WHERE status = 'evaluating' AND id NOT IN (SELECT candidate_id FROM tasks WHERE status = 'completed' AND stage = 'review')").run();
    if (autoStart && this.nextTask()) this.kick();
  }

  enqueue(candidateId, { force = false } = {}) {
    const candidate = this.db.prepare('SELECT id FROM candidates WHERE id = ?').get(candidateId);
    if (!candidate) throw Object.assign(new Error('候选人不存在'), { statusCode: 404 });
    const pending = this.db.prepare("SELECT COUNT(*) count FROM tasks WHERE candidate_id = ? AND status IN ('queued','running')").get(candidateId).count;
    if (pending && !force) return 0;
    const now = new Date().toISOString();
    const insert = this.db.prepare('INSERT INTO tasks (id, candidate_id, stage, status, attempt, created_at) VALUES (?, ?, ?, ?, 0, ?)');
    const transaction = this.db.transaction(() => {
      if (force) this.db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = ? WHERE candidate_id = ? AND status IN ('queued','running')").run(now, candidateId);
      for (const stage of stages) insert.run(randomUUID(), candidateId, stage, 'queued', now);
      this.db.prepare("UPDATE candidates SET status = 'pending', error = NULL, updated_at = ? WHERE id = ?").run(now, candidateId);
    });
    transaction();
    if (this.autoStart) this.kick();
    return stages.length;
  }

  enqueueInterview(candidateId, { force = false } = {}) {
    const candidate = this.db.prepare('SELECT id, report, interview_plan FROM candidates WHERE id = ?').get(candidateId);
    if (!candidate) throw Object.assign(new Error('候选人不存在'), { statusCode: 404 });
    if (!candidate.report) throw Object.assign(new Error('候选人尚无已复核评估报告'), { statusCode: 409 });
    const scoring = this.db.prepare("SELECT COUNT(*) count FROM tasks WHERE candidate_id = ? AND stage <> 'interview' AND status IN ('queued','running')").get(candidateId).count;
    if (scoring) throw Object.assign(new Error('候选人评分任务仍在运行'), { statusCode: 409 });
    const pending = this.db.prepare("SELECT COUNT(*) count FROM tasks WHERE candidate_id = ? AND stage = 'interview' AND status IN ('queued','running')").get(candidateId).count;
    if (pending || (candidate.interview_plan && !force)) return 0;
    const createdAt = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      if (force) this.db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = ? WHERE candidate_id = ? AND stage = 'interview' AND status IN ('queued','running')").run(createdAt, candidateId);
      this.db.prepare("INSERT INTO tasks (id,candidate_id,stage,status,attempt,created_at) VALUES (?,?,'interview','queued',0,?)").run(randomUUID(), candidateId, createdAt);
      this.db.prepare('UPDATE candidates SET error = NULL, updated_at = ? WHERE id = ?').run(createdAt, candidateId);
    });
    transaction();
    if (this.autoStart) this.kick();
    return 1;
  }

  kick() {
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      this.drain();
    });
  }

  nextTask() {
    return this.db.prepare(`
      SELECT t.* FROM tasks t
      WHERE t.status = 'queued'
      AND NOT EXISTS (
        SELECT 1 FROM tasks previous
        WHERE previous.candidate_id = t.candidate_id
          AND previous.created_at = t.created_at
          AND CASE previous.stage WHEN 'parse' THEN 1 WHEN 'evaluate' THEN 2 WHEN 'review' THEN 3 ELSE 4 END
              < CASE t.stage WHEN 'parse' THEN 1 WHEN 'evaluate' THEN 2 WHEN 'review' THEN 3 ELSE 4 END
          AND previous.status <> 'completed'
      )
      ORDER BY t.created_at, CASE t.stage WHEN 'parse' THEN 1 WHEN 'evaluate' THEN 2 WHEN 'review' THEN 3 ELSE 4 END
      LIMIT 1
    `).get();
  }

  drain() {
    while (this.active < this.concurrency) {
      const task = this.nextTask();
      if (!task) break;
      const claimed = this.db.prepare("UPDATE tasks SET status = 'running', attempt = attempt + 1, started_at = ? WHERE id = ? AND status = 'queued'").run(new Date().toISOString(), task.id);
      if (!claimed.changes) continue;
      this.active += 1;
      this.runTask(task).finally(() => {
        this.active -= 1;
        this.emit('settled', task.id);
        this.kick();
      });
    }
    if (this.active === 0 && !this.nextTask()) this.emit('idle');
  }

  async runTask(taskRow) {
    const task = mapTask(taskRow);
    const standaloneInterview = task.stage === 'interview' && this.db.prepare(
      "SELECT COUNT(*) count FROM tasks WHERE candidate_id = ? AND created_at = ? AND stage <> 'interview'",
    ).get(task.candidateId, task.createdAt).count === 0;
    const candidate = mapCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(task.candidateId));
    let job = mapJob(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(candidate.positionId));
    const now = new Date().toISOString();
    if (!standaloneInterview) this.db.prepare("UPDATE candidates SET status = 'evaluating', error = NULL, updated_at = ? WHERE id = ?").run(now, candidate.id);
    try {
      let output;
      if (task.stage === 'parse') output = await this.provider.parse({ candidate, job });
      if ((task.stage === 'evaluate' || task.stage === 'review' || task.stage === 'interview') && !job.jobProfile) {
        await this.generateJobProfile(job);
        job = mapJob(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(candidate.positionId));
      }
      if (task.stage === 'evaluate') output = await this.provider.evaluate({ candidate, job, jobProfile: job.jobProfile, parsedProfile: candidate.parsedProfile });
      if (task.stage === 'review') output = await this.provider.review({ candidate, job, jobProfile: job.jobProfile, report: candidate.report });
      if (task.stage === 'interview') {
        const design = this.provider.designInterview?.bind(this.provider) ?? designInterviewMock;
        output = await design({ candidate, job, jobProfile: job.jobProfile, parsedProfile: candidate.parsedProfile, report: candidate.report });
      }
      if (task.stage === 'parse') output = parsedProfileSchema.parse(output);
      if (task.stage === 'evaluate' || task.stage === 'review') output = normalizeAlignedReport(output, job.jobProfile);
      if (task.stage === 'interview') output = alignedInterviewPlanSchema(job.jobProfile).parse(output);
      const completedAt = new Date().toISOString();
      const transaction = this.db.transaction(() => {
        this.db.prepare("UPDATE tasks SET status = 'completed', output = ?, error = NULL, completed_at = ? WHERE id = ?").run(json(output), completedAt, task.id);
        if (task.stage === 'parse') this.db.prepare('UPDATE candidates SET parsed_profile = ?, updated_at = ? WHERE id = ?').run(json(output), completedAt, candidate.id);
        if (task.stage === 'evaluate') this.db.prepare('UPDATE candidates SET report = ?, updated_at = ? WHERE id = ?').run(json(output), completedAt, candidate.id);
        if (task.stage === 'review') this.db.prepare('UPDATE candidates SET report = ?, updated_at = ? WHERE id = ?').run(json(output), completedAt, candidate.id);
        if (task.stage === 'interview' && standaloneInterview) this.db.prepare('UPDATE candidates SET interview_plan = ?, interview_plan_created_at = ?, error = NULL, updated_at = ? WHERE id = ?').run(json(output), completedAt, completedAt, candidate.id);
        if (task.stage === 'interview' && !standaloneInterview) this.db.prepare("UPDATE candidates SET interview_plan = ?, interview_plan_created_at = ?, status = 'evaluated', error = NULL, updated_at = ? WHERE id = ?").run(json(output), completedAt, completedAt, candidate.id);
      });
      transaction();
    } catch (error) {
      const failedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      const transaction = this.db.transaction(() => {
        this.db.prepare("UPDATE tasks SET status = 'failed', error = ?, completed_at = ? WHERE id = ?").run(message, failedAt, task.id);
        this.db.prepare("UPDATE tasks SET status = 'cancelled', error = ?, completed_at = ? WHERE candidate_id = ? AND status = 'queued'").run(`前置阶段 ${task.stage} 失败`, failedAt, candidate.id);
        if (standaloneInterview) this.db.prepare('UPDATE candidates SET error = ?, updated_at = ? WHERE id = ?').run(message, failedAt, candidate.id);
        else this.db.prepare("UPDATE candidates SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(message, failedAt, candidate.id);
      });
      transaction();
    }
  }

  stats() {
    return this.db.prepare('SELECT status, COUNT(*) count FROM tasks GROUP BY status').all()
      .reduce((result, row) => ({ ...result, [row.status]: row.count }), { active: this.active });
  }

  waitForIdle(timeoutMs = 5000) {
    if (this.active === 0 && !this.nextTask()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('等待队列空闲超时')), timeoutMs);
      this.once('idle', () => { clearTimeout(timeout); resolve(); });
    });
  }
}
