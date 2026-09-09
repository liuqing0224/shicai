import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('resume evaluator API', () => {
  let api;

  beforeEach(() => {
    api = createApp({ database: ':memory:', provider: 'mock', concurrency: 2 });
  });

  afterEach(() => api.db.close());

  async function createJob(name = '高级后端工程师') {
    const response = await request(api.app).post('/api/jobs').send({
      name, department: '研发中心', location: '上海', jd: '需要 Node.js JavaScript SQLite API 设计经验',
    }).expect(201);
    return response.body;
  }

  it('创建职位并支持 positions 兼容别名', async () => {
    const job = await createJob();
    assert.equal(job.status, 'active');
    const { body: patched } = await request(api.app).patch(`/api/jobs/${job.id}`).send({ jd: '更新后的 JD' }).expect(200);
    assert.equal(patched.department, '研发中心');
    const { body } = await request(api.app).get('/api/positions').expect(200);
    assert.equal(body.length, 1);
    assert.equal(body[0].id, job.id);
    assert.equal(body[0].candidateCount, 0);
  });

  it('通过飞书 CLI 解析文档链接并保留来源', async () => {
    api.db.close();
    api = createApp({
      database: ':memory:',
      provider: 'mock',
      fetchDoc: async () => ({ content: '# 已解析 JD\n需要 Agent 与项目交付经验' }),
    });
    const source = 'https://example.feishu.cn/docx/abc123';
    const response = await request(api.app).post('/api/jobs').send({
      name: 'AI 培训官', department: '销售', jd: source,
    }).expect(201);
    assert.match(response.body.jd, /已解析 JD/);
    assert.equal(response.body.jdSourceUrl, source);
  });

  it('导入飞书候选人、去重并完成三阶段评估', async () => {
    const job = await createJob();
    const payload = {
      jobName: job.name,
      positionId: job.id,
      candidates: [{
        externalId: 'talent-1', applicationId: 'application-1', name: '张三',
        resumeText: '5年 Node.js 后端经验。使用 JavaScript 和 SQLite 设计 API。本科。',
        sourceUrl: 'https://example.test/talent-1', source: 'feishu',
      }],
    };
    assert.deepEqual((await request(api.app).post('/api/import/feishu').send(payload).expect(201)).body, { imported: 1, skipped: 0, queued: 1 });
    assert.deepEqual((await request(api.app).post('/api/import/feishu').send(payload).expect(201)).body, { imported: 0, skipped: 1, queued: 0 });
    await api.queue.waitForIdle();

    const candidates = (await request(api.app).get(`/api/candidates?positionId=${job.id}`).expect(200)).body;
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].status, 'reviewed');
    assert.equal(candidates[0].jobId, job.id);
    assert.equal(candidates[0].score, candidates[0].report.score);
    assert.equal(typeof candidates[0].report.score, 'number');
    assert.equal(candidates[0].report.review.approved, true);
    const detail = (await request(api.app).get(`/api/candidates/${candidates[0].id}`).expect(200)).body;
    assert.deepEqual(detail.tasks.map((task) => [task.stage, task.status]), [
      ['parse', 'completed'], ['evaluate', 'completed'], ['review', 'completed'], ['interview', 'completed'],
    ]);
  });

  it('兼容采集器 snake_case 字段', async () => {
    const job = await createJob();
    const response = await request(api.app).post('/api/import/feishu').send({
      positionId: job.id, jobName: job.name,
      candidates: [{ external_id: 'snake-1', name: '李四', text: '3年 JavaScript 经验，本科', source_url: 'https://example.test/snake-1' }],
    }).expect(201);
    assert.equal(response.body.imported, 1);
    await api.queue.waitForIdle();
  });

  it('支持人工更新候选人决策状态', async () => {
    const job = await createJob();
    const created = await request(api.app).post('/api/candidates').send({
      positionId: job.id, name: '王五', resumeText: 'Node.js 工程师，4年经验', source: 'manual',
    }).expect(201);
    await api.queue.waitForIdle();
    const updated = await request(api.app).patch(`/api/candidates/${created.body.id}/status`).send({ status: 'passed' }).expect(200);
    assert.equal(updated.body.status, 'passed');
  });

  it('拒绝无效报告并同步失败状态', async () => {
    api.db.close();
    const invalidProvider = {
      parse: async () => ({ name: '赵六', skills: [], highlights: [], yearsOfExperience: 0, education: '未识别' }),
      evaluate: async () => ({ score: 999 }),
      review: async ({ report }) => report,
    };
    api = createApp({ database: ':memory:', providerInstance: invalidProvider, evaluationRetryDelayMs: 0, autoStartQueue: true });
    const job = await createJob('测试职位');
    const created = await request(api.app).post('/api/candidates').send({ positionId: job.id, name: '赵六', resumeText: '有效的简历内容' }).expect(201);
    await api.queue.waitForIdle();
    const candidate = (await request(api.app).get(`/api/candidates/${created.body.id}`).expect(200)).body;
    assert.equal(candidate.status, 'failed');
    assert.match(candidate.error, /score|expected|Too big/i);
    assert.equal(candidate.tasks.find((task) => task.stage === 'evaluate').status, 'failed');
    assert.equal(candidate.tasks.find((task) => task.stage === 'evaluate').attempt, 3);
    assert.equal(candidate.tasks.find((task) => task.stage === 'review').status, 'cancelled');
  });

  it('自动恢复耗尽后支持人工重新触发完整评估', async () => {
    api.db.close();
    api = createApp({ database: ':memory:', provider: 'mock', autoStartQueue: false });
    const job = await createJob('人工恢复测试职位');
    const created = await request(api.app).post('/api/candidates').send({
      positionId: job.id, name: '恢复候选人', resumeText: 'Node.js 与 API 项目经验',
    }).expect(201);
    api.db.prepare("UPDATE candidates SET status='failed',parsed_profile='{}',report='{}',interview_plan='{}',interview_evaluation='{}',error='自动恢复已达上限' WHERE id=?").run(created.body.id);

    await request(api.app).post(`/api/candidates/${created.body.id}/evaluate`).send({ force: true }).expect(202, { queued: 4 });
    const candidate = (await request(api.app).get(`/api/candidates/${created.body.id}`).expect(200)).body;
    assert.equal(candidate.status, 'pending');
    assert.equal(candidate.error, null);
    assert.equal(candidate.parsedProfile, null);
    assert.equal(candidate.report, null);
    assert.equal(candidate.interviewPlan, null);
    assert.equal(candidate.interviewEvaluation, null);
    assert.equal(candidate.tasks.filter((task) => task.status === 'queued').length, 4);
    assert.equal(candidate.tasks.filter((task) => task.status === 'cancelled').length, 4);
  });

  it('临时评估失败会自动重试并恢复后续流程', async () => {
    api.db.close();
    let evaluationAttempts = 0;
    const retryProvider = {
      parse: async () => ({ name: '重跑候选人', skills: [], highlights: [], yearsOfExperience: 2, education: '本科' }),
      evaluate: async ({ jobProfile }) => {
        evaluationAttempts += 1;
        if (evaluationAttempts === 1) throw new Error('临时评估失败');
        return {
          score: 80, grade: 'B', recommendation: 'yes', summary: '符合岗位主要要求',
          dimensions: jobProfile.dimensions.map((dimension) => ({
            id: dimension.id, name: dimension.name, score: 8, weight: dimension.weight,
            requirements: dimension.requirements, evidence: ['具备相关经验'], gaps: [], risks: [],
            requirementMatches: dimension.criteria.map((criterion) => ({ requirementId: criterion.id, status: 'met', evidence: ['具备相关经验'], notes: '已核对' })),
          })),
          strengths: ['相关经验'], risks: [], gaps: [], interviewQuestions: ['请说明代表项目'], evidence: ['简历项目经历'],
        };
      },
      review: async ({ report }) => ({ ...report, review: { approved: true, notes: [] } }),
    };
    api = createApp({ database: ':memory:', providerInstance: retryProvider, concurrency: 1, evaluationRetryDelayMs: 0 });
    const job = await createJob('重跑测试职位');
    const created = await request(api.app).post('/api/candidates').send({
      positionId: job.id, name: '重跑候选人', resumeText: '两年相关工作经验',
    }).expect(201);
    await api.queue.waitForIdle();
    const candidate = (await request(api.app).get(`/api/candidates/${created.body.id}`).expect(200)).body;
    assert.equal(candidate.status, 'reviewed');
    assert.equal(evaluationAttempts, 2);
    assert.equal(candidate.tasks.find((task) => task.stage === 'evaluate').attempt, 2);
    assert.equal(candidate.tasks.at(-1).status, 'completed');
  });

  it('持久化 JD 岗位画像并在 JD 更新时生成新版本', async () => {
    const job = await createJob();
    assert.equal(job.jobProfileVersion, 1);
    assert.equal(job.jobProfile.dimensions.length, 5);
    assert.equal(job.jobProfile.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0), 1);
    assert.deepEqual(job.jobProfile.dimensions.map((dimension) => dimension.id), [
      'hard_skills', 'experience', 'responsibilities', 'gate', 'tech_direction',
    ]);
    const rebuilt = await request(api.app).post(`/api/jobs/${job.id}/analyze`).expect(200);
    assert.equal(rebuilt.body.jobProfileVersion, 2);
    assert.ok(rebuilt.body.jobProfileAnalyzedAt);
    const patched = await request(api.app).patch(`/api/jobs/${job.id}`).send({ jd: '新 JD：要求 TypeScript 和分布式系统经验' }).expect(200);
    assert.equal(patched.body.jobProfileVersion, 3);
  });

  it('候选人报告按岗位画像逐维度对齐并由程序重算总分', async () => {
    const job = await createJob();
    const created = await request(api.app).post('/api/candidates').send({
      positionId: job.id, name: '维度候选人', resumeText: '5年 Node.js JavaScript SQLite API 设计和项目交付经验，本科',
    }).expect(201);
    await api.queue.waitForIdle();
    const detail = await request(api.app).get(`/api/candidates/${created.body.id}`).expect(200);
    assert.deepEqual(detail.body.report.dimensions.map((dimension) => dimension.id), job.jobProfile.dimensions.map((dimension) => dimension.id));
    detail.body.report.dimensions.forEach((dimension, index) => {
      assert.equal(dimension.weight, job.jobProfile.dimensions[index].weight);
      assert.ok(Array.isArray(dimension.evidence));
      assert.ok(Array.isArray(dimension.gaps));
      assert.ok(Array.isArray(dimension.risks));
      assert.ok(Array.isArray(dimension.requirementMatches));
    });
    const computed = Math.round(detail.body.report.dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) * 10);
    assert.equal(detail.body.score, computed);
  });

  it('支持按职位批量强制重评', async () => {
    const job = await createJob();
    for (const name of ['批量甲', '批量乙']) {
      await request(api.app).post('/api/candidates').send({ positionId: job.id, name, resumeText: '3年 Node.js 项目经验' }).expect(201);
    }
    await api.queue.waitForIdle();
    const response = await request(api.app).post(`/api/jobs/${job.id}/evaluate`).send({ force: true }).expect(202);
    assert.deepEqual(response.body, { candidates: 2, queued: 2, force: true });
    await api.queue.waitForIdle();
    const candidates = await request(api.app).get(`/api/candidates?positionId=${job.id}`).expect(200);
    assert.ok(candidates.body.every((candidate) => candidate.status === 'reviewed'));
  });

  it('校验导入批次上限与必填字段', async () => {
    const job = await createJob();
    const tooMany = Array.from({ length: 101 }, (_, index) => ({ name: `候选人${index}`, resumeText: '简历' }));
    const response = await request(api.app).post('/api/import/feishu').send({ positionId: job.id, candidates: tooMany }).expect(400);
    assert.equal(response.body.error, '请求参数无效');
  });
});
