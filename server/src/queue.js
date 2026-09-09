import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { json, mapCandidate, mapJob, mapTask, parseJson } from './db.js';
import { designInterviewMock } from './providers/mock.js';
import { alignedInterviewPlanSchema, normalizeAlignedReport, parsedProfileSchema } from './schema.js';
import { normalizeInterviewEvaluation } from './interview-evaluation.js';

const stages = ['parse', 'evaluate', 'review', 'interview'];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class EvaluationQueue extends EventEmitter {
  constructor({ db, provider, generateJobProfile, concurrency = 1, maxAttempts = 3, retryDelayMs = 1500, autoStart = true }) {
    super();
    this.db = db;
    this.provider = provider;
    this.generateJobProfile = generateJobProfile;
    this.concurrency = concurrency;
    this.maxAttempts = maxAttempts;
    this.retryDelayMs = retryDelayMs;
    this.autoStart = autoStart;
    this.active = 0;
    this.scheduled = false;
    db.prepare("UPDATE tasks SET status = 'queued', started_at = NULL WHERE status = 'running'").run();
    db.prepare("UPDATE candidates SET status = 'pending' WHERE status = 'evaluating' AND id NOT IN (SELECT candidate_id FROM tasks WHERE status = 'completed' AND stage = 'review')").run();
    this.recoverFailedTasks();
    if (autoStart && this.nextTask()) this.kick();
  }

  recoverFailedTasks() {
    const retryable = this.db.prepare("SELECT * FROM tasks WHERE status='failed' AND attempt < ? ORDER BY completed_at").all(this.maxAttempts);
    const transaction = this.db.transaction(() => {
      for (const task of retryable) {
        this.db.prepare("UPDATE tasks SET status='queued',started_at=NULL,completed_at=NULL WHERE id=? AND status='failed'").run(task.id);
        this.db.prepare("UPDATE tasks SET status='queued',error=NULL,completed_at=NULL WHERE candidate_id=? AND created_at=? AND status='cancelled' AND error LIKE '前置阶段 % 失败'")
          .run(task.candidate_id, task.created_at);
        const siblingCount = this.db.prepare('SELECT COUNT(*) count FROM tasks WHERE candidate_id=? AND created_at=? AND id<>?').get(task.candidate_id, task.created_at, task.id).count;
        if (task.stage !== 'interview-evaluate' && !(task.stage === 'interview' && siblingCount === 0)) {
          this.db.prepare("UPDATE candidates SET status='pending',error=NULL,updated_at=? WHERE id=?").run(new Date().toISOString(), task.candidate_id);
        }
      }
    });
    transaction();
    return retryable.length;
  }

  enqueue(candidateId, { force = false, preserveDecision = false } = {}) {
    const candidate = this.db.prepare('SELECT id,status FROM candidates WHERE id = ?').get(candidateId);
    if (!candidate) throw Object.assign(new Error('候选人不存在'), { statusCode: 404 });
    const pending = this.db.prepare("SELECT COUNT(*) count FROM tasks WHERE candidate_id = ? AND status IN ('queued','running')").get(candidateId).count;
    if (pending && !force) return 0;
    const now = new Date().toISOString();
    const preservedStatus = preserveDecision && ['shortlisted', 'hold', 'rejected'].includes(candidate.status) ? candidate.status : null;
    const input = preservedStatus ? json({ preserveDecisionStatus: preservedStatus }) : null;
    const insert = this.db.prepare('INSERT INTO tasks (id,candidate_id,stage,status,attempt,input,created_at) VALUES (?,?,?,?,0,?,?)');
    const transaction = this.db.transaction(() => {
      if (force) this.db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = ? WHERE candidate_id = ? AND status IN ('queued','running')").run(now, candidateId);
      for (const stage of stages) insert.run(randomUUID(), candidateId, stage, 'queued', input, now);
      if (force) {
        if (preservedStatus) {
          this.db.prepare('UPDATE candidates SET parsed_profile=NULL,report=NULL,interview_plan=NULL,interview_plan_created_at=NULL,interview_evaluation=NULL,interview_evaluation_created_at=NULL,error=NULL,updated_at=? WHERE id=?').run(now, candidateId);
        } else {
          this.db.prepare("UPDATE candidates SET status='pending',parsed_profile=NULL,report=NULL,interview_plan=NULL,interview_plan_created_at=NULL,interview_evaluation=NULL,interview_evaluation_created_at=NULL,error=NULL,updated_at=? WHERE id=?").run(now, candidateId);
        }
      } else {
        this.db.prepare("UPDATE candidates SET status='pending',error=NULL,updated_at=? WHERE id=?").run(now, candidateId);
      }
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

  enqueueInterviewEvaluation(candidateId, transcript, { force = false } = {}) {
    const candidate = this.db.prepare('SELECT id,report,interview_plan,interview_transcript,interview_evaluation,interview_evaluation_generation FROM candidates WHERE id=?').get(candidateId);
    if (!candidate) throw Object.assign(new Error('候选人不存在'), { statusCode: 404 });
    if (!candidate.report || !candidate.interview_plan) throw Object.assign(new Error('需要已复核报告和面试计划才能评价面试'), { statusCode: 409 });
    const otherPending = this.db.prepare("SELECT COUNT(*) count FROM tasks WHERE candidate_id=? AND stage <> 'interview-evaluate' AND status IN ('queued','running')").get(candidateId).count;
    if (otherPending) throw Object.assign(new Error('候选人其他评估任务仍在运行'), { statusCode: 409 });
    const pending = this.db.prepare("SELECT COUNT(*) count FROM tasks WHERE candidate_id=? AND stage='interview-evaluate' AND status IN ('queued','running')").get(candidateId).count;
    if (pending && !force) return 0;
    if (!force && candidate.interview_evaluation && candidate.interview_transcript === transcript) return 0;
    const createdAt = new Date().toISOString();
    const generation = candidate.interview_evaluation_generation + 1;
    const transaction = this.db.transaction(() => {
      if (force) this.db.prepare("UPDATE tasks SET status='cancelled',completed_at=? WHERE candidate_id=? AND stage='interview-evaluate' AND status IN ('queued','running')").run(createdAt, candidateId);
      this.db.prepare("INSERT INTO tasks (id,candidate_id,stage,status,attempt,input,created_at) VALUES (?,?,'interview-evaluate','queued',0,?,?)")
        .run(randomUUID(), candidateId, json({ generation, transcript }), createdAt);
      this.db.prepare('UPDATE candidates SET interview_transcript=?,interview_evaluation=NULL,interview_evaluation_created_at=NULL,interview_evaluation_generation=?,updated_at=? WHERE id=?')
        .run(transcript, generation, createdAt, candidateId);
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
    const standaloneEvaluation = task.stage === 'interview-evaluate';
    const evaluationInput = standaloneEvaluation ? task.input : null;
    const preservedStatus = task.input?.preserveDecisionStatus ?? null;
    const candidate = mapCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(task.candidateId));
    let job = mapJob(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(candidate.positionId));
    const now = new Date().toISOString();
    if (!standaloneInterview && !standaloneEvaluation && !preservedStatus) this.db.prepare("UPDATE candidates SET status = 'evaluating', error = NULL, updated_at = ? WHERE id = ?").run(now, candidate.id);
    try {
      let output;
      if (task.stage === 'parse') output = await this.provider.parse({ candidate, job });
      if ((task.stage === 'evaluate' || task.stage === 'review' || task.stage === 'interview' || task.stage === 'interview-evaluate') && !job.jobProfile) {
        await this.generateJobProfile(job);
        job = mapJob(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(candidate.positionId));
      }
      if (task.stage === 'evaluate') output = await this.provider.evaluate({ candidate, job, jobProfile: job.jobProfile, parsedProfile: candidate.parsedProfile });
      if (task.stage === 'review') output = await this.provider.review({ candidate, job, jobProfile: job.jobProfile, report: candidate.report });
      if (task.stage === 'interview') {
        const design = this.provider.designInterview?.bind(this.provider) ?? designInterviewMock;
        output = await design({ candidate, job, jobProfile: job.jobProfile, parsedProfile: candidate.parsedProfile, report: candidate.report });
      }
      if (task.stage === 'interview-evaluate') {
        if (typeof this.provider.evaluateInterview !== 'function') throw new Error('当前 Agent provider 不支持面试记录评价');
        output = await this.provider.evaluateInterview({
          candidate, job, jobProfile: job.jobProfile, parsedProfile: candidate.parsedProfile,
          report: candidate.report, interviewPlan: candidate.interviewPlan, transcript: evaluationInput?.transcript,
        });
      }
      if (task.stage === 'parse') output = parsedProfileSchema.parse(output);
      if (task.stage === 'evaluate' || task.stage === 'review') output = normalizeAlignedReport(output, job.jobProfile);
      if (task.stage === 'interview') output = alignedInterviewPlanSchema(job.jobProfile).parse(output);
      if (task.stage === 'interview-evaluate') output = normalizeInterviewEvaluation(output, job.jobProfile);
      const completedAt = new Date().toISOString();
      const transaction = this.db.transaction(() => {
        const completed = this.db.prepare("UPDATE tasks SET status = 'completed', output = ?, error = NULL, completed_at = ? WHERE id = ? AND status = 'running'").run(json(output), completedAt, task.id);
        if (!completed.changes) return;
        if (task.stage === 'parse') this.db.prepare('UPDATE candidates SET parsed_profile = ?, updated_at = ? WHERE id = ?').run(json(output), completedAt, candidate.id);
        if (task.stage === 'evaluate') this.db.prepare('UPDATE candidates SET report = ?, updated_at = ? WHERE id = ?').run(json(output), completedAt, candidate.id);
        if (task.stage === 'review') this.db.prepare('UPDATE candidates SET report = ?, updated_at = ? WHERE id = ?').run(json(output), completedAt, candidate.id);
        if (task.stage === 'interview' && standaloneInterview) this.db.prepare('UPDATE candidates SET interview_plan = ?, interview_plan_created_at = ?, error = NULL, updated_at = ? WHERE id = ?').run(json(output), completedAt, completedAt, candidate.id);
        if (task.stage === 'interview' && !standaloneInterview) {
          if (preservedStatus) {
            this.db.prepare('UPDATE candidates SET interview_plan=?,interview_plan_created_at=?,error=NULL,updated_at=? WHERE id=?')
              .run(json(output), completedAt, completedAt, candidate.id);
          } else {
            this.db.prepare("UPDATE candidates SET interview_plan=?,interview_plan_created_at=?,status='evaluated',error=NULL,updated_at=? WHERE id=?")
              .run(json(output), completedAt, completedAt, candidate.id);
          }
        }
        if (task.stage === 'interview-evaluate') this.db.prepare('UPDATE candidates SET interview_evaluation=?,interview_evaluation_created_at=?,updated_at=? WHERE id=? AND interview_evaluation_generation=?')
          .run(json(output), completedAt, completedAt, candidate.id, evaluationInput.generation);
      });
      transaction();
    } catch (error) {
      const failedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      const currentAttempt = task.attempt + 1;
      if (currentAttempt < this.maxAttempts) {
        const retryIn = this.retryDelayMs * (2 ** (currentAttempt - 1));
        if (retryIn) await delay(retryIn);
        const retryMessage = `自动修复中（${currentAttempt}/${this.maxAttempts}）：${message}`;
        const transaction = this.db.transaction(() => {
          const queued = this.db.prepare("UPDATE tasks SET status='queued',error=?,started_at=NULL,completed_at=NULL WHERE id=? AND status='running'")
            .run(retryMessage, task.id);
          if (!queued.changes || standaloneEvaluation) return;
          this.db.prepare('UPDATE candidates SET error=?,updated_at=? WHERE id=?').run(retryMessage, failedAt, candidate.id);
        });
        transaction();
        return;
      }
      const transaction = this.db.transaction(() => {
        const failed = this.db.prepare("UPDATE tasks SET status = 'failed', error = ?, completed_at = ? WHERE id = ? AND status = 'running'").run(message, failedAt, task.id);
        if (!failed.changes) return;
        this.db.prepare("UPDATE tasks SET status = 'cancelled', error = ?, completed_at = ? WHERE candidate_id = ? AND status = 'queued'").run(`前置阶段 ${task.stage} 失败`, failedAt, candidate.id);
        if (standaloneEvaluation) return;
        if (preservedStatus) {
          this.db.prepare('UPDATE candidates SET error=?,updated_at=? WHERE id=?').run(message, failedAt, candidate.id);
          return;
        }
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
