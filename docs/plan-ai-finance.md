# 定制方案：AI × 金融 双板块热点站

> 状态：**4 项已拍板（第 10 节）+ 分类体系修订已确认（第 11 节）+ 立项三项已齐全（第 9 节，变现路径＝暂不变现、自用免费完全版）；批次 1–3 已全部落地**，落地记录见第 12、13 节。当前主线是跑通端到端逻辑；批次 4 的品牌 / 导流类工作按自用定位降级；每批单独提交。全量复跑发现的 **1 处真实回归已修复**（`daily-report-alerts.test.ts` 夹具改为从 `EDITION_TIMES.daily` 派生时钟，提交 `89d3774`，见 13.8）；放宽超时复跑后 `standalone` **244/244 全绿**，其余失败已归因为环境问题（见 13.9）。
> 日期：2026-11-05　｜　基线：`Initial commit`（AIHOT 开源引擎的未定制副本，站名 MyHOT）
> 校验基线：Node 24.22.1 / npm 11.19.1，`npm ci` 298 包；未改代码前 `npm run typecheck` 通过；`npm run build -w @aihot/web` 通过。独立测试需先构建 web；本机 6 并发时 web server 冷启动会撞 15 秒超时，实测单进程启动约 6 秒，故验证时降并发。DB 测试已用独立容器 `dailyhot-test-pg`（127.0.0.1:55432）跑通单文件。

---

## 0. 结论先行

1. **推荐「单站 + 两个独立板块页」**：`/ai`（AI 新闻）、`/finance`（金融新闻），通过框架自带的 `modules/` 插口实现，**不动 `apps/`、`packages/` 任何核心代码**，与上游合并无冲突。
2. **「融合日报」保留一份**：日报按 `CATEGORIES.section` 天然分两节（AI 大事 / 金融市场），这与现有「AI 与财经每日要闻（融合）」自动化的口径一致；RSS、公开 API、MCP、分类订阅按两个分类自动分流。
3. **最大的架构约束**：`industry/` 是**单份**行业包——分类、评分提示词、入选门槛全站共用。AI 与金融「什么算重要」差异很大，只能在一份评分标准里分板块举例，再用 `SELECTION.classes` 按信源类别分别抬门槛；若要求两个板块各自独立校准，只能改成双站部署（成本翻倍，不推荐）。
4. **环境结论修正**：上一轮「本机 Node 不满足」的判断需要更正。机器的 `/usr/local/bin/node` 是 **v24.22.1**（你在 `multiSP/packages/finrag` 看到的就是它），Dockerfile 基础镜像是 `node:24-trixie-slim`，Docker 29.8.2 / OrbStack 守护进程正常 —— **你的判断成立**。只是 WorkBuddy 的工具 shell 把自带的 v22.22.2 插到了 PATH 最前面，所以在我这里 `node -v` 显示 22。用户终端直接跑无需改动；我在执行校验时显式加 `PATH=/usr/local/bin:$PATH` 即可。

---

## 1. 需求理解（含歧义，需确认）

| 项 | 我的理解 | 依据 |
|---|---|---|
| 行业 | AI 新闻 + 金融新闻，同一站点双板块 | 本轮需求 |
| 形态 | 「两个页面展示不同的区域」＝两个独立入口页，分别只看 AI / 只看金融 | 本轮需求（歧义见下） |
| 内容口径 | 一份融合日报（按板块分节），另有两个板块各自的精选流 | 与现有「AI 与财经每日要闻（融合）」自动化一致 |
| 数据源 | **只用免费源**，付费源一律不碰；已有自动化采集结果可复用 | 既定原则 |
| 受众 | **AI 爱好者 + A 股投资者 + 美股观察**（用户 2026-11-05 确认，与公众号「枫泽观潮」一致并扩展美股） | 用户确认 |

**「两个页面」的三种可能解释**（待拍板 #1）：

- (a) 两个独立路径 `/ai`、`/finance` —— 可索引、可对公众号/小程序发链接、**推荐**；
- (b) 同一个首页上下/左右两栏 —— 视觉上最直观，但要改 `apps/web/app/routes/home.tsx`（框架代码），后续合并上游易冲突；
- (c) 两个独立站点/域名 —— 各自完整行业包，评分标准可分别校准，但两份配置、两份模型费用、两份日报。

---

## 2. 框架给「双板块」留下的真实空间（已逐行核对代码）

| 能力 | 代码依据 | 对双板块的意义 |
|---|---|---|
| 网页按分类过滤 | `routes/home.tsx`、`routes/all.tsx` 都读 `?category=`；`publication/items.ts` 的 `categoryCondition` 是 `p.category = 单值` | `/?category=ai` 天然就是「AI 精选页」，零代码可得两个板块页，但**带参数的页面被 `noindex`**（`lib/seo.ts` 的 `hasFeedFilters`），不利于 SEO |
| 公开出口按分类合并 | `publicCategoryCondition` 用 `PUBLIC_CATEGORIES.merge` 把多个类别并成一个公开 key | 公开 API / RSS / MCP 可以把细分类合并成 `ai`、`finance` 两类；**网页侧不合并** |
| 模块可加页面 | `ModuleDeclaration.pages` → `apps/web/app/routes.ts` 尾部拼接 | `/ai`、`/finance` 可做成独立可索引路由 |
| 模块可加导航 | `WebModule.sidebar`（桌面侧栏分组）、`tabs`（手机底栏，插在「我的」前）、`tools`（「我的」页行） | 两个板块可进导航，无需改 `nav.ts` |
| 模块页面可复用引擎组件 | `vite.config.ts` 有别名 `@aihot/web/` → `apps/web/app/` | 板块页可直接用 `Timeline`、`FeedItem` 等，不必重写列表/分页/样式 |
| 日报按 `section` 分节 | `industry/taxonomy.ts` 的 `CATEGORIES[].section` | 一份日报天然分「AI」「金融」两节 |
| 分类 RSS / API / MCP | `/feed/category/<key>.xml`、`/api/v1/items?category=`、`MCP` 的 category 参数 | 两个板块的数据出口天然齐备 |
| 外部推送入口 | `POST /api/ingest/items`（`INGEST_TOKEN`）、`kind: external` | **已有要闻自动化可直接把结果推进站**，不必重复抓取、不引入付费源 |
| 门槛差异化 | `SELECTION.classes`：信源类别 → 门槛下限（后台给信源设类别） | 两个板块可在同一份门槛下做有限区分（如金融资讯号抬到 76，AI 官方博客 60） |

**硬约束（必须写进设计）**：网页板块页的过滤是「单个 `p.category`」。因此要么只设 **2 个主类**（`ai` / `finance`），细分靠标签（`?tag=`）和主题页；要么就得自己写模块后端 SQL 合并多类。~~本方案选 2 主类 + 标签细分~~ → **已修订为「保留细分类 + 模块自带接口按 section 合并」，见第 11 节**。

---

## 3. 三条实现路径对比

| 维度 | A 单站·查询参数板块（MVP） | **B 单站·模块独立页面（推荐）** | C 双站部署 |
|---|---|---|---|
| 两个页面 | `/?category=ai`、`/?category=finance` | `/ai`、`/finance` | 两个域名/端口 |
| 改框架核心代码 | 0 | 0（走模块插口） | 0 |
| 新增代码 | 0 | 模块 5–7 个文件 + 三份清单 + Dockerfile 一行 | 仓库复制两份，配置 ×2 |
| SEO / 对外发链接 | 带参页面 `noindex`，不稳 | 独立路径可索引，适合公众号导流 | 独立域名 |
| 分类粒度 | 2 主类 + 标签 | 2 主类 + 标签 | 各自完整分类 |
| 评分标准 / 门槛 | 全站 1 份 | 全站 1 份 | **各自独立、可分别校准** |
| 日报 | 1 份融合（两节） | 1 份融合（两节） | 2 份 |
| RSS / API / MCP | 按 2 类分流 | 按 2 类分流 | 各自独立 |
| 模型成本 | 1 份 | 1 份 | 2 份 |
| 上游合并 | 无冲突 | 无冲突 | 两份都要跟 |
| 复杂度 / 风险 | 低 | 中 | 高（运维） |

**推荐做法**：A 先跑通内容链路（1 个批次），确认信源与评分口味后升级到 B。升级时模块 `redirects` 可把 `/?category=ai` 等旧链接 301 到 `/ai`，避免已发链接失效。若一开始就要对公众号发链接，直接上 B。
**不推荐 C**，除非你明确要求两个板块各自的评分标准/日报/品牌完全独立。

---

## 4. 改动清单（按 P0 → P1 → P2）

### P0 — 必须由你本人拍板（AGENTS.md 明确不替你决定）

| # | 事项 | 落点 |
|---|---|---|
| 1 | 站名、行业词、MCP 前缀、出刊时间 | `site/site.ts`：`SITE.name`、`subject`、`organization.name`、`crawlerName`、`mcpPrefix`（上线后不改）、`footerNote`（去掉「AIHOT」字样）、`EDITION_TIMES.daily` |
| 2 | 要盯哪些信源 | `industry/sources.json` + 后台「信源」页 |
| 3 | 什么算重要、什么算噪声 | `industry/prompts/selection-score.md`、`prefilter.md` |
| 4 | 分类怎么分 | `industry/taxonomy.ts` 的 `CATEGORIES`（建议 2 主类） |
| 5 | 条款与隐私说明内容 | `site/pages/terms.md`、`privacy.md`（现为「请填写」模板） |

**出刊时间待定**：默认日报 08:00（北京时间），你现有要闻自动化是 09:15 HKT 推送。二者是同一份内容还是各出各的，见待拍板 #4。

### P1 — 方案确认后由我实施

| 文件 | 改动 |
|---|---|
| `industry/taxonomy.ts` | `CATEGORIES` = `ai` / `finance` 两主类（各带 `section`）；`RELEASE`（「最受关注发布」）建议设 `null` 或只给 AI；重设 `PLAIN_TERMS`、`ITEM_TYPES`、`CATEGORY_TAGS`、`TOPIC_TAGS`、`ENTITY_TAGS`、`TAG_SYNONYMS`、`ENTITIES`（AI 厂商 + 金融机构/标的）、`IDENTITY_LEXICON`（**金融尤其要防张冠李戴**：公司名、股票代码、基金名） |
| `industry/prompts/` | `structure.md`、`content-understanding.md`、`selection-score.md` 三份必须同步换例子（改分类/内容类型时）；`rules-domain.md` 补金融术语（A 股、ETF、可转债、北向、贴息…保留规则）；`prefilter.md` 宽召回双板块；`group-*.md` 保持不变 |
| `industry/selection.ts` | 门槛先用默认（T1 60 / T1_5 65 / T2 76）跑，`classes` 换成双板块的信源类别（如 `ai-official`、`fin-flash`）；**正式门槛须用 100–200 条自标注样本经 `scripts/eval-selection.ts` 重新校准**，不凭感觉改数字 |
| `industry/topics.json` | 两组主题：AI（公司 / 方向 / 形态）、金融（市场 / 机构 / 资产类别）；`slug` 上线后不改 |
| `industry/sources.json` | 见下节「信源与集成」 |
| `industry/wording.ts` | 双板块用词表（如「炸裂」「重磅」等夸张说法） |
| `site/site.ts` | 除 P0 外：`description`、`keywords`、`tagline`、`ABOUT.*`、`CARDS.*`、`AGENT.search`、`REPORTS.*`、`ALERTS.*`；`PUBLIC_CATEGORIES` 视是否加细分类再定 |
| `site/public/` | `robots.txt` / `manifest.webmanifest` / `openapi-v1.json` 的 `{{…}}` 由 `apps/api/src/routes/static.ts` **运行时填充**；`{{categories}}` 自动展开为 `PUBLIC_API_CATEGORY_KEYS`（现 10 个）。**三个文件本身无需修改** |
| `site/changelog.json` | 替换 2026-10-01 示例为真实上线记录 |
| `site/brand/` | Logo / favicon / 报头 `nameplates/` 重新生成（`node scripts/nameplates.ts package`）；`ABOUT.maker` 的公众号二维码 |
| `modules/board/`（仅 B 方案，已按第 13 节落地） | `package.json`、`boards.ts`、`module.ts`（`/ai`、`/finance`）、`server.ts`（`/api/board/:board` 按 section 合并多类）、`web.tsx`（桌面侧栏两项 + 「我的」两行，**不加手机 tab**）、`web/ai.tsx` / `web/finance.tsx` / `web/BoardView.tsx`（SSR loader 读模块接口，复用 `DayList` / `Pagination` / `EmptyState`）、`tests/` |
| `site/modules/{index,server,web}.ts`、`site/package.json`、`Dockerfile` | 登记模块；Dockerfile 照其他包加一行 `COPY modules/board/package.json modules/board/` |
| `tests/` | 把用 AI 示例写的断言（分类、标签、公司如 `ai-models` / Anthropic）换成新行业对应项；**测的规则本身不改** |

### P2 — 上线与运营

- `SITE.icp` / `psb` / `github`、`ACCESS.ratePerMinute`（前置反代真的限流才填）、`POLICY.*` 的 license/headers。
- 手机底栏现为 4 个 tab（精选 / 热点 / 日报 / 我的），模块 `tabs` 会插在「我的」前；**再塞 2 个板块会变 6 个**。建议桌面侧栏 + 「我的」页放板块入口，手机端不硬塞（或隐藏 `/hot`、`/topics` 腾位，但要接受损失入口）。
- 与现有自动化集成、盘峰采集节流、公众号导流（见下）。

---

## 5. 信源与既有自动化集成（免费源原则）

框架六种信源：`rss`、`web_list`、`json_list`、`x_search`（SocialData **付费**）、`mp_account`（极致了 **付费**）、`external`（外部推送）。**本站只用 `rss` + `external`**，付费的 X / 公众号 / Jina / Embedding 全部不配，预算熔断保持默认；所有源 `site_fulltext` / `syndicate_fulltext` 全关。

### 5.1 已落地（批次 2，`industry/sources.json` 共 24 源）

| 板块 | 源 | 分级 | 说明 |
|---|---|---|---|
| AI | 18 个示范 RSS（OpenAI / DeepMind / Google Research / Hugging Face / Microsoft Research / NVIDIA / AWS ML / GitHub AI / Mistral / BAIR / The Verge AI / TechCrunch AI / Ars Technica / MIT Tech Review / The Decoder / Simon Willison / Import AI / Latent Space） | T1 官方 + T2 媒体个人 | 全部保留，可在后台精简到约 12 个 |
| 金融 · 官方一手 | `federalreserve.gov/feeds/press_monetary.xml`、`sec.gov/news/pressreleases.rss` | T1 | 已实测 200 可达；`owner_entity_id` = `fed` / `sec`，与 `PUBLISHER_DOMAINS` 一致 |
| 金融 · 媒体 | CNBC Finance (`10000664`)、CNBC Earnings (`15839135`)、MarketWatch MarketPulse | T2 | 已实测 200 可达、各 30 条；刻意避开综合 Top News，减少非金融噪声 |
| A 股 / 中文财经 | `external-fengze-daily`（`kind: external`，`participation_mode: editorial`，`tier: T1_5`，`config: {}`） | T1_5 | 由 09:15 自动化反哺供稿，框架不主动抓取 |

### 5.2 为什么 A 股中文源没有直接预置

2026-11-05 逐个实测，**没有一个是可直接写死选择器的稳定源**：

| 目标 | 实测地址 | 结果 |
|---|---|---|
| 新华社财经 | `xinhuanet.com/fortune/` | 580 字节纯 JS 跳转页，无新闻节点 |
| 证监会 | `csrc.gov.cn/csrc/c100028/common_list.shtml` | 200，但返回 2021 年组织机构页，栏目 ID 不对 |
| 上交所公告 | `sse.com.cn/disclosure/listedinfo/announcement/` | 200，页面注释「获取栏目 id 页」，列表疑似前端渲染 |
| 央行 | `pbc.gov.cn/goutongjiaoliu/113456/113469/index.html` | 200 且含当日日期，服务端渲染；选择器仍需在后台「预览抓取」确认 |
| 东方财富快讯 | `np-listapi.eastmoney.com/.../getNewsByColumns` | 缺必填 `req_trace` 参数，接口约定易变 |
| Anthropic News | `anthropic.com/news/rss.xml` | 404，故未落地（原建议清单里的这一项作废） |

`docs/sources.md` 要求「先预览，再创建」，`web_list` 也不执行 JS。把未经预览的选择器写进 seed 会产生一批抓不到内容的假信源，因此改为：**A 股内容由 `external` 反哺覆盖**（现有自动化已在采集这些源），中文站点留作后台逐个「预览抓取」确认后的可选增强。

### 5.3 反哺契约（`external-fengze-daily`）

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "external-fengze-daily",
  "sourceName": "枫泽观潮 · 每日要闻反哺",
  "items": [
    { "title": "必填", "url": "必填", "publishedAt": "2026-11-05T08:00:00+08:00", "author": "可选" }
  ]
}
```

- `INGEST_TOKEN` 在 `.env` 里本地填写，≥16 位；不设则接口恒 401。**不写进仓库、不经聊天传递**。
- 每次最多 50 条（超了 413）；`docker compose` 下 `INGEST_RATE_LIMIT` 默认 10 次/分钟（429 带 `Retry-After: 60`）。
- **不接受 category / tags**：分类与首标签由站内 `structure.md` 流程生成；条目只有 `title` / `url` / `publishedAt` / `author` / `raw`。
- `publishedAt` 必须传带时区的 ISO 字符串；`raw._aihot.backfill: true` 按历史回灌处理（不进「今天」、不推送）。
- 时间关系：09:15 HKT 推送 → 09:30 出日报，当天新内容当天见报；CSV 全量留痕不动，HTML 仍只展示 ≤50 条最重要的。
- seed 已把该源预置为 `editorial`，推送内容直接进公开页面；**不需要**再去后台改参与方式（运行时自动建源才默认 `isolated`）。

### 5.4 节流与熔断

- `interval_minutes` 只是初值，每天 04:20 会被按近 7 天产出自动调整到 15–180 分钟，**不能用来做盘峰节流**。
- 09:30 / 13:00 盘峰的节流点放在**反哺脚本**：控制推送频次与每批条数；或直接在后台暂停对应信源。
- 模型侧用后台「付费请求上限」熔断；调界面时 `COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false`，飞书与 IndexNow 开关保持关闭。
- `SELECTION.classes` 的 `finFlash 72` / `finCommentary 78` 需在后台给财经快讯、市场评论类信源逐源设置（seed 不写此字段）。

---

## 6. 与现有自动化 / 公众号的关系（待拍板 #4）

| 选项 | 做法 | 影响 |
|---|---|---|
| 取代 | 网站日报取代现有 HTML 要闻；CSV 继续留痕，公众号从 `/api/v1/dailies` 或分类 RSS 取内容 | 一份内容、一个出口，最省维护；需改现有自动化 |
| 并行 | 网站做归档与检索，公众号推送仍走原自动化 | 互不干扰，但两份内容可能口径不一 |
| 反哺 | 现有自动化结果经 `external` 推进入站，网站负责精选/归组/日报 | 复用采集、网站只做加工，**推荐起步方式** |

---

## 7. 验证计划（实施后逐条跑）

```bash
# 用户终端：/usr/local/bin/node = v24.22.1，直接跑
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/dailyhot_test npm test   # 库名须 _test/_ci，账号需 CREATEDB
npm run build -w @aihot/web && npm run test:web
node scripts/smoke.ts --base http://localhost:3000               # 站点起来后
```

- `scripts/smoke.ts` 的 `PAGES` 已加入 `/ai` / `/finance`，`MACHINE` 已加入 `/api/board/ai` / `/api/board/finance`，部署后 smoke 会覆盖两个板块页与接口（见 13.3）。
- WorkBuddy 工具 shell 需 `PATH=/usr/local/bin:$PATH` 前缀，否则会用到注入的 Node 22。
- Docker 路径：`node scripts/init-env.ts --llm-key <key>` → `docker compose up -d --build`（镜像内 Node 24，Postgres 17）。
- 浏览器核对：桌面侧栏、手机底栏、返回链接、「我的」入口、面包屑，以及两个板块页的分页/空态；按 AGENTS.md 要求分别看默认与非默认导航配置。
- 门槛校准：`node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl`，在 SelectBench 里看误判再改提示词。

---

## 8. 待你拍板的 4 件事（2026-11-05 已全部确认，结论见第 10 节）

1. **「两个页面」取哪种解释**：(a) `/ai` + `/finance` 独立页（推荐）／(b) 首页双栏／(c) 双站？
2. **站名与出刊时间**：站名（不得含 AIHOT）、日报 08:00 是否与 09:15 HKT 推送对齐？
3. **信源名单与判定标准**：具体保留哪些 AI 源、加哪些金融免费源；「重要 / 噪声」各给 3–5 个例子（这是评分提示词的核心输入）。
4. **与现有要闻自动化的关系**：取代 / 并行 / 反哺（推荐反哺）？

---

## 9. 立项三项标注（按既定规则）

| 项 | 内容 |
|---|---|
| **命中痛点** | **搞钱**（用户 2026-11-05 明确指定）。**注意**：按当前形态它仍是「内容引擎 / 分析器」，不直接产生增量现金流 |
| **变现路径** | ✅ **已拍板（2026-11-05 补）：暂无，当前明确为「自用 / 练手」**。用户原话要点：免费日报已经太多，先跑通免费日报、积累受众群体，付费功能是以后的事；**当前本机使用是自用的、免费的完全版，仅供个人使用，首要目标是把整体逻辑跑通**。按北极星规则，本项目**不是「现金泵」**，不得对外宣称变现 |
| **目标用户** | **AI 爱好者 + A 股投资者 + 美股观察**（用户 2026-11-05 确认） |

> **立项三项现已齐全**（痛点 / 变现路径 / 目标用户），但变现路径的答案是「暂不变现」。由此调整优先级：P2 的公众号导流、付费订阅、会员 API、小程序分发矩阵全部降级；当前唯一主线是**把端到端逻辑跑通**——本地起站 → 采集 / 反哺 → 精选 → 两个板块页 → 日报。产品定位写作「自用免费完全版」，不写成对外收费产品。

---

## 10. 决策记录（2026-11-05，用户逐项选定）

| 待拍板项 | 用户选择 | 派生配置 |
|---|---|---|
| 页面形态 | **A 独立页** `/ai` + `/finance` | 新建模块 `modules/board/`，走 `ModuleDeclaration.pages` + `WebModule.sidebar/tools`；不动 `apps/`、`packages/`；首页保留融合精选，日报按 `section` 分两节 |
| 站名 | **枫泽观潮** | `SITE.name` / `organization.name` = 枫泽观潮；`mcpPrefix: fengze`（上线后不改）；`crawlerName: FengzeBot/1.0`；`footerNote` 去掉 AIHOT；`subject` 建议 `AI 与财经`；`interfaceVersion` 保持 `4.0.0` |
| 信源与口味 | **标准双板块套餐** | AI 约 12 个免费 RSS；A 股 6 类免费源（新华社/交易所/央行/东财/腾讯财经/天天基金）；美股 SEC EDGAR + 公司 IR + 美联储 + CNBC/MarketWatch RSS；重要/噪声例子见第 5 节表格，写进 `selection-score.md` 与 `prefilter.md` |
| 与自动化关系 + 出刊 | **反哺 + 09:30** | `EDITION_TIMES.daily: "09:30"`（整点/半点合法，承接 09:15 HKT 推送）；weekly `10:00`、monthly `10:30` 不变；现有自动化经 `POST /api/ingest/items`（`kind: external` + `INGEST_TOKEN`）反哺入站；CSV 留痕不动；网站不重复抓取 |

**因目标用户新增「美股观察」而追加的约束**：

- 金融板块标签词表补 `美股`、`A 股`、`美联储`、`财报`、`SEC`、`ETF` 等；`ENTITIES` 补美股头部公司与机构；`IDENTITY_LEXICON` 覆盖股票代码与机构别称，防张冠李戴。
- ~~美股信源必须显式声明信源时区（America/New_York）~~ → **作废**：框架不认 IANA 时区名，只认 `config.publishedAtUtcOffset` 固定 UTC 偏移；实测美联储 / SEC / CNBC / MarketWatch 的 RSS 均自带时区，无需额外设置，固定偏移反而无法跟随美东夏令时（详见 11.2）。
- 若后续做行情展示，遵守 A 股/美股惯例差异：中国境内涨红跌绿，¥ 为默认货币符号。

### 10.1 实施批次（incremental verify-then-commit，每批单独提交）

| 批次 | 内容 | 验收 | 状态 |
|---|---|---|---|
| 0（本轮） | 决策落盘；`npm ci` + `npm run typecheck` 建立**未改代码前**的基线 | 基线通过，后续失败可归因 | ✅ `d2c883e` |
| 1 | 站点身份 + 行业包：`site/site.ts`、`industry/taxonomy.ts`、`prompts/`、`selection.ts`、`topics.json`、`wording.ts`；替换 `tests/` 里的 AI 例子 | `typecheck`；`npm test`（`_test` 库 + CREATEDB） | ✅ `5c12b06` + `6f74f3a`；38/38 DB 测试通过 |
| 2 | 信源与集成：`industry/sources.json`（标准套餐、全免费）、`external` 推送契约、盘峰节流 | 源配置白名单 + `typecheck` | ✅ `810751d`；Docker 起站待本地凭证 |
| 3 | 模块双页面：`modules/board/`、`/api/board/:board`、三份清单、`site/package.json`、Dockerfile、`smoke.ts` 覆盖 | `build -w @aihot/web` + 架构测试 + SSR 200 | ✅ 见第 13 节；`test:web` 全量受本机 15s 启动超时限制 |
| 4 | 品牌与上线：Logo / 报头重生成 / 二维码 / changelog；SelectBench 门槛校准；公众号导流 | 首页、两板块页、日报、主题页、关于页逐页核对；`eval-selection.ts` 报告 | ⏳ 待做 |

每批完成后单独 `git commit`（描述性 message）；`git push` 前需你确认并显式列出 deferred items。

> 原第 2 批验收写的 `site/public/` 四个文件占位符已查证作废（运行时填充），美股时区改为不设固定偏移；详见 12.3。

### 10.2 待补事项（2026-11-05 更新）

1. ~~**变现路径**（立项三项缺一不可）~~ → ✅ 已补齐：当前定位「自用 / 免费完全版，先跑通逻辑，受众起来后再谈付费」，详见第 9 节；
2. `site/pages/terms.md` / `privacy.md` 的**正文内容**（AGENTS.md 要求本人确认，不能由我代写）——**仍缺**；
3. 本地 `.env` 凭证（本人填写）——仍缺，阻塞 Docker 起站与真实 smoke。

---

## 11. 方案修订（2026-11-05 第二次确认，用户逐项选定）

### 11.1 分类体系：改为「保留细分类 + 按 section 分节」

| 项 | 原方案 | **修订后** |
|---|---|---|
| 分类数 | 2 主类 `ai` / `finance` + 标签细分 | **6 个 AI 细分类保持不变 + 新增 4 个金融类 = 10 类** |
| 日报分节 | 2 节 | 2 节：所有 AI 类 `section: "AI 大事"`，金融类 `section: "金融市场"` |
| 板块页数据 | 网页 `?category=ai` 单值过滤 | **模块自带接口** `/api/board/ai`、`/api/board/finance`，一次 SQL 按 section 取多类 |
| 引擎测试 | 需改写 31 个测试文件、约 60 处分类字面量 + 5 份提示词 | **分类 key 一个未改，31 个文件不动**；但 `section` 合并成两节后 `correct.ts` 用 `SECTION_ORDER` 校验冻结报告分节名，需把 `tests/category-corrections.test.ts`、`tests/report-recovery.test.ts` 的示例分节名换成新值（实测 2 个文件、8 处字符串，规则本身未改） |
| 上游合并 | 冲突面大 | 只动 `industry/` 与新增 `modules/`，核心代码不动 |
| 代价 | 筛选栏最干净 | 筛选栏 10 个分类；模块需多写约 50 行只读查询 |

用户选择：**保留细分类（推荐）** + **模块自带接口（推荐）**。

### 11.2 实施前查证到的三处事实修正（原方案写错，以此为准）

1. **`selection_class` 不在 `industry/sources.json`**：`scripts/seed.ts` 的 `SeedSource` 无此字段，写进去会被静默忽略；字段是数据库顶层列，需在后台「信源」页设置（`docs/sources.md:218`）。`SELECTION.classes` 只是可选下限，未分配的信源按 `tier` 门槛走。
2. **信源时区不认 IANA 名**：只认 `config.publishedAtUtcOffset` 的固定 UTC 偏移（`"+08:00"` / `"+00:00"`），详情页可另设 `config.detail.publishedAtUtcOffset`（`packages/backend/src/sources/dates.ts`、`config-keys.ts`）。美股 RSS 通常自带时区，不额外设偏移；若必须设，用 `+00:00` 且注意**固定偏移无法跟随美东夏令时**，需按源逐一核对。原方案第 10 节的 `America/New_York` 作废。
3. **`POST /api/ingest/items` 不接受 category / tags**：请求体只有 `sourceId` / `sourceName` / `items[{title,url,publishedAt,author,raw}]`；分类与标签由站内 `structure.md` 流程生成。鉴权为 `Authorization: Bearer <INGEST_TOKEN>`（≥16 位）。`publishedAt` 固定按 `+00:00` 解析，反哺时须传带时区的 ISO 字符串。自动建源固定 `tier=T2`、`participation_mode=isolated`、间隔 1440 分钟。

### 11.3 修订后的实施批次

| 批次 | 内容 | 状态 |
|---|---|---|
| 1a | `site/site.ts` 站点身份 + 09:30 | ✅ 已提交 `5c12b06` |
| 1b | `industry/taxonomy.ts` 加 4 类 + 金融词表/主体词典；`section` 改两节；`prompts/` 五份联动（prefilter / structure / content-understanding / selection-score / rules-domain）；`selection.ts` 加类别；`topics.json` 金融主题组；`wording.ts` 金融禁用词 | ✅ 已完成：`typecheck` 0 错误，38 个 DB 测试全过 |
| 2 | `sources.json` 免费套餐 + 反哺契约 + 盘峰节流说明；`site/public/` 已查证为运行时填充，无需改 | ✅ 已完成：24 源通过框架配置白名单，`typecheck` 0 错误 |
| 3 | `modules/board/`：`module.ts` / `server.ts`（board 接口）/ `web.tsx` / `web/{ai,finance,BoardView}.tsx` / 清单注册 / Dockerfile / `smoke.ts` | ✅ 已完成，见第 13 节 |
| 4 | 品牌报头、changelog、SelectBench 校准、公众号导流 | 待做 |

验证基线补充：独立测试需先 `npm run build -w @aihot/web`；本机 6 并发时 web 冷启动会撞 `web-server.ts` 的 15 秒超时，验证时降到 1–2 并发。DB 测试容器 `dailyhot-test-pg` 映射 `127.0.0.1:55432`，`DATABASE_URL=postgres://postgres:testpass@127.0.0.1:55432/dailyhot_test`。

---

## 12. 批次 1 落地记录（2026-11-05）

### 12.1 实际交付

- **分类**：10 类（6 个 AI 细分类 key 原样保留 + 新增 `finance-policy` / `finance-a` / `finance-us` / `finance-view`）；`section` 合并为「AI 大事」「金融市场」两节；`RELEASE` 仍指向 `ai-models` +「模型发布」。
- **词表**：`CATEGORY_TAGS` 22 个、`TOPIC_TAGS` 29 个、`ENTITY_TAGS` 23 个，`TAG_SYNONYMS` 补金融近义词；提示词的标签白名单已同步。
- **主体**：`ENTITIES` 28 个（新增 10 个金融机构/龙头）、`IDENTITY_LEXICON` 45 条、`PUBLISHER_DOMAINS` 17 条。**三者的金融 id 统一为无前缀 slug**（`csrc` / `sse` / `szse` / `pboc` / `fed` / `sec` / `tsmc` / `apple` / `tesla` / `broadcom`），与 `topics.json` 的 `entityId` 一致；重复的 `apple` 条目已合并；仅用于防误认、没有主题页的条目用独立 id（`moutai` / `catl` / `innolight` / `stock-code`）。
- **门槛**：保留默认 `T1 60 / T1_5 65 / T2 76`，新增 `finFlash 72` / `finCommentary 78` 两个信源类别下限（**需在后台逐源设置，seed 不写此字段**）。
- **主题**：61 个主题、3 组（公司机构与标的 / 技术方向与市场 / 内容类型）。
- **用词**：`wording.ts` 三条金融禁用规则（荐股口吻、情绪化涨跌词、无来源传闻）。
- **测试夹具**：`category-corrections.test.ts` 改成「AI → 金融」跨板块纠错（验证行为不变：原子修订、不重选、不触发推送、撤销可还原）；`report-recovery.test.ts` 分节名换成「AI 大事」。

### 12.2 校验结果

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 0 错误（Node 24.22.1） |
| 词表一致性脚本 | ✅ 分类 10 / 主体 28 / 身份词条 45 / 主题 61 / 发布域 17；无重复 id、无悬空 entityId、displayTag 全在白名单 |
| DB 测试（6 个受影响文件，1 并发） | ✅ 38/38 通过：`analyze`、`public-categories`、`category-corrections`、`report-recovery`、`selected-card`、`topics` |
| `npm run build -w @aihot/web` | ✅ 通过（批次 1a 已验证） |

### 12.3 实施中新增查证（原方案未覆盖）

1. **`site/public/` 三个文件无需修改**：`robots.txt` / `manifest.webmanifest` / `openapi-v1.json` 的 `{{siteName}}` / `{{siteUrl}}` / `{{dailyTime}}` / `{{categories}}` 等占位符由 `apps/api/src/routes/static.ts` 的 `fillPlaceholders()` 运行时填充；`{{categories}}` 在 JSON 的 `enum` / `examples` 里自动展开为 `PUBLIC_API_CATEGORY_KEYS`。`site.ts` 的 `PUBLIC_CATEGORIES.merge` 为空，10 个分类（含新增 4 个金融类）自动进入公开 API、RSS、MCP 枚举。原方案「四个固定文件占位符要替换」作废。
2. **`interval_minutes` 不能当节流手段**：`packages/backend/src/sources/collect.ts` 每天 04:20 按近 7 天产出自动调整到 15–180 分钟，seed 里的值只是初值。盘峰节流交给 `external` 反哺脚本控速，或用后台暂停信源。
3. **`external` 源可在 seed 里预置并直接设为 `editorial`**：`scripts/seed.ts` 支持 `kind: "external"`，`config: {}` 能通过 `assertSupportedConfig`，`collect.ts` 不会主动抓它。文档所说「自动建源默认不进公开页面」是运行时自动建源的行为，预置源可显式给 `participation_mode: "editorial"`。
4. **`publishedAtUtcOffset` 是 `rss` / `web_list` / `json_list` 的合法配置项**，但只对不带时区的日期生效，且固定偏移无法跟随美东夏令时。已验证 5 个海外金融 RSS 均自带时区，不设置更准确。

### 12.4 批次 2 落地记录

- `industry/sources.json` 从 18 源扩到 **24 源**：保留全部 18 个示范 AI RSS；新增 5 个实测 200 可达的免费金融 RSS（美联储货币政策、SEC 新闻稿、CNBC Finance、CNBC Earnings、MarketWatch MarketPulse）；新增 1 个 `external` 反哺源（`external-fengze-daily`，`editorial` / `T1_5` / `config: {}`）。
- **零付费依赖**：无 `x_search` / `mp_account` / Jina / Embedding；所有源 `site_fulltext` / `syndicate_fulltext` 均为 `false`。
- 校验脚本：24 个源 id 唯一、`unsupportedConfig()` 全部为空、`owner_entity_id` 全部存在于 `ENTITIES`、`typecheck` 0 错误。统计 `rss:23 / external:1`，`T1:12 / T1_5:1 / T2:11`。
- 反哺契约、A 股中文源实测结论、盘峰节流方案写入第 5 节；`site/public/` 已确认无需改动。
- **未做** Docker 起站 + `smoke.ts`：需要 `.env`（`ADMIN_PASSWORD` / `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` 等本地凭证），按约定不代填；留到部署环节由本人执行。

### 12.5 待补事项（2026-11-05 更新）

1. ~~**变现路径**~~ → ✅ 已确认「暂不变现，自用免费完全版，先跑通整体逻辑」，见第 9 节；
2. `site/pages/terms.md` / `privacy.md` 的正文（AGENTS.md 要求本人确认）——仍缺；
3. 本地 `.env` 凭证——仍缺。

---

## 13. 批次 3 落地记录（2026-11-05）：双板块独立页

### 13.1 交付清单

新建 workspace 包 `modules/board/`（9 个文件），`apps/`、`packages/` 核心代码**一行未改**：

| 文件 | 职责 |
|---|---|
| `package.json` | `@aihot/board`，`exports` 暴露 `./module` / `./server` / `./web` 三个插口 |
| `boards.ts` | 两个板块的 `section` / 标题 / 描述；`isBoardKey()` 做运行时白名单校验 |
| `module.ts` | `pages: [{ path: "ai", file: "web/ai.tsx" }, { path: "finance", file: "web/finance.tsx" }]` |
| `server.ts` | `GET /api/board/:board`，`loadBoard()` 按 section 合并多分类的分页只读查询；`sitemap.entries` / `llms.pages` 两个机器出口（见 13.7） |
| `web.tsx` | `sidebar`（桌面侧栏「内容」组两项）+ `tools`（「我的」页两行） |
| `web/ai.tsx` / `web/finance.tsx` | 两个独立 SSR 路由，各自 `loader` / `meta` / `headers` |
| `web/BoardView.tsx` | 共享视图，复用 `DayList` / `Pagination` / `EmptyState` / `beijingTime` |
| `tests/boards.standalone.test.ts` | 3 条守护测试：板块分节必须存在于 `CATEGORIES`、互不重复、无分类漏在两板之外；模块必须登记 `sitemap` / `llms` 出口且覆盖两页 |

注册与构建侧改动：

- `site/modules/{index,server,web}.ts` 三份清单各加入对应模块（保持文档要求的「一处地址、三处登记」）；
- `site/package.json` 加 `"@aihot/board": "*"`，`package-lock.json` 加 workspace + symlink + site 依赖（未改任何第三方版本）；
- `Dockerfile` 在 `npm ci` 前加 `COPY modules/board/package.json modules/board/`，保证 Docker 缓存层能解析新 workspace；
- `scripts/smoke.ts` 的 `PAGES` 加 `/ai` / `/finance`，`MACHINE` 加 `/api/board/ai` / `/api/board/finance`。

### 13.2 关键设计决策

| 决策 | 理由 |
|---|---|
| **模块自带 `/api/board/:board`，不用 `?category=`** | 引擎的 `categoryCondition` 只接单个 `p.category`，且带参页面被 `noindex`。第 11 节确认保留 10 个细分类，必须由模块后端一次 SQL 按 `CATEGORIES[].section` 把 6 个 AI 类 / 4 个金融类分别合并成两页 |
| **查询复用 `publication/` 读取层片段** | `loadBoard()` 直接 import `ITEM_COLUMNS` / `ITEM_FROM` / `browsedCondition()` / `seatHolders()` / `toFeedItemSummary()` / `POOL_*`，与首页精选的可见范围、席位合并、卡片形状完全一致，不另写一份可能漂移的公开条件 |
| **分页上限与引擎对齐** | `POOL_PAGE_SIZE = 40`、`POOL_MAX_PAGES = 50`；后端 clamp、SSR loader clamp、`BoardView` 的「最多 50 页」提示三处一致 |
| **手机底栏不加 2 个 tab** | 默认已有 4 个 tab，再加 2 个会变 6 个；`apps/web/tests/page-width.test.ts` 记录过第五个 tab 挤出屏幕的历史问题。改为桌面侧栏 + 「我的」页 `tools` 入口，页面自身不声明 `tab`，保留读者来的那个 tab |
| **页面文件放 `modules/board/web/` 下** | 模块页面必须位于 `<module>/web/` 才会被 `apps/web/tsconfig.json` 与 `tests/architecture.test.ts` 覆盖；`module.ts` 的 `file: "web/ai.tsx"` 是相对模块目录的路径 |
| **`/api/*` 不进 `apiPaths`** | 引擎的 API 路径表已覆盖 `/api/`，模块只需在 `http(app)` 里挂路由 |
| **SEO 与缓存** | `pageMeta()` 生成标题/描述/canonical/JSON-LD，第 2 页起 `noindex`；`cachedPage(60)` 与首页一致的 60 秒缓存；两个独立路径可直接对公众号/搜索引擎发链接 |

### 13.3 校验结果

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 0 错误（`loadBoard` 导出后、`smoke.ts` 改动后各跑一次，均 `TYPECHECK_EXIT=0`） |
| `npm run build -w @aihot/web` | ✅ 通过，SSR bundle 内含 `api/board/ai` |
| `modules/board/tests/boards.standalone.test.ts` | ✅ 3/3 通过（补出口断言后重跑） |
| `tests/architecture.test.ts` | ✅ 14/14 通过（web 不 import backend、模块间不互相 import、公共读取层等约束未被破坏） |
| 直连测试库执行 `loadBoard()` | ✅ `ai` / `finance` 两条 SQL 均正常返回（`SQL_OK`）；空库场景 `pageCount=1 / total=0` |
| 手工 SSR（Mock API + 真实 web server） | ✅ `/ai`、`/finance` 均 `status=200`，含板块标题与条目 |
| 按 `smoke.ts` 断言条件复验 | ✅ 两页 HTML 含站名「枫泽观潮」（`siteName=true`）；两个接口 `content-type: application/json`；`SMOKE_LIKE_OK` |
| 直连测试库校验机器出口 | ✅ 两页出现在 `loadDiscoveryEntries()` 且 `section=board`、`priority=0.8`；`llmsTxt()` 输出两行板块页链接；`EXITS_OK` |

### 13.4 已知的非代码失败：web server 15 秒启动超时

`apps/web/tests/web-server.ts:84` 的启动超时硬编码为 15 秒。本机在 PyCharm + 多套 Docker 的高负载下，冷启动从基线约 5.9 秒升到 14.4 秒，手工脚本甚至测到 43.2 / 48.0 秒。因此：

- 全量 `test:standalone` / `npm run test:web` 在当前机器负载下仍会报 `web did not start`，**这是环境性能问题，不是模块代码错误**；
- 已用单文件低并发、手工起站（超时放宽到 60/90 秒）绕开该限制完成等价验证；
- `canonical=false` 是手工脚本把 `SITE_URL` 设为 `http://127.0.0.1:0` 导致的字符串不匹配，不影响页面 200 与内容渲染；
- **不改框架超时常量**（避免与上游冲突）；已用「临时放宽 → 复跑 → 还原」取得真实通过数：`standalone` **244/244 全绿**，仓库最终零改动（见 13.9）。

### 13.5 本批未做 / 顺延项

1. Docker 起站 + `node scripts/smoke.ts --base http://localhost:3000`：需要本人本地 `.env`（`ADMIN_PASSWORD` / `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` / `INGEST_TOKEN`），按约定不代填；
2. 全量 `test:web` / 全量 DB `npm test` 仍需在有 **PostgreSQL 客户端（`pg_dump`）** 与正常 Playwright 浏览器的环境（CI 或 Docker 镜像内）复跑；本机已确认缺 `pg_dump`、浏览器组会挂起，结论见 13.9；
3. 浏览器逐项核对桌面侧栏、手机底栏、「我的」入口、分页与空态；`smoke.ts` 只保证 200 与站名，不覆盖视觉；
4. 后台逐源给财经快讯 / 市场评论类信源设置 `finFlash` / `finCommentary` 类别；
5. 批次 4：品牌报头 / favicon / changelog、SelectBench 门槛校准、盘峰节流落到反哺脚本；**二维码 / 公众号导流按「自用免费完全版」定位降级，暂不做**；
6. ~~立项三项中「变现路径」~~ 已拍板（第 9 节）；**`terms.md` / `privacy.md` 正文仍需本人提供**（收口步骤见 `docs/deferred-items.md` 第 1 项）。

> 本节 1–6 项的最终归宿见第 14 节；其中第 1 项（Docker 起站）已于 2026-11-06 完成，实测证据见 `docs/e2e-verification.md`。

### 13.6 提交节奏

- 批次 3 主体已提交 `58368a2`，含 `modules/board/` 全部新文件、`scripts/smoke.ts`、三份清单、`site/package.json`、`Dockerfile`、`package-lock.json`、`docs/plan-ai-finance.md`。
- 13.7 的完工审计修复另起一个 `fix` commit（不 amend，保持「每批单独提交」）。
- `.workbuddy/`（工作区记忆）保持未跟踪，不纳入提交。

### 13.7 完工审计发现：两个机器出口原本漏登记

提交后按「先查出口完整性、再收口」复核，发现两处 smoke 200 检查照不到的遗漏：

| 出口 | 代码依据 | 未登记的后果 | 处理 |
|---|---|---|---|
| `sitemap.xml` | `packages/backend/src/publication/sitemap.ts:110` 的 `loadDiscoveryEntries()` 只硬编码引擎页面，模块页只能经 `serverModules()` 的 `m.sitemap.entries()` 加入；`sectionOf()` 会把模块条目分到 `<module.name>.xml` | `/ai`、`/finance` 只有导航入口、不进站点地图，与方案第 0 节「独立路径可索引、适合导流」的目标不符 | 在 `modules/board/server.ts` 实现 `sitemap.entries`，返回两条 `loc`，`changefreq: hourly`、`priority: 0.8` |
| `llms.txt` | `packages/backend/src/publication/llms.ts:122` 的「网站主要页面」只 `push(...opts.modules.pages)`，模块经 `ServerModule.llms()` 注入 | Agent / 大模型抓不到两个板块页的入口说明 | 实现 `llms()` 返回两行 `- [板块名](绝对地址): 板块描述`，用 `siteUrl()` 生成，与其他行一致 |

补充结论：

- **内容身份不伪造时间**：`revision` 用与首屏同一批可见条目（前 `POOL_PAGE_SIZE = 40` 条）的 `article_id:revision` 聚合 md5，不写 `lastmod`；与 `sitemap.ts` 顶部「集合页用内容身份而非臆造修改时间」的约定一致。空库时 `revision` 为空串，实测正常。
- `robots.txt` 的 `Disallow: /api/` 会盖住 `/api/board/*`，这是**预期**：它是 web SSR 内部调用的接口，不该被爬虫当重复内容抓；`Allow: /api/v1/` 与 `Allow: /api/mcp` 是公开出口的例外。因此不改 `robots.txt`，也不把 `/api/board/*` 写进 `llms.txt` 的公开 API 列表。
- `/api/*` 由 `packages/contracts/src/http-policy.ts` 的 `/^\/api\//` 归给 api 进程，模块无需声明 `apiPaths`（复核确认原判断成立）。
- `boards.standalone.test.ts` 新增第 3 条断言，动态 import `server.ts` 检查 `sitemap` / `llms` 出口存在且覆盖两页；该条冷启动约 18 秒（后端模块图加载），但 standalone 的 `--test-timeout` 是 120 秒，不受 `web-server.ts` 那个 15 秒限制。
- 校验：`typecheck` 0 错误；模块 standalone 3/3 通过；直连测试库 `EXITS_OK`（两页 `section=board` / `priority=0.8`，`llmsTxt()` 输出两行）。

**仍留在 deferred 的出口项**：RSS 只有按分类的 `/feed/category/<key>.xml`（10 个细分类），没有「整个板块」的合成 feed。若后续需要 `/feed/ai.xml` 这类板块订阅，要另做模块级 feed 路由，本批不做。

### 13.8 全量复跑结果（2026-11-05，单并发串行）与发现的一处真实回归

按「低负载复跑全量测试」执行，三组全部用 1 并发串行（负载 4.6–5.7，PyCharm + 6 个 Docker 容器）：

| 组 | 结果 | 失败性质 |
|---|---|---|
| `test:standalone` | 244 tests / **229 pass** / 15 fail | 15 个里 14 个是 `web did not start`（`web-server.ts:84` 的 15 秒），1 个是 `mcp-host.standalone.test.ts:180` 子进程 10 秒被 SIGTERM（`stdout/stderr` 全空，未跑到断言）。**无断言失败** |
| `test:web` | 65 tests / 9 pass / 56 fail | 全部 `web did not start`，无其他错误类型 |
| 全量 DB `npm test`（166 文件） | 单并发跑 43 分钟未跑完，主动停止 | 前段 3 个超时型失败：API 启动 15 秒、子进程 15 秒、1 个 120 秒 `--test-timeout`；**后段发现 `daily-report-alerts.test.ts` 4/4 断言失败，是真实回归**（见下） |

单跑对照：`modules/board/tests/boards.standalone.test.ts` **3/3 通过**；`tests/page-metadata.standalone.test.ts` 单跑**仍**撞 15 秒启动超时（此前低负载时曾单跑通过），说明当前机器即使单文件也扛不住这个硬编码超时。

#### 真实回归（P0，已修复，提交 `89d3774`）

- **现象**：`tests/daily-report-alerts.test.ts` 单跑 4/4 失败，actual 比 expected 少当天那期日报（如 `actual: ["report.daily:2026-10-06"]` vs `expected: [..., "report.daily:2026-10-07"]`），`:expired` / `:recovered` 消息也未出现。
- **根因**：`packages/backend/src/operations/alerts.ts:471` 的逾期判定是 `now >= beijingAt(date, EDITION_TIMES.daily) + 2 * 3600_000`。原 `daily: "08:00"` → 逾期边界 10:00，测试第 9 行 `const at = (date, time = "10:00")` 正好卡在边界；批次 1a 把 `EDITION_TIMES.daily` 改成 **09:30** 后，边界移到 **11:30**，测试里的 09:59 / 10:00 / 10:10 / 10:20 / 10:30 / 12:00 全部落在 2 小时宽限期内，于是「当天日报缺失」的告警不再触发。
- **为什么批次 1 没抓到**：当时只跑了按分类 / 分节名筛出的 6 个「受影响」DB 文件（analyze、public-categories、category-corrections、report-recovery、selected-card、topics），**没有覆盖依赖 `EDITION_TIMES` 的告警 / 排期类测试**。这是筛选口径的漏洞，不是测试框架的问题。
- **影响面**：仅测试夹具与站点配置脱节；线上告警规则本身按 09:30 + 2h 正确工作（11:30 判逾期）。但测试红了就不能算收口。

#### 已实施的修复（只改夹具，规则一行不动）

| # | 动作 | 落点 | 结果 |
|---|---|---|---|
| P0-1 | 从 `EDITION_TIMES.daily` 派生测试时钟：`逾期时间 = 出刊时间 + 120 分钟`；把 `at()` 默认参数与 09:59 / 10:10 / 10:20 / 10:30 / 12:00 等硬编码时刻改成相对偏移（保持原有先后关系） | `tests/daily-report-alerts.test.ts` | ✅ 已做：`clock()` + `GRACE_MINUTES` 派生相对分钟偏移；与出刊无关的深夜 / 凌晨绝对时刻（`"23:30"` / `"00:10"`）保留字符串入参 |
| P0-2 | 单跑该文件 4/4 通过；再单跑 `report-recovery` / `category-corrections` 确认无连带影响 | 测试库 `dailyhot-test-pg` | ✅ 告警 **4/4**、连带 **15/15**；告警日志「缺期从 10 月 1 日 **11:30** 起」确认时钟跟随 09:30 |
| P0-3 | 排查是否还有其他硬编码时刻依赖 08:00：全仓搜 `EDITION_TIMES` / `"HH:MM"` / `beijingAt` / 时间字面量 | `tests/`、`apps/*/tests/` | ✅ **只有这一个测试依赖出刊时刻**；其余时间字符串全是日期解析 / RSS 报文 / ISO 数据夹具，与出刊时间无关 |
| P1 | 把「改 `site/site.ts` 的 `EDITION_TIMES` 必须同步检查告警 / 排期测试」写进交付检查单 | 本文档 + `.workbuddy/memory/MEMORY.md` | ✅ 见下方「交付检查单」 |

**同时修掉一处编译错误**：完工审计新增的第 3 条守护断言写成 `server.llms?.().pages`，但接口签名是 `() => LlmsLines | Promise<LlmsLines>`，`tsc` 报 `TS2339` / `TS7006`；改为 `(await server.llms?.())?.pages ?? []`。这是上一批 `c9ad8a9` 带入的，**此前误报 typecheck 通过**——后台任务的 shell 退出码取的是最后一条 `tail`，不是 `tsc`。重跑 `npm run typecheck` 确认 **0 错误**。

> 验证汇总：`typecheck` 0 错误；模块守护测试 3/3；告警 4/4；连带 15/15。已单独提交 `89d3774`。

#### 交付检查单（P1，长期生效）

改 `site/site.ts` 的 `EDITION_TIMES` 时，除按分类 / 分节名筛受影响测试外，**必须额外单跑** `tests/daily-report-alerts.test.ts`（告警）、排期相关测试、`report-recovery.test.ts` 与 `category-corrections.test.ts`；测试时钟一律从 `EDITION_TIMES` 派生，不写死 `10:00` 这类与配置耦合的时刻。

#### 环境侧的结论

- 全量连跑时 `web` 冷启动越到后段越慢，15 秒硬编码超时在**单并发**下仍会触发，不只是并发竞争；`page-metadata` 单跑现在也过不了。
- 已按拍板方案采用「临时放宽 → 复跑 → 还原」：`web-server.ts:84` 的 `15_000 → 120_000`、`mcp-host.standalone.test.ts:180` 的 `10000 → 60000`，单并发复跑 standalone + web 两组取真实通过数，**跑完立即还原，仓库最终不留任何改动**。结果见 13.9。

### 13.9 放宽超时后的复跑结果（2026-11-05）

按拍板方案临时放宽 `apps/web/tests/web-server.ts:84` 的 `15_000 → 120_000`、`tests/mcp-host.standalone.test.ts:180` 的 `10000 → 60000`，单并发串行复跑，**跑完已还原，仓库不留改动**（`git diff` 只剩本文档）。

| 组 | 放宽后结果 | 结论 |
|---|---|---|
| `test:standalone` | **244 / 244 通过，0 失败** | 上一轮 15 个失败**全部**是环境超时（14 个 15 秒启动 + 1 个 10 秒子进程），**零断言失败** |
| `test:web` | 跑 3 小时 43 分钟未完成，主动停止；已输出的 2 条均为 Playwright 浏览器布局测试失败 | 本机浏览器环境无法稳定跑完整组，**不能作为代码质量证据** |
| `tests/backup.test.ts`（单跑） | 14 tests / 1 pass / **13 fail**，根因 `Error: spawn pg_dump ENOENT` | **本机没有 PostgreSQL 客户端工具**，纯环境缺失，与本次改动无关；全量 DB 后段那 16 个 5–66 ms 的短耗时失败即此因 |

**web 组暴露的 2 个非超时失败**（未改动任何布局 / 样式，与板块页无关）：

- `a short laptop window keeps several outline entries and can reach the last one`（27 ms）
- `outline keyboard scrolling stays inside its boundary in WebKit`（18 s）

两者都是 outline / 布局类 Playwright 测试，需要正常的无头浏览器与渲染环境；本机当前不具备。

**结论**：环境性失败已全部归因清楚（启动超时 / 缺 `pg_dump` / 浏览器环境），**真实回归只有 `daily-report-alerts` 一处且已修**。全量 `test:web` 与全量 DB `npm test` 仍需在有 PostgreSQL 客户端与正常浏览器的环境（CI 或 Docker 镜像内）复跑，本机不再重复消耗时间。

---

## 14. 收口：SOP 与 deferred items 的归宿（2026-11-06）

本批新增两份文档，把「怎么跑」与「还差什么、怎么补」从方案文档里拆出来，避免继续往本文堆附录：

| 文档 | 职责 |
|---|---|
| `docs/sop.md` | 日常运行 SOP：环境前置、起停、09:15 → 09:30 内容链路、发布检查单、故障速查表、机器出口对照、提交纪律、CI 说明 |
| `docs/deferred-items.md` | 5 项 deferred 的根因、方案对比、逐步命令、验收标准、需本人拍板的输入 |

### 14.1 5 项 deferred 的结论摘要

| # | 项 | 结论 |
|---|---|---|
| 1 | `terms.md` / `privacy.md` 正文 | 卡在**本人提供运营主体 / 联系方式并逐段确认**，非技术阻塞；`POLICY` 的 `license`/`headers`/`covers` 与 `SITE.contactEmail` 是可选联动位点 |
| 2 | 反哺正文免抓 | **不存在「免抓配置」**：`jobs/content.ts:42` 的 `route()` 只看 `body_text` 是否为空。短期让反哺脚本补写 `body_text` + `body_status='ok'` 并重新入队（E2E 已验证），中期用模块级自定义反哺路由固化；不改 `packages/` |
| 3 | 板块级合成 RSS | 在 `modules/board/server.ts` 的 `http(app)` 加 `/feed/ai.xml` / `/feed/finance.xml`，复用 `loadBoard()` 与 `escapeXml`/`siteUrl`，登记 `llms().ways`；`robots.txt` / sitemap 不用改 |
| 4 | 批次 4 品牌素材 | 先改 `changelog.json`（事实）；图标**同名覆盖**零代码；报头字标必须重跑 `scripts/nameplates.ts` 并同步 `nameplates/index.json`；二维码 / 导流按「自用」定位不做 |
| 5 | 全量 web/DB 测试 | **仓库已有 `.github/workflows/check.yml` 且装齐 `pg_dump` + Playwright**，无需新建 CI；但直接 push 会踩两个真实缺口（见 14.2） |

### 14.2 审计发现：CI 的两个真实缺口

复核 `check.yml` 与 `docker-compose.yml` 后确认，13.9 里「交给 CI 复跑」这句不能直接照做：

| 缺口 | 依据 | 后果 | 处理 |
|---|---|---|---|
| `rag-net` external network | `docker-compose.yml` 底部 `networks: rag-net: external: true`（`96f49f6` 为本机 `new-api` 加入） | 干净 runner 无此网络，`docker` job 的 `docker compose up -d --build` 报 `network rag-net not found` | CI 加幂等一步 `docker network create rag-net 2>/dev/null \|\| true`；或把该网络移到本机专用、不提交的 override |
| 漏跑 standalone 组 | `npm test` 只收 `tests/*.test.ts` 与 `modules/*/tests/*.test.ts`，不含 `*.standalone.test.ts`；workflow 无 `npm run test:standalone` | 13.9 里 244/244 的 standalone 测试（含板块页守护断言）在 CI 里根本没跑 | 在 `Typecheck` 后加 `Standalone tests` 步骤 |

两项都在 `.github/`，改 CI 需本人确认（工程约定：重大动作先确认、push 前显式列 deferred items）。

### 14.3 当前状态

- 10 个本地 commit（`d2c883e` … `96f49f6`）**尚未 push**；`.workbuddy/` 保持未跟踪。
- 站点本机可用：`http://localhost:3000`，4 容器健康，smoke 全过，日报 `daily|2026-11-06` 已落库。
- 本批只写文档，**不改任何代码**；上述 5 项仍为 deferred，按 `docs/deferred-items.md` 的 R0 → R3 顺序收口。
