import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs, resumeMarkdown } from '../src/collect.mjs';

test('supports tenant and api-base aliases', () => {
  const args = parseArgs(['--tenant', 'https://example.feishu.cn/hire', '--job-name', '后端工程师', '--position-id', 'p1', '--api-base', 'http://127.0.0.1:8897']);
  assert.equal(args.tenantUrl, 'https://example.feishu.cn');
  assert.equal(args.importUrl, 'http://127.0.0.1:8897/api/import/feishu');
  assert.match(args.listUrl, /activeStatus=1/);
});

test('accepts a same-tenant evaluation list URL', () => {
  const args = parseArgs(['--tenant', 'https://example.feishu.cn', '--job-name', '测试', '--dry-run', '--list-url', 'https://example.feishu.cn/hire/application-biz/evaluation/list?activeStatus=1']);
  assert.match(args.listUrl, /activeStatus=1/);
});

test('dry-run permits no position id', () => {
  const args = parseArgs(['--tenant-url', 'https://example.feishu.cn', '--job-name', '测试', '--dry-run']);
  assert.equal(args.dryRun, true);
});

test('accepts explicit import flag used by the server scheduler', () => {
  const args = parseArgs(['--tenant', 'https://example.feishu.cn', '--job-name', '测试', '--position-id', 'p1', '--import']);
  assert.equal(args.dryRun, false);
});

test('renders normalized resume markdown', () => {
  const markdown = resumeMarkdown({ name: '候选人', email: 'person@example.com', mobile: '13800138000', educations: [{ school: '示例大学' }], skills: ['Node.js', 'SQL'] });
  assert.match(markdown, /示例大学/);
  assert.match(markdown, /Node\.js；SQL/);
  assert.doesNotMatch(markdown, /邮箱:/);
  assert.doesNotMatch(markdown, /person@example\.com|13800138000/);
});

test('rejects oversized import batches', () => {
  assert.throws(() => parseArgs(['--tenant-url', 'https://example.feishu.cn', '--job-name', '测试', '--dry-run', '--batch-size', '101']), /1 到 100/);
});
