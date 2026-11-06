# 会话交接 · 2026-11-06 · 定制落地 → 一键运维 → 首次推送

> **读者**：下一次接手本仓库的会话 / 协作者。
> **脱敏声明**：本文会随仓库上传 GitHub，因此**不含**本机绝对路径、账号、凭证、内网拓扑、平台自动化明细；本机实况只保存在本地工作记忆（`.workbuddy/memory/`，已被 `.git/info/exclude` 排除，不入库）。
> **配套**：`docs/sop.md`（命令手册）、`docs/deferred-items.md`（6 项收口方案）、`docs/plan-ai-finance.md`（方案与历史）。

---

## 0. 一句话状态

站点在本机正常运行；**20 个本地提交已全部推送**，本地与远端 `main` 一致（`0dad2a6`），工作区干净；**首次带完整补丁的 CI 已跑完且两个 job 全部 success**；6 项顺延事项中第 5 项已收口，其余按触发条件等待。

---

## 1. 项目定位与边界

| 项 | 结论 |
|---|---|
| 站名 / 引擎 | `dailyHOT`（compose project `dailyhot`），基于 AIHOT 模板定制 |
| 内容 | AI × 金融双板块：`/ai`、`/finance` 独立页；一份按分类分两节的融合日报，**09:30** 出刊 |
| 定位 | **自用 / 练手的免费完全版，当前无变现路径**。不得对外宣称收费、导流、会员或付费 API |
| 数据源 | 只用免费源（RSS + `external` 反哺），付费源一律不碰，必要时放弃功能而非引入付费 |
| 定制边界 | 只改 `site/`、`industry/`、`modules/`、`scripts/`、`docs/`、`.github/`、根目录 `up`；**不动 `apps/`、`packages/` 核心代码**，避免上游合并冲突 |

---

## 2. 本次会话做了什么（按批次）

| 批次 | 内容 | 代表提交 |
|---|---|---|
| ① 定制落地 | 双板块方案与决策、站点身份、行业包 10 类 / 两节、24 个信源、`/ai` + `/finance` 模块与机器出口 | `d2c883e` → `c9ad8a9` |
| ② 定位与测试归因 | 变现路径拍板、全量测试环境性失败归因、告警夹具时钟派生修复 | `242f5ce` → `38cf19c` |
| ③ 端到端起站 | Docker 起站、smoke、反哺 / 模型 / 日报链路验证，实测日志落盘 | `96f49f6` |
| ④ 运维收敛 | SOP + deferred 方案；`./up` 一键自检启停；project 改名与卷名保留；端口治理；`./up ports` / `./up ingest`；文档脱敏 | `777227c` → `19d8f98` |
| ⑤ 配额预案 | 平台工作流数量受限的备用方案（R0–R3），deferred 扩为 6 项 | `fd8f0da` |
| ⑥ CI 补丁与推送 | 共享网络、`test:standalone`、standalone 冷启动超时适配、timeout 调整；决策记录；`git push` | `2effafc`、`0dad2a6` |

**累计 20 个提交**（`a5bd263..0dad2a6`）已推送到远端 `main`，推送方式为本地 git 的 SSH remote；当时 GitHub 连接器不可用，改用本地 git 完成，未依赖连接器或 `gh` CLI。

---

## 3. 当前可复核状态

| 项 | 状态 |
|---|---|
| git | `HEAD = origin/main = 0dad2a6`，未推送 0，工作区干净 |
| CI | `Check` run `42165951823`，head `0dad2a6`，event `push`，**`completed / success`**；job `check`、`docker` 均 `success` |
| 站点 | `./up check` 全绿退出 0；`/api/health` 返回 `{"ok":true,"db":"ok"}`；端口由 `.env` 的 `PORT` / `SITE_URL` 决定（当前 3100） |
| 数据 | 完整 `./up down && ./up` 停起循环前后条数一致：`sources=24 / articles=137 / publications=88 / reports=daily|2026-11-06`；旧数据卷显式保留并正确挂载 |
| 生成链接 | sitemap / llms.txt 输出的端口与 `.env` 一致 |
| 校验 | `npm run typecheck` 退出 0、`error TS=0`；`./up smoke` all checks passed；`./up ports` 无本站端口冲突 |
| 敏感面 | `.env`、`.workbuddy/` 从未进入任何 commit；`.env` 权限 600 |
| 自动化 | 主链路不依赖平台自动化：调度 / 采集 / 分析 / 出刊都在 worker 容器的定时任务里，**R0 零改动即有效兜底** |

---

## 4. 必须遵守的工程约定（都是踩过的坑）

1. **Node 与校验**：校验统一加 `PATH=/usr/local/bin:$PATH`（工具 shell 可能注入旧版 Node）。
2. **退出码陷阱**：`tsc` 的真实退出码要取 `$?` 或 `grep -c "error TS"`；把结果经 `tail` 管道后读到的整体退出码会掩盖失败。
3. **出刊时间**：改 `site/site.ts` 的 `EDITION_TIMES.daily` 后，除分类 / 分节相关测试，必须额外跑 `tests/daily-report-alerts.test.ts`、排期、`report-recovery`、`category-corrections`；测试时钟一律从 `EDITION_TIMES.daily` 派生（告警判逾期 = 出刊 + 2h），不写死 10:00。
4. **新增模块**：同时登记 `site/modules/{index,server,web}.ts`、`site/package.json`、`package-lock.json`、`Dockerfile`；模块页面放 `modules/<name>/web/`；要进 sitemap / llms.txt 必须实现 `ServerModule.sitemap.entries` / `llms().pages`。
5. **反哺**：`external` 源**没有「免抓配置」**——判定只看 `body_text` 是否为空。把正文写进 `body_text` 且 `body_status='ok'` 才免抓；只给 `raw.text` 时引擎仍抓原 URL，抓不到要等 3×10 分钟降级。`COLLECT_ENABLED=false` 会连带关闭正文 worker。
6. **公开列表门槛**：`browseFloor=40`（`industry/selection.ts`），低分条目不进板块页但 `publications` 里有记录；板块页空白先查 `publications.score`。
7. **LLM**：必须选固定模型；自动路由会命中不兼容参数 / 额度耗尽的模型。
8. **卷**：compose project 改名后**显式保留原卷名**，零迁移保数据。起站会有 `volume ... already exists ... expected "dailyhot"` WARN，属 label 残留的预期告警，数据完好；**禁止 `down -v`**，彻底消除需停机迁移（未做）。
9. **CI 三处补丁**：docker job 起站前补建外部共享网络（干净 runner 没有）；check job 在 **`Build web` 之后**跑 `npm run test:standalone`；该步骤在 runner 副本里临时放宽 web server 冷启动超时再还原（`tests/standalone.ts` 故意把数据库指向不可达地址，生产 server 需 ~22 秒）。**仓库里的 15 秒常量保持原样**，check job timeout 25→35 分钟。CI 无 `.env`，走 compose 默认端口，不受本机端口影响。
10. **本机全量测试**：全量 web / standalone 在本机会出现成片超时（沙箱外网、并发资源、缺 `pg_dump`、浏览器），属**环境性失败**，以 CI 结论为准，不改框架常量。
11. **隐私**：新增文档不写个人标识与本机拓扑；`.workbuddy/` 靠 `.git/info/exclude` 本地排除；凭证由本人本地填写，不经聊天传递。
12. **提交纪律**：每完成一批单独 `git commit`；**任何 `git push` 前需本人确认，并显式列出当时的 deferred items**。

---

## 5. 命令速查（完整版见 `docs/sop.md`）

```bash
./up            # 环境自检 → 补网络 → 起站 → 等健康 → 巡检
./up check      # 只读确认环境，不改任何东西
./up down       # 停站，数据保留
./up ports      # 只读扫描本机两个代码目录的 compose 端口声明 + 运行中容器，输出台账
./up ingest     # 不带参数打印当前反哺地址；接 <json|.csv|-> 真正推送，--dry-run 只解析
./up smoke      # 只巡检页面 / 接口 / RSS / MCP
./up rebuild    # 改过 site/ industry/ modules/ Dockerfile 后强制重建
./up status / logs / help
```

反哺入口 `./up ingest` 的目标地址由 `.env` 的 `SITE_URL` + `INGEST_TOKEN` **派生**，不在任何外部配置里写死端口；`INGEST_TOKEN` 不打印。CSV 按 `section,category,content,reason,link` 解析（兼容引号 / 逗号 / 换行），自动复用 `external-fengze-daily` 源。

---

## 6. 6 项 deferred 的交接状态

| # | 项 | 当前状态 | 触发条件 / 卡点 |
|---|---|---|---|
| 1 | `terms.md` / `privacy.md` 正文 | 仍是上游「请填写」模板 | **需本人提供**运营主体 / 联系方式 / 版本号 / 生效日期，并逐段确认；AI 不编造主体 |
| 2 | 反哺正文免抓 | 方案已定（写 `body_text` + `body_status='ok'`），**未实施** | 当前靠手动 `./up ingest`；平台侧定时反哺**从未接线**，不要假设它在跑 |
| 3 | 板块级合成 RSS | 方案已定（`/feed/ai.xml`、`/feed/finance.xml`），**未实施** | 无技术卡点，随时可做 |
| 4 | 批次 4 品牌素材 | 未动 | **需本人确认视觉**；报头字标必须重跑生成脚本并同步索引，否则日报分享图裁切错位；自用定位下二维码 / 导流不做 |
| 5 | 全量 web / DB 测试 | **已收口** —— CI 三处补丁落地，首次完整 `Check` 两个 job 均 `success` | 后续以 CI 为准；本机环境性失败不作证据 |
| 6 | 工作流配额备用方案 | R0 零改动已生效；R1–R3 **本人拍板不提前实施** | 配额真受限时再触发；**不要为省名额去改站内 cron**（不占平台配额） |

> 第 1、4 项卡在本人输入；第 2、3 项可无人值守实施但按协作习惯先出方案、确认后再动代码；第 5 项已关闭；第 6 项是风险预案而非缺陷。

---

## 7. 已知但非缺陷

- 卷 label 的 `expected "dailyhot"` WARN：数据完好、正确挂载，不处理、不 `down -v`。
- `/finance` 演示条目因 `browseFloor=40` 被过滤，不是板块页 bug。
- 日报演示数据 `entries=0` 与演示条目入库属于验证残留，可按需清理（未要求执行）。
- 本机全量 web / standalone 超时（见 §4.10）。
- CI 生成的 `.env` 不含 `PORT`，使用 compose 默认值；本机端口由 `.env` 决定，两者互不影响。

---

## 8. 下一会话的第一件事（按顺序）

1. **复核 CI**：本次 run `42165951823` 已 `success`。后续任何 push 若 `Check` 报红，**只修 `.github/` 里的补丁，不动站内代码**；本机测试失败先按环境性归因。
2. **要输入**：若推进第 1 / 4 项，先向本人索取条款字段与品牌视觉确认，不代为编造。
3. **要方案**：第 2 / 3 项实施前先给方案（组件 / 改动 / 复杂度 + P0–P2 + action items），确认后分步做、每步单独 commit。
4. **要确认**：任何 `git push` 前显式列出当时 deferred items 并等本人点头。
5. **不要碰**：`apps/`、`packages/` 核心代码；数据卷（尤其 `down -v`）；`.env` 与 `.workbuddy/` 的入库状态；仓库里的 15 秒测试常量。

---

## 9. 文档索引

| 文档 | 定位 |
|---|---|
| `docs/sop.md` | 极简命令手册（三条主命令 + 故障一行对照） |
| `docs/deferred-items.md` | 6 项顺延事项的根因、方案、命令与验收 |
| `docs/plan-ai-finance.md` | 定制方案、四项决策、批次记录、全量测试归因 |
| `docs/e2e-verification.md` | 本机 Docker 端到端实测（已脱敏；早期端口时期的记录） |
| `docs/automation-fallback.md` | 平台工作流数量受限时的分层与 R0–R3 阶梯 |
| `docs/handoffs/2026-11-06-ops-and-first-push.md` | 本文：会话交接快照 |
| `docs/customize.md` | 引擎自带的定制说明 |
