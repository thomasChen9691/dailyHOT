# 故障记录：2026-11-11 夜间新闻停更（LLM 渠道路由问题）

> 只记录现象、根因、处置与回滚，不含本机地址与凭据。时间均为北京时间。

## 1. 现象

- 19:00 起条目处理成功率持续下滑，21:00–22:20 完全归零，站点新闻停更约 3 小时。
- 回执里 `429` **全程为 0**，失败全部是 `TimeoutError`（`TIMEOUT_MS=120_000`）。

| 时段 | 调用 | 成功 | 429 | 超时 |
|---|---:|---:|---:|---:|
| 13–15 时 | 133 | 133 | 0 | 0 |
| 18 时 | 69 | 38 | 0 | 17 |
| 21 时 | 41 | **0** | 0 | 20 |

## 2. 根因

网关 `free-auto` 是虚拟模型别名，按 `priority` 从高到低**串行降级**，且**只在报错时降级、对「太慢」不降级**。

- 首选渠道 `#33 NVIDIA NIM`（priority 200，最高）：单请求 7–23 分钟，实测 `max_tokens=8` 也要 **203 秒**，且 `content: null`（只有乱码 `reasoning_content`）。
- 它最终仍返回 200，网关判定成功 ⇒ 优先级 185 的健康渠道 `#35 modelscope-free` **永远轮不到**。
- 同期其余渠道也不可用：`#23–#26` OpenRouter 免费池全部 `free-models-per-day` 429（次日 08:00 重置）、`#29` `403 Free quota exhausted`、`#35` 自身有 502/少量 429、`#32` OC Ferry 504（按既定决策不启用）。

隐性浪费：客户端 120 秒超时断开后，`#33` 仍继续生成至完成，日志刷 `broken pipe`，token 与并发槽白占。

## 3. 处置

### 3.1 切换到 ModelScope 单模型（已验证）

```
LLM_MODEL=Qwen/Qwen3.8-27B      # 原值 free-auto，已在 .env 注释中保留回滚说明
```

只改 `.env` 一行，`docker compose up -d --force-recreate api worker`，**未 rebuild**。
模型名写在 `LLM_MODEL` 里会被网关按模型名硬过滤，直接命中 `#35`，**不动共用网关、不影响其他项目**。

实测（同一渠道）：

| 模型 | 1656 字真实 prompt | 结论 |
|---|---|---|
| `Qwen/Qwen3.8-27B` | 11.2s，JSON 正常 | 采用，质量最好 |
| `Qwen/Qwen3.8-Flash-Next` | 3.7s，JSON 正常 | 速度备选 |
| `Qwen/Qwen3.5-35B-A3B` | 28.2s，ct=2192（思维链过长） | 不采用 |
| `deepseek-ai/DeepSeek-V4.1-Flash-1017` | 1.6s，本次可用，但历史上曾返回 `content:null` | 不采用 |

### 3.2 放行「结果未知」回执（关键）

`receipts.ts` 的设计：同一 `logical_key` 的回执若为 `unknown`，**不重发**（防重复计费），任务直接判失败。
`ops.recover` 每 10 分钟自动放行一次，但**同一条回执只自动放行一次**，再次 unknown 必须人工核对。

故障时段积压 **113 条 unknown 回执、波及 97 个条目**（其中 39 个仍在 3h 窗口内）。
用官方路径 `releaseReceipt(id, {billed:null, note}, "ops.recover")` 批量放行——走 `audit` + `resumeAfterRelease`，不做裸 SQL UPDATE：

- 脚本：`.workbuddy/quota-trim/release-unknown.mjs`（默认 dry-run，加 `--apply` 才执行）
- 结果：`released=44 requeued=25`（范围限定在 3h 窗口内的条目，避免给已超窗条目白烧调用）

### 3.3 恢复结果

- 切换后 `LLM_MODEL` 在两个容器内均为 `Qwen/Qwen3.8-27B`，首个 `received` 回执在 3 分钟内出现。
- 网关侧稳定在约 **3 次调用/分钟**（12 分钟 36 次），无 429。
- `publications` 从 22:47 起恢复写入，23:01 仍在新产出（评分 41 / 52 / 26），当日累计 7 条、5 条 ≥40。

## 4. 代价

- 当日 **133 条**条目因 3h 重处理窗口被收口为 `skipped`，不可自动补回。
- 故障时段约 58 个条目的 unknown 回执落在窗口外，未放行，等同放弃。
- 约 25 条在窗口临期（采集后 2–3 小时），按当前吞吐可能来不及处理。

## 5. 回滚

```bash
# 1) 恢复 .env 的 LLM_MODEL=free-auto（备份：.workbuddy/quota-trim/env-backup-20261111.bak）
# 2) 重建
docker compose up -d --force-recreate api worker
```

不需要 `rebuild`，不涉及 `apps/` / `packages/` 代码改动。

## 6. 遗留（未做，待决策）

1. **网关侧根治**：把 `#33` 的 priority 从 200 降到 185 以下（或禁用它对 `free-auto` 的挂载），让路由自然落到 `#35`。改动共用网关，会影响其他项目（但 `#33` 当前等同于坏的）。
2. **响应时间不参与降级**：网关只在错误码上降级，这是本次故障的结构性原因，属网关能力范围，本仓无法改。
3. **并发上限仍是 2**：`LLM_MAX_CONCURRENCY=2` 之下，约 12 个 `content.analyze` 任务同时 active 但只有 2 个能真正调模型，端到端 `latency_ms` 被排队拉到 120–250 秒。实测 `#35` 支持 6 路并发（6 请求全部 200、3.6 秒返回），可考虑抬到 4–6。**代价**：重建 worker 会让在途 `pending` 回执变 `unknown`，需再等 30 分钟自动放行，故本次未动。
4. **`free-auto` 明早 08:00 恢复**：OpenRouter 四个免费 key 日限重置后，`free-auto` 仍会先落到 `#33`。若不改网关优先级，**不要急着切回 `free-auto`**。
