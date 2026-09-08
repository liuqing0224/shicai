#!/usr/bin/env node
import Database from 'better-sqlite3';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1];
};
const dbPath = path.resolve(value('--db', '.data/app.db'));
const jobId = value('--job-id', '');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const where = jobId ? 'WHERE c.position_id = ?' : '';
  const params = jobId ? [jobId] : [];
  const candidates = db.prepare(`SELECT c.status, COUNT(*) count FROM candidates c ${where} GROUP BY c.status`).all(...params);
  const tasks = db.prepare(`SELECT t.stage,t.status,COUNT(*) count FROM tasks t JOIN candidates c ON c.id=t.candidate_id ${where} GROUP BY t.stage,t.status`).all(...params);
  const failedWhere = jobId ? 'WHERE c.position_id = ? AND t.status = \'failed\'' : "WHERE t.status = 'failed'";
  const failures = db.prepare(`SELECT t.candidate_id candidateId,t.stage,t.error FROM tasks t JOIN candidates c ON c.id=t.candidate_id ${failedWhere} ORDER BY t.completed_at DESC LIMIT 20`).all(...params);
  console.log(JSON.stringify({ db: dbPath, jobId: jobId || null, candidates, tasks, failures }, null, 2));
} finally {
  db.close();
}
