import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import { BOARDS } from "../boards.ts";

test("两个板块的分节都存在且互不重复", () => {
  const sections = new Set(Object.values(BOARDS).map((b) => b.section));
  const known = new Set<string>(CATEGORIES.map((c) => c.section));
  for (const section of sections) assert.ok(known.has(section), `日报分节 ${section} 不在 CATEGORIES 里`);
  assert.equal(sections.size, Object.keys(BOARDS).length, "两个板块不能共用同一个分节");
});

test("每个分类都落在一个板块里，没有漏掉的类别", () => {
  const sections = new Set<string>(Object.values(BOARDS).map((b) => b.section));
  const uncovered = CATEGORIES.filter((c) => !sections.has(c.section)).map((c) => c.key);
  assert.deepEqual(uncovered, [], "有分类落在两个板块之外");
  for (const section of sections) {
    assert.ok(CATEGORIES.some((c) => c.section === section), `分节 ${section} 没有任何分类`);
  }
});

// sitemap 的发现清单只硬编码引擎页面，llms.txt 的「主要页面」也只留 modules.pages 插口。
// 少了任一处，两个板块页就只有导航入口、没有可被搜索引擎/Agent 发现的出口。
test("模块登记了 sitemap 与 llms 出口，且覆盖两个板块页", async () => {
  const { default: server } = await import("../server.ts");
  assert.ok(server.sitemap?.entries, "缺少 sitemap.entries，板块页不会进入站点地图");
  const lines = server.llms?.().pages ?? [];
  for (const key of Object.keys(BOARDS)) {
    assert.ok(lines.some((line) => line.includes(`/${key}`)), `llms.txt 的主要页面缺少 /${key}`);
  }
});
