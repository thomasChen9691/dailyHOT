# 2026-11-09 交接：RSS 信源策展、额度治理与宏观扩展待办

> 交接范围：本日 13:35–22:01 的完整会话（信源调研 → 精简 → 代理修复 → 额度治理 → 参考产品对比 → 宏观扩展预研）。
> 本文只写通用结构与结论，不含本机路径、宿主端口、凭据或个人信息。站点为自用练手，未对外发布。

---

## 0. 一页速览

| 项 | 当前值 |
|---|---|
| 信源 | **23 启用 / 16 停用 / 共 39**；`industry/sources.json` 与 DB 一致 |
| 站点 | health 200；`/ai` + `/finance` 双板块；日报 09:30 出刊 |
| 额度 | 近 24h **537 条入库 → 2892 次模型请求（≈5.4 次/条）≈ 1218 万 tokens**；**50 次 429 `free-models-per-day`**，已耗尽 |
| 产出效率 | 509 publications / 233 ≥40 / 22 ≥76 / **21 selected** |
| 仓库 | `main` ahead `origin/main` **19 笔未 push**（含本会话 4 笔）；工作区有一个与本任务无关的未跟踪 handoff 文件，勿动 |
| 本会话提交 | `218518e` → `3d29013` → `3c8cc9d` → `997ec25`（均未 push） |
| 本轮（22:01） | **只做分析 + 写本文档，未改任何信源配置 / DB / 代码** |

**最重要的 5 条结论**
1. 429 是 **OpenRouter 账号级「每日免费请求数」**，按日重置，换模型/渠道绕不开；唯一解是**减少入库条目数**，降 `interval` 无效（抓取不调模型）。
2. 真正烧钱的是**逐条重 LLM 链**：每条约 5.4 次调用，46% 条目 <40 分连浏览出口都进不去，钱已先花。
3. `tier=EXCLUDE_MP` **不省额度**（只影响入选/日报）；能跳过分析链的只有 `participation_mode=hot_signal` 与采集阶段的 `ingestNoiseFilter`。
4. 采集调度是 `WHERE enabled`（`collect.ts:520`），所以 `UPDATE sources SET enabled=false` **立即生效、无需 rebuild**；但 `sources.json` 里改字段对已存在源不生效（seed 是 `ON CONFLICT DO NOTHING`），改 `feedUrl` 必须单独改 DB + 清 cursor/configHash + 复位 health。
5. 参考产品（2 家通讯社、规则化热度、轻加工）与本站（23 源、重 LLM）精选产出量级相当（15 vs 21 条），**加工成本差约两个数量级**。

---

## 1. 项目定位与硬约束（勿擅自升级）

- 站名 **枫泽观潮**；AI × 金融双板块，一份按 `CATEGORIES.section` 分节的融合日报。
- 立项三项：**命中痛点=搞钱**、**目标用户=AI 爱好者 + A 股投资者 + 美股观察**、**变现路径=暂无（自用 / 练手）**。首要目标是把端到端链路跑通，不对外宣称变现、不做付费功能。
- **只用免费数据源**，付费源一律不碰；反哺走 `./up ingest`，CSV 全量留痕。
- 定制只走 `site/`、`industry/`、`modules/`，**不动 `apps/`、`packages/` 核心代码**（避免上游合并冲突）。
- 译文/正文：用户 11-07 拍板「只显示英文原文、不翻译」⇒ `TRANSLATE_ENABLED=false`；`site_fulltext=false`（开正文会顺带开翻译）。
- 协作偏好：**先给方案、确认后再改代码**；结论先行 → 对比表格 → 推理；每完成一批单独 `git commit`；**`git push` 前必须用户确认并显式列出 deferred items**。
- 校验统一加 `PATH=/usr/local/bin:$PATH`（node v24）；校验退出码以 `tsc` 真实 `$?` 为准，别被 `tail` 掩盖。

---

## 2. 本会话决策时间线

| 时间 | 决策 / 动作 | 产出 | commit |
|---|---|---|---|
| 13:35 | 基线：health 200、工作区干净、ahead 15 | — | `fd47e13` 之前 |
| 15:10–16:10 | 调研 `top-rss-list`（357 条）：与现有源域名零重合；四层去重保证不重复上版，但中英文转述会各跑一遍 LLM；结论＝整包降质涨本，建议白名单试点 | 方案，未改代码 | — |
| 16:10–16:29 | 按「中文/英文/金融/科技/AI/商业/官方」过滤 → 124 唯一源；发现清单是中文泛订阅热度榜（英文薄、AI 仅 2 条代理、官方 35/36 代理） | `/tmp/fengze-rss-unique.csv` | — |
| 16:29–16:35 | 收敛到 10 个高知名度；对比现有 31 源，确认零重合、互补中文短板 | `/tmp/fengze-rss-top10.csv` | — |
| 16:40 | 只读探活推翻两个 URL：WSJ 中文不通、**36氪必须带 www**（无 www 是反爬页）；虎嗅八卦稿重 | `/tmp/fengze-rss-final5.csv` | — |
| 17:05 | 追问「为何没有中国官方/澎湃/财富中文网/腾讯新闻」→ 承认「代理不可用」理由错误（12 个 plink 源 11 个 200）；落盘 4 个中文源 + `./up rebuild` | 雪球/36氪/钛媒体/美团技术 | `218518e` |
| 17:30 | 接原生官方源：央行 RSS（伪装 .html）、证监会 web_list、上交所 web_list；深交所因 JS 模板 + 3048 条/9 天不接 | 3 个 T1 源，实体 `pboc`/`csrc`/`sse` | `3d29013` |
| 18:10 | 魔粒 17h 耗尽 → 定稿 **25/14**；修容器代理（Node v24 需 `NODE_USE_ENV_PROXY=1`）；只 recreate api/worker，不 rebuild | 25 启用 / 14 停用 | `3c8cc9d` |
| 21:10 | 额度再次耗尽（近 24h 2892 次请求、50 次 429）→ 用户选 A 档，但只停用 2 个源；`sec-press` 与 P2 三个保留 | **23 启用 / 16 停用** | `997ec25` |
| 21:55 | 对比「源头快讯 / 源头原文」产品：信源极窄 + 规则化元数据 + 轻加工 | 分析，未改代码 | — |
| 22:01 | 宏观·地缘·贸易·政策扩展预研（只读探活）+ 本交接文档 | 本文 | 本文档单独提交 |

---

## 3. 当前状态快照

### 3.1 信源（23 启用）

- **中文 / 一手官方（8）**：`external-fengze-daily`(反哺, T1_5)、`rss-pbc-news`(T1)、`web-csrc-news`(T1)、`web-sse-news`(T1)、`rss-chinanews-finance`、`rss-xueqiu-topic`、`rss-tmtpost`、`rss-meituan-tech`
- **英文 AI 官方（6）**：`rss-openai-news`、`rss-google-deepmind`、`rss-google-research`、`rss-nvidia-blog`、`rss-microsoft-research`、`rss-mistral`（以上 T1）
- **英文 AI 媒体（3）**：`rss-techcrunch-ai`、`rss-the-decoder`、`rss-the-verge-ai`
- **英文金融 / 官方（6）**：`rss-cnbc-top-news`、`rss-cnbc-finance`、`rss-cnbc-economy`、`rss-yahoo-finance`、`rss-fed-monetary`(T1)、`rss-sec-press`(T1)

### 3.2 停用 16（配置原地保留 `enabled:false`，可恢复）

`rss-36kr`、`rss-marketwatch-bulletins`（21:10 追加）；以及 18:10 的 14 个：
`rss-bair`、`rss-github-ai`、`rss-ars-technica-ai`、`rss-mit-tech-review-ai`、`rss-investing-news`、`rss-sec-edgar-8k`、`rss-cnbc-earnings`、`rss-hugging-face`、`rss-import-ai`、`rss-fed-all`、`rss-marketwatch-pulse`、`rss-simon-willison`、`rss-latent-space`、`rss-aws-ml`。

**恢复方法**：把 `sources.json` 中 `enabled` 改回 `true`，并 `UPDATE sources SET enabled=true, next_fetch_at=now() WHERE id IN (...)`。仅改 JSON 无效（seed 不 UPDATE）。

### 3.3 运行配置

- `COLLECT_ENABLED=true`、`MODEL_CALLS_ENABLED=true`、`TRANSLATE_ENABLED=false`、`LLM_MAX_CONCURRENCY=2~3`；LLM 走网关侧逻辑模型，链路配置在容器数据卷、不入库。
- 容器出站代理：`docker-compose.yml` 的 `&backend-env` 注入 `NODE_USE_ENV_PROXY` / `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`，**三个代理变量默认空 ⇒ CI 无 `.env` 时零影响**；`NO_PROXY` 必须含 LLM 网关服务名，否则模型调用会被代理劫持。具体地址由本机 `.env` 的 `OUTBOUND_PROXY` 指定（不入库）。
- 站点端口由 `.env` 的 `PORT` + `SITE_URL` 决定，日常启停统一 `./up`（`check` / `rebuild` / `status` / `smoke` / `ingest`）。

---

## 4. 关键技术结论（可复用）

| 主题 | 结论 / 证据 |
|---|---|
| 去重 | `identity_key`(规范化 URL, UNIQUE) → fact 归组 → 发布 seat → 日报按事件；`materials.ts:296 ON CONFLICT (identity_key) DO NOTHING`、`events/merge.ts`。**不会重复上版**，但 URL 不同的中英文转述会各跑一遍 LLM |
| 成本链路 | `score_article` / `prefilter_article` / `structure_article` / `story_digest` / `summarize_article` / `understand_article` / `group_*`；约 5.4 次/条 |
| 省额开关 | `participation_mode=hot_signal` ⇒ `jobs/content.ts:114-118` 置 `processing_state='skipped'`，跳过整条分析链（**内容不上版/不进日报**）；`ingestNoiseFilter.dropMarkersTitleOnly` / `denyCategories` ⇒ `sources/filters.ts:15-27` **采集阶段纯字符串匹配、不调模型**，最划算 |
| 无效开关 | `tier=EXCLUDE_MP` 只作用于 `publication/rules.ts:60` 与 `reports/edition.ts:269`（不能入选 / 不进日报），评分链路照跑；`interval` 降频不省 LLM |
| 配置合法性 | `sources/config-keys.ts` 的 `assertSupportedConfig` 会拒绝未知 config key；`rss` 支持 `feedUrl`/`denyCategories`/`ingestNoiseFilter`/`itemUrlPrefixRewrite`/`detail` 等；`web_list` 支持 `url`/`itemSelector`/`allowUrlPrefixes`；`json_list` 支持 `method`/`bodyJson`/`itemsPath` |
| 官方源采集 | 央行等中国官方域名**没有标准 `/rss.xml`**：央行 RSS 伪装成 `.html`（`<link>` 无协议头，需 `itemUrlPrefixRewrite` 修正；标题截断需 `detail.titleSelector=h2`，但引擎不回写已入库 title）；证监会/上交所走 `web_list` + CSS 选择器 / URL 前缀 |
| 探活纪律 | **必须核对首条日期**，别只看 HTTP 200 与条目数（本次 USTR 200 但首条是 2009 年旧闻；人民网财经等是 2025 旧闻；Google News RSS 302 到 consent 页） |
| 容器出网 | Docker Desktop 里容器经 `host.docker.internal` 回连宿主；**Node v24 的全局 `fetch` 默认不读 `HTTP_PROXY`，必须同时 `NODE_USE_ENV_PROXY=1`**；`failing` 源退避会把 `next_fetch_at` 推到数小时后，代理修好后要单独重置 |

---

## 5. 被推翻 / 修正的结论（勿再引用旧口径）

| 旧结论 | 修正 |
|---|---|
| 「第三方代理本机不可用」 | 错。12 个 plink 源 11 个 200 且内容为当天；正确排除理由是单点依赖 + 二手转述 + 形态偏离 |
| 「WSJ 中文可补权威外媒中文」「36氪 `36kr.com/feed` 可用」 | 错。WSJ 中文 HTTP 000 不通；36氪无 www 是 HTML 反爬页，必须 `www.36kr.com/feed` |
| 「英文极薄 / 补不了 AI」 | 口径错。那是相对中文清单；项目本身英文源与英文 AI 源已饱和，真正缺的是**中文** |
| 「留 `press_all`、并掉 `press_monetary`」 | 数据相反：`fed-all` 零达标/均分 16.7，`fed-monetary` 4/4 达标/均分 65.3 ⇒ 留后者 |
| 「15 分钟高频是烧额度主因」 | 错。抓取只发 HTTP 不调 LLM；成本来自**新入库条目数** |
| 「`EXCLUDE_MP` = 不评分」 | 错，见 §4 |
| 「加回 4 个 failing 源就能用」 | 需先修容器代理；且 `health` 是历史标记，要等下一轮采集成功后自动转 ok |

---

## 6. 参考产品对比（21:55，只分析）

「源头快讯 / 源头原文」（公众号产品）：**信源仅 Bloomberg + Reuters 两家付费通讯社**；快讯 165 条/日、今日头条 15 条，每条带**热度分(45–66) + 地域/主题/重要性/时效标签 + 来源 + 相对时间**；原文 99 条/日、按日分组、TTS 连播 / 全文 / 截图 / 原文。内容偏宏观·地缘·贸易·政策，同一事件只留 1–2 条不同角度。

| 维度 | 对方 | 本站近 24h |
|---|---|---|
| 信源 | 2 家（付费） | 23 个免费源 |
| 日入库 | ~165 快讯 | 509 publications |
| 精选 | 15 条头条 | **21 selected** |
| 模型成本 | 规则打分，近 0 次/条 | **2892 次 ≈ 5.4 次/条** |
| 事件密度 | 同事件 1–2 条 | 最高分前 12 条里 **8 条是「英伟达黄仁勋调查」同一热点簇** |
| 内容结构 | 宏观政策为主 | `finance-view` 占 192/509 (38%)，`ai-models` 仅 1 条 |

**可借鉴**：规则粗筛前置（只对头部动 LLM）、同事件簇限额 1–2 条代表、时效/相对时间标签、双视图分层。
**不可照搬（红线）**：Bloomberg/Reuters 是付费源；中文编译改写与「不翻译」拍板冲突；TTS/截图/付费墙属产品化增值，自用练手阶段不做。

---

## 7. 待办：宏观·地缘·贸易·政策扩展（本轮只分析，**未实施**）

### 7.1 为什么要加

这四类与 AI / 科技 / 金融存在明确传导链，用户已认可：
1. **出口管制 / 稀土 / 关税 → 半导体与 AI 算力链**（GPU 供给、成本、国产替代、科技股估值）
2. **货币政策 / 利率 / PPI·CPI → 流动性与成长股估值**（Fed、ECB、央行、统计局）
3. **地缘 / 能源 / 航运 → 油价与通胀预期 → 美联储路径 → 市场**

现状：这四块只有零星覆盖（央行、证监会、上交所低频；中新网财经偏 A 股；Fed 仅货币政策稿），`finance-policy` 的 guide 也不含关税/贸易/出口管制。

### 7.2 只读探活结果（2026-11-09）

| 候选 | 结果 | 判定 |
|---|---|---|
| WTO `latest_news_e.xml` | 200 / RSS / 10 条 / **首条当天 11-09**（EU 保障措施调查） | ✅ 原生 RSS，贸易/争端，优先 |
| ECB `rss/press.html` | 200 / RSS / 15 条 / 首条 11-07（拉加德访谈） | ✅ 原生 RSS，欧元区货币政策 |
| 国家统计局「最新发布」「数据解读」 | 200 / HTML 栏目 / 含 11-09 日期 / 链接数百 | ✅ 需 `web_list`（复用证监会/上交所经验） |
| `federalreserve.gov/feeds/press_all.xml` | 200 / 20 条 / **无 pubDate** | ⚠️ 已在停用名单且零达标，不恢复 |
| USTR `rss.xml` | 200 但**首条 2009-07-20** | ❌ 旧闻陷阱 |
| BBC Business RSS | 200 / **50 条** / 首条为人物八卦 | ❌ 量大、偏时政、不合「精」 |
| White House `presidential-actions/feed/` | 200 / 11 条 / 偏行政时政 | ❌ 时政敏感 + 噪声，不接 |
| IMF `/en/News/RSS`、BIS、美国财政部、EIA、Reuters 免费 feed、商务部 `/rss.xml` | 403 / 404 / 无原生 RSS | ❌ 无可用原生入口 |

**结论**：免费且合规的可用源集中在 **WTO、ECB、国家统计局**；「地缘」最难免费覆盖（Reuters/Bloomberg 付费，其他偏时政），建议不直接接时政源，改用能源/商品价格或现有市场报道间接覆盖。

### 7.3 落地方式（若日后实施）

1. **分类归属**：不新增 `category` key（上线后不改）。扩 `industry/taxonomy.ts` 中 `finance-policy` 的 guide，把「关税与贸易措施、出口管制、国际组织规则、宏观数据发布」纳入；同步 `industry/prompts/structure.md`（AGENTS.md 要求改分类体系要同步提示词）。`finance-us` 承接油价/汇率异动，`industry` 承接针对 AI 芯片的管制。
2. **实体**：新增 `PUBLISHER_DOMAINS` / `ENTITIES` / `IDENTITY_LEXICON` 时三者 id 必须一致（接央行/证监会时的经验）；`TOPIC_TAGS` 可补「出口管制」「稀土」「关税」。
3. **采集层**：WTO/ECB 用 `kind=rss`；统计局用 `kind=web_list` + `allowUrlPrefixes`（先引擎级 `fromHtml`/`admitListing` 预览，再 `assertSupportedConfig` 校验）。全部 `site_fulltext=false`、`tier=T1`、`interval_minutes=180~360`、`initialBackfillLimit` ≤6。
4. **成本**：三者合计约 15–30 条/日 ≈ 80–160 次 LLM/天（占当前 2892 次的 3–6%）。但**额度已耗尽**，必须**先腾后加**：优先把 `rss-yahoo-finance` 的 `feedUrl` 从 5 个标的减到 2–3 个（预计省 ~900 次/天）；或把 Yahoo / 中新网 降级 `hot_signal`。⚠️ 改已有源 `feedUrl` 必须单独改 DB + 清 cursor/configHash + 复位 health。
5. **分期**：**P0**（前置，非加源）腾额度；**P1** 只试点 WTO + 国家统计局（各代表 `rss` / `web_list` 一条链路），跑 48h 观测 articles/receipts/达标率/429；**P2** 再评估 ECB 与出口管制栏目。
6. **红线**：付费源不碰；不翻译；额度未腾出前不加源；时政敏感源不接；不动 `packages/`。

---

## 8. Deferred items（`git push` 前必须确认并显式列出）

1. **19 笔本地提交未 push**（本会话 4 笔 + 历史 15 笔）；本文档提交后为 20 笔。
2. 工作区未跟踪的 `docs/handoffs/2026-11-09-summary-only-badge-and-3h-reprocess.md` 与本任务无关，**勿加入提交**。
3. P2 三个源（`web-sse-news` / `web-csrc-news` / `rss-nvidia-blog`）建议保留不砍（合计仅 ~25 次请求/天，占 0.9%）。
4. A 档只省 ~13%，**额度大概率仍会提前耗尽**；待办：Yahoo 减标的 / `ingestNoiseFilter` 粗筛 / `hot_signal` 降级三选一。
5. 同事件簇限额 1–2 条代表、规则热度替代逐条 LLM —— 需评估，可能触及 `packages/` 归组逻辑，按约定不动核心代码。
6. `rss-36kr` 是用户曾亲自拍板保留的中文源之一，移除后中文创投/融资视角缺失，日后额度恢复可优先恢复。
7. 央行已入库条目标题仍为 RSS 截断版（引擎不回写 `articles.title`），配置只对后续新条目的详情阶段生效。
8. 深交所本轮不接（静态页是 JS 模板、`annList` 3048 条/9 天），后续若接需 `json_list` + 严格 `publishedAfter`/噪声过滤。
9. 文档分工：`docs/sop.md` 命令手册、`docs/deferred-items.md` 顺延事项、`docs/plan-ai-finance.md` 方案、`docs/e2e-verification.md` 实测、`docs/automation-fallback.md` 配额备用、`docs/handoffs/` 交接。

---

## 9. 常用命令 / 文件索引

```bash
./up check                 # 只读环境自检（project 重名、端口冲突、旧 project 残留）
./up rebuild               # 改 site/industry/modules/Dockerfile 后重建（含 --build --force-recreate，无 down -v）
docker compose -p dailyhot up -d --force-recreate --no-deps api worker   # 只让 env 变更生效，不跑 setup
docker exec -i dailyhot-api-1 sh -c 'psql "$DATABASE_URL" -t -A -F" | " -f -' < /tmp/query.sql
PATH=/usr/local/bin:$PATH npm run typecheck
```

- 信源：`industry/sources.json`（`$comment` 写明停用与恢复方法）、`industry/taxonomy.ts`（分类/标签/实体）、`industry/selection.ts`（`browseFloor=40`）
- 引擎：`packages/backend/src/sources/{collect,rss,web-list,json-list,filters,config-keys,health}.ts`、`content/materials.ts`、`jobs/content.ts`、`publication/`、`reports/edition.ts`
- 部署：`docker-compose.yml`（`&backend-env`）、`.env.example`、`scripts/fengze.mjs`（`./up` 的逻辑）

---

## 10. 下一步建议

1. 先确认是否执行 §7.3 的 **P0 腾额度**（Yahoo 减标的），这是加宏观源的前置条件。
2. 若同意，再按 **P1 只试点 2 个源**（WTO + 国家统计局），48h 观测后决定是否扩到 ECB。
3. `git push` 前请用户确认，并显式列出 §8 全部 deferred items。
