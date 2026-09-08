import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import { createDatabase, internalCandidateStatus, mapCandidate, mapJob, mapTask } from './db.js';
import { loadConfig } from './config.js';
import { createProvider } from './providers/index.js';
import { EvaluationQueue } from './queue.js';
import { generateJobProfile } from './job-profile.js';
import { DecisionSync } from './decision-sync.js';
import { fetchLarkDocument, isLarkDocumentUrl } from './lark.js';
import { LarkHireClient } from './lark-hire.js';
import { interviewEvaluationRequestSchema } from './interview-evaluation.js';
import { candidateInputSchema, candidatePatchSchema, feishuImportSchema, jobInputSchema, jobPatchSchema, normalizeImportedCandidate } from './schema.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const now = () => new Date().toISOString();
const notFound = (label = '记录') => Object.assign(new Error(`${label}不存在`), { statusCode: 404 });

export function createApp(options = {}) {
  const config = loadConfig(options);
  const db = options.db ?? createDatabase(options.database ?? path.join(config.dataDir, 'app.db'));
  const provider = options.providerInstance ?? createProvider(config);
  const hireClient = options.decisionSyncClient ?? new LarkHireClient({ bin: config.larkCliBin, timeoutMs: config.larkHireSyncTimeoutMs });
  const decisionSync = new DecisionSync({ db, client: hireClient, autoStart: options.autoStartDecisionSync ?? true });
  const analyzeJob = (job, persist = true) => generateJobProfile({ db, provider, job, persist });
  const fetchDoc = options.fetchDoc ?? ((url) => fetchLarkDocument(url, { bin: config.larkCliBin }));
  const queue = new EvaluationQueue({ db, provider, generateJobProfile: (job) => analyzeJob(job), concurrency: config.concurrency, autoStart: config.autoStartQueue });
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, provider: config.provider, queue: queue.stats(), time: now() }));

  const listJobs = (_req, res) => {
    const jobs = db.prepare(`SELECT j.*, COUNT(c.id) candidate_count FROM jobs j LEFT JOIN candidates c ON c.position_id = j.id GROUP BY j.id ORDER BY j.created_at DESC`).all()
      .map((row) => ({ ...mapJob(row), candidateCount: row.candidate_count }));
    res.json(jobs);
  };
  const resolveJd = async (jd) => {
    if (!isLarkDocumentUrl(jd)) return { jd, jdSourceUrl: null };
    const document = await fetchDoc(jd);
    return { jd: document.content, jdSourceUrl: jd };
  };
  const createJob = async (req, res) => {
    const value = jobInputSchema.parse(req.body);
    const resolved = await resolveJd(value.jd);
    const record = { id: randomUUID(), ...value, ...resolved, createdAt: now(), updatedAt: now(), jobProfileVersion: 0 };
    const analyzed = await analyzeJob(record, false);
    Object.assign(record, { jobProfile: analyzed.profile, jobProfileVersion: analyzed.version, jobProfileAnalyzedAt: analyzed.analyzedAt });
    db.prepare('INSERT INTO jobs (id,name,department,location,jd,jd_source_url,job_profile,job_profile_version,job_profile_analyzed_at,status,created_at,updated_at) VALUES (@id,@name,@department,@location,@jd,@jdSourceUrl,@jobProfileJson,@jobProfileVersion,@jobProfileAnalyzedAt,@status,@createdAt,@updatedAt)')
      .run({ ...record, jobProfileJson: JSON.stringify(record.jobProfile) });
    res.status(201).json(record);
  };
  const getJob = (req, res) => {
    const job = mapJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
    if (!job) throw notFound('职位');
    res.json(job);
  };
  const patchJob = async (req, res) => {
    const current = mapJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
    if (!current) throw notFound('职位');
    const value = jobPatchSchema.parse(req.body);
    const resolved = value.jd === undefined ? {} : await resolveJd(value.jd);
    const provided = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
    const updated = { ...current, ...provided, ...resolved, updatedAt: now() };
    if (value.jd !== undefined) {
      const analyzed = await analyzeJob(updated, false);
      Object.assign(updated, { jobProfile: analyzed.profile, jobProfileVersion: analyzed.version, jobProfileAnalyzedAt: analyzed.analyzedAt });
    }
    db.prepare(`UPDATE jobs SET name=@name,department=@department,location=@location,jd=@jd,jd_source_url=@jdSourceUrl,
      job_profile=@jobProfileJson,job_profile_version=@jobProfileVersion,job_profile_analyzed_at=@jobProfileAnalyzedAt,
      status=@status,updated_at=@updatedAt WHERE id=@id`)
      .run({ ...updated, jobProfileJson: JSON.stringify(updated.jobProfile) });
    res.json(mapJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(updated.id)));
  };
  const deleteJob = (req, res) => {
    const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    if (!result.changes) throw notFound('职位');
    res.status(204).end();
  };

  for (const base of ['/api/jobs', '/api/positions']) {
    app.get(base, listJobs); app.post(base, createJob);
    app.get(`${base}/:id`, getJob); app.patch(`${base}/:id`, patchJob); app.delete(`${base}/:id`, deleteJob);
  }

  const rebuildJobProfile = async (req, res) => {
    const job = mapJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
    if (!job) throw notFound('职位');
    await analyzeJob(job);
    res.json(mapJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id)));
  };
  app.post('/api/jobs/:id/analyze', rebuildJobProfile);
  app.post('/api/positions/:id/analyze', rebuildJobProfile);

  app.get('/api/candidates', (req, res) => {
    const where = []; const params = {};
    if (req.query.positionId) { where.push('c.position_id = @positionId'); params.positionId = req.query.positionId; }
    if (req.query.status) { where.push('c.status = @status'); params.status = internalCandidateStatus(req.query.status); }
    if (req.query.search) { where.push('(c.name LIKE @search OR c.resume_text LIKE @search)'); params.search = `%${req.query.search}%`; }
    const rows = db.prepare(`SELECT c.*, j.name position_name FROM candidates c JOIN jobs j ON j.id=c.position_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.created_at DESC`).all(params);
    res.json(rows.map((row) => ({ ...mapCandidate(row), positionName: row.position_name })));
  });

  const insertCandidate = db.prepare(`INSERT INTO candidates
    (id,position_id,external_id,application_id,name,job_name,resume_text,source_url,source,status,created_at,updated_at)
    VALUES (@id,@positionId,@externalId,@applicationId,@name,@jobName,@resumeText,@sourceUrl,@source,'pending',@createdAt,@updatedAt)`);

  app.post('/api/candidates', (req, res) => {
    const value = candidateInputSchema.parse(req.body);
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(value.positionId)) throw notFound('职位');
    const record = { id: randomUUID(), ...value, createdAt: now(), updatedAt: now() };
    insertCandidate.run(record);
    queue.enqueue(record.id);
    res.status(201).json(mapCandidate(db.prepare('SELECT * FROM candidates WHERE id = ?').get(record.id)));
  });

  app.get('/api/candidates/:id', (req, res) => {
    const candidate = mapCandidate(db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id));
    if (!candidate) throw notFound('候选人');
    candidate.tasks = db.prepare('SELECT * FROM tasks WHERE candidate_id = ? ORDER BY created_at, rowid').all(req.params.id).map(mapTask);
    res.json(candidate);
  });

  const patchCandidate = (req, res) => {
    const current = mapCandidate(db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id));
    if (!current) throw notFound('候选人');
    const value = candidatePatchSchema.parse(req.body);
    const updated = { ...current, ...value, status: internalCandidateStatus(value.status ?? current.status), updatedAt: now() };
    db.prepare('UPDATE candidates SET name=@name,resume_text=@resumeText,status=@status,updated_at=@updatedAt WHERE id=@id').run(updated);
    if (value.status === 'passed' || value.status === 'rejected') decisionSync.enqueue(req.params.id);
    res.json(mapCandidate(db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id)));
  };
  app.patch('/api/candidates/:id', patchCandidate);
  app.patch('/api/candidates/:id/status', patchCandidate);
  app.post('/api/candidates/:id/evaluate', (req, res) => {
    const queued = queue.enqueue(req.params.id, { force: req.body?.force === true });
    res.status(202).json({ queued });
  });
  app.post('/api/candidates/:id/interview', (req, res) => {
    const queued = queue.enqueueInterview(req.params.id, { force: req.body?.force === true });
    res.status(202).json({ queued });
  });
  app.post('/api/candidates/:id/interview-evaluation', (req, res) => {
    const value = interviewEvaluationRequestSchema.parse(req.body);
    const queued = queue.enqueueInterviewEvaluation(req.params.id, value.transcript, { force: value.force });
    res.status(202).json({ queued });
  });
  app.post('/api/candidates/:id/sync', (req, res) => {
    const result = decisionSync.enqueue(req.params.id, { force: req.body?.force === true });
    res.status(202).json({ result, candidate: mapCandidate(db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id)) });
  });
  const evaluateJobCandidates = (req, res) => {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) throw notFound('职位');
    const candidateIds = db.prepare('SELECT id FROM candidates WHERE position_id = ? ORDER BY created_at').all(job.id).map((row) => row.id);
    let queued = 0;
    for (const candidateId of candidateIds) queued += queue.enqueue(candidateId, { force: req.body?.force === true }) > 0 ? 1 : 0;
    res.status(202).json({ candidates: candidateIds.length, queued, force: req.body?.force === true });
  };
  app.post('/api/jobs/:id/evaluate', evaluateJobCandidates);
  app.post('/api/positions/:id/evaluate', evaluateJobCandidates);
  const designJobInterviews = (req, res) => {
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id)) throw notFound('职位');
    const candidates = db.prepare('SELECT id FROM candidates WHERE position_id = ? AND report IS NOT NULL ORDER BY created_at').all(req.params.id);
    let queued = 0; let skipped = 0;
    for (const candidate of candidates) {
      try {
        queue.enqueueInterview(candidate.id, { force: req.body?.force === true }) ? queued += 1 : skipped += 1;
      } catch (error) {
        if (error.statusCode === 409) skipped += 1;
        else throw error;
      }
    }
    res.status(202).json({ candidates: candidates.length, queued, skipped, force: req.body?.force === true });
  };
  app.post('/api/jobs/:id/interviews', designJobInterviews);
  app.post('/api/positions/:id/interviews', designJobInterviews);
  const syncJobDecisions = (req, res) => {
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id)) throw notFound('职位');
    const candidates = db.prepare("SELECT id FROM candidates WHERE position_id=? AND status IN ('shortlisted','rejected') ORDER BY created_at").all(req.params.id);
    let queued = 0; let skipped = 0;
    for (const candidate of candidates) {
      decisionSync.enqueue(candidate.id, { force: req.body?.force === true }) === 'queued' ? queued += 1 : skipped += 1;
    }
    res.status(202).json({ candidates: candidates.length, queued, skipped });
  };
  app.post('/api/jobs/:id/sync-decisions', syncJobDecisions);
  app.post('/api/positions/:id/sync-decisions', syncJobDecisions);

  app.get('/api/tasks', (req, res) => {
    const where = []; const params = {};
    if (req.query.candidateId) { where.push('candidate_id = @candidateId'); params.candidateId = req.query.candidateId; }
    if (req.query.status) { where.push('status = @status'); params.status = req.query.status; }
    const rows = db.prepare(`SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`).all(params);
    res.json(rows.map(mapTask));
  });

  app.get('/api/agents', (_req, res) => res.json([
    { id: 'job-analyze', name: 'JD 岗位画像 Agent', stage: 'job-analyze', provider: config.provider },
    { id: 'parse', name: '结构化 Agent', stage: 'parse', provider: config.provider },
    { id: 'evaluate', name: '评估 Agent', stage: 'evaluate', provider: config.provider },
    { id: 'review', name: '复核 Agent', stage: 'review', provider: config.provider },
    { id: 'interview', name: '面试设计 Agent', stage: 'interview', provider: config.provider },
    { id: 'interview-evaluate', name: '面试评价 Agent', stage: 'interview-evaluate', provider: config.provider },
  ].map((agent) => ({ ...agent, queue: queue.stats() }))));

  app.post('/api/import/feishu', (req, res) => {
    const request = feishuImportSchema.parse(req.body);
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(request.positionId)) throw notFound('职位');
    let imported = 0; let skipped = 0; const ids = [];
    const importBatch = db.transaction(() => {
      for (const raw of request.candidates) {
        const value = normalizeImportedCandidate(raw, request);
        const duplicate = value.externalId
          ? db.prepare('SELECT id FROM candidates WHERE position_id=? AND source=? AND external_id=?').get(value.positionId, value.source, value.externalId)
          : value.sourceUrl ? db.prepare('SELECT id FROM candidates WHERE position_id=? AND source_url=?').get(value.positionId, value.sourceUrl) : null;
        if (duplicate) { skipped += 1; continue; }
        const record = { id: randomUUID(), ...value, createdAt: now(), updatedAt: now() };
        insertCandidate.run(record); ids.push(record.id); imported += 1;
      }
    });
    importBatch();
    for (const id of ids) queue.enqueue(id);
    res.status(201).json({ imported, skipped, queued: ids.length });
  });

  const collectionRuns = new Map();
  app.post('/api/jobs/:id/collect', (req, res) => {
    const job = mapJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
    if (!job) throw notFound('职位');
    const id = randomUUID();
    const tenant = req.body?.tenant ?? process.env.FEISHU_TENANT;
    if (!tenant) throw Object.assign(new Error('未配置飞书租户地址 FEISHU_TENANT'), { statusCode: 400 });
    const args = ['run', 'collect', '--', '--position-id', job.id, '--job-name', job.name, '--tenant', tenant, '--api-base', `http://${config.host}:${config.port}`, '--import'];
    if (config.feishuEvaluationUrl) args.push('--list-url', config.feishuEvaluationUrl);
    const child = spawn('npm', args, { cwd: projectRoot, stdio: 'ignore', detached: false });
    collectionRuns.set(id, { id, jobId: job.id, status: 'running', startedAt: now() });
    child.once('exit', (code) => collectionRuns.set(id, { ...collectionRuns.get(id), status: code === 0 ? 'completed' : 'failed', exitCode: code, completedAt: now() }));
    child.once('error', (error) => collectionRuns.set(id, { ...collectionRuns.get(id), status: 'failed', error: error.message, completedAt: now() }));
    res.status(202).json({
      ...collectionRuns.get(id),
      message: '飞书采集已启动；首次使用时请在弹出的浏览器中完成登录。',
    });
  });
  app.get('/api/collections/:id', (req, res) => {
    const run = collectionRuns.get(req.params.id);
    if (!run) throw notFound('采集任务');
    res.json(run);
  });

  app.use((req, res) => res.status(404).json({ error: '接口不存在', path: req.path }));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: '请求参数无效', details: error.issues });
    if (error?.code?.startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: '记录已存在或关联无效' });
    res.status(error.statusCode ?? 500).json({ error: error.message ?? '服务器错误' });
  });

  return { app, db, queue, decisionSync, config };
}
