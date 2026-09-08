import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COLLECTOR_DIR = path.resolve(HERE, '..');
const PROJECT_DIR = path.resolve(COLLECTOR_DIR, '..');
const DEFAULT_IMPORT_URL = 'http://127.0.0.1:8897/api/import/feishu';

export function usage() {
  return `飞书招聘只读简历采集器

用法:
  npm run collect -- --tenant-url <飞书招聘地址> --job-name <精确职位名> --position-id <本地职位ID>

必填:
  --tenant-url <url>      飞书招聘租户地址，例如 https://your-tenant.feishu.cn
  --tenant <url>          --tenant-url 的兼容别名
                          也可设置 FEISHU_HIRE_URL
  --job-name <name>       与飞书列表完全一致的职位名称
  --position-id <id>      当前系统中的职位 ID；--dry-run 时可省略

可选:
  --import-url <url>      导入接口，默认 ${DEFAULT_IMPORT_URL}
  --api-base <url>        当前服务根地址，自动追加 /api/import/feishu
  --list-url <url>        “简历评估 > 待评估”的完整页面地址
  --profile-dir <dir>     浏览器资料目录，默认项目 .data/feishu-profile
  --out-dir <dir>         缓存和结果目录，默认 collector/output
  --limit <n>             本次最多处理人数，默认不限制
  --timeout-ms <n>        等待 list_v2 响应的毫秒数，默认 180000
  --batch-size <n>        导入批大小，1-100，默认 50
  --executable-path <p>   使用指定 Chromium/Chrome 可执行文件
  --dry-run               只采集和写入本地，不调用导入接口
  --import                明确启用导入（默认行为，兼容自动调度命令）
  --help                  显示帮助

浏览器会保持可见。首次运行请在打开的窗口中登录飞书招聘并进入候选人评估列表。`;
}

export function parseArgs(argv) {
  const args = {
    tenantUrl: process.env.FEISHU_HIRE_URL || '',
    listUrl: process.env.FEISHU_EVALUATION_URL || '',
    importUrl: process.env.IMPORT_URL || DEFAULT_IMPORT_URL,
    profileDir: path.join(PROJECT_DIR, '.data', 'feishu-profile'),
    outDir: path.join(COLLECTOR_DIR, 'output'),
    timeoutMs: 180_000,
    limit: Number.POSITIVE_INFINITY,
    batchSize: 50,
    dryRun: false,
  };
  const valueArgs = new Map([
    ['--tenant-url', 'tenantUrl'], ['--tenant', 'tenantUrl'], ['--job-name', 'jobName'],
    ['--position-id', 'positionId'], ['--import-url', 'importUrl'],
    ['--profile-dir', 'profileDir'], ['--out-dir', 'outDir'],
    ['--limit', 'limit'], ['--timeout-ms', 'timeoutMs'],
    ['--batch-size', 'batchSize'], ['--executable-path', 'executablePath'],
    ['--api-base', 'apiBase'], ['--list-url', 'listUrl'],
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help') {
      console.log(usage());
      process.exit(0);
    }
    if (token === '--dry-run' || token === '--import') {
      args.dryRun = token === '--dry-run';
      continue;
    }
    const key = valueArgs.get(token);
    if (!key) throw new Error(`未知参数: ${token}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${token} 缺少值`);
    args[key] = ['limit', 'timeoutMs', 'batchSize'].includes(key) ? Number(value) : value;
  }
  validateArgs(args);
  args.tenantUrl = normalizeTenantUrl(args.tenantUrl);
  args.listUrl = normalizeListUrl(args.listUrl, args.tenantUrl);
  if (args.apiBase) args.importUrl = new URL('/api/import/feishu', args.apiBase).href;
  args.profileDir = path.resolve(args.profileDir);
  args.outDir = path.resolve(args.outDir);
  return args;
}

function validateArgs(args) {
  if (!args.tenantUrl) throw new Error('缺少 --tenant-url 或 FEISHU_HIRE_URL');
  if (!args.jobName) throw new Error('缺少 --job-name');
  if (!args.dryRun && !args.positionId) throw new Error('导入模式缺少 --position-id');
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 1_000) throw new Error('--timeout-ms 必须是至少 1000 的整数');
  if (!(args.limit === Number.POSITIVE_INFINITY || (Number.isInteger(args.limit) && args.limit > 0))) throw new Error('--limit 必须是正整数');
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 100) throw new Error('--batch-size 必须是 1 到 100 的整数');
}

function normalizeTenantUrl(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:') throw new Error('--tenant-url 必须使用 https');
  return url.origin;
}

function normalizeListUrl(input, tenantUrl) {
  const fallback = new URL('/hire/application-biz/evaluation/list?activeStatus=1&newFilters=%7B%7D&pageTotalLimit=0&pagination=%7B%22pageSize%22%3A20%2C%22current%22%3A1%7D', tenantUrl);
  const url = input ? new URL(input) : fallback;
  if (url.origin !== tenantUrl || url.pathname !== '/hire/application-biz/evaluation/list') {
    throw new Error('--list-url 必须是当前租户的飞书招聘简历评估列表');
  }
  return url.href;
}
