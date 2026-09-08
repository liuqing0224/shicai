#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { parseArgs } from './config.mjs';
import { captureInitialList, collectCandidate, collectList, jobTitle } from './feishu.mjs';
import { importCandidates } from './importer.mjs';
import { readJson, writeJsonAtomic } from './json-files.mjs';

export { parseArgs } from './config.mjs';
export { resumeMarkdown } from './resume-markdown.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.profileDir, { recursive: true, mode: 0o700 });
  mkdirSync(args.outDir, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(args.profileDir, {
    headless: false,
    executablePath: args.executablePath,
    viewport: null,
    acceptDownloads: false,
  });
  let result;
  try {
    const pages = context.pages();
    const page = pages[0] ?? await context.newPage();
    const capture = await captureInitialList(context, page, args);
    const allItems = await collectList(context, page, capture);
    const matched = allItems.filter((item) => jobTitle(item) === args.jobName).slice(0, args.limit);
    if (!matched.length) {
      const available = [...new Set(allItems.map(jobTitle).filter(Boolean))].sort();
      throw new Error(`未找到精确职位名“${args.jobName}”的候选人；待评估列表中的职位：${available.join('、') || '无'}`);
    }

    const candidates = [];
    let cacheHits = 0;
    let noResume = 0;
    for (const item of matched) {
      const collected = await collectCandidate(context, args, item);
      candidates.push(collected.candidate);
      if (collected.cached) cacheHits += 1;
      if (!collected.candidate.hasResume) noResume += 1;
    }

    const importedState = readJson(path.join(args.outDir, 'imported.json'), { externalIds: [] });
    const importedIds = new Set(Array.isArray(importedState.externalIds) ? importedState.externalIds : []);
    const imported = args.dryRun
      ? { submitted: 0, imported: 0, skipped: 0, queued: 0 }
      : await importCandidates(args, candidates, importedIds);
    result = {
      ok: true,
      jobName: args.jobName,
      listCount: allItems.length,
      matched: matched.length,
      collected: candidates.length,
      cacheHits,
      noResume,
      dryRun: args.dryRun,
      import: imported,
      finishedAt: new Date().toISOString(),
    };
    writeJsonAtomic(path.join(args.outDir, 'run-result.json'), result);
  } finally {
    await context.close();
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    const result = { ok: false, error: error.message, finishedAt: new Date().toISOString() };
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  });
}
