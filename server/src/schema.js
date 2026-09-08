import { z } from 'zod';

const text = z.string().trim();
export const jobInputSchema = z.object({
  name: text.min(1), department: text.optional().default(''), location: text.optional().default(''),
  jd: text.min(1), status: z.enum(['active', 'paused', 'closed']).optional().default('active'),
});

export const jobPatchSchema = z.object({
  name: text.min(1).optional(),
  department: text.optional(),
  location: text.optional(),
  jd: text.min(1).optional(),
  status: z.enum(['active', 'paused', 'closed']).optional(),
});
export const candidateInputSchema = z.object({
  positionId: text.min(1), externalId: text.optional().nullable().default(null), applicationId: text.optional().nullable().default(null),
  name: text.min(1), jobName: text.optional().default(''), resumeText: text.min(1),
  sourceUrl: text.optional().nullable().default(null), source: text.optional().default('manual'),
});

export const candidatePatchSchema = z.object({
  name: text.min(1).optional(), resumeText: text.min(1).optional(),
  status: z.enum(['pending', 'processing', 'reviewed', 'passed', 'hold', 'rejected', 'failed', 'evaluating', 'evaluated', 'shortlisted']).optional(),
});

const stringList = z.array(z.string());
export const jobDimensionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/, '维度 id 必须是稳定的小写英文标识'),
  name: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0.05).max(1),
  requirements: stringList.min(1),
  criteria: z.array(z.object({
    id: z.string().min(1), text: z.string().min(1), priority: z.enum(['must', 'preferred']),
    proficiency: z.string().nullable().optional(), minYears: z.number().min(0).nullable().optional(),
    evidenceQuote: z.string().min(1),
  })).optional().default([]),
  keywords: stringList,
  mustHave: z.boolean(),
});

export const jobProfileSchema = z.object({
  summary: z.string().min(1),
  seniority: z.string().min(1),
  responsibilities: stringList,
  mustHaves: stringList,
  niceToHaves: stringList,
  dimensions: z.array(jobDimensionSchema).min(2).max(8),
}).superRefine((value, context) => {
  const total = value.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (Math.abs(total - 1) > 0.001) context.addIssue({ code: 'custom', path: ['dimensions'], message: '岗位画像维度权重之和必须为 1' });
  const ids = value.dimensions.map((dimension) => dimension.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['dimensions'], message: '岗位画像维度 id 不得重复' });
});

export const parsedProfileSchema = z.object({
  name: z.string(),
  skills: stringList,
  highlights: stringList,
  yearsOfExperience: z.number().min(0),
  education: z.string(),
});

export const reportSchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D']),
  recommendation: z.enum(['strong_yes', 'yes', 'hold', 'no']),
  summary: z.string().min(1),
  dimensions: z.array(z.object({
    id: z.string().optional(), name: z.string().min(1), score: z.number().min(0).max(10), weight: z.number().min(0).max(1),
    requirements: stringList.optional().default([]), evidence: stringList,
    gaps: stringList.optional().default([]), risks: stringList.optional().default([]),
    requirementMatches: z.array(z.object({
      requirementId: z.string().min(1), status: z.enum(['met', 'partial', 'not_met', 'unknown']),
      evidence: stringList, notes: z.string(),
    })).optional().default([]),
  })).min(1),
  strengths: stringList,
  risks: stringList,
  gaps: stringList,
  interviewQuestions: stringList,
  evidence: stringList,
  review: z.object({ approved: z.boolean(), notes: stringList }).optional(),
}).superRefine((value, context) => {
  const total = value.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (Math.abs(total - 1) > 0.001) {
    context.addIssue({ code: 'custom', path: ['dimensions'], message: '维度权重之和必须为 1' });
  }
});

export function alignedReportSchema(jobProfile) {
  return reportSchema.superRefine((report, context) => {
    if (!jobProfile) return;
    if (report.dimensions.length !== jobProfile.dimensions.length) {
      context.addIssue({ code: 'custom', path: ['dimensions'], message: '评估维度数量与岗位画像不一致' });
      return;
    }
    jobProfile.dimensions.forEach((expected, index) => {
      const actual = report.dimensions[index];
      if (!actual || actual.id !== expected.id || actual.name !== expected.name || Math.abs(actual.weight - expected.weight) > 0.001) {
        context.addIssue({ code: 'custom', path: ['dimensions', index], message: `维度必须与岗位画像 ${expected.id} 对齐` });
      }
    });
  });
}

export function normalizeAlignedReport(value, jobProfile) {
  const report = alignedReportSchema(jobProfile).parse(value);
  const score = Math.round(report.dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) * 10);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
  const recommendation = score >= 85 ? 'strong_yes' : score >= 70 ? 'yes' : score >= 55 ? 'hold' : 'no';
  const unknownMust = jobProfile.dimensions.some((dimension, index) => dimension.mustHave
    && report.dimensions[index].requirementMatches.some((match) => match.status === 'unknown'));
  return reportSchema.parse({
    ...report, score, grade,
    recommendation: unknownMust && recommendation === 'no' ? 'hold' : recommendation,
    risks: unknownMust ? [...new Set([...report.risks, '关键必须项证据不足，需人工复核'])] : report.risks,
  });
}

const scoreAnchorsSchema = z.object({
  one: z.string().min(1), two: z.string().min(1), three: z.string().min(1), four: z.string().min(1),
});

export const interviewPlanSchema = z.object({
  durationMinutes: z.number().int().min(30).max(120),
  strategy: z.object({
    summary: z.string().min(1), priorities: stringList.min(1),
    timeAllocation: z.array(z.object({ section: z.string().min(1), minutes: z.number().int().min(1) })).min(1),
  }),
  questions: z.array(z.object({
    id: z.string().min(1), dimensionId: z.string().min(1), dimensionName: z.string().min(1),
    priority: z.enum(['high', 'medium', 'low']), required: z.boolean(), expectedMinutes: z.number().int().min(1).max(15),
    question: z.string().min(1), purpose: z.string().min(1),
    profileRequirements: stringList, resumeEvidence: stringList, strongSignals: stringList.min(1),
    warningSignals: stringList.min(1), followUps: z.array(z.object({ trigger: z.string().min(1), prompt: z.string().min(1) })).min(1),
  })).min(10).max(15),
  caseExercise: z.object({
    title: z.string().min(1), prompt: z.string().min(1), durationMinutes: z.number().int().min(5),
    deliverables: stringList.min(1), evaluationCriteria: stringList.min(1),
  }).nullable(),
  scorecard: z.object({
    scale: z.literal('1-4'), evidenceRequired: z.literal(true),
    dimensions: z.array(z.object({
      dimensionId: z.string().min(1), dimensionName: z.string().min(1), weight: z.number().min(0).max(1),
      anchors: scoreAnchorsSchema,
    })).min(1),
    recommendationRule: z.string().min(1),
  }),
}).superRefine((plan, context) => {
  const allocated = plan.strategy.timeAllocation.reduce((sum, item) => sum + item.minutes, 0);
  if (allocated !== plan.durationMinutes) context.addIssue({ code: 'custom', path: ['strategy', 'timeAllocation'], message: '时间分配之和必须等于面试时长' });
  const ids = plan.questions.map((question) => question.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['questions'], message: '面试问题 id 不得重复' });
  if (plan.questions.filter((question) => question.required).length !== 8 || plan.questions.slice(0, 8).some((question) => !question.required)) {
    context.addIssue({ code: 'custom', path: ['questions'], message: '前 8 题必须为必问，其余为备选' });
  }
});

export function alignedInterviewPlanSchema(jobProfile) {
  return interviewPlanSchema.superRefine((plan, context) => {
    const dimensions = new Map(jobProfile.dimensions.map((dimension) => [dimension.id, dimension]));
    plan.questions.forEach((question, index) => {
      const dimension = dimensions.get(question.dimensionId);
      if (!dimension || question.dimensionName !== dimension.name) {
        context.addIssue({ code: 'custom', path: ['questions', index, 'dimensionId'], message: '面试问题必须对齐当前岗位画像' });
      }
    });
    const covered = new Set(plan.questions.map((question) => question.dimensionId));
    jobProfile.dimensions.forEach((dimension) => {
      if (!covered.has(dimension.id)) context.addIssue({ code: 'custom', path: ['questions'], message: `面试问题未覆盖 ${dimension.id}` });
    });
    if (plan.scorecard.dimensions.length !== jobProfile.dimensions.length) {
      context.addIssue({ code: 'custom', path: ['scorecard', 'dimensions'], message: '评分卡维度数量与岗位画像不一致' });
      return;
    }
    jobProfile.dimensions.forEach((expected, index) => {
      const actual = plan.scorecard.dimensions[index];
      if (!actual || actual.dimensionId !== expected.id || actual.dimensionName !== expected.name || Math.abs(actual.weight - expected.weight) > 0.001) {
        context.addIssue({ code: 'custom', path: ['scorecard', 'dimensions', index], message: `评分卡必须对齐 ${expected.id}` });
      }
    });
  });
}

export const feishuImportSchema = z.object({
  jobName: text.optional().default(''), positionId: text.min(1),
  candidates: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
});

export function normalizeImportedCandidate(raw, request) {
  return candidateInputSchema.parse({
    positionId: raw.positionId ?? raw.position_id ?? request.positionId,
    externalId: raw.externalId ?? raw.external_id ?? null,
    applicationId: raw.applicationId ?? raw.application_id ?? null,
    name: raw.name ?? raw.candidate_name,
    jobName: raw.jobName ?? raw.job_name ?? request.jobName,
    resumeText: raw.resumeText ?? raw.resume_text ?? raw.text,
    sourceUrl: raw.sourceUrl ?? raw.source_url ?? null,
    source: raw.source ?? 'feishu',
  });
}
