import path from 'node:path';

import { readJson, writeJsonAtomic } from './json-files.mjs';
import { resumeMarkdown } from './resume-markdown.mjs';

const LIST_PATH = '/atsx/api/evaluation/list_v2/';
const DEFAULT_RESUME_PATH = '/atsx/api/application/get_default_resume/';
const RESUME_TEXT_PATH = '/atsx/api/application/get_attachment_resume_text_ext/';

function listItems(payload) {
  return payload?.data?.evaluation_list ?? payload?.data?.items ?? payload?.data?.list ?? [];
}

function listCount(payload) {
  return Number(payload?.data?.count ?? payload?.data?.total ?? listItems(payload).length);
}

function assertApiSuccess(payload, endpoint) {
  const failed = payload == null || payload.success === false || (payload.code != null && Number(payload.code) !== 0);
  if (failed) throw new Error(`${endpoint} 返回失败，请确认登录状态和访问权限`);
}

export function jobTitle(item) {
  return item?.job?.title ?? item?.job?.name ?? item?.job_name ?? item?.position?.name ?? '';
}

function identity(item) {
  const talentId = String(item?.talent_id ?? item?.talent?.id ?? '');
  const applicationId = String(item?.application_id ?? item?.id ?? '');
  if (!talentId || !applicationId) return null;
  return { talentId, applicationId };
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export async function captureInitialList(context, page, args) {
  let settle;
  const state = { items: new Map(), total: null, responseCount: 0 };
  const captured = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待 list_v2 超时；请在浏览器中登录并打开候选人评估列表')), args.timeoutMs);
    const handler = async (response) => {
      try {
        const url = new URL(response.url());
        if (!url.pathname.endsWith(LIST_PATH) || response.request().method() !== 'POST') return;
        const payload = await response.json();
        assertApiSuccess(payload, 'list_v2');
        for (const item of listItems(payload)) {
          const ids = identity(item);
          if (ids) state.items.set(ids.applicationId, item);
        }
        state.total = Math.max(state.total ?? 0, listCount(payload));
        state.responseCount += 1;
        clearTimeout(timer);
        resolve({ state, handler });
      } catch (error) {
        clearTimeout(timer);
        context.off('response', handler);
        reject(error);
      }
    };
    context.on('response', handler);
    settle = () => clearTimeout(timer);
  });
  try {
    await page.goto(args.listUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    return await captured;
  } catch (error) {
    context.removeAllListeners('response');
    throw error;
  } finally { settle?.(); }
}

export async function collectList(context, page, capture) {
  const { state, handler } = capture;
  let unchanged = 0;
  try {
    for (let attempt = 0; attempt < 200 && unchanged < 5; attempt += 1) {
      if (state.total != null && state.items.size >= state.total) break;
      const before = `${state.items.size}:${state.responseCount}`;
      await page.bringToFront();
      await page.keyboard.press('End').catch(() => {});
      await page.mouse.wheel(0, 1600).catch(() => {});
      const nextSelectors = [
        'button[aria-label*="下一页"]:not([disabled])',
        'button[aria-label*="Next"]:not([disabled])',
        '.semi-page-next:not(.semi-page-disabled)',
        '[data-testid*="next"]:not([disabled])',
      ];
      for (const selector of nextSelectors) {
        const next = page.locator(selector).first();
        if (await next.isVisible().catch(() => false)) {
          await next.click().catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(750);
      const after = `${state.items.size}:${state.responseCount}`;
      unchanged = after === before ? unchanged + 1 : 0;
    }
  } finally {
    context.off('response', handler);
  }
  return [...state.items.values()];
}

async function getJson(context, url, endpoint) {
  const response = await context.request.get(url, { failOnStatusCode: false, headers: { accept: 'application/json' } });
  const ok = typeof response.ok === 'function' ? response.ok() : response.ok;
  const status = typeof response.status === 'function' ? response.status() : response.status;
  if (!ok) throw new Error(`${endpoint} HTTP ${status}`);
  const payload = await response.json();
  assertApiSuccess(payload, endpoint);
  return payload;
}

export async function collectCandidate(context, args, item) {
  const ids = identity(item);
  const cacheFile = path.join(args.outDir, 'candidates', `${safeId(ids.talentId)}.json`);
  const cached = readJson(cacheFile, null);
  if (cached?.externalId === ids.talentId && cached?.jobName === args.jobName) return { candidate: cached, cached: true };
  const defaultUrl = new URL(DEFAULT_RESUME_PATH, args.tenantUrl);
  defaultUrl.searchParams.set('talent_id', ids.talentId);
  defaultUrl.searchParams.set('application_id', ids.applicationId);
  const defaultResume = await getJson(context, defaultUrl.href, 'get_default_resume');
  const attachment = defaultResume?.data?.default_attachment;
  let parsed = null;
  if (attachment?.attachment_resume_id) {
    const textUrl = new URL(RESUME_TEXT_PATH, args.tenantUrl);
    textUrl.searchParams.set('talent_id', ids.talentId);
    textUrl.searchParams.set('attachment_resume_id', String(attachment.attachment_resume_id));
    const textPayload = await getJson(context, textUrl.href, 'get_attachment_resume_text_ext');
    parsed = parseMaybeJson(textPayload?.data?.parsed_content);
  }
  const candidate = {
    externalId: ids.talentId,
    applicationId: ids.applicationId,
    name: item?.talent?.name ?? parsed?.name ?? '未知候选人',
    jobName: args.jobName,
    resumeText: resumeMarkdown(parsed),
    sourceUrl: `${args.tenantUrl}/hire/talent/${encodeURIComponent(ids.talentId)}?application_id=${encodeURIComponent(ids.applicationId)}`,
    source: 'feishu',
    hasResume: Boolean(parsed),
    collectedAt: new Date().toISOString(),
  };
  writeJsonAtomic(cacheFile, candidate);
  return { candidate, cached: false };
}
