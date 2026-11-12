# 2026-11-12 交接：思考模式核对、模型质量下限与 P0 切换

> 交接范围：11-12 20:54–22:21 会话（思考模式疑问 → NVIDIA 小模型规避 → 上游挂起诊断 → 方案 v2 → 用户全项拍板 → P0 执行）。
> **本文只写「当前状态 / 下一步 / 建议 skill」**。实测数据、方案推理、操作步骤、回滚点、长期约束分别见文末引用，不在此重复。
> 不含凭据、本机路径、个人信息。仓库内未见 `CONTEXT.md` 与 `docs/adr/`。

---

## 1. 当前状态

| 项 | 状态 |
|---|---|
| P0 配置改动 | **已执行并验证生效**：网关两条渠道的 `free-auto` 映射已切、`.env` 的 `REASONING_TOKENS` 已归零、`api`/`worker` 已 recreate。逐项结果见 `docs/plan-quality-first-2026-11-12.md` 顶部「执行状态」表 |
| 明确未动 | `LLM_EXTRA_JSON`（关思考，**红线**）、`LLM_MODEL=free-auto`、`LLM_MAX_CONCURRENCY=2` |
| 并发 2→4 | **已批准但推迟**，待上游稳定后单独评估；挂起窗口提并发会放大积压 |
| 窗口内 `unknown` | 已按官方 `releaseReceipt` 路径放行并重新入队；数量与分布见上述「执行状态」表 |
| 链路健康度 | 冒烟 3/3 成功、`reasoning_tokens=0`、无输出截断类错误、`score_article` 零 failed。重启期产生的连接失败属预期，按退避重试 |
| **评分观察（未判定）** | 近 30 分钟均分约 20、≥40 仅个位数，**没有立刻回升**；但维护前后 10 分钟分桶无明显变化、样本很小。P1 的 2 小时观察**尚未完成**，不能据此判定换模型成功或失败 |
| 单点挂起处置 | 用户选**选项 A**（接受单点 + 巡检 + 人工临时切次渠道）。**自动告警未接线**，目前只有 `docs/llm-failover-runbook.md` 的可执行巡检清单；次渠道容量边界与切换 6 步见该文档 |
| 提交 | 本会话 `fb7c25f`（方案 v2）、`64072d3`（执行记录 + runbook），**均未 push** |
| 工作区 | 另有 3 个与本批次无关的已修改 / 未跟踪文档，**勿纳入本批次提交或 push** |
| 回滚点 | 网关整库、`channels` 表、`.env` 三份备份路径与恢复命令见 `docs/llm-failover-runbook.md` §7，均不需要 `rebuild` |

**两条最容易踩坑的口径**（详细实测见方案文档，此处只留结论，勿再重新论证）：

1. 思考模式**本来就已关闭且必须保留**；`LLM_REASONING_TOKENS` 只是 `max_tokens` 的加数，不是思考开关，清 0 不为省 token。
2. 网关运行中日志写在 WAL 里：只读核对上游模型时，`docker cp` 必须把 `-wal` / `-shm` 一起取出，否则会读到旧快照并误判路由没生效。

---

## 2. 下一步

| 优先 | 动作 | 判据 / 约束 |
|---|---|---|
| P0 | **完成 P1 观察**（自 21:55 起约 2 小时） | 按 `docs/llm-failover-runbook.md` §2 的阈值巡检：均分与 ≥40 占比是否向 40+ / 30%+ 回升、超时率、`unknown` 积压、板块页最后达标卡片时间、网关完成日志是否停滞 |
| P0 | 若观察后仍不回升，**先复核假设，不要继续换模型** | 「4B 导致低分」是用户观察，但单条探针里 120B 关思考给分并不高于 4B；混杂因素还有高消耗源减量、`hot_signal` 无分条目、信源结构变化。按诊断流程排查后再决定是否调整 |
| P1 | 上游连续稳定后再评估 `LLM_MAX_CONCURRENCY` 2→4 | 已批准、只差时机；改动只需 recreate `api`/`worker`，单独一个批次提交 |
| P1 | **自动告警接线**（选项 A 中尚未落地的部分） | 先请用户确认走站内 cron 还是平台自动化；站内定时不占平台配额。把 runbook §2 阈值接成定时巡检，不改 `packages/` / `apps/` |
| P2 | `git push` 前 | 需用户确认，并**显式列出 deferred items**：P1 结论、并发 4、自动告警未接线、3 个无关未提交文件、两笔未 push 提交 |

边界不变：不启用第三渠道、不导入 OC Ferry、不做按耗时自动降级（机制上行不通）、不动 `packages/` / `apps/` 核心。

---

## 3. 建议 skill

| skill | 触发时机 | 用途 |
|---|---|---|
| `realeng-diagnosing-bugs` | P1 观察后评分仍未回升 | 按证据链排查根因，避免把相关性当因果、连续换模型试错 |
| `scheduled-task-templates` / `cron-generator` | 用户确认要接自动告警时 | 生成定时巡检模板；优先站内 cron，注意别为省名额改站内调度 |
| `realeng-code-review` | 任何配置 / 脚本改动或批次收尾 | 完工审计，重点核查是否触碰「不动核心代码」红线与回滚路径是否完好 |
| `realeng-handoff` | 下一会话收尾 | 继续以「当前状态 + 下一步 + 建议 skill」格式接力，不重复本文与既有文档 |

---

**引用（细节都在这些文件里，请勿在交接文档中复制）**

- `docs/plan-quality-first-2026-11-12.md` — 方案 v2：思考模式实测、模型筛选、单点挂起机制、目标配置、验证与回滚、执行状态表
- `docs/llm-failover-runbook.md` — 选项 A：容量边界、巡检阈值、判定表、人工切换步骤、回滚点
- `docs/gateway-channels-2026-11-11.md`、`docs/incident-2026-11-11-llm-routing.md` — 渠道收敛与夜间停更事故的历史口径
- `docs/deferred-items.md`、`docs/sop.md` — 长期顺延事项与命令手册
- `docs/handoffs/2026-11-09-rss-curation-quota-and-macro-handoff.md` — 更早的信源 / 额度 / 项目定位基线

---

## 补记（2026-11-12 深夜）：P1 口径确认与自动告警接线

> 增量补记；上面的状态表是 22:21 会话快照，不改写。

- **P1 观察（用户确认）**：按 23:00（NVIDIA 自行恢复后）起算、01:00 判定；22:31–23:00 的上游挂起不计入；不切渠道，保持选项 A。
- **自动告警接线（用户选站内 cron）**：新增 `modules/llm-guard`，复用 `ops.alerts` 每 10 分钟一轮与 `ServerModule.alerts()` 扩展点，覆盖巡检手册 §2 中引擎现有检查项未覆盖的 5 类信号（上游挂起、超时率、板块陈旧、思考 token、按日额度）；零新增调度、零环境变量开关、未改 `packages/` / `apps/`。平台自动化按 11-06 拍板不提前实施，站外心跳兜底暂不建。
- **告警状态**：5 个历史固定模型 `provider.refused.*` 已归档进 `settings.alerts.archived`，`alerts.state` 从 7 项降到 2 项（`content.process` / `content.grouping` 是当前真实状态，保留）。
- **仍需本人处理**：告警推送凭证 `FEISHU_ALERT_WEBHOOK_URL` 与 `FEISHU_ALERT_CHAT_ID`（或 `FEISHU_INTERNAL_CHAT_ID`）只从 env / 分组 dotenv 读取，当前三项全空且 `FEISHU_INTERNAL_ENABLED=false`；填完打开开关并重启 api/worker 才会真正推送。AI 不代填凭证。
- **部署状态**：镜像重建受 Docker base 层 apt 出网阻塞，改由用户授权的**临时热补丁**生效（文件复制进 api/worker + `restart`，不碰镜像），已验证容器内 `alerts()` 可用。补丁在 `--force-recreate` 后会丢，后续小改完成后必须 `./up rebuild` 固化。
- **deferred 不变**：并发 2→4 评估、P1 结论、3 个无关未提交文件、未 push 提交；push 前需本人确认并显式列出 deferred items。
