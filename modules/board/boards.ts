// 两个板块的文案与日报分节名。section 必须与 industry/taxonomy.ts 的 CATEGORIES[].section 一致，
// modules/board/tests/boards.standalone.test.ts 会在构建时守住这条对应关系。
export const BOARDS = {
  ai: {
    section: "AI 大事",
    title: "AI 大事",
    description: "模型发布、产品更新、行业动态、论文研究与实践观点，按时间倒序。",
  },
  finance: {
    section: "金融市场",
    title: "金融市场",
    description: "政策监管、A 股公告与财报、美股披露、市场观点与复盘，按时间倒序。",
  },
} as const;

export type BoardKey = keyof typeof BOARDS;

export function isBoardKey(value: string): value is BoardKey {
  return Object.hasOwn(BOARDS, value);
}
