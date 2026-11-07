# 会话交接 · 2026-11-07 · 跨项目接入准备 → 板块 RSS 落地

> **读者**：下一次接手本仓库的会话 / 协作者。
> **脱敏声明**：本文会随仓库上传 GitHub，因此**不含**本机绝对路径、账号、凭证、内网 IP、容器网络名、平台自动化明细、授权原话；本机实况只保存在本地工作记忆（`.workbuddy/memory/`，已被 `.git/info/exclude` 排除，不入库）。
> **配套**：`docs/pending-optimization.md`（本次会话的主文档，含全部实测与契约）、`docs/deferred-items.md`、`docs/sop.md`、`docs/plan-ai-finance.md`、上一份交接 `docs/handoffs/2026-11-06-ops-and-first-push.md`。
> **本文定位**：记录「已完成」与「本人尚未决定的后续待办」。本人明确「就完成到这里，剩下是后续待办内容，还没决定」⇒ **接手后不要自行推进待办**。

---

## 0. 一句话状态

站点在本机正常运行，`./up check` 全绿、health 200；**板块级摘要 RSS 已按口径 B 实现并端到端验证通过**（含从 n8n 容器内读取）；`main` 领先 `origin/main` **3 笔本地提交、均未 push**；跨项目接入的文档与契约已定稿，**剩余全部为待本人拍板的后续事项**。

---

## 1. 项目定位与边界

| 项 | 结论 |
|---|---|
| 站名 / 引擎 | `dailyHOT`（compose project `dailyhot`），基于 AIHOT 模板定制 |
| 内容 | AI × 金融双板块：`/ai`、`/finance` 独立页；一份按分类分两节的融合日报，**09:30** 出刊 |
| 定位 | **自用 / 练手的免费完全版，当前无变现路径**。不得对外宣称收费、导流、会员或付费 API |
| 数据源 | 只用免费源（RSS + `external` 反哺），付费源一律不碰；全库 **32 源**（31 RSS + 1 external） |
| 定制边界 | 只改 `site/`、`industry/`、`modules/`、`scripts/`、`docs/`、`.github/`、根目录 `up`；**不动 `apps/`、`packages/` 核心代码** |
| 跨项目定位 | 本站与工作台**同处「源层」**，数据经未来的「连接器层」落到记忆层的归一化 `Doc/Chunk`；本站**不参与归一化、不进向量库** |
| 接入面 | 记忆层用 `/api/mcp` 的 `fengze_get_daily` **实时取 + 只存指针**；RSS 不用于灌库 |

---

## 2. 本次会话做了什么（按批次）

| 批次 | 内容 | 代表提交 |
|---|---|---|
| ① 上下文恢复与方案 | 三句话复述现状；第 2/3 项（反哺正文免抓、板块级合成 RSS）出「组件 / 改动 / 复杂度 + P0–P2 + action items」方案 | 无代码改动 |
| ② 跨项目审视 | 审计三项目数据流；**修正层级理解**（不是三个并列服务，是分层管道）；产出影响矩阵与 `docs/pending-optimization.md` 初版 | 文档（未跟踪→后入库） |
| ③ Step 1 核对 | 五条清单实测：10 个分类 feed 与板块页**不同源**（`seatedCondition` 50 条·7 天 vs `browsedCondition` 40 条）；当时结论「不新增」 | 文档回填 |
| ④ Step 2 / 3 契约 | 撤稿语义修正、运行时契约九项、MCP `initialize` 与 `fengze_get_daily` 真机取样、§8.3 五条可复跑判据 | 文档回填 |
| ⑤ 口径同步 + 入库 | 同步 15:35–15:57 并行会话的新基线（32 源 / `qwen3.8-27b` / `915cca5` / CI #3）；当时把 deferred 第 3 项标为「已核对关闭」 | `2db5a55` |
| ⑥ **RSS 结论翻转** | 本人新增 n8n / 自用小程序 / 公众号三个消费方 ⇒ 触发条件成立，定**口径 B（精选席位）**；定稿机器内可达边界与链接策略 | `08437d3` |
| ⑦ **板块 RSS 实现** | `modules/board/server.ts` 加 `renderBoardRss()` + 2 个 GET、`scripts/smoke.ts` +2、standalone 测试 +4；**不新增模块** | `f6de197` |

> **并行会话（非本会话，但改变了基线）**：15:35 金融信源扩充（`/finance` 可见 3 → 36、金融 publications 7 → 48、精选 0 → 15）、15:43–15:57 push 与 CI 收口。对应提交 `e27ec81`、`2037971`、`915cca5` 已在 `origin/main`，CI **`Check #3` run `42183534750`** 两个 job 全绿。

> **结论翻转的处理方式**：16:28 的 `2db5a55` 曾标「不实施」，16:40 前提变化后**不改写已提交历史**，改用新增修订 commit `08437d3` 更正，再以 `f6de197` 实现。三条连在一起是真实决策轨迹，不是矛盾。

---

## 3. 当前可复核状态

| 项 | 状态 |
|---|---|
| git | `HEAD = f6de197`，`main` ahead `origin/main` **3 笔**（`2db5a55` / `08437d3` / `f6de197`），**均未 push**；写本文前工作区干净 |
| CI | 远端 `915cca5` 的 `Check #3` success；本地 3 笔**尚未触发 CI** |
| 站点 | `./up check` 全绿、`/api/health` 200、端口由 `.env` 的 `PORT` / `SITE_URL` 决定（当前 3100） |
| 数据 | 32 源；`/feed/ai.xml` **29 条**、`/feed/finance.xml` **14 条**（精选席位口径，比板块页 40 / 35 少，属预期） |
| 机器出口 | 两个板块 feed 已进 `/llms.txt` 的接入方式；n8n 容器内 GET 两条均 **200** |
| 校验 | `npm run typecheck` `TSC_EXIT=0` / `error TS=0`；board standalone **6/6**；`./up rebuild` `REBUILD_EXIT=0`；`./up smoke` **all checks passed** |
| 模型 / 开关 | `LLM_MODEL=qwen3.8-27b`；`COLLECT_ENABLED=true`、`MODEL_CALLS_ENABLED=true`；`FEISHU_*_ENABLED=false`（站内推送安全阀） |
| 敏感面 | `.env`、`.workbuddy/` 从未进入任何 commit；所有新增文档按可入库标准脱敏 |

---

## 4. 必须遵守的工程约定（踩过的坑）

1. **Node 与校验**：统一加 `PATH=/usr/local/bin:$PATH`（v24.22.1）；`tsc` 真实退出码取 `$?` 或 `grep -c "error TS"`，**不要经 `tail` 管道读整体退出码**。
2. **提交纪律**：每完成一批单独 `git commit`；**任何 `git push` 前需本人确认，并显式列出当时全部 deferred items**。本次 3 笔未 push。
3. **不改写历史**：结论翻转用新增修订 commit，不 `reset --soft` / `--amend`。
4. **边界**：不动 `apps/`、`packages/`；所有公开出口统一从 `packages/backend/src/publication/` 读取层读；新增模块须登记 `site/modules/server.ts`、`site/package.json`、`package-lock.json`、`Dockerfile`（本次改现有 board 模块，**无需登记**）。
5. **端口与地址**：`SITE_URL` 是单一真源 —— 反哺地址、smoke、sitemap / llms.txt / 所有 feed 的绝对链接都由它派生；换端口只改 `.env` 的 `PORT` + `SITE_URL`，再 `./up down && ./up`。**本次按本人「不出网」要求保持本机回环地址**，未启用 https profile、未配公网域名。
6. **卷**：compose project 改名后显式保留 `aihot_db` / `aihot_data` / `aihot_caddy`；起站的 `expected "dailyhot"` WARN 属 label 残留、**数据完好，禁止 `down -v`**。
7. **LLM**：必须固定模型；网关额度分两层 —— `insufficient_user_quota` 是本地计数（可重置，需重启网关），`FreeTierOnly` 是上游免费额度（本地改不了）。批量 `requeueFailed(null)` 会把两层一起打穿。
8. **信源增补**：`scripts/seed.ts` 是 `ON CONFLICT (id) DO NOTHING` ⇒ 新增源改 `industry/sources.json` 后 `./up rebuild`；**修改已有源任何字段必须单独改 DB**，改 `feedUrl` 后要清 `cursor`、复位 `health` / `fail_count` / `next_fetch_at`。
9. **可见范围**：`browseFloor=40`；板块页空白先查 `publications.score`。`seatedCondition`（精选席位，`p.selected AND p.seat`）与 `browsedCondition`（公开可见 + 分数门槛）**不是一回事**。
10. **反哺**：`external` 源**没有「免抓配置」** —— 判定只看 `body_text` 是否为空；把正文写进 `body_text` + `body_status='ok'` 才免抓。`COLLECT_ENABLED=false` 会连带关闭抽取 worker。
11. **测试**：`tests/standalone.ts` 把 `DATABASE_URL` 指向不可达地址 ⇒ 纯函数测试与 DB 组测试必须分开；本机全量 web / standalone 成片超时属**环境性失败**，以 CI 为准，不改框架 15 秒常量。
12. **CI 三处补丁**已在 `.github/workflows/check.yml`（共享网络、`test:standalone`、runner 副本临时放宽冷启动超时）；仓库里的 15 秒常量保持原样。
13. **隐私**：`.workbuddy/` 靠 `.git/info/exclude` 本地排除；新增文档不写个人标识与本机拓扑；凭证由本人本地填写，不经聊天传递。

---

## 5. 命令速查（完整版见 `docs/sop.md`）

```bash
./up            # 环境自检 → 补网络 → 起站 → 等健康 → 巡检
./up check      # 只读确认环境，不改任何东西
./up smoke      # 页面 / 接口 / RSS / MCP 巡检（已含两个板块 feed）
./up rebuild    # 改过 site/ industry/ modules/ Dockerfile 后强制重建
./up ingest     # 不带参数打印当前反哺地址；接 <json|.csv|-> 推送，--dry-run 只解析
./up ports / status / logs / down / help

PATH=/usr/local/bin:$PATH npm run typecheck
PATH=/usr/local/bin:$PATH node --import ./tests/standalone.ts --test modules/board/tests/boards.standalone.test.ts
curl -fsSI http://<站点地址>/feed/ai.xml        # ETag / Cache-Control / content-type
curl -fsS  http://<站点地址>/feed/finance.xml   # 摘要级 XML，guid 稳定
```

> 板块 feed 的口径：`seatedCondition` + 按 `CATEGORIES[].section` 合并、40 条滚动窗口、**摘要级不内联正文**；`description` 含「阅读原文」公网链接，站外消息**只用原文链接，不用站内回环链接**。

---

## 6. 后续待办（本人尚未决定，接手后不要自行推进）

### 6.1 待本人拍板（`docs/pending-optimization.md` §11）

| # | 问题 | 当前建议 |
|---|---|---|
| 1 | 「暂不考虑出网」的准确边界 | 建议允许 n8n → 飞书 **单向出站**（`public` 摘要）；若连 webhook 也不发，改为机器内落地 |
| 2 | 公众号用 RSS 数据 | 属对外分发，标 P2；只发摘要 + 原文链接、不全文 |
| 3 | 小程序走哪条通道 | 自用体验版建议内容中转（WorkBuddy 推送 / CloudBase / 已生成的 HTML 报告），不直连 RSS |
| 4 | C `/api/v1/items` 字段映射是否现在写 | 可后置，MCP 已足够 |
| 5 | D 反哺正文免抓是否启动 | 保持 P2 后置；与接入解耦，opt-in 默认关闭 |
| 6 | 记忆层项目何时解冻并落地 §8.2 的 5 个配置键 | 待其状态文档更新后按第 2 步实施；本站不做 |
| 7 | 32 篇 `failed` 文章何时重跑 | 等上游免费额度恢复，授权后**执行一次** `requeueFailed(null)`，勿空转重跑 |
| 8 | `git push` 时机 | 每步单独 commit；push 前显式列出当时全部 deferred items |

### 6.2 原有 6 项 deferred 状态

| # | 项 | 状态 |
|---|---|---|
| 1 | `terms.md` / `privacy.md` 正文 | 仍是上游模板，需本人给 4 个字段并逐段确认 |
| 2 | 反哺正文免抓 | 方案已定（B1 新模块一次落正文），**未实施**，P2 后置 |
| 3 | 板块级合成 RSS | ✅ **本次已完成**（口径 B，`f6de197`） |
| 4 | 批次 4 品牌素材 | 未动，需本人确认视觉；报头字标须重跑生成脚本 |
| 5 | 全量 web / DB 测试 | ✅ 已收口，CI 全绿；本机超时属环境性 |
| 6 | 平台工作流配额备用方案 | R0 零改动生效；R2 / R3 本人拍板不提前实施 |

### 6.3 运行时触发条件

- 上游免费额度恢复 → 一次 `requeueFailed(null)` 补齐 32 篇失败。
- 观察 24h 金融板块产出是否稳定（`/finance` 3 → 36 是修复后的瞬时值）。
- 记忆层项目状态文档解冻 → 落地 §8.2 配置、`connectors.yaml`、ceiling 闸门与 §8.3 判据 4–5。
- 工作台客户端升级标准 MCP、飞书 / Telegram adapter、09:15 自动化接线 —— **均不提前做**。

### 6.4 跨项目契约仍有效（不要重新讨论）

- 日报是「判断」**不存全文**，只存指针，用时经 `/api/mcp` 实时取；撤稿由本站负责。
- 出站按 `visibility` 分级，`private`（持仓 / 评分 / 盘后结论）**绝不外发**；飞书只发 `public` 摘要。
- 不新增「入库型」出口；不直连本站 PostgreSQL；不改归一化层 / 存储 / 对话 / 看板 / 调度。
- `SITE.mcpPrefix = fengze`、`interfaceVersion = 4.0.0`、7 个只读工具已有接入者，**不得再改**。

---

## 7. 已知但非缺陷

- 卷 label 的 `expected "dailyhot"` WARN：数据完好、正确挂载，不处理、不 `down -v`。
- 板块 feed 条目数（29 / 14）少于板块页（40 / 35）：口径 B 是**精选席位**，与 `/feed.xml` 同源，属预期。
- RSS 结论在 `2db5a55` → `08437d3` → `f6de197` 翻转：因消费方从 1 个增加到 3 个，是真实决策轨迹。
- 日报演示数据 `entries=0` 与早期演示条目入库属验证残留，未要求清理。
- 本机全量 web / standalone 超时（沙箱外网、并发资源、缺 `pg_dump`、浏览器），以 CI 结论为准。
- CI 生成的 `.env` 不含 `PORT`，走 compose 默认值；本机端口由 `.env` 决定，两者互不影响。
- 本机 `.env` 的 `COLLECT_ENABLED` / `MODEL_CALLS_ENABLED` 为 `true`（跑内容链路需要），与 `.env.example` 的「仓库默认关闭」不是一回事。

---

## 8. 下一会话的第一件事（按顺序）

1. **先读本文与 `docs/pending-optimization.md` §11**，确认「本人尚未决定」这一前提；**不要自行推进任何待办**。
2. 等本人对 §6.1 的 8 项拍板，尤其是「不出网」边界（飞书 webhook 是否放行）与小程序 / 公众号通道。
3. 若要 push：先按约定**显式列出当时全部 deferred items**，等本人点头；push 后复核 CI 两个 job。
4. 若获准动代码：只走定制目录；改完跑 `typecheck` → `test:standalone` → `./up rebuild` → `./up smoke`；每批单独 commit。
5. **不要碰**：`apps/` / `packages/` 核心、数据卷（尤其 `down -v`）、`.env` 与 `.workbuddy/` 的入库状态、仓库 15 秒常量、已提交历史。

---

## 9. 文档索引

| 文档 | 定位 |
|---|---|
| `docs/handoffs/2026-11-07-rss-delivery-and-pending.md` | **本文**：本次会话交接快照 |
| `docs/pending-optimization.md` | 本次会话主文档：架构对齐、实测、契约、口径 B、边界、待拍板 |
| `docs/handoffs/2026-11-06-ops-and-first-push.md` | 上一份交接（13:11 历史快照，顶部有后续更新注记） |
| `docs/deferred-items.md` | 6 项顺延事项的根因、方案与验收 |
| `docs/plan-ai-finance.md` | 定制方案、决策历史、金融板块修复记录 |
| `docs/sop.md` | 极简命令手册 |
| `docs/e2e-verification.md` | 本机 Docker 端到端实测（已脱敏） |
| `docs/automation-fallback.md` | 平台工作流配额备用方案 |
| `.workbuddy/memory/` | 本机工作记忆（不入库）：按日日志与长期笔记 |
