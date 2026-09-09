import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

export function loadConfig(overrides = {}) {
  const timeoutMs = overrides.timeoutMs === undefined
    ? Math.max(1, Number(process.env.AGENT_TIMEOUT_MINUTES ?? 10)) * 60_000
    : Math.max(1, Number(overrides.timeoutMs));
  return {
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    port: Number(overrides.port ?? process.env.PORT ?? 8897),
    dataDir: overrides.dataDir ?? process.env.DATA_DIR ?? path.join(projectRoot, '.data'),
    provider: overrides.provider ?? process.env.AGENT_PROVIDER ?? 'mock',
    concurrency: Math.max(1, Number(overrides.concurrency ?? process.env.AGENT_CONCURRENCY ?? 1)),
    evaluationMaxAttempts: Math.max(1, Number(overrides.evaluationMaxAttempts ?? process.env.EVALUATION_MAX_ATTEMPTS ?? 3)),
    evaluationRetryDelayMs: Math.max(0, Number(overrides.evaluationRetryDelayMs ?? process.env.EVALUATION_RETRY_DELAY_MS ?? 1500)),
    timeoutMs,
    codexBin: overrides.codexBin ?? process.env.CODEX_BIN ?? 'codex',
    larkCliBin: overrides.larkCliBin ?? process.env.LARK_CLI_BIN ?? 'lark-cli',
    larkHireSyncTimeoutMs: Math.max(1, Number(overrides.larkHireSyncTimeoutSeconds ?? process.env.LARK_HIRE_SYNC_TIMEOUT_SECONDS ?? 60)) * 1000,
    feishuEvaluationUrl: overrides.feishuEvaluationUrl ?? process.env.FEISHU_EVALUATION_URL ?? '',
    autoStartQueue: overrides.autoStartQueue ?? true,
  };
}
