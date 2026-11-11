# 网关渠道收敛（2026-11-11）

> 只写通用结构，不含本机地址、密钥、个人信息。改动对象是共用 LLM 网关，不是 dailyHOT 仓库代码。

## 1. 改动内容

`free-auto` 参与调度的渠道由 8 条收敛为 2 条，按用户决策：**NVIDIA 主、ModelScope 次**。

| 顺序 | 渠道 | priority | 处置 |
|---|---|---:|---|
| 1 | `#33 NVIDIA NIM` | 200 | **保留**，`free-auto → nvidia/nemotron-3-ultra-550b-a55b` |
| 2 | `#35 modelscope-free` | 185 | **保留**，`free-auto` 映射**改为 `Qwen/Qwen3.8-27B`**（原为 `nex-agi/Nex-N2.5-mini`） |
| — | `#36 nvidia-muse-glimmer` | 195 | 退出调度（`weight=0`，历史 14 次调用，最后 11-08） |
| — | `#23–#26 OpenRouter free ×4` | 100/99/98/97 | 退出调度 |
| — | `#34 dashscope-free` | 40 | 退出调度 |
| — | `#27/#5/#29/#30 ds-*` | 39/38/37/36 | 退出调度 |
| — | `#31 deepseek`（付费） | 10 | 退出调度 |
| — | `#32 OC Ferry` | 0 | 退出调度（原本也不启用） |

处置方式为 **`status=2`（禁用）而非删除**：行、密钥、模型列表原样保留，改回 `status=1` 即可恢复，不需要重新填 key。

## 2. 为什么必须先改 `#35` 的映射

`#35` 原本把 `free-auto` 映射到 `nex-agi/Nex-N2.5-mini`，而日志里明确有
`429 We have to rate limit you for model nex-agi/Nex-N2.5-mini`。如果只收敛渠道不改映射，
兜底那条自身就在被限流，等于没有兜底。改为 `Qwen/Qwen3.8-27B` 后实测 1–11 秒、JSON 正常。

## 3. 依据（改动前）

`RetryTimes=5` ⇒ 一次请求最多 6 次尝试。原 priority 序列的前 6 档正好是
`33 / 35 / 23 / 24 / 25 / 26`，把 `#34 dashscope` 及以下全部挡在门外（今日 0 次调用，历史 433 次成功）。
`#25/#26` 历史成功仅 13 / 9 次，却各产生 854 次失败 —— 属于死位。

| 渠道 | 今日成功 | 今日失败 | 历史成功 |
|---|---:|---:|---:|
| #33 | 1407 | 1043 | 7758 |
| #35 | 259 | 904 | 1727 |
| #23 | 40 | 870 | 255 |
| #24 | 10 | 854 | 23 |
| #25 / #26 | 0 / 0 | 854 / 854 | 13 / 9 |
| #34 / #36 | 0 / 0 | 0 / 0 | 433 / 14 |

收敛后链路变成 `33 → 35` 两条真实路径，不再消耗重试位在 4 个必然 429 的渠道上。

## 4. 验证

改后实测 `free-auto`，抓到一次完整降级：

```
attempt 1  channel #33 → 500 do_request_failed，13.2s
attempt 2  channel #35 → success，1.0s，upstream_model = Qwen/Qwen3.8-27B
总计 14.2s
```

即 NVIDIA 当前处于 500 劣化状态时，能在一个重试内落到 ModelScope 并成功。

## 5. 代价

- 网关重启约 20 秒，期间所有项目的模型调用中断。dailyHOT 侧产生 **51 条 `connect failed: TypeError: fetch failed`**（集中在 23:19 这一分钟，之后为 0），会按退避重试；另有 4 条在途回执变 `unknown`，已用放行脚本处理（`released=4 requeued=4`）。
- 失去 `#34 dashscope` 作为第三条兜底。若 NVIDIA 与 ModelScope 同时不可用，`free-auto` 将直接失败。

## 6. 回滚

```bash
# 备份：.workbuddy/gateway/one-api-20261111-before.db（改前整库）
#       .workbuddy/gateway/channels-backup-20261111.json（15 条渠道含 key，勿外传）
docker stop new-api
docker cp <backup.db> new-api:/data/one-api.db
docker run --rm -v newapi-data:/data alpine:3 sh -c 'rm -f /data/one-api.db-wal /data/one-api.db-shm'
docker start new-api
```

单独恢复某条渠道：把它的 `status` 改回 `1` 并重启。恢复 `#35` 的旧映射：把 `model_mapping` 的 `free-auto` 改回 `nex-agi/Nex-N2.5-mini`。

## 7. 注意

- **不要在 NVIDIA 恢复前把 dailyHOT 切回 `free-auto`**：`#33` 每次失败要耗 13 秒才降级，而 dailyHOT 现在钉在 `Qwen/Qwen3.8-27B` 上是直达 `#35`、1 秒返回。等 `#33` 的错误率降下来再考虑切回。
- `RetryTimes=5` 未改。现在只有 2 条渠道，这个值已经不再是约束；日后若加回渠道需重新核对它与渠道数的关系。
