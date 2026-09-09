import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('动态岗位画像与人工修订', () => {
  let api;
  beforeEach(() => { api = createApp({ database: ':memory:', provider: 'mock', concurrency: 4 }); });
  afterEach(() => api.db.close());

  async function createJob(name, jd) {
    return (await request(api.app).post('/api/jobs').send({ name, jd }).expect(201)).body;
  }

  async function createCandidate(job, name) {
    return (await request(api.app).post('/api/candidates').send({
      positionId: job.id,
      name,
      resumeText: '5年相关项目经验，负责方案设计、跨团队协作和最终交付。',
    }).expect(201)).body;
  }

  function editProfile(profile, suffix = '人工修订') {
    const copy = structuredClone(profile);
    const dimension = copy.dimensions[0];
    const requirement = `${suffix}：能够完成复杂场景诊断`;
    dimension.requirements = [requirement];
    dimension.criteria = [{
      ...dimension.criteria[0],
      text: requirement,
      evidenceQuote: requirement,
    }];
    dimension.keywords = ['legacy_stale_keyword'];
    return copy;
  }

  it('根据岗位类型生成不同的五维画像和动态权重', async () => {
    const engineering = await createJob('后端工程师', '需要 Node.js、API、数据库、测试、项目交付和业务协作经验');
    const training = await createJob('AI 技术培训官', '负责 AI 课程设计、授课、销售赋能、客户培训项目交付与跨团队协作');
    assert.equal(engineering.jobProfile.dimensions.length, 5);
    assert.equal(training.jobProfile.dimensions.length, 5);
    assert.notDeepEqual(
      engineering.jobProfile.dimensions.map(({ id }) => id),
      training.jobProfile.dimensions.map(({ id }) => id),
    );
    assert.notDeepEqual(
      engineering.jobProfile.dimensions.map(({ weight }) => weight),
      training.jobProfile.dimensions.map(({ weight }) => weight),
    );
  });

  it('人工画像保存会校验五维，并同步 requirements 对应 criteria 与关键词', async () => {
    const job = await createJob('后端工程师', '需要 Node.js、API、数据库、测试和项目交付经验');
    const invalidCount = structuredClone(job.jobProfile);
    invalidCount.dimensions.pop();
    await request(api.app).patch(`/api/jobs/${job.id}/profile`)
      .send({ jobProfile: invalidCount, reevaluateStrategy: 'none' }).expect(400);

    const staleCriteria = structuredClone(job.jobProfile);
    staleCriteria.dimensions[0].requirements = ['已修改但 criterion 未同步'];
    const synchronized = await request(api.app).patch(`/api/jobs/${job.id}/profile`)
      .send({ jobProfile: staleCriteria, reevaluateStrategy: 'none' }).expect(200);
    assert.equal(synchronized.body.job.jobProfile.dimensions[0].criteria[0].text, '已修改但 criterion 未同步');

    const response = await request(api.app).patch(`/api/jobs/${job.id}/profile`)
      .send({ jobProfile: editProfile(job.jobProfile), reevaluateStrategy: 'none' }).expect(200);
    assert.equal(response.body.job.jobProfileVersion, 3);
    assert.equal(response.body.job.jobProfileSource, 'manual');
    assert.ok(response.body.job.jobProfileUpdatedAt);
    assert.equal(response.body.reevaluation.queued, 0);
    const dimension = response.body.job.jobProfile.dimensions[0];
    assert.equal(dimension.criteria[0].text, dimension.requirements[0]);
    assert.ok(dimension.keywords.every((keyword) => dimension.requirements.join(' ').includes(keyword)));
    assert.ok(!dimension.keywords.includes('legacy_stale_keyword'));
    assert.ok(response.body.job.jobProfile.mustHaves.includes(dimension.requirements[0]));
  });

  it('pending 只重评未完成人工决策的候选人', async () => {
    const job = await createJob('销售经理', '负责客户开发、商机转化、销售目标和团队管理');
    const decided = await createCandidate(job, '已通过候选人');
    await createCandidate(job, '待处理候选人');
    await api.queue.waitForIdle();
    api.db.prepare("UPDATE candidates SET status='shortlisted' WHERE id=?").run(decided.id);

    const response = await request(api.app).patch(`/api/jobs/${job.id}/profile`)
      .send({ jobProfile: editProfile(job.jobProfile), reevaluateStrategy: 'pending' }).expect(200);
    assert.deepEqual(response.body.reevaluation, {
      strategy: 'pending', candidates: 2, selected: 1, queued: 1, skipped: 0, preservedDecisions: 0,
    });
    await api.queue.waitForIdle();
    const statuses = (await request(api.app).get(`/api/candidates?positionId=${job.id}`)).body.map(({ status }) => status);
    assert.ok(statuses.includes('passed'));
    assert.ok(statuses.includes('reviewed'));
  });

  it('all 重评全部候选人但保留通过、待定和淘汰状态', async () => {
    const job = await createJob('产品经理', '负责用户洞察、产品规划、需求方案、数据分析和跨团队交付');
    const candidates = [];
    for (const name of ['通过', '待定', '淘汰', '未决策']) candidates.push(await createCandidate(job, name));
    await api.queue.waitForIdle();
    for (const [candidate, status] of candidates.map((candidate, index) => [candidate, ['shortlisted', 'hold', 'rejected', 'evaluated'][index]])) {
      api.db.prepare('UPDATE candidates SET status=? WHERE id=?').run(status, candidate.id);
    }

    const response = await request(api.app).patch(`/api/jobs/${job.id}/profile`)
      .send({ jobProfile: editProfile(job.jobProfile), reevaluateStrategy: 'all' }).expect(200);
    assert.deepEqual(response.body.reevaluation, {
      strategy: 'all', candidates: 4, selected: 4, queued: 4, skipped: 0, preservedDecisions: 3,
    });
    await api.queue.waitForIdle();
    const rows = candidates.map((candidate) => api.db.prepare('SELECT status,report FROM candidates WHERE id=?').get(candidate.id));
    assert.deepEqual(rows.map(({ status }) => status), ['shortlisted', 'hold', 'rejected', 'evaluated']);
    assert.ok(rows.every(({ report }) => report));
  });
});
