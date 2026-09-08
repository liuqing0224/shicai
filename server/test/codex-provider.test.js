import assert from 'node:assert/strict';
import test from 'node:test';

import { CodexProvider, normalizeInterviewPlan, redactInterviewInput, redactResume } from '../src/providers/codex.js';

test('发送给 Agent 前隐藏邮箱和中国大陆手机号', () => {
  const redacted = redactResume('邮箱: person@example.com\n电话：13800138000\n证件号：11010519491231002X\n性别：女\n项目经验：负责销售培训系统');
  assert.doesNotMatch(redacted, /person@example\.com|13800138000|11010519491231002X|性别：女/);
  assert.match(redacted, /项目经验：负责销售培训系统/);
});

test('面试评价输入隐藏候选人姓名与国际电话', () => {
  const redacted = redactInterviewInput('李雷说可联系 +1 415 555 2671，姓名：李雷', '李雷');
  assert.doesNotMatch(redacted, /李雷|415 555 2671/);
});

test('Codex 面试评价使用匿名引用且不把结构化字段中的姓名带入提示词', async () => {
  const provider = new CodexProvider({ codexBin: 'unused', timeoutMs: 1000 });
  const dimensions = [
    { id: 'skills', name: '技能', weight: 0.6 },
    { id: 'delivery', name: '交付', weight: 0.4 },
  ];
  let prompt;
  provider.run = async (value) => {
    prompt = value;
    return {
      recommendation: 'conditional_pass', summary: '证据有限', strengths: [], concerns: [],
      notAssessed: ['技能', '交付'], claimVerifications: [], criticalGaps: [],
      assessedCoverageWeight: 99, weightedScore: 0,
      dimensions: dimensions.map((item) => ({
        ...item, status: 'not_assessed', score: null, evidence: [], assessment: '未覆盖',
      })),
    };
  };
  const result = await provider.evaluateInterview({
    candidate: { id: 'candidate-ref-1', name: '李雷', resumeText: '姓名：李雷\n电话：13800138000' },
    jobProfile: { dimensions }, parsedProfile: { name: '李雷' },
    report: { summary: '已初评李雷' }, interviewPlan: {},
    transcript: '李雷：住址：上海市某路 1 号，证件号 11010519491231002X。',
  });
  assert.match(prompt, /candidateRef:candidate-ref-1/);
  assert.doesNotMatch(prompt, /李雷|13800138000|11010519491231002X|上海市某路/);
  assert.equal(result.assessedCoverageWeight, 0);
  assert.equal(result.weightedScore, null);
});

test('归一化面试问题的中文优先级和简写追问', () => {
  const result = normalizeInterviewPlan({ questions: Array.from({ length: 10 }, (_, index) => ({
    priority: index === 0 ? '高（核心必问）' : index < 8 ? '未标注' : '可选追问',
    followUps: ['请说明个人贡献'],
  })) });
  assert.equal(result.questions[0].priority, 'high');
  assert.equal(result.questions[1].priority, 'high');
  assert.equal(result.questions[0].required, true);
  assert.equal(result.questions[8].priority, 'low');
  assert.equal(result.questions[8].required, false);
  assert.deepEqual(result.questions[0].followUps[0], { trigger: '回答仍需进一步核验', prompt: '请说明个人贡献' });
});

test('面试问题遗漏岗位维度时补充中性核验题', () => {
  const questions = Array.from({ length: 15 }, (_, index) => ({
    id: `q-${index}`, dimensionId: index < 14 ? 'skills' : 'delivery', dimensionName: index < 14 ? '技能' : '交付',
    priority: 'low', followUps: ['请举例'],
  }));
  const result = normalizeInterviewPlan({ questions }, { dimensions: [
    { id: 'skills', name: '技能', requirements: ['掌握开发技术'] },
    { id: 'delivery', name: '交付', requirements: ['推动项目上线'] },
    { id: 'experience', name: '经验', requirements: ['三年以上相关经验'] },
  ] });
  assert.equal(result.questions.length, 15);
  assert.deepEqual(new Set(result.questions.map((question) => question.dimensionId)), new Set(['skills', 'delivery', 'experience']));
  assert.match(result.questions.find((question) => question.dimensionId === 'experience').question, /个人贡献/);
});
