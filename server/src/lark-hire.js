import { spawn } from 'node:child_process';

function safeText(value, fallback = '飞书接口调用失败') {
  const text = String(value ?? fallback)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [已隐藏]')
    .replace(/\b\d{8,}\b/g, '[标识已隐藏]');
  return text.slice(0, 500);
}

function safeConsoleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export class LarkHireError extends Error {
  constructor(details) {
    super(details.message);
    this.name = 'LarkHireError';
    this.safe = details;
  }
}

function envelopeError(envelope) {
  const error = envelope?.error ?? {};
  return new LarkHireError({
    type: String(error.subtype ?? error.type ?? 'lark_api_error').slice(0, 80),
    message: safeText(error.message ?? error.hint),
    missingScopes: Array.isArray(error.missing_scopes) ? error.missing_scopes.map(String).slice(0, 20) : [],
    consoleUrl: safeConsoleUrl(error.console_url ?? error.consoleUrl),
  });
}

function validId(value, label) {
  const id = String(value ?? '');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new LarkHireError({ type: 'missing_identifier', message: `缺少有效的${label}`, missingScopes: [], consoleUrl: null });
  return id;
}

function dataOf(envelope) {
  const outer = envelope?.data;
  return outer?.data ?? outer;
}

export function parseCliEnvelope(stdout, stderr) {
  for (const source of [stdout, stderr]) {
    if (!String(source ?? '').trim()) continue;
    try { return JSON.parse(source); } catch { /* Try the other stream. */ }
  }
  return null;
}

function applicationOf(payload) {
  return payload?.application ?? payload?.application_detail ?? payload;
}

function terminationType(application) {
  return application?.termination_type ?? application?.basic_info?.termination_type ?? application?.termination?.termination_type ?? null;
}

function isTerminated(application) {
  const status = String(application?.status ?? application?.application_status ?? '').toLowerCase();
  return application?.is_terminated === true || application?.terminated_at != null || Number(application?.active_status ?? application?.basic_info?.active_status) === 2
    || Number(terminationType(application)) > 0 || status.includes('terminat');
}

export class LarkHireClient {
  constructor({ bin = 'lark-cli', timeoutMs = 60_000 } = {}) {
    this.bin = bin;
    this.timeoutMs = timeoutMs;
  }

  call(method, apiPath, body, params) {
    const args = ['api', method, apiPath, '--as', 'bot', '--format', 'json'];
    if (params !== undefined) args.push('--params', JSON.stringify(params));
    if (body !== undefined) args.push('--data', JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
      });
      let stdout = ''; let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), this.timeoutMs);
      child.stdout.on('data', (chunk) => { if (stdout.length < 2_000_000) stdout += chunk; });
      child.stderr.on('data', (chunk) => { if (stderr.length < 20_000) stderr += chunk; });
      child.once('error', () => { clearTimeout(timer); reject(new LarkHireError({ type: 'cli_unavailable', message: '无法启动飞书 CLI', missingScopes: [], consoleUrl: null })); });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        const envelope = parseCliEnvelope(stdout, stderr);
        if (!envelope) {
          reject(new LarkHireError({ type: signal ? 'timeout' : 'invalid_cli_response', message: signal ? '飞书同步超时' : safeText(stderr, '飞书 CLI 未返回 JSON'), missingScopes: [], consoleUrl: null })); return;
        }
        if (code !== 0 || envelope?.ok !== true) { reject(envelopeError(envelope)); return; }
        resolve(dataOf(envelope));
      });
    });
  }

  async getApplication(applicationId) {
    return applicationOf(await this.call('GET', `/open-apis/hire/v1/applications/${validId(applicationId, '申请 ID')}`));
  }

  async pass(candidate, { remoteTargetId, onTargetResolved }) {
    const applicationId = validId(candidate.applicationId, '申请 ID');
    const application = await this.getApplication(applicationId);
    if (isTerminated(application)) throw new LarkHireError({ type: 'application_terminated', message: '该候选申请已终止，无法转移阶段', missingScopes: [], consoleUrl: null });
    const jobId = validId(application?.job_id ?? application?.basic_info?.job_id ?? application?.job?.id, '飞书职位 ID');
    const jobDetail = await this.call('GET', `/open-apis/hire/v1/jobs/${jobId}/get_detail`);
    const processId = validId(jobDetail?.job_detail?.basic_info?.process_id ?? jobDetail?.job?.process_id ?? jobDetail?.job_detail?.process_id ?? jobDetail?.process_id, '流程 ID');
    const processPayload = await this.call('GET', '/open-apis/hire/v1/job_processes', undefined, { page_size: 100 });
    const processes = processPayload?.items ?? processPayload?.job_processes ?? [];
    const process = processes.find((item) => String(item?.id ?? item?.process_id) === processId);
    if (!process) throw new LarkHireError({ type: 'process_not_found', message: '未在官方职位流程列表中找到当前流程', missingScopes: [], consoleUrl: null });
    const stages = (process.stage_list ?? []).filter((stage) => stage?.id ?? stage?.stage_id);
    const currentId = validId(application?.current_stage_id ?? application?.stage_id ?? application?.basic_info?.current_stage_id
      ?? application?.basic_info?.stage_id ?? application?.stage?.id, '当前阶段 ID');
    const currentIndex = stages.findIndex((stage) => String(stage.id ?? stage.stage_id) === currentId);
    if (currentIndex < 0) throw new LarkHireError({ type: 'current_stage_not_found', message: '当前阶段不在职位官方流程中', missingScopes: [], consoleUrl: null });
    let targetId = remoteTargetId;
    if (!targetId) {
      const next = stages.slice(currentIndex + 1).find((stage) => stage?.id ?? stage?.stage_id);
      if (!next) throw new LarkHireError({ type: 'no_next_stage', message: '当前已是流程最后阶段，无可转移的后续阶段', missingScopes: [], consoleUrl: null });
      targetId = validId(next.id ?? next.stage_id, '目标阶段 ID');
      await onTargetResolved(targetId);
    }
    const targetIndex = stages.findIndex((stage) => String(stage.id ?? stage.stage_id) === targetId);
    if (targetIndex < 0) throw new LarkHireError({ type: 'target_stage_not_found', message: '已保存的目标阶段不在当前职位流程中', missingScopes: [], consoleUrl: null });
    if (currentIndex >= targetIndex) return { idempotent: true };
    await this.call('POST', `/open-apis/hire/v1/applications/${applicationId}/transfer_stage`, { stage_id: targetId });
    return { idempotent: false };
  }

  async reject(candidate) {
    const applicationId = validId(candidate.applicationId, '申请 ID');
    const application = await this.getApplication(applicationId);
    if (isTerminated(application)) {
      if (Number(terminationType(application)) === 1) return { idempotent: true };
      throw new LarkHireError({ type: 'application_terminated', message: '该候选申请已以其他类型终止', missingScopes: [], consoleUrl: null });
    }
    await this.call('POST', `/open-apis/hire/v1/applications/${applicationId}/terminate`, { termination_type: 1, termination_reason_note: '简历评估未通过' });
    return { idempotent: false };
  }
}
