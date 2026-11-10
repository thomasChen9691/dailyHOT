# 高消耗源减量：实施记录与一键恢复

> 2026-11-10 15:25 实施。**用户拍板：Yahoo B 档 + 中新网 `hot_signal`，接受漏 15–20% 美股滚动稿，不为峰值日预留余量；硬性要求「保留原有代码/设置，日后额度充沛可恢复」。**
> 方案与数据依据见 `docs/plan-quota-trim-sources.md`。本文只写通用结构，不含本机绝对路径、凭据或个人信息。

---

## 1. 改动清单（全部只改生产库 `sources` 表）

| 源 | 字段 | 原值 | 现值 | 作用 |
|---|---|---|---|---|
| `rss-yahoo-finance` | `config` | `{_aihot, feedUrl}` | **追加** `denyUrlPrefixes`（6 个域名） | 采集阶段拦掉低质站，零模型调用 |
| `rss-yahoo-finance` | `interval_minutes` | 15 | **60** | 降采样，削平峰值 |
| `rss-yahoo-finance` | `next_fetch_at` | — | `now()` | 立即按新间隔排期 |
| `rss-chinanews-finance` | `participation_mode` | `editorial` | **`hot_signal`** | 跳过整条分析链，采集留痕保留 |

`denyUrlPrefixes` 的值（前缀匹配，协议按引擎规则统一按 https 比较）：

```json
["https://app.moby.co/", "https://247wallst.com/", "https://www.trefis.com/",
 "https://www.tikr.com/", "https://stocktwits.com/", "https://www.thestreet.com/"]
```

选择依据（近 7 天）：`app.moby.co` 35 条 / 均分 14.1 / 仅 1 条 ≥40；`247wallst.com` 89 条；`trefis` 30；`tikr` 21；`stocktwits` 19；`thestreet` 16。**保留** `finance.yahoo.com` 与 `www.fool.com`（后者 304 条里 108 条 ≥40，达标率 35.5%，高于 Yahoo 自家）。

---

## 2. 原有代码 / 设置的保留情况

| 项 | 状态 |
|---|---|
| `industry/sources.json` | **完全未改**：仍写 `interval_minutes: 120`、无黑名单、`participation_mode: editorial`。seed 是 `ON CONFLICT (id) DO NOTHING`，改它对已存在源本就不生效；保留原值正好作为「额度充沛时的默认基线」，新建库会自动是全量配置。 |
| `apps/` / `packages/` / `site/` / `modules/` / `Dockerfile` / `docker-compose.yml` | **零改动** |
| `.env` / 定时任务 / 3h 重处理窗口 / 评分标准 | **零改动** |
| 是否 rebuild | **不需要**（没改镜像代码）；本次只改 DB，`./up rebuild` 反而是多余动作 |
| 是否删除任何原有配置字段 | **没有**。`config` 只是**新增一个 key**，`_aihot` / `feedUrl` 原样保留 ⇒ 恢复时 `config - 'denyUrlPrefixes'` 即可精确还原 |

> 已知漂移（实施前就存在）：`sources.json` 写 120 分钟，生产库实为 15 分钟。运行时以 DB 为准；恢复脚本按**生产库原值 15** 还原，不是按 JSON 的 120。

---

## 3. 备份与一键恢复

### 备份文件（本机私有，不入库）

- `.workbuddy/quota-trim/backup-20261110.json` — 两行完整快照：`id / name / config / cursor / interval_minutes / participation_mode / enabled / tier / site_fulltext / next_fetch_at / health / fail_count / updated_at`。
- `.workbuddy/quota-trim/restore.sql` — 一键恢复脚本（含事务与验证查询）。

### 恢复方式 A：一键脚本（推荐）

```bash
docker exec -i dailyhot-api-1 sh -c 'psql "$DATABASE_URL" -f -' < .workbuddy/quota-trim/restore.sql
```

脚本核心（可直接复制执行）：

```sql
BEGIN;
UPDATE sources
SET config = config - 'denyUrlPrefixes',
    interval_minutes = 15,
    participation_mode = 'editorial',
    next_fetch_at = now()
WHERE id = 'rss-yahoo-finance';

UPDATE sources
SET participation_mode = 'editorial',
    next_fetch_at = now()
WHERE id = 'rss-chinanews-finance';
COMMIT;
```

### 恢复方式 B：后台管理页（中新网推荐走这条）

把 `rss-chinanews-finance` 的 participation mode 从 `hot_signal` 改回 `editorial`。**引擎在 `admin/sources.ts` 里会额外执行 `groupingReset()`**，把减量期间那些「只走了热度信号、没有 editorial 判断」的条目重置归组状态；直接改 DB 不会触发这一步。Yahoo 只涉及 config / interval，用 SQL 即可。

### 恢复后的三个注意点

1. `rss.ts` 的 `configHash = sha256(stableJson(config))` ⇒ 改回 `config` 会让下一轮不带 ETag 全量重拉一次，按 `identity_key` 去重，属预期，观察 30 分钟 receipts 无异常即可。
2. 恢复 `interval` 时脚本已带 `next_fetch_at = now()`，会立即按 15 分钟重新排期。
3. **不需要 `./up rebuild`**；如需让 `sources.json` 的声明与生产库完全一致，那属于另一个决策（会改变「保留原设置」的基线），先与使用者确认。

---

## 4. 实施后的验证结果

| 检查 | 结果 |
|---|---|
| 事务执行 | `BEGIN` / `UPDATE 1` ×2 / `COMMIT` 全部成功 |
| DB 现值 | Yahoo `interval=60`、黑名单 6 条；中新网 `mode=hot_signal` |
| 配置合法性 | 引擎自带 `unsupportedConfig('rss', config)` 返回 `[]`（直接改 DB 绕过了后台校验，已补验） |
| 源健康 | 两源 `health=ok`、`fail_count=0` |
| 首轮采集 | Yahoo 改 config 后已在 07:28 UTC 完成一次全量重拉，`health=ok`，下一轮 08:28 UTC（60 分钟） |
| 洪峰检查 | 实施后 10 分钟：receipts 14 / articles 5 / fetch_runs 4，**无异常洪峰** |
| 过滤实测 | 当前 feed 快照 18 条，黑名单拦下 4 条（22%），与方案预估 23% 吻合 |
| `hot_signal` 生效路径 | `jobs/content.ts` 的 `processRevision()` 第 159 行：非 editorial 直接 `settleNonEditorial()` → `processing_state='skipped'`，且 `queueProcessing()` 对 signal 源直接入归组队列（不再排 analyze） |

---

## 5. 观察指标（实施后 24h / 72h 复核）

| 指标 | 期望 |
|---|---|
| 当日 receipts 总数 / 429 数 | ≤2000 / 0（基线：11-09 峰值 3991 / 369 次 429，天花板约 2800–3000） |
| 全站入库条数 | 不再出现 845 条级洪峰 |
| Yahoo ≥40 条数 | 日均减少 ≤10 条 |
| `selected` 总数 | 不明显下降（中新网减量前本来 0 条入选） |
| 中新网新条目 `processing_state` | 应为 `skipped`（下轮采集后核对） |
| `/finance` 板块页 | 无空档 |

任一项明显异常 → 按第 3 节回滚，回滚是单条 UPDATE、逐项可逆。

---

## 6. 与方案的差异（按用户拍板调整）

| 原方案步骤 | 实际 | 原因 |
|---|---|---|
| P0-1 连续 60 分钟采样验证 feed 窗口 | 合并进 24h 观察期，未单独等待 | 用户已接受漏稿代价；窗口假设的实证放到观察期用真实漏稿率校准 |
| P0-2 先上 A 档观察 24h 再升 B | 一次执行到 B 档 | 用户已明确接受 B 档与漏稿 |
| P0-4 同步改 `sources.json` + `./up rebuild` | **取消** | 用户要求「保留原有代码/设置，日后可恢复」；JSON 保持原值即恢复基线，且改它对现有库无效 |
| C 档 / 砍雪球 / CNBC | **不做** | 用户明确「不用，之后碰到了再处理」 |
| WorkBuddy 积分通道 | **搁置** | 见 `docs/plan-workbuddy-credits-llm.md` 顶部标注 |
