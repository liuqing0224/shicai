import { z } from 'zod';

const stringList = z.array(z.string());
const dimensionSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), weight: z.number().min(0).max(1),
  status: z.enum(['demonstrated', 'partial', 'gap', 'not_assessed']),
  score: z.number().min(1).max(4).nullable(), evidence: stringList, assessment: z.string().min(1),
}).superRefine((dimension, context) => {
  if (dimension.status === 'not_assessed' && dimension.score !== null) {
    context.addIssue({ code: 'custom', path: ['score'], message: '未评估维度的分数必须为 null' });
  }
  if (dimension.status !== 'not_assessed' && dimension.score === null) {
    context.addIssue({ code: 'custom', path: ['score'], message: '已评估维度必须有 1-4 分' });
  }
});

export const interviewEvaluationSchema = z.object({
  recommendation: z.enum(['pass', 'conditional_pass', 'reject']),
  summary: z.string().min(1), strengths: stringList, concerns: stringList, notAssessed: stringList,
  claimVerifications: z.array(z.object({
    claim: z.string().min(1),
    status: z.enum(['verified', 'partially_verified', 'insufficient_evidence', 'not_assessed', 'contradicted']),
    evidence: stringList, assessment: z.string().min(1),
  })),
  criticalGaps: stringList,
  assessedCoverageWeight: z.number().min(0).max(1),
  weightedScore: z.number().min(1).max(4).nullable(),
  dimensions: z.array(dimensionSchema).min(1),
});

export const interviewEvaluationRequestSchema = z.object({
  transcript: z.string().trim().min(20).max(200_000), force: z.boolean().optional().default(false),
});

export function normalizeInterviewEvaluation(value, jobProfile) {
  const evaluation = interviewEvaluationSchema.parse(value);
  if (evaluation.dimensions.length !== jobProfile.dimensions.length) throw new Error('面试评价维度数量与岗位画像不一致');
  jobProfile.dimensions.forEach((expected, index) => {
    const actual = evaluation.dimensions[index];
    if (actual.id !== expected.id || actual.name !== expected.name || Math.abs(actual.weight - expected.weight) > 0.001) {
      throw new Error(`面试评价维度必须与岗位画像 ${expected.id} 对齐`);
    }
  });
  const assessed = evaluation.dimensions.filter((dimension) => dimension.status !== 'not_assessed');
  const assessedCoverageWeight = Math.round(assessed.reduce((sum, dimension) => sum + dimension.weight, 0) * 10_000) / 10_000;
  const weightedScore = assessedCoverageWeight === 0 ? null : Math.round(
    assessed.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / assessedCoverageWeight * 100,
  ) / 100;
  const notAssessed = evaluation.dimensions.filter((dimension) => dimension.status === 'not_assessed').map((dimension) => dimension.name);
  return interviewEvaluationSchema.parse({ ...evaluation, assessedCoverageWeight, weightedScore, notAssessed });
}
