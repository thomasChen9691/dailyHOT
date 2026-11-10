# 会话交接 · 2026-11-08 · free-auto 兜底链定型 / qwen 额度退场 / 并发降到 2 / 站点主模型切 free-auto

> **读者**：下一次接手本仓库或网关渠道配置的会话 / 协作者。
> **脱敏声明**：本文会随仓库上传，因此**不含**本机绝对路径、账号、凭证、内网 IP、宿主端口、网关 token 名与 ID、平台自动化明细；本机实况（精确渠道 ID、映射 JSON、实测日志编号、临时脚本）只保存在本地工作记忆，**不入库**。
> **本文定位**：记录「已落地并验证」的配置变更 + 「明确未做」的遗留。**遗留项未获本人拍板前不要自行推进。**
> **前序交接**：`2026-11-07-fulltext-display-and-model-chain.md`（模型链 / 正文显示）、`2026-11-07-rss-delivery-and-pending.md`、`2026-11-06-ops-and-first-push.md`，其中 §6 待办仍有效。
> **边界**：本轮除 `scripts/fengze.mjs` 一行自检规则由「阻塞」改为「提示」外，全部是**配置层改动**——网关渠道表在容器数据卷里（不入库、不受版本控制），站点只改 `.env` 两个值（并发、主模型）+ 重建容器；18:50 又摘除 muse 渠道的 `free-auto` 别名（§10）。代码改动与交接文档各自单独提交，**不 push**。

---

## 0. 一句话状态

站点 4 容器正常、`LLM_MAX_CONCURRENCY` 4→2 已随容器重建生效；**站点主模型已切为 `free-auto`**（原先直调 qwen 系渠道的问题已闭环，见 §6.1）；网关 `free-auto` 兜底链现为 **11 个渠道**：NVIDIA 主 → ModelScope → OpenRouter ×4 → **qwen 系 ×5 整组垫底**；`nvidia-muse-glimmer` 已于 18:50 从链上移除（渠道保留启用、可直调，§10），`llama-90b` 与 `kimi-k3` 也已退出。

**唯一需要运维留意**：`free-auto` 是网关侧逻辑模型，链路可用性取决于渠道表，`./up check` 只给提示不判阻塞（§6.4）；18:50 移除 muse 后已解除与站点 120s 硬超时的错配（§10），但 NVIDIA 主渠道近 3 小时仍有 429 / 500 / 504，需继续观察降级是否稳定。切换前的 400 终止点复核见 **§9**。

---

## 1. 本轮做了什么（时间线压缩）

| 批次 | 内容 | 结论 / 结果 |
|---|---|---|
| ① 基线核对 | 核对密钥文件与容器、网关数据库、站点 `.env` 的一致性 | 发现 `hub/.env` 权限偏松、部分容器退出、若干凭据未收录 |
| ② NVIDIA 接入 | 新建渠道、扫描免费模型、验证可用 | 成为链路第一顺位；免费层有真实 429 限流 |
| ③ 首次重排 | NVIDIA 提优先、排除 5 个模型、替换 DashScope 耗尽模型 | 用户明确：**不充值 OpenRouter、不删除/停用任何已有渠道**（额度次日恢复） |
| ④ DSH / Codex | 接入逻辑模型与 Responses 协议 | 日常交互统一用 `free-auto` |
| ⑤ 站点故障根因 | 排查「`max_tokens=11500` 导致降级」的说法 | **证伪**：真因是 429 层层降级后撞到 `kimi-k3` 拒收 `temperature=0.2` 返回 **400**，而 400 不在重试区间、直接截断链路 |
| ⑥ ModelScope 接入 | 新建渠道、探测 38 个模型、17 个实测可用 | 发现免费层对并发极敏感；补挂别名后才真正入链 |
| ⑦ 省魔粒 + 重排 | 弃用 2 个 SQL 专用模型、只映射 1 个轻量模型、恢复 5 个 NVIDIA 模型 | 链路顺序定型为 NVIDIA → OR → MS → 其余 |
| ⑧ kimi-k3 渠道出链 | 先摘 `free-auto` 别名，后按用户「直接放弃」停用渠道 | 渠道记录保留、不物理删除，400 终止点消失 |
| ⑨ 生效点核查 | 确认 `LLM_MAX_CONCURRENCY` 的实现位置、实测两个 meta | **纠正误判**：变量确实存在（曾查错到另一份无补丁的副本） |
| ⑩ 本轮收口 | 并发 2 + muse 入链 + 放弃 llama + qwen 整组垫底 | 全部落地并验证，见 §2 / §4 |
| ⑪ 主模型切换与 OR 降级（17:45） | 站点 `LLM_MODEL` 切 `free-auto`、OpenRouter ×4 降到 100–97、`./up` 自检规则降级为提示 | 用户拍板；切换前完成 400 终止点复核（§9），`free-auto` 完整参数复测 3/3 200 |
| ⑫ 移除 muse（18:50） | 摘掉 muse 渠道的 `free-auto` 别名与映射，渠道保留启用可直调 | 站点 120s 硬超时错配解除；`free-auto` 复测 3/3 200（13.7s / 0.7s / 7.8s），见 §10 |

---

## 2. 最终配置快照（核对依据）

### 2.1 `free-auto` 有效链（11 个渠道）

| 顺位 | 渠道角色 | priority | 命中后实际模型 | 计费属性 |
|---|---|---|---|---|
| 1 | NVIDIA NIM 主渠道 | 200 | nemotron-3-ultra | 免费层，有 429 / 500 / 504 |
| 2 | ModelScope | 185 | `nex-agi/Nex-N2.5-mini` | **0.5 魔粒/次** |
| 3–6 | **OpenRouter ×4（本轮降级）** | 100 / 99 / 98 / 97 | 各家 `:free` 模型 | 中国区无法充值、常 429 |
| 7–11 | **qwen 系 ×5（整组垫底）** | 40 / 39 / 38 / 37 / 36 | 各渠道自有模型 | 免费额度将尽，**超额会扣费** |

> **18:50 起**：`nvidia-muse-glimmer` 已从 `free-auto` 链移除（渠道保留启用、可直调），原因与验证见 §10。

- 设计意图：非 qwen 全在 97 以上、qwen 全在 40 以下，中间留大缓冲；OpenRouter 排在 ModelScope 之后，避免「必失败」渠道吞掉重试次数（§3 决策 8 / §5 第 13 条）。
- qwen 系按 `base_url` 精确识别共 5 个启用渠道；另有 2 个历史渠道已停用（`kimi-k3`、`deepseek 官方`），本轮**未删除任何渠道**。
- `auto_ban=1` 全部保留；`AutomaticEnableChannelEnabled=true` 会在次日额度恢复后自动启用，与「明天还会恢复」是同一套逻辑。
- 一个渠道只能有一个 `model_mapping`，muse 当初因此**新建渠道**；该渠道 18:50 已从 `free-auto` 链移除，但保留直调能力（§10）。

### 2.2 站点侧（`.env`）

| 项 | 当前值 | 备注 |
|---|---|---|
| `LLM_MAX_CONCURRENCY` | **2**（原 4） | 备份 `.env.bak-20261108-concurrency2`；主模型另有 `.env.bak-20261108-freeauto` |
| `LLM_MODEL` | **`free-auto`**（原 `deepseek-v4.1-flash-1017`） | 17:45 切换；逻辑模型，走 §2.1 的 11 渠道链，见 §9 / §10 |
| `LLM_REASONING_TOKENS` | 10000 | 与步骤默认值合成 `max_tokens=11500` |
| `LLM_EXTRA_JSON` | `{"chat_template_kwargs":{"thinking":false}}` | 关思考链，实测让重步骤耗时降一个数量级 |
| `LLM_JSON_MODE` | 未设 → 默认强制 `response_format: json_object` | 上游兼容性排查必看 |

> 注意：11-07 交接里写的是 `LLM_MODEL=fengze-main`，此后一度改为直调具体模型名；**17:45 起站点改用 `free-auto`**。`fengze-main` 作为逻辑模型仍挂在少数渠道上，但站点当前没用它。

### 2.3 并发闸门（沿用 11-07 补丁，本轮只调数值）

`providers/concurrency.ts` 的模块级信号量 + `llm.ts` 用 `run()` 包住 `fetch` + `res.text()`，**跨所有队列全局限制在途请求**；`0` 或不设 = 不限（回滚只需置 0）。

**关键利好**：排队发生在 `fetch` 之前，`AbortSignal.timeout` 从真正发请求才开始计时 ⇒ 降到 2 只拉长后台批处理总时长，**不会引入请求超时**，符合「新闻挂后台、不急速度」的场景。

---

## 3. 关键决策与理由

1. **所有渠道保留、不充值**：免费额度是「今日用完、次日恢复」，不是永久失效。曾误把「当前不可用」当成「永久无用」并禁用渠道，已按用户要求全部恢复。
2. **ModelScope 省魔粒**：官方三档计费轻量 0.5 / 主流 1 / 旗舰 2 魔粒每次，每日 250 短期魔粒、**24h 过期不结转**、系统原因失败全额返还。做法：兜底只映射 1 个轻量模型（避免同渠道多模型重试重复扣费）、`test_model` 同设、保留 `auto_ban` 让额度耗尽后自动禁用、排在第三顺位使绝大多数请求零魔粒。**以后只做增量单点验证，禁止全量扫模型。**
3. **kimi-k3 渠道停用**：它拒收站点固定传的 `temperature=0.2` 返回 400，而 400 不重试会截断整条链，后面所有渠道从未被尝试。摘别名 + 停用，渠道记录保留。
4. **qwen 垫底但不摘别名**：用户口径是「非必要不用」，不是「彻底删除」。保留别名使极端情况下仍有兜底，只把优先级压到最低。
5. **muse 入链 / llama 出链**：站点真实参数（`temperature=0.2` / `max_tokens=11500` / `json_object` / `thinking=false`）下，muse 单发 4.2s、并发 2 下 13.0s 均返回合法 JSON；llama 同参数 170s 超时、最简对照请求也 80s 超时，网关日志两条 504 ⇒ 别进自动链、别设为 `test_model`。
6. **降并发到 2**：`RetryTimes=5` 会把一次失败放大成多次上游请求，并发 4 最坏瞬间约 20 个请求砸向 ModelScope，正好撞它的账号级突发 QPS 限流。**纠正**：429 **不会**触发 `auto_ban`（默认禁用状态码只有 401，上游 429 属重试区间），真实风险是「429 → 重试放大 → 降级」，不是渠道被禁。
7. **站点主模型切 `free-auto`**：原来的 `LLM_MODEL` 是按模型名精确匹配的直调，只挂在 qwen 系一个渠道上，降 `priority` 完全挡不住额度消耗（§6.1）。切逻辑模型后站点走整条兜底链，qwen 只在前面全挂时才被碰到。代价：用量归因混在 `free-auto` 名下、不同上游模型输出分布可能波动，需回归。
8. **OpenRouter 整组降级**：中国区无法充值，`:free` 每日额度长期耗尽；`RetryTimes=5` 下它们占 3–6 顺位会吞掉全部重试次数，切换前实测 `free-auto` 在站点完整参数下 429 / 30.6s，ModelScope 与 qwen **从未被尝试**。降到 100–97（ModelScope 之后、qwen 之前）后复测 3/3 200。渠道仍保留启用、别名仍在，符合「只调 priority 不删渠道」。
9. **移除 muse 解除 120s 超时错配（18:50）**：站点未配 `fallbackModel` 的步骤硬上限是 `TIMEOUT_MS=120_000`，而网关 `free-auto` 在 NVIDIA 主渠道失败后逐级降级，落到 muse 渠道时单段可到 60–164s；网关最终成功但站点早已放弃，回执留 `unknown` / `received`。摘掉 muse 的 `free-auto` 别名（渠道保留启用可直调）后复测 3/3 200、最长 13.7s。详见 §10。

---

## 4. 已验证 / 实测数据

| 场景 | 结果 |
|---|---|
| `free-auto` + 站点真实参数 | 200 / 1.2s / 命中 NVIDIA 主渠道 / 合法 JSON |
| `free-auto` 主渠道上游 500 时 | **降级到新建 muse 渠道并 200**（日志实证，新渠道确实承接兜底） |
| `meta/muse-glimmer-30b` 直调 | 200 / 28.8s / 合法 JSON（走主渠道，因其优先级更高） |
| `llama-90b` 直调 | 503 `model_not_found`，路由表 0 条 ⇒ 已彻底放弃 |
| ModelScope 并发 2（2 轮 × 2 次） | 4/4 全 200，0.4–0.5s，无 429；并发 5 则全部假性 429 |
| 容器重建 | 4s 完成，未触发 worker 长优雅退出；两容器环境变量实测均为 2 |
| 站点健康 | 首页 200（端口以 `.env` 的 `PORT` 为准，勿按默认值猜测） |
| 凭据完整性 | 改动过的 6 个渠道 `length(key)` 全 > 0，未被清空 |
| 本轮魔粒消耗 | **0**（全部请求走 NVIDIA 侧） |
| `free-auto` + 站点完整参数（OR 降级后 ×3） | 3/3 200、合法 JSON；74.7s / 2.1s / 0.8s，首轮 NVIDIA 上游 500 后由 muse 渠道承接 |
| 两容器注入值 | `LLM_MODEL=free-auto` / `LLM_MAX_CONCURRENCY=2`，与 `.env` 一致 |
| `./up check` / `./up smoke` | 0 阻塞（1 项提醒）/ 16 项全过 |
| 切换前对照 | `free-auto` 429 / 30.6s，轨迹 = NVIDIA 主 500 → muse 500 → OpenRouter ×4 429，MS 与 qwen 从未尝试 |
| 移除 muse 后复测（18:51 ×3） | **3/3 200**，13.7s / 0.7s / 7.8s，全命中 NVIDIA 主；无 400、无 muse / ModelScope 命中（魔粒 0），见 §10 |
| 超时错配实证 | `18:38:56 free-auto → muse 渠道成功，use_time=164s`，超过站点 `TIMEOUT_MS=120_000`，网关成功时站点已放弃 |

---

## 5. 踩过的坑（别重复）

1. **网关单渠道查询返回的 `key` 是空字符串**（脱敏）。全字段 PUT 若原样回传会**清空凭据**。正确姿势：从 SQLite `channels.key` 读真实值注入请求体，改完核对 `length(key)`。
2. **读网关 SQLite 快照必须连 `-wal` / `-shm` 一起复制**，否则会读到未 checkpoint 的旧路由表，误判「abilities 没同步」。
3. **渠道状态接口是 `POST /api/channel/{id}/status`**，PUT 会报 Invalid URL。
4. **ModelScope 的 `base_url` 不能带 `/v1`**：网关会自动补 `/v1/chat/completions`，填了会变成双 `/v1`。密钥文件里那个带 `/v1` 的值是给直连客户端用的。
5. **ModelScope 并发 ≥5 会在 0.2s 内全部返回假性 429**，串行复测即可恢复 ⇒ 测/用必须串行或并发 ≤2。
6. **400 是终止性错误**（重试区间排除 400/408），会直接截断降级链；429 只重试、不禁用渠道。
7. **别查错项目**：本机存在另一份无并发闸门补丁的副本，查配置一律认带 `.env` 与 `docs/handoffs/` 的那份。
8. **管理会话有数量上限**，反复登录会 409；用完显式 logout。
9. **模型名按字符串精确匹配**：ModelScope 的 `deepseek-ai/DeepSeek-V4.1-Flash-1017`（带组织前缀）与 qwen 系的 `deepseek-v4.1-flash-1017` 是两个不同模型，不会串渠道。
10. **`env_file` 是容器创建时注入**：改 `.env` 后必须 `docker compose up -d --force-recreate --no-deps api worker`，只重建读该变量的两个服务，避免动 db / setup / web。
11. **思考型模型 + 小 `max_tokens`**：未关思考链且 `max_tokens=16` 时，muse 会耗时 30s+ 且 `content` 为空（思考预算吃光）。站点强制 `thinking=false`，不受影响。
12. 网关渠道名是历史遗留（额度耗尽后换过模型但没改名），排查时以 `models` / `model_mapping` 为准，别看渠道名。
13. **高顺位「必失败」渠道会吞掉重试次数**：`RetryTimes=5` 是渠道尝试上限，排在前 6 位的渠道若全失败，后面的渠道一次都不会被尝试。调 `priority` 要按「可用性」而非「价格」排序。
14. **`./up check` 里的历史硬检查会过期**：曾把 `LLM_MODEL=free-auto` 判为阻塞（依据是已停用的 kimi 渠道 400），主模型切换后该结论不再成立，现降级为提示（§6.4）。
15. **慢渠道 + 站点硬超时 = 时间错配**：网关的降级链是串行累计的，任一渠道单段超过站点 `TIMEOUT_MS=120_000`，后面就算成功也收不回来（回执 `unknown`、文章 `outcome unknown`）。调链不仅看「能不能成功」，还要看「总耗时是否小于调用方超时」；不要靠调高站点超时来掩盖（§10）。

---

## 6. 未收尾 / 风险（**未获拍板不要自行推进**）

### 6.1 ✅ 已闭环（17:45）：站点主模型已切 `free-auto`

原问题：`LLM_MODEL=deepseek-v4.1-flash-1017` 在路由表里**只挂在 qwen 系的一个渠道**上，按模型名精确匹配的直调**不受 `priority` 影响**，把 qwen 降到最后对实际额度消耗为零作用。

- **改法（已执行）**：`.env` 把 `LLM_MODEL` 切成 `free-auto`，备份 `.env.bak-20261108-freeauto`，再重建 `api` / `worker`；两容器注入值已复核。后台现在走 NVIDIA → muse → ModelScope → OR → qwen，只有前面全挂才可能碰到 qwen。
- **切换前调查**：本人要求先确认不会重演 400 截断及其它历史坑，复核过程与证据见 §9。
- **验证**：OR 降级后 `free-auto` 完整参数复测 3/3 200；`./up smoke` 16 项全过、health 200。
- **代价 / 观察**：用量归因混在 `free-auto` 名下、不同上游模型输出分布可能波动，需回归；上游 500 降级时单次耗时可达 70s+（§6.3）。
- **回滚**：`.env` 改回 `deepseek-v4.1-flash-1017` + 重建即可；若一并回滚 `fengze.mjs`，恢复原 `bad` 检查。
- **状态**：**已获本人拍板并执行**（17:45），无需再确认。

### 6.2 其它待拍板

| # | 项 | 说明 |
|---|---|---|
| 1 | 给 muse 渠道加 `param_override` 注入 `chat_template_kwargs.thinking=false` | 可显著加速并避免空输出，主要惠及 Codex / DSH 等不走站点 `.env` 的交互场景；**未做、未验证** |
| 2 | 若嫌 ModelScope 轻量档质量不足 | 把该渠道 `model_mapping` 换成主流档模型即回 1 魔粒/次，站点参数与 Responses 协议都验过 |
| 3 | 沿用 11-07 交接 §6 | 历史 `failed` 文章不重排、飞书告警 P2、6 笔未 push（push 前须显式列 deferred items 并等点头）、`site_fulltext` 对外分发的版权含义 |
| 4 | 历史 `failed` 只读分类（本轮已做） | `articles` failed 345 / blocked 82：403 免费额度耗尽 324、无错误信息 82、kimi 参数坑 15、429 限流 2、其它 4；`receipt_attempts` failed 1918。根因报告里的「926 条」与本机两库口径都对不上，疑为不同时点快照。kimi 可重放候选：articles 15 / attempts 48 / 4xx 相关 17，**未重放、未写库** |

### 6.3 运行风险

- **NVIDIA 免费额度不透明**：网关未接余额查询，主渠道被限流时只能靠观察；`auto_ban` + 自动恢复会兜住。
- **muse 上游耗时波动大**（4.2s / 13.0s / 28.8s / 34s 均实测到），但后台不急速度，可接受。
- **ModelScope 对突发并发敏感**：站点现在走 `free-auto`，MS 会真实承接；并发 2 是必要保护（并发 5 会在 0.2s 内全部返回假性 429）。
- **两个慢模型**（llama-90b、muse 未关思考链时）不要设为 `test_model`，网关日志里已有 504 记录。
- **站点默认硬超时是 120s**（`providers/llm.ts:137` 的 `TIMEOUT_MS=120_000`；未配 `fallbackModel` 的步骤就是这一档），不是 120–180s。曾因 muse 渠道单段 164s 导致「网关成功、站点放弃」，18:50 移除 muse 后已解除（§10）；NVIDIA 主渠道仍不稳，继续观察。

### 6.4 `./up check` 的模型自检已降级为提示

`scripts/fengze.mjs` 原先把 `LLM_MODEL === "free-auto"` 判为 `bad`（「会触发 400」），而 `bad` 会累计成 `blocking`，令 `./up` 起站流程 `exit 1`。该结论针对的 400 终止点已从渠道侧消除（kimi 渠道停用、`free-auto` 映射目标无 kimi 系、§9 复核），故 17:45 改为 `warn`：「逻辑模型，降级链由网关渠道表决定」，并提示确认链里没有 400 终止点。`./up check` 现为 0 阻塞 / 1 提醒。**不要把它改回 `bad`，也不要删掉这条提示** —— 400 不在重试区间，链里一旦出现 400 仍会截断降级。

---

## 7. 下一会话的第一件事（按顺序）

1. **先读 §0、§2、§9**，再动任何模型或渠道配置 —— 特别是「链上不能有 400 终止点」与「高顺位必失败渠道会吞掉重试次数」这两条。
2. **抽查网关日志确认站点请求命中 `free-auto`**（17:50 已复核）：重建后 17:47 起后台真实请求 `model_name=free-auto`，主要命中 NVIDIA 主 / muse 渠道，少量上游 500 由降级链接住并返回 200 ⇒ 与 `.env` 一致，降级链在真实流量下生效。日常巡检看到 nemotron / 千问系也不必当成配置写错。
3. `./up check`（应为 0 阻塞 / 1 提醒）+ `./up status` 确认容器与并发值一致；必要时 `./up smoke`。
4. 观察 `free-auto` 降级耗时（应远小于 120s）与评分 / JSON 结构是否波动；若 NVIDIA 主渠道 429 / 500 变频繁、请求落到 ModelScope / OpenRouter 导致累计再次逼近 120s，按 §10 的结论评估是否改用明确模型名，不要调高超时。
5. **不要碰**：代码核心逻辑、数据卷（尤其 `down -v`）、网关渠道表（改前备份 + 处理 WAL + 注入真实 key）、已提交历史、`.env` 的入库状态。

---

## 8. 文档索引

| 文档 / 位置 | 定位 |
|---|---|
| **本文** | 11-08：兜底链定型、qwen 退场、并发降到 2、主模型切 `free-auto`（§9 17:45 追加、§10 18:50 追加、§11 11-09 完工审计、§12 11-10 免费计费置零） |
| `docs/handoffs/2026-11-07-fulltext-display-and-model-chain.md` | 前一份：模型链机制、并发闸门补丁、正文显示、翻译关闭（§6 待办仍有效） |
| `docs/handoffs/2026-11-07-rss-delivery-and-pending.md` | 同日上午：板块级 RSS 与跨项目待拍板 |
| `docs/handoffs/2026-11-06-ops-and-first-push.md` | 11-06：运维收口与首次 push |
| `docs/deferred-items.md` / `docs/plan-ai-finance.md` / `docs/sop.md` | 顺延事项 / 方案与 §16 并发补丁 / 命令手册 |
| **网关仓库的本地工作记忆**（不入库） | 本轮完整实测流水、精确渠道 ID 与 mapping JSON、日志编号、临时脚本、魔粒账单反推 |

> 网关侧的渠道配置、路由表、密钥均**不在本仓库**，排查「为什么模型报错/变慢」第一步是去看网关的渠道表与日志，不是翻仓库代码。

---

## 9. 17:45 追加：主模型切换与「链上无 400 终止点」复核

### 9.1 为什么先调查再切换

本人要求在切主模型前确认不会重演「kimi 渠道拒收 `temperature=0.2` 返 400 截断链路」及其它历史坑。复核统一使用**站点完整参数**：`temperature=0.2` / `max_tokens=11500` / `response_format: json_object` / `chat_template_kwargs.thinking=false`（网关对最后这个字段无特殊处理，原样透传，故必须实测）。

### 9.2 历史坑对照

| 历史坑 | 当前状态 | 证据 |
|---|---|---|
| kimi 渠道 400 截断链路 | **已消除** | 该渠道已停用；`free-auto` 的 abilities 恰好 12 个渠道且不含它；12 个映射目标无 kimi 系 |
| 400 是终止性错误 | **仍成立** | 重试区间排除 400/408；运行时 `RetryTimes=5` ⇒ 链上绝不能有 400 |
| 另一 kimi 型号的参数坑 | 仅个别渠道可直调，**不在链上** | 该渠道的 `free-auto` 映射目标是 qwen 系模型 |
| ModelScope 双 `/v1`、并发 ≥5 假性 429 | 已修 / 并发已降到 2 | 完整参数实测 200 / 0.5s |
| 429 会误触发自动禁用渠道 | 证伪 | 默认禁用状态码只有 401，429 属重试区间 |
| 慢模型 504、思考型模型空输出 | 已出链 / 站点强制 `thinking=false` | muse 200 / 8.3s、合法 JSON |
| 渠道查询返回空 key、SQLite WAL 旧快照 | 已规避 | 改渠道时从库里注入真实 key 并复核长度；每次快照连 `-wal/-shm` 一起复制 |
| **高顺位「必失败」渠道吞掉重试次数** | **本次新发现，已修** | 见 §3 决策 8 / §9.3 |

各落点最小冒烟：NVIDIA 主 200 / 2.7s、muse 200 / 8.3s、ModelScope 200 / 0.5s、qwen 200 / 1.0s、OpenRouter 429（可重试、不禁用渠道）。**没有任何落点返回 400**。

### 9.3 切换前发现的非 400 截断

OR 降级前 `free-auto` 实测 **429 / 30.6s**，日志轨迹 = NVIDIA 主 500 → muse 500 → OpenRouter ×4 429；`RetryTimes=5` 用尽后 **ModelScope(185) 与 qwen 从未被尝试**。把 OR 降到 100–97（ModelScope 之后、qwen 之前）后复测 **3/3 200**。

### 9.4 本轮落地与验证

- OpenRouter ×4 的 `priority` 由 190/189/188/187 改为 **100/99/98/97**，`channels` 与 `abilities` 同步，渠道保留启用、别名未摘。
- `.env` 的 `LLM_MODEL` 改为 `free-auto`（备份 `.env.bak-20261108-freeauto`），重建 `api` / `worker` 后两容器注入值均为 `free-auto` / 并发 2。
- `./up status` health 200、`./up smoke` 16 项全过、`./up check` 0 阻塞 / 1 提醒（§6.4）。
- **站点真实流量复核（17:50）**：重建后 17:47 起网关日志中后台请求 `model_name=free-auto`，命中 NVIDIA 主 / muse 渠道；少量上游 500 由降级链接住并成功返回，未出现 400 终止。

### 9.5 明确未做 / 遗留

- 未重放任何历史 `failed`（只做只读分类，见 §6.2 第 4 项）。
- 未给 muse 渠道注入 `thinking=false`（站点 `.env` 已强制，站点侧零收益）；ModelScope 保持轻量档（0.5 魔粒/次）；qwen 整组保持垫底、`ds-*` 顾虑随主模型切换基本消解。
- ~~站点真实流量命中 `free-auto` 待复核~~ ⇒ **17:50 已复核通过**（§7 第 2 条 / §9.4）。
- 代码改动与本文档各自单独提交，**未 push**。

---

## 10. 18:50 追加：移除 muse，解除 120s 硬超时错配

### 10.1 现象与根因

站点用 `free-auto` 后偶发 `TimeoutError` → 回执 `unknown` → 文章写 `receipt XXXX outcome unknown`；网关侧后来其实成功了（有 consume log），但回执已收不回来，留下 `received` / `unknown` 残留。根因**不是额度、也不是 400，是时间错配**：

- `packages/backend/src/providers/llm.ts:137` 的 `TIMEOUT_MS = 120_000` 是未配 `fallbackModel` 时的硬上限；`editorial/models.ts` 没配 backup，所以不是 `FAILOVER_TIMEOUT_MS=30_000` 那档。
- 网关的 `free-auto` 串行挨个试渠道：NVIDIA 主渠道近 3 小时有 429 ×9 / 500 ×5 / 504 ×4，第一跳失败后逐级降级，落到 muse 渠道时单段可到 60–164s。
- 本机日志实证：`18:38:56 free-auto → muse 渠道成功，use_time=164s`，**超过 120s**，站点早已放弃。

### 10.2 处置（已执行）

按本人「还是移除这个模型」，摘掉 muse 渠道的 `free-auto` 别名与映射：

- `models`：`free-auto,meta/muse-glimmer-30b` → `meta/muse-glimmer-30b`；`model_mapping` → `{}`。
- 渠道 `status=1`、`priority=195`、`auto_ban=1` 全部保留，**可继续直调 `meta/muse-glimmer-30b`**；符合「不删除 / 不停用渠道」的既有口径。
- `abilities` 已同步：`free-auto` 链 12 → **11 个渠道**，顺序 = NVIDIA 主(200) → ModelScope(185) → OpenRouter ×4(100–97) → qwen ×5(40–36)。
- 登录时撞到 `AUTH_SESSION_LIMIT`（active 会话满 50），按运维手册清理脚本遗留会话（保留最近 5 条 active）后重试成功。

### 10.3 验证

| 项 | 结果 |
|---|---|
| `free-auto` + 站点完整参数 ×3 | **3/3 200**，13.7s / 0.7s / 7.8s，全命中 NVIDIA 主渠道 |
| 移除前对照 | 同参数曾 74.7s / 164s（muse 段），超 120s |
| 网关日志（18:51 起） | 无 400、muse 命中 0、ModelScope 命中 0 ⇒ 魔粒消耗 0 |
| 站点侧 | health 200；新增 `articles.failed` / `receipts.unknown` / `receipts.received` 均为 0 |

### 10.4 结论与未做

- **120s 超时错配已解除**：无需改 `TIMEOUT_MS`、无需换固定模型名（方案 A 暂缓），保留 `free-auto` 的降级能力。代价是 NVIDIA 主渠道仍不稳，后续若 429 频繁会落到 ModelScope（0.5 魔粒/次）或 OpenRouter（常 429），需继续观察。
- 未执行：换 `LLM_MODEL` 为明确模型名、调高超时、停用 / 删除 muse 渠道、重放历史 `failed`、`git push`。
- 回滚：把 muse 渠道的 `models` 加回 `free-auto`，并恢复 `{"free-auto":"meta/muse-glimmer-30b"}` 映射即可。

---

## 11. 11-09 09:11 追加：完工审计（全只读）

### 11.1 当前实配与「改动定位」

- 站点 `.env`：`LLM_MODEL=free-auto` / `LLM_MAX_CONCURRENCY=2` / `LLM_REASONING_TOKENS=10000` / `LLM_EXTRA_JSON` 关思考链 / `COLLECT_ENABLED=true` / `MODEL_CALLS_ENABLED=true`。
- `./up check` 0 阻塞 / 1 提醒、health 200；容器全部 Up，网关容器 Created 未变、`RestartCount=0`。
- **与 11-08 18:51 网关快照做字段级 diff**：`channels` 全字段、`options` 全量、`abilities` 全量、渠道凭据指纹（sha256）**均无差异** ⇒ 本人所说的「更新了 new-api 容器的一些设置」在网关库 / 凭据 / 容器层面检不出变化。近 24h 唯一可见的仓库改动是站点侧 `f252bc7`（只为近 3 小时的未处理 / 失败新闻再付模型费）。**待本人确认具体改了什么**，确认后补记本节，不要凭猜测写。
- 运行表现确实改善：近 6h 已无超 120s 请求、NVIDIA 主渠道的 429 由 ModelScope 在 12.5s 内接住；更像上游状态变化或站点侧提交的效果，而非网关配置改动。

### 11.2 运行验证（流程确实跑好了）

| 窗口 | 结果 |
|---|---|
| 近 2h | 网关 NVIDIA 主渠道成功 106（avg 4.8s / max 45s）、429 38；ModelScope 成功 38（avg 12.5s / max 50s）；站点 articles analyzed 25 / blocked 1、receipts completed 140，**无 failed / received / unknown** |
| 近 6h | 546 条请求、**0 条超 120s** |
| 近 14h | 1337 条日志、**无 400**、muse 命中 0；成功请求最长 307s（集中在 11-08 19:58–22:02 的 10 条，属移除 muse 之后 NVIDIA 主渠道自身抖动，现已消失） |
| 评分 | 13–25 分共 41 条，分布正常 |

### 11.3 仍存在的问题（按优先级）

**P1-1 ModelScope 魔粒速率超日额度**：近 24h 命中按本地日 = 11-08 73 次（36.5 粒）/ 11-09 244 次（122 粒，00:00–09:11）；按约 13.3 粒/h 推算 24h ≈ **318 粒 > 250 粒/日**。根因 NVIDIA 主渠道 429 率约 26%，几乎每次都降级到 ModelScope 轻量档 0.5 粒/次。额度耗尽 → `auto_ban` 禁用该渠道 → OpenRouter（全 429）→ qwen（403 额度耗尽）→ 链路再断，次日自动恢复。**这是当前最可能在几小时内打断链路的单点。**

**P1-2 12 个信源持续失败 + 告警静默**：`sources` ok 19 / failing 12 / unknown 1；失败源 `fail_count` 7–9、`last_ok` 全停在 11-07 10:32–16:34（CNBC ×4、SEC ×2、Google Research、Microsoft Research、Mistral AI、Hugging Face Blog、Import AI、Investing.com），多为 `fetch failed`，Investing.com 为 HTTP 403。`FEISHU_INTERNAL_ENABLED=false` 与 `FEISHU_CONTENT_PUSH_ENABLED=false` ⇒ 日报 / 周报全部 `not sent`，无人收到提醒。

**P2**：① 全库 `receipts.failed=930`（11-06 起）/ `received=7`（最后一条本地 04:37），近 2h 无新增，属历史积压；② 精选新闻卡去重确认 47 小时；③ `main` 领先 `origin/main` **14 笔未 push**（清单见 §11.4）；④ 本人所说的容器设置改动待确认。

**P3**：日报里 4 个旧模型 403 是历史累计（`packages/` 已无引用、近 14h 日志只有 `free-auto`）；SEC EDGAR 8-K 近 7 天 46 篇缺发布时间；昨晚 10 条超 120s 属历史遗留。

### 11.4 未 push 的 14 笔提交（推送前须显式列 deferred items 并等点头）

```
704a8dd docs(handoff): 记录移除 muse 解除 120s 超时错配与复测证据
f252bc7 feat(processing): 只为近 3 小时的未处理/失败新闻再付模型费
f64884a docs(handoff): 记录主模型切 free-auto、OR 降级与 400 终止点复核
d66b6f6 fix(up): free-auto 模型自检由阻塞改为提示，链上 400 终止点已消除
adce249 fix(collect,web): 图片取不到时不留破图，抓取失败干净降级
b289edd docs: Firecrawl 正文兜底列为第 8 项顺延事项（本人拍板先不接）
fde5d3a feat(feed): 列表卡片标注没有正文的条目
ebc3b86 docs: 新增 2026-11-07 正文显示与模型链路交接文档
ae7a28c docs: 入库 2026-11-07 板块 RSS 交接快照
163629e feat(i18n): 关闭正文自动翻译，正文保留英文原文
166f3d9 fix(llm): 给所有模型调用加统一并发闸门
f6de197 feat(board): 新增两个板块级摘要 RSS（精选席位口径）
08437d3 docs: RSS 结论翻转为口径 B 实施，定稿机器内可达边界
2db5a55 docs: 同步接入契约口径，关闭 deferred 第 3 项板块级 RSS
```

**Deferred（本轮明确未做）**：未修 P1 / P2 任何一项、未重放历史 `failed`、未清理 `received` 残留、未打开飞书告警、未 push；本轮为全只读审计 + 文档更新。

---

## 12. 11-10 10:50 追加：`free-auto` 计费倍率置 0

### 12.1 背景与决策

- 本人明确**尽量不动源码**（之后要 pull 上游，避免冲突）：站点全程走免费上游额度、没有真实付费，控制台不应显示金额消耗；token 消耗已正常显示，展示层不必改。
- 方案：只把逻辑模型 `free-auto` 的 `ModelRatio` 倍率设为 0 —— 运行时配置、热更新、不改源码 / 不重建容器、可回滚；以后付费 key 用**具体模型名**走正常计费。
- 根因核实：网关 `GetModelRatio` 按**模型名**取倍率，内置默认表里没有 `free-auto`，于是回退默认 `37.5`；`model_price=-1` 表示按倍率计费。校验只拒绝负数，**0 合法**。

### 12.2 执行与验证（已落地）

- `GET /api/option/` 返回的是 `{"key","value"}` 数组；读出完整 `ModelRatio`（235 条内置默认倍率），**只加 `free-auto:0` 后整体写回**：读回 236 条、原有 235 条零改动。
- 注意 `UpdateModelPricingOptions` 对该配置是**全量 JSON 覆盖**，不能只提交 `{"free-auto":0}`，否则会抹掉其它模型倍率；改完由 `RefreshPricing()` 热更新，**无需重启容器**。
- 管理登录又撞 `AUTH_SESSION_LIMIT`（active 满 50），按运维手册清理脚本遗留会话（保留最近 5 条 active）后重试成功。

| 验证项 | 结果 |
|---|---|
| `free-auto` ×2 | HTTP 200；`quota=0`、`model_ratio=0`、**tokens=35 仍完整记录** |
| 具体模型名直调 | HTTP 200；`quota=1313`、`ratio=37.5` ⇒ **其它模型计费正常**，付费 key 走具体模型名不受影响 |
| 改动前对照 | 同款 `free-auto` 请求 `quota=148800`、`ratio=37.5` |
| 展示层（按要求未动） | `quota_display_type=USD` / `display_in_currency=True`；金额列现在显示 **$0.00**，token 列照常 |
| 站点 | health 200 |

### 12.3 约束与回滚

- **以后付费 key 不能用 `free-auto` 这个模型名**：倍率按模型名全局生效，不分渠道 / token；用具体模型名或另设别名。
- **回滚**：从 `ModelRatio` 里删掉 `free-auto` 条目（或写回完整原值备份）即恢复默认 37.5；改动只影响之后的调用，历史日志不变。完整原值已备份为本地临时快照（不入库，sha256 前缀 `6e7808d8…`）。
- 本次改动落在网关数据卷的 `options` 表，**没有文件改动、无需重启、不影响以后 pull**；本次仅提交文档，**不 push**。

### 12.4 明确未做

- 未改展示层（`quota_display_type` 仍 USD）、未改任何源码 / 渠道 / 站点 `.env`。
- 未修 §11 的 P1（ModelScope 魔粒速率超日额度、12 个信源持续失败且飞书告警关闭）、未清理历史回执。
- 26 小时内 admin session 又从 5 累积到 50，来源未查（下次再撞 `AUTH_SESSION_LIMIT` 时按 §12.2 清理）。
