# 飞书简历自动评估运行说明

## 工作方式

采集器启动一个可见的 Chromium 窗口，并把登录会话保存在本项目的 `.data/feishu-profile`。它只监听飞书招聘页面自然发出的 `list_v2` 响应，并通过滚动或页面的下一页控件触发后续分页，再调用默认简历和简历正文读取接口。候选人按职位名称完全相等匹配后，分批提交到当前服务的 `/api/import/feishu`。

采集器不会点击通过、淘汰、转移阶段等操作，也不会向飞书写入评价。

候选人导入后，服务端依次执行简历结构化、岗位匹配评估、证据复核和面试设计。面试设计以当前版本岗位画像为准，生成 60 分钟面试策略、8 个必问、备选问题、触发式追问、案例题和行为锚点评分卡。已有评分也可通过 `POST /api/jobs/:id/interviews` 单独批量生成面试指南，不会重跑评分或覆盖人工状态。

## 安装

需要 Node.js 20 或更高版本：

```bash
cd collector
npm install
npx playwright install chromium
```

## 首次采集

先启动当前项目的服务，然后运行：

```bash
cd collector
npm run collect -- \
  --tenant-url https://your-tenant.feishu.cn \
  --job-name "职位名称（必须完全一致）" \
  --position-id "当前系统职位 ID"
```

`--tenant-url` 与 `--tenant` 等价，也可用 `FEISHU_HIRE_URL` 设置租户地址。浏览器打开后完成登录并进入候选人评估列表；看到 `list_v2` 请求后采集自动继续。采集器通过页面滚动或安全的“下一页”控件让页面自然加载后续列表，不自行重放列表请求。租户地址必须由运行者提供，项目内不保存公司域名。

建议首次用少量候选人验证：

```bash
npm run collect -- \
  --tenant-url https://your-tenant.feishu.cn \
  --job-name "职位名称" \
  --position-id "职位 ID" \
  --limit 5 \
  --dry-run
```

`--dry-run` 不调用本地导入接口。去掉该参数后才会提交到 `/api/import/feishu`。使用 `--help` 查看全部参数。

## 输出与断点续传

- `collector/output/candidates/<talent_id>.json`：单个候选人缓存，再次运行时复用。
- `collector/output/imported.json`：已经成功提交的外部候选人 ID；中断后只提交未完成部分。
- `collector/output/run-result.json`：本次结果，包括匹配数、缓存命中、无简历数和导入统计。
- 终端最后输出同样的结果 JSON，便于定时任务或其他程序读取。

服务端仍应以 `source + externalId` 建唯一约束。客户端检查点用于减少重复请求，不能替代服务端幂等。

## 常见问题

- 等待超时：在可见浏览器中确认已经登录，并进入候选人评估列表后刷新页面。
- 精确职位无匹配：确认飞书职位名称与 `--job-name` 包括空格和标点在内完全一致。
- 登录失效：关闭采集器，在同一资料目录重新运行并登录；不要删除资料目录来规避账号安全验证。
- 导入失败：先查看本地服务是否启动及 `--import-url` 是否正确。导入检查点只在整批返回成功后更新，可直接重跑。
- 某候选人无简历：记录仍会导入并带 `hasResume: false`，后续评估应标记证据不足，不应推断候选人不合格。

## 自动运行建议

定时运行前先用同一 `--profile-dir` 人工完成登录。自动化任务应设置合理的超时和 `--limit`，并保存 `run-result.json`；不要把浏览器资料目录或候选人缓存提交到版本库。

## 人工决策同步

在飞书开放平台为当前应用启用 Bot 能力，申请并发布以下权限：

- `hire:application`：读取投递、转移阶段、终止投递。
- `hire:job.composite_info:readonly`：读取职位详情与招聘流程 ID。
- `hire:job_process:readonly`：读取招聘流程及官方阶段列表。

权限开通后需发布应用版本，并确保应用的飞书招聘数据范围覆盖目标职位。`--as bot` 缺权限时不要执行用户授权登录；使用 `syncError.consoleUrl` 前往开发者后台，并核对 `missingScopes`。

只有人工状态 `passed` 和 `rejected` 会入队。`passed` 先读取投递、职位详情和招聘流程，只使用官方 `stage_list` 中当前阶段之后的第一个阶段，不猜测 `stage_id`。`rejected` 以 `termination_type: 1` 和原因“简历评估未通过”终止投递。AI 建议和其他本地状态不发写请求。

手动重试单人：

```bash
curl -X POST http://127.0.0.1:8897/api/candidates/<candidate-id>/sync
```

按职位批量重试当前为通过/淘汰的候选人：

```bash
curl -X POST http://127.0.0.1:8897/api/jobs/<job-id>/sync-decisions
```

返回的 `queued` 是本次已提交数，`skipped` 是已同步同一目标或已在队列的数量。候选人详情中的 `syncStatus / syncTarget / syncError / syncAt` 表示最终结果。只在需要忽略本地已同步标记时传 `{ "force": true }`。飞书写入失败不会回滚本地人工决策。

## 真实端到端验收

真实 Agent 验收应使用临时数据库和虚拟 JD、简历、面试记录，并注入拒绝执行的飞书写入客户端。浏览器可以加载当前工作台，但测试请求必须定向到隔离 API；结束后删除临时数据，不在正式候选人库留下记录。

`AGENT_TIMEOUT_MINUTES` 使用分钟；通过 `createApp({ timeoutMs })` 注入时使用毫秒。面试评价 Agent 输出的覆盖率和加权分不作为可信数据，服务端会根据与岗位画像对齐的逐维状态和分数统一重算。
