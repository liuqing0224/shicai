import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LarkHireClient, parseCliEnvelope } from '../src/lark-hire.js';

describe('飞书招聘人工决策同步', () => {
  let api; let client;

  beforeEach(() => {
    client = {
      passed: [], rejected: [],
      pass: async (candidate, options) => { client.passed.push(candidate.id); await options.onTargetResolved('stage-next'); },
      reject: async (candidate) => { client.rejected.push(candidate.id); },
    };
    api = createApp({ database: ':memory:', provider: 'mock', decisionSyncClient: client });
  });
  afterEach(() => api.db.close());

  async function job() {
    return (await request(api.app).post('/api/jobs').send({ name: '同步职位', jd: '需要 Node.js API 经验' }).expect(201)).body;
  }

  async function candidate(positionId, suffix) {
    return (await request(api.app).post('/api/candidates').send({
      positionId, externalId: `talent-${suffix}`, applicationId: `application-${suffix}`,
      name: `候选人${suffix}`, resumeText: '3年 Node.js API 项目经验', source: 'feishu',
    }).expect(201)).body;
  }

  it('只有 passed/rejected 触发写请求', async () => {
    const position = await job();
    const item = await candidate(position.id, 'only');
    await api.queue.waitForIdle();
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'hold' }).expect(200);
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'reviewed' }).expect(200);
    await api.decisionSync.waitForIdle();
    assert.equal(client.passed.length + client.rejected.length, 0);
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'passed' }).expect(200);
    await api.decisionSync.waitForIdle();
    assert.equal(client.passed.length, 1);
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'rejected' }).expect(200);
    await api.decisionSync.waitForIdle();
    assert.equal(client.rejected.length, 1);
  });

  it('同步失败不回滚人工判断并暴露安全错误', async () => {
    client.pass = async () => { throw Object.assign(new Error('secret'), { safe: {
      type: 'missing_scope', message: '缺少飞书应用权限', missingScopes: ['hire:application:write'], consoleUrl: 'https://open.feishu.cn/app',
    } }); };
    const position = await job();
    const item = await candidate(position.id, 'failure');
    await api.queue.waitForIdle();
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'passed' }).expect(200);
    await api.decisionSync.waitForIdle();
    const detail = (await request(api.app).get(`/api/candidates/${item.id}`).expect(200)).body;
    assert.equal(detail.status, 'passed');
    assert.equal(detail.syncStatus, 'failed');
    assert.equal(detail.syncError.type, 'missing_scope');
    assert.equal(JSON.stringify(detail.syncError).includes('secret'), false);
  });

  it('同一决策重复点击幂等，手动强制可重试', async () => {
    const position = await job();
    const item = await candidate(position.id, 'idempotent');
    await api.queue.waitForIdle();
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'passed' }).expect(200);
    await api.decisionSync.waitForIdle();
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'passed' }).expect(200);
    await api.decisionSync.waitForIdle();
    assert.equal(client.passed.length, 1);
    const retry = await request(api.app).post(`/api/candidates/${item.id}/sync`).send({ force: true }).expect(202);
    assert.equal(retry.body.result, 'queued');
    await api.decisionSync.waitForIdle();
    assert.equal(client.passed.length, 2);
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'hold' }).expect(200);
    await request(api.app).post(`/api/candidates/${item.id}/sync`).expect(409);
  });

  it('按职位批量重试当前人工终局决策', async () => {
    const position = await job();
    const passed = await candidate(position.id, 'batch-pass');
    const rejected = await candidate(position.id, 'batch-reject');
    await api.queue.waitForIdle();
    api.db.prepare("UPDATE candidates SET status='shortlisted' WHERE id=?").run(passed.id);
    api.db.prepare("UPDATE candidates SET status='rejected' WHERE id=?").run(rejected.id);
    const response = await request(api.app).post(`/api/jobs/${position.id}/sync-decisions`).expect(202);
    assert.deepEqual(response.body, { candidates: 2, queued: 2, skipped: 0 });
    await api.decisionSync.waitForIdle();
    assert.equal(client.passed.length, 1);
    assert.equal(client.rejected.length, 1);
    const repeat = await request(api.app).post(`/api/jobs/${position.id}/sync-decisions`).expect(202);
    assert.deepEqual(repeat.body, { candidates: 2, queued: 0, skipped: 2 });
  });

  it('执行前再次核对人工状态，撤销决定后不写飞书', async () => {
    api.db.close();
    api = createApp({ database: ':memory:', provider: 'mock', decisionSyncClient: client, autoStartDecisionSync: false });
    const position = await job();
    const item = await candidate(position.id, 'revoked');
    await api.queue.waitForIdle();
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'passed' }).expect(200);
    await request(api.app).patch(`/api/candidates/${item.id}/status`).send({ status: 'reviewed' }).expect(200);
    await api.decisionSync.drain();
    assert.equal(client.passed.length, 0);
    const detail = (await request(api.app).get(`/api/candidates/${item.id}`).expect(200)).body;
    assert.equal(detail.status, 'reviewed');
    assert.equal(detail.syncStatus, 'skipped');
  });
});

describe('LarkHireClient 官方 API 流程', () => {
  it('CLI 授权错误从 stderr 保留结构化信息', () => {
    const envelope = parseCliEnvelope('', JSON.stringify({ ok: false, error: { subtype: 'app_scope_not_applied', missing_scopes: ['hire:application'] } }));
    assert.equal(envelope.error.subtype, 'app_scope_not_applied');
    assert.deepEqual(envelope.error.missing_scopes, ['hire:application']);
  });

  it('从申请和职位流程解析下一阶段，不猜测 stage_id', async () => {
    const calls = [];
    const client = new LarkHireClient();
    client.call = async (method, path, body, params) => {
      calls.push({ method, path, body, params });
      if (path.includes('/applications/') && method === 'GET') return { basic_info: { job_id: 'job-1', current_stage_id: 'stage-1' } };
      if (path.includes('/jobs/')) return { job_detail: { basic_info: { process_id: 'process-1' } } };
      if (path.includes('/job_processes')) return { items: [{ id: 'process-1', stage_list: [{ id: 'stage-1' }, { id: 'stage-2' }] }] };
      return {};
    };
    let savedTarget;
    await client.pass({ applicationId: 'application-1' }, { remoteTargetId: null, onTargetResolved: async (id) => { savedTarget = id; } });
    assert.equal(savedTarget, 'stage-2');
    assert.deepEqual(calls.find((call) => call.path === '/open-apis/hire/v1/job_processes')?.params, { page_size: 100 });
    assert.deepEqual(calls.at(-1), { method: 'POST', path: '/open-apis/hire/v1/applications/application-1/transfer_stage', body: { stage_id: 'stage-2' }, params: undefined });
  });

  it('已到目标阶段时幂等成功，已按简历未通过终止时不重复终止', async () => {
    const client = new LarkHireClient();
    let posts = 0;
    client.call = async (method, path) => {
      if (method === 'POST') posts += 1;
      if (path.includes('/applications/')) return path.endsWith('reject') ? { termination_type: 1 } : { job_id: 'job-1', current_stage_id: 'stage-2' };
      if (path.includes('/jobs/')) return { job: { process_id: 'process-1' } };
      return { items: [{ id: 'process-1', stage_list: [{ id: 'stage-1' }, { id: 'stage-2' }, { id: 'stage-3' }] }] };
    };
    const passed = await client.pass({ applicationId: 'already' }, { remoteTargetId: 'stage-2', onTargetResolved: async () => {} });
    assert.equal(passed.idempotent, true);
    client.getApplication = async () => ({ basic_info: { active_status: 2, termination_type: 1 } });
    const rejected = await client.reject({ applicationId: 'reject' });
    assert.equal(rejected.idempotent, true);
    assert.equal(posts, 0);
  });
});
