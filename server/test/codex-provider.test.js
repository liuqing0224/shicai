import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeInterviewPlan, redactResume } from '../src/providers/codex.js';

test('发送给 Agent 前隐藏邮箱和中国大陆手机号', () => {
  const redacted = redactResume('邮箱: person@example.com\n电话：13800138000\n项目经验：负责销售培训系统');
  assert.doesNotMatch(redacted, /person@example\.com|13800138000/);
  assert.match(redacted, /项目经验：负责销售培训系统/);
});

test('归一化面试问题的中文优先级和简写追问', () => {
  const result = normalizeInterviewPlan({ questions: Array.from({ length: 10 }, (_, index) => ({
    priority: index < 8 ? '高优先级' : '备选', followUps: ['请说明个人贡献'],
  })) });
  assert.equal(result.questions[0].priority, 'high');
  assert.equal(result.questions[0].required, true);
  assert.equal(result.questions[8].priority, 'low');
  assert.equal(result.questions[8].required, false);
  assert.deepEqual(result.questions[0].followUps[0], { trigger: '回答仍需进一步核验', prompt: '请说明个人贡献' });
});
