#!/usr/bin/env node
import Database from 'better-sqlite3';
import path from 'node:path';
import { appendJournal, argValue, publicTarget, requireChoice } from './sync-common.mjs';

const args = process.argv.slice(2);
const dbPath = path.resolve(argValue(args, '--db', '.data/app.db'));
const journal = argValue(args, '--journal', '.data/feishu-sync-journal.jsonl');
const candidateId = argValue(args, '--candidate-id');
const applicationId = argValue(args, '--application-id');
const expectedTarget = requireChoice(argValue(args, '--expected-target'), ['passed', 'rejected'], 'expected target');
const result = requireChoice(argValue(args, '--result'), ['synced', 'failed', 'conflict'], 'result');
const provenance = requireChoice(argValue(args, '--provenance'), ['changed-by-browser', 'already-consistent', 'remote-authoritative', 'browser-failed', 'conflict'], 'provenance');
const remoteStatus = argValue(args, '--remote-status');
const message = argValue(args, '--message');
if (!candidateId || !applicationId) throw new Error('--candidate-id and --application-id are required');
if (provenance === 'remote-authoritative') requireChoice(remoteStatus, ['passed', 'rejected'], 'remote status');
const successful = ['changed-by-browser', 'already-consistent', 'remote-authoritative'];
if (result === 'synced' && !successful.includes(provenance)) throw new Error('synced requires a successful provenance');
if (result === 'failed' && provenance !== 'browser-failed') throw new Error('failed requires browser-failed provenance');
if (result === 'conflict' && provenance !== 'conflict') throw new Error('conflict requires conflict provenance');
if (provenance === 'remote-authoritative' && result !== 'synced') throw new Error('remote-authoritative requires a synced result');

const db = new Database(dbPath, { fileMustExist: true });
const now = new Date().toISOString();
try {
  const transaction = db.transaction(() => {
    const row = db.prepare('SELECT id,status,source,application_id,sync_target,sync_status FROM candidates WHERE id=?').get(candidateId);
    if (!row) throw new Error('Candidate not found');
    if (row.source !== 'feishu' || row.application_id !== applicationId) throw new Error('Candidate Feishu identity changed; refusing stale result');
    if (row.sync_status === 'pending') throw new Error('OpenAPI sync is pending; refusing concurrent browser result');
    const localTarget = publicTarget(row.status);
    if (localTarget !== expectedTarget) throw new Error('Local recruiter decision changed; reclassify before recording');
    if (provenance === 'remote-authoritative') {
      const internalStatus = remoteStatus === 'passed' ? 'shortlisted' : 'rejected';
      db.prepare(`UPDATE candidates SET status=?,sync_status='synced',sync_target=?,sync_error=NULL,sync_at=?,updated_at=? WHERE id=?`)
        .run(internalStatus, remoteStatus, now, now, candidateId);
      return remoteStatus;
    }
    if (result === 'synced') {
      db.prepare("UPDATE candidates SET sync_status='synced',sync_target=?,sync_error=NULL,sync_at=? WHERE id=?")
        .run(expectedTarget, now, candidateId);
    } else {
      const error = JSON.stringify({ type: provenance, message: String(message || 'Feishu browser reconciliation did not complete').slice(0, 500), missingScopes: [], consoleUrl: null });
      db.prepare("UPDATE candidates SET sync_status='failed',sync_target=?,sync_error=?,sync_at=? WHERE id=?")
        .run(expectedTarget, error, now, candidateId);
    }
    return expectedTarget;
  });
  const finalTarget = transaction();
  const entry = { at: now, candidateId, applicationId, expectedTarget, finalTarget, result, provenance, remoteStatus: remoteStatus || null, message: message || null };
  appendJournal(journal, entry);
  console.log(JSON.stringify(entry, null, 2));
} finally {
  db.close();
}
