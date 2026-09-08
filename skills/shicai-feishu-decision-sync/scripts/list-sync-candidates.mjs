#!/usr/bin/env node
import Database from 'better-sqlite3';
import path from 'node:path';
import { argValue, publicTarget, validateSourceUrl } from './sync-common.mjs';

const args = process.argv.slice(2);
const dbPath = path.resolve(argValue(args, '--db', '.data/app.db'));
const jobId = argValue(args, '--job-id');
const includeSynced = args.includes('--include-synced');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const rows = db.prepare(`SELECT id,position_id,application_id,external_id,name,job_name,source_url,
    source,status,sync_status,sync_target FROM candidates
    WHERE source='feishu' AND status IN ('shortlisted','rejected')
      AND sync_status <> 'pending'
      AND (? = '' OR position_id = ?)
    ORDER BY job_name,name`).all(jobId, jobId);
  const candidates = rows.flatMap((row) => {
    const target = publicTarget(row.status);
    if (!includeSynced && row.sync_status === 'synced' && row.sync_target === target) return [];
    try {
      return [{
        id: row.id, positionId: row.position_id, applicationId: row.application_id,
        externalId: row.external_id, name: row.name, jobName: row.job_name,
        sourceUrl: validateSourceUrl(row.source_url, row.application_id),
        target, syncStatus: row.sync_status,
      }];
    } catch (error) {
      return [{ id: row.id, name: row.name, jobName: row.job_name, target, syncStatus: row.sync_status, invalid: error.message }];
    }
  });
  console.log(JSON.stringify({ db: dbPath, jobId: jobId || null, count: candidates.length, candidates }, null, 2));
} finally {
  db.close();
}
