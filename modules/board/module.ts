import { defineModule } from "@aihot/contracts/modules";

// /ai 与 /finance 是独立路径，可被搜索引擎索引、可单独发给公众号读者。
// /api/* 已由引擎的 API 路径表覆盖，不需要在 apiPaths 里声明。
export default defineModule({
  name: "board",
  pages: [
    { path: "ai", file: "web/ai.tsx", id: "board-ai" },
    { path: "finance", file: "web/finance.tsx", id: "board-finance" },
  ],
});
