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

`.env` 不存在时：`cp .env.example .env`，填上 `ADMIN_PASSWORD`、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`、`INGEST_TOKEN`、`LLM_API_KEY`，并把 `LLM_BASE_URL` / `LLM_MODEL` 指向可用模型（本机是 `http://new-api:3000/v1` + `deepseek-v4-pro-0813`）。`./up check` 会列出缺哪些键。

---

## 常用命令

| 想做什么 | 命令 |
|---|---|
| 看容器状态 + 健康检查 | `./up status` |
| 看处理日志（Ctrl-C 退出） | `./up logs` |
| 只巡检页面 / 接口 / RSS / MCP | `./up smoke` |
| 改了 `site/`、`industry/`、`modules/`、`Dockerfile` 后重建 | `./up rebuild` |
| 只改了 `.env`，让容器重新读 | `./up down && ./up` |
| 列出所有命令 | `./up help` |

`./up check` 会自动**只读**检查：Node ≥ 24、Docker 是否运行、compose 配置、`.env` 变量是否齐全、模型是否为固定模型、`rag-net` 网络、`new-api` 容器、3000 端口。
启动时会**自动修**两件小事：`rag-net` 不存在就创建、`.env` 权限不是 600 就改回来。

---

## 站点入口

| 页面 | 地址 |
|---|---|
| 首页 | `http://localhost:3000/` |
| AI 板块 / 金融板块 | `http://localhost:3000/ai` · `http://localhost:3000/finance` |
| 当日日报 | `http://localhost:3000/daily` |
| 后台 | `http://localhost:3000/admin` |
| 机器出口 | `/feed.xml` · `/sitemap.xml` · `/llms.txt` · `/api/v1/items` · `/api/mcp` |

每天 **09:15** 要闻自动化反哺入站 → 引擎筛选分类 → **09:30** 自动出日报，不用手动操作。

---

## 出问题了

**先看日志：`./up logs`，再对照下表。**

| 症状 | 一条命令 / 处理 |
|---|---|
| 站打不开、容器起不来 | `./up check` 看哪一行标 ✗，按提示修；再 `./up rebuild` |
| `/finance` 空页 | `docker compose exec -T db psql -U aihot -d aihot -c "select category,score from publications order by discovered_at desc limit 10;"` — 低于 40 分会被浏览门槛挡住，属正常 |
| 日报没有条目 | `docker compose exec -T db psql -U aihot -d aihot -c "select count(*) from publications where selected;"` |
| 反哺内容迟迟不进站 | `./up logs` 看 `content.extract-body`；`COLLECT_ENABLED` 必须是 `true` |
| 模型报 400 / `temperature` 不支持 | `.env` 的 `LLM_MODEL` 改成固定 `deepseek-v4-pro-0813`，别用 `free-auto`；改完 `./up down && ./up` |
| 次日模型 401/403 | `LLM_API_KEY` 换成 `new-api` 的常驻 token（`workbuddy` / `finance-workbench`） |
| 巡检某一项 ✗ | `./up smoke` 单跑看具体路径；改了站点配置就 `./up rebuild` |

> 更细的根因与修复方案见 `docs/deferred-items.md`；本机起站实测见 `docs/e2e-verification.md`。

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

每完成一批单独 `git commit`；`git push` 前需本人确认并显式列出 deferred items；`.env`、密钥、`.workbuddy/` 一律不提交；定制只改 `site/`、`industry/`、`modules/`，不动 `apps/`、`packages/` 核心代码。

---

## 想深究再看

| 文档 | 内容 |
|---|---|
| `docs/deferred-items.md` | 5 项待办（条款正文、反哺免抓、板块 RSS、品牌素材、CI 全量测试）怎么收口 |
| `docs/plan-ai-finance.md` | 定制方案、决策记录、全量测试归因 |
| `docs/e2e-verification.md` | 本机 Docker 端到端实测日志 |
| `docs/customize.md` | 引擎自带的定制说明 |
