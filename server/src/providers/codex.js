import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { interviewPlanSchema, jobProfileSchema, parsedProfileSchema, reportSchema } from '../schema.js';
import { interviewEvaluationSchema } from '../interview-evaluation.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function agentInstructions(stage) {
  return readFileSync(path.join(projectRoot, 'agents', stage, 'AGENTS.md'), 'utf8');
}

function extractJson(output) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1);
  return JSON.parse(source);
}

export function redactResume(text) {
  return String(text ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已隐藏]')
    .replace(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d(?:[-\s]?\d){8}(?!\d)/g, '[手机号已隐藏]')
    .replace(/(?<!\w)\+\d{1,3}(?:[-\s()]?\d){7,14}(?!\w)/g, '[国际电话已隐藏]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)|(?<!\d)\d{15}(?!\d)/g, '[证件号已隐藏]')
    .replace(/^.*(?:姓名|名字|电话|手机|手机号|邮箱|年龄|性别|婚姻|婚育|籍贯|民族|政治面貌|出生(?:日期|年月)?|住址|地址|现居地)\s*[:：].*$/gim, '[敏感信息已隐藏]');
}

export function redactInterviewInput(text, candidateName) {
  const redacted = redactResume(text);
  if (!candidateName) return redacted;
  return redacted.split(String(candidateName)).join('[候选人]');
}

export function normalizeInterviewPlan(plan, jobProfile) {
  const priorities = {
    high: 'high', medium: 'medium', low: 'low',
    '高': 'high', '高优先级': 'high', '必问': 'high',
    '中': 'medium', '中优先级': 'medium',
    '低': 'low', '低优先级': 'low', '备选': 'low',
  };
  const normalizePriority = (value, index) => {
    const text = String(value ?? '').trim().toLowerCase();
    if (priorities[text]) return priorities[text];
    if (text.includes('高') || text.includes('必问') || text.includes('high')) return 'high';
    if (text.includes('中') || text.includes('medium')) return 'medium';
    if (text.includes('低') || text.includes('备选') || text.includes('可选') || text.includes('low')) return 'low';
    return index < 8 ? 'high' : 'low';
  };
  const questions = Array.isArray(plan?.questions) ? plan.questions.map((question, index) => ({
    ...question,
    priority: normalizePriority(question.priority, index),
    required: index < 8,
    expectedMinutes: Number.isInteger(question.expectedMinutes) ? question.expectedMinutes : 5,
    followUps: Array.isArray(question.followUps) ? question.followUps.map((item) => (
      typeof item === 'string' ? { trigger: '回答仍需进一步核验', prompt: item } : item
    )) : [],
  })) : plan?.questions;
  if (Array.isArray(questions) && Array.isArray(jobProfile?.dimensions)) {
    const covered = new Set(questions.map((question) => question.dimensionId));
    const existingIds = new Set(questions.map((question) => question.id));
    for (const dimension of jobProfile.dimensions) {
      if (covered.has(dimension.id)) continue;
      let id = `coverage-${dimension.id}`;
      while (existingIds.has(id)) id += '-extra';
      questions.push({
        id, dimensionId: dimension.id, dimensionName: dimension.name,
        priority: 'low', required: false, expectedMinutes: 5,
        question: `请结合一个具体案例，说明您如何满足以下岗位要求：${dimension.requirements.join('；')}。请区分个人贡献、团队成果，并给出可核验的产物或结果。`,
        purpose: `补充核验岗位画像中的“${dimension.name}”维度。`,
        profileRequirements: dimension.requirements,
        resumeEvidence: [],
        strongSignals: ['说明具体情境、个人行动、可核验产物和结果，并能解释适用边界'],
        warningSignals: ['仅给出抽象判断或团队成果，无法说明个人行动和证据'],
        followUps: [{ trigger: '回答缺少可核验证据', prompt: '请说明时间、范围、个人负责部分、产物以及结果的验证方式。' }],
      });
      existingIds.add(id);
      covered.add(dimension.id);
    }
    while (questions.length > 15) {
      const counts = questions.reduce((result, question) => result.set(question.dimensionId, (result.get(question.dimensionId) ?? 0) + 1), new Map());
      const removable = questions.findLastIndex((question, index) => index >= 8 && counts.get(question.dimensionId) > 1);
      if (removable < 0) break;
      questions.splice(removable, 1);
    }
  }
  return { ...plan, questions };
}

export class CodexProvider {
  constructor({ codexBin, timeoutMs }) {
    this.codexBin = codexBin;
    this.timeoutMs = timeoutMs;
  }

  async analyzeJob({ job }) {
    const profile = await this.run(`${agentInstructions('job-analyst')}\n\n职位:${job.name}\nJD:\n${job.jd}`);
    return jobProfileSchema.parse(profile);
  }

  run(prompt) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.codexBin, [
        'exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-',
      ], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const maxBuffer = 5 * 1024 * 1024;
      const timer = setTimeout(() => child.kill('SIGTERM'), this.timeoutMs);
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.length > maxBuffer) child.kill('SIGTERM');
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        if (stderr.length > maxBuffer) child.kill('SIGTERM');
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Codex Agent 运行失败（${signal || `code ${code}`}）：${stderr.slice(-1000)}`));
          return;
        }
        try {
          resolve(extractJson(stdout));
        } catch (error) {
          reject(new Error(`Codex Agent 返回的不是合法 JSON：${error.message}`));
        }
      });
      child.stdin.end(prompt);
    });
  }

  parse({ candidate }) {
    return this.run(`${agentInstructions('parser')}\n\n候选人: ${candidate.name}\n简历:\n${redactResume(candidate.resumeText)}`)
      .then((result) => parsedProfileSchema.parse(result));
  }

  async evaluate({ candidate, job, jobProfile, parsedProfile }) {
    const report = await this.run(`${agentInstructions('evaluator')}\n\n职位:${job.name}\nJD:${job.jd}\n岗位画像:${JSON.stringify(jobProfile)}\n候选人:${candidate.name}\n结构化简历:${JSON.stringify(parsedProfile)}\n原文:${redactResume(candidate.resumeText)}`);
    return reportSchema.parse({ ...report, score: 0, grade: 'D', recommendation: 'hold' });
  }

  async review({ report, candidate, job, jobProfile }) {
    const reviewed = await this.run(`${agentInstructions('reviewer')}\n\nJD:${job.jd}\n岗位画像:${JSON.stringify(jobProfile)}\n简历:${redactResume(candidate.resumeText)}\n报告:${JSON.stringify(report)}`);
    return reportSchema.parse({
      ...reviewed,
      score: report.score,
      grade: report.grade,
      recommendation: report.recommendation,
    });
  }

  async designInterview({ candidate, jobProfile, parsedProfile, report }) {
    const plan = await this.run(`${agentInstructions('interview-designer')}\n\n岗位画像:${JSON.stringify(jobProfile)}\n候选人结构化简历:${JSON.stringify(parsedProfile)}\n已复核评估:${JSON.stringify(report)}\n简历原文:${redactResume(candidate.resumeText)}`);
    return interviewPlanSchema.parse(normalizeInterviewPlan(plan, jobProfile));
  }

  async evaluateInterview({ candidate, jobProfile, parsedProfile, report, interviewPlan, transcript }) {
    const anonymousProfile = { ...parsedProfile, name: '[候选人]' };
    const prompt = `${agentInstructions('interview-evaluator')}\n\ncandidateRef:${candidate.id}\n岗位画像:${JSON.stringify(jobProfile)}\n结构化简历:${JSON.stringify(anonymousProfile)}\n已复核简历报告:${JSON.stringify(report)}\n面试计划:${JSON.stringify(interviewPlan)}\n脱敏简历原文:${redactResume(candidate.resumeText)}\n脱敏面试记录:${redactResume(transcript)}`;
    const evaluation = await this.run(redactInterviewInput(prompt, candidate.name));
    return interviewEvaluationSchema.parse({ ...evaluation, assessedCoverageWeight: 0, weightedScore: null });
  }
}
