# 定制方案：AI × 金融 双板块热点站

> 状态：**4 项已拍板（第 10 节），进入分批实施**。批次 1 已开始：`site/site.ts` 已改，行业包与模块待做；每批单独提交。
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

**硬约束（必须写进设计）**：网页板块页的过滤是「单个 `p.category`」。因此要么只设 **2 个主类**（`ai` / `finance`），细分靠标签（`?tag=`）和主题页；要么就得自己写模块后端 SQL 合并多类，复杂度显著上升。**本方案选 2 主类 + 标签细分**。

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
| `site/public/` | `robots.txt`、`manifest.webmanifest`、`openapi-v1.json` 占位符；`{{categories}}` 会自动换成两个分类 key |
| `site/changelog.json` | 替换 2026-10-01 示例为真实上线记录 |
| `site/brand/` | Logo / favicon / 报头 `nameplates/` 重新生成（`node scripts/nameplates.ts package`）；`ABOUT.maker` 的公众号二维码 |
| `modules/board/`（仅 B 方案） | `package.json`、`module.ts`（`/ai`、`/finance` + `redirects`）、`web.tsx`（侧栏两项 + 「我的」两行）、`ai.tsx` / `finance.tsx`（SSR loader 读 `/api/site/timeline?category=…`，复用 `@aihot/web/features/feed/Timeline`）、`tests/` |
| `site/modules/{index,server,web}.ts`、`site/package.json`、`Dockerfile` | 登记模块；Dockerfile 照其他包加一行 `COPY modules/board/package.json modules/board/` |
| `tests/` | 把用 AI 示例写的断言（分类、标签、公司如 `ai-models` / Anthropic）换成新行业对应项；**测的规则本身不改** |

### P2 — 上线与运营

- `SITE.icp` / `psb` / `github`、`ACCESS.ratePerMinute`（前置反代真的限流才填）、`POLICY.*` 的 license/headers。
- 手机底栏现为 4 个 tab（精选 / 热点 / 日报 / 我的），模块 `tabs` 会插在「我的」前；**再塞 2 个板块会变 6 个**。建议桌面侧栏 + 「我的」页放板块入口，手机端不硬塞（或隐藏 `/hot`、`/topics` 腾位，但要接受损失入口）。
- 与现有自动化集成、盘峰采集节流、公众号导流（见下）。

---

## 5. 信源与既有自动化集成（免费源原则）

框架六种信源：`rss`、`web_list`、`json_list`、`x_search`（SocialData **付费**）、`mp_account`（极致了 **付费**）、`external`（外部推送）。**本方案只开前三种 + external**，付费的 X / 公众号 / Jina / Embedding 全部不配，预算熔断保持默认。

| 板块 | 建议源（免费、公开） | 分级 / 形态 |
|---|---|---|
| AI | OpenAI / DeepMind / Anthropic / Hugging Face / GitHub AI 官方博客；TechCrunch AI、The Verge AI、Ars Technica、MIT Tech Review、Import AI、Simon Willison | T1 官方 / T2 媒体个人，`rss` |
| 金融 | 新华社财经、证监会与沪深交易所公告（网页列表）、央行 / 统计局、东方财富公告与快讯、腾讯财经、天天基金公告 | T1 一手 / T2 媒体，`rss` + `web_list` + `json_list` |
| 复用 | 现有「AI 与财经每日要闻（融合）」自动化把已采到的条目经 `POST /api/ingest/items` 推进站（`kind: external`，`INGEST_TOKEN`） | 不重复抓取、不新增付费依赖 |

注意：中文网页发布时间常不带时区，按信源时区读（默认 `+08:00`）；`CST` 按北京时间。海外 AI 源若在大陆服务器上抓，需 `EGRESS_PROXY_URL`。开盘时段（09:30 / 13:00）把金融源的 `interval_minutes` 调大或用后台暂停，避免盘峰打满免费源；模型侧用后台「付费请求上限」做熔断，`COLLECT_ENABLED` / `MODEL_CALLS_ENABLED` 在调界面时设 `false`。

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
| **变现路径** | ⚠️ **仍缺，三项缺一不可**。用户本轮只确认了痛点与目标用户，未给变现路径。候选：公众号「枫泽观潮」导流 → 付费订阅日报 / 会员 API / 行业日报代交付；或作为小程序内容后端。实施前需补一句确认，否则按规则应降级为「自用」 |
| **目标用户** | **AI 爱好者 + A 股投资者 + 美股观察**（用户 2026-11-05 确认） |

> 按你自己的立项规则：若「变现路径」不落地，这个项目就只是自用分析仪。建议在 P0 拍板时一并定下收费入口，再动 `site/`。

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
- 美股信源**必须显式声明信源时区（America/New_York）**：中文网页常不带时区，不声明会把日报 24 小时窗口算错（AGENTS.md 明确要求按信源时区读，默认 +08:00）。
- 若后续做行情展示，遵守 A 股/美股惯例差异：中国境内涨红跌绿，¥ 为默认货币符号。

### 10.1 实施批次（incremental verify-then-commit，每批单独提交）

| 批次 | 内容 | 验收 |
|---|---|---|
| 0（本轮） | 决策落盘；`npm ci` + `npm run typecheck` 建立**未改代码前**的基线 | 基线通过，后续失败可归因 |
| 1 | 站点身份 + 行业包：`site/site.ts`、`industry/taxonomy.ts`、`prompts/`（structure / content-understanding / selection-score 三份联动）、`selection.ts`、`topics.json`、`wording.ts`；替换 `tests/` 里的 AI 例子 | `typecheck`；`npm test`（`_test` 库 + CREATEDB） |
| 2 | 信源与集成：`industry/sources.json`（标准套餐、全免费）、`external` 推送契约、美股时区、盘峰节流、`site/public/` 四个文件占位符 | `docker compose up -d --build` + `smoke.ts --base http://localhost:3000` |
| 3 | 模块双页面：`modules/board/` 的 `package.json` / `module.ts` / `web.tsx` / `ai.tsx` / `finance.tsx` / `tests/`；三份清单、`site/package.json`、Dockerfile 一行 | `build -w @aihot/web` + `test:web`；浏览器核对侧栏、手机底栏、返回链接、面包屑 |
| 4 | 品牌与上线：Logo / 报头重生成 / 二维码 / changelog；SelectBench 门槛校准；公众号导流 | 首页、两板块页、日报、主题页、关于页逐页核对；`eval-selection.ts` 报告 |

每批完成后单独 `git commit`（描述性 message）；`git push` 前需你确认并显式列出 deferred items。

### 10.2 仍缺、实施前需补一句

1. **变现路径**（立项三项缺一不可，当前只有痛点与目标用户）；
2. `site/pages/terms.md` / `privacy.md` 的**正文内容**（AGENTS.md 要求本人确认，不能由我代写）。
