# 方案：用 WorkBuddy 积分模型补 dailyHOT 的 LLM 额度

> **状态：已搁置（2026-11-10 14:38 用户决定不走积分路线）**。保留本文作为可行性结论与协议差异的存档；实际采用「高消耗源减量」方案，见 `docs/plan-quota-trim-sources.md`。
> 本文只出方案，**未改任何代码、配置、数据库，未激活任何云服务**。
> 只写通用结构，不含本机地址、凭据、个人信息。

---

## 0. 结论先行

1. 「WorkBuddy 里的模型」有两种，能接到 dailyHOT 的**只有第二种**：
   - **A. 会话 / 自动化里跑的模型**（当前助手用的）：确实消耗积分，但只在会话内可调用，短时凭证、需要会话在线 ⇒ **不能给 7×24 的 Docker worker 当常驻 API**。
   - **B. WorkBuddy 云服务 LLM API**：免密钥、按次消耗创建者积分（响应末帧有 `usage.credit`、错误码 `quota_*`），是唯一能被程序调用的积分通道。
2. **不能只改 `LLM_BASE_URL` 就切过去**：协议、鉴权、参数三处不兼容（§2），中间必须加一层本地协议桥。
3. **比换供应商更优先的是减量**：当前 2892 次模型请求 / 天、约 1218 万 tokens / 天，其中 46% 的条目最终 <40 分、连浏览出口都进不去，钱已经先花掉。全量切积分＝花钱买废调用。
4. 推荐阶梯：**R0 减量（0 积分）→ R1 本地桥 + 云 LLM 小样本试点 → R2 按步骤分级切换**；R2 里另留一条「站外积分加工」旁路，专做公众号稿 / 日报稿。
5. R1 有明确 **Go / No-Go 判据**：Node 侧 SDK 能否通过 Origin 校验、新模型输出能否过引擎的 zod schema。任一不通过就退回「减量 + 站外积分加工」，不硬上。

---

## 1. 现状与根因

| 环节 | 近 24h 实测（11-09 交接） |
|---|---|
| 入库条目 | 537 |
| 模型请求 | **2892 次（≈5.4 次/条）≈ 1218 万 tokens** |
| 429 `free-models-per-day` | 50 次，额度已耗尽 |
| 产出 | 509 publications / 233 条 ≥40 分 / **21 selected** |
| 无效占比 | **46% 条目 <40 分**，`browseFloor=40` 之下不展示 |

**根因**：逐条重 LLM 链（score / prefilter / structure / story_digest / summarize / understand / group 等）对每一条新入库材料全额执行，缺少「规则粗筛前置」。免费额度是三层里的第三层（OpenRouter 账号级每日免费请求数，按日重置、换渠道或换 `:free` 模型都绕不开），本地无解。11-09 只做了 A 档减量（停用 2 个源，约省 13%），所以「还是不够」。

抓取本身不调模型，降 `interval` 无效；`tier=EXCLUDE_MP` 只挡入选不挡评分；能真正省额度的只有 `participation_mode=hot_signal`、采集阶段 `ingestNoiseFilter` / `denyCategories`，以及减少入库条目数。

---

## 2. 可行性核验：三处不兼容

| 维度 | AIHOT 引擎（`providers/llm.ts`） | WorkBuddy 云 LLM | 结论 |
|---|---|---|---|
| 传输 | 非流式 `POST /chat/completions`，等一个完整 JSON | **只支持 `stream: true` 的 SSE**；省略 / `false` 被 SDK 以 `request_stream_required` 拒绝 | 必须做 SSE→JSON 适配 |
| 响应解析 | `choices[0].message.content` + `usage` | 只有 `ChatCompletionChunk` 增量帧，末帧才是 `usage` | 必须累积 delta 并重组 `ChatCompletion` |
| 鉴权 | `Authorization: Bearer <LLM_API_KEY>` | `endpoint` + `publishableKey`；web 侧校验 Origin 精确匹配，应用归属由 publishableKey 决定 | Bearer 会被忽略；需按官方 SDK 初始化 |
| system 消息 | 部分 prompt **没有** system（引擎源码注释明确） | 要求 `messages[0]` 必须是 system，否则报错 | 桥要补一条默认 system |
| 采样参数 | `temperature` / `max_tokens` / `response_format: json_object` / `LLM_EXTRA_JSON` 展开的厂商字段 | 支持前三者；`top_k` 无效、厂商自定义 extra 不支持 | 需要参数白名单，丢弃的字段要计数 |
| 用量与预算 | 引擎有 receipts + 预算熔断 | SDK **不暴露**用量 / 配额 / 账单，只有控制台；`model.credits` 只是展示文案 | 桥必须自己做日预算闸门与本地台账 |

补充：`connect_cloud_service` / `connect_open_platform` 一类短时凭证面向 skill 运行时，需会话在线，不适合 worker 常驻，不作为候选通道。

---

## 3. 路线对比

| 路线 | 做法 | 改动面 | 积分 | 保住端到端链路 | 判定 |
|---|---|---|---|---|---|
| **R0 减量** | 规则粗筛前置、只对头部条目动 LLM、同事件簇限额、Yahoo 减标的 | `industry/sources.json` + DB 源配置，不动核心 | 0 | ✅ | **P0 前置，必做** |
| **R1 本地协议桥** | 本机 Node 服务把云 LLM 的 SSE 伪装成 OpenAI 兼容非流式端点，`LLM_BASE_URL` 指向它 | 新增 `tools/llm-bridge/` + `.env` 4 行 + `NO_PROXY` 1 行 | 可控 | ✅ | **推荐主路径** |
| **R2 站外积分加工** | WorkBuddy 自动化用会话模型写精选稿 / 日报稿，产物经 `./up ingest` 反哺 | 自动化 prompt + 一个 CSV/JSON 产物 | 低 | ❌ 日报另起一套 | **旁路补充** |
| R3 给上游充值 | OpenRouter 加 credits | 0 | 现金，非 WorkBuddy 积分 | ✅ | 排除：不是用户要的通道，且触碰「只用免费源」红线 |
| R4 改引擎适配 SSE | 直接改 `providers/llm.ts` 用云 SDK | 动 `packages/` 核心 | 可控 | ✅ | 排除：破坏 receipts / 预算熔断语义，与上游合并必冲突 |

**R2 的硬边界**：`POST /api/ingest/items` 只能写 `title / url / author / publishedAt / raw`，**写不了 `score` / `publications` / `body_text`**，且反哺条目仍会进入引擎的加工队列。所以站外加工结果不能替代引擎的精选与日报，只能作为「成品稿」入站或站外分发（公众号）。这点必须先讲清楚，避免误以为能绕开引擎。

---

## 4. 推荐方案 R1：本地协议桥详细设计

### 4.1 组件与边界

| 组件 | 位置 | 职责 |
|---|---|---|
| `llm-bridge` | `tools/llm-bridge/`（独立目录，不进 compose、不动 `apps/` / `packages/`） | 监听 loopback，对外 OpenAI 兼容；对内用 `@tencent-ai/workbuddy-cloud-sdk@dev` 调云 LLM |
| 云应用环境 | WorkBuddy 云服务，新建或复用一个应用 | `inspect → activate`（UI 弹窗由用户确认）后取 `publicConfig.endpoint` / `publishableKey` |
| 站点侧 | `.env` 的 `LLM_BASE_URL` / `LLM_API_KEY`(占位) / `LLM_MODEL` / `LLM_EXTRA_JSON`，compose 的 `NO_PROXY` | 指向桥；改完只需 recreate `api` / `worker`，**不需要 rebuild**（没改镜像代码） |
| 凭证 | 本机 `.env`，不入库、不进日志、不进文档 | `endpoint` / `publishableKey` 只从 `publicConfig` 取，不硬编码、不从别处推导 |

### 4.2 协议映射（桥内部）

| 入（引擎 → 桥） | 出（桥 → 云 LLM） |
|---|---|
| `POST /v1/chat/completions`，Bearer 头 | 忽略 Bearer；用 SDK 初始化好的 client |
| `messages[0]` 无 system | 补默认 `{role:'system', content:'You are a precise structured-output assistant. Reply with JSON only.'}` |
| 白名单字段 | `model` / `messages` / `temperature` / `max_tokens` / `response_format` / `stream: true` / `stream_options:{include_usage:true}` |
| 丢弃并计数 | `LLM_EXTRA_JSON` 展开的厂商字段、`top_k`、任何未知字段 |
| SSE 帧 | 只累积 `delta.content`（`reasoning_content` 单独丢弃），直到 `[DONE]` |
| 重组响应 | `{id, object:'chat.completion', created, model, choices:[{index:0, message:{role:'assistant',content}, finish_reason}], usage}` |
| `usage` | 从末帧映射 `prompt_tokens` / `completion_tokens` / `total_tokens`；`credit` 写本地台账 |
| 错误 | `auth_*`→401、`quota_*`→429（带 Retry-After）、`gateway_*` / `model_*`→503、超时→504，保持引擎 circuit / receipts / 重试语义 |

### 4.3 积分预算闸门（P0，必须先于切换存在）

- 每日调用数上限、每日 token 上限、单请求超时（需小于引擎的 30s failover）、并发上限。
- 超限直接 429 + 本地告警，**不静默降级回免费源**（避免两头同时烧）。
- 本地台账按小时记 `calls / tokens / credit`；SDK 没有用量接口，账单以 WorkBuddy 控制台为准，每周人工核对一次。
- 冻结开关：一个 env 布尔，置 false 时桥对全部请求返回 429，站点自动回到「无模型」状态。
- 桥只 bind loopback，不对外暴露；不手工拼 `/.cloud/llm/*` 路径，一律走 SDK 方法。

### 4.4 为什么值得这么做

receipts、circuit、3h 重处理窗口、归组、日报全部保持原样，**端到端链路不破**（这是本项目自用练手的首要目标）。回滚＝`.env` 改回原 `LLM_BASE_URL` + recreate 两个容器，零代码回滚。

---

## 5. 分期实施与验证

| 阶段 | 动作 | 涉及文件 | 动核心 | 验证判据 | 复杂度 | 积分 |
|---|---|---|---|---|---|---|
| **P0-1 减量** | Yahoo 减标的、采集阶段 `ingestNoiseFilter` 粗筛、低价值源降级 `hot_signal` | `industry/sources.json` + DB 源配置 | 否 | 24h 后 `requests/日` 明显下降、`selected` 数记录基线 | 中 | 0 |
| **P0-2 云环境 + spike** | 激活云应用；Node 侧最小脚本 `models.list()` + 一次 `json_object` 流式调用 | `tools/llm-bridge/spike.mjs` | 否 | 拿到合法 JSON、`usage.credit`、无 `auth_*` | 低 | 极少 |
| **P0-3 Go/No-Go** | 100 次小样本；10 条真实条目跑 `score_article` prompt | 同上 + 台账 | 否 | **① Node 侧 Origin 校验放行；② zod schema 通过率；③ 单次 credit / 延迟 / 失败率** | 中 | 小样本 |
| **P1 实现桥** | 参数白名单、SSE→JSON、错误映射、预算闸门、本地台账 | `tools/llm-bridge/` | 否 | 单元测试 + 引擎侧 10 条端到端 | 中高 | 受限 |
| **P1 站点切换** | `.env` 4 行 + `NO_PROXY`，recreate `api`/`worker` | `.env`、`docker-compose.yml` | 否 | `./up smoke`、receipts 落库、`publications.score` 正常 | 低 | 受限 |
| **P2 分级** | 按步骤配模型（`site/models.ts` 的 `PRESETS` / `DEFAULTS` 已支持）：低价值步骤留免费源，精选与日报走积分 | `site/models.ts` + `.env` | 否 | 成本与产出对比 | 中 | 可控 |
| **P2 旁路** | 自动化用会话模型写日报稿 / 公众号稿 → `./up ingest` | 自动化 prompt + 一份 CSV | 否 | 成品稿可读性 | 低 | 低 |

> 改 `site/models.ts` 属于 `site/` 层，符合「定制不动核心」的约定；`DEFAULTS` 目前为空，按步指定不会破坏现有行为。

---

## 6. 成本口径（不编数字）

- 基线：**2892 次 / 1218 万 tokens 每天**。
- R0 目标：入库压到约 60–110 条/日 ⇒ 约 **300–600 次 / 130–250 万 tokens 每天**（按 5.4 次/条外推，需实测校准）。
- 单价：用 P0-3 的 100 次小样本 `usage.credit` 反推「积分 / 千 tokens」，再外推日 / 月成本。`model.credits` 是展示文案不是计价事实，账单只在控制台。
- 控制：日预算闸门 + 先跑 3 天小流量 + 每周控制台核对。
- 明确不做：`<40` 分的 46% 条目不再走任何付费通道。

---

## 7. 风险与红线

| 风险 | 处置 |
|---|---|
| Node 侧 SDK 被 Origin 校验拒绝 | **R1 判 No-Go**，退回 R0 + R2；不伪造 Origin 绕过安全边界 |
| 新建云应用占应用名额、需 UI 确认 | 列入待用户拍板项，不代用户确认 |
| SSE 长请求撞引擎 30s failover | 桥超时设 <30s 并映射 503，避免双份计费 |
| 新模型输出分布变化、zod 大量 `unusable output` | P0-3 先验 10 条，不通过不切 |
| 积分失控 | 日闸门 + 冻结开关 + 本地台账 + 控制台周核对 |
| `endpoint` 随应用重发变化 | 只从 `publicConfig` 取、落本机 `.env`，不硬编码；变更时重新取 |
| 凭证泄漏 | publishableKey 不入库 / 不进日志；桥只 bind loopback |

**红线**：不动 `apps/` / `packages/` 核心；不引入付费上游；不在 CI 跑积分调用；不把积分通道做成公开代理；不用会话短时凭证伪装常驻 API。

---

## 8. 需要用户拍板（3 项）

1. 是否同意**新建 / 复用一个 WorkBuddy 云应用**作为积分通道？会弹 UI 确认，并占用 1 个应用名额。
2. **积分日预算上限**：建议先按 100 次 / 日 × 3 天小样本，P0-3 拿到实测单价后再定长期额度。
3. 是否接受 **R0 减量导致精选条数下降**（21 条/日 → 预计 10–15 条/日）？如果不接受，只能靠积分把减量部分买回来，成本会明显上升。

---

## 9. 明确不做

- 不改 `LLM_BASE_URL` 直连云服务（协议不通，会全链路失败）。
- 不改 `providers/llm.ts` 去适配 SSE（动核心、破坏回执、上游合并冲突）。
- 不给 OpenRouter 充值，不为绕额度换输出质量更差的 `:free` 模型。
- 不把会话内模型（当前助手）伪装成常驻 API；不用短时凭证支撑 worker。

---

## 10. 文档归属

本文是设计层方案，与 `docs/sop.md`（命令手册）、`docs/deferred-items.md`（顺延事项）、`docs/handoffs/`（交接）并列；实施后的实测数据另记交接文档。
