# LLM 链路巡检与人工应急切换预案（选项 A）

> 2026-11-12。适用于当前两条启用渠道：`#33 NVIDIA NIM`（priority 200，主）、`#35 modelscope-free`（priority 185，次）。
> 依据：`docs/plan-quality-first-2026-11-12.md` v2 第 4 节，用户已拍板**选项 A**：接受单点风险，靠巡检尽早发现 + 人工临时切换；不改核心代码、不加第三渠道、不导入 OC Ferry。
> 只写通用结构与操作步骤，不含本机地址、密钥、个人信息。

## 1. 先记住容量边界

| 项 | 数值 |
|---|---|
| `#35` 每日基础魔粒 | 约 250（24 小时过期，不用即作废） |
| `Qwen/Qwen3.8-27B` 档位 | 主流档 **1 魔粒/次** ⇒ 约 **250 次/日** |
| 全站模型调用 | 约 **3500 次/日**（约 8–10 次/分钟峰值） |
| 全量切到 `#35` 可持续 | **约 25–60 分钟**，不是备用主力 |

⇒ `#35` 只能当「NVIDIA 挂起时的短时应急通道」。切换后 **30 分钟内必须决定恢复或明确停机**，否则额度耗尽后两条渠道同时不可用。

## 2. 巡检阈值（只读）

站点侧（数据库只读查询，`receipts` / `publications` / `articles`）：

| 指标 | 触发阈值 | 说明 |
|---|---|---|
| 近 30 分钟 `TimeoutError` 占比 | > 10% | 维护窗口前实测 15.5%，属上游挂起信号 |
| 近 3h `unknown` 回执 | > 20 | 超时断开后结果未知，任务会停在 failed |
| 近 1h 全站均分 / ≥40 占比 | < 30 / < 20% | 模型质量塌陷（4B 时期曾 27.7 / 16.4%） |
| 各板块最后一张达标卡片 | > 2 小时无新增 | 用户感知「新闻没更新」的直接指标 |
| `usage.completion_tokens_details.reasoning_tokens` | NVIDIA 路径非 0 | 关思考未透传，输出会 ×65、耗时 ×3–30 |

网关侧（`new-api` 的 SQLite `logs` 表，`created_at` 是 **Unix 秒**、不是 ISO 字符串）：

| 指标 | 触发阈值 | 说明 |
|---|---|---|
| `max(created_at)` 距今 | > 5 分钟且站点仍在产生 receipts | **上游挂起**：请求没返回，网关还没记日志（11-12 曾停滞 26 分钟） |
| 近 1h `use_time > 120` 条数 | > 10 | 「慢但 200」堆积，不触发降级 |
| 近 1h `#33` vs `#35` 次数 | `#35` 接近 0 而超时高 | 确认降级没生效 |

读取方式（网关运行中日志在 WAL 里，**三个文件必须一起拷**）：

```bash
docker cp new-api:/data/one-api.db /tmp/gw.db
docker cp new-api:/data/one-api.db-wal /tmp/gw.db-wal
docker cp new-api:/data/one-api.db-shm /tmp/gw.db-shm
# 之后用任意 SQLite 客户端打开 /tmp/gw.db；logs.other 的 upstream_model_name 是实际命中的上游模型
```

## 3. 判定：单点挂起、网关故障，还是模型质量

同一时刻分别探 `free-auto` 和直连 `Qwen/Qwen3.8-27B`（都带 `chat_template_kwargs.thinking:false`，20 秒超时）：

| 结果 | 判定 | 动作 |
|---|---|---|
| NVIDIA 超时 / ModelScope 200 | **NVIDIA 单点挂起**（最常见） | 走第 4 节 |
| 两边都超时 | 网关或出网问题，切渠道无效 | 查网关健康、容器网络与代理，不要切渠道 |
| 两边都 200 但评分低 | 模型质量问题 | 不换渠道；核对 `LLM_EXTRA_JSON`、`reasoning_tokens`、映射是否被改回 4B |
| 两边都 200 且正常 | 可能是 3h 重处理窗口收口 | 查 `publications.score`、`browseFloor=40` 与板块页最后卡片时间 |

## 4. 人工应急切换（把流量临时导到 `#35`）

1. 备份当前 `channels` 表（或至少记下 `#33` `status=1` / `priority=200`），停 `new-api`。
2. 只把 `#33` 改为 **`status=2`（禁用）**，`#35` 保持 `status=1` / `priority=185`；其余渠道不动。
3. checkpoint → 回传 → 用临时容器 `chown 501:0` 并删除 `one-api.db-wal` / `one-api.db-shm` → 启动 `new-api`。
   - **不需要** recreate `api` / `worker`：这是网关侧改动。
   - 不要改 `.env` 的 `LLM_MODEL`（必须保持 `free-auto` 别名）。
4. 冒烟：`free-auto` 返回 200、合法 JSON，网关日志 `upstream_model_name = Qwen/Qwen3.8-27B`。
5. 记录切换时间；按第 1 节，**30 分钟内恢复或明确停机**。
6. 恢复：把 `#33` `status` 改回 `1`，同样流程重启网关，再冒烟确认 `upstream_model_name = nvidia/nemotron-3.5-super-vl-120b-a12b`。

⚠️ `Qwen/Qwen3.8-27B` 是**强制思考模型**（`thinking:false` 关不掉，约 205 reasoning token/次），评分系统性偏高（实测 72–85，NVIDIA 关思考口径 45–65）。应急期间产生的卡片与平时不在同一分布，**不要据此调评分阈值、不要回刷历史**。

## 5. 任何模型 / 渠道改动后的回归检查

- `LLM_EXTRA_JSON` 必须仍是 `{"chat_template_kwargs":{"thinking":false}}` —— **红线，删掉会让输出 ×65、耗时 ×3–30**。
- `LLM_REASONING_TOKENS=0`；NVIDIA 路径 `reasoning_tokens=0`；`max_tokens` 不再有 +10000 余量。
- `LLM_MODEL=free-auto`（钉死具体模型名会失去两级路由）。
- `LLM_MAX_CONCURRENCY` 当前 **2**：上游稳定前不提到 4（挂起窗口提高并发会放大积压）。
- 启用渠道数应为 2；新增渠道须重新核对 `RetryTimes=5` 与渠道数关系。

## 6. 已知边界（本次未实施）

- **自动告警未接线**：第 2 节是可执行巡检清单，把阈值接入站内 alert 或平台自动化属于 P2，本次未改代码、未创建定时任务。
- **按耗时自动降级做不到**：网关只在「上游返回错误」时降级，连接挂起不报错，`AutomaticDisableChannelEnabled` / `auto_ban` 都不触发；`options` 全表无渠道级超时。根治需网关前超时代理或改核心 `llm.ts`，均超出「不动 `packages/` / `apps/`」约定。
- 第三渠道（dashscope / ds-*）与 OC Ferry 按用户决定保持 `status=2` / 留作记录。

## 7. 2026-11-12 维护窗口的回滚点

| 对象 | 备份 | 恢复 |
|---|---|---|
| 站点 `.env` | `.workbuddy/quota-trim/env-backup-20261112.bak` | 还原文件 → `docker compose -p dailyhot up -d --force-recreate --no-deps api worker` |
| 网关整库 | `.workbuddy/gateway/one-api-20261112-before.db` | 停网关 → 回传 → 清 WAL/SHM → 启动 |
| 网关渠道单行 | `.workbuddy/gateway/channels-backup-20261112.json`（含 key，勿外传） | 只恢复 `channels.model_mapping` 两行 |

两条回滚都**不需要 `rebuild`**；恢复后按第 5 节冒烟。
