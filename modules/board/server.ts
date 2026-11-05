// 板块页的只读接口：按日报分节（section）把多个细分类合成一页，分类过滤与分页都下推到 SQL。
// 读取复用 publication/ 的列、联表、可见范围与卡片转换，避免另写一份与引擎不一致的公开条件。
import { CATEGORIES } from "@aihot/industry/taxonomy";
import type { PoolResponse } from "@aihot/contracts/site";
import { beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { one, sql } from "@aihot/backend/db";
import { defineServerModule } from "@aihot/backend/modules";
import {
  ITEM_COLUMNS, ITEM_FROM, seatHolders, toFeedItemSummary, type ItemRow,
} from "@aihot/backend/publication/items";
import { POOL_MAX_PAGES, POOL_PAGE_SIZE } from "@aihot/backend/publication/pool";
import { browsedCondition } from "@aihot/backend/publication/scope";
import { BOARDS, isBoardKey, type BoardKey } from "./boards.ts";

const categoryKeys = (board: BoardKey) =>
  CATEGORIES.filter((c) => c.section === BOARDS[board].section).map((c) => c.key);

export async function loadBoard(board: BoardKey, page: number, now: Date): Promise<PoolResponse> {
  const inBoard = sql`AND p.category IN ${sql(categoryKeys(board))}`;
  const offset = (page - 1) * POOL_PAGE_SIZE;
  const cap = POOL_MAX_PAGES * POOL_PAGE_SIZE;
  const rows = await sql<ItemRow[]>`
    WITH page AS (
      SELECT p.article_id FROM publications p WHERE ${browsedCondition(now)} ${inBoard}
      ORDER BY p.timeline_at DESC, p.article_id DESC LIMIT ${POOL_PAGE_SIZE} OFFSET ${offset})
    SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE p.article_id IN (SELECT article_id FROM page)
    ORDER BY p.timeline_at DESC, p.article_id DESC`;
  const [counts, metas] = await Promise.all([
    sql<{ n: number }[]>`
      SELECT count(*) AS n FROM (SELECT 1 FROM publications p
        WHERE ${browsedCondition(now)} ${inBoard} LIMIT ${cap}) t`,
    sql<{ today_count: number; updated_at: Date | null }[]>`
      SELECT (SELECT count(*) FROM publications p
        WHERE ${browsedCondition(now)} AND p.timeline_at >= ${beijingMidnight(beijingDate(now))} ${inBoard}) AS today_count,
        (SELECT max(p.updated_at) FROM publications p WHERE p.eligible) AS updated_at`,
  ]);
  const total = Number(one(counts).n);
  const meta = one(metas);
  const holders = await seatHolders(rows, now);
  return {
    filters: { channel: "all", category: null, tag: null, q: null, tab: "time" },
    items: rows.map((r) => (holders.has(r.id)
      ? { ...toFeedItemSummary(r), reason: null, sameEvent: holders.get(r.id)! }
      : toFeedItemSummary(r))),
    page,
    pageCount: Math.min(POOL_MAX_PAGES, Math.max(1, Math.ceil(total / POOL_PAGE_SIZE))),
    total,
    todayCount: Number(meta.today_count),
    freshness: (meta.updated_at ?? now).toISOString(),
  };
}

export default defineServerModule({
  name: "board",
  http: (app) => {
    app.get("/api/board/:board", async (req, reply) => {
      const key = String((req.params as { board?: string }).board ?? "");
      if (!isBoardKey(key)) {
        reply.code(404);
        return { error: "unknown board" };
      }
      const raw = Number.parseInt(String((req.query as { page?: string }).page ?? "1"), 10);
      const page = Math.min(Math.max(Number.isFinite(raw) ? raw : 1, 1), POOL_MAX_PAGES);
      return loadBoard(key, page, new Date());
    });
  },
});
