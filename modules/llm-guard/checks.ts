// 模型链路巡检的判定层：只读一份快照，不碰数据库，方便用固定数字验证阈值边界。
// 阈值取自 docs/llm-failover-runbook.md §2。引擎自带的 content.process、receipts.unknown、
// provider.refused.* 与 budget.day.* 已覆盖的情况不在这里重复报。
import { beijingStamp } from "@aihot/contracts/time";
import type { Finding } from "@aihot/backend/notify/feishu";

export interface GuardSnapshot {
  /** 近 15 分钟创建的回执数，以及这段时间内完成的回执数。 */
  receipts15m: number;
  completed15m: number;
  /** 近 30 分钟发出的模型请求数与超时数。 */
  attempts30m: number;
  timeouts30m: number;
  /** 近 1 小时带思考 token 的回复数、上游按日额度拒绝数。 */
  reasoningNonzero1h: number;
  quotaDaily1h: number;
  /** 近 24 小时有达标卡片、但最后一张已超过 2 小时的板块。 */
  staleBoards: ReadonlyArray<{ category: string; lastAt: Date }>;
}

export const GUARD_THRESHOLDS = {
  /** 15 分钟内至少这么多次请求才判定「上游无响应」，避免夜间低峰误报。 */
  stallMinReceipts: 5,
  timeoutRate: 0.1,
  timeoutMinAttempts: 10,
  /** 备用渠道的模型关不掉思考，偶发降级属正常；超过这个数才提示红线可能失效。 */
  reasoningMinCount: 5,
} as const;

export function guardFindings(s: GuardSnapshot): Finding[] {
  const out: Finding[] = [];
  const t = GUARD_THRESHOLDS;

  if (s.receipts15m >= t.stallMinReceipts && s.completed15m === 0) {
    out.push({
      key: "llm-guard.upstream-stall",
      level: "now",
      title: "模型服务一直没有回应，网站暂时不再更新",
      impact: "最近十五分钟发出的模型请求一个都没完成，读者看到的内容停在上一次成功更新",
      heals: "上游恢复后新内容会继续处理；这期间超过三小时的旧文章不会自动补回来",
      action: "按巡检手册分别探主渠道和备用渠道，确认是单渠道卡住再决定是否临时切换（切换要本人拍板）",
      detail: `近 15 分钟 ${s.receipts15m} 次请求、0 次完成；等价于网关完成日志停滞超过 5 分钟；巡检每 10 分钟一轮`,
    });
  }

  const rate = s.attempts30m > 0 ? s.timeouts30m / s.attempts30m : 0;
  if (s.attempts30m >= t.timeoutMinAttempts && rate > t.timeoutRate) {
    out.push({
      key: "llm-guard.timeout-rate",
      level: "now",
      title: "模型请求大量超时",
      impact: "不少文章没能在正常时间内分析完，新内容会晚到或缺卡",
      heals: "上游恢复后超时率会自己降下来；已经超时失败的文章超过三小时不会自动补回",
      action: "按巡检手册核对是不是单渠道挂起，不要直接换模型",
      detail: `近 30 分钟 ${s.timeouts30m}/${s.attempts30m} 次超时（${Math.round(rate * 100)}%），阈值 >10%`,
    });
  }

  if (s.staleBoards.length > 0) {
    out.push({
      key: "llm-guard.stale-boards",
      level: "today",
      title: "有几个板块两小时没有新卡片",
      impact: "读者打开板块页看到的还是旧内容，容易以为网站停了",
      heals: "评分达标的新文章一进来就会自动出现；低分和没有评分的条目不会进板块页",
      action: "核对评分分布与公开门槛，不要为凑数改门槛或回刷历史",
      detail: `${s.staleBoards.length} 个板块超 2 小时无达标卡片：${s.staleBoards.slice(0, 3)
        .map((b) => `${b.category}（最后一张 ${beijingStamp(b.lastAt)}）`).join("；")}`,
    });
  }

  if (s.reasoningNonzero1h >= t.reasoningMinCount) {
    out.push({
      key: "llm-guard.reasoning-on",
      level: "today",
      title: "模型又开始输出思考内容",
      impact: "输出量会成倍增加、请求变慢，评分口径也会跟着偏",
      heals: "不会，需要检查请求配置",
      action: "核对关思考的请求参数是否还在；备用渠道本身关不掉思考，要先分清是哪条渠道产生的",
      detail: `近 1 小时 ${s.reasoningNonzero1h} 次回复带思考 token（备用渠道偶发降级不算，阈值 ${t.reasoningMinCount}）`,
    });
  }

  if (s.quotaDaily1h > 0) {
    out.push({
      key: "llm-guard.daily-quota",
      level: "today",
      title: "上游当天的免费调用次数用完了",
      impact: "新内容暂时进不来，直到额度重置",
      heals: "会，按 UTC 日界（北京时间早上八点）自动恢复，之后的新内容照常处理",
      action: "这次不用充值也不用改配置；期间失败超过三小时的旧文章不会自动补回，需要时人工补跑",
      detail: `近 1 小时 ${s.quotaDaily1h} 次按日额度拒绝；站内 24 小时滚动预算另有告警，两者不是一回事`,
    });
  }

  return out;
}
