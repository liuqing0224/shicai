import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { createDatabase } from '../src/db.js';

test('旧 jobs 表自动迁移岗位画像字段', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-db-migration-'));
  const filename = path.join(directory, 'legacy.db');
  const legacy = new Database(filename);
  legacy.exec(`CREATE TABLE jobs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, department TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
    jd TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE candidates (
    id TEXT PRIMARY KEY, position_id TEXT NOT NULL REFERENCES jobs(id), external_id TEXT, application_id TEXT,
    name TEXT NOT NULL, job_name TEXT NOT NULL DEFAULT '', resume_text TEXT NOT NULL, source_url TEXT,
    source TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'pending', parsed_profile TEXT,
    report TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  legacy.close();

  const migrated = createDatabase(filename);
  const columns = new Set(migrated.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name));
  assert.ok(columns.has('job_profile'));
  assert.ok(columns.has('job_profile_version'));
  assert.ok(columns.has('job_profile_analyzed_at'));
  const candidateColumns = new Set(migrated.prepare('PRAGMA table_info(candidates)').all().map((column) => column.name));
  assert.ok(candidateColumns.has('interview_plan'));
  assert.ok(candidateColumns.has('interview_plan_created_at'));
  migrated.close();
  fs.rmSync(directory, { recursive: true });
});
