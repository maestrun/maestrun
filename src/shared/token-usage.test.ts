import { expect, test, vi } from "vitest";
import { tokenUsageCollector, tokenUsageColumn, tokenUsageLabel } from "./token-usage.js";

test("table tokens distinguish unavailable, zero, partial and compact totals", () => {
  expect(tokenUsageColumn({})).toBe("n/a");
  expect(tokenUsageColumn({ tokenUsage: { inputTokens: 0, outputTokens: 0 } })).toBe("0/0");
  expect(
    tokenUsageColumn({
      tokenUsage: { inputTokens: 1700, outputTokens: 150 },
      tokenUsageIncomplete: true,
    }),
  ).toBe("1700/150*");
  expect(tokenUsageColumn({ tokenUsage: { inputTokens: 100000, outputTokens: 2000000 } })).toBe(
    "100K/2M",
  );
});

test("Codex cumulative snapshots emit only increments and reject invalid counts", () => {
  const report = vi.fn();
  const collector = tokenUsageCollector("codex", report);
  for (const inputTokens of [100, 100, -1, "200", 150])
    collector.event({
      method: "thread/tokenUsage/updated",
      params: { tokenUsage: { total: { inputTokens, outputTokens: 20 } } },
    });
  expect(report.mock.calls.map(([usage]) => usage)).toEqual([
    { inputTokens: 100, outputTokens: 20 },
    { inputTokens: 0, outputTokens: 0 },
    { inputTokens: 50, outputTokens: 0 },
  ]);
});

test("Claude sums model and cache counts without summing cumulative turn results", () => {
  const report = vi.fn();
  const collector = tokenUsageCollector("claude", report);
  for (const inputTokens of [100, 200])
    collector.event({
      type: "result",
      usage: { input_tokens: 99999, output_tokens: 99999 },
      modelUsage: {
        main: {
          inputTokens,
          outputTokens: 20,
          cacheReadInputTokens: 50,
          cacheCreationInputTokens: 10,
        },
        secondary: { inputTokens: 10, outputTokens: 5 },
      },
    });
  expect(report.mock.calls.map(([usage]) => usage)).toEqual([
    { inputTokens: 170, outputTokens: 25 },
    { inputTokens: 100, outputTokens: 0 },
  ]);
});

test("Copilot counts API usage but ignores context window snapshots", () => {
  const report = vi.fn();
  const collector = tokenUsageCollector("copilot", report);
  collector.event({ type: "session.usage_info", data: { currentTokens: 999 } });
  for (const inputTokens of [10, 30])
    collector.line(
      JSON.stringify({ type: "assistant.usage", data: { inputTokens, outputTokens: 5 } }),
    );
  expect(report.mock.calls.map(([usage]) => usage)).toEqual([
    { inputTokens: 10, outputTokens: 5 },
    { inputTokens: 30, outputTokens: 5 },
  ]);
});

test("Codex exec reads final usage, preserving unavailable and actual zero counts", () => {
  const report = vi.fn();
  const collector = tokenUsageCollector("codex", report);
  for (const line of ["not json", "null", '{"type":"turn.completed"}']) collector.line(line);
  expect(report).not.toHaveBeenCalled();
  collector.line(
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } }),
  );
  expect(report).toHaveBeenCalledWith({ inputTokens: 0, outputTokens: 0 });
  expect(tokenUsageLabel({})).toBe("in: n/a · out: n/a");
  expect(tokenUsageLabel({ tokenUsage: { inputTokens: 0, outputTokens: 0 } })).toBe(
    "in: 0 · out: 0",
  );
  expect(
    tokenUsageLabel({
      tokenUsage: { inputTokens: 1, outputTokens: 2 },
      tokenUsageIncomplete: true,
    }),
  ).toContain("(partial)");
});
