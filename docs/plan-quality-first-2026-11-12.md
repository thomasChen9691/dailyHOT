# 方案 v2：思考模式、NVIDIA 小模型规避、上游单点挂起

> 2026-11-12 21:25（北京时间）出方案；**21:45–21:55 已按第 8 节拍板执行 P0**（执行状态见下）。
> 替代本文 v1（20:45 版，commit `b194ea2`）与 `docs/plan-model-quality-floor.md`。
> 只写通用结构与实测口径，不含本机地址、凭据、个人信息。

## 执行状态（2026-11-12 21:55）

| 项 | 结果 |
|---|---|
| `#33` `free-auto` | 已切到 `nvidia/nemotron-3.5-super-vl-120b-a12b`，网关日志 `upstream_model_name` 已核实 |
| `#35` `free-auto` | 已切到 `Qwen/Qwen3.8-27B`（用户选定） |
| `.env` | `LLM_REASONING_TOKENS=10000 → 0`；`LLM_EXTRA_JSON` / `LLM_MAX_CONCURRENCY=2` / `LLM_MODEL=free-auto` **均未改** |
| api / worker | 已 recreate，容器内环境变量核对通过 |
| 并发 4 | **按拍板推迟**，维持 2，待上游稳定后单独评估 |
| 冒烟 | `free-auto` 短请求 3/3 成功（0.6–3.7s）、`reasoning_tokens=0`、JSON 合法 |
| `unknown` 放行 | 窗口内 13 条，走官方 `releaseReceipt` 路径 `released=13 requeued=8 skipped=0` |
| 重启代价 | 15 条 `connect failed`（集中在网关停机的 21:45:20–27），按退避重试；非新模型问题 |
| 回滚点 / 巡检预案 | 见 `docs/llm-failover-runbook.md` |

第 8 节「待拍板」4 项已全部确认：选项 A、`Qwen3.8-27B`、并发 4 推迟、口径确认。**P1 观察 2 小时尚未完成**，评分回升需在观察期后判定。

## 0. v1 → v2 变更

| 项 | v1 结论 | v2 修正依据 |
|---|---|---|
| 思考模式 | 顺带把 `LLM_REASONING_TOKENS` 清 0，理由是「无谓余量」 | 实测证明 `LLM_EXTRA_JSON` 的 `thinking:false` **已经在生效且是 token/吞吐的关键阀门**；`REASONING_TOKENS` 根本不是思考开关。两者必须分开处理，且前者是红线 |
| `#35` 兜底 | 改回 `Qwen/Qwen3.8-27B`，理由是「质量对齐」 | 实测 ModelScope 侧 ≥9B 模型**全是强制思考模型**，`thinking:false` 关不掉，评分系统性偏高（72–85 vs NVIDIA 45–65）⇒ 会引入降级时的分布跳跃，需重新选 |
| 并发 2 → 4 | P0 一次执行 | 本轮实测 NVIDIA 上游整体挂起，**提高并发会放大同时挂起的请求数**，建议推迟到上游稳定后 |
| 最紧迫问题 | 评分塌陷 + 「按耗时不能自动降级」 | 新增 P0：**NVIDIA 上游间歇整体挂起**（9/9 候选超时、ModelScope 6/6 全成功），这才是「新闻几小时没更新」的直接根因，换模型解决不了 |

## 1. 结论先行

1. **思考模式不需要「关闭」，它早就关了，而且绝对不能删。** `.env` 的 `LLM_EXTRA_JSON={"chat_template_kwargs":{"thinking":false}}` 会被展开进请求体（`llm.ts:214`），实测能透传到 NVIDIA：120B 在 OFF 下输出 **10 token / 0 思考 token / 0.6–22s**，默认或 `thinking:true` 下变成 **657–728 token / 646–717 思考 token / 30–72s**。输出 ×65–73、耗时 ×3–30。用户「处理新闻不需要思考」的判断成立，系统已经按此运行。
2. **`LLM_REASONING_TOKENS=10000` 不是思考开关，清掉它省不了 token。** 它只是 `max_tokens` 的加数（`llm.ts:149`：`max(opts.maxTokens ?? 1500, 512) + reasoningTokens`），不产生任何 token。近 24h 实际消耗 **3674 次调用 / 输入 1183 万 token / 输出 63.6 万 token**，输出只占 **5.1%**；即便把输出全砍掉也只省 5%。清 0 的真实理由是消除 `65536 → 75536` 这类超大上限，并让「思考没关住」以 `finish_reason=length` 显性暴露，而不是静默产出。
3. **NVIDIA 侧小模型确认必须换。** `free-auto` 当前映射到 `nvidia/nemotron-3.5-bolt-e4b`（4B 激活），是评分系统性偏低的源头。渠道 `#33` 白名单 11 个模型按「≥9B + 非强制推理 + 实测可用」筛，**唯一合格主力是 `nvidia/nemotron-3.5-super-vl-120b-a12b`**（120B / 12B 激活，免费）。
4. **ModelScope 不是「省不省魔粒」的问题，而是模型族全在思考。** 六个候选带 `thinking:false` 实测仍输出 204–1687 个思考 token，评分 62–85，普遍高于 NVIDIA 关思考口径。兜底模型要按「评分分布接近主力 + 延迟低」选，不能只看参数量。
5. **本轮最紧急的发现：NVIDIA 上游此刻整体挂起，ModelScope 正常。** 21:00–21:22 期间 9/9 NVIDIA 候选 30s 超时（含 4B），120B/4B 复测 25s 仍超时；同一网关、同一时刻 ModelScope 6/6 全部 200。网关最近一条完成日志停在 20:55，之后 26 分钟无新记录（请求挂在上游未返回）；近 2h `#33` 421 次 / `#35` 4 次，30 次耗时 >120s；生产近 30 分钟 84 次调用中 13 次 `TimeoutError`（15.5%）。**这才是「新闻几小时没更新」的直接根因，且换模型修不了。**

## 2. 思考模式实测（同一 prompt、同一网关）

| 模型 | 参数 | 耗时 | completion | reasoning | 评分 |
|---|---|---:|---:|---:|---:|
| `nemotron-3.5-super-vl-120b-a12b` | `thinking:false`, max 11200 | **0.6s** | **10** | **0** | 45 |
| 同上 | `thinking:false`, max 1500 | 22.0s | 10 | 0 | 45 |
| 同上 | 不带 extra（默认思考） | 72.0s | 657 | 646 | 70 |
| 同上 | `thinking:true` | 30.0s | 728 | 717 | 70 |
| `nemotron-3.5-bolt-e4b`（4B，现状） | `thinking:false` | 0.9s | 9 | 0 | 65 |
| `Qwen/Qwen3.8-27B` | `thinking:false` | 6.1–7.6s | 217–239 | 205–227 | 72 |
| `Qwen/Qwen3.8-27B` | 不带 extra | 4.7s | 239 | 227 | 72 |

结论：

- **`chat_template_kwargs.thinking:false` 对 NVIDIA 生效、对 ModelScope Qwen 系不生效**。前者必须保留；后者是模型族自带思考，配置层关不掉。
- 思考会**系统性抬高评分**（120B：45 → 70；ModelScope：72–85）。用户要修的「4B 打低分」若换成强制思考大模型，会变成「打高分」，是另一种分布偏移。
- `max_tokens` 1500 与 11200 在相同开关下耗时无系统性差异（0.6s / 22s 的波动来自上游排队），**不是慢请求的原因**。

## 3. NVIDIA 渠道模型筛选（规避小模型）

`#33` 白名单 11 项，逐项判定：

| 模型 | 规模 | 判定 |
|---|---|---|
| `nvidia/nemotron-3.5-super-vl-120b-a12b` | 120B / 12B 激活 | ✅ **唯一合格主力**；关思考后 0.6–22s、JSON 合法、`rsn=0` |
| `nvidia/nemotron-3-ultra-550b-a55b` | 550B / 55B | ❌ 历史返回乱码；本轮 30s 超时 |
| `mistralai/mistral-large-4-1t-a52b` | 1T / 52B | ❌ 历史 150s 超时 |
| `stepfun-ai/step-5-preview` | 大 | ❌ 历史 150s 超时 |
| `minimaxai/minimax-m3.1-flash` | 大 | ❌ 历史 150s 超时 |
| `meta/muse-glimmer-30b` | 30B | ❌ 历史 150s 超时，对应渠道 `#36` 已退出调度 |
| `nvidia/nemotron-3.5-bolt-e4b` | **4B 激活** | ❌ **当前映射，必须换** |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | 30B / **3B 激活 + reasoning** | ❌ 激活量小且强制思考，双重规避 |
| `poolside/laguna-xs-2.1` | xs | ❌ 规避 |
| `fengze-main` | 映射到 550B | ❌ 同 550B |
| `free-auto` | 别名 | ✅ 保留，两级路由入口 |

⚠️ 用「总参数量」判断会踩坑：`30b-a3b` 看着 ≥9B，但激活只有 3B 且是 reasoning 模型；`120b-a12b` 激活 12B，才是真正的下限。**规避口径应写「激活参数 ≥9B 且非强制推理」**。

### ModelScope 侧候选（均带 `thinking:false`，统一 prompt）

| 模型 | 耗时 | completion | reasoning | 评分 |
|---|---:|---:|---:|---:|
| `deepseek-ai/DeepSeek-V4.1-Flash-1017` | **2.1s** | 213 | 204 | **62** |
| `Qwen/Qwen3.8-27B`（27B，v1 推荐） | 6.1s | 217 | 205 | 72 |
| `ZhipuAI/GLM-5.2` | 11.2s | 374 | 366 | 85 |
| `Qwen/Qwen3.5-122B-A10B` | 14.3s | 1645 | 1632 | 85 |
| `Qwen/Qwen3.5-27B` | 24.8s | 1699 | 1687 | 75 |
| `nex-agi/Nex-N2.5-mini`（#35 现状） | 24.8s | 97 | 未上报 | 74 |

两个可选兜底：

- **`Qwen/Qwen3.8-27B`**：明确 27B、质量对齐，但评分 72 明显高于主力 45–65，降级时分布会跳。
- **`deepseek-ai/DeepSeek-V4.1-Flash-1017`**：2.1s 最快、评分 62 落在主力区间内，分布一致性最好；参数规模未在模型名中标注，需按「≥9B」口径确认后再用。

v2 推荐 **`Qwen/Qwen3.8-27B`**（明确 ≥9B，符合用户质量下限），并在验证期对比降级样本的评分；若出现明显跳跃再换 Flash。此项列入待拍板。

## 4. P0 新问题：上游挂起为什么不降级

- new-api 按 `model` 硬过滤渠道，再按 `priority` 串行降级；**触发条件是上游返回错误，不是耗时**。
- `#33` 当前的劣化形态是**连接挂起不返回**，网关既不记失败也不重试，`AutomaticDisableChannelEnabled=true` / `auto_ban=1` 都因「无错误」不触发。
- 引擎 `TIMEOUT_MS=120_000` 超时断开，但网关侧上游请求继续跑，最终可能仍记 200；客户端断开不会回写渠道失败。
- 网关 `options` 全表只有 `RetryTimes=5` / `AutomaticDisableChannelEnabled` 等，**无渠道级超时项**；`#33` 的 `setting` / `settings` / `param_override` 均为空，本期不依赖「网关能配超时」这一未验证假设。
- ⇒ **配置层做不到「按耗时自动切换」**。可选处置：

| 选项 | 做法 | 评估 |
|---|---|---|
| **A（推荐，本期）** | 换模型 + 保留关思考 + 清 reasoning + 加告警 + 人工预案（NVIDIA 挂起时临时把 `#33` 置 `status=2` 或降 priority，让 `#35` 承重） | 零代码、符合红线；但 `#35` 每日约 250 次，只够撑约 1 小时，只能当应急 |
| B | 重新启用一条 dashscope / ds-* 作第三档 | 用户 11-11 已明确不启用，需重新解禁 |
| C | 网关前加超时代理，或改 `llm.ts` 的 `TIMEOUT_MS` + 启用 `fallbackModel` | 违反「不动 `packages/` / `apps/`」红线，且 `fallbackFor` 从未在本站验证，本期不做 |
| D | 导入 OC Ferry | 用户明确「留作记录」，本期不考虑 |

## 5. 目标配置（6 处，全配置层，不动 `packages/` / `apps/`）

| # | 位置 | 现值 | 目标 | 说明 |
|---|---|---|---|---|
| 1 | 网关 `#33` `model_mapping.free-auto` | `nvidia/nemotron-3.5-bolt-e4b` (4B) | **`nvidia/nemotron-3.5-super-vl-120b-a12b`** | 规避小模型，修评分塌陷 |
| 2 | 网关 `#35` `model_mapping.free-auto` | `nex-agi/Nex-N2.5-mini` | **`Qwen/Qwen3.8-27B`**（备选 `DeepSeek-V4.1-Flash-1017`） | 放弃省魔粒、≥9B 兜底；见第 3 节与待拍板 |
| 3 | `.env` `LLM_EXTRA_JSON` | `{"chat_template_kwargs":{"thinking":false}}` | **保持不变，红线** | 删掉会让大模型输出 ×65、耗时 ×3–30 |
| 4 | `.env` `LLM_REASONING_TOKENS` | `10000` | **`0`** | 非思考开关；消除 75536 这类超大上限，让截断显性化 |
| 5 | `.env` `LLM_MAX_CONCURRENCY` | `2` | **4（建议推迟到 P1）** | 上游挂起窗口内提高并发会放大积压 |
| 6 | `.env` `LLM_MODEL` | `free-auto` | **保持不变** | 保留别名才有两级路由；钉死具体模型名会失去兜底 |

`#35` priority 保持 185（低于 `#33`）。不重新启用 dashscope / ds-* / OC Ferry，其余渠道维持 `status=2`。

## 6. 实施、验证与回滚

### P0｜一次性维护窗口（网关 + api/worker 合并重启）

1. 备份：网关整库 + `channels` 表 JSON、`.env`。
2. 停网关 → 改 `#33` / `#35` 的 `model_mapping` → checkpoint → 回传 → 清理 WAL/SHM → 启动。
3. 改 `.env` 两行（`REASONING_TOKENS=0`；并发暂不动），`docker compose up -d --force-recreate --no-deps api worker`。
4. 用官方 `releaseReceipt` 路径放行 3h 窗口内的 `unknown` 回执（近 3h 15 条）。
5. 冒烟：`free-auto` 返回合法 JSON；核对 `usage.completion_tokens` 在 10–300 区间、`reasoning_tokens=0`。

### P1｜观察 2 小时后判定

| 指标 | 期望 |
|---|---|
| 全站均分 / ≥40 占比 | 从 27.7 / 16.4% 回升，向 40+ / 30%+ 靠拢 |
| `reasoning_tokens` | NVIDIA 路径恒为 0（若非 0 ⇒ 关思考未透传，立即查 `LLM_EXTRA_JSON`） |
| `content=null` / `unusable output` / `finish_reason=length` | 0 |
| 120s 超时、`unknown` 回执 | 不高于现状；近 30 分钟 `TimeoutError` 从 13 次下降 |
| 上游恢复后 | 再把 `LLM_MAX_CONCURRENCY` 提到 4，观察吞吐 |
| 网关渠道分布 | `#33` 主力，`#35` 仅真报错时少量出现 |

若 120B 持续卡死（复现「2/4 卡 150s」），**优先判断是不是上游整体挂起**：同时探一次 ModelScope，若 ModelScope 正常 ⇒ 按人工预案临时切 `#35`，不要退回 4B。

### P2｜长期

- 给「达标率骤降 / 超时率 / unknown 积压 / 网关完成日志停滞」加告警，避免再靠人工发现「没更新」。
- 若日后要真正按耗时降级，单独评估网关前超时代理（选项 C）。

### 回滚

- `.env`：从备份恢复两行，recreate api/worker。
- 网关：从备份恢复两条 `model_mapping`，重启。
- 两条回滚都不需要 `rebuild`；恢复后按同一冒烟项验证。

## 7. 已知风险

1. **单点依赖已实锤**：启用渠道只有 `#33` / `#35`，且 `#35` 每日约 250 次。本轮实测 NVIDIA 可整体挂起 20 分钟以上，期间 ModelScope 完全正常却不会被自动使用。选项 A 只是缓解，不是根治。
2. **120B 偶发长请求卡死**：11-12 早些时候并发 4 长输出有一轮 2/4 卡 150s；本轮上游整体劣化下无法区分是模型问题还是通道问题。
3. **评分分布跨模型不一致**：新主力与历史卡片、以及降级样本不在同一分布；观察期不回刷历史。
4. **重启代价**：网关重启 + worker 重建打断在途请求，历史上每次产生数十条 `connect failed` 与少量 `unknown`；合并成一个窗口 + 事后放行可收敛。
5. **思考模型抬高分数**：若 `#35` 选 27B，降级时评分可能跳高 10–20 分，需在 P1 抽样核对。

## 8. 待拍板

1. 是否按第 5 节执行 **#1 / #2 / #4**（P0），并把 **#5 并发 4 推迟到上游稳定后**（v2 新建议）。
2. `#35` 兜底选 **`Qwen/Qwen3.8-27B`**（明确 27B、质量优先，推荐）还是 **`DeepSeek-V4.1-Flash-1017`**（2.1s、评分与主力最接近）。
3. 单点挂起按 **选项 A**（接受 + 告警 + 人工预案）处理，还是解禁选项 B 加一条第三渠道。
4. 是否确认「思考模式无需额外关闭、`LLM_EXTRA_JSON` 是红线、`REASONING_TOKENS` 清 0 不为省 token」这三条口径。
