import path from 'node:path';

import { writeJsonAtomic } from './json-files.mjs';

export async function importCandidates(args, candidates, importedIds) {
  const pending = candidates.filter((candidate) => !importedIds.has(candidate.externalId));
  const totals = { submitted: 0, imported: 0, skipped: candidates.length - pending.length, queued: 0 };
  for (let index = 0; index < pending.length; index += args.batchSize) {
    const batch = pending.slice(index, index + args.batchSize);
    const response = await fetch(args.importUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ positionId: args.positionId, jobName: args.jobName, candidates: batch }),
    });
    const payload = await response.json().catch(() => ({}));
    const ok = typeof response.ok === 'function' ? response.ok() : response.ok;
    const status = typeof response.status === 'function' ? response.status() : response.status;
    if (!ok) throw new Error(`导入接口 HTTP ${status}: ${payload.error ?? payload.message ?? '请求失败'}`);
    totals.submitted += batch.length;
    totals.imported += Number(payload.imported ?? payload.created ?? batch.length);
    totals.skipped += Number(payload.skipped ?? payload.duplicates ?? 0);
    totals.queued += Number(payload.queued ?? 0);
    for (const candidate of batch) importedIds.add(candidate.externalId);
    writeJsonAtomic(path.join(args.outDir, 'imported.json'), {
      externalIds: [...importedIds].sort(),
      updatedAt: new Date().toISOString(),
    });
  }
  return totals;
}
