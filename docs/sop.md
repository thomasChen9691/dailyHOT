# 枫泽观潮 · 使用手册

**在项目根目录执行 `./up` 就行。** 脚本会自己确认环境、补上缺的网络、起站、等健康检查、跑完巡检，最后打印地址。不用记 Docker 命令，不用管 PATH。

---

## 三条命令（日常够用）

| 想做什么 | 命令 |
|---|---|
| 启动 / 确认站点正常 | `./up` |
| 只确认环境，不改任何东西 | `./up check` |
| 停站（数据保留） | `./up down` |

首次启动约 3 分钟；之后 `./up` 发现站点已在跑会跳过构建，几秒完成。

---

## 第一次使用

```bash
# 1. 打开 Docker Desktop
# 2. 确认 .env 存在（本机已生成，不要提交、不要外传）
ls -l .env

# 3. 确认环境，全绿再启动
./up check
./up
```

`.env` 不存在时：`cp .env.example .env`，填上 `ADMIN_PASSWORD`、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`、`INGEST_TOKEN`、`LLM_API_KEY`，并把 `LLM_BASE_URL` / `LLM_MODEL` 指向可用模型（格式见 `.env.example`，本机地址不写进文档）。`./up check` 会列出缺哪些键。

---

## 常用命令

| 想做什么 | 命令 |
|---|---|
| 看容器状态 + 健康检查 | `./up status` |
| 看处理日志（Ctrl-C 退出） | `./up logs` |
| 只巡检页面 / 接口 / RSS / MCP | `./up smoke` |
| 要闻反哺入站 / 看当前推送地址 | `./up ingest` |
| 看本机所有容器的端口台账（只读） | `./up ports` |
| 改了 `site/`、`industry/`、`modules/`、`Dockerfile` 后重建 | `./up rebuild` |
| 只改了 `.env`，让容器重新读 | `./up down && ./up` |
| 列出所有命令 | `./up help` |

`./up check` 会自动**只读**检查：Node ≥ 24、Docker、compose 配置、`.env` 变量、固定模型、`PORT` 与 `SITE_URL` 是否一致、共享网络、LLM 网关、project 是否被别的目录占用、端口占用、其他 compose 是否也声明了本站端口。
启动时会**自动修**两件小事：共享网络不存在就创建、`.env` 权限不是 600 就改回来。

---

## 站点入口

| 页面 | 地址 |
|---|---|
| 首页 | `http://localhost:3100/` |
| AI 板块 / 金融板块 | `http://localhost:3100/ai` · `http://localhost:3100/finance` |
| 当日日报 | `http://localhost:3100/daily` |
| 后台 | `http://localhost:3100/admin` |
| 机器出口 | `/feed.xml` · `/sitemap.xml` · `/llms.txt` · `/api/v1/items` · `/api/mcp` |

引擎筛选分类后 **09:30** 自动出日报。要闻反哺走 `./up ingest`（地址随 `.env` 自动变），当前目标 `http://localhost:3100/api/ingest/items`。

---

## 端口

- 本站用 **3100**。`.env` 里 `PORT=3100` 与 `SITE_URL=http://localhost:3100` **必须一致**，`./up check` 会拦下不一致。
- **换端口只改 `.env` 这两行**，然后 `./up down && ./up`。compose 默认值、代码、CI 都不用动（CI 没有 `.env`，仍走兜底 3000）。
- `./up ports` 只读扫描 `~/github`、`~/Projects` 下所有 compose 的端口声明 + 运行中容器，列出谁占了哪个端口。不读 `.env` 值、不启动容器、不写文件。
- ✅ 反哺地址**不再写死端口**：`./up ingest` 从 `.env` 的 `SITE_URL` 派生，当前即 3100。外部要闻脚本调用它即可，以后换端口不用改脚本；若必须自己拼 URL，`./up ingest` 不带参数会打印当前地址。
- 起站日志出现 `volume ... already exists but was created for project "aihot"` 是**预期告警**：数据卷创建于旧 project，已显式保留卷名；数据完好，不用处理，也不要跑 `docker compose down -v`。

---

## 反哺入站（要闻 → 站点）

当前地址：**`http://localhost:3100/api/ingest/items`**，由 `.env` 的 `SITE_URL` 派生。

```bash
./up ingest                                              # 打印当前地址 + 用法
./up ingest --dry-run output/daily_ai_finance_<日期>.csv  # 只解析，不发送
./up ingest output/daily_ai_finance_<日期>.csv            # 真正入站
```

- CSV 用要闻固定列 `section,category,content,reason,link`；也支持 JSON `{sourceId,sourceName,items[]}` 和 stdin `-`。
- `INGEST_TOKEN` 从 `.env` 读、脚本不打印；自动复用 `external-fengze-daily` 源。
- **外部要闻脚本调用 `./up ingest <当日 CSV>` 即可**，改端口不用改脚本；必须硬编码 URL 时用 `./up ingest` 打印的地址。**反哺是可选增强，不反哺站点也能靠内置信源出刊。**
- ⚠️ 引擎仍会尝试抓原始链接正文，抓不到会延迟处理（收口方案见 `docs/deferred-items.md` 第 2 项）。

---

## 出问题了

**先看日志：`./up logs`，再对照下表。**

| 症状 | 一条命令 / 处理 |
|---|---|
| 站打不开、容器起不来 | `./up check` 看哪一行标 ✗，按提示修；再 `./up rebuild` |
| 端口被占 / `PORT` 与 `SITE_URL` 不一致 | `./up ports` 看谁占了；改 `.env` 两行后 `./up down && ./up` |
| `./up check` 报「旧 project 残留」或「同名 project」 | 按提示执行 `docker compose -p <旧名> down`，再 `./up` |
| `/finance` 空页 | `docker compose exec -T db psql -U aihot -d aihot -c "select category,score from publications order by discovered_at desc limit 10;"` — 低于 40 分会被浏览门槛挡住，属正常 |
| 日报没有条目 | `docker compose exec -T db psql -U aihot -d aihot -c "select count(*) from publications where selected;"` |
| 反哺内容迟迟不进站 | `./up ingest` 看当前地址（应为 3100）；`./up ingest --dry-run <csv>` 验证解析；`./up logs` 看 `content.extract-body`；`COLLECT_ENABLED` 必须是 `true` |
| 模型报 400 / `temperature` 不支持 | `.env` 的 `LLM_MODEL` 改成固定 `qwen3.8-27b`，别用 `free-auto`；改完 `./up rebuild` |
| 文章大量 `processing_state=failed` | 先看错误：账户额度报 403 要先确认网关额度，上游免费额度报 403 只能等重置或换渠道；恢复后跑一次 `requeueFailed(null)` 补齐积压，别空转重跑 |
| 次日模型 401/403 | 换一个不过期、不限模型的常驻 token（见本机网关控制台） |
| 巡检某一项 ✗ | `./up smoke` 单跑看具体路径；改了站点配置就 `./up rebuild` |

> 更细的根因与修复方案见 `docs/deferred-items.md`；本机起站实测见 `docs/e2e-verification.md`（3000 端口时期的记录）。

---

## 告警在哪儿看

**当前通道：飞书应用消息。** 告警由 `ops.alerts`（worker 每 10 分钟一轮）经 `sendAlert` 发到专用群「枫泽观潮 · 运维告警」，凭证在 `.env` 的 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_ALERT_CHAT_ID`，开关 `FEISHU_INTERNAL_ENABLED=true`。告警与反馈不进内容群，内容推送走另一个开关 `FEISHU_CONTENT_PUSH_ENABLED`。

| 项 | 说明 |
|---|---|
| 群 | 飞书「枫泽观潮 · 运维告警」（应用「每日新闻」的机器人所在群） |
| 发送链 | `sendAlert` → 若配了 `FEISHU_ALERT_WEBHOOK_URL` 优先走自定义机器人 → 否则用 App 凭证换 tenant token → `FEISHU_ALERT_CHAT_ID` 群消息 |
| 内容 | 新告警、重复提醒（now 级 1 小时 / today 级 24 小时）、恢复通知、09:00 系统日报 |
| 查状态 | 站内 `settings.alerts.state`；重复提醒窗口内不会反复发 |

**离线演练通道（备用，默认停用）**：`scripts/local-alert-sink.mjs` 把告警落盘 `.workbuddy/alerts/<日期>.jsonl` 并弹 macOS 通知。启用时把 `FEISHU_ALERT_WEBHOOK_URL` 填成 `http://host.docker.internal:38765/alert`、清空 `FEISHU_ALERT_CHAT_ID`，并在另一终端起接收端：

```bash
PATH=/usr/local/bin:$PATH node scripts/local-alert-sink.mjs
curl -s http://127.0.0.1:38765/ | tail -30      # 看最近收到的告警
```

**三个必须知道的坑**：

1. 用离线接收端时，`OUTBOUND_NO_PROXY` 必须含 `host.docker.internal`，否则容器 `fetch` 会把请求交给 `OUTBOUND_PROXY`（Clash）而失败；改完 `.env` 必须 `docker compose up -d api worker`（`restart` 不会重读 `.env`）。飞书通道走正常出站代理，不受影响。
2. `FEISHU_ALERT_WEBHOOK_URL` 一旦非空就**优先**于 App 群消息，切换时务必把上一套通道的值清干净。
3. 通道不可用时 `sendAlert` 会抛错并让整轮 `ops.alerts` 记为失败（`alerts.ts:567` 没有兜底）——不是静默降级。长期不发告警时把 `FEISHU_INTERNAL_ENABLED` 改回 `false`。

> `up -d` 会重建容器，热补丁（如 `modules/llm-guard`）会丢，需重新 `docker cp` + 软链接 + `restart`；改完后统一 `./up rebuild` 固化。

---

## 改代码后才需要看的检查单

```bash
PATH=/usr/local/bin:$PATH npm run typecheck; echo "TSC_EXIT=$?"   # 必须 0；别用 tail 管道判断退出码
PATH=/usr/local/bin:$PATH npm run build -w @aihot/web
./up rebuild
```

改过 `site/site.ts` 的 `EDITION_TIMES.daily` 时，额外单跑 `tests/daily-report-alerts.test.ts`、`report-recovery`、`category-corrections`。完整发布检查单在 `docs/plan-ai-finance.md` 13.8。

---

## 纪律（一句话）

每完成一批单独 `git commit`；`git push` 前需本人确认并显式列出 deferred items；`.env`、密钥、`.workbuddy/` 一律不提交（后者已写入 `.git/info/exclude`，仅本机生效）；定制只改 `site/`、`industry/`、`modules/`，不动 `apps/`、`packages/` 核心代码。

---

## 想深究再看

| 文档 | 内容 |
|---|---|
| `docs/deferred-items.md` | 6 项待办（条款正文、反哺免抓、板块 RSS、品牌素材、CI 全量测试、配额备用方案）怎么收口 |
| `docs/plan-ai-finance.md` | 定制方案、决策记录、全量测试归因 |
| `docs/e2e-verification.md` | 本机 Docker 端到端实测日志（当时为 3000 端口） |
| `docs/automation-fallback.md` | 平台工作流数量受限时的备用方案（分层、R0–R3、本机调度模板） |
| `docs/handoffs/2026-11-06-ops-and-first-push.md` | 会话交接快照：当前状态、工程约定、deferred 状态、下一会话第一件事 |
| `docs/customize.md` | 引擎自带的定制说明 |
