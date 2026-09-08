import { EventEmitter } from 'node:events';
import { json, mapCandidate } from './db.js';

const publicTarget = (status) => ({ shortlisted: 'passed' }[status] ?? status);

function safeError(error) {
  if (error?.safe) return error.safe;
  return { type: 'sync_failed', message: '飞书招聘同步失败', missingScopes: [], consoleUrl: null };
}

export class DecisionSync extends EventEmitter {
  constructor({ db, client, autoStart = true }) {
    super();
    this.db = db;
    this.client = client;
    this.autoStart = autoStart;
    this.pending = [];
    this.pendingIds = new Set();
    this.active = false;
    db.prepare("UPDATE candidates SET sync_status='failed', sync_error=? WHERE sync_status='pending'")
      .run(json({ type: 'interrupted', message: '上次同步被中断，请手动重试', missingScopes: [], consoleUrl: null }));
  }

  candidate(id) {
    return this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(id);
  }

  enqueue(candidateId, { force = false } = {}) {
    const candidate = this.candidate(candidateId);
    if (!candidate) throw Object.assign(new Error('候选人不存在'), { statusCode: 404 });
    const target = publicTarget(candidate.status);
    if (!['passed', 'rejected'].includes(target)) throw Object.assign(new Error('只有人工标记为通过或淘汰的候选人可同步'), { statusCode: 409 });
    if (candidate.source !== 'feishu') {
      this.db.prepare("UPDATE candidates SET sync_status='skipped',sync_target=?,sync_error=NULL WHERE id=?").run(target, candidateId);
      return 'skipped';
    }
    if (!force && candidate.sync_status === 'synced' && candidate.sync_target === target) return 'skipped';
    if (candidate.sync_status === 'pending' && candidate.sync_target === target) return 'skipped';
    if (this.pendingIds.has(candidateId)) return 'skipped';
    this.db.prepare(`UPDATE candidates SET sync_status='pending', sync_target=?,
      sync_remote_target_id=CASE WHEN sync_target=? THEN sync_remote_target_id ELSE NULL END,
      sync_error=NULL WHERE id=?`).run(target, target, candidateId);
    this.pending.push(candidateId);
    this.pendingIds.add(candidateId);
    if (this.autoStart) this.kick();
    return 'queued';
  }

  kick() { setImmediate(() => this.drain()); }

  async drain() {
    if (this.active) return;
    const candidateId = this.pending.shift();
    if (!candidateId) { this.emit('idle'); return; }
    this.active = true;
    try { await this.run(candidateId); } finally {
      this.pendingIds.delete(candidateId);
      this.active = false;
      this.kick();
    }
  }

  async run(candidateId) {
    const row = this.candidate(candidateId);
    if (!row) return;
    const candidate = mapCandidate(row);
    const target = row.sync_target;
    if (publicTarget(row.status) !== target) {
      this.db.prepare("UPDATE candidates SET sync_status='skipped',sync_error=NULL WHERE id=? AND sync_target=?").run(candidateId, target);
      return;
    }
    try {
      if (target === 'passed') {
        await this.client.pass(candidate, {
          remoteTargetId: row.sync_remote_target_id,
          onTargetResolved: async (stageId) => {
            this.db.prepare('UPDATE candidates SET sync_remote_target_id=? WHERE id=? AND sync_target=?').run(stageId, candidateId, target);
          },
        });
      } else if (target === 'rejected') await this.client.reject(candidate);
      const syncedAt = new Date().toISOString();
      this.db.prepare("UPDATE candidates SET sync_status='synced',sync_error=NULL,sync_at=? WHERE id=? AND sync_target=?")
        .run(syncedAt, candidateId, target);
    } catch (error) {
      this.db.prepare("UPDATE candidates SET sync_status='failed',sync_error=?,sync_at=? WHERE id=? AND sync_target=?")
        .run(json(safeError(error)), new Date().toISOString(), candidateId, target);
    }
  }

  waitForIdle(timeoutMs = 5000) {
    if (!this.active && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('等待飞书同步空闲超时')), timeoutMs);
      this.once('idle', () => { clearTimeout(timeout); resolve(); });
    });
  }
}
