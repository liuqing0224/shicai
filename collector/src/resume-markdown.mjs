function stringifyValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value.name ?? value.description ?? value.title ?? '';
}

function date(value) {
  return String(value ?? '').slice(0, 10);
}

export function resumeMarkdown(content) {
  if (!content || typeof content !== 'object') return '';
  const sections = [`# ${content.name || '未命名候选人'}`];
  const basic = [
    ['现居地', content.current_location],
    ['工作年限', content.experience_years && `${content.experience_years} 年`],
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  if (basic.length) sections.push(`## 基本信息\n${basic.join('\n')}`);

  const collections = [
    ['教育经历', content.educations, (item) => `- ${date(item.start_date)} 至 ${date(item.end_date)} | ${item.school ?? ''} | ${item.major ?? ''} | ${item.degree ?? ''}`],
    ['工作经历', content.careers, (item) => `- ${date(item.start_date)} 至 ${date(item.end_date)} | ${item.company ?? ''} | ${item.title ?? ''}${item.jd ? `\n  ${String(item.jd).replaceAll('\n', '\n  ')}` : ''}`],
    ['实习经历', content.intern_ships, (item) => `- ${date(item.start_date)} 至 ${date(item.end_date)} | ${item.company ?? ''} | ${item.title ?? ''}${item.jd ? `\n  ${String(item.jd).replaceAll('\n', '\n  ')}` : ''}`],
    ['项目经历', content.project_list, (item) => `- ${item.name ?? ''} | ${item.role ?? ''} | ${date(item.start_date)} 至 ${date(item.end_date)}${item.description ? `\n  ${String(item.description).replaceAll('\n', '\n  ')}` : ''}`],
  ];
  for (const [title, values, format] of collections) {
    const lines = Array.isArray(values) ? values.map(format).filter(Boolean) : [];
    if (lines.length) sections.push(`## ${title}\n${lines.join('\n')}`);
  }
  const extras = [
    ['自我评价', content.self_evaluation], ['技能', content.skills],
    ['证书', content.certificate_list], ['奖项', content.award_list],
    ['语言', content.language_list],
  ];
  const extraLines = extras.flatMap(([label, value]) => {
    const values = Array.isArray(value) ? value.map(stringifyValue).filter(Boolean) : [stringifyValue(value)].filter(Boolean);
    return values.length ? [`${label}: ${values.join('；')}`] : [];
  });
  if (extraLines.length) sections.push(`## 其他\n${extraLines.join('\n')}`);
  if (content.content) sections.push(`## 简历原文\n${content.content}`);
  return sections.join('\n\n').trim();
}
