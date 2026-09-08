import fs from 'node:fs';
import path from 'node:path';

export const publicTarget = (status) => ({ shortlisted: 'passed' }[status] ?? status);

export function argValue(args, flag, fallback = '') {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1];
}

export function requireChoice(value, choices, label) {
  if (!choices.includes(value)) throw new Error(`${label} must be one of: ${choices.join(', ')}`);
  return value;
}

export function validateSourceUrl(sourceUrl, applicationId) {
  const url = new URL(sourceUrl);
  const allowed = /(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname);
  if (url.protocol !== 'https:' || !allowed || !/^\/hire\/talent\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    throw new Error('Candidate source URL is not an allowed Feishu talent URL');
  }
  if (url.searchParams.get('application_id') !== applicationId) throw new Error('source_url application_id does not match the database');
  return url.href;
}

export function appendJournal(filename, entry) {
  const target = path.resolve(filename);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}
