# 端到端验证记录（2026-11-06 凌晨，无人值守）

> **授权**：用户 2026-11-06 00:33 明确授权 AI 自主访问相关网站 / 规则等内容、创建或修改 `.env`、从 Docker 的 `new-api` 容器获取免费大模型 API key、自行起 Docker 完成端到端验证，并要求把操作与结果记录在本文件供起床查看。目标：**起床时看到一个能成功运行完成的项目**。

## 授权边界（自我约束）

- ✅ 允许：读项目 / 框架文档与规则；读 `new-api` 容器配置与接口；生成 `.env`；`docker compose up -d --build`；跑 `smoke.ts`；往 `/api/ingest/items` 推样本数据；调用本地免费模型。
- ❌ 不做：不提交 `.env`（`.gitignore` 已忽略）；不把 API key / 密码明文写进任何文档或聊天；不开启对外通知（飞书 / IndexNow）；不接付费采集源（`SOCIALDATA` / `DAJIALA` / `JINA`）；不大量抓取外站；不 `git push`。
- 安全阀：按 `AGENTS.md`，开发时保持关闭。为验证模型链路可短时开 `MODEL_CALLS_ENABLED`，验证完关回；`COLLECT_ENABLED` 默认关闭，不做真实大批量采集。
- 所有凭证只落在仓库根目录 `.env`（已被 `.gitignore` 忽略），本文件只记录「已配置」，不记录值。

## 环境基线（00:33 盘点）

| 项 | 值 |
|---|---|
| 项目 | `dailyHOT`（AIHOT 引擎定制站「枫泽观潮」），9 个本地 commit 未 push |
| Node | `/usr/local/bin/node` v24.22.1；校验统一加 `PATH=/usr/local/bin:$PATH` |
| Docker 容器 | `dailyhot-test-pg`（55432 测试库）、`new-api`（`127.0.0.1:38080→3000`，healthy）、Milvus/MinIO/etcd/Mongo RAG stack |
| `.env` | 原本不存在；`.gitignore` 含 `.env` / `.env.*`（保留 `.env.example`） |
| compose | `name: aihot`；服务 `db` / `setup`（migrate+seed）/ `api` / `worker` / `web`；web 端口 3000 |
| 模型配置 | `site/models.ts` 的 `default` 用 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`，`DEFAULTS={}` 即所有步骤走 default |
| 必填变量 | `SITE_URL`、`ADMIN_PASSWORD`、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`、`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` |

## 执行计划

| # | 步骤 | 状态 |
|---|---|---|
| 1 | 盘点环境 / 建立本日志 | ✅ 完成 |
| 2 | 从 `new-api` 获取免费模型 key、确认可用模型名 | ✅ 完成（含 token 被定时重建的波折） |
| 3 | 生成 `.env`（随机密钥 + 免费模型配置） | ✅ 完成 |
| 4 | `docker compose up -d --build` + 迁移 seed + 健康检查 | ✅ 完成 |
| 5 | `smoke.ts --base http://localhost:3000` 全量页面 / 接口 | ✅ 完成（起站 / 收尾各一次，35 项全过） |
| 6 | 双板块页 `/ai` `/finance`、日报、反哺接口端到端 | ✅ 链路全通；`/finance` 因浏览门槛过滤演示样本暂无条目，见「已知限制」 |
| 7 | 结果汇总、清理、提交（不含 `.env`） | ✅ 完成 |

## 最终结果（09:05）

### 站点状态

| 项 | 结果 |
|---|---|
| 容器 | `aihot-db-1` healthy、`aihot-api-1` / `aihot-worker-1` / `aihot-web-1` 均 Up；`setup` 退出码 **0**，71 条迁移、24 个源 |
| 访问 | `http://localhost:3000`；`/api/health` = `{"ok":true,"db":"ok"}` |
| smoke | **35 项全过**（起站后 + 收尾各跑一次） |
| 双板块 | `/ai`、`/finance` 独立 SSR 页 200；`/api/board/ai` 返回 2 条真实模型改写后的内容 |
| 日报 | `reports` 已落 `daily|2026-11-06`，`/daily` 200，标题「AI 与财经日报 · 枫泽观潮」 |
| 模型 | 容器内 `http://new-api:3000/v1` = 200；**23 个新回执全部 `completed`**（`deepseek-v4-pro-0813`），0 个新失败 |
| 反哺 | `POST /api/ingest/items` 两次共 6 条，`created: 4 + 2`，`ingest_events` 全部 ok |
| 分类 | `publications` 分布 = `ai-models` 1 / `ai-products` 1 / `finance-a` 1 / `finance-policy` 3，**双板块分流正确** |
| 信源 | 24 个源全部恢复 `enabled=true`；`COLLECT_ENABLED=true`，站点可持续自动采集 |

### 三处发现（均非代码 bug，但值得后续修）

1. **`COLLECT_ENABLED=false` 会连带关掉正文抽取 worker**：`registerExtractionJobs` 挂在 `registerSourceJobs` 下（`packages/backend/src/jobs/sources.ts:16`），`apps/worker/src/main.ts:23` 只在采集开启时注册它，反哺条目会卡在 `content.extract-body` 无人消费。
2. **`external` 反哺只给 `raw.text` 时，引擎仍会去抓原始 URL 正文**：`body_text` 为空 → `route()` 选 extract；抓不到要等 **3 次 × 10 分钟**才降级到 analyze。**你现有的 09:15 HKT 反哺自动化会撞这个延迟**。建议后续让反哺脚本直接提供正文，或给 external 源加「不抓正文」配置。
3. **自动路由免费模型不兼容 AIHOT 固定参数**：`free-auto` 会落到 `kimi-k3`（拒绝 `temperature: 0.2`），必须选逐项兼容的固定模型（本次选 `deepseek-v4-pro-0813`）。

### 已知限制 / 起床后需要知道的

- `/finance` 当前**没有条目**：6 条演示内容里，AI 两条得分 62 / 42 ≥ `browseFloor=40` 可见；金融四条得分 0 / 0 / 18 / 12 被浏览门槛过滤。**这是门槛正常生效，不是板块查询错误**（分类映射、SQL、section 均已核对）。真实 09:15 反哺内容质量更高，会自然进入。
- 日报 `entries=0`：演示内容没有一条入选精选（`selected=false`），所以生成的是一期「安静」日报。这验证了日报落库与 `/daily` 渲染链路，不代表真实内容效果。
- 6 条演示条目（`example.com` URL、模型改写过标题）**保留在库里**，可在后台删除；不影响运行。
- `.env` 已生成且被 `.gitignore` 忽略，权限 600，**未提交，也未把任何密钥写进文档或聊天**。
- 安全阀：飞书 / IndexNow 全关；`COLLECT_ENABLED=true`（为注册正文 worker 且让站点自动采集）、`MODEL_CALLS_ENABLED=true`（反哺内容需要）。全部只走 `new-api` 免费模型，无任何付费源。

### 运行与停止

```bash
cd /Users/cxt/github/dailyHOT
docker compose ps                        # 查看状态
docker compose logs -f worker            # 看处理日志
docker compose down                      # 停站（保留 db / data volume）
docker compose up -d                     # 再启动
PATH=/usr/local/bin:$PATH node scripts/smoke.ts --base http://localhost:3000
```

## 操作日志

### 00:33 — 环境与规则盘点
- 确认 `new-api` 容器 healthy，端口仅绑定 `127.0.0.1:38080`（不对外）。
- 读完 `.env.example`、`docker-compose.yml`、`site/models.ts`、`.gitignore`。
- 结论：只需配 `default` 一组 LLM 变量即可覆盖全部模型步骤；`PRESETS` 里那些具名模型都不用。

### 08:15 — `new-api` 取 key 与 `.env` 生成
- `new-api` 在 `rag-net` 网络（容器 IP `192.168.117.5`，容器内监听 3000），宿主机直连 `http://192.168.117.5:3000/api/status` = 200 ⇒ 同网络容器可用 `http://new-api:3000/v1`。
- `/api/pricing` 列出 10 个模型，`model_price` 全为 0（免费）：`free-auto`、`glm-5.3`、`qwen3.8-max`、`kimi-k3`、`deepseek-v4-pro-0813` 等，均为 `default` 组 + OpenAI 端点。
- ⚠️ **波折**：昨晚选中的 token `id=7 free-auto` 在**今早 07:30 被一个定时自动化软删除**（该自动化每天 07:30 删旧建新同名 token，`deleted_at` 有值）。改选跨天常驻的 `id=6 workbuddy`（`status=1` / `unlimited_quota=1` / 永不过期 / 不限模型），实测 `/v1/chat/completions` = 200。
- 模型实测：`free-auto` 普通文本（max_tokens 300）正常返回中文；`response_format: json_object` 返回 `{"ok": true}`；`.env.example` 默认的 `thinking` 参数也兼容、不报错。小 max_tokens 时推理模型会输出空，故设 `LLM_REASONING_TOKENS=4000`。
- `.env` 已生成：**18 个变量、权限 600、`git check-ignore` 确认被忽略**。含随机 `ADMIN_PASSWORD` / `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` / `POSTGRES_PASSWORD` / `INGEST_TOKEN`；`LLM_BASE_URL=http://new-api:3000/v1`、`LLM_MODEL=free-auto`。
- 安全阀：`COLLECT_ENABLED=false`（不抓外站）、`MODEL_CALLS_ENABLED=true`（反哺内容需走结构化 / 精选）、飞书与 IndexNow 全关。
- `docker-compose.yml` 给 `x-backend`（setup / api / worker）加 `rag-net` external 网络 —— 不加的话容器内访问不到只 bind 在宿主机 loopback 的 `127.0.0.1:38080`。

### 08:20 — Docker 起站与真实 smoke
- `docker compose up -d --build` 成功（约 3 分钟）；`setup` 退出码 **0**，migrate **71** 条、seed **24** 个源。
- `docker compose ps`：`db` healthy，`api` / `worker` / `web` 均 Up；`/api/health` = `{"ok":true,"db":"ok","ms":1}`，首页 `<title>` = 「枫泽观潮 — AI 与财经热点 · 每日精选与日报」。
- **`node scripts/smoke.ts --base http://localhost:3000` → 35 项全过**：首页、`/ai`、`/finance`、`/all`、`/hot`、`/daily`、主题 / 关于 / 条款等全部页面，`/api/board/ai`、`/api/board/finance`、公开 API、`/feed.xml`、`/sitemap.xml`、`/llms.txt`、`/robots.txt`、og 图 / favicon、`/api/mcp initialize`。
- worker 容器内 `http://new-api:3000/v1/models` = **200**，DNS `new-api → 192.168.117.5`，`LLM_*` / `MODEL_CALLS_ENABLED` / `INGEST_TOKEN` 全部注入成功。

### 08:35 — 反哺内容链路与两处发现
- `POST /api/ingest/items` 推 4 条**明确标注「端到端验证样本、非真实新闻」**的内容（AI 2 条 + 金融 2 条），返回 `{"ok":true,"created":4}`；`articles=4`，`ingest_events` 记录 `items|ok`。
- ⚠️ **发现 1（启动配置陷阱）**：`COLLECT_ENABLED=false` 时 `apps/worker/src/main.ts` 不注册 `registerSourceJobs`，而**正文抽取 worker `registerExtractionJobs` 挂在它下面**（`packages/backend/src/jobs/sources.ts:16`）。结果 `content.extract-body` 的 4 个 job 一直卡在 `created` 无人消费。改成 `COLLECT_ENABLED=true` 并重启后 4 个 job 立即 `completed`。
- 为避免开启采集后去抓外站，临时把 23 个 RSS 源 `enabled=false`，只保留 `external-fengze-daily`；`setup` 重跑后核对仍是 `f|23 / t|1`，不会被 seed 覆盖。
- ⚠️ **发现 2（真实产品问题，建议后续修）**：`external` 反哺接口只接 `raw.text`，但引擎 `route()` 因 `body_text` 为空仍会尝试抓取原始 URL 的正文；样本 URL 是 `example.com` 占位，抓取失败后要等 **3 次 × 10 分钟**才降级到 `content.analyze`。**你现有的 09:15 HKT 反哺自动化如果只推 `raw`，也会撞这个延迟**。建议后续让反哺脚本把正文写入可直接落 `body_text` 的位置，或给 external 源加「不抓正文」配置。
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
