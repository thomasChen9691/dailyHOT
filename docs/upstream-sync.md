# AIHOT 上游同步 SOP

dailyHOT 是 AIHOT 引擎的定制站。上游是线上引擎的导出，功能之间互相 import，不能按单个功能切片合并。本文件定义**每次拉取最新 AIHOT 后都要照做的固定流程**，配置在 `scripts/upstream-sync.manifest.json`。

## 为什么是这套流程

- dailyHOT 的初始提交 `a5bd263` 是**孤儿快照**：树与上游 `cd424b0` 完全相同，但两条历史本来毫无共同祖先。`git replace` 只用于首次同期合并，借 `cd424b0` 造一个三方基准。
- 2026-11-13 采用「真合并」落地 `e385794`（合并提交 `6068f08`，双父）。此后 `e385794` 成为**真实公共祖先**，replace 已删除，未来同步就是普通 `git merge upstream/main`。
- 2026-11-13 试合并实测：`142` 个文件自动三方合并，只剩 **5 个内容冲突**（各 1 个 hunk）。
- 上游 129 个变更的 ts/tsx 之间有 **61 条互相 import**，只取某个功能的文件必然留下悬空引用。
- 因此「代码对齐」必须整体做；确认点放在**对齐前一次总确认（S1）**和**对齐后逐功能验收（S3）**。

## 远端配置（已完成，新机器照抄）

```bash
git remote add upstream git@github.com:thomasChen9691/AIHOT.git
git remote add mirror <本机 AIHOT 完整 clone 路径>      # 可选加速，URL 只在 .git/config
git config remote.upstream.pushurl DISABLED
git config remote.mirror.pushurl DISABLED
git fetch mirror main
```

`upstream` / `mirror` 是**只读参考源**，push 目标只能是 `origin`（dailyHOT）。两条 `pushurl` 加固从机制上杜绝误推。

**历史说明**：`git replace a5bd263 → cd424b0` 已完成首次同期合并的使命并于 2026-11-13 删除（`git replace -d a5bd263…`）。现在 `git merge-base HEAD upstream/main` 返回真实的对齐点，不需要也不应再重建 replace。

## 五个阶段

| 阶段 | 做什么 | 谁确认 | 产物 |
|---|---|---|---|
| **S0 预检** | 权威 HEAD、对齐点、新增提交、功能候选、冲突预测、行为影响清单、merge-base 校验 | 只读 | 报告 |
| **S1 总确认** | 一次说清「本次 merge 会带入哪些行为变化」 | ✅ 本人 | 授权 |
| **S2 代码对齐** | fetch → merge → 解冲突 → 锚点校验 → 全量验证 → 单独 commit | 按 S1 | 1 个对齐 commit |
| **S3 功能验收** | 逐功能解释 → 实测影响 → 推荐（保留 / 调参 / 回滚）→ 独立 commit 或 revert | ✅ 每个功能 | 每功能 1 commit |
| **S4 固化** | `./up rebuild` + 容器内验证 + 文档/工作日志同步 + deferred items | ✅ 本人 | 可运行状态 |

### S0 · 预检（只读，不产生改动）

```bash
./up sync check          # P1 脚本落地前，手工执行下列各条
git ls-remote upstream HEAD
git rev-parse mirror/main upstream/main
git replace -l                                  # 应为空
git merge-base HEAD upstream/main                # 应等于 manifest.baseline.alignedUpstream
git log --oneline <对齐点>..<权威 HEAD>
git diff --stat <对齐点>..<权威 HEAD>
```

报告必须列出：① 新增提交与功能候选；② 预测冲突文件（与 manifest 的 `conflictPolicy` 取交集）；③ **无开关即生效的功能**（代码级行为，merge 完立刻改变线上表现）；④ 红线项（`poweredBy`、付费源）是否被上游改动。

### S1 · 总确认

代码不可分，所以这里一次性确认「本次对齐会带入哪些行为变化」。不同意就不进入 S2，可以改等上游下一个版本。

### S2 · 代码对齐

```bash
# 1. 取对象：mirror/main 等于权威 HEAD 时用它（完整对象、秒级）
git fetch mirror main
#    否则走 GitHub 轻量 fetch（完整 fetch 会断线，必须带 filter）
git fetch --filter=blob:none --no-tags upstream main

# 2. 合并（不自动提交，先解决冲突）
git merge --no-commit --no-ff mirror/main        # 或 upstream/main

# 3. 按 manifest.conflictPolicy 解冲突
#    manual               → 手工合并，保留全部定制
#    theirs-then-reapply  → 取上游版本，再补回 dailyHOT 的几行补丁
#    regenerate           → lock 用 npm install --package-lock-only 重新生成，不抄上游 diff

# 4. 锚点校验：manifest.anchors 每项 mustContain 必须全部命中，任一缺失即停止并回滚

# 5. 全量验证（见下），不过就 git merge --abort
git add -A && git commit -m "chore: 对齐 AIHOT 上游 <短 hash>（保留站点定制，功能待验收）"
```

**验证清单**（顺序执行，退出码以真实 `$?` 为准，别被 `tail` 掩盖）：

```bash
PATH=/usr/local/bin:$PATH npm run typecheck; echo "TSC_EXIT=$?"
PATH=/usr/local/bin:$PATH npm run build -w @aihot/web; echo "BUILD_EXIT=$?"
git diff --check
# 锚点：manifest.anchors 每项 mustContain 全部命中；permanentlyDisabled 全部保持关闭
# 测试库：DATABASE_URL=postgres://postgres:testpass@127.0.0.1:55432/dailyhot_test
# 与合并面直接相关的单文件优先，例如：
#   node --import ./tests/standalone.ts --test tests/page-metadata.standalone.test.ts
```

**本机已知环境陷阱（2026-11-13 实测，不是代码回归）**：

- 宿主没有 `pg_dump` / `pg_restore` / `psql`（只有 `dailyhot-test-pg` 容器里有）⇒ `backup.test.ts` 必然失败，与合并无关。
- `apps/web/tests/web-server.ts` 冷启动 15s 硬编码，本机高负载会误报 `web did not start`，且 `before` 失败后整组测试级联失败。验证时临时把 `15_000` 改为 `60_000`，**跑完立即还原**（仓库常量不动）；CI 里也是相同做法。
- 全量 `npm test` 在 6 并发下本机需 1 小时以上，且 10s/15s/120s 超时项大量误报。S2 用「typecheck + build + 锚点 + 冲突面单文件」收口，完整回归放到 S4 或 CI。

S2 **不 rebuild、不重启容器、不改 `.env`**，生产链路零影响。

### S3 · 功能验收闸门

每个功能单独一轮：解释它是什么 → 动过哪里 → 与现有定制的冲突 → 推荐（保留 / 调参 / 回滚）→ 等本人同意 → 独立 commit 或 revert。状态写回 `manifest.featureGates`。

**注意**：`mentions`、`cover`、SEO/noindex、事件归组锁、`jobs/runs`、日报今日看点都是**代码级行为，没有开关**，S2 之后已生效；S3 是验收与去留决策，不是「启用开关」。

### S4 · 固化

```bash
./up rebuild             # 改过 packages/ 或 apps/ 必须 rebuild；只跑 ./up 容器里还是旧镜像
./up smoke               # 或 node scripts/smoke.ts --base http://localhost:3100
```

`rebuild` 会丢掉容器热补丁（`modules/llm-guard` 等），要么把模块正式纳入镜像，要么重打一次热补丁。最后同步 `docs/deferred-items.md`、当天工作日志，并列出 deferred items 后再考虑 push。

## 红线（每次同步都要复查）

- 只用免费源；X / socialdata / jina 付费路径不启用。
- `SITE.poweredBy` 必须是 `null`，不得出现「由 AIHOT 驱动」或 AIHOT Logo。
- 不改 `apps/` / `packages/` 的产品行为；站点自己的规定放 `site/`、`industry/`、`modules/`。
- `BAIDU_PUSH_ENABLED` / `DINGTALK_CONTENT_PUSH_ENABLED` 保持 `false`。
- 每批单独 commit；**`git push` 前需本人确认并显式列出 deferred items**。
- 凭证由本人本地填 `.env`，不代填、不经聊天传递，不写进任何 git 跟踪文件。

## 常见故障

| 现象 | 处理 |
|---|---|
| `git fetch upstream main` 断线 `unexpected disconnect` | 改用 `--filter=blob:none`；或优先从 `mirror` 取完整对象 |
| merge 报「unrelated histories」 | 说明 clone 丢了 `e385794` 这条祖先链；从 origin 重新取全历史，确认 `git merge-base HEAD upstream/main` 有值，**不要重建 replace** |
| `web did not start` / 大量 15s 超时 | 本机冷启动误报，见「本机已知环境陷阱」；临时放宽后还原，别改仓库常量 |
| `backup.test.ts` 成片失败 | 宿主缺 pg 客户端工具，属环境缺失 |
| env 模板断言失败 | 上游新增了读 env 的代码却没写进模板：把变量以注释形式补进 `.env.example`，默认值保持关闭 |
| 锚点校验失败 | 别继续，先看是上游真的删了还是合并冲突解错了；修复后重跑全量验证 |
| 新功能没开关却已生效 | 属预期（S3 说明过）；要退回就 revert 对应提交，不要改运行时开关绕过 |
| `./up rebuild` 卡在 Debian apt 下载 | 与同步无关，是基础层出网问题；先确认代理参数，别反复重试 |
| 容器行为没变 | 改过 `packages/` / `apps/` 后必须 rebuild，只跑 `./up` 不生效 |
