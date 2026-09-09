import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  jd TEXT NOT NULL,
  jd_source_url TEXT,
  job_profile TEXT,
  job_profile_version INTEGER NOT NULL DEFAULT 0,
  job_profile_analyzed_at TEXT,
  job_profile_source TEXT,
  job_profile_updated_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  external_id TEXT,
  application_id TEXT,
  name TEXT NOT NULL,
  job_name TEXT NOT NULL DEFAULT '',
  resume_text TEXT NOT NULL,
  source_url TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  parsed_profile TEXT,
  report TEXT,
  interview_plan TEXT,
  interview_plan_created_at TEXT,
  interview_transcript TEXT,
  interview_evaluation TEXT,
  interview_evaluation_created_at TEXT,
  interview_evaluation_generation INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  sync_target TEXT,
  sync_remote_target_id TEXT,
  sync_error TEXT,
  sync_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS candidates_external_unique
  ON candidates(position_id, source, external_id) WHERE external_id IS NOT NULL AND external_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS candidates_url_unique
  ON candidates(position_id, source_url) WHERE source_url IS NOT NULL AND source_url <> '';
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt INTEGER NOT NULL DEFAULT 0,
  input TEXT,
  output TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS tasks_candidate_idx ON tasks(candidate_id, created_at);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status, created_at);
`;

export function createDatabase(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.exec(schema);
  const jobColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name));
  if (!jobColumns.has('jd_source_url')) db.exec('ALTER TABLE jobs ADD COLUMN jd_source_url TEXT');
  if (!jobColumns.has('job_profile')) db.exec('ALTER TABLE jobs ADD COLUMN job_profile TEXT');
  if (!jobColumns.has('job_profile_version')) db.exec('ALTER TABLE jobs ADD COLUMN job_profile_version INTEGER NOT NULL DEFAULT 0');
  if (!jobColumns.has('job_profile_analyzed_at')) db.exec('ALTER TABLE jobs ADD COLUMN job_profile_analyzed_at TEXT');
  if (!jobColumns.has('job_profile_source')) db.exec('ALTER TABLE jobs ADD COLUMN job_profile_source TEXT');
  if (!jobColumns.has('job_profile_updated_at')) db.exec('ALTER TABLE jobs ADD COLUMN job_profile_updated_at TEXT');
  const candidateColumns = new Set(db.prepare('PRAGMA table_info(candidates)').all().map((column) => column.name));
  if (!candidateColumns.has('interview_plan')) db.exec('ALTER TABLE candidates ADD COLUMN interview_plan TEXT');
  if (!candidateColumns.has('interview_plan_created_at')) db.exec('ALTER TABLE candidates ADD COLUMN interview_plan_created_at TEXT');
  if (!candidateColumns.has('interview_transcript')) db.exec('ALTER TABLE candidates ADD COLUMN interview_transcript TEXT');
  if (!candidateColumns.has('interview_evaluation')) db.exec('ALTER TABLE candidates ADD COLUMN interview_evaluation TEXT');
  if (!candidateColumns.has('interview_evaluation_created_at')) db.exec('ALTER TABLE candidates ADD COLUMN interview_evaluation_created_at TEXT');
  if (!candidateColumns.has('interview_evaluation_generation')) db.exec('ALTER TABLE candidates ADD COLUMN interview_evaluation_generation INTEGER NOT NULL DEFAULT 0');
  if (!candidateColumns.has('sync_status')) db.exec("ALTER TABLE candidates ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle'");
  if (!candidateColumns.has('sync_target')) db.exec('ALTER TABLE candidates ADD COLUMN sync_target TEXT');
  if (!candidateColumns.has('sync_remote_target_id')) db.exec('ALTER TABLE candidates ADD COLUMN sync_remote_target_id TEXT');
  if (!candidateColumns.has('sync_error')) db.exec('ALTER TABLE candidates ADD COLUMN sync_error TEXT');
  if (!candidateColumns.has('sync_at')) db.exec('ALTER TABLE candidates ADD COLUMN sync_at TEXT');
  return db;
}

export function json(value) {
  return value == null ? null : JSON.stringify(value);
}

export function parseJson(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, department: row.department, location: row.location,
    jd: row.jd, jdSourceUrl: row.jd_source_url ?? null,
    jobProfile: parseJson(row.job_profile), jobProfileVersion: row.job_profile_version ?? 0,
    jobProfileAnalyzedAt: row.job_profile_analyzed_at ?? null,
    jobProfileSource: row.job_profile_source ?? null,
    jobProfileUpdatedAt: row.job_profile_updated_at ?? row.job_profile_analyzed_at ?? null,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapCandidate(row) {
  if (!row) return null;
  const report = parseJson(row.report);
  const publicStatus = { evaluating: 'processing', evaluated: 'reviewed', shortlisted: 'passed' }[row.status] ?? row.status;
  return {
    id: row.id, positionId: row.position_id, jobId: row.position_id, externalId: row.external_id,
    applicationId: row.application_id, name: row.name, jobName: row.job_name,
    resumeText: row.resume_text, sourceUrl: row.source_url, source: row.source,
    status: publicStatus, parsedProfile: parseJson(row.parsed_profile), report,
    score: report?.score ?? null, grade: report?.grade ?? null, level: report?.grade ?? null,
    summary: report?.summary ?? null, dimensions: report?.dimensions ?? [],
    strengths: report?.strengths ?? [], risks: report?.risks ?? [], gaps: report?.gaps ?? [],
    interviewQuestions: report?.interviewQuestions ?? [],
    interviewPlan: parseJson(row.interview_plan), interviewPlanCreatedAt: row.interview_plan_created_at ?? null,
    interviewTranscript: row.interview_transcript ?? null,
    interviewEvaluation: parseJson(row.interview_evaluation),
    interviewEvaluationCreatedAt: row.interview_evaluation_created_at ?? null,
    syncStatus: row.sync_status ?? 'idle', syncTarget: row.sync_target ?? null,
    syncError: parseJson(row.sync_error), syncAt: row.sync_at ?? null,
    error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function internalCandidateStatus(status) {
  return { processing: 'evaluating', reviewed: 'evaluated', passed: 'shortlisted' }[status] ?? status;
}

export function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id, candidateId: row.candidate_id, stage: row.stage, status: row.status,
    attempt: row.attempt, input: parseJson(row.input), output: parseJson(row.output), error: row.error,
    createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at,
  };
}
