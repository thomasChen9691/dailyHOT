import { Link, useSearchParams } from "react-router";
import type { PoolResponse } from "@aihot/contracts/site";
import { beijingTime } from "@aihot/contracts/time";
import { DayList, Pagination } from "@aihot/web/features/feed/DayList";
import { EmptyState } from "@aihot/web/components/ui/Page";
import { BOARDS, type BoardKey } from "../boards.ts";

export function BoardView({ board, data }: { board: BoardKey; data: PoolResponse }) {
  const [params] = useSearchParams();
  const copy = BOARDS[board];
  const path = `/${board}`;
  const href = (page: number) => {
    const sp = new URLSearchParams(params);
    if (page <= 1) sp.delete("page");
    else sp.set("page", String(page));
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
  };
  return (
    <div className="pb-6">
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{copy.title}</h1>
        <p className="mb-5 mt-2 text-[13px] leading-relaxed text-ink-4">
          {copy.description} · 共 <span className="num">{data.total}</span> 条 · 更新于 <span className="num">{beijingTime(data.freshness)}</span>
        </p>
      </div>
      {data.items.length === 0 ? (
        <div className="mt-2 lg:card">
          <EmptyState
            title="这个板块暂时没有内容"
            action={<Link to="/" className="text-[13px] font-medium text-accent hover:underline">去看精选</Link>}
          >
            等下一次采集与日报出刊后再来看看。
          </EmptyState>
        </div>
      ) : (
        <DayList items={data.items} todayCount={data.todayCount} />
      )}
      <Pagination page={data.page} pageCount={data.pageCount} href={href} />
      {data.page >= 50 && <p className="mt-4 text-center text-[12px] text-ink-4">最多提供 50 页，更早的内容请使用搜索或主题页。</p>}
    </div>
  );
}
