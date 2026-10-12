import chalk from "chalk";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { expect, test } from "vitest";
import type { TaskStep } from "../../contracts/run.js";
import { executionBody, taskFlowchart } from "./task-flowchart.js";
import { renderRunScreen } from "./run-screen.js";
import { viewReport, viewState, viewTask } from "../../../tests/helpers/run-view.js";

const steps: TaskStep[] = [
  {
    id: "implementation",
    title: "Implementation",
    model: "gpt-5.4",
    effort: "high",
    status: "completed",
  },
  { id: "testing", title: "Testing", model: "claude-test", effort: "medium", status: "running" },
  { id: "review", title: "Review", model: "gpt-5.4", status: "pending" },
];

test.each(["refactor", "completed", "failed"] as const)("draws arrows for QA %s", (status) => {
  const level = chalk.level;
  chalk.level = 1;
  try {
    const task = {
      ...viewTask(),
      steps: steps.map((step, i) => (i === 1 ? { ...step, status } : step)),
    };
    const lines = taskFlowchart(task, { width: 40, height: 24 });
    const text = stripVTControlCharacters(lines.join("\n"));
    expect(text.match(/↓/g)).toHaveLength(2);
    expect(text.includes("┌──▶│Implementation")).toBe(status === "refactor");
    expect(text.includes("└───│Testing")).toBe(status === "refactor");
    if (status === "refactor") {
      expect(lines[4]).toContain("\x1b[33m ┌──▶");
      expect(lines[10]).toContain("\x1b[33m┌");
    }
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(40);
    const withoutImplementation = taskFlowchart(
      { ...task, steps: task.steps.slice(1) },
      { width: 40, height: 24 },
    ).join("\n");
    expect(withoutImplementation).not.toContain("┌──▶");
  } finally {
    chalk.level = level;
  }
});

test.each([
  ["completed", 34],
  ["running", 32],
  ["failed", 31],
  ["refactor", 33],
] as const)("%s steps use the requested border color", (status, color) => {
  const level = chalk.level;
  chalk.level = 1;
  try {
    const task = { ...viewTask(), steps: [{ ...(steps[0] as TaskStep), status }] };
    const lines = taskFlowchart(task, { width: 50, height: 15 });
    expect(lines[3]).toContain(`\x1b[${color}m┌`);
    expect(stripVTControlCharacters(lines.join("\n"))).toContain("gpt-5.4 · high");
  } finally {
    chalk.level = level;
  }
});

test("keeps the current step visible when only one node fits", () => {
  const text = taskFlowchart(
    { ...viewTask(), steps, step: "testing" },
    { width: 40, height: 9 },
  ).join("\n");
  expect(text).toContain("Testing");
  expect(text).toContain("In progress");
  expect(text).toContain("medium");
});

test.each([120, 97, 96, 80, 50, 33])("flow visibility adapts to %i columns", (columns) => {
  const report = viewReport();
  Object.assign(report.tasks[0] ?? {}, { steps, step: "testing", effort: "medium" });
  const text = stripVTControlCharacters(
    renderRunScreen(
      report,
      { ...viewState(), flow: true },
      {
        cwd: "/project",
        columns,
        rows: 24,
        now: Date.now(),
      },
    ),
  );
  for (const line of text.split("\r\n")) expect(stringWidth(line)).toBeLessThan(columns);
  expect(text.split("\r\n").length).toBeLessThanOrEqual(24);
  expect(text).toContain("medium");
  if (columns >= 97) {
    expect(text).toContain("[ Flow ]");
    expect(text).toContain("claude-test · medium");
  } else {
    expect(text).not.toContain("[ Flow ]");
    expect(text).toContain("code-test");
    expect(
      executionBody(report, { ...viewState(), flow: true }, { width: columns - 1, height: 15 }),
    ).toEqual(executionBody(report, viewState(), { width: columns - 1, height: 15 }));
  }
});

test.each([120, 80, 50, 33])("task table keeps effort visible at %i columns", (columns) => {
  const report = viewReport();
  Object.assign(report.tasks[0] ?? {}, { effort: "high" });
  Object.assign(report.tasks[1] ?? {}, {
    steps: [{ ...steps[0], model: "pending-model", effort: "ultra" }],
  });
  const lines = executionBody(report, viewState(), { width: columns - 1, height: 15 }).map(
    stripVTControlCharacters,
  );
  const effortColumn = lines[0]?.indexOf("Effort") ?? -1;
  if (columns > 50) {
    expect(effortColumn).toBeGreaterThan(0);
    expect(lines[1]?.indexOf("high")).toBe(effortColumn);
    expect(lines.find((line) => line.includes("ultra"))?.indexOf("ultra")).toBe(effortColumn);
  } else {
    expect(lines.join("\n")).toContain("high");
    expect(lines.join("\n")).toContain("ultra");
  }
  expect(lines.join("\n")).toContain("code-test");
  expect(lines.join("\n")).toContain("pending-model");
  expect(lines.join("\n")).not.toContain("code-test · high");
  for (const line of lines) expect(stringWidth(line)).toBeLessThan(columns);
});
