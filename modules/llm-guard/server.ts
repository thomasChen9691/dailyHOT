// 站点级模型链路巡检：接进已有的 ops.alerts（worker 每 10 分钟一轮），只读站点数据库。
// 网关完成日志在另一个容器里，不跨容器读它的 SQLite；「近 15 分钟有请求但零完成」
// 是同一现象的站点侧等价信号，2026-11-12 的上游挂起已验证过这个口径。
import { sql } from "@aihot/backend/db";
import { defineServerModule } from "@aihot/backend/modules";
import { browsedCondition } from "@aihot/backend/publication/scope";
import { guardFindings, type GuardSnapshot } from "./checks.ts";

const MINUTE = 60_000;

async function readSnapshot(now: number): Promise<GuardSnapshot> {
  const cut15 = new Date(now - 15 * MINUTE);
  const cut30 = new Date(now - 30 * MINUTE);
  const cut1h = new Date(now - 60 * MINUTE);
  const cut24h = new Date(now - 24 * 60 * MINUTE);
  const cut2h = new Date(now - 2 * 60 * MINUTE);
  const at = new Date(now);

  // 用 30 分钟的创建窗口兜住慢请求：一个 20 分钟前发出、5 分钟前才完成的回执也算「上游还活着」。
  const [flow] = await sql<{ receipts15m: number; completed15m: number }[]>`
    SELECT count(*) FILTER (WHERE created_at > ${cut15})::int AS receipts15m,
           count(*) FILTER (WHERE completed_at > ${cut15})::int AS completed15m
    FROM receipts WHERE created_at > ${cut30}`;

  const [attempts] = await sql<{ attempts30m: number; timeouts30m: number }[]>`
    SELECT count(*)::int AS attempts30m,
           count(*) FILTER (WHERE error ILIKE '%timeout%' OR error ILIKE '%timed out%')::int AS timeouts30m
    FROM receipt_attempts WHERE started_at > ${cut30}`;

  const [usage] = await sql<{ reasoning_nonzero: number; quota_daily: number }[]>`
    SELECT count(*) FILTER (WHERE CASE
             WHEN usage->'completion_tokens_details'->>'reasoning_tokens' ~ '^[0-9]+$'
             THEN (usage->'completion_tokens_details'->>'reasoning_tokens')::numeric > 0
             ELSE false END)::int AS reasoning_nonzero,
           count(*) FILTER (WHERE error ILIKE '%429%'
             AND (error ILIKE '%free-models-per-day%' OR error ILIKE '%rate limit%'
               OR error ILIKE '%quota%' OR error ILIKE '%balance%'))::int AS quota_daily
    FROM receipts WHERE created_at > ${cut1h}`;

  const boards = await sql<{ category: string; last_at: Date }[]>`
    SELECT p.category, max(p.sort_at) AS last_at FROM publications p
    WHERE ${browsedCondition(at)} AND p.updated_at > ${cut24h}
      AND p.score >= 40 AND p.category IS NOT NULL
    GROUP BY p.category HAVING max(p.sort_at) < ${cut2h}`;

  return {
    receipts15m: flow?.receipts15m ?? 0,
    completed15m: flow?.completed15m ?? 0,
    attempts30m: attempts?.attempts30m ?? 0,
    timeouts30m: attempts?.timeouts30m ?? 0,
    reasoningNonzero1h: usage?.reasoning_nonzero ?? 0,
    quotaDaily1h: usage?.quota_daily ?? 0,
    staleBoards: boards.map((b) => ({ category: b.category, lastAt: new Date(b.last_at) })),
  };
}

export default defineServerModule({
  name: "llm-guard",
  alerts: async (now) => {
    try {
      return guardFindings(await readSnapshot(now));
    } catch (error) {
      // 巡检自己失败不能把整轮 ops.alerts 拖垮，也不能静默跳过。
      return [{
        key: "llm-guard.check-failed",
        level: "later",
        title: "模型链路巡检这一轮没能完成",
        impact: "这段时间链路异常可能没人报出来",
        heals: "下一轮会再试；一直失败就得查数据库或模块本身",
        action: "转给 AI 查巡检报错",
        detail: String(error instanceof Error ? error.message : error).slice(0, 200),
      }];
    }
  },
});
