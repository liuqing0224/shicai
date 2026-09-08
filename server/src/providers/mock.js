function pickEvidence(text) {
  return text.split(/[\n。；;]/).map((line) => line.trim()).filter(Boolean).slice(0, 5);
}

function keywords(text) {
  const found = text.match(/[A-Za-z][A-Za-z0-9+#.-]{1,20}|[\u4e00-\u9fa5]{2,8}/g) ?? [];
  return [...new Set(found)].slice(0, 12);
}

export function analyzeJobMock({ job }) {
    const tokens = keywords(job.jd);
    const hasExperience = /(\d+)\s*年|经验/.test(job.jd);
    const evidence = pickEvidence(job.jd);
    const makeDimension = (id, name, description, weight, requirements, dimensionKeywords, mustHave) => ({
      id, name, description, weight, requirements,
      criteria: requirements.map((requirement, index) => ({
        id: `${id}_${index + 1}`, text: requirement, priority: mustHave ? 'must' : 'preferred',
        proficiency: null, minYears: id === 'experience' ? Number(job.jd.match(/(\d+)\s*年/)?.[1] ?? 0) || null : null,
        evidenceQuote: evidence.find((line) => line.includes(requirement)) ?? requirement,
      })),
      keywords: dimensionKeywords, mustHave,
    });
    return {
      summary: `${job.name}岗位画像，根据 JD 拆解为五个可循证评估维度。`,
      seniority: /(leader|主管|总监|负责人)/i.test(job.jd) ? '管理岗' : /(高级|资深|senior)/i.test(job.jd) ? '高级' : '未明确',
      responsibilities: pickEvidence(job.jd).slice(0, 4),
      mustHaves: tokens.slice(0, 5),
      niceToHaves: tokens.slice(5, 8),
      dimensions: [
        makeDimension('hard_skills', '硬技能', '评估 JD 明确要求的工具与专业能力', 0.27, tokens.slice(0, 5).length ? tokens.slice(0, 5) : ['JD 所列核心技能'], tokens.slice(0, 8), true),
        makeDimension('experience', '相关经验', '评估工作年限及相关项目深度', 0.19, [hasExperience ? 'JD 所要求的相关年限或经验' : '可验证的相关项目经验'], ['经验', '项目', '成果'], hasExperience),
        makeDimension('responsibilities', '职责契合', '评估过往职责与岗位交付目标的契合度', 0.18, evidence.slice(0, 3).length ? evidence.slice(0, 3) : ['岗位主要职责'], tokens, false),
        makeDimension('gate', '硬性门槛', '核对 JD 明确标注的必须条件', 0.19, tokens.slice(0, 2).length ? tokens.slice(0, 2) : ['JD 明确必须项'], tokens.slice(0, 5), true),
        makeDimension('tech_direction', '技术方向', '评估候选人技术积累与岗位发展方向的一致性', 0.17, tokens.slice(2, 5).length ? tokens.slice(2, 5) : ['岗位技术方向'], tokens.slice(2, 10), false),
      ],
    };
}

export function designInterviewMock({ candidate, jobProfile, report }) {
  const resumeEvidence = candidate.parsedProfile?.highlights ?? [];
  const questions = Array.from({ length: 10 }, (_, index) => {
    const dimension = jobProfile.dimensions[index % jobProfile.dimensions.length];
    const assessment = report.dimensions.find((item) => item.id === dimension.id);
    const verification = index >= jobProfile.dimensions.length;
    return {
      id: `q${index + 1}_${dimension.id}`, dimensionId: dimension.id, dimensionName: dimension.name,
      priority: dimension.mustHave || assessment?.risks?.length ? 'high' : index < 5 ? 'medium' : 'low',
      required: index < 8, expectedMinutes: index < 8 ? 4 : 3,
      question: verification
        ? `请选择一个与「${dimension.name}」相关的代表项目，说明你个人的决策、取舍与结果。`
        : `结合实际经历，如何证明你能够满足「${dimension.requirements[0]}」？`,
      purpose: `核验${dimension.name}的实际深度及个人贡献`,
      profileRequirements: dimension.requirements,
      resumeEvidence: assessment?.evidence?.length ? assessment.evidence : resumeEvidence.slice(0, 2),
      strongSignals: ['说明个人决策、具体机制和可验证结果', '解释备选方案与取舍'],
      warningSignals: ['只有模糊的集体表述', '无法说明结果基线或证据来源'],
      followUps: [
        { trigger: '候选人只描述团队结果', prompt: '你个人具体决定和交付了什么？' },
        { trigger: '候选人提到指标提升', prompt: '请说明指标口径、基线、数据来源和生产验证周期。' },
      ],
    };
  });
  const anchors = {
    one: '无相关证据或暴露重大能力缺口', two: '有部分证据但深度不足',
    three: '有清晰且符合岗位层级的证据与判断', four: '多个高复杂度场景中有可迁移的超预期表现',
  };
  return {
    durationMinutes: 60,
    strategy: {
      summary: '先核验高权重且证据不足的要求，再用案例题交叉验证。',
      priorities: report.risks.length ? report.risks : jobProfile.mustHaves,
      timeAllocation: [{ section: '背景', minutes: 5 }, { section: '深挖', minutes: 30 }, { section: '案例', minutes: 15 }, { section: '提问', minutes: 10 }],
    },
    questions,
    caseExercise: {
      title: '岗位核心职责实战案例',
      prompt: '请设计一个满足岗位核心职责的交付方案，说明假设、优先级、风险和验证方式。',
      durationMinutes: 15, deliverables: ['问题拆解', '方案与取舍', '验证指标'],
      evaluationCriteria: ['问题定义', '优先级判断', '机制深度', '风险意识'],
    },
    scorecard: {
      scale: '1-4', evidenceRequired: true,
      dimensions: jobProfile.dimensions.map((dimension) => ({ dimensionId: dimension.id, dimensionName: dimension.name, weight: dimension.weight, anchors })),
      recommendationRule: '先记录证据再评分；未覆盖维度标记 not assessed，综合建议与单项分数分开。',
    },
  };
}

export function evaluateInterviewMock({ jobProfile, report, transcript }) {
  const lines = pickEvidence(transcript);
  const dimensions = jobProfile.dimensions.map((dimension) => {
    const evidence = lines.filter((line) => dimension.keywords.some((keyword) => line.toLowerCase().includes(keyword.toLowerCase())));
    const status = evidence.length ? (evidence.length >= 2 ? 'demonstrated' : 'partial') : 'not_assessed';
    return {
      id: dimension.id, name: dimension.name, weight: dimension.weight, status,
      score: status === 'not_assessed' ? null : status === 'demonstrated' ? 3 : 2,
      evidence,
      assessment: status === 'not_assessed' ? '面试记录未覆盖该维度，不作负面判断。' : '面试记录提供了可核对的相关行为证据。',
    };
  });
  const claims = [...report.strengths, ...report.gaps].slice(0, 6);
  const claimVerifications = claims.map((claim) => {
    const evidence = lines.filter((line) => keywords(claim).some((keyword) => line.toLowerCase().includes(keyword.toLowerCase())));
    return {
      claim, status: evidence.length ? 'partially_verified' : 'not_assessed', evidence,
      assessment: evidence.length ? '对话中有部分支持证据，仍需结合细节核验。' : '面试未覆盖该简历主张。',
    };
  });
  const assessedCount = dimensions.filter((dimension) => dimension.status !== 'not_assessed').length;
  return {
    recommendation: assessedCount >= 4 ? 'pass' : 'conditional_pass',
    summary: '评价仅基于面试记录中可观察的行为证据，未覆盖项不计为缺点。',
    strengths: dimensions.filter((dimension) => dimension.score >= 3).map((dimension) => dimension.name),
    concerns: dimensions.filter((dimension) => dimension.status === 'gap').map((dimension) => dimension.name),
    notAssessed: dimensions.filter((dimension) => dimension.status === 'not_assessed').map((dimension) => dimension.name),
    claimVerifications, criticalGaps: [], assessedCoverageWeight: 0, weightedScore: null, dimensions,
  };
}

export class MockProvider {
  async analyzeJob(context) { return analyzeJobMock(context); }
  async designInterview(context) { return designInterviewMock(context); }
  async evaluateInterview(context) { return evaluateInterviewMock(context); }

  async parse({ candidate }) {
    const text = candidate.resumeText;
    return {
      name: candidate.name,
      skills: keywords(text),
      highlights: pickEvidence(text),
      yearsOfExperience: Number(text.match(/(\d+)\s*年/)?.[1] ?? 0),
      education: text.match(/(博士|硕士|本科|大专)/)?.[1] ?? '未识别',
    };
  }

  async evaluate({ candidate, job, parsedProfile, jobProfile }) {
    const resumeTokens = new Set(keywords(candidate.resumeText.toLowerCase()));
    const jobTokens = keywords(job.jd.toLowerCase());
    const matches = jobTokens.filter((token) => resumeTokens.has(token));
    const ratio = jobTokens.length ? matches.length / jobTokens.length : 0;
    const evidence = pickEvidence(candidate.resumeText);
    const dimensions = jobProfile.dimensions.map((dimension) => {
      const dimensionMatches = dimension.keywords.filter((token) => resumeTokens.has(token.toLowerCase()));
      const dimensionRatio = dimension.keywords.length ? dimensionMatches.length / dimension.keywords.length : ratio;
      const experienceBoost = dimension.id === 'experience' ? Math.min(parsedProfile.yearsOfExperience / 10, 0.3) : 0;
      const dimensionScore = Math.max(1, Math.min(10, Math.round((4 + dimensionRatio * 6 + experienceBoost) * 10) / 10));
      const requirementMatches = (dimension.criteria ?? []).map((criterion) => {
        const hits = evidence.filter((item) => dimension.keywords.some((token) => item.toLowerCase().includes(token.toLowerCase())));
        return { requirementId: criterion.id, status: hits.length ? (dimensionRatio >= 0.5 ? 'met' : 'partial') : 'unknown', evidence: hits, notes: hits.length ? '简历中有可核对证据' : '简历未提供足够证据，需人工确认' };
      });
      return {
        id: dimension.id, name: dimension.name, score: dimensionScore, weight: dimension.weight,
        requirements: dimension.requirements, evidence: evidence.filter((item) => dimensionMatches.some((token) => item.toLowerCase().includes(token.toLowerCase()))),
        gaps: dimension.requirements.filter((requirement) => !keywords(candidate.resumeText).some((token) => requirement.toLowerCase().includes(token.toLowerCase()))).slice(0, 3),
        risks: dimension.mustHave && dimensionMatches.length === 0 ? ['必须项缺少直接证据'] : [],
        requirementMatches,
      };
    });
    const score = Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) * 10);
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';
    return {
      score, grade, recommendation: score >= 85 ? 'strong_yes' : score >= 70 ? 'yes' : score >= 55 ? 'hold' : 'no',
      summary: `候选人与「${job.name}」的模拟匹配度为 ${score} 分，建议结合证据进行人工复核。`,
      dimensions,
      strengths: evidence.slice(0, 2),
      risks: [...new Set(dimensions.flatMap((dimension) => dimension.risks).concat(parsedProfile.yearsOfExperience ? [] : ['简历中未识别到明确的工作年限']))],
      gaps: [...new Set(dimensions.flatMap((dimension) => dimension.gaps))].slice(0, 6),
      interviewQuestions: matches.slice(0, 3).map((skill) => `请介绍你在 ${skill} 方面最有代表性的项目。`),
      evidence,
    };
  }

  async review({ report, candidate }) {
    return { ...report, review: { approved: true, notes: [`已核对 ${candidate.name} 的原始简历与评估证据。`] } };
  }
}
