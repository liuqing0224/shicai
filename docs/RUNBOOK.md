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
