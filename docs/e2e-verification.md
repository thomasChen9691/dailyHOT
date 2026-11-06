# 端到端验证记录（2026-11-06 凌晨）

> **范围说明**：本次为已获授权的本机无人值守验证，覆盖环境配置、容器起站、模型调用与内容链路；操作与结果记录于本文件，凭证只落本机 `.env`。
> 本文记录的是**当时的实测状态**：compose project 名为 `aihot`、站点映射 3000、LLM 用自动路由模型。后续已调整为 project `dailyhot`、站点 3100 及固定模型；**当前入口与命令一律以 `docs/sop.md` 为准**。文中不记录本机内网 IP、宿主端口、token 名与 ID。

## 边界（自我约束）

- ✅ 允许：读项目 / 框架文档与规则；读本机 LLM 网关的容器配置与接口；生成 `.env`；`docker compose up -d --build`；跑 `smoke.ts`；往 `/api/ingest/items` 推样本数据；调用本地免费模型。
- ❌ 不做：不提交 `.env`（`.gitignore` 已忽略）；不把 API key / 密码明文写进任何文档或聊天；不开启对外通知（飞书 / IndexNow）；不接付费采集源（`SOCIALDATA` / `DAJIALA` / `JINA`）；不大量抓取外站；不 `git push`。
- 安全阀：按 `AGENTS.md`，开发时保持关闭。为验证模型链路可短时开 `MODEL_CALLS_ENABLED`，验证完关回；`COLLECT_ENABLED` 默认关闭，不做真实大批量采集。
- 所有凭证只落在仓库根目录 `.env`（已被 `.gitignore` 忽略），本文件只记录「已配置」，不记录值。

## 环境基线（00:33 盘点）

| 项 | 值 |
|---|---|
| 项目 | `dailyHOT`（AIHOT 引擎定制站「枫泽观潮」），9 个本地 commit 未 push |
| Node | `/usr/local/bin/node` v24.22.1；校验统一加 `PATH=/usr/local/bin:$PATH` |
| Docker 容器 | 测试 PostgreSQL（非默认端口）、本机 LLM 网关（仅绑定 loopback，healthy）、Milvus/MinIO/etcd/Mongo RAG stack |
| `.env` | 原本不存在；`.gitignore` 含 `.env` / `.env.*`（保留 `.env.example`） |
| compose | 当时 `name: aihot`（现 `dailyhot`）；服务 `db` / `setup`（migrate+seed）/ `api` / `worker` / `web`；web 当时映射 3000（现 3100） |
| 模型配置 | `site/models.ts` 的 `default` 用 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`，`DEFAULTS={}` 即所有步骤走 default |
| 必填变量 | `SITE_URL`、`ADMIN_PASSWORD`、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`、`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` |

## 执行计划

| # | 步骤 | 状态 |
|---|---|---|
| 1 | 盘点环境 / 建立本日志 | ✅ 完成 |
| 2 | 从本机 LLM 网关获取免费模型 key、确认可用模型名 | ✅ 完成（含 token 被定时重建的波折） |
| 3 | 生成 `.env`（随机密钥 + 免费模型配置） | ✅ 完成 |
| 4 | `docker compose up -d --build` + 迁移 seed + 健康检查 | ✅ 完成 |
| 5 | `smoke.ts` 全量页面 / 接口 | ✅ 完成（起站 / 收尾各一次，35 项全过） |
| 6 | 双板块页 `/ai` `/finance`、日报、反哺接口端到端 | ✅ 链路全通；`/finance` 因浏览门槛过滤演示样本暂无条目，见「已知限制」 |
| 7 | 结果汇总、清理、提交（不含 `.env`） | ✅ 完成 |

## 最终结果（09:05）

### 站点状态

| 项 | 结果 |
|---|---|
| 容器 | `db` healthy、`api` / `worker` / `web` 均 Up；`setup` 退出码 **0**，71 条迁移、24 个源 |
| 访问 | 当时 `http://localhost:3000`；`/api/health` = `{"ok":true,"db":"ok"}` |
| smoke | **35 项全过**（起站后 + 收尾各跑一次） |
| 双板块 | `/ai`、`/finance` 独立 SSR 页 200；`/api/board/ai` 返回 2 条真实模型改写后的内容 |
| 日报 | `reports` 已落 `daily|2026-11-06`，`/daily` 200，标题「AI 与财经日报 · 枫泽观潮」 |
| 模型 | 容器内网关 `/v1` = 200；**23 个新回执全部 `completed`**（`deepseek-v4-pro-0813`），0 个新失败 |
| 反哺 | `POST /api/ingest/items` 两次共 6 条，`created: 4 + 2`，`ingest_events` 全部 ok |
| 分类 | `publications` 分布 = `ai-models` 1 / `ai-products` 1 / `finance-a` 1 / `finance-policy` 3，**双板块分流正确** |
| 信源 | 24 个源全部恢复 `enabled=true`；`COLLECT_ENABLED=true`，站点可持续自动采集 |

### 三处发现（均非代码 bug，但值得后续修）

1. **`COLLECT_ENABLED=false` 会连带关掉正文抽取 worker**：`registerExtractionJobs` 挂在 `registerSourceJobs` 下（`packages/backend/src/jobs/sources.ts:16`），`apps/worker/src/main.ts:23` 只在采集开启时注册它，反哺条目会卡在 `content.extract-body` 无人消费。
2. **`external` 反哺只给 `raw.text` 时，引擎仍会去抓原始 URL 正文**：`body_text` 为空 → `route()` 选 extract；抓不到要等 **3 次 × 10 分钟**才降级到 analyze。**每日要闻反哺自动化会撞这个延迟**。后续复核修正了本条的措辞：**并不存在「不抓正文」配置**——`packages/backend/src/jobs/content.ts:42` 的 `needsPage` 只由 `whole && pageFetchable && (wantsBody || bare)` 决定，`wantsBody` 只会被配置打开、不会被关闭，`bare` 就是 `body_text` 为空。因此「把正文写进 `body_text`」本身就是免抓方案。完整根因、三条可选路径与验收命令见 `docs/deferred-items.md` 第 2 项。
3. **自动路由免费模型不兼容 AIHOT 固定参数**：`free-auto` 会落到 `kimi-k3`（拒绝 `temperature: 0.2`），必须选逐项兼容的固定模型（本次选 `deepseek-v4-pro-0813`）。

### 已知限制 / 验证后需要知道的

- `/finance` 当前**没有条目**：6 条演示内容里，AI 两条得分 62 / 42 ≥ `browseFloor=40` 可见；金融四条得分 0 / 0 / 18 / 12 被浏览门槛过滤。**这是门槛正常生效，不是板块查询错误**（分类映射、SQL、section 均已核对）。真实反哺内容质量更高，会自然进入。
- 日报 `entries=0`：演示内容没有一条入选精选（`selected=false`），所以生成的是一期「安静」日报。这验证了日报落库与 `/daily` 渲染链路，不代表真实内容效果。
- 6 条演示条目（`example.com` URL、模型改写过标题）**保留在库里**，可在后台删除；不影响运行。
- `.env` 已生成且被 `.gitignore` 忽略，权限 600，**未提交，也未把任何密钥写进文档或聊天**。
- 安全阀：飞书 / IndexNow 全关；`COLLECT_ENABLED=true`（为注册正文 worker 且让站点自动采集）、`MODEL_CALLS_ENABLED=true`（反哺内容需要）。全部只走本机 LLM 网关的免费模型，无任何付费源。

**后续怎么收口**：本次验证暴露的顺延项（`terms.md` / `privacy.md` 正文、反哺正文免抓、板块级合成 RSS、批次 4 品牌素材、全量 web/DB 测试）逐项方案见 `docs/deferred-items.md`；日常起停、巡检与故障速查见 `docs/sop.md`。特别提醒：`.github/workflows/check.yml` 已具备 `pg_dump` 与 Playwright，但 `docker-compose.yml` 底部声明了 external 网络，干净 runner 上不存在会让起站失败，且 CI 漏跑 `test:standalone`，push 前需先补这两处（方案文档第 5 项 / 方案主文档 14.2）。

### 运行与停止

现在统一走一键脚本（会自动自检环境、补共享网络、等健康、跑巡检），见 `docs/sop.md`：

```bash
./up              # 自检 → 起站 → 巡检 → 打印地址
./up check        # 只确认环境
./up status       # 容器状态 + 健康检查
./up logs         # worker 日志
./up down         # 停站（保留数据卷）
```

底层等价命令（排查时用，端口以 `.env` 的 `PORT` 为准）：

```bash
docker compose ps
docker compose logs -f worker
docker compose down
docker compose up -d --build
./up smoke        # 等价于用 .env 的 SITE_URL 跑 scripts/smoke.ts
```

## 操作日志

### 00:33 — 环境与规则盘点
- 确认 LLM 网关容器 healthy，仅绑定 loopback（不对外）。
- 读完 `.env.example`、`docker-compose.yml`、`site/models.ts`、`.gitignore`。
- 结论：只需配 `default` 一组 LLM 变量即可覆盖全部模型步骤；`PRESETS` 里那些具名模型都不用。

### 08:15 — 网关取 key 与 `.env` 生成
- 网关位于共享 Docker external 网络，宿主机仅暴露 loopback 端口；同网络容器通过网关服务名访问 `/v1`，实测 200。具体地址与端口见本机 `.env`，不写入本文。
- `/api/pricing` 列出 10 个模型，`model_price` 全为 0（免费）：`free-auto`、`glm-5.3`、`qwen3.8-max`、`kimi-k3`、`deepseek-v4-pro-0813` 等，均为 `default` 组 + OpenAI 端点。
- ⚠️ **波折**：前夜选中的免费 token 在次日 07:30 被定时自动化软删除（该自动化每天删旧建新同名 token）。改选跨天常驻、不过期、不限模型的 token，实测 `/v1/chat/completions` = 200。token 名与 ID 属本机凭证信息，不写入本文。
- 模型实测：`free-auto` 普通文本（max_tokens 300）正常返回中文；`response_format: json_object` 返回 `{"ok": true}`；`.env.example` 默认的 `thinking` 参数也兼容、不报错。小 max_tokens 时推理模型会输出空，故设 `LLM_REASONING_TOKENS=4000`。
- `.env` 已生成：**18 个变量、权限 600、`git check-ignore` 确认被忽略**。含随机 `ADMIN_PASSWORD` / `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` / `POSTGRES_PASSWORD` / `INGEST_TOKEN`；`LLM_BASE_URL` 指向网关容器内 `/v1`、`LLM_MODEL=free-auto`。
- 安全阀：`COLLECT_ENABLED=false`（不抓外站）、`MODEL_CALLS_ENABLED=true`（反哺内容需走结构化 / 精选）、飞书与 IndexNow 全关。
- `docker-compose.yml` 给 `x-backend`（setup / api / worker）加共享 external 网络 —— 不加的话容器内访问不到只 bind 在宿主机 loopback 的网关端口。

### 08:20 — Docker 起站与真实 smoke
- `docker compose up -d --build` 成功（约 3 分钟）；`setup` 退出码 **0**，migrate **71** 条、seed **24** 个源。
- `docker compose ps`：`db` healthy，`api` / `worker` / `web` 均 Up；`/api/health` = `{"ok":true,"db":"ok","ms":1}`，首页 `<title>` = 「枫泽观潮 — AI 与财经热点 · 每日精选与日报」。
- **全量 smoke → 35 项全过**：首页、`/ai`、`/finance`、`/all`、`/hot`、`/daily`、主题 / 关于 / 条款等全部页面，`/api/board/ai`、`/api/board/finance`、公开 API、`/feed.xml`、`/sitemap.xml`、`/llms.txt`、`/robots.txt`、og 图 / favicon、`/api/mcp initialize`。
- worker 容器内网关 `/v1/models` = **200**，DNS 解析正常，`LLM_*` / `MODEL_CALLS_ENABLED` / `INGEST_TOKEN` 全部注入成功。

### 08:35 — 反哺内容链路与两处发现
- `POST /api/ingest/items` 推 4 条**明确标注「端到端验证样本、非真实新闻」**的内容（AI 2 条 + 金融 2 条），返回 `{"ok":true,"created":4}`；`articles=4`，`ingest_events` 记录 `items|ok`。
- ⚠️ **发现 1（启动配置陷阱）**：`COLLECT_ENABLED=false` 时 `apps/worker/src/main.ts` 不注册 `registerSourceJobs`，而**正文抽取 worker `registerExtractionJobs` 挂在它下面**（`packages/backend/src/jobs/sources.ts:16`）。结果 `content.extract-body` 的 4 个 job 一直卡在 `created` 无人消费。改成 `COLLECT_ENABLED=true` 并重启后 4 个 job 立即 `completed`。
- 为避免开启采集后去抓外站，临时把 23 个 RSS 源 `enabled=false`，只保留 `external-fengze-daily`；`setup` 重跑后核对仍是 `f|23 / t|1`，不会被 seed 覆盖。
- ⚠️ **发现 2（真实产品问题，建议后续修）**：`external` 反哺接口只接 `raw.text`，但引擎 `route()` 因 `body_text` 为空仍会尝试抓取原始 URL 的正文；样本 URL 是 `example.com` 占位，抓取失败后要等 **3 次 × 10 分钟**才降级到 `content.analyze`。**每日要闻反哺自动化如果只推 `raw`，也会撞这个延迟**。后续复核已修正：并不存在「不抓正文」配置，把正文写入 `body_text` 即可免抓，详见 `docs/deferred-items.md` 第 2 项。
- 本次为验证后半段链路：把反哺正文落到 `body_text`、`body_status='ok'`，再用框架自己的 `queueProcessing()` 重新入队；4 个 `content.analyze` job 已 `created`，模型结构化 / 精选 / 发布链路开始消费。

### 08:45 — 模型参数兼容性（发现 3）
- ⚠️ **首轮 `content.analyze` 4 条全部失败**：`llm HTTP 400: invalid_parameter_error — Parameter 'temperature'=0.2 is not supported for kimi-k3 model.` 根因是 `free-auto` 会**自动路由到不同上游模型**，落到 `kimi-k3` 就拒绝 AIHOT 评分步骤固定的 `temperature: 0.2`；同批路由到 `deepseek-v4-pro-0813` 的回执则成功返回 `{"attentionScore": 62}`。
- 实测 5 个固定模型（统一带 `temperature=0.2` + `response_format: json_object` + `thinking:disabled`）：

  | 模型 | 结果 |
  |---|---|
  | `deepseek-v4-pro-0813` | ✅ 200，`{"score": 62}` |
  | `qwen3.8-27b` | ✅ 200 |
  | `qwen3.8-max` | ❌ 403 免费额度耗尽 |
  | `glm-5.3` | ❌ 400，`enable_thinking` 必须为 True |
  | `kimi-k3` | ❌ 400，不支持 `temperature` |

- ⇒ `.env` 改用固定 `LLM_MODEL=deepseek-v4-pro-0813`。**结论：自动路由 / 免费聚合模型不适合 AIHOT 的固定调用参数，必须选一个逐项兼容的固定模型。**
- 换模型后 `receipts.logical_key` 也变了，不会复用之前的失败回执；把 4 条 `failed` 重置为 `new`，再用 `queueProcessing()` 重新入队。
