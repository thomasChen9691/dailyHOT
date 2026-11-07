# 会话交接 · 2026-11-07 · 正文显示 + 模型链路改造 + 翻译关闭

> **读者**：下一次接手本仓库的会话 / 协作者。
> **脱敏声明**：本文会随仓库上传，因此**不含**本机绝对路径、账号、凭证、内网 IP、宿主端口、网关 token 名与 ID、平台自动化明细；本机实况只保存在本地工作记忆（不入库）。
> **本文定位**：记录「已落地并验证」的三件事 + 「明确未做」的遗留。**遗留项未获本人拍板前不要自行推进。**
> **同日前一份交接**：`docs/handoffs/2026-11-07-rss-delivery-and-pending.md`（板块 RSS，上午快照，其 §6 待办仍有效）。

---

## 0. 一句话状态

站点 4 容器正常运行、`/ai` `/finance` `/all` 均 200、11-07 日报已按 09:30 出刊；**详情页已能显示正文（英文原文 + 中文标题/AI 导读），自动翻译已关闭且经实测拦截**；模型调用统一走网关侧逻辑模型 `fengze-main` 的优先级降级链，本轮额外加了进程级并发闸门。`main` 领先 `origin/main` **6 笔，均未 push**。

---

## 1. 本轮做了什么

| 批次 | 内容 | 代表提交 |
|---|---|---|
| ① **模型链路改造**（网关侧，不入库） | 引入逻辑模型 `fengze-main`，站点只认一个模型名，由网关按渠道 `priority` 降级；本地记账改为无限制，避免网关自身额度拦截 | 无代码改动（配置在容器数据卷） |
| ② **并发闸门**（`packages/` 下游补丁） | `providers/concurrency.ts` 模块级信号量 + `llm.ts` 的 `chatOnce()` 包限流，由 `LLM_MAX_CONCURRENCY` 控制 | `166f3d9` |
| ③ **正文显示** | 打开启用中源的 `sources.site_fulltext`，并把已有正文的 `publications.body_mode` 回填为 `full`；此前全库 `summary`，所以详情页正文区块整块不渲染 | 无代码改动（DB 数据 + 开关） |
| ④ **关闭自动翻译** | `translatePending()` 增加 `TRANSLATE_ENABLED` 开关，关闭时在候选查询前直接返回 | `163629e` |
| ⑤ **文档收口** | `docs/deferred-items.md` 新增第 7 项；入库上午的 RSS 交接快照 | `163629e`、`ae7a28c` |

---

## 2. 核心机制：一个开关，两件事

这是本轮最重要的一条，**下次要改正文或翻译，先读这一节**。

引擎里「**显示正文**」和「**生成译文**」由同一个字段驱动：

```
sources.site_fulltext = true
        ↓  publication/rules.ts:68
body_mode = (site_fulltext && body_status==='ok' && hasBody) ? "full" : "summary"
        ↓                                          ↓
详情页渲染正文区块                        editorial/translate.ts:373
（detail.ts:127 仅 body_mode==='full'）    translatePending 筛选条件第一行
                                          p.body_mode = 'full'
```

⇒ 为了「显示正文」打开 `site_fulltext`，就**顺带打开了翻译支线**。worker 的 `content.translate` 每 5 分钟跑一次，会把英文正文**逐段原位替换**成中文。

### 2.1 翻译为什么表现为「整页变中文」

1. 主路由 `/items/:id` 调 `loadItemDetail(id, language = "zh")`（`detail.ts:79`，默认值写死 `zh`），原文页是 `/items/:id/original`。
2. `readingBody()`（`detail.ts:63`）只要 `translations` 表有该文章**当前 revision** 的 zh 记录，就 `bodyLanguage = "zh"`；没有译文才回落到原文。
3. 译文是**整块替换**（`translate.ts` 逐 block 替换 HTML 内容后写回 `translations.body_html`），不是并排对照 —— 翻完英文就没了。
4. 「中文 / 原文」切换器只在 `hasTranslation` 时渲染（`apps/web/app/routes/item.tsx:552`），所以**没有译文时页面上看不到任何语言切换入口**。

引擎**没有**「一段英文一段中文」的对照渲染。

### 2.2 本轮的选择与实现

本人拍板：**正文显示英文原文即可，不再花 token 翻译**。

- `editorial/translate.ts:366` 加 `if (process.env.TRANSLATE_ENABLED === "false") return { done: [], quotes: 0 };`
- `.env` 设 `TRANSLATE_ENABLED=false`；`.env.example` 同步说明
- 恢复方式：改 `true` 或删该行 → `./up rebuild`

---

## 3. 模型链路现状（`LLM_MODEL=fengze-main`）

### 3.1 为什么站点上的模型名是个「不存在的模型」

站点侧 `.env` 只写 `LLM_MODEL=fengze-main` + `LLM_EXTRA_JSON={"chat_template_kwargs":{"thinking":false}}`。
`fengze-main` **不是任何厂商的真实模型**，它是网关侧的一个逻辑模型名，由网关按渠道 `priority` 自动降级（主渠道失败 → 次渠道 → …）。

**这条链的配置全部在网关容器数据卷里，不入库、不受版本控制。** 排查「为什么模型报错/变慢」时，第一步是去网关看渠道与路由表，而不是看仓库。

### 3.2 降级行为与验证

- 主渠道为 NVIDIA NIM（优先级最高），其后依次为若干免费渠道，末位是千问系免费渠道。
- 已实测降级有效：禁用主渠道后，调用按序落到次渠道并最终返回 200。
- 网关 `RetryTimes=5` + `AutomaticDisableChannelEnabled=true`：主渠道连续失败会被自动禁用，`AutomaticEnableChannelEnabled=true` 会再探测恢复。**链路会降级，不会断**。

### 3.3 并发闸门（唯一新增的 `packages/` 补丁）

各队列的 `localConcurrency` 彼此独立，加起来会超过上游账号的并发上限。`166f3d9` 在 `providers/concurrency.ts` 加了模块级信号量，让 `chatOnce()` 全局受 `LLM_MAX_CONCURRENCY` 约束：

- 不设或设 0 ⇒ 不排队，行为与上游一致（**回滚只需把该变量置 0**）
- 本机设 4
- 合并上游 `providers/llm.ts` 时**会冲突**：必须保留 `run()` 包住 `fetch` + `res.text()` 的结构
- 详细登记见 `docs/plan-ai-finance.md` §16

### 3.4 各步骤的实际耗时（关掉思维链后）

`chat_template_kwargs.thinking=false` 让几个重步骤的耗时从 1–3 分钟降到 2–3 秒量级：评分、预筛、结构化三处实测均有数量级改善。

---

## 4. 当前可复核状态

| 项 | 状态 |
|---|---|
| git | `HEAD = ae7a28c`，`main` ahead `origin/main` **6 笔**，**均未 push**；工作区干净 |
| 站点 | 4 容器 Up（web / api / worker / db）；`/ai` `/finance` `/all` 均 **200** |
| 巡检 | `./up rebuild` 全绿（35 项检查）、`./up smoke` **all checks passed** |
| 日报 | `reports` 最新 key `2026-11-07`，生成于 09:30（`kind=daily`） |
| 内容量 | 今日 publications **137**（其中 `body_mode='full'` **115**）、可见（score≥40）**30** |
| 正文 | 详情页标签为 `正文 · 原文`，正文为英文原文；无语言切换器（符合预期） |
| 翻译 | `translations` 表 **0 条**、`translation_attempts` **0 行**；`content.translate` 返回 `{"done":[],"quotes":0}`，而同期**候选 46 条** ⇒ 开关确实在查询前拦截 |
| 任务 | 近 2 小时 `job_runs` **零失败** |
| 校验 | `npm run typecheck` 退出码 0、`error TS` 计数 0 |
| 敏感面 | `.env`、`.workbuddy/` 从未进入任何 commit |

---

## 5. 踩过的坑（本轮新增）

1. **镜像 ≠ 源码**：改完 `translate.ts` 后只跑 `./up`，容器里仍是旧镜像 —— `.env` 的开关变量**完全没被读取**，看起来「已关闭」其实随时会翻译。判定方法是进容器 `grep` 那个标识符；改完 `packages/` / `apps/` 一律 `./up rebuild`。
2. **网关 SQLite 的 WAL**：直接改库文件时若不处理 `-wal` / `-shm`，重启会被旧页覆盖、改动静默丢失。正确姿势是先合并 WAL、`wal_checkpoint(TRUNCATE)`、删掉容器内残留的 `-wal/-shm` 再写回。**改前先备份 DB 文件。**
3. **逻辑模型不可见**：站点日志里只会出现实际返回的厂商模型名，`fengze-main` 本身不会出现。看到模型名突然变成 nemotron / 千问系，说明降级链在起作用，不是配置写错。
4. **NVIDIA 系拒绝 `enable_thinking`**：传该参数直接 400。关思维链要用 `chat_template_kwargs:{"thinking":false}`。
5. **思维链吃满 token**：思考型模型需同时调 `LLM_REASONING_TOKENS`，否则答案被截断成半句。
6. **中文条目不进翻译队列**：`translatePending` 取批次前 `filter(!isChineseText(...))`，`translateArticle()` 另有 `already Chinese` 短路；正文抽取（`content/extract.ts`）不调模型。**所以中文正文的 token 成本为 0**，只有外文全文翻译才产生费用。
7. 其余既有坑（Node 校验退出码、`browseFloor=40`、`seed.ts` 不 UPDATE、卷 label WARN 禁 `down -v`、测试超时属环境性）见上一份交接 §4，仍然有效。

---

## 6. 未收尾 / 风险（**未获拍板不要自行推进**）

### 6.1 已知且明确不做

| # | 项 | 口径 |
|---|---|---|
| 1 | 历史 `failed` 文章重排 | 本人明确「先不做」，勿批量 `requeueFailed`（会同时打穿网关本地记账与上游免费额度） |
| 2 | 「一段英文一段中文」对照 | 需改三处（`translate.ts` 存储格式、`detail.ts` 的 `readingBody()`、`item.tsx` 正文区块），本人已选择不做 |
| 3 | 飞书 / 站外告警 | `FEISHU_*_ENABLED=false`，P2 待办 |

### 6.2 需要盯的运行风险

| # | 风险 | 说明与判据 |
|---|---|---|
| 1 | **模型失败率波动** | 实测近 1 小时 101 完成 / 18 失败。失败样本集中在 NVIDIA nemotron 系（参数不兼容，`Unsupported parameter`）与末位千问免费渠道（`AllocationQuota.FreeTierOnly` 免费额度耗尽）。降级链会兜住，但会拖慢并可能落到低质模型。排查先按 `receipts.purpose + model` 分组看失败分布 |
| 2 | **NVIDIA 免费额度总量不透明** | 网关 `balance` 未接查询，只能靠观察。若主渠道被自动禁用且未恢复，会长期停在次渠道 |
| 3 | **`site_fulltext` 全开的版权含义** | 已把启用中源全部打开，等于站内留存第三方全文；翻译属二次衍生，版权上比纯摘要更敏感。当前定位「自用」可接受，**若要对外分发需重新评估** |
| 4 | **`body_status=unconfirmed`** | 今日 31 篇未确认正文（付费墙 / 反爬），属正常失败，不阻断发布 |
| 5 | **6 笔未 push** | push 前按约定**显式列出全部 deferred items** 并等本人点头；push 后复核 CI |

### 6.3 沿用上一份交接的待办（仍有效）

`docs/handoffs/2026-11-07-rss-delivery-and-pending.md` §6：`terms.md` / `privacy.md` 正文待本人确认、品牌素材、反哺正文免抓（P2 后置）、平台配额备用方案（R0 生效，R2/R3 不提前做）、跨项目 MCP 契约不要重新讨论。

---

## 7. 下一会话的第一件事（按顺序）

1. **先读本文 §2 与 §3**，再动正文或模型相关配置 —— 这两节解释了「为什么改一个开关会连带改另一件事」。
2. `./up check` + `./up status` 确认 4 容器与端口一致；`/api/health` 200。
3. 若只是日常巡检：`./up smoke`，并抽查一条详情页确认正文语言没变回中文（判据：标签应为 `正文 · 原文`，且页面无「中文 / 原文」切换器）。
4. 若要改 `packages/` / `apps/`：改完 `typecheck` → `./up rebuild` → **进容器 `grep` 确认改动真的在镜像里** → `./up smoke`；每批单独 commit。
5. **不要碰**：`apps/` / `packages/` 核心逻辑（唯一例外是已登记的并发闸门补丁）、数据卷（尤其 `down -v`）、网关数据卷里的渠道表（改前必须备份 + 处理 WAL）、已提交历史、`.env` 与 `.workbuddy/` 的入库状态。

---

## 8. 文档索引

| 文档 | 定位 |
|---|---|
| `docs/handoffs/2026-11-07-fulltext-display-and-model-chain.md` | **本文**：正文显示 + 模型链路 + 翻译关闭 |
| `docs/handoffs/2026-11-07-rss-delivery-and-pending.md` | 同日上午：板块级 RSS 落地与跨项目待拍板 |
| `docs/handoffs/2026-11-06-ops-and-first-push.md` | 11-06：运维收口与首次 push |
| `docs/deferred-items.md` | 7 项顺延事项的根因、方案与验收（**第 7 项 = 翻译开关**） |
| `docs/plan-ai-finance.md` | 定制方案、决策历史、**§16 并发闸门补丁** |
| `docs/sop.md` | 极简命令手册 |
| `docs/e2e-verification.md` | 本机 Docker 端到端实测（已脱敏） |
| `docs/automation-fallback.md` | 平台工作流配额备用方案 |
| `.workbuddy/memory/` | 本机工作记忆（不入库） |
