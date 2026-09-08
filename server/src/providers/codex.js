import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { interviewPlanSchema, jobProfileSchema, parsedProfileSchema, reportSchema } from '../schema.js';

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
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号已隐藏]')
    .replace(/^\s*(?:电话|手机|手机号|邮箱)\s*[:：].*$/gim, '[联系方式已隐藏]');
}

export function normalizeInterviewPlan(plan) {
  const priorities = {
    high: 'high', medium: 'medium', low: 'low',
    '高': 'high', '高优先级': 'high', '必问': 'high',
    '中': 'medium', '中优先级': 'medium',
    '低': 'low', '低优先级': 'low', '备选': 'low',
  };
  const questions = Array.isArray(plan?.questions) ? plan.questions.map((question, index) => ({
    ...question,
    priority: priorities[question.priority] ?? question.priority,
    required: index < 8,
    expectedMinutes: Number.isInteger(question.expectedMinutes) ? question.expectedMinutes : 5,
    followUps: Array.isArray(question.followUps) ? question.followUps.map((item) => (
      typeof item === 'string' ? { trigger: '回答仍需进一步核验', prompt: item } : item
    )) : [],
  })) : plan?.questions;
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
    return interviewPlanSchema.parse(normalizeInterviewPlan(plan));
  }
}
