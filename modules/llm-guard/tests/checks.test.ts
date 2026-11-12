import assert from "node:assert/strict";
import { test } from "node:test";
import { guardFindings, GUARD_THRESHOLDS, type GuardSnapshot } from "../checks.ts";

const healthy = (over: Partial<GuardSnapshot> = {}): GuardSnapshot => ({
  receipts15m: 20,
  completed15m: 18,
  attempts30m: 100,
  timeouts30m: 0,
  reasoningNonzero1h: 0,
  quotaDaily1h: 0,
  staleBoards: [],
  ...over,
});

const keys = (s: GuardSnapshot) => guardFindings(s).map((f) => f.key);

test("健康快照不产生告警", () => {
  assert.deepEqual(guardFindings(healthy()), []);
});

test("低峰期请求太少，零完成也不误报", () => {
  assert.deepEqual(keys(healthy({ receipts15m: 3, completed15m: 0 })), []);
});

test("15 分钟内请求数达标且零完成 → 报上游挂起", () => {
  assert.deepEqual(keys(healthy({ receipts15m: 5, completed15m: 0 })), ["llm-guard.upstream-stall"]);
  assert.equal(guardFindings(healthy({ receipts15m: 5, completed15m: 1 })).length, 0);
});

test("超时率恰好 10% 不报，超过才报；样本不足不报", () => {
  assert.deepEqual(keys(healthy({ attempts30m: 100, timeouts30m: 10 })), []);
  assert.deepEqual(keys(healthy({ attempts30m: 100, timeouts30m: 11 })), ["llm-guard.timeout-rate"]);
  assert.deepEqual(keys(healthy({ attempts30m: 9, timeouts30m: 9 })), []);
});

test("备用渠道偶发思考不报，达到阈值才提示红线", () => {
  assert.deepEqual(keys(healthy({ reasoningNonzero1h: GUARD_THRESHOLDS.reasoningMinCount - 1 })), []);
  assert.deepEqual(keys(healthy({ reasoningNonzero1h: GUARD_THRESHOLDS.reasoningMinCount })), ["llm-guard.reasoning-on"]);
});

test("按日额度拒绝给出可自愈提示", () => {
  const [finding] = guardFindings(healthy({ quotaDaily1h: 7 }));
  assert.equal(finding?.key, "llm-guard.daily-quota");
  assert.match(finding?.heals ?? "", /自动恢复/);
  assert.match(finding?.heals ?? "", /八点/);
});

test("多个陈旧板块合并成一条告警，并列出时间", () => {
  const staleBoards = [
    { category: "finance-us", lastAt: new Date("2026-11-12T10:00:00Z") },
    { category: "finance-view", lastAt: new Date("2026-11-12T09:00:00Z") },
  ];
  const findings = guardFindings(healthy({ staleBoards }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.key, "llm-guard.stale-boards");
  assert.match(findings[0]?.detail ?? "", /2 个板块/);
  assert.match(findings[0]?.detail ?? "", /finance-us/);
});

test("多个异常同时出现时各自独立、且按等级区分", () => {
  const findings = guardFindings(healthy({
    receipts15m: 8, completed15m: 0,
    attempts30m: 50, timeouts30m: 20,
    quotaDaily1h: 3, staleBoards: [{ category: "industry", lastAt: new Date() }],
  }));
  assert.deepEqual(new Set(findings.map((f) => f.key)), new Set([
    "llm-guard.upstream-stall", "llm-guard.timeout-rate", "llm-guard.stale-boards", "llm-guard.daily-quota",
  ]));
  assert.equal(findings.filter((f) => f.level === "now").length, 2);
});
