import { CodexProvider } from './codex.js';
import { MockProvider } from './mock.js';

export function createProvider(config) {
  if (config.provider === 'mock') return new MockProvider();
  if (config.provider === 'codex') return new CodexProvider(config);
  throw new Error(`Unsupported AGENT_PROVIDER: ${config.provider}`);
}
