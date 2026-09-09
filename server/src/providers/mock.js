function pickEvidence(text) {
  return text.split(/[\n。；;]/).map((line) => line.trim()).filter(Boolean).slice(0, 5);
}

function keywords(text) {
  const found = text.match(/[A-Za-z][A-Za-z0-9+#.-]{1,20}|[\u4e00-\u9fa5]{2,8}/g) ?? [];
  return [...new Set(found)].slice(0, 12);
}

export function analyzeJobMock({ job }) {
  const text = `${job.name} ${job.jd}`;
  const evidence = pickEvidence(job.jd);
  const tokens = keywords(job.jd);
  const families = {
    training: [
      ['ai_knowledge', 'AI 产品与技术理解', '理解岗位涉及的 AI 产品、原理与边界', /AI|大模型|Agent|RAG|技术/gi],
      ['course_design', '课程设计与授课', '把专业知识转化为课程并有效授课', /培训|课程|授课|讲师/gi],
      ['business_enablement', '业务场景赋能', '将培训内容用于销售或客户业务场景', /销售|客户|赋能|场景/gi],
      ['training_delivery', '培训项目交付', '规划、实施并复盘培训项目', /项目|交付|运营|复盘|效果/gi],
      ['stakeholder_influence', '沟通影响与协作', '推动跨团队共识与行动', /沟通|协作|推动|团队/gi],
    ],
    sales: [
      ['customer_development', '客户开发', '识别并触达目标客户', /客户|开发|拓展|线索/gi],
      ['opportunity_conversion', '商机转化', '推进商机并达成销售结果', /商机|销售|签约|转化/gi],
      ['industry_solution', '行业与方案理解', '理解行业并形成客户方案', /行业|方案|产品|需求/gi],
      ['target_delivery', '目标与经营结果', '管理目标、过程与经营结果', /目标|业绩|回款|结果/gi],
      ['team_collaboration', '团队协作与管理', '协同或带领团队完成目标', /团队|管理|协作|跨部门/gi],
    ],
    product: [
      ['user_insight', '用户与市场洞察', '识别用户、市场与业务问题', /用户|市场|调研|洞察/gi],
      ['product_planning', '产品规划', '制定产品方向与优先级', /规划|路线图|产品|战略/gi],
      ['requirements_design', '需求与方案设计', '拆解需求并形成可交付方案', /需求|原型|方案|设计/gi],
      ['delivery_collaboration', '协作推动与交付', '跨团队推动产品落地', /协作|研发|交付|上线/gi],
      ['data_business_judgment', '数据与商业判断', '用数据验证产品和商业结果', /数据|指标|商业|增长/gi],
    ],
    engineering: [
      ['core_engineering', '核心工程能力', '掌握 JD 所需的语言、框架与工程方法', /Node|Java|Python|Go|JavaScript|TypeScript|工程|开发/gi],
      ['system_design', '系统与接口设计', '设计可维护的系统、数据与接口', /架构|系统|API|接口|数据库|SQLite|分布式/gi],
      ['quality_reliability', '质量与可靠性', '保障测试、性能、安全与稳定性', /测试|质量|性能|安全|稳定|可靠/gi],
      ['project_delivery', '项目交付与问题解决', '在真实项目中完成交付并解决复杂问题', /项目|交付|经验|问题|成果/gi],
      ['business_collaboration', '业务理解与协作', '理解业务目标并有效协作', /业务|沟通|协作|产品|团队/gi],
    ],
  };
  const family = /培训|课程|授课|讲师/.test(text) ? families.training
    : /销售|商机|客户开发/.test(text) ? families.sales
      : /产品经理|用户需求|产品规划/.test(text) ? families.product : families.engineering;
  const scores = family.map(([, , , pattern], index) => 18 + (4 - index) + (text.match(pattern)?.length ?? 0) * 2);
  const scoreTotal = scores.reduce((sum, score) => sum + score, 0);
  const weights = scores.map((score) => Number((score / scoreTotal).toFixed(2)));
  weights[4] = Number((1 - weights.slice(0, 4).reduce((sum, weight) => sum + weight, 0)).toFixed(2));
  const dimensions = family.map(([id, name, description, pattern], index) => {
    const matchedEvidence = evidence.filter((line) => new RegExp(pattern.source, 'i').test(line));
    const requirements = matchedEvidence.length ? matchedEvidence : [evidence[index % Math.max(evidence.length, 1)] ?? `${job.name}岗位职责`];
    const dimensionKeywords = [...new Set([...keywords(requirements.join(' ')), ...tokens.slice(index, index + 3)])].slice(0, 10);
    const mustHave = index < 2 || matchedEvidence.length > 0;
    return {
      id, name, description, weight: weights[index], requirements,
      criteria: requirements.map((requirement, criterionIndex) => ({
        id: `${id}_criterion_${criterionIndex + 1}`, text: requirement, priority: mustHave ? 'must' : 'preferred',
        proficiency: null, minYears: Number(requirement.match(/(\d+)\s*年/)?.[1] ?? 0) || null,
        evidenceQuote: requirement,
      })),
      keywords: dimensionKeywords.length ? dimensionKeywords : [name], mustHave,
    };
  });
  return {
    summary: `${job.name}岗位画像，根据 JD 动态拆解为五个可循证评估维度。`,
    seniority: /(leader|主管|总监|负责人)/i.test(job.jd) ? '管理岗' : /(高级|资深|senior)/i.test(job.jd) ? '高级' : '未明确',
    responsibilities: evidence.slice(0, 4),
    mustHaves: dimensions.filter((dimension) => dimension.mustHave).flatMap((dimension) => dimension.requirements),
    niceToHaves: dimensions.filter((dimension) => !dimension.mustHave).flatMap((dimension) => dimension.requirements),
    dimensions,
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
