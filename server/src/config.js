import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

export function loadConfig(overrides = {}) {
  return {
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    port: Number(overrides.port ?? process.env.PORT ?? 8897),
    dataDir: overrides.dataDir ?? process.env.DATA_DIR ?? path.join(projectRoot, '.data'),
    provider: overrides.provider ?? process.env.AGENT_PROVIDER ?? 'mock',
    concurrency: Math.max(1, Number(overrides.concurrency ?? process.env.AGENT_CONCURRENCY ?? 1)),
    timeoutMs: Math.max(1, Number(overrides.timeoutMs ?? process.env.AGENT_TIMEOUT_MINUTES ?? 10)) * 60_000,
    codexBin: overrides.codexBin ?? process.env.CODEX_BIN ?? 'codex',
    larkCliBin: overrides.larkCliBin ?? process.env.LARK_CLI_BIN ?? 'lark-cli',
    feishuEvaluationUrl: overrides.feishuEvaluationUrl ?? process.env.FEISHU_EVALUATION_URL ?? '',
    autoStartQueue: overrides.autoStartQueue ?? true,
  };
}
