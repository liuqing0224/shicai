import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { normalizeInterviewEvaluation } from '../src/interview-evaluation.js';

const transcript = '面试官：请介绍项目。候选人：我负责 Node.js API 设计，上线后错误率下降，并持续监控。';

function evaluationFor(profile, summary = '新评价', allUnassessed = false) {
  return {
    recommendation: allUnassessed ? 'conditional_pass' : 'reject', summary,
    strengths: [], concerns: [], notAssessed: [], claimVerifications: [], criticalGaps: [],
    assessedCoverageWeight: 1, weightedScore: 4,
    dimensions: profile.dimensions.map((dimension, index) => ({
      id: dimension.id, name: dimension.name, weight: dimension.weight,
      status: allUnassessed || index > 1 ? 'not_assessed' : index ? 'partial' : 'demonstrated',
      score: allUnassessed || index > 1 ? null : index ? 2 : 4,
      evidence: allUnassessed || index > 1 ? [] : ['候选人说明了个人决策与生产结果'],
      assessment: allUnassessed || index > 1 ? '面试未覆盖，不作负面判断。' : '有行为证据。',
    })),
  };
}

describe('面试记录评价', () => {
  let api;
  beforeEach(() => { api = createApp({ database: ':memory:', provider: 'mock', concurrency: 2 }); });
  afterEach(() => api.db.close());

  async function preparedCandidate() {
    const job = (await request(api.app).post('/api/jobs').send({
      name: '后端工程师', jd: '需要 Node.js、API 设计、生产交付和项目经验',
    }).expect(201)).body;
    const candidate = (await request(api.app).post('/api/candidates').send({
      positionId: job.id, name: '测试候选人', resumeText: '5年 Node.js API 设计与生产交付经验',
    }).expect(201)).body;
    await api.queue.waitForIdle();
    return { job, candidate };
  }

  it('异步生成评价、重算维度算术且不改变人工状态', async () => {
    const { job, candidate } = await preparedCandidate();
    await request(api.app).patch(`/api/candidates/${candidate.id}/status`).send({ status: 'hold' }).expect(200);
    const before = (await request(api.app).get(`/api/candidates/${candidate.id}`)).body;
    api.queue.provider.evaluateInterview = async () => evaluationFor(job.jobProfile);
    await request(api.app).post(`/api/candidates/${candidate.id}/interview-evaluation`).send({ transcript }).expect(202, { queued: 1 });
    await api.queue.waitForIdle();
    const after = (await request(api.app).get(`/api/candidates/${candidate.id}`).expect(200)).body;
    assert.equal(after.status, 'hold');
    assert.deepEqual(after.report, before.report);
    assert.equal(after.syncStatus, before.syncStatus);
    assert.equal(after.interviewTranscript, transcript);
    assert.ok(after.interviewEvaluationCreatedAt);
    assert.deepEqual(after.interviewEvaluation.dimensions.map(({ id }) => id), job.jobProfile.dimensions.map(({ id }) => id));
    const expectedCoverage = Math.round(job.jobProfile.dimensions.slice(0, 2)
      .reduce((sum, dimension) => sum + dimension.weight, 0) * 10_000) / 10_000;
    const expectedScore = Math.round((4 * job.jobProfile.dimensions[0].weight + 2 * job.jobProfile.dimensions[1].weight)
      / expectedCoverage * 100) / 100;
    assert.equal(after.interviewEvaluation.assessedCoverageWeight, expectedCoverage);
    assert.equal(after.interviewEvaluation.weightedScore, expectedScore);
    assert.deepEqual(after.interviewEvaluation.notAssessed, job.jobProfile.dimensions.slice(2).map(({ name }) => name));
    assert.equal(after.tasks.at(-1).stage, 'interview-evaluate');
    assert.equal(after.tasks.at(-1).status, 'completed');
    await request(api.app).post(`/api/candidates/${candidate.id}/interview-evaluation`).send({ transcript }).expect(202, { queued: 0 });
  });

  it('校验空白、过短和超长记录', async () => {
    const { candidate } = await preparedCandidate();
    for (const value of ['   ', '太短']) {
      await request(api.app).post(`/api/candidates/${candidate.id}/interview-evaluation`).send({ transcript: value }).expect(400);
    }
    await request(api.app).post(`/api/candidates/${candidate.id}/interview-evaluation`)
      .send({ transcript: 'a'.repeat(200_001) }).expect(400);
  });

  it('provider 失败不回退 mock，也不覆盖状态和简历报告', async () => {
    const { candidate } = await preparedCandidate();
    await request(api.app).patch(`/api/candidates/${candidate.id}/status`).send({ status: 'reviewed' }).expect(200);
    const before = (await request(api.app).get(`/api/candidates/${candidate.id}`)).body;
    api.queue.provider.evaluateInterview = undefined;
    await request(api.app).post(`/api/candidates/${candidate.id}/interview-evaluation`).send({ transcript }).expect(202);
    await api.queue.waitForIdle();
    const after = (await request(api.app).get(`/api/candidates/${candidate.id}`)).body;
    assert.equal(after.status, 'reviewed');
    assert.deepEqual(after.report, before.report);
    assert.equal(after.interviewEvaluation, null);
    const task = after.tasks.at(-1);
    assert.equal(task.stage, 'interview-evaluate');
    assert.equal(task.status, 'failed');
    assert.match(task.error, /不支持面试记录评价/);
  });

  it('force 使用版本隔离，旧任务晚返回不能覆盖新结果', async () => {
    const { job, candidate } = await preparedCandidate();
    let releaseOld; let calls = 0;
    const oldResult = new Promise((resolve) => { releaseOld = resolve; });
    api.queue.provider.evaluateInterview = async () => {
      calls += 1;
      if (calls === 1) return oldResult;
      return evaluationFor(job.jobProfile, '第二次评价');
    };
    await request(api.app).post(`/api/candidates/${candidate.id}/interview-evaluation`).send({ transcript }).expect(202);
    while (calls < 1) await new Promise((resolve) => setTimeout(resolve, 5));
    await request(api.app).post(`/api/candidates/${candidate.id}/interview-evaluation`)
      .send({ transcript: `${transcript}\n补充：我个人完成压测。`, force: true }).expect(202, { queued: 1 });
    while (calls < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    releaseOld(evaluationFor(job.jobProfile, '过期评价'));
    await api.queue.waitForIdle();
    const detail = (await request(api.app).get(`/api/candidates/${candidate.id}`)).body;
    assert.equal(detail.interviewEvaluation.summary, '第二次评价');
    assert.equal(detail.tasks.filter((task) => task.stage === 'interview-evaluate' && task.status === 'cancelled').length, 1);
  });

  it('全部未评估时不从均分推导淘汰且覆盖率为零', async () => {
    const { job } = await preparedCandidate();
    const output = normalizeInterviewEvaluation(evaluationFor(job.jobProfile, '证据不足', true), job.jobProfile);
    assert.equal(output.recommendation, 'conditional_pass');
    assert.equal(output.assessedCoverageWeight, 0);
    assert.equal(output.weightedScore, null);
    assert.equal(output.notAssessed.length, job.jobProfile.dimensions.length);
    const misaligned = evaluationFor(job.jobProfile);
    misaligned.dimensions[0].id = 'wrong_dimension';
    assert.throws(() => normalizeInterviewEvaluation(misaligned, job.jobProfile), /必须与岗位画像/);
  });
});
