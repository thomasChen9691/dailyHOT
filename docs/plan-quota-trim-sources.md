# 方案：高消耗信源减量（放弃 WorkBuddy 积分路线）

> **执行状态：2026-11-10 15:25 已按用户拍板实施 Yahoo B 档 + 中新网 `hot_signal`。**
> 完整实施记录、备份与一键恢复见 `docs/quota-trim-restore.md`。
> 按用户「保留原有代码/设置，日后额度充沛可恢复」的要求：**`industry/sources.json` 完全未改**（原值即恢复基线），`apps/` / `packages/` / `.env` 零改动，未 rebuild；P0-4「同步改 sources.json + rebuild」**取消**，C 档与 P1 不做。
> 本文保留方案与数据依据（14:38 时的只读实测），不代表实施后的实时状态；口径为 UTC 自然日 / 滚动 24 小时。
> 本文替代 `docs/plan-workbuddy-credits-llm.md`（已标注搁置）。只写通用结构，不含本机地址、凭据、个人信息。

---

## 0. 结论先行

1. **积分路线搁置是对的**。当前问题不是「免费额度绝对值不够」，而是 **11-09 出现一次性洪峰**：模型调用 3991 次（前三天约 1500 次/日），369 次 429。今天截至 14:38 只有 1101 次、0 次 429，已回落。
2. **但「对 Yahoo 减标的」实测无效**：`rss/2.0/headline?s=` 从 5 标的改成 2、1 个，feed 返回 17 / 19 / 16 条且首条标题高度重合 ⇒ 该端点返回的是综合市场头条流，不按标的过滤。改 `feedUrl` 白改，还会因 `configHash` 变化触发一次全量重抓。
3. **能真正减的「标」是三种**：Yahoo 减**域名**（`denyUrlPrefixes`）+ 减**采样**（`interval`）、中新网减**参与模式**（`hot_signal`）。
4. 目标不是砍半基线，而是**削平峰值**：把「撞限前 24h 累计调用」从约 2836 次的贴线状态压到 **≤2000 次**，留 30% 余量。
5. 推荐组合 **Yahoo B 档 + 中新网 B 档**：预计省约 **1300 次/天（约 1/3）**，代价是漏 15–20% 美股滚动稿、少 28 条 ≥40 分卡片，日报入选数不变（中新网本来 0 条）。

---

## 1. 数据基线（只读实测）

### 1.1 额度天花板与异常日

| UTC 日 | 模型调用 | 429 | completed | 全站入库 |
|---|---|---|---|---|
| 11-06 | 1457 | 0 | 1089 | 458 |
| 11-07 | 1532 | 208 | 1012 | 366 |
| 11-08 | 1486 | 0 | 1437 | 248 |
| **11-09** | **3991** | **369** | 3025 | **845** |
| 11-10（至 06:38 UTC） | 1101 | **0** | 1040 | 168 |

- 11-09 首次 429 出现在 12:28 UTC，此前 24h 累计 **2836 次** ⇒ 免费额度天花板约 **2800–3000 次/日**。
- 11-09 是洪峰：当天新加源、容器出网代理修复、积压源恢复采集叠加；Yahoo 单日入库 **504 条**（前三天 62 / 123 / 171）。11-10 半日仅 54 条，已回落。
- 但晚间美股时段（UTC 16–22）是 Yahoo 峰值，今日剩 17 小时按 11-09 小时分布外推约 **2600–3300 次**，仍贴天花板 ⇒ **减量仍必要**。
- 近 24h 非完成回执：`received` 596、`failed` 369（主体是 `llm HTTP 429`）、`unknown` 12（超时）。**撞限后的重试本身就是额外消耗**，减量能直接消掉这部分放大。

### 1.2 近 24h 按源的消耗与产出

| 源 | 入库 | 模型调用 | tokens | ≥40 | ≥76 / selected | 均分 | 每次 selected 约耗 |
|---|---:|---:|---:|---:|---:|---:|---:|
| **rss-yahoo-finance** | **510** | **2373** | **830 万** | 119 | 7 | 37.6 | **339 次** |
| **rss-chinanews-finance** | **106** | **379** | **157 万** | 28 | **0 / 0** | 38.8 | **∞** |
| rss-tmtpost | 79 | 291 | 196 万 | 35 | 8 | 58.3 | 36 次 |
| rss-36kr（现已停用） | 62 | 289 | 113 万 | 36 | 2 | 48.6 | 145 次 |
| rss-cnbc-top-news | 38 | 138 | 64 万 | 12 | 4 | 46.5 | 35 次 |
| rss-xueqiu-topic | 19 | 110 | 66 万 | 12 | 1 | 46.3 | 110 次 |

**Yahoo + 中新网 = 68% 的模型调用、约 987 万 tokens，换来 7 条 selected（中新网 0 条）。** 这就是用户点名这两个源的合理性。

### 1.3 配置实况（重要）

- 运行时真相是 **DB**：`rss-yahoo-finance` / `rss-chinanews-finance` 的 `interval_minutes` 在 DB 里是 **15**，而 `industry/sources.json` 写的是 120。seed 是 `ON CONFLICT (id) DO NOTHING`，**改 JSON 对已存在源不生效**。
- `rss-36kr` / `rss-investing-news` / `rss-marketwatch-pulse` 在 DB 里已 `enabled=false`，近 24h 的条目是停用前采集的，不需要再处理。
- ⇒ 所有改动必须**直接改 DB**；`sources.json` 只作声明式同步，避免下新建库时漂移。

---

## 2. 四个「别白做」（实测排除）

| 手段 | 实测结果 | 判定 |
|---|---|---|
| Yahoo 减 `?s=` 标的数 | 5 / 2 / 1 标的 → feed 返回 17 / 19 / 16 条，`AMD Stock Clocks Best Day`、`Moonshot AI rents Nvidia` 等标题在 5 标的与 1 标的下都出现 | ❌ 端点不按标的过滤，减标的无效 |
| `denyCategories` / `allowCategories` | 两个 RSS 的 `<item>` **都没有 `<category>` 标签** | ❌ 无输入可匹配 |
| 中新网 `allowUrlPrefixes` 按栏目 | 近 7 天 369 条 URL 全部是 `/cj/` 单一栏目 | ❌ 无法按栏目切 |
| 中新网标题噪声词 | 7 天回放：369 条命中 28 条（**7.6%**），其中 ≥40 分误杀仅 1 条 | ⚠️ 温和但杯水车薪，省不了 30 次/天 |

补充：`interval` 降频**不直接省模型**（抓取只发 HTTP），但会影响 feed 捕获率：
- Yahoo feed 快照约 17 条、全天约 510 条新稿（≈21 条/小时）⇒ 15 分钟一次可全覆盖；降到 60 分钟，1 小时新增 21 条 > 17 条窗口 ⇒ **会漏约 15–20% 滚动稿并间接减量**。
- 中新网 feed 快照 30 条、全天约 106 条新稿（≈4 条/小时）⇒ 降到 120 分钟窗口仍够 ⇒ **既不漏稿也不减量**。
- ⚠️ 「feed 是固定长度窗口」这一假设尚未连续采样验证，列为 P0 验证项；结论按「若成立」给出。

---

## 3. 真正有效的三个杠杆

### 3.1 Yahoo：`denyUrlPrefixes` 砍低质域名（rss 源可用）

`config-keys.ts` 的 `COLLECTED` 含 `allowUrlPrefixes` / `denyUrlPrefixes`，`collect.ts` 对所有 kind 都走 `admitListing()` → `allowed()`，所以 **rss 源同样生效**，且在入库前过滤、零模型调用。

近 7 天域名分布（Yahoo）：

| 域名 | 7 天条目 | ≥40 | 均分 | 建议 |
|---|---:|---:|---:|---|
| finance.yahoo.com | 343 | 69 | 37.2 | **保留** |
| www.fool.com | 304 | **108（35.5%）** | 42.8 | **保留**（达标率比 Yahoo 自家还高，别误砍） |
| 247wallst.com | 89 | 21 | 35.2 | 砍 |
| app.moby.co | 35 | **1** | **14.1** | 优先砍 |
| www.trefis.com | 30 | 7 | 26.5 | 砍 |
| www.tikr.com | 21 | 5 | 32.0 | 砍 |
| stocktwits.com | 19 | 3 | 33.8 | 砍 |
| www.thestreet.com | 16 | 4 | 35.6 | 砍 |
| 其余长尾（约 25 个域名） | ~40 | 少量 | — | 用白名单兜底更省事 |

砍掉上表 6 个低质域名 ≈ 7 天 210 条 / 约 23%，**省约 550–600 次调用/天**，代价仅约 40 条 ≥40 分卡片（7 天口径，日均约 6 条）。

### 3.2 Yahoo：`interval` 降采样（削峰）

DB 实况 15 分钟 → 60 / 120 分钟。这是**用覆盖率换额度**，不是免费午餐，必须明示代价。

### 3.3 中新网：`participation_mode='hot_signal'`

`jobs/content.ts` 在 `hot_signal` 下把条目直接置 `skipped`，**跳过整条分析链**（采集与去重留痕仍在）。该源近 24h **0 条 ≥76、0 条 selected**，7 天也仅 48 条 ≥40 ⇒ 省 379 次/天，日报产出损失 **0**。中文宏观视角并不缺口：站内已有国家统计局、央行、证监会、上交所、WTO、ECB 等官方源。

---

## 4. 分档与推荐组合

### Yahoo（按近 24h 2373 次基线估算）

| 档 | 动作 | 预计省调用/天 | 代价 | 判定 |
|---|---|---:|---|---|
| A 温和 | 仅 `denyUrlPrefixes` 砍 6 个低质域名 | ~570（24%） | 日均约 6 条 ≥40 卡片 | 安全，可先上 |
| **B 推荐** | A + `interval` 15→60 | ~950（40%） | 漏约 15–20% 美股滚动稿 | **推荐** |
| C 激进 | A + `allowUrlPrefixes` 只留 2 个域名 + `interval` 120 | ~1540（65%） | 漏约 50–60% 稿件，板块更新明显变慢 | 峰值日兜底 |

### 中新网（按近 24h 379 次基线）

| 档 | 动作 | 预计省调用/天 | 代价 |
|---|---|---:|---|
| A | 标题噪声词 | ~30 | 几乎无，但解决不了问题 |
| **B 推荐** | `participation_mode='hot_signal'` | **379（100%）** | 28 条 ≥40 卡片消失；0 selected 损失 |
| C | `enabled=false` | 379 | 连采集留痕也停 |

### 推荐组合的预期

| 场景 | 减量前 | 减量后（Yahoo B + 中新网 B） |
|---|---:|---:|
| 11-09 洪峰日 | 3991 | ~2660（低于 2836 天花板，但余量薄） |
| 11-10 常态外推 | 2600–3300 | **1270–1970（安全）** |
| 峰值日仍贴线时 | — | Yahoo 升 C 档，再省约 590 次 |

**目标：撞限前 24h 累计 ≤2000 次**。若 P0 观察 24h 后仍超过，按 C 档 → P1 顺序加码。

### P1 备选（本轮不动）

`rss-xueqiu-topic`（110 次 / 1 selected）、`rss-cnbc-top-news`（138 次 / 4 selected）效率尚可，暂不动；`rss-tmtpost`（291 次 / 8 selected）是效率最好的中文源，**明确保留**。已停用的 36kr 不恢复。

---

## 5. 实施步骤（待确认后执行，本轮不动手）

| 步 | 动作 | 验证 |
|---|---|---|
| P0-0 | **备份**两行完整 `config` / `cursor` / `interval_minutes` / `participation_mode` 到本地文件（不入库） | 备份可读、可回滚 |
| P0-1 | 连续两次抓 Yahoo feed（间隔 60 分钟）比较 link 集合，验证「固定窗口」假设与实际漏稿率 | 得出真实漏稿比例，修正 B 档预估 |
| P0-2 | 先只上 **Yahoo A 档**（`denyUrlPrefixes`），观察 24h | receipts 总数、429 数、≥40 条数、selected 数 |
| P0-3 | 效果不足再升 **Yahoo B**（`interval` 15→60 + `next_fetch_at=now()`）；同期可上 **中新网 B** | 同上，另看板块页是否有缺口 |
| P0-4 | 同步改 `industry/sources.json` 两行的 `interval_minutes` / `config` / `participation_mode`，`./up rebuild` 让声明与运行时一致 | 新库 seed 值与 DB 一致 |
| P1 | 仍贴线则 Yahoo 升 C 档，或评估 P1 备选源 | 24h 指标 |

**SQL 形态（仅示意，未执行）**

```sql
-- 备份（宿主侧）
\copy (SELECT id, config, cursor, interval_minutes, participation_mode FROM sources
       WHERE id IN ('rss-yahoo-finance','rss-chinanews-finance')) TO '<backup>.csv' WITH CSV HEADER

-- Yahoo A：config 追加前缀黑名单（合法 key，rss kind 支持）
UPDATE sources
SET config = config || '{"denyUrlPrefixes":["https://app.moby.co/","https://247wallst.com/",
  "https://www.trefis.com/","https://www.tikr.com/","https://stocktwits.com/",
  "https://www.thestreet.com/"]}'::jsonb
WHERE id = 'rss-yahoo-finance';

-- Yahoo B：降采样，必须同时复位 next_fetch_at 才立即生效
UPDATE sources SET interval_minutes = 60, next_fetch_at = now()
WHERE id = 'rss-yahoo-finance';

-- 中新网 B：跳过分析链，采集留痕保留
UPDATE sources SET participation_mode = 'hot_signal'
WHERE id = 'rss-chinanews-finance';
```

**两个实施坑**

1. `rss.ts` 的 `configHash = sha256(stableJson(source.config))` ⇒ **改 `config` 会让下一轮不带 ETag 全量重拉一次**。按 `identity_key` 去重理论上不会重复入队，但首轮 30 分钟要盯 receipts 有没有异常洪峰。`interval` / `participation_mode` 不在 `config` 里，不触发。
2. 改 `interval_minutes` 必须同步 `next_fetch_at=now()`，否则要等旧的调度时点。改完**不需要 `./up rebuild`**（没改镜像代码），但同步改 `sources.json` 后需要 rebuild 才能让新部署一致。

---

## 6. 观察指标与回滚

每天固定口径查询（不改代码）：

| 指标 | 期望 |
|---|---|
| 当日 receipts 总数 / 429 数 | ≤2000 / 0 |
| 全站入库条数 | 稳定，不再出现 845 条级洪峰 |
| ≥40 分条数 / selected 数 | selected 不明显下降（中新网本来 0） |
| Yahoo ≥40 条数 | A 档后日均减少 ≤10 条 |
| 板块页 `/finance` 是否有空档 | 无 |

**回滚**：从 P0-0 备份恢复 `config` / `cursor` / `interval_minutes` / `participation_mode`，并把 `next_fetch_at=now()`；`sources.json` 一并还原。单条 UPDATE，逐档可回。

---

## 7. 红线与待拍板

**红线**：不动 `apps/` / `packages/` 核心；不改评分标准、不动 3h 重处理窗口、不改站内 cron；不碰付费源、不启用 WorkBuddy 积分；改 DB 前必备份；禁止 `down -v`。

**待用户拍板（4 项）**

1. Yahoo 档位 **A / B / C**（推荐 B）。
2. 中新网是否接受 `hot_signal`（28 条 ≥40 卡片消失，日报 0 损失）。
3. 是否接受「漏 15–20% 美股滚动稿」换额度余量；若不接受，只能停在 A 档（省 24%，峰值日仍可能贴线）。
4. 是否保留 11-09 那种峰值日的余量（→ 需要 C 档或 P1 加码）。

---

## 8. 与既有结论的关系

- 11-09 交接里「降 `interval` 不省额度」的判断在**直接成本**层面成立（抓取不调模型）；本文补充第二层：feed 窗口有限时，降频会通过漏掉滚动稿**间接**减少入库与模型调用，代价是覆盖率。不是推翻，是细化，且列为待验证假设。
- 11-09 交接里「减标的第一优先是 Yahoo 减标的」，本文用在线探活证明 `?s=` 参数无效，替换为「减域名 + 减采样 + 减参与模式」三种可执行动作。
- `docs/plan-workbuddy-credits-llm.md` 已标注搁置，其协议差异结论仍作为存档保留。
