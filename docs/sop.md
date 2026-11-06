# 枫泽观潮 · 运行与收口 SOP

> **适用范围**：基于 AIHOT 开源引擎定制的「枫泽观潮」AI × 金融双板块站。定位是**自用 / 练手的免费完全版**，当前不对外变现（`docs/plan-ai-finance.md` 第 9 节）。
> **权威顺序**：本文是**日常怎么跑**；`docs/plan-ai-finance.md` 是**为什么这么改**；`docs/e2e-verification.md` 是**本机 Docker 起站的实测证据**；`docs/deferred-items.md` 是**还没做完的 5 项怎么收口**。
> 所有命令在项目根目录执行；本机校验统一加 `PATH=/usr/local/bin:$PATH`（工具 shell 注入的 Node 22 会让原生 TS 校验误判，需用 `/usr/local/bin/node` 的 v24.22.1）。

---

## 0. 站点速查

| 项 | 值 |
|---|---|
| 站名 / MCP 前缀 | 枫泽观潮 / `fengze` |
| 板块页 | `/ai`（AI 大事，6 类）、`/finance`（金融市场，4 类） |
| 板块接口 | `/api/board/ai`、`/api/board/finance`（web SSR 内部调用，`robots.txt` 屏蔽） |
| 日报 | 北京时间 **09:30** 出刊；缺期告警边界 = 出刊 + 2h = **11:30** |
| 反哺 | 09:15 HKT 自动化 → `POST /api/ingest/items`（`Authorization: Bearer $INGEST_TOKEN`） |
| 信源 | 24 个 = 23 个免费 RSS + `external-fengze-daily`；全部 `site_fulltext=false` |
| 模型 | `LLM_BASE_URL=http://new-api:3000/v1`，**固定** `LLM_MODEL=deepseek-v4-pro-0813` |
| 本机入口 | `http://localhost:3000`；`/api/health` = `{"ok":true,"db":"ok"}` |
| 定制边界 | 只改 `site/`、`industry/`、`modules/`；**不动 `apps/`、`packages/` 核心代码** |

---

## 1. 每次开工的环境前置

```bash
cd /Users/cxt/github/dailyHOT
PATH=/usr/local/bin:$PATH node -v                     # 必须 v24.22.1
docker network inspect rag-net >/dev/null 2>&1 || docker network create rag-net
docker compose ps                                    # db healthy / api worker web Up
curl -fsS http://localhost:3000/api/health
```

`docker-compose.yml` 把 `rag-net` 声明成 **external network**（api/worker/setup 靠它访问 `new-api`）。本机该网络已存在；**干净的 CI runner 上没有**，不先建就会 `network rag-net not found`。详见 `docs/deferred-items.md` 第 5 项。

`.env` 由本人保管：权限 600、被 `.gitignore` 忽略、**不提交**。里面的 `ADMIN_PASSWORD` / `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` / `POSTGRES_PASSWORD` / `INGEST_TOKEN` / `LLM_API_KEY` 一律不写进文档或聊天。

---

## 2. 起站 / 停站 / 重建

| 动作 | 命令 | 验收 |
|---|---|---|
| 首次或改了 `site/site.ts`、`industry/`、模块、`Dockerfile` | `docker compose up -d --build` | `setup` 退出码 0；迁移 71 条、seed 24 源 |
| 日常启动 | `docker compose up -d` | `docker compose ps` 全 Up |
| 改了 `.env` | `docker compose up -d --force-recreate api worker` | 重新读环境变量，无需重建镜像 |
| 停站（保留数据卷） | `docker compose down` | `db` / `data` volume 保留 |
| 全量巡检 | `PATH=/usr/local/bin:$PATH node scripts/smoke.ts --base http://localhost:3000` | 页面、机器出口、MCP 全部 ✓ |
| 看处理日志 | `docker compose logs -f worker` | 无 `llm HTTP 4xx` / 反复重试 |

> 改 `site/site.ts` 后**必须重建镜像**（站点配置被打进 bundle），只重启容器不生效。

---

## 3. 每日内容链路（09:15 → 09:30）

| 时间（HKT） | 动作 | 核对 |
|---|---|---|
| 09:15 前 | 要闻自动化产出 CSV 全量留痕 + HTML ≤50 条展示，并 `POST /api/ingest/items` | 响应 `{"ok":true,"created":N}`；`ingest_events` 有 `items\|ok` |
| 09:15–09:25 | 引擎 `content.analyze` → 评分 / 分类 → 精选 → 发布 | `docker compose logs -f worker` 无 400；`receipts` 新回执 `completed` |
| 09:30 | 日报自动出刊；若排程未触发可手动 `composeDaily` | `/daily` 200；`reports` 有 `daily\|YYYY-MM-DD` |
| 出刊后 | 巡检 | `node scripts/smoke.ts --base http://localhost:3000`；`/ai`、`/finance` 有条目；`/daily` 标题「AI 与财经日报 · 枫泽观潮」 |

### 反哺后的库内快查

```bash
docker compose exec -T db psql -U aihot -d aihot -c \
  "select id, left(title, 30) as title, body_status, length(body_text) as body_chars, processing_state from articles order by discovered_at desc limit 10;"
docker compose exec -T db psql -U aihot -d aihot -c \
  "select category, count(*) from publications group by category order by 2 desc;"
docker compose exec -T db psql -U aihot -d aihot -c \
  "select kind, count(*) from reports group by 1 order by 2 desc;"
```

**当前已知坑**：反哺接口只把 `raw.text` 存进 `articles.raw`，不写 `body_text`，于是 `route()` 认为「无正文」去抓原 URL，失败要等 3 次 × 10 分钟才降级。收口方案见 `docs/deferred-items.md` 第 2 项；在修好之前，反哺脚本必须**后置补写正文并重新入队**（E2E 已用该法验证可行）。

---

## 4. 变更发布检查单

按顺序做，每条本地验证后再推下一条（incremental verify-then-commit）。

- [ ] **4.1 静态校验**：`PATH=/usr/local/bin:$PATH npm run typecheck`。⚠️ 用 `$?` 或 `grep -c "error TS"` 判断，**不要用 `tsc > log 2>&1; echo EXIT=$?; tail ...`**——后台任务整体退出码取自最后的 `tail`，会掩盖 `tsc` 失败（2026-11-05 曾因此误报 `c9ad8a9` 通过）。
- [ ] **4.2 出刊时间联动**：改过 `site/site.ts` 的 `EDITION_TIMES` 时，除按分类 / 分节名筛出的测试，必须额外单跑 `tests/daily-report-alerts.test.ts`、排期测试、`tests/report-recovery.test.ts`、`tests/category-corrections.test.ts`。测试时钟一律从 `EDITION_TIMES.daily` 派生，禁止硬编码 `10:00`。
- [ ] **4.3 模块守护测试**：`PATH=/usr/local/bin:$PATH node --import ./tests/standalone.ts --test modules/board/tests/boards.standalone.test.ts`（3/3）。
- [ ] **4.4 机器出口**：新增页面要同时实现 `ServerModule.sitemap.entries` 与 `llms()`；新增模块要登记 `site/modules/{index,server,web}.ts`、`site/package.json`、`package-lock.json`、`Dockerfile`；模块页面文件必须放 `modules/<name>/web/`。
- [ ] **4.5 构建**：`PATH=/usr/local/bin:$PATH npm run build -w @aihot/web`。
- [ ] **4.6 起站 smoke**：`docker compose up -d --build` → `node scripts/smoke.ts --base http://localhost:3000`。
- [ ] **4.7 浏览器目测**：桌面侧栏、手机底栏、「我的」页工具入口、分页与空态（smoke 只保证 200 与站名，不覆盖视觉）。
- [ ] **4.8 单独 commit**：每完成一批一个描述性 commit；`.workbuddy/` 不纳入提交。
- [ ] **4.9 push 前**：先征得本人确认，并**显式列出当时的 deferred items**。

---

## 5. 故障速查表

| 症状 | 根因 | 处理 |
|---|---|---|
| `/finance` 长期空页 | `industry/selection.ts` 的 `browseFloor=40` 把低分条目挡在公开列表外；分类映射与 SQL 没错 | 先用 `select score, category from publications` 核对；真实 09:15 内容质量更高会自然进入，**不要为凑数改门槛** |
| 日报 `entries=0` | 没有条目 `selected=true`，生成的是「安静」日报 | 查 `publications.selected`；验证落库链路即可，不代表真实内容效果 |
| 反哺条目卡 `content.extract-body` | ① `.env` 里 `COLLECT_ENABLED=false` 会连带不注册 `registerExtractionJobs`（`apps/worker/src/main.ts:23`）；② 无 `body_text` 触发抓原 URL | 开 `COLLECT_ENABLED=true`；按 `docs/deferred-items.md` 第 2 项补正文 |
| `llm HTTP 400: temperature=0.2 not supported` | `free-auto` 自动路由到 `kimi-k3` 等不兼容模型 | 用固定 `deepseek-v4-pro-0813`（或 `qwen3.8-27b`）；**绝不用 free-auto** |
| 次日模型全部 401/403 | `new-api` 每天 07:30 自动删旧建新同名 token | `LLM_API_KEY` 用常驻 token `workbuddy` / `finance-workbench`（`unlimited_quota=1`、不过期），不用 `free-auto` / `qwen` 等日抛 token |
| 新页面不进 sitemap / llms.txt | 引擎发现清单只硬编码自带页面，模块页必须自己登记 | 实现 `sitemap.entries` / `llms().pages`（或 `ways`）；`revision` 用内容身份，不伪造 `lastmod` |
| `web did not start`（15 s） | `apps/web/tests/web-server.ts:84` 硬编码 15 秒，本机 PyCharm + 多 Docker 高负载下冷启动 14–48 秒 | **不改框架常量**；低负载 / 单并发复跑，或走 CI |
| `spawn pg_dump ENOENT` | 本机无 PostgreSQL 客户端 | `brew install libpq` 并把 `pg_dump`/`pg_restore` 加进 PATH，或走 CI |
| Playwright 组挂起数小时 | 本机浏览器环境不稳定 | 不作为代码质量证据；走 CI（见第 9 节） |

---

## 6. 机器出口对照（改动后逐项复核）

| 出口 | 由谁生成 | 板块相关内容 |
|---|---|---|
| `/sitemap.xml`、`/sitemaps/board.xml` | `publication/sitemap.ts` + `boardServer.sitemap.entries` | `/ai`、`/finance`，`priority=0.8`、`changefreq=hourly` |
| `/llms.txt` | `publication/llms.ts` + `boardServer.llms().pages` | 两行板块页说明 |
| `/feed/category/<key>.xml` | `apps/api/src/routes/feeds.ts` | 10 个细分类各一份；**暂无板块级合成 feed** |
| `/api/board/*` | `modules/board/server.ts` | web SSR 内部接口，`robots.txt` 的 `Disallow: /api/` 覆盖它（预期） |
| `/api/v1/*`、`/api/mcp` | 引擎 | 公开只读出口 |

---

## 7. 提交与推送纪律

1. 定制只走 `site/`、`industry/`、`modules/`，避免上游合并冲突。
2. 只用免费数据源（RSS + external），付费源一律不碰；`COLLECT_ENABLED=false` 时记得正文 worker 也会停。
3. 每完成一批单独 `git commit`；commit message 描述「改了什么、为什么」。
4. `git push` **需本人确认**，并显式列出 deferred items。当前 10 个本地 commit 尚未 push。
5. 敏感凭证由本人本地填 `.env`，AI 不代填、不经聊天传递；`terms.md` / `privacy.md` 正文须本人确认。

---

## 8. Deferred items 收口

5 项顺延事项的**根因、方案对比、逐步命令、验收标准**全部在 `docs/deferred-items.md`。这里只留执行顺序与门禁：

| 顺序 | 项 | 门禁 |
|---|---|---|
| P0-1 | 全量 web/DB 测试走 CI（先补 CI 两个缺口） | 需本人确认是否动 `.github/`、是否 push |
| P0-2 | 反哺正文免抓 | 影响 09:15 自动化时效，优先修 |
| P1-1 | `terms.md` / `privacy.md` 正文 | **须本人提供运营主体 / 联系方式并确认全文** |
| P1-2 | 板块级合成 RSS | 依赖模块路由改造，不改核心代码 |
| P2 | 批次 4 品牌素材 | 需本人确认视觉；二维码 / 公众号导流按「自用」定位不做 |

---

## 9. CI 与全量测试

仓库已有 `.github/workflows/check.yml`（`Check`），在 GitHub-hosted runner 上已具备本机缺的两样东西：

- `postgresql-client-17`（`pg_dump` / `pg_restore`）
- `npx playwright install --with-deps chromium webkit`

它会跑 `npm ci` → 迁移安全 → `typecheck` → web build → **`npm run test:web`** → **`npm test`** → smoke → `docker compose` 起站。

**但当前直接 push 有两个真实缺口**（详见 `docs/deferred-items.md` 第 5 项）：

1. `docker-compose.yml` 的 `rag-net: external: true` 在干净 runner 上不存在 → `docker` job 起站失败；
2. workflow **没有跑 `npm run test:standalone`**（`npm test` 只收 `tests/*.test.ts` 与 `modules/*/tests/*.test.ts`，不含 `*.standalone.test.ts`），244 个 standalone 测试在 CI 里是空跑。

修完这两处再 push；CI 绿后把结果回填 `docs/plan-ai-finance.md` 13.9 与 `docs/e2e-verification.md`。本机只适合跑 `test:standalone`（244/244，需临时放宽超时后还原）与 DB 组的一部分，**web 组不要在本机反复消耗时间**。

---

## 附：常用命令

```bash
# 巡检
PATH=/usr/local/bin:$PATH node scripts/smoke.ts --base http://localhost:3000
docker compose exec -T db psql -U aihot -d aihot -Atc "select count(*) from publications;"

# 校验
PATH=/usr/local/bin:$PATH npm run typecheck; echo "TSC_EXIT=$?"
PATH=/usr/local/bin:$PATH node --import ./tests/standalone.ts --test modules/board/tests/boards.standalone.test.ts

# 机器出口
curl -fsS http://localhost:3000/llms.txt | head -40
curl -fsSI http://localhost:3000/feed/ai.xml

# 日志
docker compose logs -f worker
```
