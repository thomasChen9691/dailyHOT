# 方案：模型质量下限（≥9B）与魔粒成本的取舍

> ⚠️ **已被 `docs/plan-quality-first-2026-11-12.md` 替代（2026-11-12 20:45）**。
> 用户已明确**放弃「省魔粒」、改为质量优先**；并实测发现 ModelScope 几乎零调用、NVIDIA 劣化时不会自动切换。
> 本文件保留作决策沿革，其中「保留轻量档 0.5 魔粒」「省魔粒」相关结论**不再适用**；实测数据与 ≥9B 质量下限的判断仍有效。
>
> 2026-11-12 00:15。**只出方案，未改任何代码/配置**（当时线上仍是 11-11 23:55 的配置）。
> 只写通用结构，不含本机地址与凭据。

## 1. 结论先行

1. **「≥9B 质量下限」与「省魔粒」直接冲突**。ModelScope 的轻量档（0.5 魔粒/次）几乎全是小模型：
   `ZhipuAI/GLM-4.7-Flash`（`Glm4MoeLite`）、`nex-agi/Nex-N2.5-mini`、`meituan-longcat/LongCat-Flash-Lite`、
   `stepfun-ai/Step-3.5-Flash` 等。要 9B 以上，就得付主流档 1 魔粒，或走 NVIDIA 免费池。
2. **当前线上配置违反该下限**：`free-auto` 在 `#33` 映射到 `nemotron-3.5-bolt-e4b`（4B 激活）。必须改。
3. **NVIDIA 侧 ≥9B 且能正常出话的只有一个**：`nvidia/nemotron-3.5-super-vl-120b-a12b`（120B 总 / 12B 激活）。
   实测小输出 29.7s、长输出（844 思考 + 498 正文）35.6s，可用。
4. **但它每次烧约 800 reasoning token**，而引擎默认 `maxTokens=1500`（评分步为 1024）——
   不加余量会把预算吃光并返回 `content: null`。**这是必须同时改的第二处**，否则换了模型照样失败。

## 2. 关键数据

### 2.1 各步骤调用量（近 24h，成功回执）

| 步骤 | 调用 | 平均输出 token | 说明 |
|---|---:|---:|---|
| score_article | 537 | 259 | 决定是否入选，价值最高 |
| prefilter_article | 345 | 60 | 数量大、输出极小 |
| structure_article | 273 | 516 | |
| story_digest | 150 | 401 | |
| summarize_article | 141 | 556 | |
| understand_article | 84 | 1335 | 输出最长，最容易被预算截断 |
| group_* 系列 | 182 | 246–703 | 归组/关联 |
| **合计** | **≈1712** | | |

### 2.2 候选模型实测（同一受控 prompt）

| 模型 | 规模 | 延迟 | 结果 | 成本 |
|---|---|---|---:|---|
| `nvidia/nemotron-3.5-super-vl-120b-a12b` | 120B / 12B 激活 | 29.7s（10 token）<br>35.6s（1240 token） | ✅ 合法 JSON 与长正文 | **0**（NVIDIA 免费池） |
| `nvidia/nemotron-3.5-bolt-e4b` | 4B 激活 | 1.5s | ✅ 合法 JSON | 0 —— **低于 9B 下限，应淘汰** |
| `Qwen/Qwen3.8-27B` | 27B dense | 1.4–11s | ✅ | ModelScope 主流 **1 魔粒/次** |
| `nex-agi/Nex-N2.5-mini` | Lite MoE | 1s 级 | ✅（偶发 429） | 轻量 0.5 魔粒 —— 规模不达标 |
| `stepfun-ai/step-5-preview` | — | 140s 超时 | ❌ | — |
| `mistralai/mistral-large-4-1t-a52b` | — | 150s 超时 | ❌ | — |
| `meta/muse-glimmer-30b` / `minimax-m3.1-flash` | — | 150s 超时 | ❌ | — |
| 旧 `free-auto` 映射 `nemotron-3-ultra-550b` | — | 1.4s | ❌ 输出乱码 | — |

### 2.3 预算算术（最容易踩的地方）

`packages/backend/src/providers/llm.ts:149`：

```
maxTokens = max(opts.maxTokens ?? 1500, 512) + reasoningTokens
```

- 普通步骤默认 1500，评分步用 `scoreCall.maxTokens = 1024`
- `super-vl-120b` 每次思考约 844 token
- ⇒ 不设余量时：1500 − 844 = **656 token 留给正文**，`understand_article`（需 1335）必然被截断
- ⇒ 实测印证：`max_tokens=1200` 时 `content` 为 **null**（全被思考吃掉）；给到 3000 则正常返回 498 字正文

引擎已有现成开关，**不需要改代码**：`LLM_REASONING_TOKENS`（`llm.ts:69`），全局加到每一步的预算上。

## 3. 三个方案对比

| | 方案 A：全量 NVIDIA 120B | **方案 B：A + ModelScope 主流档兜底（推荐）** | 方案 C：按步骤分级 |
|---|---|---|---|
| 主模型 | `super-vl-120b-a12b` | 同 A | 高价值 120B，低价值走轻量 |
| 兜底 | 无（单点） | `Qwen3.8-27B`（1 魔粒） | 同 B |
| 魔粒 | 0 | 仅兜底时消耗，≤250 次/日 | 约 250/日 |
| 质量 | ✅ ≥9B | ✅ ≥9B | ❌ 低价值步骤跌破 9B，与你的要求冲突 |
| 风险 | NVIDIA 单模型劣化即全站停摆 | 兜底受限于每日 250 魔粒 | 复杂度最高、收益最小 |

**推荐 B**：主力用免费且达标的 120B，ModelScope 主流档 27B 只做兜底。放弃「省魔粒」的幻想——
每日 250 魔粒最多 250 次，相对 1700 次/日的需求只占 15%，省不出效果；**质量优先时，魔粒不是主战场**。

## 4. 具体改动（确认后执行，共 4 处）

| # | 位置 | 改动 | 影响 |
|---|---|---|---|
| 1 | 网关 `#33` 的 `model_mapping.free-auto` | `nemotron-3.5-bolt-e4b` → `nvidia/nemotron-3.5-super-vl-120b-a12b` | 满足 ≥9B；需重启 new-api |
| 2 | 网关 `#35` 的 `model_mapping.free-auto` | `nex-agi/Nex-N2.5-mini` → `Qwen/Qwen3.8-27B` | 兜底用 27B；按次 1 魔粒 |
| 3 | `.env` | 新增 `LLM_REASONING_TOKENS=1200` | 预算 1500→2700、评分 1024→2224，容纳思考+正文 |
| 4 | `.env` | `LLM_MAX_CONCURRENCY` 2 → 4 | 单次 30–36s，需并发换吞吐 |

**不做**：不改 `packages/`、不改 `site/models.ts`、不引付费源、不降低质量下限。

## 5. 验证与回滚

验证（改后 30 分钟内）：
- `free-auto` 单测：应返回 `model=nvidia/nemotron-3.5-super-vl-120b-a12b` 且 `content` 非 null
- `understand_article` 与 `structure_article` 回执 `completion_tokens` 应低于 `maxTokens`（未触顶）
- 各步骤 zod 解析失败率 = 0；吞吐 ≥ 4 次/分钟
- ModelScope 调用数应接近 0（仅兜底）

回滚：网关库备份 `/data` 整库快照仍在；`.env` 改动删掉 `LLM_REASONING_TOKENS` 行、并发改回 2 即可。

## 6. 风险

1. **单点依赖**：NVIDIA 只有这一个达标模型。一旦它劣化（今天已出现 500 `do request failed` 与超时），
   全站退化为「ModelScope 250 次/日」，约 1 小时耗尽。**这是放弃多渠道的直接代价。**
2. **延迟**：30–36s/次 × 1700 次/日 ÷ 4 并发 ≈ 4–5 小时，理论够用；但排队会放大端到端延迟，
   `TIMEOUT_MS=120s` 下长输出仍有截断风险。
3. **reasoningTokens 是全局的**：给 1200 会让所有步骤的预算都放大（含输出极小的 prefilter），
   对免费池无成本影响，但若日后切回按 token 计费的渠道会增加花费。
4. **`Qwen3.8-27B` 今日已出现 429**，兜底未必随时可用。

## 7. Action items

| 级别 | 动作 | 说明 |
|---|---|---|
| **P0** | 执行 4 处改动并验证 | 当前 bolt-e4b 违反质量下限，越快越好 |
| **P0** | 改后盯 2 小时：`content=null` 数、zod 失败数、吞吐 | 判定 120B 是否真的扛得住 1700 次/日 |
| **P1** | 若吞吐不足，先调并发到 6，再考虑降采集量（`industry/sources.json` 与 DB） | 不要先动超时常量 |
| **P1** | 为 120B 准备第二个达标备选：重新启用 `#34 dashscope`（`qwen3.8-flash`）或 `#29 ds-qwen3.8-27b`，核对是否 ≥9B 与剩余免费额度 | 破除单点依赖 |
| **P2** | 若确认要利用每日 250 魔粒：只把 `prefilter`（345 次、60 token）切到 ModelScope 主流档，其余留 NVIDIA | 与 ≥9B 不冲突（27B），但收益仅约省 0 魔粒，实际是「用掉会过期的额度」 |
| **P2** | `site/models.ts` 按步骤分级（PRESETS + DEFAULTS） | 当前无必要，仅当 P2 落地时才需要 |

## 8. 需要你确认

1. 是否接受**放弃「省魔粒」**、以质量为先（推荐方案 B）。
2. 是否接受 `LLM_MAX_CONCURRENCY` 由 2 提到 4（会同时增加网关与上游并发压力）。
3. 是否同意**重新启用一条 dashscope/ds-* 渠道**作为 120B 的备选，破除单点依赖。
