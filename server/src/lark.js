import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function isLarkDocumentUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' && /\.(feishu\.cn|larksuite\.com)$/i.test(url.hostname)
      && /^\/(docx|wiki)\//.test(url.pathname);
  } catch {
    return false;
  }
}

export async function fetchLarkDocument(url, { bin = process.env.LARK_CLI_BIN ?? 'lark-cli', timeoutMs = 60_000 } = {}) {
  if (!isLarkDocumentUrl(url)) throw new Error('不是受支持的飞书文档链接');
  const { stdout } = await execFileAsync(bin, [
    'docs', '+fetch', '--doc', url, '--doc-format', 'markdown', '--detail', 'simple',
    '--as', 'user', '--format', 'json',
  ], {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
    },
  });
  const envelope = JSON.parse(stdout);
  const content = envelope?.data?.document?.content;
  if (envelope?.ok !== true || typeof content !== 'string' || !content.trim()) {
    throw new Error('飞书文档没有返回可用正文');
  }
  return {
    content: content.trim(),
    documentId: envelope.data.document.document_id ?? null,
    revisionId: envelope.data.document.revision_id ?? null,
  };
}
