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
  const lines = (await server.llms?.())?.pages ?? [];
  for (const key of Object.keys(BOARDS)) {
    assert.ok(lines.some((line) => line.includes(`/${key}`)), `llms.txt 的主要页面缺少 /${key}`);
  }
});

test("两个板块 RSS 都登记进了 llms 的接入方式", async () => {
  const { default: server } = await import("../server.ts");
  const ways = (await server.llms?.())?.ways ?? [];
  for (const key of Object.keys(BOARDS)) {
    assert.ok(ways.some((line) => line.includes(`/feed/${key}.xml`)), `llms.txt 缺少 /feed/${key}.xml`);
  }
});

test("板块 RSS 拼装：空板块是合法空 channel，且不内联正文", async () => {
  const { renderBoardRss } = await import("../server.ts");
  const xml = renderBoardRss("ai", []);
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<channel>/);
  assert.ok(!xml.includes("<item>"), "没有条目时不应产出 item");
  assert.ok(xml.includes("非全量"), "必须写明滚动窗口非全量");
  assert.ok(!xml.includes("content:encoded"), "摘要版不能内联正文");
});

test("板块 RSS 拼装：guid 稳定、pubDate 取原文发布时间、原文链接转义", async () => {
  const { renderBoardRss } = await import("../server.ts");
  const xml = renderBoardRss("finance", [{
    id: "abc123", title: "A & B <测试>", summary: "摘要 \"引号\"",
    url: "https://example.org/a?x=1&y=2", published_at: new Date("2026-11-05T17:05:16Z"),
    category: "finance-a", source_name: "某源",
  }]);
  assert.ok(xml.includes('<guid isPermaLink="false">abc123</guid>'));
  assert.ok(xml.includes("<pubDate>Thu, 05 Nov 2026 17:05:16 GMT</pubDate>"));
  assert.ok(xml.includes("https://example.org/a?x=1&amp;y=2"), "原文链接要 XML 转义");
  assert.ok(xml.includes("<![CDATA[A & B <测试>]]>"), "标题用 CDATA 包裹");
  assert.ok(xml.includes("阅读原文"), "站外消息靠 description 里的公网原文链接");
});
