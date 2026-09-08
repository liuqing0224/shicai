import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('独立面试设计阶段', () => {
  let api;

  beforeEach(() => { api = createApp({ database: ':memory:', provider: 'mock', concurrency: 2 }); });
  afterEach(() => api.db.close());

  async function createJob() {
    return (await request(api.app).post('/api/jobs').send({
      name: '高级后端工程师', jd: '需要 5 年 Node.js、SQLite、API 设计与项目交付经验',
    }).expect(201)).body;
  }

  async function createCandidate(job, name = '面试候选人') {
    return (await request(api.app).post('/api/candidates').send({
      positionId: job.id, name, resumeText: '5年 Node.js 后端经验，使用 SQLite 设计 API 并完成生产交付。',
    }).expect(201)).body;
  }

  it('正常队列按 parse -> evaluate -> review -> interview 执行', async () => {
    const job = await createJob();
    const candidate = await createCandidate(job);
    await api.queue.waitForIdle();
    const detail = (await request(api.app).get(`/api/candidates/${candidate.id}`).expect(200)).body;
    assert.equal(detail.status, 'reviewed');
    assert.deepEqual(detail.tasks.map((task) => task.stage), ['parse', 'evaluate', 'review', 'interview']);
    assert.ok(detail.tasks.every((task) => task.status === 'completed'));
    assert.ok(detail.interviewPlanCreatedAt);
    assert.equal(detail.interviewPlan.questions.length, 10);
    assert.equal(detail.interviewPlan.questions.filter((question) => question.required).length, 8);
    assert.ok(detail.interviewPlan.questions.every((question) => question.expectedMinutes > 0));
    assert.ok(detail.interviewPlan.questions.every((question) => question.followUps.every((followUp) => followUp.trigger && followUp.prompt)));
    assert.deepEqual(
      detail.interviewPlan.scorecard.dimensions.map((dimension) => dimension.dimensionId),
      job.jobProfile.dimensions.map((dimension) => dimension.id),
    );
  });

  it('可只重新生成单人面试指南而不重跑评分', async () => {
    const job = await createJob();
    const candidate = await createCandidate(job);
    await api.queue.waitForIdle();
    const before = (await request(api.app).get(`/api/candidates/${candidate.id}`).expect(200)).body;
    await request(api.app).patch(`/api/candidates/${candidate.id}/status`).send({ status: 'passed' }).expect(200);
    await request(api.app).post(`/api/candidates/${candidate.id}/interview`).send({ force: true }).expect(202, { queued: 1 });
    await api.queue.waitForIdle();
    const after = (await request(api.app).get(`/api/candidates/${candidate.id}`).expect(200)).body;
    assert.deepEqual(after.report, before.report);
    assert.equal(after.status, 'passed');
    assert.equal(after.tasks.filter((task) => task.stage === 'interview').length, 2);
    assert.equal(after.tasks.filter((task) => task.stage !== 'interview').length, 3);
  });

  it('可按职位批量只重建面试指南', async () => {
    const job = await createJob();
    await createCandidate(job, '候选人甲');
    await createCandidate(job, '候选人乙');
    await api.queue.waitForIdle();
    const response = await request(api.app).post(`/api/jobs/${job.id}/interviews`).send({ force: true }).expect(202);
    assert.deepEqual(response.body, { candidates: 2, queued: 2, skipped: 0, force: true });
    await api.queue.waitForIdle();
    const tasks = (await request(api.app).get('/api/tasks').expect(200)).body;
    assert.equal(tasks.filter((task) => task.stage === 'parse').length, 2);
    assert.equal(tasks.filter((task) => task.stage === 'interview').length, 4);
  });

  it('interview-only 失败也不覆盖人工决策状态', async () => {
    const job = await createJob();
    const candidate = await createCandidate(job);
    await api.queue.waitForIdle();
    await request(api.app).patch(`/api/candidates/${candidate.id}/status`).send({ status: 'passed' }).expect(200);
    api.queue.provider.designInterview = async () => { throw new Error('面试设计临时失败'); };
    await request(api.app).post(`/api/candidates/${candidate.id}/interview`).send({ force: true }).expect(202);
    await api.queue.waitForIdle();
    const detail = (await request(api.app).get(`/api/candidates/${candidate.id}`).expect(200)).body;
    assert.equal(detail.status, 'passed');
    assert.match(detail.error, /面试设计临时失败/);
  });

  it('没有评估报告时拒绝 interview-only 任务', async () => {
    const job = await createJob();
    const candidate = await createCandidate(job);
    api.db.prepare("UPDATE tasks SET status='cancelled' WHERE candidate_id=? AND status='queued'").run(candidate.id);
    api.db.prepare('UPDATE candidates SET report=NULL WHERE id=?').run(candidate.id);
    await request(api.app).post(`/api/candidates/${candidate.id}/interview`).expect(409);
  });
});
