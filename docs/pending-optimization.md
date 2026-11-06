# 待优化 · 双项目接入准备（按分层架构修订）

> **状态**：2026-11-06 按「连接器层 + 指针入库 + MCP 服务台」重写；16:11 完成 Step 1 核对，16:17 完成 Step 2 契约补齐与 Step 3 真机响应取样；16:28 同步 15:35–15:57 新基线；**16:40 结论翻转：RSS 确认实施（口径 B 精选席位）**，原因是新增 n8n / 自用小程序 / 公众号三个消费方。本文记录结论、方案与边界；已按本人确认分笔 commit（本地），**未 push**。
> **脱敏**：按「可能随仓库上传」标准书写 —— 不含本机绝对路径、账号、凭证、内网 IP、容器网络名、平台自动化明细。本机实况只保存在本地工作记忆。
> **配套**：`docs/handoffs/2026-11-06-ops-and-first-push.md`（状态快照）、`docs/deferred-items.md`（6 项顺延）、`docs/sop.md`（命令手册）、`docs/plan-ai-finance.md`（方案与历史）。
> **建立**：2026-11-06；**本次修订**：2026-11-06（架构口径变更，见 §0）。

---

## 0. 一句话状态与本次修订原因

站点在本机正常运行；15:35 金融信源扩充后全库 **32 源**（31 RSS + 1 external）、`LLM_MODEL=qwen3.8-27b`；15:57 已 push 到 `915cca5`（`main` = `origin/main`），`Check #3`（run `42183534750`）两个 job 全绿。本次会话完成跨项目审视、契约定稿与**板块 RSS 实现（口径 B）**；文档与代码分笔 commit（本地），**未 push**。

**架构口径已变**：初版按「热点站内容灌进记忆层的 `Doc/Chunk`（`source=dailyhot` / `kind=judgment` / RSS 作入库源）」写；现在改为「**日报是判断、只存指针，用时经 MCP 实时取**」，并新增连接器层（source / channel 两类）、可见性分级、Glean 化前台与 MCP 服务台。因此本文的优先级、字段映射、边界与验收全部重排。

> **本轮回答的三个问题**：日报不存全文；工作台 MCP 插头改工作台侧；记忆层项目解冻但只放行外围（详见 §3）。

---

## 1. 架构对齐：两个项目各自的角色

| 层 | 本站（热点站） | 记忆层项目 | 状态 |
|---|---|---|---|
| 源层 | 日报 / 周报 / 月报、条目、热点；`reports` 表是**唯一权威** | 工作台（22 个 SQLite 只读）、巨潮财报 PDF、新闻（标题 + 导语，不做全文 RAG） | 两侧各自现有且不动 |
| 出站面 | `/api/mcp`（7 个只读工具）、`/api/v1/agent/*`、`/feed/category/:file`、`/openapi-v1.json`、`/llms.txt` | **连接器层**（source / channel 两类、Envelope、visibility 三级 + ceiling 闸门） | 前者现有不动，后者待补 |
| 归一化 | **不参与** | `Doc / Chunk`：数字锚点、`as_of`、报告期、稳定 ID 增量契约 | 现有且不动 |
| 存储 | PostgreSQL `reports(kind, key, window_start, window_end, content, generated_at)` | 只存**指针索引**（kind / key / as_of / url / 摘要 / hash）；**不存日报正文、不进向量库** | 前者权威，后者待补 |
| 对话 | 不参与 | 5 节点薄图 Route → Fetch(SQL) → Retrieve → Verify → Compose | 一行不改 |
| 出口 | 不参与 | 看板（三页 + 对话面板）、**Glean 化前台**、**MCP 服务台** | 前一项不动，后两项待补 |
| 调度 | 出刊时间由 `EDITION_TIMES` 决定 | `daily` 22:17 自动增量 + 冒烟 | 各自现有且不动 |

> **三条要点**：① 日报是「判断」不是「证据」，不能当事实引用；② 撤稿由本站负责（`unavailableIds` 标记），本地副本会变成僵尸引用；③ 09:15 自动化产出的共享目录是「自动化 → 工作台 HTML 展示」的支线，**不是主链路**。

---

## 2. 边界（不动的东西）

- 定制只走 `site/`、`industry/`、`modules/`、`scripts/`、`docs/`、`.github/`、根目录 `up`；**不动 `apps/`、`packages/` 核心代码**。
- 所有公开出口统一从 `packages/backend/src/publication/` 读取层读，新增出口也一样。
- 归一化层 / 对话 / 调度的**现有实现一行不改**；存储与出口同样是「现有能力不改，只新增外围」—— §1 表格里待补的「指针索引」「Glean 化前台」「MCP 服务台」属于**记忆层项目侧的新增**，不是改动本站、也不是改动现有归一化层。
- 只用免费源；自用 / 练手的免费完全版，不得对外宣称导流、收费、会员或付费 API。
- 端口（当前 `3100`）、`INGEST_TOKEN`、旧 `POST /api/ingest/items`、CSV 表头、共享产出目录（只读）**全部不变**。
- 每完成一批单独 `git commit`；任何 `git push` 前需本人确认并显式列出当时 deferred items。
- 校验统一加 `PATH=/usr/local/bin:$PATH`；`tsc` 真实退出码取 `$?` 或 `grep -c "error TS"`，不要经 `tail` 管道读整体退出码。
- 新增模块须登记 `site/modules/server.ts`、`site/package.json`、`package-lock.json`、`Dockerfile`；模块页面放 `modules/<name>/web/`。

**本次新增的四条边界**：

- `SITE.mcpPrefix`（`fengze`）与 `SITE.interfaceVersion`（`4.0.0`）已有接入者，**不得再改**；接口字段含义变了才升主版本。
- `/api/mcp` 保持**匿名、只读、无状态、Streamable HTTP**，返回值带 `untrusted_external_data` 信任标注；不新增需要登录或可写的 MCP 能力。
- **不新增「入库型」出口**：已有分类 RSS / API / MCP 先复用，不为了灌库再造一套。
- **出站内容分级**：`public`（公开条目 / 日报指针）、`internal`（状态元数据）可出站；`private`（持仓 / 评分 / 盘后结论 / thesis）**绝不外发**。安全阀 `FEISHU_*_ENABLED` 等保持默认关闭。

---

## 3. 三个待拍板问题的答复（本轮结论）

| # | 问题 | 结论 | 理由 |
|---|---|---|---|
| 1 | 日报要不要存全文 | **不存**。只存 `kind / key / as_of / url / title / 一句话摘要 / content_hash / visibility`；正文用时经 MCP 实时取；可选短期只读缓存，绝不进向量库 | ① 本站撤稿会让本地全文变僵尸引用；② 推到外部平台属于二次分发，叠加版权 / ToS 风险；③ 日报是判断不是证据；④ 本站已有 `fengze_get_daily` 可实时取。若坚持存全文，须由记忆层项目单独写 ADR 豁免其「不做新闻全文 RAG」规则 |
| 2 | 工作台 MCP 插头改哪边 | **改工作台客户端到标准 MCP**；本站保持不动 | 两边协议与传输双重不兼容（见 §8.4），留着非标准客户端会让每个新连接器都多一层适配；本站是标准 Streamable HTTP，改它等于把一个对的改成错的 |
| 3 | 是否解冻记忆层项目的冻结清单 | **是，但只放行外围**（4 个小零件 + 连接器契约 + Glean 化前台）；其余冻结项保持 | 不解冻则一行代码不能动；且 Glean 化首屏会让看板提问变多，正好把它现有的 `qa_log` 样本判据（≥1/3 来自看板、连续 7 天）变成前台验收指标，两件事互相成就 |

> 支持上述三条结论，本站侧**无需任何代码改动**，所以本轮只修订文档。但若 §5.3 的板块级出口触发条件成立，仍需改 `modules/board/server.ts`（约 110 行）——「无需改动」仅指这三条结论本身，不代表整个接入工程零改动。

---

## 4. 待优化项总表（优先级重排）

| # | 项 | 当前结论 | 优先级 | 状态 |
|---|---|---|---|---|
| A | 板块级摘要出口 | **16:40 结论翻转：确认实施**，口径 **B 精选席位**（`seatedCondition` + 按 section 合并）；n8n / 自用小程序 / 公众号需要单一板块入口 | **P0** | **已实施**，见 §5 |
| B | 跨服务契约文档 | 内容改为**指针 / Envelope 契约**；运行时契约已补齐 | **P0** | **已完成**，见 §7 |
| C | `/api/v1/items` 字段映射 | 只写映射，不改接口；作为结构化备选出口 | P1 | 待拍板 |
| D | 反哺正文免抓 | 内部时效优化，opt-in 默认关闭，与跨项目接入解耦 | **P2** | 见 §6 |
| E | 连接器层实现（另一项目） | **接口预留已定**，实现在记忆层项目；本站不做 | — | 冻结（本站侧） |
| F | 09:15 自动化接线 / 导流 / 变现 | 不做 | — | 冻结 |
| G | **双项目设置核对表** | 文档级，先把两边该有的设置对齐 | **P0** | **文档已完成**（§8.1–8.3）；配置落地待对方解冻 |

### 顺序变更记录

1. **初版**：第 2 项最高优先（影响时效）→ 第 3 项随后。
2. **第一次修正（跨项目审计）**：改为「默认不变 + opt-in」，重点防破坏 CSV、旧接口与共用网关。
3. **第二次修正（按分层架构）**：审视重点从「入站是否断供」转为「出站契约能否被 Doc/Chunk 稳定消费」⇒ A/B 升 P0、D 降 P2。
4. **第三次修正（本次）**：接入方式从「灌进 Doc/Chunk」改为「只存指针 + 实时取」，并新增连接器层与可见性闸门 ⇒ **A 降 P1（先核对再决定做不做）、B 保持 P0 但换内容、G 新增 P0**；D 与接入解耦，维持 P2。

---

## 5. A · 板块级出口（16:40 结论翻转：按口径 B 实施）

**核对时间**：2026-11-06 16:11（结论来自代码依据 + 只读 HTTP 实测）；**结论翻转**：16:40。

> **结论（16:40）**：**实施 `/feed/ai.xml`、`/feed/finance.xml`，口径 B（精选席位）**。原「不做」的前提是「接入面只有 MCP 一个消费方」；16:40 本人新增 n8n（订阅 + 飞书触发）、自用小程序、公众号三个消费方，§5.3 触发条件①成立，前提不再成立。下方 §5.1–5.2 的实测结论**仍然有效**（分类 feed 与板块页不同源），只是用途从「不新增的理由」变成「必须新建板块级出口的理由」。
> 保留决策轨迹：16:28 曾按「不做」入库（`2db5a55`），16:40 以**新增修订 commit** 更正，不改写已提交历史。

### 5.1 五条核对清单（逐条实测）

| # | 清单项 | 结果 | 依据 |
|---|---|---|---|
| 1 | `guid` 稳定、`pubDate` 取原文发布日 | ✅ 成立 | `<guid isPermaLink="false">kopx04bx…</guid>` = article id；`<pubDate>Thu, 05 Nov 2026 17:05:16 GMT</pubDate>` = `published_at` 的 RFC822；`publication/feeds.ts:127-133` |
| 2 | description 只含摘要 + 原文入口、不内联正文 | ✅ 成立 | 实测 CDATA 为「摘要 + 🔗 阅读原文 + via 站内页」，全文无 `content:encoded`；`itemXml()` 的 `includeContent=false` |
| 3 | 40 条滚动窗口 + channel 写明「非全量」 | ❌ **不成立** | 分类 feed 是 **50 条 / 最近 7 天**（`itemFeed()` 的 `LIMIT 50` + 7 天 scope），channel description 写的是「按分类订阅、不被全量精选刷屏」；40 条窗口是**板块页**（`POOL_PAGE_SIZE`） |
| 4 | ETag / 304 / Cache-Control 与既有 feed 一致 | ✅ 成立 | 实测 `W/"rss-…"`、`public, max-age=300, s-maxage=300, must-revalidate`、`application/rss+xml; charset=utf-8`、`Vary`；带 `If-None-Match` 返回 **304**；与 `/feed.xml` 响应头一致 |
| 5 | `llms().ways` 已列出两个板块入口 | ❌ **不成立** | `/llms.txt` 只有 1 行「分类 RSS」示例 + 10 个 slug；`modules/board/server.ts` 的 `llms()` 只返回 `pages`，**无 `ways`**；`/feed/ai.xml`、`/feed/finance.xml` 实测 **404** |

### 5.2 核心问题：分类 feed 能不能覆盖两个板块

**不能，且两者不同源**（这是原 §5「高度重叠」断言的错误所在）：

| 维度 | 现有分类 feed（10 个） | 板块页 / 假想板块 feed |
|---|---|---|
| 可见范围 | `seatedCondition`（精选席位） | `browsedCondition`（公开可见 + `browseFloor=40`） |
| 窗口 | 50 条 / 最近 7 天 | 40 条 / 分页（板块页） |
| 分类口径 | 单分类，10 个独立 feed | 按 `section` 合并 6 个 AI 类 + 4 个金融类 |
| 实测条目 | `ai-models` 2 条 / `finance-a` **0 条** / `finance-view` 11 条 | `/api/board/ai` 40 条（total 95，6 类）、`/api/board/finance` 35 条（total 35，3 类有数据） |
| 消费成本 | 10 个 URL / 10 个 ETag，且消费侧要自己维护「10 key → 2 section」映射 | 2 个 URL |

补充实测：`PUBLIC_CATEGORIES.merge = {}`（`site/site.ts:311-314`），`PUBLIC_API_CATEGORY_KEYS` 因此等于全部 10 个细分类，`/llms.txt` 第 15 行也列出 10 个 slug；`/feed/full/category/:file` 路由**已存在且返回 200**（不是「未启用」），只是本站所有源 `syndicate_fulltext=false`，输出与摘要版等价、不内联正文。

### 5.3 实施口径 B 与机器内可达边界（16:40 本人确认）

**口径 B（精选席位）**：`seatedCondition(now)`（`p.visibility='public' AND p.selected AND p.seat`，`publication/scope.ts:50`）+ `inBoard(board)`（按 `CATEGORIES[].section` 合并），按时间倒序取 40 条。与 `/feed.xml` 同源的「精选」口径 ⇒ **天然是重要条目**，n8n 不必再用 LLM 判分（重判是重复计算 + 多耗共用网关额度 + 不可溯源）。若要数值化的重要程度，用 `/api/v1/items?mode=selected` 的 `score`，RSS 2.0 不带分数。

**实现**：只在现有 `modules/board/server.ts` 加 `renderBoardRss()` 纯函数与 2 个 GET（ETag / 304 / `feedCacheControl("selected")` / `application/rss+xml`），`llms().ways` 两行，`scripts/smoke.ts` 的 `MACHINE` +2，standalone 测试。**不新增模块**（board 已登记清单），复用 `ITEM_COLUMNS` / `ITEM_FROM` / `inBoard()`，**不另写筛选条件**。

**机器内可达边界（本人 16:40：「机器内发送消息，暂不考虑出网，为了安全」）**：

| 项 | 约定 |
|---|---|
| 站点入站 | `SITE_URL` **保持本机回环地址（端口 3100）**；不启用 compose `https` profile、不配公网域名、不改端口绑定；web 仍监听所有接口的 3100 供容器访问，但**不对外暴露** |
| n8n → 站点 | n8n 容器与 web 容器**不在同一 docker 网络**；16:40 实测 `host.docker.internal:3100/api/health` → `200 {"ok":true,"db":"ok"}`，而容器名直连不通 ⇒ RSS 地址固定为 `host.docker.internal:3100/feed/{ai,finance}.xml` |
| 链接策略 | RSS `<link>` 是站内回环地址，推到飞书 / 公众号后**手机点不开** ⇒ 消息模板只用 description 里的「阅读原文」公网链接（RSS 已含），**不带站内链接** |
| 飞书 | n8n 主动 POST webhook 属**出站**单向，不需要站点入站可达；本人确认**只发 `public` 摘要**，不带 `private` / `internal`。站内 `FEISHU_*_ENABLED=false` 不影响站外 n8n 通道 |
| 待校正边界 | 「暂不考虑出网」若指**连飞书 webhook 也不发**，则改为机器内落地（写文件 / 本地通知），不做飞书；公众号内容必须发到微信服务器，属对外分发，与「自用 / 无变现」不冲突但与「不出网」有张力，见 §11 待拍板 |

**小程序 / 公众号（P1–P2，本次不实现）**：自用体验版真机仍需微信 HTTPS 合法域名，本机地址不可用 ⇒ 建议走内容中转（WorkBuddy 推送 / CloudBase / 已生成的 HTML 报告），不让小程序直连 RSS；公众号用 RSS 数据时**只发摘要 + 原文链接、不全文**（`site_fulltext=false`），且不把模型改写摘要当事实引用。

**风险**：① 消费侧按「当前 RSS 全量」替换会删老指针 ⇒ 按 `guid / key` 增量 upsert；② `ways` 追加让固定行后移 ⇒ 按链接解析，不按行号；③ 不做 full 版；④ 40 条滚动窗口须在 channel description 写明「非全量」。

**验收**：`curl -fsSI` 两条（content-type / ETag / Cache-Control）；XML 解析通过、空板块返回合法空 channel；`llms.txt` 含两行；`./up smoke` 全过；从 n8n 容器内 GET 两条 feed 成功；原有 `/feed.xml`、`/feed/all.xml`、`/api/board/*` 内容不变。

---

## 6. D · 反哺正文免抓（P2，后置）

**根因**：`ingestItems()` 不映射 `bodyText` ⇒ `body_text` 空 ⇒ `route()` 判 `bare=true` 走 `content.extract-body` 抓原 URL，抓不到要等 3 × 10 分钟降级。`upsertMaterial` 原生支持 `bodyText` / `bodyStatus`，落 `'ok'` 即 `pending=false` → 直接 `analyze`，不产生 extract job。

| 候选 | 结论 |
|---|---|
| B1 新模块一次落正文（`POST /api/ingest/fengze/items`） | 推荐：单段式、无竞态、可写测试；约 130 行 + 4 处登记 |
| B2 包装 `ingestItems()` + 后置 UPDATE + 重新入队 | 不推荐：首个 extract job 已入队，有竞态 |
| A 脚本 POST 后直连 DB 补写 | 不推荐：两段式、漏跑退化 30 分钟 |
| C 改 `packages/backend/src/ingest/items.ts` | 不推荐：破「不动核心」边界 |

**零影响约束**：

- 旧 `/api/ingest/items` 与 `./up ingest` 默认行为 100% 不变；新增 `--with-body` 才走新路由。
- CSV 列不变；正文由脚本在内存里拼。
- 新路由接受与旧接口相同的 payload + 可选 `bodyText`，返回同样的 `{ok:true,created}`；不覆盖源配置。
- 「仅新建条目写正文」守卫；单条正文上限 4000 字；保留 `MAX_ITEMS=50`。
- 登记 4 处：`site/modules/server.ts`、`site/package.json`、`package-lock.json`、`Dockerfile`。
- standalone 测试不能连 DB ⇒ 拆成纯函数 standalone 测试 + DB 组测试。

**与接入解耦**：无论 D 做不做，记忆层都只取摘要与指针；D 影响的是本站内部摘要时效，**不改变出站契约**。若日后启用，摘要变化会改变指针的 `content_hash`，仍须走「按 key 增量」而非全量替换。

**验收**：真推 1 条 → `body_status=ok`、无长期 created 的 `content.extract-body`；旧接口空 url 冒烟仍 `200 {"ok":true,"created":0}`；`./up ingest --dry-run` 解析条数与改前一致；共享目录文件只读、mtime 不变。

---

## 7. 出站契约：从「Doc 入库映射」改为「指针 / Envelope 映射」

### 7.1 旧映射作废的部分

原 §7 写的是「热点站 → `Doc` 字段」映射（`doc_id = dailyhot:{guid}`、`source=dailyhot`、`kind=judgment`、`doc_hash` 白名单、`meta.metrics` 为空）。**新版不进归一化层、不进向量库，因此以下冲突自动消失**：

- `EVIDENCE_SOURCES = {"news","annual_report"}` 误判问题 —— 不再生成 Doc，不会被当事实引用。
- `doc_hash` 白名单导致「加数据时更新 ≠ 0」—— 不再计算 `doc_hash`。
- `metrics` 只收财务口径（ADR-0010）—— 不再写 `metrics`。

**仍然成立的三条**：① 接入面冻结在摘要级，不做全文；② `as_of` 取原文发布日，不取抓取 / 时间线时间；③ 稳定标识按 `guid / key` 增量 upsert，40 条滚动窗口绝不能全量替换。

### 7.2 新的字段映射表

| Envelope 字段 | 取自 | 禁止 |
|---|---|---|
| `connector` | `dailyhot` | 复用 `news` |
| `kind` | `judgment`（日报 / 周报 / 月报）、`evidence`（公开条目及其原文链接） | 把模型改写摘要标成 `evidence` |
| `direction` | `in`（读取）；未来通道为 `both` | 写回本站 |
| `visibility` | `public`（条目 / 日报指针）、`internal`（状态元数据） | 把持仓 / 评分 / 盘后结论标为可出站 |
| `as_of` | `pubDate` / `publishedAt` 的 `YYYY-MM-DD` | `timelineAt` / `discoveredAt` |
| `payload` | `{kind, key, url, title, summary, content_hash}` 指针 | `body`、full feed、item detail 正文 |
| `citations[]` | **日报级**：`report.links.aihot` + `report.attribution.url`；**条目级**：`sections[].items[].links.aihot` + `.links.original` + `source.name`，或 `flashes[].publishedAt` | 本地副本路径；把日报级 `links` 当成含 `original`（实测只有 `aihot`） |
| `content_hash` | 由 `kind / key / as_of / url / title / summary` 计算 | `score`、热度、窗口位置、`generatedAt` |
| `doc_id` / `doc_hash` / `metrics` | **不产生** | 为了「以后可能用」先造 Doc |

**真机字段形态（Step 3 取样，2026-11-06 16:17）**：`fengze_get_daily` 的 `structuredContent.report` 实测为 `{date, generatedAt, windowStart, windowEnd, links:{aihot}, attribution:{name,url}, lead:{title,leadParagraph}, sections:[], flashes:[]}`。**日报级 `links` 只有 `aihot`，没有 `original`**；`links.original` 只存在于**条目级** `sections[].items[]` / `flashes[]`（`publication/reports.ts:472`、`publication/agent.ts:152-161`）。取样当日期次 `sections=[]`、`flashes=[]`（无展示条目），条目级字段需在含条目的期次上复核。

### 7.3 撤稿语义（Step 2 修正）

**代码事实**：`unavailableIds()`（`publication/reports.ts:59-66`）查的是 `publications` 里存在、但不再满足 `listedCondition` 的条目；`reports.ts:550,564` 与 `dailyWithNotes`（`:469-476`）用它在渲染时**剔除**这些条目的标题 / 摘要 / 引用，不是「打标记后展示」。库里根本不存在的 id 仍按已发布引用。

**因此上一版推论不成立**：撤稿**不会**让日报 `key`（`YYYY-MM-DD`）或日报 URL 失效，指针仍有效；变化的是 `structuredContent.report.sections[].items[]` 被剔除 ⇒ `content_hash` 变化。「只存指针 + 实时取」的真正价值是：**每次取到的都是已剔除撤稿条目的当前版本**，本地没有可残留的旧正文，而不是「指针失效」。

**契约要求**：消费侧按 `key` 增量 upsert，允许 `content_hash` 变化触发「更新」，绝不因窗口滚动或撤稿删除指针；`generatedAt` 不能当内容版本（报告未重新生成时它不变），版本判断只用 `content_hash`。复核节奏见 §7.4。

### 7.4 运行时契约（Step 2 补齐，Step 3 真机验证）

**取样方式**：对运行中的站点发 `POST <base>/api/mcp`，请求头 `content-type: application/json`、`accept: application/json, text/event-stream`；无状态，无需 session。

| 主题 | 约定 | 依据 |
|---|---|---|
| 握手 | `initialize` 返回 `protocolVersion: 2025-06-18`、`serverInfo.name = fengze`、`version = 4.0.0`、`tools.listChanged = false`；消费侧必须校验 name 与 version | 真机响应；`routes/mcp.ts:121-124` |
| 传输 | 响应是 SSE `event: message` + `data: {…}`，消费侧按 SSE 解析；不要求 `Mcp-Session-Id` | 真机响应；`routes/mcp.ts:1` 标注 stateless |
| 返回结构 | `result._meta`（`fengze/contentTrust` = `untrusted_external_data`、`fengze/instructionPolicy`）、`result.content[0].text`（Markdown，内含「不可信外部资料」围栏）、`result.structuredContent`（`schemaVersion: 1` + `report{…}` + `_fengze{contentTrust, instructionPolicy, verificationPolicy}`） | 真机响应；`routes/mcp.ts:44-50` |
| 错误码 | 失败为 `isError: true` + `structuredContent.error.{code,message}`，共 4 个：`invalid_request` / `not_found` / `busy` / `internal_error`；不回传内部异常文本 | `routes/mcp.ts:53-72,186,200-202` |
| 超时降级 | 客户端按 `DAILYHOT_TIMEOUT_S` 超时后**只给指针 + 链接**，标注「正文暂不可用」，**不编造内容**、不把围栏内文本当事实 | §8.2 配置 |
| 幂等 / 重试 | 工具标注 `readOnlyHint` + `idempotentHint`；服务端 `cachedByKey` 30 秒缓存；同参重试安全，退避后最多重试 2 次；`busy` 单独退避，不换日期冒充 | `routes/mcp.ts:43,107-114` |
| visibility ceiling | 闸门在**记忆层连接器出站前**，按 `Envelope.visibility` 程序化过滤并记日志；`private` 一律不发，**不交给模型判断**。本站 MCP 匿名只读，本身不持有 `private` 数据 | §2 / §8.3 |
| 版本兼容 | 消费侧同时校验 `serverInfo.version`（接口）与 `structuredContent.schemaVersion`（内容结构）；任一不认识即降级为「只给指针」 | 真机响应 |
| 轮询 / 撤稿复核 | 按 `key` 增量 upsert；每日至少一次按 `key` 复核 `content_hash`，变化即更新指针（不删）；**不做全量替换** | §7.3 / §8.2 |

---

## 8. 双项目设置核对表（P0，文档级，先做）

### 8.1 本站保持不动的设置

| 设置 | 位置 | 为什么不能改 |
|---|---|---|
| `SITE.mcpPrefix = fengze` | `site/site.ts` | 已有接入者，工具名全靠它 |
| `SITE.interfaceVersion = 4.0.0` | `site/site.ts` | 只升不降；字段含义变了才升主版本 |
| 7 个 `fengze_*` 工具 | `packages/contracts/src/mcp.ts` | 服务台的工具清单按此对齐 |
| `/api/mcp` 匿名只读无状态 + trust 标注 | `apps/api/src/routes/mcp.ts` | 消费侧把返回内容当不可信外部数据 |
| `/api/v1/agent/*`、`/openapi-v1.json`、`/llms.txt` | `apps/api/src/routes/agent.ts` 等 | Agent 自描述入口，改了会让客户端失联 |
| `reports(kind, key, window_start, window_end, content, generated_at)` | `database/migrations/` | 指针的 `key` 来源（daily `YYYY-MM-DD`、weekly `YYYY-Www`、monthly `YYYY-MM`） |
| `PUBLIC_CATEGORIES.merge` + `publicCategoryCondition` | `site/site.ts`、`publication/items.ts` | API / RSS / MCP 的统一分类口径 |
| 安全阀**仓库默认**关闭（`FEISHU_*_ENABLED` 等）；本机 `.env` 实况为 `COLLECT_ENABLED=true` / `MODEL_CALLS_ENABLED=true` / `LLM_MODEL=qwen3.8-27b` | `.env.example` / 本机 `.env`（不入库） | 出站默认不开；排障时别把「仓库默认」当「本机实况」 |
| `SITE_URL` 派生端口（当前 `3100`） | `.env`、`./up ports` 台账 | 反哺地址与 smoke 都从它派生，不写死 |

### 8.2 记忆层项目需新增的设置（**待其解冻后实施，本文不改**）

| 键 / 条目 | 用途 | 落点与验收 |
|---|---|---|
| `DAILYHOT_ENABLED` | 总开关，默认 `false` | 不配也能跑，主链路零影响 |
| `DAILYHOT_BASE_URL` | 站点根地址，由其 `SITE_URL` 派生 | 不写死端口；变更时只改一处 |
| `DAILYHOT_MCP_URL` | 指向 `/api/mcp` | 握手返回 `fengze` 才算通 |
| `DAILYHOT_TIMEOUT_S` | 实时取正文的超时 | 超时降级为「只给指针 + 链接」，不编内容 |
| `connectors.yaml` 的 `dailyhot` 条目 | `kind=source`、`direction=in`、`visibility_ceiling=public`、`store=pointer` | 加数据时「更新 = 删除 = 0」仍成立 |
| 以上键写进 `.env.example` | 键名与说明，不放真实值 | 只允许在 `src/config.py` 读，`load_dotenv(override=True)` |

> 该项目当前冻结清单只允许「攒真实问答样本」，因此这批配置属于**解冻后的第 2 步**，本轮不动它的代码。

**增量验收例外（Step 2 补）**：`connectors.yaml` 那行「加数据时更新 = 删除 = 0」必须限定为**纯新增日**。日报是「判断」类内容，撤稿 / 修订会让同一 `key` 的 `content_hash` 变化 ⇒ 这些日期允许 `更新 > 0`，但 `删除` 必须为 0（指针不删、不重建，`as_of` 与 `key` 不变）。建议判据写成：`新增 ≥ 0 且 删除 = 0 且 更新数 == 当日 content_hash 变化数`。否则记忆层实施时会把正常的内容修订误判为「增量契约被破坏」。

### 8.3 互通判据（Step 3 改为逐条可复跑）

| # | 判据 | 复跑方式 | 期望 |
|---|---|---|---|
| 1 | 本站 MCP 握手身份 | `./up smoke`；或 `POST <base>/api/mcp` 发 `initialize`（`2025-06-18`） | `serverInfo.name = fengze`、`version = 4.0.0`；smoke 的 initialize 检查通过 |
| 2 | 日报实时取、只落指针 | `tools/call` → `fengze_get_daily`（不传 date） | 拿到 `content[0].text` Markdown + `structuredContent.report`；本地只写 `{kind,key,as_of,url,title,summary,content_hash,visibility}`，无正文字段 |
| 3 | 引用回指本站 | 检查答案 `citations[]` 与指针 `url` | 指向 `report.links.aihot` / `report.attribution.url` 或条目 `links.original`；**无本地副本路径** |
| 4 | 撤稿无残留（Step 2 修正） | 选一期含条目的日报，撤下其中一条后按**同一 `key`** 再取 | `key` 不变、`content_hash` 变化、答案不再引用该条；指针**不失效**、不删除；本地无旧正文 |
| 5 | private 程序化拦截 | 在连接器层构造 `visibility=private` 的 Envelope 走出站 | 出站前被 ceiling 拦截并记日志，模型未参与判断；`public` 正常放行 |

> 判据 1–3 可用 §7.4 的真机取样命令直接复跑（本站侧已具备）；4–5 属记忆层侧，待其解冻后实施。

### 8.4 协议不兼容记录（必须写清，别让两边直连）

| 项 | 本站 MCP | 工作台现有客户端 | 结论 |
|---|---|---|---|
| 协议版本 | smoke 握手用 `2025-06-18` | 客户端写死 `2024-11-05` | 不兼容 |
| 传输 | Streamable HTTP | stdio + Content-Length 帧（非标准 MCP 帧） | 不兼容 |
| 角色 | 匿名只读 server | 只调外部行情的 client，每次调用新建子进程 | 工作台**不能直接连本站** |

⇒ 统一走记忆层的 MCP 服务台；工作台客户端升级到标准 MCP 是另一项目的第 4 步，本站不为此改任何东西。

---

## 9. 跨项目影响矩阵

| 改动点 | 获取 | 保存 | 调用 | 归一化语义 |
|---|---|---|---|---|
| `./up ingest` 默认切新路由 | 未来接线会变 | — | 外部脚本行为变 | — |
| CSV 加 `bodyText` 列 | 破坏历史 CSV 契约 | — | — | — |
| 正文写 `articles.body_text` | — | 独立 PG，无跨项目直连 | 共用网关额度 | 摘要变化 → 指针 `content_hash` 变化 |
| `body_status='ok'` 跳过 extract | — | — | 原 URL 不再抓正文 | 若灌全文会违反「不做全文 RAG」 |
| 新增两个板块 feed 别名 | — | — | 纯新增出口 | guid 稳定、摘要级 |
| `llms().ways` 追加 | — | — | 按行号解析会错位 | — |
| **日报只存指针** | 用时实时取 | 不进向量库 | 依赖 `/api/mcp` 可用性 | 不产生 Doc，无 `doc_hash` |
| **MCP 协议 / 传输差异** | 本站标准 HTTP | 工作台非标准 stdio | 必须经服务台中转 | — |
| **出站 visibility 闸门** | — | — | 未来通道按级放行 | private 一律不发 |

**五条硬约束**：① 只加不换；② 默认不变、新能力 opt-in；③ 出站契约显式冻结；④ 热点站对共享目录只读、绝不写回；⑤ 出站按 `visibility` 分级，`private` 绝不外发。

---

## 10. 验收清单（实施时逐条）

- `npm run typecheck`（取真实退出码）、`npm run test:standalone`、DB 组测试。
- `./up rebuild` → `./up check` → `./up smoke` 全过；`./up ports` 与其它服务端口无冲突。
- 回归：真实 CSV `--dry-run` 解析一致；旧接口零污染冒烟；`/api/board/ai`、`/api/board/finance`、`/feed.xml`、`/feed/all.xml`、`/llms.txt` 原内容不变（仅追加）。
- **MCP 专项**：`/api/mcp initialize` 返回 `fengze`；`tools/list` 仍是 7 个工具；工具返回带 `untrusted_external_data` 标注。
- **契约专项**：记忆层侧按 §8.3 五条逐条验；重点验「撤稿后无正文残留」与「private 被拦截」。
- A 专项：两条 feed 的 HTTP 头 / XML 合法性 / 空板块合法 channel / llms 登记 / **从 n8n 容器内 GET 成功**；原有 `/feed.xml`、`/feed/all.xml`、`/api/board/*` 内容不变。
- D 专项（若启用）：真推 1 条查 `body_status` 与队列；比对单次模型 token 增量。
- 文档：交叉引用存在、脱敏扫描（无绝对路径 / IP / token 值 / 自动化明细）。

---

## 11. 已定与待拍板

### 本轮已定

| 项 | 结论 |
|---|---|
| 前台交互契约是重点（一个框 / 跨源 / 带引用 / 随处可用） | 已确认 |
| 未来会接飞书 / Telegram，需保留连接器能力 | 已确认；但**今天只定接口，不写 adapter** |
| 日报存全文 / 工作台插头 / 是否解冻 | 见 §3，三条均已给结论 |
| 连接器分 `source` / `channel` 两类 + visibility 三级 + ceiling 闸门 | 已定，写入 §7 / §8 |
| A 是否新增板块级别名路由 | **16:40 已翻转：按口径 B 实施**（16:11 曾核对关闭）；分类 feed 与板块页不同源，且 n8n / 自用小程序 / 公众号需要单一板块入口，见 §5.3 |
| B 契约文档是否入库 / commit | **16:28 本人确认：入库并单独 commit（本地）**，不 push；push 前仍须列出 deferred items |
| RSS 是否需要做 / 口径 | **要做，口径 B（精选席位）**；16:40 因 n8n / 自用小程序 / 公众号三个消费方翻转结论，见 §5.3 |
| 机器内可达方式 | **不出网**：`SITE_URL` 保持本机回环地址，n8n 走 `host.docker.internal:3100`；飞书只发 `public` 摘要（本人 16:40 确认） |

### 仍待本人拍板

| # | 问题 | 当前建议 |
|---|---|---|
| 1 | 「暂不考虑出网」的准确边界 | 建议允许 n8n → 飞书 **单向出站**（`public` 摘要）；若连 webhook 也不发，改为机器内落地 |
| 2 | 公众号用 RSS 数据 | 属对外分发，标 P2；只发摘要 + 原文链接、不全文 |
| 3 | 小程序走哪条通道 | 自用体验版建议内容中转，不直连 RSS |
| 4 | C 是否现在写 `/api/v1/items` 映射 | 可后置，MCP 已足够 |
| 5 | D 反哺正文免抓是否启动 | 保持 P2 后置；与接入解耦 |
| 6 | 记忆层项目何时解冻并落地 §8.2 的配置 | 待其状态文档更新后，按第 2 步实施 |
| 7 | 32 篇 `failed` 文章何时重跑 | 等上游免费额度恢复，授权后执行一次 `requeueFailed(null)`，勿空转 |
| 8 | `git push` 时机 | 每步单独 commit；push 前显式列出当时全部 deferred items |

> **Step 2 / Step 3 已完成（16:17）**：§7.3 撤稿语义修正、§7.4 运行时契约（握手 / 传输 / 返回结构 / 4 个错误码 / 超时降级 / 幂等重试 / ceiling 判定位置 / 版本 / 轮询复核）、§8.2 增量验收例外、§8.3 五条可复跑判据、§2 与 §3 措辞收窄，均已回填；真机抓过 `initialize` 与 `fengze_get_daily` 响应并写入 §7.2 / §7.4。
> **剩余只属记忆层项目侧**：其状态文档解冻后落地 §8.2 的 5 个配置键、实现 ceiling 闸门与判据 4–5；本站不做。
> **下一步可选**：Step 4（等对方状态文档更新），或按待拍板 #1 决定契约文档是否入库并单独 commit。

---

## 12. 明确不做

- 本站侧新建 MCP server、入库型出口、写入型动作、连接器层实现；09:15 自动化接线、导流 / 付费 / 会员 / API 变现。
- 全文版板块 feed、把日报正文灌进记忆层的向量库、直连热点站 PostgreSQL（破坏「公开出口统一从 publication 读取层读」+ 引入跨项目 DB 耦合）。
- 改归一化层 / 存储 / 对话 / 看板 / 调度；改 `apps/`、`packages/`；数据卷 `down -v`；仓库里 15 秒测试常量。
- 为了「以后可能用」提前写飞书 / Telegram adapter（`RULES` 反对空转代码）；真要接时，一个平台 = 一个 adapter + 一份契约测试。
