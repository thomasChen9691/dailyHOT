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
