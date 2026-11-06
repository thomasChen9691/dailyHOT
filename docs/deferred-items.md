# Deferred items · 5 项顺延事项的收口方案

> 本文回答「怎么解决」，**不实施代码改动**。每项给出：代码依据 → 方案对比 → 推荐落地步骤 → 验收命令 → 风险。
> 配套文档：`docs/sop.md`（极简命令手册，`./up` 一键启停）、`docs/plan-ai-finance.md`（方案与历史）、`docs/e2e-verification.md`（本机 Docker 实测）。
> 日常启停一律用 `./up` / `./up down`；启动前自检用 `./up check`，本文命令只在收口具体事项时用。
> 定位不变：**自用 / 免费完全版，不对外变现**，因此凡「导流 / 收费 / 合规对外」的动作一律降级。

---

## 结论先行

| # | Deferred 项 | 最短解决路径 | 是否动 `apps/`、`packages/` 核心 | 需本人拍板 |
|---|---|---|---|---|
| 1 | `terms.md` / `privacy.md` 正文 | 本人给 4 个字段 → AI 出写实草稿 → 本人逐段确认 → 落盘 + 同步 `POLICY` 可选字段 | 否 | **是**（法律文本 + 运营主体 / 联系方式） |
| 2 | 反哺正文免抓配置 | **短期**：反哺脚本 POST 后补写 `body_text` + `body_status='ok'` 并重新入队（零代码，E2E 已验证）；**中期**：模块级自定义反哺路由一次落正文 | 否（推荐路径） | 否 |
| 3 | 板块级合成 RSS | 在 `modules/board/server.ts` 的 `http(app)` 加 `/feed/ai.xml`、`/feed/finance.xml`，复用 `loadBoard()` + `escapeXml`/`siteUrl`，并登记 `llms().ways` | 否 | 否 |
| 4 | 批次 4 品牌素材 | 先改 `changelog.json`（事实，无审美）；再同名覆盖图标；**报头字标必须重跑 `scripts/nameplates.ts`** 并同步 `index.json` | 否 | **是**（视觉确认） |
| 5 | 全量 web/DB 测试 | **仓库已有 CI 且已装齐 `pg_dump` + Playwright**；先补 2 个真实缺口（`rag-net` external network、缺 `test:standalone` 步骤），再 push 触发 `Check` | 否（改 `.github/`） | **是**（是否改 CI、是否 push） |

**最关键的三个发现**（下面逐项展开）：

1. 第 2 项**不需要「配置」也不需改核心**：`route()` 判定只看 `body_text` 是否为空，正文写进去就自然免抓；「免抓配置」这个说法本身是误导。
2. 第 5 项**不需要新建 CI**：`.github/workflows/check.yml` 已经装了 `postgresql-client-17` 和 `chromium webkit`；但直接 push 会因 `docker-compose.yml` 的 `rag-net: external: true` 在干净 runner 上不存在而失败，且 CI 漏跑 244 个 standalone 测试。
3. 第 1、4、5 项都卡在**本人输入 / 授权**，不是技术问题；第 2、3 项可以无人值守直接做完。

---

## 需本人提供的输入（一次性收齐）

| 输入 | 用于 | 不提供时的默认处理 |
|---|---|---|
| 运营主体名称、对外联系方式（邮箱或「仅站内反馈页」）、版本号、生效日期 | 条款正文 4 个占位字段 | **不编造**。AI 只出草稿并保留 `[待本人确认]` 标记 |
| 条款全文逐段确认 | `terms.md` / `privacy.md` 落盘 | 保持上游模板不动，站点继续显示「请填写」 |
| 品牌视觉偏好（字标 / 配色 / 是否用 AI 生成图） | `site/brand/` 覆盖 | 只做 `changelog.json`，图标保持上游默认 |
| 是否允许改 `.github/workflows/check.yml`、是否允许 `git push` | 触发 CI | 本机只跑 standalone + DB 组，web 组结论维持「环境受限」 |

---

## 1. `terms.md` / `privacy.md` 正文

### 现状（代码依据）

- `site/pages/terms.md`、`site/pages/privacy.md` 是**上游模板**，两处表格都留着「版本 / 生效日期 / 运营主体 / 联系方式 = 请填写」；`terms.md` 第 3 节「请写明你允许的用途」、`privacy.md` 第 3 节「请写明你实际使用的服务和保存期限」、第 5 节「请写明联系方式」是明确的待补写段落。
- 页面已挂好（`apps/web/app/routes.ts` 的 `/terms`、`/privacy`），`/llms.txt` 也会列这两页（`publication/llms.ts`）。**不需要动路由**。
- `site/site.ts:86` 的 `POLICY` 里 `terms.covers` / `terms.notes` / `terms.license` / `terms.headers` / `privacy.covers` 全是 `null`；`SITE.contactEmail` 也是 `null`。这些是引擎给的**可选联动位点**，填了会改变 llms.txt 文案、Agent 接入页提醒、以及公开 API / RSS / OpenAPI 的响应头。

### 方案对比

| 方案 | 做法 | 评价 |
|---|---|---|
| **A（推荐）** | 本人给字段 → AI 按本站真实运行情况写「去模板化」草稿 → 本人逐段确认 → 落盘 → 按需填 `POLICY` 可选字段 | 事实准确、不编造主体；符合「正文须本人确认」的约定 |
| B | AI 直接写完整正文并上线 | **禁止**：运营主体、联系方式、日志保存期限属于事实与法律表述，AI 不能代填 |
| C | 保持模板不动 | 站点对外显示「请填写」，自用可接受但随时会忘 |

### 落地步骤

1. 本人给出 4 个字段；其中联系方式允许写「仅通过站内反馈页联系」（不编造邮箱）。
2. AI 据实改写，明确写出本站的实际状态：
   - 自用 / 免费完全版，**无注册登录、无付费功能、无访客统计**；
   - 内容来自 23 个免费 RSS + 09:15 HKT 反哺，摘要由 `new-api` 上的**免费模型**生成；
   - 飞书 / IndexNow 关闭；站点跑在本机 Docker，反向代理 / CDN 日志按使用者自身配置；
   - 浏览器本地数据、反馈资料两张表按上游模板保留（与引擎实际行为一致）；
   - 删除「请填写」「请写明」全部占位，补上「允许的用途 / 需授权用途」和「查询、更正、删除反馈资料的方式」。
3. 本人逐段确认后写入两个 `.md`；再决定是否填 `POLICY.terms.license` / `headers` / `covers`、`SITE.contactEmail`。
4. 验收：

```bash
PATH=/usr/local/bin:$PATH node scripts/smoke.ts --base http://localhost:3000   # /terms、/privacy 200 且含站名
curl -fsS http://localhost:3000/llms.txt | grep -E "terms|privacy|使用规则|隐私"
grep -rn "请填写\|请写明" site/pages/                       # 应无输出
```

### 风险

- 填 `SITE.contactEmail` 会让 `/llms.txt` 多一行「需要授权的对外使用请联系 …」，要一起复核。
- 填 `POLICY.terms.headers` 会给公开 API / RSS / OpenAPI 加响应头，`smoke.ts` 只校验 content-type，建議另跑一次 `node scripts/mcp-check.ts`。
- 备案号（`SITE.icp` / `psb`）当前自用不必填；将来对外上线再补，届时需重新审阅全文。

---

## 2. 反哺正文免抓配置（优先级最高，影响 09:15 自动化时效）

### 现状与精确根因

`packages/backend/src/jobs/content.ts:42` 的 `route()`：

```ts
const whole = readsWhole(row) && (!signal || !historical);
const pending = row.body_status === "pending";
const wantsBody = row.config.fetchPublicContent === true || !!row.config.detail || row.kind === "web_list";
const needsPage = whole && pageFetchable(row.url, row.kind) && (wantsBody || row.bare);
// bare = (coalesce(a.body_text,'') = '' AND a.x_post IS NULL)
return { step: pending && (needsPage || needsXArticle) ? "extract" : "analyze", ... };
```

对 `external-fengze-daily`：`participation_mode='editorial'` ⇒ `whole=true`；`config={}` ⇒ `wantsBody=false`；URL 是普通 https ⇒ `pageFetchable()`（`packages/backend/src/content/extract.ts:509`）为 `true`；而 `packages/backend/src/ingest/items.ts` 的 `ingestItems()` **只把 `items[].raw` 原样交给 `upsertMaterial`，不映射 `bodyText`** ⇒ `body_text` 为空 ⇒ `bare=true` ⇒ 走 `content.extract-body` 去抓原 URL。抓不到要等 `MAX_EXTRACT_FAILURES=3` 次退避才降级到 analyze（实测约 3 × 10 分钟）。

> **结论：没有「免抓开关」可配。** `wantsBody` 只会被配置**打开**，不会被关闭；`pageFetchable` 只看 URL 与 `kind`。唯一让它不抓的条件是 **`body_text` 非空**（`upsertMaterial` 在 `packages/backend/src/content/materials.ts` 中默认 `bodyStatus = m.bodyText ? "ok" : "pending"`，同时 `route()` 的 `bare` 变 false）。所以**「提供正文」本身就是免抓配置**。

### 方案对比

| 方案 | 改动量 | 评价 |
|---|---|---|
| **A 短期（推荐立刻做）** | 反哺自动化后置一步：POST 成功后把每条正文写入 `articles.body_text`、`body_status='ok'`，再调 `queueProcessing()` 重新入队 | **零仓库改动**，E2E 已用 `/tmp/dh-requeue.mjs` 验证这条链路可行。缺点：两段式、脚本要拿 DB 连接、漏跑就退化成 30 分钟延迟 |
| **B 中期（推荐固化）** | 新增 `modules/fengze-ingest/`，在 `http(app)` 挂 `POST /api/ingest/fengze/items`：复用 `credential("auth","INGEST_TOKEN")` 做常量时间校验 → `upsertMaterial({ ..., bodyText, bodyStatus: "ok" })` → `queueProcessing()` | **零核心改动、单段式、可写测试**。要按约定登记 5 处清单（`site/modules/*`、`site/package.json`、`package-lock.json`、`Dockerfile`）。注意不要把 `apps/api/src/routes/ingest.ts` 当依赖 import，模块自己实现 token 校验 |
| C | 改 `packages/backend/src/ingest/items.ts` 增加 `bodyText` 映射（约 3 行） | 效果最干净，但**违反「不动 `packages/`」的定制边界**，上游合并必冲突。若接受「这是 fork 而非定制」再选，并须在方案文档登记这处下游补丁 |
| D | 把反哺 URL 改成 `mp.weixin.qq.com` 之类让 `pageFetchable=false` | **禁止**：污染去重键与原文链接，属欺骗路由 |

### 落地步骤（A，立即可做）

1. 让 09:15 HKT 自动化在输出 CSV 时额外保留一个 `bodyText` 字段（正文或 `raw.text` 的全文化）。
2. POST `{"sourceId":"external-fengze-daily","sourceName":"枫泽观潮 · 每日要闻反哺","items":[...]}` 后，按返回的 URL 集合补写：

```sql
UPDATE articles SET body_text = $1, body_status = 'ok', updated_at = now()
WHERE url = $2 AND coalesce(body_text,'') = '';
-- 不要动 content_hash / revision，避免触发付费重分析
```

3. 用 Node 脚本（`node --env-file-if-exists=.env`）import `queueProcessing` 对这些 `articleId` 重新入队；E2E 用过的脚本形态是 `/tmp/dh-requeue.mjs`，脚本结尾必须 `process.exit()`（postgres 连接池会挂住进程）。
4. 若走 B：模块路由里直接把 `bodyText` 传进 `upsertMaterial`，`ingestItems()` 保持原样给别的调用方用；给模块补一条 standalone 测试断言「新条目 `body_status='ok'` 且队列为 analyze 而非 extract」。

### 验收

```bash
docker compose exec -T db psql -U aihot -d aihot -c \
  "select a.id, a.body_status, length(a.body_text) as body_chars, a.processing_state
   from articles a join sources s on s.id=a.source_id
   where s.id='external-fengze-daily' order by a.discovered_at desc limit 5;"
# 期望：body_status=ok、body_chars>0、processing_state 不是 new
docker compose exec -T db psql -U aihot -d aihot -c \
  "select name, state, count(*) from pgboss.job group by 1,2 order by 1,2;"
# 若 pg-boss 版本的队列表名不同，先 `\dt pgboss.*` 确认再查
# 期望：content.analyze 有 completed，没有长期 created 的 content.extract-body
docker compose logs --tail 100 worker | grep -i "extract\|llm HTTP"   # 期望无重试与 4xx
```

### 附带必须记住的两条

- `.env` 里 `COLLECT_ENABLED=false` 会连带**不注册** `registerExtractionJobs`（`apps/worker/src/main.ts:23`），反哺条目会卡死在 `content.extract-body`。跑内容链路必须 `COLLECT_ENABLED=true`；不想抓外站就临时把 23 个 RSS 源设 `enabled=false`（`setup` 不会覆盖）。
- 别再用 `free-auto`：`LLM_MODEL` 必须固定 `deepseek-v4-pro-0813`（`qwen3.8-27b` 亦可），否则 `temperature=0.2` 会被随机路由模型拒绝。

---

## 3. 板块级合成 RSS

### 现状（代码依据）

- `apps/api/src/routes/feeds.ts` 只注册 `/feed.xml`、`/feed/full.xml`、`/feed/all.xml`、日报/周报/月报、以及 `/feed/category/:file`；`isFeedCategory()`（`packages/backend/src/publication/feeds.ts:210`）只接**单个** `PUBLIC_API_CATEGORY_KEYS`。所以现在是 10 个细分类 feed，**没有** `/feed/ai.xml` / `/feed/finance.xml`。
- `modules/board/server.ts` 的 `loadBoard(key, page, now)` 已经把 6 个 AI 类 / 4 个金融类按 `CATEGORIES[].section` 合成一页，且复用 `browsedCondition()`、`ITEM_COLUMNS`、`toFeedItemSummary()`——**可见范围与板块页完全一致**，是最合适的数据源。
- `packages/contracts/src/http-policy.ts` 把 `/^\/feed(\.xml|\/.*)?$/` 归给 **api 进程**；`ServerModule.http` 在 api 注册且**先于引擎 v1 fallbacks**（`packages/backend/src/modules.ts` 注释），`/feed/ai.xml` 不与 `/feed/category/:file` 冲突，`robots.txt` 也没屏蔽 `/feed/*`。

### 方案对比

| 方案 | 评价 |
|---|---|
| **A（推荐）** | 在 `modules/board/server.ts` 的 `http(app)` 加两个 GET，用 `loadBoard(key, 1, new Date())` 的 `items` 拼 RSS 2.0；复用 `escapeXml()`（`packages/backend/src/lib/text.ts:104`）、`siteUrl()` / `itemUrl()`（`publication/links.ts`），`Cache-Control` 与 `feedCacheControl("selected")` 对齐（300 s），自己用 `createHash` 生成 ETag 并处理 `If-None-Match` → 304。引擎的 `channel()` / `itemXml()` 是私有函数，不导出，所以「拼一个最小 channel」是必要的，但**筛选条件绝不另写一份** |
| B | 改 `apps/api/src/routes/feeds.ts` 让 `itemFeed()` 支持多分类 | 违反定制边界，且会动到公开接口契约，**不推荐** |
| C | 在 `site/public/` 放静态 XML | 内容是动态的，不可行 |

### 落地步骤

1. `modules/board/server.ts`：抽出 `boardRss(key, now)`，用 `loadBoard()` 结果生成 `<channel>`（title / link / description / language / atom:self / ttl 300）与 `<item>`（title、link 指向 `/items/{id}`、description 含摘要与「阅读原文」、guid、`pubDate` 用 `publishedAt`，缺失则不写）。XML 一律 `escapeXml` / CDATA 包裹。
2. `http(app)` 里注册 `/feed/ai.xml`、`/feed/finance.xml`，带 `Content-Type: application/rss+xml; charset=utf-8`、ETag、304、`Cache-Control: public, max-age=300, s-maxage=300, must-revalidate`。空板块返回**合法的空 channel**（不要 404）。
3. `llms()` 增加 `ways` 两行，例如 `- [AI 大事 RSS](http://.../feed/ai.xml): /ai 板块的 40 条最新公开条目，每 30 分钟轮询`。`LlmsLines.ways` 会拼进 `/llms.txt` 的「给 Agent 的接入方式」段。
4. `sitemap` **不用加**（RSS 不是页面）；`robots.txt` **不用改**。
5. `scripts/smoke.ts` 的 `MACHINE` 加 `["/feed/ai.xml", /xml/]`、`["/feed/finance.xml", /xml/]`；模块 standalone 测试加一条「两个路径返回 200 且含板块标题」。

### 验收

```bash
curl -fsSI http://localhost:3000/feed/ai.xml | grep -Ei "HTTP/|content-type|etag|cache-control"
curl -fsS http://localhost:3000/feed/ai.xml | xmllint --noout -      # 若无 xmllint，用 node 解析
curl -fsS http://localhost:3000/llms.txt | grep -E "feed/(ai|finance)\.xml"
PATH=/usr/local/bin:$PATH node scripts/smoke.ts --base http://localhost:3000
```

### 风险

- `loadBoard()` 首屏只有 40 条且按 `POOL_PAGE_SIZE` 截断，与引擎 `itemFeed()` 的「最近 50 条 / 7 天」口径不同——**要在 RSS description 里写明口径**，别让订阅者误以为是全量。
- 不要给 `full` 版板块 feed：内联正文受 `syndicate` / `mayRedistribute()` 限制，本站所有源 `site_fulltext=false`，做全文会踩版权门禁。只做摘要版。

---

## 4. 批次 4 品牌素材

### 现状

`site/brand/` 里 `icon.png` / `favicon.ico` / `icon-192.png` / `apple-icon.png` / `logo.svg` / `nameplates/*.svg` 仍是上游默认；`site/changelog.json` 还是「2026-10-01 网站上线」的模板文案；`SITE.rootIcons=[]`，`site/brand/` 也没有可选的 `wordmark.svg` / `wordmark-dark.svg`；`contact/` 二维码目录不存在。

### 分层落地（按依赖顺序）

| 层 | 动作 | 是否需要审美确认 |
|---|---|---|
| **P0** | 改 `site/changelog.json`：写真实上线记录（2026-11-06，`/ai` + `/finance` 双板块、09:30 日报、09:15 反哺、24 个免费源、机器出口）。`latestVersion` 与 `releases[]` 同步 | **否**，纯事实，可立即做 |
| **P1-a** | **同名覆盖**标准图标（`apps/api/src/routes/static.ts` 按固定文件名服务，覆盖即生效，零代码改动）。素材可用纯 SVG 字标或 AI 生成图 | 是 |
| **P1-b** | **报头字标必须重跑脚本**：`scripts/nameplates.ts` 用 `SITE.subject`（现为「AI 与财经」）生成 `site/brand/nameplates/{daily,weekly,monthly,archive}.svg` 并**同步写 `index.json` 的 viewBox**。用法：`npm pack @fontsource/noto-sans-sc@5.3.0` → 解包 → `PATH=/usr/local/bin:$PATH node scripts/nameplates.ts <解包目录>`。直接手改 SVG 而不同步 `index.json` 会导致日报分享图裁切错位 | 是（字标文案） |
| **P2** | 可选 `wordmark.svg` / `wordmark-dark.svg`；若要新增根目录图标文件名，须把名字加进 `SITE.rootIcons`（`static.ts` 会自动加入服务循环） | 是 |
| **降级不做** | 二维码 / 公众号导流 / ICP 与公安备案 | 按「自用免费完全版」定位，`docs/plan-ai-finance.md` 第 9 节已拍板降级 |

### 验收

```bash
PATH=/usr/local/bin:$PATH node scripts/smoke.ts --base http://localhost:3000   # /og/site.png、/icon.png、/favicon.ico 已在清单
curl -fsS http://localhost:3000/daily | grep -o "枫泽观潮" | head -3
git status --short site/brand site/changelog.json                              # 确认只改这几处
```

浏览器目测：分享图（`og/site.png`）、日报报头、favicon、深浅色下的 Logo。`smoke.ts` 只验 200 与 content-type，不覆盖视觉。

---

## 5. 全量 web / DB 测试（本机缺 `pg_dump`、Playwright 挂起）

### 现状归因（`docs/plan-ai-finance.md` 13.9 已定论）

| 组 | 本机结果 | 性质 |
|---|---|---|
| `test:standalone`（临时放宽超时后） | **244 / 244 全绿** | 真实通过；原先 15 个失败全是 15 s / 10 s 环境超时，零断言失败 |
| `test:web` | 跑 3 h 43 min 未完成，主动停止；已输出 2 条 outline 布局失败 | 本机浏览器环境不稳定，**不能作为代码质量证据** |
| `tests/backup.test.ts` | 13 / 14 失败，`spawn pg_dump ENOENT` | 本机无 PostgreSQL 客户端 |
| 真实回归 | `daily-report-alerts` 一处，已修（`89d3774`） | 已收口 |

### 关键发现：CI 已经具备环境，但直接 push 会踩两个坑

`.github/workflows/check.yml`（`Check`）在 `ubuntu-latest` 上：

- 已装 `postgresql-client-17`（`pg_dump` / `pg_restore`）；
- 已跑 `npx playwright install --with-deps chromium webkit`；
- 已跑 `npm run test:web`、`npm test`、smoke、以及 `docker compose up -d --build`。

**坑 1 — `rag-net` 不存在**：`docker-compose.yml` 底部 `networks: rag-net: external: true` 是为本机访问 `new-api` 加的（`96f49f6`）。干净 runner 上没这个网络，`docker` job 的 `docker compose up -d --build` 会直接报 `network rag-net not found`。

**坑 2 — CI 漏跑 standalone**：`npm test` 只收 `tests/*.test.ts` 与 `modules/*/tests/*.test.ts`，**不含 `*.standalone.test.ts`**；workflow 里也没有 `npm run test:standalone` 步骤。所以那 244 个测试（含 `modules/board/tests/boards.standalone.test.ts` 的守护断言）在 CI 里根本没跑。

### 落地步骤

1. 在 `.github/workflows/check.yml` 的 `docker` job，`Build and start with docker compose` **之前**加一步（幂等）：

```yaml
      - name: Shared model network
        # compose declares rag-net as external for the local new-api container; CI has no such network.
        run: docker network create rag-net 2>/dev/null || true
```

   备选（不改 CI）：把 `rag-net` 从 `docker-compose.yml` 移到本机专用的 `docker-compose.override.yml` 并加入 `.gitignore`——CI 就不会加载它；代价是本机 override 不进版本库，换机器要重建。

2. 在 `check` job 的 `Typecheck` 之后、`Web tests` 之前加一步：

```yaml
      - name: Standalone tests
        run: npm run test:standalone
```

3. 触发：本人确认后 `git push`（**按约定 push 前需显式列出 deferred items**）；或在 GitHub 上用 `workflow_dispatch` 手动跑一次。看 Actions → `Check` → `Web tests` / `Backend tests` / `Standalone tests` / `docker` 四个结果。
4. CI 绿后把数字回填 `docs/plan-ai-finance.md` 13.9 与 `docs/e2e-verification.md`，把本机结论从「环境受限」升级为「CI 已验证」。

### 不想 push 时的本地等价

```bash
# 只补 DB 组（web 组仍不建议本机跑）
brew install libpq
export PATH="$(brew --prefix libpq)/bin:$PATH"
pg_dump --version
PATH=/usr/local/bin:$PATH npm test

# 完整等价：起一个带 pg client + Playwright 的一次性容器，挂载仓库后跑同样的命令
# 镜像需含 node:24、postgresql-client-17、chromium/webkit 及系统依赖；不推荐用 act，
# 因为 check.yml 里的 apt / playwright --with-deps 步骤在 act 镜像上通常不兼容。
```

### 风险与提醒

- CI 的 `Smoke check of the built site` 设 `COLLECT_ENABLED=false` / `MODEL_CALLS_ENABLED=false`，空库 smoke 不反哺，**不受「关闭采集会连带停正文 worker」影响**，不用为它改配置。
- 不要为让本机过测去改 `apps/web/tests/web-server.ts:84` 的 15 秒常量（上游框架文件）；本机的正确做法是「临时放宽 → 复跑 → 还原」，已执行且仓库零残留。
- `check.yml` 属于 `.github/`，改它是合理的 CI 收口，但仍需本人点头（工程约定要求重大动作先确认）。

---

## 建议执行顺序与总验收

| 轮次 | 动作 | 完成判据 |
|---|---|---|
| **R0（无需授权）** | 第 2 项方案 A 接入 09:15 自动化 + 第 4 项 P0 `changelog.json` | 反哺条目 10 分钟内进 `content.analyze`；`/changelog` 显示真实记录 |
| **R1（无需授权）** | 第 2 项方案 B 固化 + 第 3 项板块 RSS | 两处新增模块/路由有守护测试；`smoke.ts` 增加 2 条 RSS 检查；typecheck 0 错误 |
| **R2（需本人）** | 收齐 4 类输入 → 条款正文、品牌素材、CI 补丁 | 条款无占位符且本人已确认；图标与报头目测通过；CI 四个 job 全绿 |
| **R3（需本人）** | `git push` 触发 CI，回填 3 份文档 | Actions 全绿；`docs/plan-ai-finance.md` 13.9 更新为 CI 结论 |

> 每一轮按 `docs/sop.md` 第 4 节走发布检查单，并**单独 commit**；`.workbuddy/` 与 `.env` 不纳入提交。
