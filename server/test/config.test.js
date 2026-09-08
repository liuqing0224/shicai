import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

test('程序化超时使用毫秒，环境配置使用分钟', () => {
  const previous = process.env.AGENT_TIMEOUT_MINUTES;
  process.env.AGENT_TIMEOUT_MINUTES = '3';
  try {
    assert.equal(loadConfig().timeoutMs, 180_000);
    assert.equal(loadConfig({ timeoutMs: 12_345 }).timeoutMs, 12_345);
  } finally {
    if (previous === undefined) delete process.env.AGENT_TIMEOUT_MINUTES;
    else process.env.AGENT_TIMEOUT_MINUTES = previous;
  }
});
