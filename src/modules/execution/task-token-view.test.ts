import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { expect, test } from "vitest";
import { taskFlowchart, executionBody } from "./task-flowchart.js";
import { taskBody } from "./run-task-view.js";
import { viewReport, viewState, viewTask } from "../../../tests/helpers/run-view.js";

const steps = [
  {
    id: "implementation",
    title: "Implementation",
    status: "completed" as const,
    tokenUsage: { inputTokens: 1000, outputTokens: 100 },
  },
  {
    id: "testing",
    title: "Tests",
    status: "failed" as const,
    tokenUsage: { inputTokens: 700, outputTokens: 50 },
    tokenUsageIncomplete: true,
  },
  { id: "qa", title: "QA", status: "pending" as const },
  { id: "review", title: "Review", status: "pending" as const },
];

test("flowchart shows each step's usage, partial counts and unavailable history", () => {
  const lines = taskFlowchart({ ...viewTask(), steps }, { width: 44, height: 31 });
  const text = stripVTControlCharacters(lines.join("\n"));
  expect(text).toContain("in: 1000 · out: 100");
  expect(text).toContain("in: 700 · out: 50 (partial)");
  expect(text.match(/in: n\/a · out: n\/a/gu)).toHaveLength(2);
  expect(text).toContain("Review");
  expect(text.match(/↓/gu)).toHaveLength(3);
  for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(44);
});

test.each([119, 96, 79, 49, 32])(
  "task list shows totals at width %i with and without the flowchart",
  (width) => {
    const report = viewReport();
    Object.assign(report.tasks[0] ?? {}, {
      steps,
      tokenUsage: { inputTokens: 1700, outputTokens: 150 },
    });
    for (const flow of [false, true]) {
      const lines = executionBody(report, { ...viewState(), flow }, { width, height: 31 });
      const text = stripVTControlCharacters(lines.join("\n"));
      const column = stripVTControlCharacters(lines[0] ?? "").indexOf("in/out");
      expect(column).toBeGreaterThan(0);
      expect(stripVTControlCharacters(lines[1] ?? "").indexOf("1700/150")).toBe(column);
      if (flow && width >= 96) expect(text).toContain("in: 1000 · out: 100");
      for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(width);
      expect(lines.length).toBeLessThanOrEqual(31);
    }
  },
);

test("scrolling keeps the selected task's compact totals visible", () => {
  const report = viewReport();
  report.tasks = Array.from({ length: 30 }, (_, i) => ({
    ...viewTask(),
    id: `t${i}`,
    tokenUsage: { inputTokens: 100000000000, outputTokens: 200000000000 },
  }));
  const lines = taskBody(report, { ...viewState(), selected: "t29" }, { width: 32, height: 12 });
  const text = stripVTControlCharacters(lines.join("\n"));
  expect(text).toContain("› t29");
  expect(text).toContain("100B/200B");
  expect(lines.length).toBeLessThanOrEqual(12);
  for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(32);
});

test("details retain the step breakdown when the flowchart is hidden", () => {
  const report = viewReport();
  Object.assign(report.tasks[0] ?? {}, {
    steps,
    tokenUsage: { inputTokens: 1700, outputTokens: 150 },
  });
  const lines = taskBody(report, { ...viewState(), details: true }, { width: 100, height: 100 });
  expect(lines).toContain("Implementation: in: 1000 · out: 100");
  expect(lines).toContain("Tests: in: 700 · out: 50 (partial)");
  expect(lines.at(-1)).toBe("in: 1700 · out: 150");
});
