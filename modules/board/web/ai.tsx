import { useLoaderData } from "react-router";
import type { PoolResponse } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404, pageHeaders } from "@aihot/web/lib/api.server";
import { itemListLd, listPath, pageMeta } from "@aihot/web/lib/seo";
import type { Screen } from "@aihot/web/components/shell/screens";
import { BOARDS } from "../boards.ts";
import { BoardView } from "./BoardView.tsx";

// 不声明 tab：手机端保留读者来的那个 tab，底栏不因此多出一项。
export const handle: Screen = { name: BOARDS.ai.title };
export const headers = pageHeaders;

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const raw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Math.min(Math.max(Number.isFinite(raw) ? raw : 1, 1), 50);
  const data = await loadOr404<PoolResponse>(listPath("/api/board/ai", { page: page > 1 ? page : null }), { signal: request.signal });
  return cachedPage(60, { data });
}

export function meta({ loaderData }: { loaderData?: { data: PoolResponse } }) {
  const page = loaderData?.data.page ?? 1;
  const path = listPath("/ai", { page: page > 1 ? page : null });
  const title = `${BOARDS.ai.title}${page > 1 ? ` · 第 ${page} 页` : ""}`;
  return pageMeta({
    title,
    description: `${SITE.name} 的${BOARDS.ai.title}：${BOARDS.ai.description}`,
    path,
    noindex: page > 1,
    jsonLd: page > 1 ? undefined : itemListLd(path, title, loaderData?.data.items.map((i) => i.title) ?? []),
  });
}

export default function AiPage() {
  const { data } = useLoaderData<typeof loader>();
  return <BoardView board="ai" data={data} />;
}
