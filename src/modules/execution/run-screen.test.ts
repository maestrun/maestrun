import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { expect, test } from "vitest";
import { renderRunScreen } from "./run-screen.js";
import { navigateView, visibleTasks } from "./run-view-state.js";
import { cell } from "../../shared/terminal-text.js";
import { viewReport, viewState, viewTask } from "../../../tests/helpers/run-view.js";
import { executionBody } from "./task-flowchart.js";

const screen = {
  cwd: "/workspace/project",
  columns: 120,
  rows: 24,
  now: Date.parse("2026-10-11T12:01:05Z"),
};

test.each([120, 80, 50, 33, 20])("fits %i columns and shows measured progress", (columns) => {
  const report = viewReport();
  const first = report.tasks[0];
  if (first) first.title = "日本語 👩‍💻 ".repeat(30);
  const text = stripVTControlCharacters(
    renderRunScreen(report, viewState(), { ...screen, columns }),
  );
  for (const line of text.split("\r\n")) expect(stringWidth(line)).toBeLessThan(columns);
  expect(text.split("\r\n").length).toBeLessThanOrEqual(screen.rows);
  if (columns >= 50) expect(text).toContain("4/12 steps · 33% · 1:05");
  if (columns === 120) expect(text).toContain("code-test");
});

test("scrolls the list to keep the selected task visible", () => {
  const report = viewReport();
  report.tasks = Array.from({ length: 50 }, (_, i) => ({ ...viewTask(), id: `task-${i}` }));
  const state = { ...viewState(), selected: "task-49" };
  const text = stripVTControlCharacters(renderRunScreen(report, state, screen));
  expect(text).toContain("› task-49");
  expect(text).toContain("50/50 in view");
  expect(text).not.toContain("task-0 ");
});

test("filters tasks, wraps tabs, opens details and returns to the list", () => {
  const report = viewReport();
  const state = viewState();
  navigateView(state, report, { name: "up" });
  expect(state.selected).toBe("a");
  navigateView(state, report, { name: "down" });
  expect(state.selected).toBe("b");
  navigateView(state, report, { name: "left" });
  expect(visibleTasks(report, state.filter).map((task) => task.id)).toEqual(["d"]);
  navigateView(state, report, { name: "return" });
  expect(renderRunScreen(report, state, screen)).toContain("Preview credentials are missing.");
  navigateView(state, report, { name: "down" });
  expect(state.scroll).toBe(1);
  navigateView(state, report, { name: "escape" });
  expect(state.details).toBe(false);
  navigateView(state, report, { name: "tab" });
  expect(state.filter).toBe(0);
  navigateView(state, report, { name: "tab", shift: true });
  expect(state.filter).toBe(4);
});

test("handles empty filters and clamps detail scrolling to the content", () => {
  const report = viewReport();
  report.tasks = [];
  expect(renderRunScreen(report, viewState(), screen)).toContain("No tasks in this view.");
  const state = { ...viewState(), details: true, scroll: 100 };
  expect(renderRunScreen(report, state, screen)).toContain("No task selected.");
  expect(state.scroll).toBe(0);
});

test("clips terminal text by grapheme and removes control sequences", () => {
  expect(cell("\x1b[31mhello\nworld\x1b[0m", 20)).toBe("hello world         ");
  expect(cell("日本語", 5)).toBe("日本…");
  expect(cell("👩‍💻 hello", 4)).toBe("👩‍💻 …");
  expect(cell("hello", 0)).toBe("");
});

test.each(["completed", "running", "failed"] as const)(
  "%s tasks show the correct final stage",
  (status) => {
    const report = viewReport();
    Object.assign(report.tasks[0] ?? {}, {
      status,
      step: "review",
      completedSteps: status === "completed" ? 3 : 2,
    });
    const expected = status === "completed" ? "-" : "Review";
    const lines = executionBody(report, viewState(), { width: 119, height: 15 }).map(
      stripVTControlCharacters,
    );
    const column = lines[0]?.indexOf("Stage") ?? -1;
    expect(column).toBeGreaterThan(0);
    expect(lines[1]?.slice(column, column + expected.length)).toBe(expected);
    expect(renderRunScreen(report, { ...viewState(), details: true }, screen)).toContain(
      `Stage: ${expected}`,
    );
    expect(report.tasks[0]?.step).toBe("review");
  },
);

test.each([120, 80, 50, 33])("task ID and name have separate columns at %i columns", (columns) => {
  const report = viewReport();
  Object.assign(report.tasks[0] ?? {}, { title: "Build" });
  const lines = executionBody(report, viewState(), { width: columns - 1, height: 15 }).map(
    stripVTControlCharacters,
  );
  const column = lines[0]?.indexOf("Name") ?? -1;
  expect(column).toBeGreaterThan(0);
  expect(lines[1]?.indexOf("Build")).toBe(column);
  expect(lines[1]?.slice(0, column).trim()).toBe("› a");
});
